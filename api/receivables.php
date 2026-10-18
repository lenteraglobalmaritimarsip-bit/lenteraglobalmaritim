<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

try {
    $user = requireAuthenticatedUser();
    if (($user['role'] ?? '') !== 'FINANCE') jsonResponse(['error' => 'Only Finance can access Accounts Receivable'], 403);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $pdo = db();

    if ($method === 'GET') {
        requireMethod('GET');
        $action = (string) ($_GET['action'] ?? 'options');
        if ($action === 'history') {
            $rows = $pdo->query(
                'SELECT id, job_id, invoice_type, invoice_no, income_date, principal_name, vessel_name, '
                . 'pph23_amount_idr, remark, bank_account_id, bank_name, account_name, account_number, '
                . 'idr_amount, usd_amount, attachment_name, attachment_data_url, created_by_name, created_at '
                . 'FROM accounts_receivable_entries ORDER BY income_date DESC, created_at DESC'
            )->fetchAll();
            $entries = array_map(static fn (array $row): array => [
                'id' => $row['id'],
                'jobId' => $row['job_id'],
                'invoiceType' => $row['invoice_type'],
                'invoiceNo' => $row['invoice_no'],
                'incomeDate' => (string) $row['income_date'],
                'principalName' => $row['principal_name'],
                'vesselName' => $row['vessel_name'],
                'pph23AmountIDR' => (float) $row['pph23_amount_idr'],
                'remark' => $row['remark'],
                'bankAccountId' => $row['bank_account_id'] ?? '',
                'bankName' => $row['bank_name'],
                'accountName' => $row['account_name'],
                'accountNumber' => $row['account_number'],
                'idrAmount' => (float) $row['idr_amount'],
                'usdAmount' => (float) $row['usd_amount'],
                'attachmentName' => $row['attachment_name'],
                'attachmentDataUrl' => $row['attachment_data_url'],
                'createdBy' => $row['created_by_name'],
                'createdAt' => $row['created_at'],
            ], $rows);
            jsonResponse(['entries' => $entries]);
        }
        if ($action !== 'options') jsonResponse(['error' => 'Unknown Accounts Receivable action'], 404);

        $invoiceOptions = $pdo->query(
            "SELECT vc.job_id AS job_id, 'FDA' AS invoice_type, f.fda_no AS invoice_no, "
            . 'c.company_name AS principal_name, v.name AS vessel_name, '
            . 'COALESCE(f.currency, vc.currency) AS currency, '
            . 'COALESCE(f.exchange_rate_usd_to_idr, vc.exchange_rate_usd_to_idr) AS exchange_rate '
            . 'FROM vessel_calls vc '
            . 'INNER JOIN customers c ON c.id = vc.customer_id '
            . 'INNER JOIN vessels v ON v.id = vc.vessel_id '
            . 'INNER JOIN fda_records f ON f.job_id = vc.job_id '
            . 'LEFT JOIN closing_records cr ON cr.job_id = vc.job_id '
            . "WHERE f.fda_no <> '' AND vc.status <> 'CLOSED' AND vc.current_stage <> 'CLOSED' AND COALESCE(cr.is_closed, 0) = 0 "
            . 'UNION ALL '
            . "SELECT vc.job_id AS job_id, 'FPDA' AS invoice_type, pd.pda_no AS invoice_no, "
            . 'c.company_name AS principal_name, v.name AS vessel_name, pd.currency, pd.exchange_rate '
            . 'FROM vessel_calls vc '
            . 'INNER JOIN customers c ON c.id = vc.customer_id '
            . 'INNER JOIN vessels v ON v.id = vc.vessel_id '
            . "INNER JOIN pda_documents pd ON pd.job_id = vc.job_id AND pd.pda_type = 'FDA' "
            . 'LEFT JOIN closing_records cr ON cr.job_id = vc.job_id '
            . "WHERE pd.pda_no <> '' AND vc.status <> 'CLOSED' AND vc.current_stage <> 'CLOSED' AND COALESCE(cr.is_closed, 0) = 0 "
            . 'ORDER BY principal_name, vessel_name, job_id, invoice_type, invoice_no'
        )->fetchAll();
        $banks = $pdo->query('SELECT id, bank_name, branch, account_name, account_number FROM bank_accounts ORDER BY bank_name, account_name')->fetchAll();
        jsonResponse([
            'invoiceOptions' => array_map(static fn (array $row): array => [
                'jobId' => $row['job_id'],
                'invoiceType' => $row['invoice_type'],
                'invoiceNo' => $row['invoice_no'],
                'principalName' => $row['principal_name'],
                'vesselName' => $row['vessel_name'],
                'currency' => $row['currency'],
                'exchangeRate' => (float) $row['exchange_rate'],
            ], $invoiceOptions),
            'bankAccounts' => array_map(static fn (array $row): array => [
                'id' => $row['id'],
                'bankName' => $row['bank_name'],
                'branch' => $row['branch'] ?? '',
                'accountName' => $row['account_name'],
                'accountNumber' => $row['account_number'],
            ], $banks),
        ]);
    }

    requireMethod('POST');
    requireCsrfToken();
    $body = requestJson();
    $jobId = trim((string) ($body['jobId'] ?? ''));
    $invoiceType = (string) ($body['invoiceType'] ?? '');
    $invoiceNo = trim((string) ($body['invoiceNo'] ?? ''));
    $incomeDate = (string) ($body['incomeDate'] ?? '');
    $bankAccountId = trim((string) ($body['bankAccountId'] ?? ''));
    $remark = trim((string) ($body['remark'] ?? ''));
    $pph23 = $body['pph23AmountIDR'] ?? 0;
    $idrAmount = $body['idrAmount'] ?? 0;
    $usdAmount = $body['usdAmount'] ?? 0;
    $attachmentName = trim((string) ($body['attachmentName'] ?? ''));
    $attachmentDataUrl = (string) ($body['attachmentDataUrl'] ?? '');

    if ($jobId === '' || strlen($jobId) > 50 || !in_array($invoiceType, ['FDA', 'FPDA'], true)
        || $invoiceNo === '' || strlen($invoiceNo) > 180
        || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $incomeDate)
        || !checkdate((int) substr($incomeDate, 5, 2), (int) substr($incomeDate, 8, 2), (int) substr($incomeDate, 0, 4))
        || $bankAccountId === '' || $remark === '' || strlen($remark) > 5000
        || $attachmentName === '' || strlen($attachmentName) > 255
        || !preg_match('/^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/]+={0,2})$/D', $attachmentDataUrl, $attachmentMatch)) {
        jsonResponse(['error' => 'Data Accounts Receivable belum lengkap atau tidak valid'], 400);
    }
    $attachmentBytes = base64_decode($attachmentMatch[2], true);
    $attachmentInfo = $attachmentBytes === false ? false : getimagesizefromstring($attachmentBytes);
    $expectedMime = 'image/' . $attachmentMatch[1];
    if ($attachmentBytes === false || strlen($attachmentBytes) > 1024 * 1024
        || $attachmentInfo === false || ($attachmentInfo['mime'] ?? '') !== $expectedMime) {
        jsonResponse(['error' => 'Photo bukti kas harus berupa JPG atau PNG maksimal 1 MB'], 400);
    }
    foreach ([$pph23, $idrAmount, $usdAmount] as $amount) {
        if (!is_numeric($amount) || !is_finite((float) $amount) || (float) $amount < 0) {
            jsonResponse(['error' => 'Nominal PPh 23 dan Amount harus berupa angka nol atau lebih'], 400);
        }
    }
    $pph23 = round((float) $pph23, 2);
    $idrAmount = round((float) $idrAmount, 2);
    $usdAmount = round((float) $usdAmount, 2);
    if ($idrAmount <= 0 && $usdAmount <= 0) jsonResponse(['error' => 'Isi IDR Amount atau USD Amount'], 400);

    if ($invoiceType === 'FDA') {
        $invoiceQuery = $pdo->prepare(
            "SELECT vc.job_id, f.fda_no AS invoice_no, c.company_name AS principal_name, v.name AS vessel_name "
            . 'FROM vessel_calls vc INNER JOIN fda_records f ON f.job_id = vc.job_id '
            . 'INNER JOIN customers c ON c.id = vc.customer_id INNER JOIN vessels v ON v.id = vc.vessel_id '
            . 'LEFT JOIN closing_records cr ON cr.job_id = vc.job_id '
            . "WHERE vc.job_id = :job_id AND f.fda_no = :invoice_no AND vc.status <> 'CLOSED' AND vc.current_stage <> 'CLOSED' AND COALESCE(cr.is_closed, 0) = 0 LIMIT 1"
        );
    } else {
        $invoiceQuery = $pdo->prepare(
            "SELECT vc.job_id, pd.pda_no AS invoice_no, c.company_name AS principal_name, v.name AS vessel_name "
            . 'FROM vessel_calls vc INNER JOIN pda_documents pd ON pd.job_id = vc.job_id AND pd.pda_type = \'FDA\' '
            . 'INNER JOIN customers c ON c.id = vc.customer_id INNER JOIN vessels v ON v.id = vc.vessel_id '
            . 'LEFT JOIN closing_records cr ON cr.job_id = vc.job_id '
            . "WHERE vc.job_id = :job_id AND pd.pda_no = :invoice_no AND vc.status <> 'CLOSED' AND vc.current_stage <> 'CLOSED' AND COALESCE(cr.is_closed, 0) = 0 LIMIT 1"
        );
    }
    $invoiceQuery->execute(['job_id' => $jobId, 'invoice_no' => $invoiceNo]);
    $invoice = $invoiceQuery->fetch();
    if (!$invoice) jsonResponse(['error' => 'Invoice FDA/FPDA tidak ditemukan atau Job sudah ditutup'], 409);

    $bankQuery = $pdo->prepare('SELECT bank_name, account_name, account_number FROM bank_accounts WHERE id = :id LIMIT 1');
    $bankQuery->execute(['id' => $bankAccountId]);
    $bank = $bankQuery->fetch();
    if (!$bank) jsonResponse(['error' => 'Akun bank tujuan tidak ditemukan'], 409);

    $insert = $pdo->prepare(
        'INSERT INTO accounts_receivable_entries '
        . '(id, job_id, invoice_type, invoice_no, income_date, principal_name, vessel_name, pph23_amount_idr, remark, '
        . '(bank_account_id, bank_name, account_name, account_number, idr_amount, usd_amount, attachment_name, attachment_data_url, created_by_user_id, created_by_name) '
        . 'VALUES (:id, :job_id, :invoice_type, :invoice_no, :income_date, :principal_name, :vessel_name, :pph23, :remark, '
        . ':bank_account_id, :bank_name, :account_name, :account_number, :idr_amount, :usd_amount, :attachment_name, :attachment_data_url, :user_id, :user_name)'
    );
    $insert->execute([
        'id' => 'AR-' . bin2hex(random_bytes(16)),
        'job_id' => $jobId,
        'invoice_type' => $invoiceType,
        'invoice_no' => $invoiceNo,
        'income_date' => $incomeDate,
        'principal_name' => $invoice['principal_name'],
        'vessel_name' => $invoice['vessel_name'],
        'pph23' => $pph23,
        'remark' => $remark,
        'bank_account_id' => $bankAccountId,
        'bank_name' => $bank['bank_name'],
        'account_name' => $bank['account_name'],
        'account_number' => $bank['account_number'],
        'idr_amount' => $idrAmount,
        'usd_amount' => $usdAmount,
        'attachment_name' => basename($attachmentName),
        'attachment_data_url' => $attachmentDataUrl,
        'user_id' => $user['id'] ?? null,
        'user_name' => $user['name'] ?? $user['username'] ?? 'Finance',
    ]);
    jsonResponse(['ok' => true]);
} catch (PDOException $error) {
    error_log('MaritimPort receivables database error: ' . $error->getMessage());
    jsonResponse(['error' => 'Accounts Receivable database operation failed'], 500);
} catch (Throwable $error) {
    error_log('MaritimPort receivables error: ' . $error->getMessage());
    jsonResponse(['error' => 'Accounts Receivable operation failed'], 500);
}
