<?php

declare(strict_types=1);

require __DIR__ . '/repository.php';

function branchNameKey(?string $branch): string
{
    return strtolower(trim(preg_replace('/\s+/', ' ', (string) ($branch ?? ''))));
}

function normalizedManagerApproval(array $approval): array
{
    $normalized = [
        'status' => (string) ($approval['status'] ?? 'PENDING'),
        'approvedBy' => trim((string) ($approval['approvedBy'] ?? '')),
        'approvedAt' => (string) ($approval['approvedAt'] ?? ''),
        'notes' => trim((string) ($approval['notes'] ?? '')),
    ];
    foreach ($approval as $key => $value) {
        if ($key !== 'allowedMarginTolerancePct' && !array_key_exists($key, $normalized)) $normalized[$key] = $value;
    }
    ksort($normalized);
    return $normalized;
}

function stateRevision(array $state): string
{
    unset($state['currentRole'], $state['selectedJobId'], $state['auditLogs']);
    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) throw new RuntimeException('Unable to calculate application state revision');
    return hash('sha256', $encoded);
}

function validatePaymentVoucherPaymentHistories(array $newState, array $oldState): ?string
{
    $oldVouchers = [];
    foreach ($oldState['paymentVouchers'] ?? [] as $voucher) {
        if (isset($voucher['id'])) $oldVouchers[(string) $voucher['id']] = $voucher;
    }
    foreach ($newState['paymentVouchers'] ?? [] as $voucher) {
        $id = (string) ($voucher['id'] ?? '');
        if (!isset($oldVouchers[$id])) continue;
        $oldVoucher = $oldVouchers[$id];
        $oldHistory = $oldVoucher['paymentHistory'] ?? [];
        $newHistory = $voucher['paymentHistory'] ?? [];
        if (json_encode($oldHistory) !== json_encode($newHistory)) {
            return 'Payment history cannot be changed.';
        }
    }
    return null;
}

function validatePaymentVoucherBankCurrencies(array $newState, array $oldState): ?string
{
    $oldVouchers = [];
    foreach ($oldState['paymentVouchers'] ?? [] as $voucher) {
        if (isset($voucher['id'])) $oldVouchers[(string) $voucher['id']] = $voucher;
    }
    $bankAccounts = [];
    foreach ($oldState['bankAccounts'] ?? [] as $account) {
        if (isset($account['id'])) $bankAccounts[(string) $account['id']] = $account;
    }
    foreach ($newState['paymentVouchers'] ?? [] as $voucher) {
        $id = (string) ($voucher['id'] ?? '');
        $oldVoucher = $oldVouchers[$id] ?? null;
        if (($voucher['status'] ?? '') !== 'PAID' || ($oldVoucher['status'] ?? '') === 'PAID') continue;
        $currency = (string) ($voucher['currency'] ?? 'IDR');
        $accountId = (string) ($voucher['paidFromBankAccountId'] ?? '');
        $account = $bankAccounts[$accountId] ?? null;
        if ($account === null) {
            return 'Pilih rekening pembayaran yang terdaftar sebelum memproses voucher.';
        }
        $accountCurrency = (string) ($account['currency'] ?? '');
        if (!in_array($accountCurrency, ['IDR', 'USD'], true)) {
            return 'Mata uang rekening belum diatur pada Master Bank Account. Pembayaran diblokir.';
        }
        if (!in_array($currency, ['IDR', 'USD'], true) || $accountCurrency !== $currency) {
            return "Mata uang rekening ({$accountCurrency}) harus sama dengan mata uang voucher ({$currency}). Pembayaran diblokir.";
        }
    }
    return null;
}

function validateCashBalanceAdjustments(array $newState, array $oldState, array $actor): ?string
{
    $oldAdjustments = [];
    foreach ($oldState['cashBalanceAdjustments'] ?? [] as $adjustment) {
        if (isset($adjustment['id'])) $oldAdjustments[(string) $adjustment['id']] = $adjustment;
    }
    $newAdjustments = [];
    foreach ($newState['cashBalanceAdjustments'] ?? [] as $adjustment) {
        $id = trim((string) ($adjustment['id'] ?? ''));
        if ($id === '' || isset($newAdjustments[$id])) return 'Penyesuaian saldo kas harus memiliki ID unik.';
        $newAdjustments[$id] = $adjustment;
    }
    foreach ($oldAdjustments as $id => $oldAdjustment) {
        if (!isset($newAdjustments[$id])) return 'Riwayat penyesuaian saldo kas tidak dapat dihapus.';
        foreach (['bankAccountId', 'bankName', 'accountNumber', 'currency', 'amount', 'effectiveDate', 'reason', 'createdBy', 'createdAt'] as $field) {
            if ((string) ($newAdjustments[$id][$field] ?? '') !== (string) ($oldAdjustment[$field] ?? '')) {
                return 'Riwayat penyesuaian saldo kas tidak dapat diubah.';
            }
        }
    }
    $accounts = [];
    foreach ($newState['bankAccounts'] ?? [] as $account) {
        if (isset($account['id'])) $accounts[(string) $account['id']] = $account;
    }
    foreach ($newAdjustments as $adjustment) {
        $account = $accounts[(string) ($adjustment['bankAccountId'] ?? '')] ?? null;
        if ($account === null || ($account['currency'] ?? '') !== ($adjustment['currency'] ?? '')) {
            return 'Rekening dengan riwayat penyesuaian tidak dapat dihapus atau diganti currency-nya.';
        }
    }
    foreach (array_diff_key($newAdjustments, $oldAdjustments) as $adjustment) {
        if (($actor['role'] ?? '') !== 'ADMIN') return 'Hanya Admin yang dapat menambahkan penyesuaian saldo kas.';
        $accountId = trim((string) ($adjustment['bankAccountId'] ?? ''));
        $account = $accounts[$accountId] ?? null;
        $currency = (string) ($adjustment['currency'] ?? '');
        $effectiveDate = (string) ($adjustment['effectiveDate'] ?? '');
        $dateParts = array_map('intval', explode('-', $effectiveDate));
        $validDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $effectiveDate) === 1
            && count($dateParts) === 3
            && checkdate($dateParts[1], $dateParts[2], $dateParts[0])
            && $effectiveDate >= '2026-10-22';
        $amount = $adjustment['amount'] ?? null;
        $reason = trim((string) ($adjustment['reason'] ?? ''));
        if ($account === null
            || !in_array($currency, ['IDR', 'USD'], true)
            || ($account['currency'] ?? '') !== $currency
            || (string) ($adjustment['bankName'] ?? '') !== (string) ($account['bankName'] ?? '')
            || (string) ($adjustment['accountNumber'] ?? '') !== (string) ($account['accountNumber'] ?? '')
            || !is_numeric($amount)
            || !is_finite((float) $amount)
            || (float) $amount === 0.0
            || !$validDate
            || $reason === ''
            || strlen($reason) > 2000
            || trim((string) ($adjustment['createdBy'] ?? '')) !== trim((string) ($actor['name'] ?? ''))
            || empty($adjustment['createdAt'])
            || strtotime((string) $adjustment['createdAt']) === false) {
            return 'Data penyesuaian saldo kas tidak valid. Periksa rekening, currency, nominal, tanggal, alasan, dan pembuat.';
        }
    }
    return null;
}

function describeJobUpdate(array $oldJob, array $newJob, string $role): string
{
    $sections = match ($role) {
        'SALES' => [
            'inquiry' => 'inquiry',
            'quotation' => 'quotation EPDA/FPDA',
            'vesselId' => 'data kapal',
            'vesselName' => 'data kapal',
            'portId' => 'data pelabuhan',
            'portName' => 'data pelabuhan',
            'eta' => 'jadwal ETA',
            'etd' => 'jadwal ETD',
            'purposeOfCall' => 'purpose of call',
            'status' => 'status job',
        ],
        'MANAGER_OPS' => [
            'managerApproval' => 'persetujuan Manager',
            'quotation' => 'quotation EPDA/FPDA',
            'fda' => 'status FDA',
        ],
        'FDA' => [
            'fda' => 'data dan approval FDA',
            'fdaItems' => 'item biaya FDA',
            'ap' => 'data hutang vendor',
            'ar' => 'data piutang',
            'principalReceipts' => 'penerimaan principal',
            'principalInvoice' => 'invoice principal',
        ],
        'FINANCE' => [
            'ap' => 'pembayaran vendor',
            'ar' => 'piutang',
            'principalReceipts' => 'penerimaan principal',
            'principalInvoice' => 'invoice principal',
            'closing' => 'closing vessel call',
        ],
        default => [],
    };
    $changed = [];
    foreach ($sections as $field => $label) {
        if (json_encode($oldJob[$field] ?? null) !== json_encode($newJob[$field] ?? null)) $changed[$label] = true;
    }
    $roleLabel = match ($role) {
        'SALES' => 'Sales',
        'MANAGER_OPS' => 'Manager Operations',
        'FDA' => 'FDA',
        'FINANCE' => 'Finance',
        default => $role,
    };
    return $roleLabel . ' memperbarui ' . ($changed ? implode(', ', array_keys($changed)) : 'data workflow') . '.';
}

function validAdvancePaymentReceipt(array $receipt, string $jobId): bool
{
    $receivedDate = (string) ($receipt['receivedDate'] ?? '');
    return ($receipt['paymentType'] ?? '') === 'ADVANCE_PAYMENT'
        && ($receipt['jobId'] ?? '') === $jobId
        && is_numeric($receipt['amount'] ?? null)
        && (float) $receipt['amount'] > 0
        && in_array($receipt['currency'] ?? '', ['IDR', 'USD'], true)
        && (($receipt['currency'] ?? '') !== 'USD'
            || (is_numeric($receipt['exchangeRateUSDToIDR'] ?? null) && is_finite((float) $receipt['exchangeRateUSDToIDR']) && (float) $receipt['exchangeRateUSDToIDR'] > 0))
        && preg_match('/^\d{4}-\d{2}-\d{2}$/', $receivedDate)
        && checkdate((int) substr($receivedDate, 5, 2), (int) substr($receivedDate, 8, 2), (int) substr($receivedDate, 0, 4))
        && trim((string) ($receipt['bankRemark'] ?? '')) !== '';
}

function validPrincipalReceiptRecord(array $receipt, string $jobId): bool
{
    $receivedDate = (string) ($receipt['receivedDate'] ?? '');
    $currency = (string) ($receipt['currency'] ?? '');
    $amount = $receipt['amount'] ?? null;
    $refundAmount = $receipt['refundAmount'] ?? 0;
    $refundStatus = (string) ($receipt['refundStatus'] ?? 'NONE');
    if (($receipt['jobId'] ?? '') !== $jobId
        || !in_array($receipt['paymentType'] ?? '', ['ADVANCE_PAYMENT', 'INVOICE'], true)
        || !is_numeric($amount) || !is_finite((float) $amount) || (float) $amount <= 0
        || !in_array($currency, ['IDR', 'USD'], true)
        || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $receivedDate)
        || !checkdate((int) substr($receivedDate, 5, 2), (int) substr($receivedDate, 8, 2), (int) substr($receivedDate, 0, 4))
        || trim((string) ($receipt['bankRemark'] ?? '')) === ''
        || !is_numeric($refundAmount) || !is_finite((float) $refundAmount) || (float) $refundAmount < 0
        || (float) $refundAmount > (float) $amount
        || !in_array($refundStatus, ['NONE', 'PENDING', 'PAID'], true)) return false;
    if ($currency === 'USD'
        && (!is_numeric($receipt['exchangeRateUSDToIDR'] ?? null)
            || !is_finite((float) $receipt['exchangeRateUSDToIDR'])
            || (float) $receipt['exchangeRateUSDToIDR'] <= 0)) return false;
    if ($refundStatus === 'NONE') return (float) $refundAmount === 0.0;
    if ((float) $refundAmount <= 0) return false;
    if ($currency === 'USD'
        && (!is_numeric($receipt['refundExchangeRateUSDToIDR'] ?? null)
            || !is_finite((float) $receipt['refundExchangeRateUSDToIDR'])
            || (float) $receipt['refundExchangeRateUSDToIDR'] <= 0)) return false;
    if ($refundStatus === 'PAID') {
        $refundDate = (string) ($receipt['refundDate'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $refundDate)
            || !checkdate((int) substr($refundDate, 5, 2), (int) substr($refundDate, 8, 2), (int) substr($refundDate, 0, 4))
            || trim((string) ($receipt['refundBankReference'] ?? '')) === ''
            || strlen((string) ($receipt['refundBankReference'] ?? '')) > 150) return false;
    }
    return true;
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

function immutablePrincipalPaymentFields(array $receipt): array
{
    unset(
        $receipt['refundAmount'],
        $receipt['refundExchangeRateUSDToIDR'],
        $receipt['refundDate'],
        $receipt['refundBankReference'],
        $receipt['refundStatus'],
    );
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
    $state['cashBalanceAdjustments'] = $before['cashBalanceAdjustments'] ?? [];

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
    foreach ($state['bankAccounts'] ?? [] as $account) {
        if (!in_array($account['currency'] ?? null, ['IDR', 'USD'], true)) {
            jsonResponse(['error' => 'Setiap rekening bank harus memiliki mata uang IDR atau USD sebelum menyimpan.'], 400);
        }
    }
    if (!is_array($state['cashBalanceAdjustments'] ?? [])) {
        jsonResponse(['error' => 'Invalid cash balance adjustments'], 400);
    }
    foreach ($state['paymentVouchers'] ?? [] as $voucher) {
        if (!validPaymentProofDataUrl($voucher['paymentProofDataUrl'] ?? null)) {
            jsonResponse(['error' => 'Payment proof must be a valid JPG or PNG image no larger than 1 MB'], 400);
        }
    }

    $pdo = db();
    $hasRefundData = false;
    foreach ($state['jobCalls'] as $job) {
        foreach ($job['principalReceipts'] ?? [] as $receipt) {
            if (($receipt['refundStatus'] ?? 'NONE') !== 'NONE' || (float) ($receipt['refundAmount'] ?? 0) > 0) {
                $hasRefundData = true;
                break 2;
            }
        }
    }
    if ($hasRefundData) {
        $missingRefundColumns = array_diff(
            ['refund_amount', 'refund_exchange_rate_usd_to_idr', 'refund_date', 'refund_bank_reference', 'refund_status'],
            tableColumns($pdo, 'principal_receipts') ?? [],
        );
        if ($missingRefundColumns) {
            jsonResponse([
                'error' => 'Refund belum bisa disimpan. Terapkan database/migrations/20261021_add_principal_receipt_refunds.sql terlebih dahulu.',
                'code' => 'REFUND_SCHEMA_MISMATCH',
            ], 503);
        }
    }
    $lock = $pdo->query("SELECT GET_LOCK('maritimport_app_state', 10)")->fetchColumn();
    if ((int) $lock !== 1) jsonResponse(['error' => 'Could not lock application state for saving'], 503);
    $before = loadAppState();
    $oldPaymentVouchers = [];
    foreach ($before['paymentVouchers'] ?? [] as $voucher) {
        if (isset($voucher['id'])) $oldPaymentVouchers[(string) $voucher['id']] = $voucher;
    }
    foreach ($state['paymentVouchers'] ?? [] as $voucher) {
        $voucherId = (string) ($voucher['id'] ?? '');
        $oldVoucher = $oldPaymentVouchers[$voucherId] ?? [];
        $oldProof = $oldVoucher['paymentProofDataUrl'] ?? '';
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
    $paymentHistoryError = validatePaymentVoucherPaymentHistories($state, $before);
    if ($paymentHistoryError !== null) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => $paymentHistoryError], 403);
    }
    $bankCurrencyError = validatePaymentVoucherBankCurrencies($state, $before);
    if ($bankCurrencyError !== null) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => $bankCurrencyError], 400);
    }
    $cashAdjustmentError = validateCashBalanceAdjustments($state, $before, $actor);
    if ($cashAdjustmentError !== null) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => $cashAdjustmentError], 403);
    }

    if ($actor['role'] !== 'ADMIN') {
        applyNonAdminMasterData($state, $before, (string) $actor['role']);
        $allowed = match ($actor['role']) {
            'SALES' => ['inquiry', 'quotation', 'status', 'currentStage', 'updatedAt', 'vesselId', 'vesselName', 'portId', 'portName', 'customerId', 'customerName', 'currency', 'exchangeRateUSDToIDR', 'eta', 'etd', 'purposeOfCall'],
            'MANAGER_OPS' => ['managerApproval', 'quotation', 'fda', 'status', 'currentStage', 'updatedAt'],
            'FDA' => ['fda', 'fdaItems', 'ap', 'ar', 'principalReceipts', 'principalInvoice', 'status', 'currentStage', 'updatedAt'],
            'FINANCE' => ['ap', 'ar', 'principalReceipts', 'principalInvoice', 'closing', 'status', 'currentStage', 'updatedAt'],
            default => [],
        };
        $oldJobs = [];
        foreach ($before['jobCalls'] as $job) $oldJobs[$job['jobId']] = $job;
        if ($actor['role'] === 'SALES') {
            foreach ($state['jobCalls'] as &$newJob) {
                $jobId = (string) ($newJob['jobId'] ?? '');
                if (!isset($oldJobs[$jobId])) continue;
                if (array_key_exists('operationalData', $oldJobs[$jobId])) {
                    $newJob['operationalData'] = $oldJobs[$jobId]['operationalData'];
                } else {
                    unset($newJob['operationalData']);
                }
                if (array_key_exists('fda', $oldJobs[$jobId])) {
                    $newJob['fda'] = $oldJobs[$jobId]['fda'];
                } else {
                    unset($newJob['fda']);
                }
                if (array_key_exists('principalReceipts', $oldJobs[$jobId])) {
                    $newJob['principalReceipts'] = $oldJobs[$jobId]['principalReceipts'];
                } else {
                    unset($newJob['principalReceipts']);
                }
                if (array_key_exists('closing', $oldJobs[$jobId])) {
                    $newJob['closing'] = $oldJobs[$jobId]['closing'];
                } else {
                    unset($newJob['closing']);
                }
            }
            unset($newJob);
        }
        if ($actor['role'] !== 'FDA') {
            foreach ($state['jobCalls'] as &$newJob) {
                $jobId = (string) ($newJob['jobId'] ?? '');
                if (!isset($oldJobs[$jobId])) continue;
                if (array_key_exists('fdaItems', $oldJobs[$jobId])) {
                    $newJob['fdaItems'] = $oldJobs[$jobId]['fdaItems'];
                } else {
                    unset($newJob['fdaItems']);
                }
            }
            unset($newJob);
        }
        $newJobs = [];
        foreach ($state['jobCalls'] as $job) $newJobs[$job['jobId']] = $job;
        $changedJobIds = [];
        $deletedJobIds = [];
        foreach ($oldJobs as $jobId => $oldJob) {
            $newJob = $newJobs[$jobId] ?? null;
            if (!isset($newJobs[$jobId])) {
                $canSalesDelete = $actor['role'] === 'SALES'
                    && empty($oldJob['voidedAt'])
                    && ($oldJob['managerApproval']['status'] ?? '') !== 'APPROVED'
                    && !in_array(($oldJob['quotation']['epda']['status'] ?? 'DRAFT'), ['SUBMITTED', 'APPROVED'], true)
                    && !($oldJob['fda']['fdaApproved'] ?? false)
                    && in_array(($oldJob['fda']['approvalStatus'] ?? 'DRAFT'), ['DRAFT', 'REJECTED'], true)
                    && empty($oldJob['closing']['isClosed'])
                    && ($oldJob['currentStage'] ?? '') !== 'CLOSED'
                    && ($oldJob['status'] ?? '') !== 'CLOSED'
                    && branchNameKey((string) ($oldJob['inquiry']['createdByBranch'] ?? ''))
                        === branchNameKey((string) ($actor['branch_name'] ?? $actor['branch'] ?? ''));
                if (!$canSalesDelete) jsonResponse(['error' => 'Deleting this job is not allowed'], 403);
                $changedJobIds[] = $jobId;
                $deletedJobIds[] = $jobId;
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
                    && in_array(($oldJob['fda']['approvalStatus'] ?? 'DRAFT'), ['DRAFT', 'REJECTED'], true)
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
                $sameManagerApproval = $actor['role'] === 'SALES'
                    && $key === 'managerApproval'
                    && normalizedManagerApproval(is_array($oldValue) ? $oldValue : [])
                        === normalizedManagerApproval(is_array($newValue) ? $newValue : []);
                $sameCreatedAt = $key === 'createdAt'
                    && is_string($oldValue)
                    && is_string($newValue)
                    && strtotime($oldValue) !== false
                    && strtotime($oldValue) === strtotime($newValue);
                if (
                    !in_array($key, $allowed, true)
                    && !$isAllowedVoidField
                    && !$sameVoidField
                    && !$sameManagerApproval
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
            if ($actor['role'] === 'FINANCE') {
                $oldReceipts = $oldJob['principalReceipts'] ?? [];
                $newReceipts = $newJob['principalReceipts'] ?? [];
                $oldReceiptsById = [];
                $newReceiptsById = [];
                foreach ($oldReceipts as $receipt) {
                    if (isset($receipt['id'])) $oldReceiptsById[$receipt['id']] = $receipt;
                }
                foreach ($newReceipts as $receipt) {
                    if (!isset($receipt['id']) || isset($newReceiptsById[$receipt['id']])) {
                        jsonResponse(['error' => 'Receipt IDs must be unique'], 403);
                    }
                    $newReceiptsById[$receipt['id']] = $receipt;
                }
                foreach ($oldReceipts as $receipt) {
                    $receiptId = $receipt['id'] ?? null;
                    if (!isset($receiptId, $newReceiptsById[$receiptId])) {
                        if (($receipt['refundStatus'] ?? 'NONE') !== 'NONE' || str_starts_with((string) $receiptId, 'FIN-AR-')) {
                            jsonResponse(['error' => 'Receipts with refunds or Finance AR projections cannot be removed'], 403);
                        }
                        continue;
                    }
                    $updatedReceipt = $newReceiptsById[$receiptId];
                    if (json_encode($receipt) === json_encode($updatedReceipt)) continue;
                    if (immutablePrincipalPaymentFields($receipt) !== immutablePrincipalPaymentFields($updatedReceipt)
                        || !validPrincipalReceiptRecord($updatedReceipt, (string) $jobId)) {
                        jsonResponse(['error' => 'Finance cannot change the original receipt when recording a refund'], 403);
                    }
                    $oldRefundStatus = $receipt['refundStatus'] ?? 'NONE';
                    $newRefundStatus = $updatedReceipt['refundStatus'] ?? 'NONE';
                    if ((float) ($receipt['refundAmount'] ?? 0) !== (float) ($updatedReceipt['refundAmount'] ?? 0)
                        || ($oldRefundStatus === 'NONE' && $newRefundStatus !== 'NONE')
                        || ($oldRefundStatus === 'NONE' && $newRefundStatus === 'NONE')
                        || ($oldRefundStatus === 'PENDING' && $newRefundStatus !== 'PAID')
                        || $oldRefundStatus === 'PAID') {
                        jsonResponse(['error' => 'Only a pending refund can be confirmed as paid'], 403);
                    }
                }
                foreach ($newReceipts as $receipt) {
                    if (isset($oldReceiptsById[$receipt['id']])) continue;
                    if (str_starts_with((string) $receipt['id'], 'FIN-AR-')) continue;
                    if (!validPrincipalReceiptRecord($receipt, (string) $jobId)) {
                        jsonResponse(['error' => 'Finance receipt data is invalid'], 403);
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
            $isDeletedJob = in_array($jobId, $deletedJobIds, true);
            array_unshift($state['auditLogs'], [
                'id' => 'AUD-' . bin2hex(random_bytes(12)),
                'timestamp' => gmdate('c'),
                'actorId' => $actor['id'] ?? null,
                'actorName' => $actor['name'],
                'role' => $actor['role'],
                'action' => $isDeletedJob ? 'DELETE' : 'SYNC',
                'entity' => 'VESSEL_CALL',
                'entityId' => $jobId,
                'description' => $isDeletedJob
                    ? 'Sales menghapus inquiry dan vessel call secara permanen.'
                    : (isset($oldJobs[$jobId])
                        ? describeJobUpdate($oldJobs[$jobId], $newJobs[$jobId] ?? [], (string) $actor['role'])
                        : 'Sales membuat inquiry dan vessel call baru.'),
            ]);
        }
        $state['auditLogs'] = array_slice($state['auditLogs'], 0, 1000);
    }

    $incomingAuditLogIds = array_fill_keys(array_map(
        static fn (array $log): string => (string) ($log['id'] ?? ''),
        $state['auditLogs'] ?? [],
    ), true);
    $state['auditLogs'] = array_merge(
        array_values(array_filter(
            $before['auditLogs'] ?? [],
            static fn (array $log): bool => !isset($incomingAuditLogIds[(string) ($log['id'] ?? '')]),
        )),
        $state['auditLogs'] ?? [],
    );

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