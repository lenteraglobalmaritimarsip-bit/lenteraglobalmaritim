<?php

declare(strict_types=1);

require __DIR__ . '/repository.php';

function branchNameKey(?string $branch): string
{
    return strtolower(trim(preg_replace('/\s+/', ' ', (string) ($branch ?? ''))));
}

function stateRevision(array $state): string
{
    unset($state['currentRole'], $state['selectedJobId']);
    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) throw new RuntimeException('Unable to calculate application state revision');
    return hash('sha256', $encoded);
}

function validAdvancePaymentReceipt(array $receipt, string $jobId): bool
{
    $receivedDate = (string) ($receipt['receivedDate'] ?? '');
    return ($receipt['paymentType'] ?? '') === 'ADVANCE_PAYMENT'
        && ($receipt['jobId'] ?? '') === $jobId
        && is_numeric($receipt['amount'] ?? null)
        && (float) $receipt['amount'] > 0
        && in_array($receipt['currency'] ?? '', ['IDR', 'USD'], true)
        && preg_match('/^\d{4}-\d{2}-\d{2}$/', $receivedDate)
        && checkdate((int) substr($receivedDate, 5, 2), (int) substr($receivedDate, 8, 2), (int) substr($receivedDate, 0, 4))
        && trim((string) ($receipt['bankRemark'] ?? '')) !== '';
}

function validPaymentProofDataUrl(?string $dataUrl): bool
{
    if ($dataUrl === null || $dataUrl === '') return true;
    if (!preg_match('/^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/]+={0,2})$/', $dataUrl, $matches)) return false;
    $imageBytes = base64_decode($matches[2], true);
    if ($imageBytes === false || strlen($imageBytes) > 1024 * 1024) return false;
    $fileInfo = new finfo(FILEINFO_MIME_TYPE);
    $actualMime = $fileInfo->buffer($imageBytes);
    $expectedMime = $matches[1] === 'jpeg' ? 'image/jpeg' : 'image/png';
    return $actualMime === $expectedMime;
}

function immutableReceiptFields(array $receipt): array
{
    unset($receipt['receivedDate'], $receipt['amount'], $receipt['bankRemark']);
    ksort($receipt);
    return $receipt;
}

function normalizedMasterItem(string $key, array $item): array
{
    $nullableNumber = static function (array $value, string $field, int $precision): ?float {
        if (!array_key_exists($field, $value) || $value[$field] === null || $value[$field] === '') return null;
        return round((float) $value[$field], $precision);
    };

    if ($key === 'fixTariffs') {
        return [
            'id' => (string) ($item['id'] ?? ''),
            'portId' => (string) ($item['portId'] ?? ''),
            'portName' => (string) ($item['portName'] ?? ''),
            'serviceName' => (string) ($item['serviceName'] ?? ''),
            'costCategory' => $item['costCategory'] ?? null,
            'grtMin' => $nullableNumber($item, 'grtMin', 0),
            'grtMax' => $nullableNumber($item, 'grtMax', 0),
            'dwt' => $nullableNumber($item, 'dwt', 0),
            'calculationBasis' => (string) ($item['calculationBasis'] ?? ''),
            'tariffType' => $item['tariffType'] ?? null,
            'rateIDR' => $nullableNumber($item, 'rateIDR', 4),
            'rateUSD' => $nullableNumber($item, 'rateUSD', 4),
            'remarks' => (string) ($item['remarks'] ?? ''),
        ];
    }

    return [
        'id' => (string) ($item['id'] ?? ''),
        'portId' => empty($item['portId']) ? null : (string) $item['portId'],
        'portName' => (string) ($item['portName'] ?? ''),
        'code' => (string) ($item['code'] ?? ''),
        'category' => (string) ($item['category'] ?? ''),
        'name' => (string) ($item['name'] ?? ''),
        'rateIDR' => $nullableNumber($item, 'rateIDR', 4),
        'rateUSD' => $nullableNumber($item, 'rateUSD', 4),
        'calculationType' => $item['calculationType'] ?? null,
        'remarks' => (string) ($item['remarks'] ?? ''),
    ];
}

function applyNonAdminMasterData(array &$state, array $before, string $role): void
{
    foreach (['users', 'customers', 'vessels', 'ports', 'zones'] as $key) {
        $state[$key] = $before[$key];
    }
    $state['vendorPartners'] = $before['vendorPartners'] ?? [];
    $state['bankAccounts'] = $before['bankAccounts'] ?? [];

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
                if (normalizedMasterItem($key, $existing[$id]) !== normalizedMasterItem($key, $item)) {
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
    foreach ($state['paymentVouchers'] ?? [] as $voucher) {
        if (!validPaymentProofDataUrl($voucher['paymentProofDataUrl'] ?? null)) {
            jsonResponse(['error' => 'Payment proof must be a valid JPG or PNG image no larger than 1 MB'], 400);
        }
    }

    $pdo = db();
    $lock = $pdo->query("SELECT GET_LOCK('maritimport_app_state', 10)")->fetchColumn();
    if ((int) $lock !== 1) jsonResponse(['error' => 'Could not lock application state for saving'], 503);
    $before = loadAppState();
    $oldPaymentVouchers = [];
    foreach ($before['paymentVouchers'] ?? [] as $voucher) {
        if (isset($voucher['id'])) $oldPaymentVouchers[(string) $voucher['id']] = $voucher;
    }
    foreach ($state['paymentVouchers'] ?? [] as $voucher) {
        $voucherId = (string) ($voucher['id'] ?? '');
        $oldProof = $oldPaymentVouchers[$voucherId]['paymentProofDataUrl'] ?? '';
        $newProof = $voucher['paymentProofDataUrl'] ?? '';
        if ($oldProof === $newProof) continue;
        if ($actor['role'] !== 'FINANCE') {
            jsonResponse(['error' => 'Only Finance can upload or change payment proof'], 403);
        }
        if (($voucher['status'] ?? '') !== 'PAID') {
            jsonResponse(['error' => 'Payment proof can only be attached to a paid voucher'], 403);
        }
    }
    $currentRevision = stateRevision($before);
    if (!hash_equals($currentRevision, $revision)) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
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
            'FDA' => ['actualCosts', 'fda', 'ap', 'ar', 'principalReceipts', 'principalInvoice', 'status', 'currentStage', 'updatedAt'],
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
                    && branchNameKey((string) ($oldJob['inquiry']['createdByBranch'] ?? ''))
                        === branchNameKey((string) ($actor['branch_name'] ?? $actor['branch'] ?? ''));
                if (!$canSalesDelete) jsonResponse(['error' => 'Deleting this job is not allowed'], 403);
                $changedJobIds[] = $jobId;
                continue;
            }
            $voidFields = ['voidedAt', 'voidedBy', 'voidReason'];
            $voidFieldsChanged = false;
            foreach ($voidFields as $field) {
                if (trim((string) ($oldJob[$field] ?? '')) !== trim((string) ($newJob[$field] ?? ''))) {
                    $voidFieldsChanged = true;
                    break;
                }
            }
            $isSalesVoidUpdate = false;
            if ($voidFieldsChanged) {
                $voidedAt = (string) ($newJob['voidedAt'] ?? '');
                $isSalesVoidUpdate = $actor['role'] === 'SALES'
                    && empty($oldJob['voidedAt'])
                    && trim($voidedAt) !== ''
                    && strtotime($voidedAt) !== false
                    && trim((string) ($newJob['voidedBy'] ?? '')) === trim((string) $actor['name'])
                    && trim((string) ($newJob['voidReason'] ?? '')) !== ''
                    && branchNameKey((string) ($oldJob['inquiry']['createdByBranch'] ?? ''))
                        === branchNameKey((string) ($actor['branch_name'] ?? $actor['branch'] ?? ''))
                    && ($oldJob['managerApproval']['status'] ?? '') !== 'APPROVED'
                    && ($oldJob['quotation']['epda']['status'] ?? '') !== 'SUBMITTED'
                    && ($oldJob['quotation']['epda']['status'] ?? '') !== 'APPROVED'
                    && !($oldJob['fda']['fdaApproved'] ?? false)
                    && empty($oldJob['actualCosts'])
                    && empty($oldJob['closing']['isClosed'])
                    && ($oldJob['currentStage'] ?? '') !== 'CLOSED'
                    && ($oldJob['status'] ?? '') !== 'CLOSED';
                if (!$isSalesVoidUpdate) jsonResponse(['error' => 'Job cannot be voided'], 403);
            }
            foreach (array_unique(array_merge(array_keys($oldJob), array_keys($newJob))) as $key) {
                $oldValue = $oldJob[$key] ?? null;
                $newValue = $newJob[$key] ?? null;
                $isAllowedVoidField = $isSalesVoidUpdate && in_array($key, $voidFields, true);
                $sameVoidField = in_array($key, $voidFields, true)
                    && trim((string) ($oldValue ?? '')) === trim((string) ($newValue ?? ''));
                $sameCreatedAt = $key === 'createdAt'
                    && is_string($oldValue)
                    && is_string($newValue)
                    && strtotime($oldValue) !== false
                    && strtotime($oldValue) === strtotime($newValue);
                if (
                    !in_array($key, $allowed, true)
                    && !$isAllowedVoidField
                    && !$sameVoidField
                    && !$sameCreatedAt
                    && json_encode($oldValue) !== json_encode($newValue)
                ) {
                    jsonResponse(['error' => 'This role cannot change job field: ' . $key], 403);
                }
            }
            if ($actor['role'] === 'FDA') {
                $oldReceipts = $oldJob['principalReceipts'] ?? [];
                $newReceipts = $newJob['principalReceipts'] ?? [];
                $oldReceiptsById = [];
                $newReceiptsById = [];
                foreach ($oldReceipts as $receipt) {
                    if (isset($receipt['id'])) $oldReceiptsById[$receipt['id']] = $receipt;
                }
                foreach ($newReceipts as $receipt) {
                    if (!isset($receipt['id']) || isset($newReceiptsById[$receipt['id']])) {
                        jsonResponse(['error' => 'Advance Payment receipt IDs must be unique'], 403);
                    }
                    $newReceiptsById[$receipt['id']] = $receipt;
                }
                foreach ($oldReceipts as $receipt) {
                    $receiptId = $receipt['id'] ?? null;
                    if (!isset($receiptId, $newReceiptsById[$receiptId])) {
                        if (($receipt['paymentType'] ?? '') !== 'ADVANCE_PAYMENT') {
                            jsonResponse(['error' => 'FDA cannot remove invoice payment receipts'], 403);
                        }
                        continue;
                    }
                    $updatedReceipt = $newReceiptsById[$receiptId];
                    if (json_encode($receipt) === json_encode($updatedReceipt)) continue;
                    if (($receipt['paymentType'] ?? '') !== 'ADVANCE_PAYMENT'
                        || ($updatedReceipt['paymentType'] ?? '') !== 'ADVANCE_PAYMENT'
                        || immutableReceiptFields($receipt) !== immutableReceiptFields($updatedReceipt)
                        || !validAdvancePaymentReceipt($updatedReceipt, (string) $jobId)) {
                        jsonResponse(['error' => 'FDA may only edit the date, amount, or remark of a valid Advance Payment receipt'], 403);
                    }
                }
                foreach ($newReceipts as $receipt) {
                    if (isset($oldReceiptsById[$receipt['id']])) continue;
                    if (!validAdvancePaymentReceipt($receipt, (string) $jobId)) {
                        jsonResponse(['error' => 'FDA may only add valid Advance Payment receipts'], 403);
                    }
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
                    if (branchNameKey((string) ($newJob['inquiry']['createdByBranch'] ?? '')) !== branchNameKey((string) ($actor['branch_name'] ?? $actor['branch'] ?? ''))) {
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
} catch (DatabaseSchemaException $error) {
    error_log('MaritimPort database schema error: ' . $error->getMessage());
    jsonResponse(['error' => $error->getMessage()], 500);
} catch (PDOException $error) {
    error_log('MaritimPort state database error: ' . $error->getMessage());
    jsonResponse(['error' => 'Database operation failed', 'details' => $config['debug'] ? $error->getMessage() : null], 500);
} catch (Throwable $error) {
    error_log('MaritimPort state error: ' . $error->getMessage());
    jsonResponse(['error' => 'State synchronization failed', 'details' => $config['debug'] ? $error->getMessage() : null], 500);
}