<?php

declare(strict_types=1);

require __DIR__ . '/repository.php';

function branchNameKey(?string $branch): string
{
    return strtolower(trim(preg_replace('/\s+/', ' ', (string) ($branch ?? ''))));
}

function branchIdKey(?string $branchId): string
{
    $value = trim((string) ($branchId ?? ''));
    return $value !== '' && ctype_digit($value) ? str_pad((string) (int) $value, 3, '0', STR_PAD_LEFT) : '';
}

function validBranchSelection(?string $branchId, ?string $branchCode): bool
{
    if ($branchId === null || trim($branchId) === '') return false;
    $query = db()->prepare('SELECT code FROM branches WHERE id = :id AND is_active = 1 LIMIT 1');
    $query->execute(['id' => trim($branchId)]);
    $code = $query->fetchColumn();
    return is_string($code) && branchNameKey($code) === branchNameKey($branchCode);
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

function isPaymentVoucherApprovalOnlyChange(array $newVoucher, array $oldVoucher): bool
{
    foreach (['status', 'managerNote', 'reviewedBy', 'reviewedAt'] as $field) {
        unset($newVoucher[$field], $oldVoucher[$field]);
    }
    return json_encode($newVoucher) === json_encode($oldVoucher);
}

function validatePaymentVoucherApprovalTargets(array $newState, array $oldState, array $actor): ?string
{
    $oldVouchers = [];
    foreach ($oldState['paymentVouchers'] ?? [] as $voucher) {
        if (isset($voucher['id'])) $oldVouchers[(string) $voucher['id']] = $voucher;
    }
    $users = [];
    foreach ($newState['users'] ?? [] as $user) {
        if (isset($user['id'])) $users[(string) $user['id']] = $user;
    }
    foreach ($newState['paymentVouchers'] ?? [] as $voucher) {
        $id = (string) ($voucher['id'] ?? '');
        $oldVoucher = $oldVouchers[$id] ?? null;
        $targetRole = trim((string) ($voucher['approvalTargetRole'] ?? ''));
        $targetUserId = trim((string) ($voucher['approvalTargetUserId'] ?? ''));
        $targetName = trim((string) ($voucher['approvalTargetName'] ?? ''));

        if ($oldVoucher !== null) {
            foreach (['approvalTargetRole', 'approvalTargetUserId', 'approvalTargetName'] as $field) {
                if ((string) ($voucher[$field] ?? '') !== (string) ($oldVoucher[$field] ?? '')) {
                    return 'Tujuan approval tidak dapat diubah setelah voucher dikirim.';
                }
            }
            continue;
        }

        if (($actor['role'] ?? '') === 'FINANCE' && (($voucher['jobInfo'] ?? '') === 'OPERASIONAL')
            && ($targetRole === '' || $targetUserId === '')) {
            return 'Pilih user tujuan approval sebelum mengirim voucher Finance.';
        }
        if ($targetRole === '' && $targetUserId === '' && $targetName === '') continue;
        if (!in_array($targetRole, ['MANAGER_OPS', 'DIRECTOR'], true) || $targetUserId === '' || $targetName === '') {
            return 'Tujuan approval voucher tidak valid.';
        }
        $targetUser = $users[$targetUserId] ?? null;
        if ($targetUser === null || ($targetUser['status'] ?? '') !== 'ACTIVE'
            || ($targetUser['role'] ?? '') !== $targetRole
            || trim((string) ($targetUser['name'] ?? '')) !== $targetName) {
            return 'User approver harus aktif dan sesuai dengan role tujuan.';
        }
        if ($targetRole === 'MANAGER_OPS') {
            $voucherBranchId = branchIdKey((string) ($voucher['branchId'] ?? ''));
            $managerBranchId = branchIdKey((string) ($targetUser['branchId'] ?? ''));
            $sameBranch = $voucherBranchId !== '' && $managerBranchId !== ''
                ? $voucherBranchId === $managerBranchId
                : branchNameKey((string) ($voucher['branchName'] ?? '')) === branchNameKey((string) ($targetUser['branch'] ?? ''));
            if (!$sameBranch) return 'User Manager Branch harus berasal dari branch voucher.';
        }
    }
    return null;
}

function validatePaymentVoucherApprovalChanges(array $newState, array $oldState, array $actor): ?string
{
    $oldVouchers = [];
    foreach ($oldState['paymentVouchers'] ?? [] as $voucher) {
        if (isset($voucher['id'])) $oldVouchers[(string) $voucher['id']] = $voucher;
    }
    $approvalChanged = false;
    $approvalDecisions = [];
    foreach ($newState['paymentVouchers'] ?? [] as $voucher) {
        $id = (string) ($voucher['id'] ?? '');
        $oldVoucher = $oldVouchers[$id] ?? null;
        if ($oldVoucher === null) {
            if (($actor['role'] ?? '') === 'DIRECTOR') return 'Direktur hanya dapat menyetujui voucher yang sudah ada.';
            continue;
        }
        $oldStatus = (string) ($oldVoucher['status'] ?? 'PENDING_MANAGER');
        $newStatus = (string) ($voucher['status'] ?? 'PENDING_MANAGER');
        $isDecision = $oldStatus === 'PENDING_MANAGER' && in_array($newStatus, ['APPROVED', 'REJECTED'], true);

        if ($isDecision) {
            $approvalChanged = true;
            if (!isPaymentVoucherApprovalOnlyChange($voucher, $oldVoucher)) {
                return 'Persetujuan voucher tidak boleh mengubah data selain keputusan approval.';
            }
            if (!in_array(($actor['role'] ?? ''), ['MANAGER_OPS', 'DIRECTOR'], true)) {
                return 'Role Anda tidak dapat menyetujui payment voucher.';
            }
            $targetRole = (string) ($voucher['approvalTargetRole'] ?? '');
            $targetUserId = (string) ($voucher['approvalTargetUserId'] ?? '');
            if ($targetUserId !== '') {
                if ($targetUserId !== (string) ($actor['id'] ?? '') || $targetRole !== (string) ($actor['role'] ?? '')) {
                    return 'Voucher ini hanya dapat diproses oleh user approver yang dituju.';
                }
            } elseif (($actor['role'] ?? '') !== 'MANAGER_OPS') {
                return 'Voucher ini tidak ditujukan kepada user Anda.';
            }
            if (trim((string) ($voucher['reviewedBy'] ?? '')) !== trim((string) ($actor['name'] ?? ''))) {
                return 'Nama approver tidak sesuai dengan akun yang sedang login.';
            }
            if (trim((string) ($voucher['reviewedAt'] ?? '')) === '') {
                return 'Waktu persetujuan wajib dicatat.';
            }
            if (strtotime((string) $voucher['reviewedAt']) === false) {
                return 'Waktu persetujuan tidak valid.';
            }
            if ($newStatus === 'REJECTED' && trim((string) ($voucher['managerNote'] ?? '')) === '') {
                return 'Alasan penolakan wajib diisi.';
            }
            $approvalDecisions[$id] = $newStatus;
            continue;
        }

        if (in_array($newStatus, ['APPROVED', 'REJECTED'], true) && $newStatus !== $oldStatus) {
            return 'Voucher tidak sedang menunggu persetujuan.';
        }
        $approvalMetadataChanged = false;
        foreach (['managerNote', 'reviewedBy', 'reviewedAt'] as $field) {
            if ((string) ($voucher[$field] ?? '') !== (string) ($oldVoucher[$field] ?? '')) {
                $approvalMetadataChanged = true;
                break;
            }
        }
        $isRejectedResubmission = $oldStatus === 'REJECTED' && $newStatus === 'PENDING_MANAGER'
            && in_array(($actor['role'] ?? ''), ['FDA', 'FINANCE'], true)
            && trim((string) ($voucher['managerNote'] ?? '')) === ''
            && trim((string) ($voucher['reviewedBy'] ?? '')) === ''
            && trim((string) ($voucher['reviewedAt'] ?? '')) === '';
        if ($approvalMetadataChanged && !$isRejectedResubmission) {
            return 'Informasi review hanya dapat diubah saat approver mengambil keputusan.';
        }
        if (($actor['role'] ?? '') === 'DIRECTOR' && json_encode($voucher) !== json_encode($oldVoucher)) {
            return 'Direktur hanya dapat menyetujui atau menolak voucher yang ditujukan kepadanya.';
        }
    }
    if (($actor['role'] ?? '') === 'DIRECTOR') {
        $newVoucherIds = array_fill_keys(array_map(
            static fn (array $voucher): string => (string) ($voucher['id'] ?? ''),
            $newState['paymentVouchers'] ?? [],
        ), true);
        foreach (array_keys($oldVouchers) as $id) {
            if (!isset($newVoucherIds[$id])) return 'Direktur tidak dapat menghapus voucher.';
        }
        $newStateWithoutVoucherApproval = $newState;
        $oldStateWithoutVoucherApproval = $oldState;
        foreach (['paymentVouchers', 'auditLogs', 'currentRole', 'selectedJobId'] as $key) {
            unset($newStateWithoutVoucherApproval[$key], $oldStateWithoutVoucherApproval[$key]);
        }
        if (json_encode($newStateWithoutVoucherApproval) !== json_encode($oldStateWithoutVoucherApproval) || !$approvalChanged) {
            return 'Akun Direktur hanya dapat menyimpan keputusan approval voucher.';
        }
        $oldAuditLogs = [];
        foreach ($oldState['auditLogs'] ?? [] as $log) {
            if (isset($log['id'])) $oldAuditLogs[(string) $log['id']] = $log;
        }
        $newAuditLogs = [];
        $newApprovalLogs = [];
        foreach ($newState['auditLogs'] ?? [] as $log) {
            $logId = (string) ($log['id'] ?? '');
            if ($logId === '' || isset($newAuditLogs[$logId])) return 'Audit approval voucher tidak valid.';
            $newAuditLogs[$logId] = $log;
            if (!isset($oldAuditLogs[$logId])) $newApprovalLogs[] = $log;
            elseif (json_encode($oldAuditLogs[$logId]) !== json_encode($log)) return 'Riwayat audit yang sudah ada tidak dapat diubah.';
        }
        if (count($newApprovalLogs) !== count($approvalDecisions)) return 'Setiap keputusan harus memiliki catatan audit.';
        $permanentAuditIds = [];
        $recentAuditIds = [];
        foreach ($oldState['auditLogs'] ?? [] as $log) {
            $logId = (string) ($log['id'] ?? '');
            if (($log['entity'] ?? '') === 'VESSEL_CALL' && ($log['action'] ?? '') === 'DELETE') {
                $permanentAuditIds[] = $logId;
            } else {
                $recentAuditIds[] = $logId;
            }
        }
        $recentCapacity = max(0, 1000 - count($permanentAuditIds));
        $retainedRecentIds = array_slice($recentAuditIds, 0, max(0, $recentCapacity - count($newApprovalLogs)));
        foreach (array_merge($permanentAuditIds, $retainedRecentIds) as $logId) {
            if (!isset($newAuditLogs[$logId])) return 'Riwayat audit yang sudah ada tidak dapat dihapus.';
        }
        foreach ($newApprovalLogs as $log) {
            $voucherId = (string) ($log['entityId'] ?? '');
            $expectedAction = ($approvalDecisions[$voucherId] ?? '') === 'APPROVED' ? 'APPROVE' : 'REJECT';
            if (!isset($approvalDecisions[$voucherId])
                || ($log['entity'] ?? '') !== 'PAYMENT_VOUCHER'
                || ($log['actorId'] ?? '') !== ($actor['id'] ?? '')
                || ($log['actorName'] ?? '') !== ($actor['name'] ?? '')
                || ($log['role'] ?? '') !== 'DIRECTOR'
                || ($log['action'] ?? '') !== $expectedAction) {
                return 'Catatan audit harus sesuai dengan user dan keputusan approval.';
            }
        }
    }
    return null;
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

function validateBankAccountBranches(array $newState, array $oldState): ?string
{
    $oldAccounts = [];
    foreach ($oldState['bankAccounts'] ?? [] as $account) {
        if (isset($account['id'])) $oldAccounts[(string) $account['id']] = $account;
    }
    foreach ($newState['bankAccounts'] ?? [] as $account) {
        $id = trim((string) ($account['id'] ?? ''));
        $branch = trim((string) ($account['branchName'] ?? ''));
        $branchId = trim((string) ($account['branchId'] ?? ''));
        $oldBranch = trim((string) ($oldAccounts[$id]['branchName'] ?? ''));
        $oldBranchId = trim((string) ($oldAccounts[$id]['branchId'] ?? ''));
        if ($branch !== '' && strlen($branch) > 150) return 'Nama branch rekening maksimal 150 karakter.';
        if ((!isset($oldAccounts[$id]) && ($branch === '' || !validBranchSelection($branchId, $branch)))
            || ($branchId !== '' && !validBranchSelection($branchId, $branch))) {
            return 'Pilih branch kantor yang valid dari master branch.';
        }
        if ($oldBranch !== '' && branchNameKey($oldBranch) !== branchNameKey($branch)) {
            return 'Branch pemilik rekening tidak dapat diubah setelah ditetapkan.';
        }
        if ($oldBranchId !== '' && branchIdKey($oldBranchId) !== branchIdKey($branchId)) {
            return 'ID branch pemilik rekening tidak dapat diubah setelah ditetapkan.';
        }
    }
    return null;
}

function validateUserBranches(array $newState, array $oldState): ?string
{
    $oldUsers = [];
    foreach ($oldState['users'] ?? [] as $user) {
        if (isset($user['id'])) $oldUsers[(string) $user['id']] = $user;
    }
    foreach ($newState['users'] ?? [] as $user) {
        $id = (string) ($user['id'] ?? '');
        $branchCode = trim((string) ($user['branch'] ?? ''));
        $branchId = trim((string) ($user['branchId'] ?? ''));
        $oldUser = $oldUsers[$id] ?? null;
        $branchChanged = $oldUser === null
            || branchNameKey((string) ($oldUser['branch'] ?? '')) !== branchNameKey($branchCode)
            || branchIdKey((string) ($oldUser['branchId'] ?? '')) !== branchIdKey($branchId);
        if ($branchCode === '' && in_array(($user['role'] ?? ''), ['ADMIN', 'ACCOUNTING', 'DIRECTOR'], true)) continue;
        if ($branchId === '') $branchId = branchIdFromValue($branchCode) ?? '';
        if ($branchId !== '' && !validBranchSelection($branchId, $branchCode)) {
            return 'Pilih branch aktif yang valid dari master branch untuk user.';
        }
        if ($branchChanged && ($branchId === '' || $branchCode === '')) {
            return 'Setiap user baru atau perubahan branch wajib memilih branch dari master branch.';
        }
    }
    return null;
}

function validatePaymentVoucherBranches(array $newState, array $oldState, array $actor): ?string
{
    $oldVouchers = [];
    foreach ($oldState['paymentVouchers'] ?? [] as $voucher) {
        if (isset($voucher['id'])) $oldVouchers[(string) $voucher['id']] = $voucher;
    }
    $accounts = [];
    foreach ($newState['bankAccounts'] ?? [] as $account) {
        if (isset($account['id'])) $accounts[(string) $account['id']] = $account;
    }
    $actorBranch = branchNameKey((string) ($actor['branch_name'] ?? $actor['branch'] ?? ''));
    $actorBranchId = branchIdKey((string) ($actor['branch_id'] ?? ''));
    foreach ($newState['paymentVouchers'] ?? [] as $voucher) {
        $id = (string) ($voucher['id'] ?? '');
        $oldVoucher = $oldVouchers[$id] ?? null;
        $branch = trim((string) ($voucher['branchName'] ?? ''));
        $branchId = trim((string) ($voucher['branchId'] ?? ''));
        $oldBranch = trim((string) ($oldVoucher['branchName'] ?? ''));
        $oldBranchId = trim((string) ($oldVoucher['branchId'] ?? ''));
        if ($oldVoucher === null) {
            if (!in_array(($actor['role'] ?? ''), ['FDA', 'FINANCE'], true)
                || $branch === ''
                || branchNameKey($branch) !== $actorBranch
                || $branchId === ''
                || branchIdKey($branchId) !== $actorBranchId
                || !validBranchSelection($branchId, $branch)) {
                return 'Payment request harus dibuat oleh user Finance/FDA pada branch pemiliknya.';
            }
        } elseif ($branch !== $oldBranch || ($oldBranchId !== '' && branchIdKey($branchId) !== branchIdKey($oldBranchId))) {
            return 'Branch payment request tidak dapat diubah setelah dibuat.';
        }

        if ($oldVoucher !== null && ($actor['role'] ?? '') !== 'ADMIN'
            && !(($actor['role'] ?? '') === 'DIRECTOR' && isPaymentVoucherApprovalOnlyChange($voucher, $oldVoucher))) {
            $changed = json_encode($voucher) !== json_encode($oldVoucher);
            if ($changed && ($branch === '' || $actorBranch === '' || branchNameKey($branch) !== $actorBranch
                || ($branchId !== '' && $actorBranchId !== '' && branchIdKey($branchId) !== $actorBranchId))) {
                return 'Payment request hanya dapat diproses oleh user pada branch pemiliknya.';
            }
        }

        $bankAccountId = trim((string) ($voucher['paidFromBankAccountId'] ?? ''));
        if ($bankAccountId !== '') {
            $accountBranch = trim((string) ($accounts[$bankAccountId]['branchName'] ?? ''));
            $requiresBranchAssignment = $oldVoucher === null
                || (string) ($oldVoucher['paidFromBankAccountId'] ?? '') !== $bankAccountId;
            if (($requiresBranchAssignment && ($accountBranch === '' || $branch === ''))
                || ($accountBranch !== '' && $branch !== '' && branchNameKey($accountBranch) !== branchNameKey($branch))) {
                return 'Rekening pembayaran harus berasal dari branch yang sama dengan payment request.';
            }
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
        foreach (['bankAccountId', 'branchName', 'branchId', 'bankName', 'accountNumber', 'currency', 'amount', 'effectiveDate', 'reason', 'createdBy', 'createdAt'] as $field) {
            $newValue = (string) ($newAdjustments[$id][$field] ?? '');
            $oldValue = (string) ($oldAdjustment[$field] ?? '');
            $matches = $field === 'createdAt'
                ? strtotime($newValue) !== false && strtotime($newValue) === strtotime($oldValue)
                : $newValue === $oldValue;
            if (!$matches) {
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
        $adjustmentBranch = trim((string) ($adjustment['branchName'] ?? ''));
        $adjustmentBranchId = branchIdKey((string) ($adjustment['branchId'] ?? ''));
        $accountBranch = trim((string) ($account['branchName'] ?? ''));
        $accountBranchId = branchIdKey((string) ($account['branchId'] ?? ''));
        if (($adjustmentBranch !== '' && $accountBranch !== '' && branchNameKey($adjustmentBranch) !== branchNameKey($accountBranch))
            || ($adjustmentBranchId !== '' && $accountBranchId !== '' && $adjustmentBranchId !== $accountBranchId)) {
            return 'Branch penyesuaian saldo harus sama dengan branch pemilik rekening.';
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
            || trim((string) ($account['branchName'] ?? '')) === ''
            || branchNameKey((string) ($adjustment['branchName'] ?? '')) !== branchNameKey((string) ($account['branchName'] ?? ''))
            || branchIdKey((string) ($adjustment['branchId'] ?? '')) !== branchIdKey((string) ($account['branchId'] ?? ''))
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
    foreach (['users', 'customers', 'ports', 'zones'] as $key) {
        $state[$key] = $before[$key];
    }
    $existingVessels = [];
    foreach ($before['vessels'] ?? [] as $vessel) {
        $existingVessels[(string) ($vessel['id'] ?? '')] = $vessel;
    }
    $incomingVessels = is_array($state['vessels'] ?? null) ? $state['vessels'] : [];
    $incomingVesselIds = [];
    $newVessels = [];
    foreach ($incomingVessels as $vessel) {
        if (!is_array($vessel)) jsonResponse(['error' => 'Data vessel tidak valid'], 400);
        $id = trim((string) ($vessel['id'] ?? ''));
        if ($id === '') jsonResponse(['error' => 'Vessel ID is required'], 400);
        if (isset($incomingVesselIds[$id])) jsonResponse(['error' => 'Vessel ID tidak boleh duplikat'], 400);
        $incomingVesselIds[$id] = true;
        if (isset($existingVessels[$id])) {
            if (json_encode($existingVessels[$id]) !== json_encode($vessel)) {
                jsonResponse(['error' => 'Hanya Admin yang dapat mengubah atau menghapus master Vessel'], 403);
            }
            continue;
        }
        if ($role !== 'SALES') jsonResponse(['error' => 'Hanya Sales yang dapat menambahkan master Vessel'], 403);
        $name = trim((string) ($vessel['name'] ?? ''));
        $vesselType = (string) ($vessel['vesselType'] ?? '');
        $numberFields = ['grt', 'nrt', 'dwt', 'loa', 'beam', 'yearBuilt'];
        $validNumbers = true;
        foreach ($numberFields as $field) {
            if (!is_numeric($vessel[$field] ?? null) || !is_finite((float) $vessel[$field]) || (float) $vessel[$field] < 0) {
                $validNumbers = false;
                break;
            }
        }
        if (strlen($id) > 100 || $name === '' || strlen($name) > 200
            || !in_array($vesselType, ['BULK CARRIER', 'CONTAINER', 'OIL TANKER', 'GENERAL CARGO', 'TUG & BARGE', 'LNG CARRIER'], true)
            || strlen((string) ($vessel['imoNumber'] ?? '')) > 30
            || strlen((string) ($vessel['callSign'] ?? '')) > 50
            || strlen((string) ($vessel['flag'] ?? '')) > 100
            || !$validNumbers) {
            jsonResponse(['error' => 'Data master Vessel tidak lengkap atau tidak valid'], 400);
        }
        $newVessels[] = $vessel;
    }
    if (array_diff_key($existingVessels, $incomingVesselIds)) {
        jsonResponse(['error' => 'Hanya Admin yang dapat mengubah atau menghapus master Vessel'], 403);
    }
    $state['vessels'] = array_merge($before['vessels'] ?? [], $newVessels);
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
    $approvalTargetError = validatePaymentVoucherApprovalTargets($state, $before, $actor);
    if ($approvalTargetError !== null) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => $approvalTargetError], 403);
    }
    $approvalChangeError = validatePaymentVoucherApprovalChanges($state, $before, $actor);
    if ($approvalChangeError !== null) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => $approvalChangeError], 403);
    }
    if (json_encode($state['branches'] ?? []) !== json_encode($before['branches'] ?? [])) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => 'Master branch tidak dapat diubah melalui sinkronisasi state. Gunakan migrasi database yang terkontrol.'], 403);
    }
    $oldCoaById = [];
    foreach ($before['chartOfAccounts'] ?? [] as $account) {
        $oldCoaById[(string) ($account['id'] ?? '')] = $account;
    }
    $newCoaRows = $state['chartOfAccounts'] ?? null;
    if (!is_array($newCoaRows)) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => 'Data Master COA tidak valid.'], 400);
    }
    $newCoaById = [];
    $usedCoaIds = [];
    foreach ($before['bankAccounts'] ?? [] as $account) {
        if (!empty($account['coaId'])) $usedCoaIds[(string) $account['coaId']] = true;
    }
    foreach ($before['paymentVouchers'] ?? [] as $voucher) {
        foreach ($voucher['items'] ?? [] as $item) {
            if (!empty($item['coaId'])) $usedCoaIds[(string) $item['coaId']] = true;
        }
        foreach ($voucher['paymentJournalLines'] ?? [] as $line) {
            if (!empty($line['coaId'])) $usedCoaIds[(string) $line['coaId']] = true;
        }
        foreach ($voucher['paymentHistory'] ?? [] as $payment) {
            foreach ($payment['paymentJournalLines'] ?? [] as $line) {
                if (!empty($line['coaId'])) $usedCoaIds[(string) $line['coaId']] = true;
            }
        }
        foreach (['paymentSurchargeCoaId', 'paymentOtherExpensesCoaId'] as $field) {
            if (!empty($voucher[$field])) $usedCoaIds[(string) $voucher[$field]] = true;
        }
    }
    $receivableTableExists = (int) $pdo->query(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'accounts_receivable_entries'"
    )->fetchColumn() === 1;
    if ($receivableTableExists) {
        $receivableColumns = array_column($pdo->query('SHOW COLUMNS FROM accounts_receivable_entries')->fetchAll(), 'Field');
        if (in_array('journal_lines', $receivableColumns, true)) {
            foreach ($pdo->query('SELECT journal_lines FROM accounts_receivable_entries WHERE journal_lines IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN) as $storedLines) {
                $storedJournalLines = json_decode((string) $storedLines, true);
                foreach (is_array($storedJournalLines) ? $storedJournalLines : [] as $line) {
                    if (!empty($line['coaId'])) $usedCoaIds[(string) $line['coaId']] = true;
                }
            }
        }
    }
    if (tableColumns($pdo, 'accounting_journal_lines') !== null) {
        foreach ($pdo->query('SELECT DISTINCT coa_id FROM accounting_journal_lines')->fetchAll(PDO::FETCH_COLUMN) as $accountId) {
            if ($accountId !== null && $accountId !== '') $usedCoaIds[(string) $accountId] = true;
        }
    }
    foreach ($newCoaRows as $account) {
        if (!is_array($account)) {
            $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
            jsonResponse(['error' => 'Data Master COA tidak valid.'], 400);
        }
        $id = trim((string) ($account['id'] ?? ''));
        $code = trim((string) ($account['code'] ?? ''));
        $description = trim((string) ($account['accountDesc'] ?? ''));
        $group = trim((string) ($account['accountGroup'] ?? ''));
        if ($id === '' || strlen($id) > 16 || $code === '' || strlen($code) > 20
            || !preg_match('/^[A-Za-z0-9._-]+$/', $code)
            || $description === '' || strlen($description) > 250
            || $group === '' || strlen($group) > 80
            || !is_bool($account['isActive'] ?? null)
            || isset($newCoaById[$id])) {
            $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
            jsonResponse(['error' => 'Kode, nama akun, kelompok, atau status COA tidak valid.'], 400);
        }
        $newCoaById[$id] = $account;
    }
    if (array_diff_key($oldCoaById, $newCoaById)) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => 'COA tidak dapat dihapus. Nonaktifkan akun yang tidak digunakan agar riwayat tetap terjaga.'], 403);
    }
    if ($newCoaRows !== ($before['chartOfAccounts'] ?? []) && ($actor['role'] ?? '') !== 'ADMIN') {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => 'Hanya Admin yang dapat mengelola Master COA.'], 403);
    }
    foreach ($newCoaById as $id => $account) {
        $oldAccount = $oldCoaById[$id] ?? null;
        $code = strtolower(trim((string) $account['code']));
        $description = strtolower(trim((string) $account['accountDesc']));
        foreach ($newCoaById as $otherId => $otherAccount) {
            if ($otherId !== $id
                && strtolower(trim((string) ($otherAccount['code'] ?? ''))) === $code
                && strtolower(trim((string) ($otherAccount['accountDesc'] ?? ''))) === $description) {
                $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
                jsonResponse(['error' => 'Pasangan kode dan nama akun COA harus unik.'], 409);
            }
        }
        if ($oldAccount === null || strtolower((string) ($oldAccount['code'] ?? '')) !== $code) {
            foreach ($newCoaById as $otherId => $otherAccount) {
                if ($otherId !== $id && strtolower(trim((string) ($otherAccount['code'] ?? ''))) === $code) {
                    $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
                    jsonResponse(['error' => 'Kode COA sudah digunakan. Kode akun baru harus unik.'], 409);
                }
            }
        }
        if ($oldAccount !== null) {
            $groupChanged = strtolower(trim((string) ($oldAccount['accountGroup'] ?? '')))
                !== strtolower(trim((string) ($account['accountGroup'] ?? '')));
            $deactivated = !empty($oldAccount['isActive']) && empty($account['isActive']);
            if (($groupChanged || $deactivated) && isset($usedCoaIds[$id])) {
                $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
                jsonResponse(['error' => 'Kelompok dan status COA yang sudah digunakan pada rekening/transaksi tidak dapat diubah. Kode COA boleh diganti selama kelompok tetap sama.'], 409);
            }
        }
    }
    $state['chartOfAccounts'] = array_values($newCoaRows);
    $activeCoaIds = array_fill_keys(array_column(
        array_values(array_filter($before['chartOfAccounts'] ?? [], static fn (array $account): bool => !empty($account['isActive']))),
        'id',
    ), true);
    $activeCoaGroups = [];
    foreach ($before['chartOfAccounts'] ?? [] as $account) {
        if (!empty($account['isActive'])) {
            $activeCoaGroups[(string) ($account['id'] ?? '')] = (string) ($account['accountGroup'] ?? '');
        }
    }
    $bankAccountsById = [];
    foreach ($state['bankAccounts'] ?? [] as $account) {
        if (isset($account['id'])) $bankAccountsById[(string) $account['id']] = $account;
        $coaId = (string) ($account['coaId'] ?? '');
        if ($coaId !== '' && !isset($activeCoaIds[$coaId])) {
            $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
            jsonResponse(['error' => 'COA rekening bank tidak ditemukan atau tidak aktif. Pilih COA Asset yang berlaku.'], 400);
        }
    }
    $oldPaymentVouchers = [];
    foreach ($before['paymentVouchers'] ?? [] as $voucher) {
        if (isset($voucher['id'])) $oldPaymentVouchers[(string) $voucher['id']] = $voucher;
    }
    foreach ($state['paymentVouchers'] ?? [] as $voucher) {
        $voucherId = (string) ($voucher['id'] ?? '');
        $oldVoucher = $oldPaymentVouchers[$voucherId] ?? [];
        $newlyPaid = ($voucher['status'] ?? '') === 'PAID' && ($oldVoucher['status'] ?? '') !== 'PAID';
        if ($newlyPaid) {
            if (($voucher['currency'] ?? 'IDR') === 'USD' && (float) ($voucher['exchangeRateUSDToIDR'] ?? 0) <= 0) {
                $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
                jsonResponse(['error' => 'Kurs USD/IDR wajib tersedia untuk pembayaran voucher USD.'], 400);
            }
        }
        if (($oldVoucher['status'] ?? '') === 'PAID' && ($voucher['status'] ?? '') === 'PAID') {
            if (json_encode($oldVoucher['paymentJournalLines'] ?? []) !== json_encode($voucher['paymentJournalLines'] ?? [])) {
                $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
                jsonResponse(['error' => 'Jurnal yang sudah diposting tidak dapat diubah. Gunakan alur koreksi Finance.'], 403);
            }
            $oldItemsById = [];
            foreach ($oldVoucher['items'] ?? [] as $oldItem) {
                if (!empty($oldItem['coaId'])) $oldItemsById[(string) ($oldItem['id'] ?? '')] = (string) $oldItem['coaId'];
            }
            foreach ($voucher['items'] ?? [] as $item) {
                $itemId = (string) ($item['id'] ?? '');
                if (isset($oldItemsById[$itemId]) && $oldItemsById[$itemId] !== (string) ($item['coaId'] ?? '')) {
                    $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
                    jsonResponse(['error' => 'COA pada voucher yang sudah dibayar tidak dapat diubah. Gunakan alur koreksi voucher jika perlu.'], 403);
                }
            }
            $newItemIds = array_fill_keys(array_map(static fn (array $item): string => (string) ($item['id'] ?? ''), $voucher['items'] ?? []), true);
            foreach (array_keys($oldItemsById) as $oldItemId) {
                if (!isset($newItemIds[$oldItemId])) {
                    $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
                    jsonResponse(['error' => 'Rincian ber-COA pada voucher yang sudah dibayar tidak dapat dihapus. Gunakan alur koreksi voucher jika perlu.'], 403);
                }
            }
            foreach (['paymentSurchargeCoaId', 'paymentOtherExpensesCoaId'] as $coaField) {
                if (!empty($oldVoucher[$coaField]) && (string) $oldVoucher[$coaField] !== (string) ($voucher[$coaField] ?? '')) {
                    $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
                    jsonResponse(['error' => 'COA biaya pada voucher yang sudah dibayar tidak dapat diubah. Gunakan alur koreksi voucher jika perlu.'], 403);
                }
            }
        }
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
    $bankBranchError = validateBankAccountBranches($state, $before);
    if ($bankBranchError !== null) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => $bankBranchError], 400);
    }
    $userBranchError = validateUserBranches($state, $before);
    if ($userBranchError !== null) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => $userBranchError], 400);
    }
    $paymentVoucherBranchError = validatePaymentVoucherBranches($state, $before, $actor);
    if ($paymentVoucherBranchError !== null) {
        $pdo->query("SELECT RELEASE_LOCK('maritimport_app_state')");
        jsonResponse(['error' => $paymentVoucherBranchError], 403);
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
            $jobBranch = branchNameKey((string) ($oldJob['inquiry']['createdByBranch'] ?? ''));
            $actorBranch = branchNameKey((string) ($actor['branch_name'] ?? $actor['branch'] ?? ''));
            $jobBranchId = branchIdKey((string) ($oldJob['inquiry']['createdByBranchId'] ?? ''));
            $actorBranchId = branchIdKey((string) ($actor['branch_id'] ?? ''));
            if ($actorBranch !== '' && $jobBranch !== '' && $jobBranch !== $actorBranch
                && in_array($actor['role'], ['SALES', 'MANAGER_OPS', 'FDA', 'FINANCE'], true)
                && json_encode($oldJob) !== json_encode($newJob)) {
                jsonResponse(['error' => 'Job hanya dapat diproses oleh user pada branch pemiliknya'], 403);
            }
            if ($actorBranchId !== '' && $jobBranchId !== '' && $jobBranchId !== $actorBranchId
                && in_array($actor['role'], ['SALES', 'MANAGER_OPS', 'FDA', 'FINANCE'], true)
                && json_encode($oldJob) !== json_encode($newJob)) {
                jsonResponse(['error' => 'Job hanya dapat diproses oleh user pada branch pemiliknya'], 403);
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
                    && (branchIdKey((string) ($oldJob['inquiry']['createdByBranchId'] ?? '')) === ''
                        || branchIdKey((string) ($oldJob['inquiry']['createdByBranchId'] ?? '')) === branchIdKey((string) ($actor['branch_id'] ?? '')))
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
                    if (branchNameKey((string) ($newJob['inquiry']['createdByBranch'] ?? '')) !== branchNameKey((string) ($actor['branch_name'] ?? $actor['branch'] ?? ''))
                        || branchIdKey((string) ($newJob['inquiry']['createdByBranchId'] ?? '')) !== branchIdKey((string) ($actor['branch_id'] ?? ''))) {
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