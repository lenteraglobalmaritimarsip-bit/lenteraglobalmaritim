<?php

declare(strict_types=1);

require __DIR__ . '/repository.php';

function branchCode(string $branch): string
{
    $normalized = strtoupper(trim($branch));
    if (preg_match('/^[A-Z0-9]{2,4}$/', $normalized)) return substr($normalized, 0, 3);
    preg_match_all('/[A-Z0-9]+/', $normalized, $matches);
    $initials = substr(implode('', array_map(static fn (string $part): string => $part[0], $matches[0])), 0, 3);
    return $initials === '' ? 'HO' : str_pad($initials, 3, 'X');
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        requireAuthenticatedUser();
        $state = loadAppState();
        $initialized = !empty($state['ports']) || !empty($state['customers']) || !empty($state['vessels']);
        jsonResponse(['state' => $state, 'initialized' => $initialized]);
    }

    requireMethod('PUT');
    $actor = requireAuthenticatedUser();
    requireCsrfToken();
    $body = requestJson();
    $state = $body['state'] ?? null;
    if (!is_array($state) || !isset($state['jobCalls']) || !is_array($state['jobCalls'])) {
        jsonResponse(['error' => 'Invalid application state'], 400);
    }

    if ($actor['role'] !== 'ADMIN') {
        $before = loadAppState();
        foreach (['users', 'customers', 'vessels', 'ports', 'zones', 'fixTariffs', 'expensesItems'] as $key) {
            if (json_encode($state[$key] ?? []) !== json_encode($before[$key] ?? [])) {
                jsonResponse(['error' => 'Only administrators can change master data'], 403);
            }
        }
        $allowed = match ($actor['role']) {
            'SALES' => ['inquiry', 'quotation', 'status', 'currentStage', 'updatedAt', 'vesselId', 'vesselName', 'portId', 'portName', 'customerId', 'customerName', 'currency', 'exchangeRateUSDToIDR', 'eta', 'etd', 'purposeOfCall'],
            'MANAGER_OPS' => ['managerApproval', 'quotation', 'fda', 'status', 'currentStage', 'updatedAt'],
            'FDA' => ['actualCosts', 'fda', 'ap', 'ar', 'principalInvoice', 'status', 'currentStage', 'updatedAt'],
            'FINANCE' => ['ap', 'ar', 'principalReceipts', 'principalInvoice', 'closing', 'status', 'currentStage', 'updatedAt'],
            default => [],
        };
        $oldJobs = [];
        foreach ($before['jobCalls'] as $job) $oldJobs[$job['jobId']] = $job;
        $newJobs = [];
        foreach ($state['jobCalls'] as $job) $newJobs[$job['jobId']] = $job;
        $changedJobIds = [];
        foreach ($oldJobs as $jobId => $oldJob) {
            $newJob = $newJobs[$jobId] ?? null;
            if (!isset($newJobs[$jobId])) {
                $canSalesDelete = $actor['role'] === 'SALES'
                    && ($oldJob['managerApproval']['status'] ?? '') !== 'APPROVED'
                    && !($oldJob['fda']['fdaApproved'] ?? false)
                    && empty($oldJob['actualCosts'])
                    && empty($oldJob['closing']['isClosed'])
                    && branchCode((string) ($oldJob['inquiry']['createdByBranchCode'] ?? $oldJob['inquiry']['createdByBranch'] ?? ''))
                      === branchCode((string) ($actor['branch_code'] ?? $actor['branch_name'] ?? ''));
                if (!$canSalesDelete) jsonResponse(['error' => 'Deleting this job is not allowed'], 403);
                $changedJobIds[] = $jobId;
                continue;
            }
            if ($actor['role'] === 'SALES' && branchCode((string) ($oldJob['inquiry']['createdByBranchCode'] ?? $oldJob['inquiry']['createdByBranch'] ?? '')) !== branchCode((string) ($actor['branch_code'] ?? $actor['branch_name'] ?? ''))) {
                jsonResponse(['error' => 'Sales can only change jobs from their own branch'], 403);
            }
            foreach (array_unique(array_merge(array_keys($oldJob), array_keys($newJob))) as $key) {
                if (!in_array($key, $allowed, true) && json_encode($oldJob[$key] ?? null) !== json_encode($newJob[$key] ?? null)) {
                    jsonResponse(['error' => 'This role cannot change job field: ' . $key], 403);
                }
            }
            if ($actor['role'] === 'MANAGER_OPS'
                && ($newJob['managerApproval']['status'] ?? '') === 'APPROVED'
                && ($oldJob['managerApproval']['status'] ?? '') !== 'APPROVED'
                && ($oldJob['quotation']['epda']['status'] ?? '') !== 'SUBMITTED') {
                jsonResponse(['error' => 'EPDA must be submitted before manager approval'], 403);
            }
            if ($actor['role'] === 'MANAGER_OPS'
                && ($newJob['fda']['approvalStatus'] ?? '') === 'APPROVED'
                && ($oldJob['fda']['approvalStatus'] ?? '') !== 'APPROVED'
                && ($oldJob['fda']['approvalStatus'] ?? '') !== 'SUBMITTED') {
                jsonResponse(['error' => 'FDA must be submitted before manager approval'], 403);
            }
            if ($actor['role'] === 'FDA'
                && ($oldJob['managerApproval']['status'] ?? '') !== 'APPROVED'
                && json_encode($oldJob) !== json_encode($newJob)) {
                jsonResponse(['error' => 'Manager approval is required before FDA changes'], 403);
            }
            if (json_encode($oldJob) !== json_encode($newJob)) $changedJobIds[] = $jobId;
        }
        if ($actor['role'] !== 'SALES' && count($newJobs) !== count($oldJobs)) {
            jsonResponse(['error' => 'Only Sales can create jobs'], 403);
        }
        if ($actor['role'] === 'SALES') {
            foreach ($newJobs as $jobId => $newJob) {
                if (!isset($oldJobs[$jobId])) {
                    if (branchCode((string) ($newJob['inquiry']['createdByBranchCode'] ?? $newJob['inquiry']['createdByBranch'] ?? '')) !== branchCode((string) ($actor['branch_code'] ?? $actor['branch_name'] ?? ''))) {
                        jsonResponse(['error' => 'New jobs must belong to the active Sales branch'], 403);
                    }
                    $changedJobIds[] = $jobId;
                }
            }
        }
        $state['users'] = $before['users'];
        foreach (['customers', 'vessels', 'ports', 'zones', 'fixTariffs', 'expensesItems'] as $key) $state[$key] = $before[$key];
        $state['auditLogs'] = $before['auditLogs'];
        foreach (array_unique($changedJobIds) as $jobId) {
            array_unshift($state['auditLogs'], [
                'id' => 'AUD-' . bin2hex(random_bytes(12)),
                'timestamp' => gmdate('c'),
                'actorId' => $actor['id'] ?? null,
                'actorName' => $actor['name'],
                'role' => $actor['role'],
                'action' => 'SYNC',
                'entity' => 'VESSEL_CALL',
                'entityId' => $jobId,
                'description' => 'Workflow state updated through the authenticated API.',
            ]);
        }
        $state['auditLogs'] = array_slice($state['auditLogs'], 0, 500);
    }

    replaceAppState($state);
    jsonResponse(['ok' => true]);
} catch (PDOException $error) {
    error_log('MaritimPort state database error: ' . $error->getMessage());
    jsonResponse(['error' => 'Database operation failed', 'details' => $config['debug'] ? $error->getMessage() : null], 500);
} catch (Throwable $error) {
    error_log('MaritimPort state error: ' . $error->getMessage());
    jsonResponse(['error' => 'State synchronization failed', 'details' => $config['debug'] ? $error->getMessage() : null], 500);
}
