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

function stateRevision(array $state): string
{
    unset($state['currentRole'], $state['selectedJobId']);
    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) throw new RuntimeException('Unable to calculate application state revision');
    return hash('sha256', $encoded);
}

function applyNonAdminMasterData(array &$state, array $before, string $role): void
{
    foreach (['users', 'customers', 'vessels', 'ports', 'zones'] as $key) {
        $state[$key] = $before[$key];
    }

    $canAddItems = in_array($role, ['SALES', 'FDA'], true);
    foreach (['fixTariffs', 'expensesItems'] as $key) {
        $existing = [];
        foreach ($before[$key] as $item) $existing[(string) $item['id']] = $item;
        $incoming = is_array($state[$key] ?? null) ? $state[$key] : [];
        $incomingIds = [];
        $additions = [];

        foreach ($incoming as $item) {
            $id = (string) ($item['id'] ?? '');
            if ($id === '') jsonResponse(['error' => 'Master data item ID is required'], 400);
            $incomingIds[$id] = true;
            if (isset($existing[$id])) {
                if (json_encode($existing[$id]) !== json_encode($item)) {
                    jsonResponse(['error' => 'Only administrators can edit or delete master data'], 403);
                }
                continue;
            }
            if (!$canAddItems) jsonResponse(['error' => 'Only Sales and FDA can add service master data'], 403);
            $additions[] = $item;
        }

        if (array_diff_key($existing, $incomingIds)) {
            jsonResponse(['error' => 'Only administrators can edit or delete master data'], 403);
        }
        $state[$key] = array_merge($before[$key], $additions);
    }
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        requireAuthenticatedUser();
        $state = loadAppState();
        $initialized = !empty($state['ports']) || !empty($state['customers']) || !empty($state['vessels']);
        jsonResponse(['state' => $state, 'initialized' => $initialized, 'revision' => stateRevision($state)]);
    }

    requireMethod('PUT');
    $actor = requireAuthenticatedUser();
    requireCsrfToken();
    $body = requestJson();
    $state = $body['state'] ?? null;
    if (!is_array($state) || !isset($state['jobCalls']) || !is_array($state['jobCalls'])) {
        jsonResponse(['error' => 'Invalid application state'], 400);
    }
    $revision = $body['revision'] ?? null;
    if (!is_string($revision) || $revision === '') {
        jsonResponse(['error' => 'Application state revision is required'], 400);
    }

    $pdo = db();
    $lock = $pdo->query("SELECT GET_LOCK('maritimport_app_state', 10)")->fetchColumn();
    if ((int) $lock !== 1) jsonResponse(['error' => 'Could not lock application state for saving'], 503);
    $before = loadAppState();
    $currentRevision = stateRevision($before);
    if (!hash_equals($currentRevision, $revision)) {
        jsonResponse([
            'error' => 'Data berubah oleh pengguna lain. Muat ulang sebelum menyimpan.',
            'code' => 'STATE_CONFLICT',
            'state' => $before,
            'revision' => $currentRevision,
        ], 409);
    }

    if ($actor['role'] !== 'ADMIN') {
        applyNonAdminMasterData($state, $before, (string) $actor['role']);
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
    $savedState = loadAppState();
    $savedRevision = stateRevision($savedState);
    $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
    jsonResponse(['ok' => true, 'revision' => $savedRevision]);
} catch (PDOException $error) {
    error_log('MaritimPort state database error: ' . $error->getMessage());
    jsonResponse(['error' => 'Database operation failed', 'details' => $config['debug'] ? $error->getMessage() : null], 500);
} catch (Throwable $error) {
    error_log('MaritimPort state error: ' . $error->getMessage());
    jsonResponse(['error' => 'State synchronization failed', 'details' => $config['debug'] ? $error->getMessage() : null], 500);
}
