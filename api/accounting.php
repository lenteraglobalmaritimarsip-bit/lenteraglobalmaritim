<?php

declare(strict_types=1);

require_once __DIR__ . '/repository.php';

final class AccountingApiException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400)
    {
        parent::__construct($message);
    }
}

function accountingRequireUser(): array
{
    $sessionUser = requireAuthenticatedUser();
    $query = db()->prepare('SELECT id, name, role, status FROM users WHERE id = :id LIMIT 1');
    $query->execute(['id' => $sessionUser['id']]);
    $user = $query->fetch();
    if (!$user || $user['status'] !== 'ACTIVE') {
        throw new AccountingApiException('Akun tidak aktif. Hubungi administrator.', 401);
    }
    if (!in_array($user['role'], ['ACCOUNTING', 'DIRECTOR'], true)) {
        throw new AccountingApiException('Akses hanya untuk role Accounting atau Direktur.', 403);
    }
    return $user;
}

function accountingDate(string $value): bool
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $parts)) return false;
    return checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1]);
}

function accountingPayableDetails(array $items, array $payment, array $voucher, string $currency, float $amount): array
{
    $details = [];
    foreach ($items as $item) {
        $details[] = [
            'itemService' => (string) ($item['item_service'] ?? ''),
            'jobNumber' => (string) ($item['job_number'] ?? ''),
            'documentType' => (string) ($item['document_type'] ?? ''),
            'documentNumber' => (string) ($item['document_number'] ?? ''),
            'customerName' => (string) ($item['customer_name'] ?? ''),
            'amount' => (float) ($item['amount'] ?? 0),
            'vatAmount' => (float) ($item['vat_amount'] ?? 0),
            'total' => (float) ($item['total'] ?? 0),
            'pphRate' => (float) ($item['pph_rate'] ?? 0),
            'pph23Amount' => (float) ($item['pph23_amount'] ?? 0),
            'paidAmount' => (float) ($item['paid_amount'] ?? 0),
            'currency' => $currency,
        ];
    }
    return [
        'items' => $details,
        'surcharge' => (float) ($payment['paymentSurcharge'] ?? $voucher['payment_surcharge'] ?? 0),
        'otherExpenses' => (float) ($payment['paymentOtherExpenses'] ?? $voucher['payment_other_expenses'] ?? 0),
        'paymentDescription' => (string) ($payment['paymentDescription'] ?? $voucher['payment_description'] ?? ''),
        'paymentTotal' => $amount,
        'currency' => $currency,
        'remittanceBankName' => (string) ($payment['remittanceBankName'] ?? $voucher['remittance_bank_name'] ?? ''),
        'remittanceAccountName' => (string) ($payment['remittanceAccountName'] ?? $voucher['remittance_account_name'] ?? ''),
        'remittanceAccountNumber' => (string) ($payment['remittanceAccountNumber'] ?? $voucher['remittance_account_number'] ?? ''),
        'destinationAccountName' => (string) ($payment['paidTo'] ?? $voucher['paid_to'] ?? ''),
    ];
}

function accountingSources(PDO $pdo): array
{
    $sources = [];
    $payments = $pdo->query(
        'SELECT pv.id, pv.voucher_number, pv.request_number, pv.vendor_name, pv.branch_name, pv.branch_id, pv.request_date, pv.currency, '
        . 'pv.exchange_rate_usd_to_idr, pv.total_paid_amount, pv.status, pv.paid_at, pv.paid_by, pv.paid_from_bank_account_id, '
        . 'pv.paid_to, pv.bank_name, pv.account_number, pv.payment_surcharge, pv.payment_other_expenses, pv.payment_description, '
        . 'pv.payment_total_amount, pv.payment_history, ba.bank_name AS remittance_bank_name, ba.coa_id AS bank_coa_id, '
        . 'ba.account_name AS remittance_account_name, ba.account_number AS remittance_account_number '
        . 'FROM payment_vouchers pv LEFT JOIN bank_accounts ba ON ba.id = pv.paid_from_bank_account_id '
        . "WHERE pv.status = 'PAID' OR pv.payment_history IS NOT NULL ORDER BY pv.paid_at, pv.request_date, pv.request_number"
    )->fetchAll();
    $bankCoaById = [];
    foreach ($pdo->query('SELECT id, coa_id FROM bank_accounts')->fetchAll() as $bankAccount) {
        $bankCoaById[(string) $bankAccount['id']] = (string) ($bankAccount['coa_id'] ?? '');
    }
    $paymentItemRows = $pdo->query(
        'SELECT voucher_id, line_no, job_number, document_type, document_number, customer_name, item_service, '
        . 'amount, vat_amount, total, pph_rate, pph23_amount, paid_amount FROM payment_voucher_items ORDER BY voucher_id, line_no'
    )->fetchAll();
    $paymentItemsByVoucher = [];
    foreach ($paymentItemRows as $item) {
        $paymentItemsByVoucher[(string) $item['voucher_id']][] = $item;
    }

    foreach ($payments as $voucher) {
        $currency = (string) ($voucher['currency'] ?: 'IDR');
        $rate = $currency === 'USD' ? (float) ($voucher['exchange_rate_usd_to_idr'] ?? 0) : 1.0;
        $voucherItems = $paymentItemsByVoucher[(string) $voucher['id']] ?? [];
        $history = json_decode((string) ($voucher['payment_history'] ?? ''), true);
        foreach (is_array($history) ? $history : [] as $index => $payment) {
            if (!is_array($payment) || empty($payment['paidAt'])) continue;
            $amount = (float) ($payment['paymentTotalAmount'] ?? (
                (float) ($voucher['total_paid_amount'] ?? 0)
                + (float) ($payment['paymentSurcharge'] ?? 0)
                + (float) ($payment['paymentOtherExpenses'] ?? 0)
            ));
            $paymentBankAccountId = (string) (($payment['paidFromBankAccountId'] ?? '') ?: ($voucher['paid_from_bank_account_id'] ?? ''));
            $sourceKey = (string) $voucher['id'] . ':payment:' . (string) $index;
            $sources[] = [
                'sourceType' => 'PAYABLE',
                'sourceKey' => $sourceKey,
                'sourceId' => (string) $voucher['id'],
                'branchId' => (string) ($voucher['branch_id'] ?? ''),
                'branchName' => (string) ($voucher['branch_name'] ?? ''),
                'date' => substr((string) $payment['paidAt'], 0, 10),
                'arApNumber' => (string) ($payment['voucherNumber'] ?? $voucher['voucher_number'] ?? ''),
                'referenceNo' => (string) $voucher['request_number'],
                'requestNo' => (string) $voucher['request_number'],
                'counterparty' => (string) ($voucher['vendor_name'] ?? ''),
                'description' => (string) ($payment['paymentDescription'] ?? $voucher['payment_description'] ?? ''),
                'bankName' => (string) ($payment['bankName'] ?? $voucher['bank_name'] ?? ''),
                'accountNumber' => (string) ($payment['accountNumber'] ?? $voucher['account_number'] ?? ''),
                'bankCoaId' => $bankCoaById[$paymentBankAccountId] ?? '',
                'currency' => $currency,
                'amount' => round($amount, 2),
                'exchangeRate' => $rate,
                'amountIdr' => round($amount * $rate, 2),
                'sourceDetails' => accountingPayableDetails($voucherItems, $payment, $voucher, $currency, round($amount, 2)),
            ];
        }

        if (($voucher['status'] ?? '') === 'PAID' && !empty($voucher['paid_at'])) {
            $amount = (float) ($voucher['payment_total_amount'] ?? (
                (float) ($voucher['total_paid_amount'] ?? 0)
                + (float) ($voucher['payment_surcharge'] ?? 0)
                + (float) ($voucher['payment_other_expenses'] ?? 0)
            ));
            $sources[] = [
                'sourceType' => 'PAYABLE',
                'sourceKey' => (string) $voucher['id'] . ':payment:current',
                'sourceId' => (string) $voucher['id'],
                'branchId' => (string) ($voucher['branch_id'] ?? ''),
                'branchName' => (string) ($voucher['branch_name'] ?? ''),
                'date' => substr((string) $voucher['paid_at'], 0, 10),
                'arApNumber' => (string) ($voucher['voucher_number'] ?? ''),
                'referenceNo' => (string) $voucher['request_number'],
                'requestNo' => (string) $voucher['request_number'],
                'counterparty' => (string) ($voucher['vendor_name'] ?? ''),
                'description' => (string) ($voucher['payment_description'] ?? ''),
                'bankName' => (string) ($voucher['bank_name'] ?? ''),
                'accountNumber' => (string) ($voucher['account_number'] ?? ''),
                'bankCoaId' => (string) ($voucher['bank_coa_id'] ?? ''),
                'currency' => $currency,
                'amount' => round($amount, 2),
                'exchangeRate' => $rate,
                'amountIdr' => round($amount * $rate, 2),
                'sourceDetails' => accountingPayableDetails($voucherItems, [], $voucher, $currency, round($amount, 2)),
            ];
        }
    }

    $receivables = $pdo->query(
        'SELECT ar.id, ar.receipt_number, ar.branch_name, ar.branch_id, ar.income_date, ar.subject_data, ar.job_id, ar.payment_type, ar.invoice_type, ar.invoice_no, '
        . 'ar.principal_name, ar.vessel_name, ar.pph23_amount_idr, ar.remark, ar.bank_name, ar.account_name, ar.account_number, ar.idr_amount, ar.usd_amount, '
        . 'ar.exchange_rate_usd_to_idr, ba.coa_id AS bank_coa_id FROM accounts_receivable_entries ar '
        . 'LEFT JOIN bank_accounts ba ON ba.id = ar.bank_account_id ORDER BY ar.income_date, ar.created_at, ar.id'
    )->fetchAll();
    foreach ($receivables as $entry) {
        $currency = (float) $entry['usd_amount'] > 0 && (float) $entry['idr_amount'] === 0.0 ? 'USD' : 'IDR';
        $rate = (float) ($entry['exchange_rate_usd_to_idr'] ?? 0);
        $amountIdr = round((float) $entry['idr_amount'] + (float) $entry['usd_amount'] * $rate, 2);
        $reference = $entry['subject_data'] === 'PRINCIPAL'
            ? (string) ($entry['invoice_no'] ?? '')
            : 'Penerimaan Operasional';
        $sources[] = [
            'sourceType' => 'RECEIVABLE',
            'sourceKey' => 'AR:' . (string) $entry['id'],
            'sourceId' => (string) $entry['id'],
            'branchId' => (string) ($entry['branch_id'] ?? ''),
            'branchName' => (string) ($entry['branch_name'] ?? ''),
            'date' => (string) $entry['income_date'],
            'arApNumber' => (string) ($entry['receipt_number'] ?? ''),
            'referenceNo' => $reference,
            'requestNo' => '',
            'counterparty' => (string) ($entry['principal_name'] ?? ($entry['subject_data'] === 'OPERATIONAL' ? 'Operasional' : '')),
            'description' => (string) ($entry['remark'] ?? ''),
            'bankName' => (string) ($entry['bank_name'] ?? ''),
            'accountNumber' => (string) ($entry['account_number'] ?? ''),
            'bankCoaId' => (string) ($entry['bank_coa_id'] ?? ''),
            'currency' => $currency,
            'amount' => $currency === 'USD' ? (float) $entry['usd_amount'] : $amountIdr,
            'exchangeRate' => $rate,
            'amountIdr' => $amountIdr,
            'sourceDetails' => [
                'subjectData' => (string) $entry['subject_data'],
                'jobId' => (string) ($entry['job_id'] ?? ''),
                'paymentType' => (string) ($entry['payment_type'] ?? ''),
                'invoiceType' => (string) ($entry['invoice_type'] ?? ''),
                'invoiceNo' => (string) ($entry['invoice_no'] ?? ''),
                'principalName' => (string) ($entry['principal_name'] ?? ''),
                'vesselName' => (string) ($entry['vessel_name'] ?? ''),
                'pph23AmountIDR' => (float) ($entry['pph23_amount_idr'] ?? 0),
                'idrAmount' => (float) $entry['idr_amount'],
                'usdAmount' => (float) $entry['usd_amount'],
                'exchangeRateUSDToIDR' => $rate,
                'remark' => (string) ($entry['remark'] ?? ''),
                'beneficiaryBankName' => (string) ($entry['bank_name'] ?? ''),
                'beneficiaryAccountName' => (string) ($entry['account_name'] ?? ''),
                'beneficiaryAccountNumber' => (string) ($entry['account_number'] ?? ''),
            ],
        ];
    }

    return $sources;
}

function accountingInbox(PDO $pdo): array
{
    $journals = $pdo->query(
        'SELECT id, journal_number, source_type, source_key, branch_id, branch_name, entry_date, description, status, '
        . 'created_by_name, created_at, updated_by_name, updated_at, posted_by_name, posted_at FROM accounting_journals'
    )->fetchAll();
    $journalBySource = [];
    $journalIds = [];
    foreach ($journals as $journal) {
        $key = $journal['source_type'] . '|' . $journal['source_key'];
        $journalBySource[$key] = $journal;
        $journalIds[(string) $journal['id']] = true;
    }
    $linesByJournal = [];
    if ($journalIds) {
        $lineRows = $pdo->query(
            'SELECT id, journal_id, coa_id, memo, direction, amount FROM accounting_journal_lines ORDER BY journal_id, line_no'
        )->fetchAll();
        foreach ($lineRows as $line) {
            $linesByJournal[(string) $line['journal_id']][] = [
                'id' => (string) $line['id'],
                'coaId' => (string) $line['coa_id'],
                'memo' => (string) $line['memo'],
                'direction' => (string) $line['direction'],
                'amount' => (float) $line['amount'],
            ];
        }
    }

    $items = [];
    foreach (accountingSources($pdo) as $source) {
        $journal = $journalBySource[$source['sourceType'] . '|' . $source['sourceKey']] ?? null;
        $source['accountingStatus'] = $journal['status'] ?? 'PENDING';
        $source['journalId'] = $journal['id'] ?? null;
        $source['journalNumber'] = $journal['journal_number'] ?? null;
        $source['journalDate'] = $journal['entry_date'] ?? null;
        $source['journalDescription'] = $journal['description'] ?? null;
        $source['journalLines'] = $journal ? ($linesByJournal[(string) $journal['id']] ?? []) : [];
        $source['createdBy'] = $journal['created_by_name'] ?? null;
        $source['createdAt'] = $journal['created_at'] ?? null;
        $source['updatedBy'] = $journal['updated_by_name'] ?? null;
        $source['updatedAt'] = $journal['updated_at'] ?? null;
        $source['postedBy'] = $journal['posted_by_name'] ?? null;
        $source['postedAt'] = $journal['posted_at'] ?? null;
        $items[] = $source;
    }

    $coaRows = $pdo->query(
        'SELECT id, code, account_desc, account_group, is_active FROM chart_of_accounts WHERE is_active = 1 ORDER BY code, account_desc'
    )->fetchAll();
    $accounts = array_map(static fn (array $account): array => [
        'id' => (string) $account['id'],
        'code' => (string) $account['code'],
        'accountDesc' => (string) $account['account_desc'],
        'accountGroup' => (string) $account['account_group'],
        'isActive' => (bool) $account['is_active'],
    ], $coaRows);

    usort($items, static fn (array $a, array $b): int =>
        strcmp($b['date'], $a['date']) ?: strcmp($a['branchName'], $b['branchName']) ?: strcmp($a['referenceNo'], $b['referenceNo'])
    );
    return ['items' => $items, 'accounts' => $accounts];
}

function accountingPostedJournalReport(PDO $pdo, string $startDate, string $endDate, string $scope = 'ALL', string $branchId = ''): array
{
    if (($startDate !== '' && !accountingDate($startDate)) || ($endDate !== '' && !accountingDate($endDate))) {
        throw new AccountingApiException('Format tanggal laporan tidak valid.');
    }
    if ($startDate !== '' && $endDate !== '' && $startDate > $endDate) {
        throw new AccountingApiException('Tanggal awal tidak boleh melewati tanggal akhir.');
    }

    $sourcesByKey = [];
    foreach (accountingSources($pdo) as $source) {
        $sourcesByKey[$source['sourceType'] . '|' . $source['sourceKey']] = $source;
    }

    $conditions = ["j.status = 'POSTED'"];
    $params = [];
    if ($startDate !== '') {
        $conditions[] = 'j.entry_date >= :start_date';
        $params['start_date'] = $startDate;
    }
    if ($endDate !== '') {
        $conditions[] = 'j.entry_date <= :end_date';
        $params['end_date'] = $endDate;
    }
    if ($scope === 'HISTORICAL') {
        $conditions[] = "j.source_type = 'HISTORICAL'";
    } elseif ($scope === 'BRANCH') {
        if ($branchId === '' || !ctype_digit($branchId)) throw new AccountingApiException('Branch laporan tidak valid.');
        $branchQuery = $pdo->prepare('SELECT id FROM branches WHERE id = :id AND is_active = 1 LIMIT 1');
        $branchQuery->execute(['id' => $branchId]);
        if (!$branchQuery->fetchColumn()) throw new AccountingApiException('Branch laporan tidak ditemukan atau tidak aktif.');
        $conditions[] = 'j.branch_id = :branch_id';
        $conditions[] = "j.source_type <> 'HISTORICAL'";
        $params['branch_id'] = $branchId;
    } elseif ($scope !== 'ALL') {
        throw new AccountingApiException('Scope laporan tidak valid.');
    }
    $query = $pdo->prepare(
        'SELECT j.id AS journal_id, j.journal_number, j.entry_date, j.source_type, j.source_key, j.description AS journal_description, '
        . 'b.code AS branch_code, b.name AS branch_name, '
        . 'l.id AS journal_line_id, l.coa_id, l.direction, l.amount, l.memo, l.report_overrides, c.code AS coa_code, c.account_desc AS coa_name '
        . 'FROM accounting_journals j '
        . 'LEFT JOIN accounting_journal_lines l ON l.journal_id = j.id '
        . 'LEFT JOIN chart_of_accounts c ON c.id = l.coa_id '
        . 'LEFT JOIN branches b ON b.id = j.branch_id '
        . 'WHERE ' . implode(' AND ', $conditions) . ' '
        . 'ORDER BY COALESCE(j.posted_at, j.updated_at, j.created_at) DESC, j.entry_date DESC, j.journal_number DESC, l.line_no ASC'
    );
    $query->execute($params);
    $rows = [];
    foreach ($query->fetchAll() as $line) {
        $sourceKey = (string) $line['source_type'] . '|' . (string) $line['source_key'];
        $source = $sourcesByKey[$sourceKey] ?? [];
        $details = $source['sourceDetails'] ?? [];
        $items = $details['items'] ?? [];
        $jobNumbers = array_values(array_unique(array_filter(array_map(
            static fn (array $item): string => trim((string) ($item['jobNumber'] ?? '')),
            is_array($items) ? $items : [],
        ))));
        $customers = array_values(array_unique(array_filter(array_map(
            static fn (array $item): string => trim((string) ($item['customerName'] ?? '')),
            is_array($items) ? $items : [],
        ))));
        $itemNames = array_values(array_unique(array_filter(array_map(
            static fn (array $item): string => trim((string) ($item['itemService'] ?? '')),
            is_array($items) ? $items : [],
        ))));
        $fdaReferences = array_values(array_unique(array_filter(array_map(
            static fn (array $item): string => ($item['documentType'] ?? '') === 'FDA' ? trim((string) ($item['documentNumber'] ?? '')) : '',
            is_array($items) ? $items : [],
        ))));
        $isPayable = ($line['source_type'] ?? '') === 'PAYABLE';
        $isHistorical = ($line['source_type'] ?? '') === 'HISTORICAL';
        $overrides = json_decode((string) ($line['report_overrides'] ?? ''), true);
        if (!is_array($overrides)) $overrides = [];
        $rows[] = [
            'journalId' => (string) $line['journal_id'],
            'journalLineId' => (string) ($line['journal_line_id'] ?? ''),
            'coaId' => (string) ($line['coa_id'] ?? ''),
            'branchCode' => (string) ($line['branch_code'] ?? ''),
            'branchName' => (string) ($line['branch_name'] ?? $source['branchName'] ?? ''),
            'journalNumber' => (string) ($line['journal_number'] ?? ''),
            'journalDate' => (string) ($overrides['journalDate'] ?? $line['entry_date']),
            'arApNumber' => (string) ($overrides['arApNumber'] ?? $source['arApNumber'] ?? ''),
            'appliedDate' => (string) ($overrides['appliedDate'] ?? $source['date'] ?? ''),
            'shipment' => (string) ($overrides['shipment'] ?? ($isPayable ? '' : ($details['vesselName'] ?? ''))),
            'customer' => (string) ($overrides['customer'] ?? ($isPayable ? implode(', ', $customers) : ($details['principalName'] ?? ''))),
            'jobVessel' => (string) ($overrides['jobVessel'] ?? ($isPayable ? implode(', ', $jobNumbers) : ($details['jobId'] ?? ''))),
            'refNoFda' => (string) ($overrides['refNoFda'] ?? ($isPayable ? implode(', ', $fdaReferences) : (($details['invoiceType'] ?? '') === 'FDA' ? ($details['invoiceNo'] ?? '') : ''))),
            'bl' => (string) ($overrides['bl'] ?? ''),
            'currency' => (string) ($overrides['currency'] ?? $source['currency'] ?? ''),
            'exchangeRate' => (float) ($overrides['exchangeRate'] ?? $source['exchangeRate'] ?? 0),
            'item' => (string) ($overrides['item'] ?? ($isHistorical ? '' : ($isPayable ? implode(', ', $itemNames) : (($details['subjectData'] ?? '') === 'OPERATIONAL' ? 'Penerimaan Operasional' : ($details['invoiceType'] ?? 'Penerimaan Principal'))))),
            'vendor' => (string) ($overrides['vendor'] ?? ($isPayable ? ($source['counterparty'] ?? '') : '')),
            'description' => (string) ($line['memo'] ?: ($line['journal_description'] ?? '')),
            'coa' => (string) ($line['coa_code'] ?? ''),
            'accountName' => (string) ($line['coa_name'] ?? ''),
            'direction' => ($line['direction'] ?? '') === 'DEBIT' ? 'D' : (($line['direction'] ?? '') === 'CREDIT' ? 'K' : ''),
            'amount' => (float) ($line['amount'] ?? 0),
        ];
    }
    return $rows;
}

function accountingReportBranches(PDO $pdo): array
{
    $rows = $pdo->query('SELECT id, code, name FROM branches WHERE is_active = 1 ORDER BY name, code')->fetchAll();
    return array_map(static fn (array $row): array => [
        'id' => (string) $row['id'],
        'code' => (string) $row['code'],
        'name' => (string) $row['name'],
    ], $rows);
}

function accountingFinancialRows(PDO $pdo, string $endDate, ?string $startDate = null, string $scope = 'ALL', string $branchId = '', bool $groupByMonth = false): array
{
    $conditions = ["j.status = 'POSTED'", 'j.entry_date <= :end_date'];
    $params = ['end_date' => $endDate];
    if ($startDate !== null) {
        $conditions[] = 'j.entry_date >= :start_date';
        $params['start_date'] = $startDate;
    }
    if ($scope === 'HISTORICAL') {
        $conditions[] = "j.source_type = 'HISTORICAL'";
    } elseif ($scope === 'BRANCH') {
        if ($branchId === '' || !ctype_digit($branchId)) throw new AccountingApiException('Branch laporan tidak valid.');
        $branchQuery = $pdo->prepare('SELECT id FROM branches WHERE id = :id AND is_active = 1 LIMIT 1');
        $branchQuery->execute(['id' => $branchId]);
        if (!$branchQuery->fetchColumn()) throw new AccountingApiException('Branch laporan tidak ditemukan atau tidak aktif.');
        $conditions[] = 'j.branch_id = :branch_id';
        $conditions[] = "j.source_type <> 'HISTORICAL'";
        $params['branch_id'] = $branchId;
    } elseif ($scope !== 'ALL') {
        throw new AccountingApiException('Scope laporan tidak valid.');
    }
    $monthSelect = $groupByMonth ? 'MONTH(j.entry_date) AS month_number, ' : '';
    $monthGroup = $groupByMonth ? 'MONTH(j.entry_date), ' : '';
    $monthOrder = $groupByMonth ? 'month_number, ' : '';
    $query = $pdo->prepare(
        'SELECT ' . $monthSelect . 'c.code, c.account_desc, c.account_group, '
        . "SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount ELSE -l.amount END) AS debit_balance "
        . 'FROM accounting_journals j '
        . 'INNER JOIN accounting_journal_lines l ON l.journal_id = j.id '
        . 'INNER JOIN chart_of_accounts c ON c.id = l.coa_id '
        . 'WHERE ' . implode(' AND ', $conditions) . ' '
        . 'GROUP BY ' . $monthGroup . 'c.id, c.code, c.account_desc, c.account_group '
        . 'ORDER BY ' . $monthOrder . 'c.code, c.account_desc'
    );
    $query->execute($params);
    return array_map(static function (array $row) use ($groupByMonth): array {
        $result = [
            'code' => (string) $row['code'],
            'accountName' => (string) $row['account_desc'],
            'accountGroup' => (string) $row['account_group'],
            'debitBalance' => round((float) $row['debit_balance'], 2),
        ];
        if ($groupByMonth) $result['month'] = (int) $row['month_number'];
        return $result;
    }, $query->fetchAll());
}

function accountingReportLine(array $row, float $amount): array
{
    return [
        'code' => $row['code'],
        'accountName' => $row['accountName'],
        'accountGroup' => $row['accountGroup'],
        'amount' => round($amount, 2),
    ];
}

function accountingNetEarnings(array $rows): float
{
    $netEarnings = 0.0;
    foreach ($rows as $row) {
        $group = $row['accountGroup'];
        if (str_starts_with($group, 'Revenue') || $group === 'Other Income') {
            $netEarnings -= $row['debitBalance'];
        } elseif (str_starts_with($group, 'Expenses') || str_starts_with($group, 'GA') || $group === 'Other Expenses') {
            $netEarnings -= $row['debitBalance'];
        }
    }
    return round($netEarnings, 2);
}

function accountingBalanceSheet(PDO $pdo, string $asOf, string $scope = 'ALL', string $branchId = ''): array
{
    if (!accountingDate($asOf)) throw new AccountingApiException('Tanggal Neraca tidak valid.');
    $assets = [];
    $liabilities = [];
    $equity = [];
    $totalAssets = 0.0;
    $totalLiabilities = 0.0;
    $totalEquity = 0.0;
    foreach (accountingFinancialRows($pdo, $asOf, null, $scope, $branchId) as $row) {
        $group = $row['accountGroup'];
        if ($group === 'Asset') {
            $amount = $row['debitBalance'];
            $assets[] = accountingReportLine($row, $amount);
            $totalAssets += $amount;
        } elseif ($group === 'Liability') {
            $amount = -$row['debitBalance'];
            $liabilities[] = accountingReportLine($row, $amount);
            $totalLiabilities += $amount;
        } elseif ($group === 'Equity') {
            $amount = -$row['debitBalance'];
            $equity[] = accountingReportLine($row, $amount);
            $totalEquity += $amount;
        }
    }

    $yearStart = substr($asOf, 0, 4) . '-01-01';
    $currentEarnings = accountingNetEarnings(accountingFinancialRows($pdo, $asOf, $yearStart, $scope, $branchId));
    $previousYear = (int) substr($asOf, 0, 4) - 1;
    $retainedEarnings = 0.0;
    if ($previousYear >= 1000) {
        $previousYearEnd = sprintf('%04d-12-31', $previousYear);
        $retainedEarnings = accountingNetEarnings(accountingFinancialRows($pdo, $previousYearEnd, null, $scope, $branchId));
    }

    $retainedAccountFound = false;
    foreach ($equity as &$account) {
        if ($account['code'] !== 'EQ99000') continue;
        $account['amount'] = round($account['amount'] + $retainedEarnings, 2);
        $retainedAccountFound = true;
        break;
    }
    unset($account);
    if (!$retainedAccountFound) {
        $equity[] = accountingReportLine([
            'code' => 'EQ99000',
            'accountName' => 'Laba ditahan',
            'accountGroup' => 'Equity',
        ], $retainedEarnings);
    }

    $totalEquity += $retainedEarnings;
    $totalEquity += $currentEarnings;

    return [
        'asOf' => $asOf,
        'assets' => $assets,
        'liabilities' => $liabilities,
        'equity' => $equity,
        'currentEarnings' => round($currentEarnings, 2),
        'totalAssets' => round($totalAssets, 2),
        'totalLiabilities' => round($totalLiabilities, 2),
        'totalEquity' => round($totalEquity, 2),
        'difference' => round($totalAssets - $totalLiabilities - $totalEquity, 2),
    ];
}

function accountingProfitLoss(PDO $pdo, string $startDate, string $endDate, string $scope = 'ALL', string $branchId = ''): array
{
    if (!accountingDate($startDate) || !accountingDate($endDate)) {
        throw new AccountingApiException('Periode Laba Rugi tidak valid.');
    }
    if ($startDate > $endDate) throw new AccountingApiException('Tanggal awal tidak boleh melewati tanggal akhir.');

    $revenue = [];
    $expenses = [];
    $otherIncome = [];
    $otherExpenses = [];
    $totals = ['revenue' => 0.0, 'expenses' => 0.0, 'otherIncome' => 0.0, 'otherExpenses' => 0.0];
    foreach (accountingFinancialRows($pdo, $endDate, $startDate, $scope, $branchId) as $row) {
        $group = $row['accountGroup'];
        if (str_starts_with($group, 'Revenue')) {
            $amount = -$row['debitBalance'];
            $revenue[] = accountingReportLine($row, $amount);
            $totals['revenue'] += $amount;
        } elseif (str_starts_with($group, 'Expenses') || str_starts_with($group, 'GA')) {
            $amount = $row['debitBalance'];
            $expenses[] = accountingReportLine($row, $amount);
            $totals['expenses'] += $amount;
        } elseif ($group === 'Other Income') {
            $amount = -$row['debitBalance'];
            $otherIncome[] = accountingReportLine($row, $amount);
            $totals['otherIncome'] += $amount;
        } elseif ($group === 'Other Expenses') {
            $amount = $row['debitBalance'];
            $otherExpenses[] = accountingReportLine($row, $amount);
            $totals['otherExpenses'] += $amount;
        }
    }
    $netIncome = $totals['revenue'] - $totals['expenses'] + $totals['otherIncome'] - $totals['otherExpenses'];
    return [
        'startDate' => $startDate,
        'endDate' => $endDate,
        'revenue' => $revenue,
        'expenses' => $expenses,
        'otherIncome' => $otherIncome,
        'otherExpenses' => $otherExpenses,
        'totalRevenue' => round($totals['revenue'], 2),
        'totalExpenses' => round($totals['expenses'], 2),
        'totalOtherIncome' => round($totals['otherIncome'], 2),
        'totalOtherExpenses' => round($totals['otherExpenses'], 2),
        'netIncome' => round($netIncome, 2),
    ];
}

function accountingMonthlyProfitLoss(PDO $pdo, int $year, string $scope = 'ALL', string $branchId = ''): array
{
    if ($year < 2000 || $year > 9999) throw new AccountingApiException('Tahun Rincian Laba tidak valid.');
    $startDate = sprintf('%04d-01-01', $year);
    $endDate = sprintf('%04d-12-31', $year);
    $reports = [];
    for ($month = 1; $month <= 12; $month++) {
        $reports[$month] = [
            'startDate' => sprintf('%04d-%02d-01', $year, $month),
            'endDate' => sprintf('%04d-%02d-%02d', $year, $month, (int) date('t', strtotime(sprintf('%04d-%02d-01', $year, $month)))),
            'revenue' => [],
            'expenses' => [],
            'otherIncome' => [],
            'otherExpenses' => [],
            'totalRevenue' => 0.0,
            'totalExpenses' => 0.0,
            'totalOtherIncome' => 0.0,
            'totalOtherExpenses' => 0.0,
            'netIncome' => 0.0,
        ];
    }
    foreach (accountingFinancialRows($pdo, $endDate, $startDate, $scope, $branchId, true) as $row) {
        $month = (int) $row['month'];
        if ($month < 1 || $month > 12) continue;
        $group = $row['accountGroup'];
        $amount = (float) $row['debitBalance'];
        $target = null;
        $totalKey = null;
        if (str_starts_with($group, 'Revenue')) {
            $amount = -$amount;
            $target = 'revenue';
            $totalKey = 'totalRevenue';
        } elseif (str_starts_with($group, 'Expenses') || str_starts_with($group, 'GA')) {
            $target = 'expenses';
            $totalKey = 'totalExpenses';
        } elseif ($group === 'Other Income') {
            $amount = -$amount;
            $target = 'otherIncome';
            $totalKey = 'totalOtherIncome';
        } elseif ($group === 'Other Expenses') {
            $target = 'otherExpenses';
            $totalKey = 'totalOtherExpenses';
        }
        if ($target === null || $totalKey === null) continue;
        $reports[$month][$target][] = accountingReportLine($row, $amount);
        $reports[$month][$totalKey] += $amount;
    }
    foreach ($reports as &$report) {
        $report['netIncome'] = round(
            $report['totalRevenue'] - $report['totalExpenses'] + $report['totalOtherIncome'] - $report['totalOtherExpenses'],
            2,
        );
        foreach (['totalRevenue', 'totalExpenses', 'totalOtherIncome', 'totalOtherExpenses'] as $totalKey) {
            $report[$totalKey] = round($report[$totalKey], 2);
        }
    }
    unset($report);
    return array_values($reports);
}

function accountingValidateLines(PDO $pdo, array $lines, bool $mustBalance): array
{
    if (count($lines) < 1 || count($lines) > 200) {
        throw new AccountingApiException('Jurnal harus memiliki 1 sampai 200 baris.');
    }
    $clean = [];
    $debit = 0.0;
    $credit = 0.0;
    foreach ($lines as $index => $line) {
        if (!is_array($line)) throw new AccountingApiException('Format baris jurnal tidak valid.');
        $coaId = trim((string) ($line['coaId'] ?? ''));
        $direction = (string) ($line['direction'] ?? '');
        $memo = trim((string) ($line['memo'] ?? ''));
        $amount = $line['amount'] ?? null;
        if ($coaId === '' || strlen($coaId) > 16 || !in_array($direction, ['DEBIT', 'CREDIT'], true)
            || !is_numeric($amount) || !is_finite((float) $amount) || (float) $amount <= 0
            || strlen($memo) > 250) {
            throw new AccountingApiException('Lengkapi COA aktif, posisi debit/kredit, keterangan maksimal 250 karakter, dan nominal positif pada setiap baris.');
        }
        $accountQuery = $pdo->prepare('SELECT id FROM chart_of_accounts WHERE id = :id AND is_active = 1 LIMIT 1');
        $accountQuery->execute(['id' => $coaId]);
        if (!$accountQuery->fetchColumn()) throw new AccountingApiException('COA pada baris ' . ($index + 1) . ' tidak aktif atau tidak ditemukan.');
        $roundedAmount = round((float) $amount, 2);
        if ($roundedAmount <= 0) throw new AccountingApiException('Nominal jurnal minimal IDR 0,01.');
        if ($direction === 'DEBIT') $debit += $roundedAmount;
        else $credit += $roundedAmount;
        $clean[] = [
            'coaId' => $coaId,
            'memo' => $memo,
            'direction' => $direction,
            'amount' => $roundedAmount,
        ];
    }
    if ($mustBalance && abs(round($debit - $credit, 2)) > 0.01) {
        throw new AccountingApiException('Jurnal belum seimbang. Total Debit dan Kredit harus sama.');
    }
    return $clean;
}

function accountingCleanPostedOverrides(mixed $raw): array
{
    if (!is_array($raw)) throw new AccountingApiException('Metadata laporan jurnal tidak valid.');
    $stringLimits = [
        'arApNumber' => 180,
        'shipment' => 250,
        'customer' => 500,
        'jobVessel' => 250,
        'refNoFda' => 180,
        'bl' => 180,
        'currency' => 12,
        'item' => 500,
        'vendor' => 250,
    ];
    $clean = [];
    foreach ($stringLimits as $key => $limit) {
        $rawValue = $raw[$key] ?? '';
        if (!is_string($rawValue)) throw new AccountingApiException('Kolom ' . $key . ' harus berupa teks.');
        $value = trim($rawValue);
        if (strlen($value) > $limit) throw new AccountingApiException('Kolom ' . $key . ' melebihi batas karakter.');
        $clean[$key] = $value;
    }
    $rawAppliedDate = $raw['appliedDate'] ?? '';
    if (!is_string($rawAppliedDate)) throw new AccountingApiException('Tanggal Applied tidak valid.');
    $appliedDate = trim($rawAppliedDate);
    if ($appliedDate !== '' && !accountingDate($appliedDate)) {
        throw new AccountingApiException('Tanggal Applied tidak valid.');
    }
    $exchangeRate = $raw['exchangeRate'] ?? 0;
    if (!is_numeric($exchangeRate) || !is_finite((float) $exchangeRate) || (float) $exchangeRate < 0) {
        throw new AccountingApiException('Kurs jurnal tidak valid.');
    }
    $clean['appliedDate'] = $appliedDate;
    $clean['exchangeRate'] = round((float) $exchangeRate, 6);
    return $clean;
}

function accountingAllocateNumber(PDO $pdo, int $branchId, string $date): string
{
    $year = (int) substr($date, 0, 4);
    $branchQuery = $pdo->prepare('SELECT code FROM branches WHERE id = :id LIMIT 1');
    $branchQuery->execute(['id' => $branchId]);
    $branchCode = strtoupper(trim((string) $branchQuery->fetchColumn()));
    if ($branchCode === '' || !preg_match('/^[A-Z0-9]{2,10}$/', $branchCode)) {
        throw new AccountingApiException('Branch transaksi belum dipetakan ke kode branch aktif.', 409);
    }
    $insert = $pdo->prepare(
        'INSERT IGNORE INTO accounting_journal_sequences (branch_code, journal_year, last_number) VALUES (:code, :year, 0)'
    );
    $insert->execute(['code' => $branchCode, 'year' => $year]);
    $select = $pdo->prepare(
        'SELECT last_number FROM accounting_journal_sequences WHERE branch_code = :code AND journal_year = :year FOR UPDATE'
    );
    $select->execute(['code' => $branchCode, 'year' => $year]);
    $next = (int) $select->fetchColumn() + 1;
    $update = $pdo->prepare(
        'UPDATE accounting_journal_sequences SET last_number = :next WHERE branch_code = :code AND journal_year = :year'
    );
    $update->execute(['next' => $next, 'code' => $branchCode, 'year' => $year]);
    return sprintf('JRN/%s/%04d/%06d', $branchCode, $year, $next);
}

function accountingAudit(PDO $pdo, array $user, string $journalId, string $action, string $description): void
{
    $query = $pdo->prepare(
        'INSERT INTO audit_logs (id, logged_at, actor_id, actor_name, actor_role, action, entity, entity_id, description) '
        . 'VALUES (:id, UTC_TIMESTAMP(3), :actor_id, :actor_name, :actor_role, :action, \'ACCOUNTING_JOURNAL\', :entity_id, :description)'
    );
    $query->execute([
        'id' => 'AUD-ACCT-' . bin2hex(random_bytes(12)),
        'actor_id' => $user['id'],
        'actor_name' => $user['name'],
        'actor_role' => 'ACCOUNTING',
        'action' => $action,
        'entity_id' => $journalId,
        'description' => $description,
    ]);
}

try {
    $user = accountingRequireUser();
    $action = (string) ($_GET['action'] ?? '');
    if ($action === 'inbox') {
        requireMethod('GET');
        if ($user['role'] !== 'ACCOUNTING') throw new AccountingApiException('Inbox jurnal hanya dapat diakses role Accounting.', 403);
        jsonResponse(accountingInbox(db()));
    }
    if ($action === 'posted-report') {
        requireMethod('GET');
        jsonResponse(['rows' => accountingPostedJournalReport(
            db(),
            trim((string) ($_GET['startDate'] ?? '')),
            trim((string) ($_GET['endDate'] ?? '')),
            strtoupper(trim((string) ($_GET['scope'] ?? 'ALL'))),
            trim((string) ($_GET['branchId'] ?? '')),
        )]);
    }
    if ($action === 'chart-of-accounts') {
        requireMethod('GET');
        $accounts = db()->query(
            'SELECT id, code, account_desc, account_group, is_active FROM chart_of_accounts WHERE is_active = 1 ORDER BY code, account_desc'
        )->fetchAll();
        jsonResponse(['accounts' => array_map(static fn (array $account): array => [
            'id' => (string) $account['id'],
            'code' => (string) $account['code'],
            'accountDesc' => (string) $account['account_desc'],
            'accountGroup' => (string) $account['account_group'],
            'isActive' => (bool) $account['is_active'],
        ], $accounts)]);
    }
    if ($action === 'edit-posted') {
        if ($user['role'] !== 'ACCOUNTING') throw new AccountingApiException('Hanya role Accounting yang dapat mengubah jurnal posted.', 403);
        requireMethod('POST');
        requireCsrfToken();
        $body = requestJson();
        $journalIdValue = $body['journalId'] ?? null;
        $journalDateValue = $body['journalDate'] ?? null;
        $journalId = is_string($journalIdValue) ? trim($journalIdValue) : '';
        $journalDate = is_string($journalDateValue) ? trim($journalDateValue) : '';
        $lines = $body['lines'] ?? null;
        if ($journalId === '' || strlen($journalId) > 100 || !accountingDate($journalDate)
            || !is_array($lines) || count($lines) < 2 || count($lines) > 200) {
            throw new AccountingApiException('Data edit jurnal belum lengkap atau tidak valid.');
        }

        $pdo = db();
        $pdo->beginTransaction();
        $journalQuery = $pdo->prepare(
            'SELECT id, status FROM accounting_journals WHERE id = :id LIMIT 1 FOR UPDATE'
        );
        $journalQuery->execute(['id' => $journalId]);
        $journal = $journalQuery->fetch();
        if (!$journal || $journal['status'] !== 'POSTED') {
            throw new AccountingApiException('Jurnal tidak ditemukan atau statusnya bukan POSTED.', 404);
        }

        $existingLinesQuery = $pdo->prepare(
            'SELECT id, coa_id FROM accounting_journal_lines WHERE journal_id = :journal_id ORDER BY line_no FOR UPDATE'
        );
        $existingLinesQuery->execute(['journal_id' => $journalId]);
        $existingLines = [];
        foreach ($existingLinesQuery->fetchAll() as $line) {
            $existingLines[(string) $line['id']] = (string) $line['coa_id'];
        }
        if (count($existingLines) !== count($lines)) {
            throw new AccountingApiException('Jumlah baris jurnal berubah. Muat ulang data sebelum mengedit.');
        }

        $cleanLines = [];
        $seenLineIds = [];
        $debit = 0.0;
        $credit = 0.0;
        foreach ($lines as $index => $line) {
            if (!is_array($line)) throw new AccountingApiException('Format baris jurnal tidak valid.');
            $lineIdValue = $line['id'] ?? null;
            $coaIdValue = $line['coaId'] ?? null;
            $memoValue = $line['memo'] ?? null;
            $directionValue = $line['direction'] ?? null;
            if (!is_string($lineIdValue) || !is_string($coaIdValue) || !is_string($memoValue) || !is_string($directionValue)) {
                throw new AccountingApiException('Identitas, COA, deskripsi, atau posisi D/K pada jurnal tidak valid.');
            }
            $lineId = trim($lineIdValue);
            $coaId = trim($coaIdValue);
            $memo = trim($memoValue);
            $direction = $directionValue;
            $amount = $line['amount'] ?? null;
            if ($lineId === '' || !isset($existingLines[$lineId]) || isset($seenLineIds[$lineId])
                || $coaId === '' || strlen($coaId) > 16 || !in_array($direction, ['DEBIT', 'CREDIT'], true)
                || !is_numeric($amount) || !is_finite((float) $amount) || (float) $amount <= 0
                || strlen($memo) > 250) {
                throw new AccountingApiException('Lengkapi COA, deskripsi maksimal 250 karakter, posisi D/K, dan nominal positif pada setiap baris.');
            }
            $seenLineIds[$lineId] = true;
            if ($coaId !== $existingLines[$lineId]) {
                $accountQuery = $pdo->prepare('SELECT id FROM chart_of_accounts WHERE id = :id AND is_active = 1 LIMIT 1');
                $accountQuery->execute(['id' => $coaId]);
                if (!$accountQuery->fetchColumn()) {
                    throw new AccountingApiException('COA pada baris ' . ($index + 1) . ' tidak aktif atau tidak ditemukan.');
                }
            }
            $roundedAmount = round((float) $amount, 2);
            if ($roundedAmount <= 0) throw new AccountingApiException('Nominal jurnal minimal IDR 0,01.');
            if ($direction === 'DEBIT') $debit += $roundedAmount;
            else $credit += $roundedAmount;
            $cleanLines[] = [
                'id' => $lineId,
                'coaId' => $coaId,
                'memo' => $memo,
                'direction' => $direction,
                'amount' => $roundedAmount,
                'overrides' => accountingCleanPostedOverrides($line['overrides'] ?? null),
            ];
        }
        if (abs(round($debit - $credit, 2)) > 0.01) {
            throw new AccountingApiException('Jurnal belum seimbang. Total Debit dan Kredit harus sama.');
        }

        $updateJournal = $pdo->prepare(
            'UPDATE accounting_journals SET entry_date = :entry_date, updated_by_user_id = :user_id, updated_by_name = :user_name '
            . 'WHERE id = :id AND status = \'POSTED\''
        );
        $updateJournal->execute([
            'entry_date' => $journalDate,
            'user_id' => $user['id'],
            'user_name' => $user['name'],
            'id' => $journalId,
        ]);
        $updateLine = $pdo->prepare(
            'UPDATE accounting_journal_lines SET coa_id = :coa_id, memo = :memo, direction = :direction, amount = :amount, report_overrides = :overrides '
            . 'WHERE id = :id AND journal_id = :journal_id'
        );
        foreach ($cleanLines as $line) {
            $updateLine->execute([
                'coa_id' => $line['coaId'],
                'memo' => $line['memo'],
                'direction' => $line['direction'],
                'amount' => $line['amount'],
                'overrides' => json_encode($line['overrides'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'id' => $line['id'],
                'journal_id' => $journalId,
            ]);
        }
        accountingAudit($pdo, $user, $journalId, 'EDIT_POSTED', 'Jurnal posted diperbarui melalui Hasil Posted Jurnal.');
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }
    if ($action === 'balance-sheet') {
        requireMethod('GET');
        $pdo = db();
        jsonResponse([
            'report' => accountingBalanceSheet(
                $pdo,
                trim((string) ($_GET['asOf'] ?? '')),
                strtoupper(trim((string) ($_GET['scope'] ?? 'ALL'))),
                trim((string) ($_GET['branchId'] ?? '')),
            ),
            'branches' => accountingReportBranches($pdo),
        ]);
    }
    if ($action === 'profit-loss') {
        requireMethod('GET');
        $pdo = db();
        jsonResponse([
            'report' => accountingProfitLoss(
                $pdo,
                trim((string) ($_GET['startDate'] ?? '')),
                trim((string) ($_GET['endDate'] ?? '')),
                strtoupper(trim((string) ($_GET['scope'] ?? 'ALL'))),
                trim((string) ($_GET['branchId'] ?? '')),
            ),
            'branches' => accountingReportBranches($pdo),
        ]);
    }
    if ($action === 'profit-loss-monthly') {
        requireMethod('GET');
        $pdo = db();
        jsonResponse([
            'reports' => accountingMonthlyProfitLoss(
                $pdo,
                (int) ($_GET['year'] ?? 0),
                strtoupper(trim((string) ($_GET['scope'] ?? 'ALL'))),
                trim((string) ($_GET['branchId'] ?? '')),
            ),
            'branches' => accountingReportBranches($pdo),
        ]);
    }

    if (!in_array($action, ['draft', 'post'], true)) jsonResponse(['error' => 'Unknown Accounting action'], 404);
    if ($user['role'] !== 'ACCOUNTING') throw new AccountingApiException('Direktur hanya memiliki akses baca laporan.', 403);
    requireMethod('POST');
    requireCsrfToken();
    $body = requestJson();
    $sourceType = (string) ($body['sourceType'] ?? '');
    $sourceKey = trim((string) ($body['sourceKey'] ?? ''));
    $entryDate = trim((string) ($body['entryDate'] ?? ''));
    $description = trim((string) ($body['description'] ?? ''));
    $lines = $body['lines'] ?? null;
    if (!in_array($sourceType, ['PAYABLE', 'RECEIVABLE'], true) || $sourceKey === '' || strlen($sourceKey) > 180
        || !accountingDate($entryDate) || $description === '' || strlen($description) > 5000 || !is_array($lines)) {
        throw new AccountingApiException('Data jurnal belum lengkap atau tidak valid.');
    }

    $pdo = db();
    $source = null;
    foreach (accountingSources($pdo) as $candidate) {
        if ($candidate['sourceType'] === $sourceType && $candidate['sourceKey'] === $sourceKey) {
            $source = $candidate;
            break;
        }
    }
    if ($source === null) throw new AccountingApiException('Transaksi sumber tidak ditemukan atau belum dibayar/diterima.', 404);
    if ($source['branchId'] === '') throw new AccountingApiException('Branch sumber belum ditetapkan. Hubungi Admin sebelum menjurnal.', 409);
    $mustBalance = $action === 'post';
    $cleanLines = accountingValidateLines($pdo, $lines, $mustBalance);

    $pdo->beginTransaction();
    $existingQuery = $pdo->prepare(
        'SELECT id, status, created_by_user_id, created_by_name FROM accounting_journals '
        . 'WHERE source_type = :source_type AND source_key = :source_key LIMIT 1 FOR UPDATE'
    );
    $existingQuery->execute(['source_type' => $sourceType, 'source_key' => $sourceKey]);
    $existing = $existingQuery->fetch();
    if ($existing && $existing['status'] === 'POSTED') {
        throw new AccountingApiException('Jurnal sudah diposting dan tidak dapat diubah.', 409);
    }

    $journalId = $existing ? (string) $existing['id'] : 'ACJ-' . bin2hex(random_bytes(16));
    $journalNumber = $action === 'post'
        ? accountingAllocateNumber($pdo, (int) $source['branchId'], $entryDate)
        : null;
    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE accounting_journals SET journal_number = :journal_number, entry_date = :entry_date, description = :description, '
            . 'status = :status, updated_by_user_id = :updated_by_user_id, updated_by_name = :updated_by_name, '
            . 'posted_by_user_id = :posted_by_user_id, posted_by_name = :posted_by_name, posted_at = :posted_at '
            . 'WHERE id = :id AND status = \'DRAFT\''
        );
        $update->execute([
            'journal_number' => $journalNumber,
            'entry_date' => $entryDate,
            'description' => $description,
            'status' => $mustBalance ? 'POSTED' : 'DRAFT',
            'updated_by_user_id' => $user['id'],
            'updated_by_name' => $user['name'],
            'posted_by_user_id' => $mustBalance ? $user['id'] : null,
            'posted_by_name' => $mustBalance ? $user['name'] : null,
            'posted_at' => $mustBalance ? gmdate('Y-m-d H:i:s') : null,
            'id' => $journalId,
        ]);
        $deleteLines = $pdo->prepare('DELETE FROM accounting_journal_lines WHERE journal_id = :id');
        $deleteLines->execute(['id' => $journalId]);
    } else {
        $insert = $pdo->prepare(
            'INSERT INTO accounting_journals (id, journal_number, source_type, source_key, source_id, branch_id, branch_name, '
            . 'entry_date, description, status, created_by_user_id, created_by_name, updated_by_user_id, updated_by_name, '
            . 'posted_by_user_id, posted_by_name, posted_at) VALUES (:id, :journal_number, :source_type, :source_key, :source_id, '
            . ':branch_id, :branch_name, :entry_date, :description, :status, :created_by_user_id, :created_by_name, '
            . ':updated_by_user_id, :updated_by_name, :posted_by_user_id, :posted_by_name, :posted_at)'
        );
        $insert->execute([
            'id' => $journalId,
            'journal_number' => $journalNumber,
            'source_type' => $sourceType,
            'source_key' => $sourceKey,
            'source_id' => $source['sourceId'],
            'branch_id' => $source['branchId'],
            'branch_name' => $source['branchName'],
            'entry_date' => $entryDate,
            'description' => $description,
            'status' => $mustBalance ? 'POSTED' : 'DRAFT',
            'created_by_user_id' => $user['id'],
            'created_by_name' => $user['name'],
            'updated_by_user_id' => $user['id'],
            'updated_by_name' => $user['name'],
            'posted_by_user_id' => $mustBalance ? $user['id'] : null,
            'posted_by_name' => $mustBalance ? $user['name'] : null,
            'posted_at' => $mustBalance ? gmdate('Y-m-d H:i:s') : null,
        ]);
    }

    $insertLine = $pdo->prepare(
        'INSERT INTO accounting_journal_lines (id, journal_id, line_no, coa_id, memo, direction, amount) '
        . 'VALUES (:id, :journal_id, :line_no, :coa_id, :memo, :direction, :amount)'
    );
    foreach ($cleanLines as $index => $line) {
        $insertLine->execute([
            'id' => 'ACL-' . bin2hex(random_bytes(12)),
            'journal_id' => $journalId,
            'line_no' => $index + 1,
            'coa_id' => $line['coaId'],
            'memo' => $line['memo'],
            'direction' => $line['direction'],
            'amount' => $line['amount'],
        ]);
    }

    accountingAudit(
        $pdo,
        $user,
        $journalId,
        $mustBalance ? 'POST' : ($existing ? 'UPDATE_DRAFT' : 'CREATE_DRAFT'),
        ($mustBalance ? 'Jurnal diposting' : ($existing ? 'Draft jurnal diperbarui' : 'Draft jurnal dibuat'))
            . ' untuk ' . $sourceType . ' ' . $sourceKey . ' (' . $source['branchName'] . ').',
    );
    $pdo->commit();
    jsonResponse([
        'ok' => true,
        'journalId' => $journalId,
        'journalNumber' => $journalNumber,
        'status' => $mustBalance ? 'POSTED' : 'DRAFT',
    ]);
} catch (AccountingApiException $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    jsonResponse(['error' => $error->getMessage()], $error->status);
} catch (PDOException $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    error_log('MaritimPort accounting database error: ' . $error->getMessage());
    jsonResponse(['error' => 'Accounting journal operation failed'], 500);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    error_log('MaritimPort accounting error: ' . $error->getMessage());
    jsonResponse(['error' => 'Accounting operation failed'], 500);
}
