<?php

declare(strict_types=1);

require_once __DIR__ . '/repository.php';

function allocateReceivableVoucherNumber(PDO $pdo, int $branchId, string $incomeDate): string
{
    if (!preg_match('/^(\d{4})-(\d{2})-\d{2}$/', $incomeDate, $dateParts)) {
        throw new RuntimeException('Tanggal penerimaan tidak valid untuk membuat nomor bukti.');
    }
    $yearMonth = $dateParts[1] . $dateParts[2];
    $branchQuery = $pdo->prepare('SELECT code FROM branches WHERE id = :id AND is_active = 1 LIMIT 1');
    $branchQuery->execute(['id' => $branchId]);
    $branchCode = strtoupper(trim((string) $branchQuery->fetchColumn()));
    if (!preg_match('/^[A-Z0-9]{2,10}$/', $branchCode)) {
        throw new RuntimeException('Branch penerimaan belum memiliki kode branch aktif.');
    }

    $insert = $pdo->prepare(
        'INSERT IGNORE INTO receivable_voucher_sequences (branch_code, period_key, last_number) '
        . 'VALUES (:branch_code, :year_month, 0)'
    );
    $insert->execute(['branch_code' => $branchCode, 'year_month' => $yearMonth]);
    $select = $pdo->prepare(
        'SELECT last_number FROM receivable_voucher_sequences '
        . 'WHERE branch_code = :branch_code AND period_key = :period_key FOR UPDATE'
    );
    $select->execute(['branch_code' => $branchCode, 'period_key' => $yearMonth]);
    $nextNumber = (int) $select->fetchColumn() + 1;
    $update = $pdo->prepare(
        'UPDATE receivable_voucher_sequences SET last_number = :last_number '
        . 'WHERE branch_code = :branch_code AND period_key = :period_key'
    );
    $update->execute([
        'last_number' => $nextNumber,
        'branch_code' => $branchCode,
        'period_key' => $yearMonth,
    ]);
    $monthYear = $dateParts[2] . substr($dateParts[1], 2, 2);
    return sprintf('RV%s-%04d-%s', $branchCode, $nextNumber, $monthYear);
}

try {
    $user = requireAuthenticatedUser();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $pdo = db();

    if ($method === 'GET') {
        requireMethod('GET');
        $action = (string) ($_GET['action'] ?? 'options');
        if (($user['role'] ?? '') === 'FDA') {
            if ($action !== 'fda-advance-history') jsonResponse(['error' => 'FDA hanya dapat melihat riwayat penerimaan job pada branch-nya'], 403);
            $branchName = trim((string) ($user['branch_name'] ?? ''));
            $branchId = trim((string) ($user['branch_id'] ?? ''));
            if ($branchId === '') jsonResponse(['error' => 'Branch aktif user FDA belum valid'], 422);
            $jobId = trim((string) ($_GET['jobId'] ?? ''));
            $historyColumns = array_column($pdo->query('SHOW COLUMNS FROM accounts_receivable_entries')->fetchAll(), 'Field');
            $exchangeRateSelect = in_array('exchange_rate_usd_to_idr', $historyColumns, true)
                ? 'ar.exchange_rate_usd_to_idr'
                : "CASE WHEN ar.invoice_type = 'FPDA' THEN COALESCE(NULLIF(pd.exchange_rate, 0), vc.exchange_rate_usd_to_idr, 0) "
                    . 'ELSE COALESCE(f.exchange_rate_usd_to_idr, vc.exchange_rate_usd_to_idr, 0) END';
            $sql = 'SELECT ar.id, ar.job_id, ar.invoice_type, ar.payment_type, ar.invoice_no, ar.income_date, ar.principal_name, ar.vessel_name, '
                . $exchangeRateSelect . ' AS exchange_rate_usd_to_idr, '
                . 'ar.remark, ar.bank_name, ar.idr_amount, ar.usd_amount, ar.created_by_name, ar.created_at '
                . 'FROM accounts_receivable_entries ar '
                . 'INNER JOIN inquiries i ON i.job_id = ar.job_id '
                . 'LEFT JOIN vessel_calls vc ON vc.job_id = ar.job_id '
                . 'LEFT JOIN fda_records f ON f.job_id = ar.job_id '
                . "LEFT JOIN pda_documents pd ON pd.job_id = ar.job_id AND pd.pda_no = ar.invoice_no AND pd.pda_type = 'FDA' "
                . "WHERE ar.subject_data = 'PRINCIPAL' AND ar.job_id IS NOT NULL "
                . 'AND i.created_by_branch_id = :branch_id';
            $params = ['branch_id' => $branchId];
            if ($jobId !== '') {
                $sql .= ' AND ar.job_id = :job_id';
                $params['job_id'] = $jobId;
            }
            $sql .= ' ORDER BY ar.income_date DESC, ar.created_at DESC';
            $query = $pdo->prepare($sql);
            $query->execute($params);
            $entries = array_map(static fn (array $row): array => [
                'id' => $row['id'],
                'jobId' => $row['job_id'],
                'invoiceType' => $row['invoice_type'],
                'paymentType' => $row['payment_type'],
                'invoiceNo' => $row['invoice_no'],
                'incomeDate' => (string) $row['income_date'],
                'principalName' => $row['principal_name'] ?? '',
                'vesselName' => $row['vessel_name'] ?? '',
                'remark' => $row['remark'],
                'bankName' => $row['bank_name'],
                'idrAmount' => (float) $row['idr_amount'],
                'usdAmount' => (float) $row['usd_amount'],
                'exchangeRateUSDToIDR' => (float) $row['exchange_rate_usd_to_idr'],
                'createdBy' => $row['created_by_name'],
                'createdAt' => $row['created_at'],
            ], $query->fetchAll());
            jsonResponse(['entries' => $entries]);
        }
        $accountingHistory = $action === 'accounting-history' && ($user['role'] ?? '') === 'ACCOUNTING';
        if (!$accountingHistory && ($user['role'] ?? '') !== 'FINANCE') jsonResponse(['error' => 'Only Finance can access Accounts Receivable'], 403);
        $branchName = trim((string) ($user['branch_name'] ?? ''));
        $branchId = $accountingHistory
            ? trim((string) ($_GET['branchId'] ?? ''))
            : trim((string) ($user['branch_id'] ?? ''));
        if (!$accountingHistory && $branchId === '') jsonResponse(['error' => 'Branch aktif Finance belum valid'], 422);
        if ($accountingHistory && $branchId !== '') {
            if (!ctype_digit($branchId)) jsonResponse(['error' => 'Branch laporan tidak valid'], 422);
            $branchQuery = $pdo->prepare('SELECT id FROM branches WHERE id = :id AND is_active = 1 LIMIT 1');
            $branchQuery->execute(['id' => $branchId]);
            if (!$branchQuery->fetchColumn()) jsonResponse(['error' => 'Branch laporan tidak ditemukan atau tidak aktif'], 422);
        }
        $financeColumns = array_column($pdo->query('SHOW COLUMNS FROM accounts_receivable_entries')->fetchAll(), 'Field');
        $bankColumns = array_column($pdo->query('SHOW COLUMNS FROM bank_accounts')->fetchAll(), 'Field');
        if (!in_array('branch_id', $financeColumns, true) || !in_array('branch_id', $bankColumns, true)) {
            jsonResponse(['error' => 'Terapkan migrasi branch finance dan branch master terlebih dahulu'], 503);
        }
        if (!in_array('currency', $bankColumns, true)) {
            jsonResponse(['error' => 'Terapkan migrasi mata uang rekening bank terlebih dahulu'], 503);
        }
        if ($action === 'attachment') {
            $attachmentId = trim((string) ($_GET['id'] ?? ''));
            if ($attachmentId === '') jsonResponse(['error' => 'Attachment ID is required'], 400);
            $attachmentQuery = $pdo->prepare(
                'SELECT ar.attachment_name, ar.attachment_data_url FROM accounts_receivable_entries ar '
                . 'LEFT JOIN bank_accounts ba ON ba.id = ar.bank_account_id '
                . "WHERE ar.id = :id AND COALESCE(ar.branch_id, ba.branch_id) = :branch_id LIMIT 1"
            );
            $attachmentQuery->execute(['id' => $attachmentId, 'branch_id' => $branchId]);
            $attachment = $attachmentQuery->fetch();
            if (!$attachment) jsonResponse(['error' => 'Attachment not found'], 404);
            if (!preg_match('/^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/]+={0,2})$/D', (string) $attachment['attachment_data_url'], $attachmentMatch)) {
                jsonResponse(['error' => 'Stored attachment is invalid'], 500);
            }
            $attachmentBytes = base64_decode($attachmentMatch[2], true);
            $attachmentInfo = $attachmentBytes === false ? false : @getimagesizefromstring($attachmentBytes);
            $contentType = 'image/' . $attachmentMatch[1];
            if ($attachmentBytes === false || $attachmentInfo === false || ($attachmentInfo['mime'] ?? '') !== $contentType) {
                jsonResponse(['error' => 'Stored attachment is invalid'], 500);
            }
            $filename = basename((string) $attachment['attachment_name']);
            header('Content-Type: ' . $contentType);
            header('Content-Length: ' . strlen($attachmentBytes));
            header('Content-Disposition: attachment; filename="receivable-proof.' . ($attachmentMatch[1] === 'jpeg' ? 'jpg' : 'png') . '"; filename*=UTF-8\'\'' . rawurlencode($filename));
            header('Cache-Control: private, no-store');
            header('X-Content-Type-Options: nosniff');
            echo $attachmentBytes;
            exit;
        }
        if ($action === 'history' || $accountingHistory) {
            $historyColumns = array_column($pdo->query('SHOW COLUMNS FROM accounts_receivable_entries')->fetchAll(), 'Field');
            $coaSelect = in_array('coa_id', $historyColumns, true) ? 'ar.coa_id' : "''";
            $receiptNumberSelect = in_array('receipt_number', $historyColumns, true) ? 'ar.receipt_number' : "''";
            $journalLinesSelect = in_array('journal_lines', $historyColumns, true) ? 'ar.journal_lines' : 'NULL';
            $journalNumberSelect = in_array('journal_number', $historyColumns, true) ? 'ar.journal_number' : "''";
            $exchangeRateSelect = in_array('exchange_rate_usd_to_idr', $historyColumns, true)
                ? 'ar.exchange_rate_usd_to_idr'
                : "CASE WHEN ar.invoice_type = 'FPDA' THEN COALESCE(NULLIF(pd.exchange_rate, 0), vc.exchange_rate_usd_to_idr, 0) "
                    . 'ELSE COALESCE(f.exchange_rate_usd_to_idr, vc.exchange_rate_usd_to_idr, 0) END';
            $branchCondition = $branchId !== '' ? 'WHERE COALESCE(ar.branch_id, ba.branch_id) = :branch_id ' : '';
            $historyQuery = $pdo->prepare(
                'SELECT ar.id, ' . $receiptNumberSelect . ' AS receipt_number, ' . $journalNumberSelect . ' AS journal_number, COALESCE(NULLIF(ar.branch_name, \'\'), ba.branch_name, \'\') AS branch_name, COALESCE(ar.branch_id, ba.branch_id) AS branch_id, ar.subject_data, ar.job_id, ar.invoice_type, ar.invoice_no, ar.income_date, ar.principal_name, ar.vessel_name, '
                . 'ar.payment_type, ar.pph23_amount_idr, ' . $coaSelect . ' AS coa_id, ' . $journalLinesSelect . ' AS journal_lines, ar.remark, ar.bank_account_id, ar.bank_name, ar.account_name, ar.account_number, '
                . 'ar.idr_amount, ar.usd_amount, ' . $exchangeRateSelect . ' AS exchange_rate_usd_to_idr, '
                . 'ar.attachment_name, ar.created_by_name, ar.created_at '
                . 'FROM accounts_receivable_entries ar '
                . 'LEFT JOIN bank_accounts ba ON ba.id = ar.bank_account_id '
                . 'LEFT JOIN vessel_calls vc ON vc.job_id = ar.job_id '
                . 'LEFT JOIN fda_records f ON f.job_id = ar.job_id '
                . "LEFT JOIN pda_documents pd ON pd.job_id = ar.job_id AND pd.pda_no = ar.invoice_no AND pd.pda_type = 'FDA' "
                . $branchCondition
                . 'ORDER BY ar.income_date DESC, ar.created_at DESC'
            );
            $historyQuery->execute($branchId !== '' ? ['branch_id' => $branchId] : []);
            $rows = $historyQuery->fetchAll();
            $entries = array_map(static function (array $row): array {
                $journalLines = json_decode((string) ($row['journal_lines'] ?? ''), true);
                return [
                'id' => $row['id'],
                'receiptNumber' => $row['receipt_number'] ?? '',
                'journalNumber' => $row['journal_number'] ?? '',
                'branchName' => $row['branch_name'] ?? '',
                'branchId' => isset($row['branch_id']) ? str_pad((string) $row['branch_id'], 3, '0', STR_PAD_LEFT) : '',
                'subjectData' => $row['subject_data'],
                'jobId' => $row['job_id'],
                'invoiceType' => $row['invoice_type'],
                'paymentType' => $row['payment_type'],
                'invoiceNo' => $row['invoice_no'],
                'incomeDate' => (string) $row['income_date'],
                'principalName' => $row['principal_name'],
                'vesselName' => $row['vessel_name'],
                'pph23AmountIDR' => (float) $row['pph23_amount_idr'],
                'coaId' => $row['coa_id'] ?? '',
                'journalLines' => is_array($journalLines) ? $journalLines : [],
                'remark' => $row['remark'],
                'bankAccountId' => $row['bank_account_id'] ?? '',
                'bankName' => $row['bank_name'],
                'accountName' => $row['account_name'],
                'accountNumber' => $row['account_number'],
                'idrAmount' => (float) $row['idr_amount'],
                'usdAmount' => (float) $row['usd_amount'],
                'exchangeRateUSDToIDR' => (float) $row['exchange_rate_usd_to_idr'],
                'attachmentName' => $row['attachment_name'],
                'createdBy' => $row['created_by_name'],
                'createdAt' => $row['created_at'],
                ];
            }, $rows);
            jsonResponse(['entries' => $entries]);
        }
        if ($action !== 'options') jsonResponse(['error' => 'Unknown Accounts Receivable action'], 404);

        $invoiceQuery = $pdo->prepare(
            "SELECT vc.job_id AS job_id, 'FDA' AS invoice_type, f.fda_no AS invoice_no, "
            . 'c.company_name AS principal_name, v.name AS vessel_name, '
            . 'COALESCE(f.currency, vc.currency) AS currency, '
            . 'COALESCE(f.exchange_rate_usd_to_idr, vc.exchange_rate_usd_to_idr, 0) AS exchange_rate, '
            . 'CASE WHEN f.fda_approved = 1 OR f.approval_status = \'APPROVED\' THEN 1 ELSE 0 END AS fda_approved '
            . 'FROM vessel_calls vc '
            . 'INNER JOIN inquiries i ON i.job_id = vc.job_id '
            . 'INNER JOIN customers c ON c.id = vc.customer_id '
            . 'INNER JOIN vessels v ON v.id = vc.vessel_id '
            . 'INNER JOIN fda_records f ON f.job_id = vc.job_id '
            . 'LEFT JOIN closing_records cr ON cr.job_id = vc.job_id '
            . "WHERE f.fda_no <> '' AND i.created_by_branch_id = :sales_branch_id AND vc.status <> 'CLOSED' AND vc.current_stage <> 'CLOSED' AND COALESCE(cr.is_closed, 0) = 0 "
            . 'UNION ALL '
            . "SELECT vc.job_id AS job_id, 'FPDA' AS invoice_type, pd.pda_no AS invoice_no, "
            . 'c.company_name AS principal_name, v.name AS vessel_name, pd.currency, pd.exchange_rate, 0 AS fda_approved '
            . 'FROM vessel_calls vc '
            . 'INNER JOIN inquiries i ON i.job_id = vc.job_id '
            . 'INNER JOIN customers c ON c.id = vc.customer_id '
            . 'INNER JOIN vessels v ON v.id = vc.vessel_id '
            . "INNER JOIN pda_documents pd ON pd.job_id = vc.job_id AND pd.pda_type = 'FDA' "
            . 'LEFT JOIN closing_records cr ON cr.job_id = vc.job_id '
            . "WHERE pd.pda_no <> '' AND i.created_by_branch_id = :fda_branch_id AND vc.status <> 'CLOSED' AND vc.current_stage <> 'CLOSED' AND COALESCE(cr.is_closed, 0) = 0 "
            . 'ORDER BY principal_name, vessel_name, job_id, invoice_type, invoice_no'
        );
        $invoiceQuery->execute(['sales_branch_id' => $branchId, 'fda_branch_id' => $branchId]);
        $invoiceOptions = $invoiceQuery->fetchAll();
        $bankQuery = $pdo->prepare('SELECT id, bank_name, branch, branch_name, branch_id, account_name, account_number, currency FROM bank_accounts WHERE branch_id = :branch_id ORDER BY bank_name, account_name');
        $bankQuery->execute(['branch_id' => $branchId]);
        $banks = $bankQuery->fetchAll();
        jsonResponse([
            'invoiceOptions' => array_map(static fn (array $row): array => [
                'jobId' => $row['job_id'],
                'invoiceType' => $row['invoice_type'],
                'invoiceNo' => $row['invoice_no'],
                'principalName' => $row['principal_name'],
                'vesselName' => $row['vessel_name'],
                'currency' => $row['currency'],
                'exchangeRate' => (float) $row['exchange_rate'],
                'fdaApproved' => (bool) $row['fda_approved'],
            ], $invoiceOptions),
            'bankAccounts' => array_map(static fn (array $row): array => [
                'id' => $row['id'],
                'bankName' => $row['bank_name'],
                'branch' => $row['branch'] ?? '',
                'branchName' => $row['branch_name'] ?? '',
                'branchId' => isset($row['branch_id']) ? str_pad((string) $row['branch_id'], 3, '0', STR_PAD_LEFT) : '',
                'accountName' => $row['account_name'],
                'accountNumber' => $row['account_number'],
                'currency' => $row['currency'],
                'coaId' => $row['coa_id'] ?? '',
            ], $banks),
        ]);
    }

    if (($user['role'] ?? '') !== 'FINANCE') jsonResponse(['error' => 'Only Finance can create Accounts Receivable entries'], 403);
    $branchName = trim((string) ($user['branch_name'] ?? ''));
    $branchId = trim((string) ($user['branch_id'] ?? ''));
    if ($branchId === '') jsonResponse(['error' => 'Branch aktif Finance belum valid'], 422);
    $financeColumns = array_column($pdo->query('SHOW COLUMNS FROM accounts_receivable_entries')->fetchAll(), 'Field');
    $bankColumns = array_column($pdo->query('SHOW COLUMNS FROM bank_accounts')->fetchAll(), 'Field');
    if (!in_array('branch_id', $financeColumns, true) || !in_array('branch_id', $bankColumns, true)) {
        jsonResponse(['error' => 'Terapkan migrasi branch finance dan branch master terlebih dahulu'], 503);
    }
    requireMethod('POST');
    requireCsrfToken();
    $body = requestJson();
    $subjectData = (string) ($body['subjectData'] ?? 'PRINCIPAL');
    $jobId = trim((string) ($body['jobId'] ?? ''));
    $invoiceType = (string) ($body['invoiceType'] ?? '');
    $paymentType = (string) ($body['paymentType'] ?? '');
    $invoiceNo = trim((string) ($body['invoiceNo'] ?? ''));
    $incomeDate = (string) ($body['incomeDate'] ?? '');
    $bankAccountId = trim((string) ($body['bankAccountId'] ?? ''));
    $remark = trim((string) ($body['remark'] ?? ''));
    $idrAmount = $body['idrAmount'] ?? 0;
    $usdAmount = $body['usdAmount'] ?? 0;
    $attachmentName = trim((string) ($body['attachmentName'] ?? ''));
    $attachmentDataUrl = (string) ($body['attachmentDataUrl'] ?? '');

    if (!in_array($subjectData, ['OPERATIONAL', 'PRINCIPAL'], true)
        || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $incomeDate)
        || !checkdate((int) substr($incomeDate, 5, 2), (int) substr($incomeDate, 8, 2), (int) substr($incomeDate, 0, 4))
        || $bankAccountId === '' || $remark === '' || strlen($remark) > 5000
        || $attachmentName === '' || strlen($attachmentName) > 255
        || !preg_match('/^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/]+={0,2})$/D', $attachmentDataUrl, $attachmentMatch)) {
        jsonResponse(['error' => 'Data Accounts Receivable belum lengkap atau tidak valid'], 400);
    }
    if ($subjectData === 'PRINCIPAL' && ($jobId === '' || strlen($jobId) > 50
        || !in_array($invoiceType, ['FDA', 'FPDA'], true)
        || ($invoiceType === 'FPDA' && !in_array($paymentType, ['ADVANCE_PAYMENT', 'INVOICE'], true))
        || $invoiceNo === '' || strlen($invoiceNo) > 180)) {
        jsonResponse(['error' => 'Principal, Vessel, dan Invoice wajib dipilih untuk Subject Data Principal'], 400);
    }
    $attachmentBytes = base64_decode($attachmentMatch[2], true);
    $attachmentInfo = $attachmentBytes === false ? false : getimagesizefromstring($attachmentBytes);
    $expectedMime = 'image/' . $attachmentMatch[1];
    if ($attachmentBytes === false || strlen($attachmentBytes) > 1024 * 1024
        || $attachmentInfo === false || ($attachmentInfo['mime'] ?? '') !== $expectedMime) {
        jsonResponse(['error' => 'Photo bukti kas harus berupa JPG atau PNG maksimal 1 MB'], 400);
    }
    foreach ([$idrAmount, $usdAmount] as $amount) {
        if (!is_numeric($amount) || !is_finite((float) $amount) || (float) $amount < 0) {
            jsonResponse(['error' => 'Nominal Amount harus berupa angka nol atau lebih'], 400);
        }
    }
    $idrAmount = round((float) $idrAmount, 2);
    $usdAmount = round((float) $usdAmount, 2);
    if ($idrAmount <= 0 && $usdAmount <= 0) jsonResponse(['error' => 'Isi IDR Amount atau USD Amount'], 400);
    $exchangeRate = $body['exchangeRateUSDToIDR'] ?? 0;
    if ($subjectData === 'OPERATIONAL' && $usdAmount > 0 && (!is_numeric($exchangeRate) || !is_finite((float) $exchangeRate) || (float) $exchangeRate <= 0)) {
        jsonResponse(['error' => 'Kurs transaksi USD/IDR terbaru harus diisi'], 400);
    }
    $exchangeRate = is_numeric($exchangeRate) && (float) $exchangeRate > 0 ? round((float) $exchangeRate, 12) : 0;

    $invoice = ['principal_name' => null, 'vessel_name' => null, 'exchange_rate' => 0];
    if ($subjectData === 'PRINCIPAL') {
        if ($invoiceType === 'FDA') {
            $invoiceQuery = $pdo->prepare(
                "SELECT vc.job_id, f.fda_no AS invoice_no, c.company_name AS principal_name, v.name AS vessel_name, COALESCE(f.exchange_rate_usd_to_idr, vc.exchange_rate_usd_to_idr, 0) AS exchange_rate, CASE WHEN f.fda_approved = 1 OR f.approval_status = 'APPROVED' THEN 1 ELSE 0 END AS fda_approved "
                . 'FROM vessel_calls vc INNER JOIN inquiries i ON i.job_id = vc.job_id INNER JOIN fda_records f ON f.job_id = vc.job_id '
                . 'INNER JOIN customers c ON c.id = vc.customer_id INNER JOIN vessels v ON v.id = vc.vessel_id '
                . 'LEFT JOIN closing_records cr ON cr.job_id = vc.job_id '
                . "WHERE vc.job_id = :job_id AND f.fda_no = :invoice_no AND i.created_by_branch_id = :branch_id AND vc.status <> 'CLOSED' AND vc.current_stage <> 'CLOSED' AND COALESCE(cr.is_closed, 0) = 0 LIMIT 1"
            );
        } else {
            $invoiceQuery = $pdo->prepare(
                "SELECT vc.job_id, pd.pda_no AS invoice_no, c.company_name AS principal_name, v.name AS vessel_name, pd.exchange_rate AS exchange_rate "
                . 'FROM vessel_calls vc INNER JOIN inquiries i ON i.job_id = vc.job_id INNER JOIN pda_documents pd ON pd.job_id = vc.job_id AND pd.pda_type = \'FDA\' '
                . 'INNER JOIN customers c ON c.id = vc.customer_id INNER JOIN vessels v ON v.id = vc.vessel_id '
                . 'LEFT JOIN closing_records cr ON cr.job_id = vc.job_id '
                . "WHERE vc.job_id = :job_id AND pd.pda_no = :invoice_no AND i.created_by_branch_id = :branch_id AND vc.status <> 'CLOSED' AND vc.current_stage <> 'CLOSED' AND COALESCE(cr.is_closed, 0) = 0 LIMIT 1"
            );
        }
        $invoiceQuery->execute(['job_id' => $jobId, 'invoice_no' => $invoiceNo, 'branch_id' => $branchId]);
        $invoice = $invoiceQuery->fetch();
        if (!$invoice) jsonResponse(['error' => 'Invoice FDA/FPDA tidak ditemukan atau Job sudah ditutup'], 409);
        $exchangeRate = (float) ($invoice['exchange_rate'] ?? 0);
        if ($invoiceType === 'FDA') {
            $paymentType = !empty($invoice['fda_approved']) ? 'INVOICE' : 'ADVANCE_PAYMENT';
        }
        if ($usdAmount > 0 && (!is_finite($exchangeRate) || $exchangeRate <= 0)) {
            jsonResponse(['error' => 'Kurs pada invoice FDA/FPDA belum valid untuk penerimaan USD'], 409);
        }
    } else {
        $jobId = null;
        $invoiceType = null;
        $invoiceNo = null;
    }

    $bankQuery = $pdo->prepare('SELECT bank_name, account_name, account_number, branch_name, branch_id FROM bank_accounts WHERE id = :id LIMIT 1');
    $bankQuery->execute(['id' => $bankAccountId]);
    $bank = $bankQuery->fetch();
    if (!$bank) jsonResponse(['error' => 'Akun bank tujuan tidak ditemukan'], 409);
    if (trim((string) $bank['branch_id']) !== $branchId) {
        jsonResponse(['error' => 'Rekening bank hanya dapat digunakan oleh branch pemiliknya'], 403);
    }
    $insertValues = [
        'id' => 'AR-' . bin2hex(random_bytes(16)),
        'branch_name' => $branchName,
        'branch_id' => $branchId,
        'subject_data' => $subjectData,
        'job_id' => $jobId,
        'invoice_type' => $invoiceType,
        'payment_type' => $subjectData === 'PRINCIPAL' ? $paymentType : 'INVOICE',
        'invoice_no' => $invoiceNo,
        'income_date' => $incomeDate,
        'principal_name' => $invoice['principal_name'],
        'vessel_name' => $invoice['vessel_name'],
        'pph23_amount_idr' => 0,
        'remark' => $remark,
        'bank_account_id' => $bankAccountId,
        'bank_name' => $bank['bank_name'],
        'account_name' => $bank['account_name'],
        'account_number' => $bank['account_number'],
        'idr_amount' => $idrAmount,
        'usd_amount' => $usdAmount,
        'attachment_name' => basename($attachmentName),
        'attachment_data_url' => $attachmentDataUrl,
        'created_by_user_id' => $user['id'] ?? null,
        'created_by_name' => $user['name'] ?? $user['username'] ?? 'Finance',
    ];
    $receivableColumns = array_column($pdo->query('SHOW COLUMNS FROM accounts_receivable_entries')->fetchAll(), 'Field');
    if (!in_array('branch_name', $receivableColumns, true) || !in_array('branch_id', $receivableColumns, true)) {
        jsonResponse(['error' => 'Terapkan migrasi branch Finance dan branch master sebelum mencatat penerimaan'], 503);
    }
    if (!in_array('receipt_number', $receivableColumns, true) || tableColumns($pdo, 'receivable_voucher_sequences') === null) {
        jsonResponse(['error' => 'Terapkan database/migrations/20261030_add_receivable_voucher_numbers.sql sebelum mencatat penerimaan.'], 503);
    }
    if ($usdAmount > 0 && !in_array('exchange_rate_usd_to_idr', $receivableColumns, true)) {
        jsonResponse(['error' => 'Jalankan migrasi kurs Accounts Receivable sebelum mencatat penerimaan USD'], 503);
    }
    if (in_array('exchange_rate_usd_to_idr', $receivableColumns, true)) {
        $insertValues['exchange_rate_usd_to_idr'] = $exchangeRate;
    }
    $pdo->beginTransaction();
    try {
        $receiptNumber = allocateReceivableVoucherNumber($pdo, (int) $branchId, $incomeDate);
        $insertValues['receipt_number'] = $receiptNumber;
        $insertValues = array_intersect_key($insertValues, array_flip($receivableColumns));
        $insertColumns = array_keys($insertValues);
        $insert = $pdo->prepare(
            'INSERT INTO accounts_receivable_entries (`' . implode('`, `', $insertColumns) . '`) '
            . 'VALUES (:' . implode(', :', $insertColumns) . ')'
        );
        $insert->execute($insertValues);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    jsonResponse(['ok' => true, 'receiptNumber' => $receiptNumber]);
} catch (PDOException $error) {
    error_log('MaritimPort receivables database error: ' . $error->getMessage());
    jsonResponse(['error' => 'Accounts Receivable database operation failed'], 500);
} catch (Throwable $error) {
    error_log('MaritimPort receivables error: ' . $error->getMessage());
    jsonResponse(['error' => 'Accounts Receivable operation failed'], 500);
}
