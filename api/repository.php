<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

class DatabaseSchemaException extends RuntimeException
{
}

function tableColumns(PDO $pdo, string $table): ?array
{
    static $cache = [];
    if (!array_key_exists($table, $cache)) {
        try {
            $cache[$table] = array_column($pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(), 'Field');
        } catch (PDOException $error) {
            $cache[$table] = null;
        }
    }
    return $cache[$table];
}

function tableRows(string $table): array
{
    if (tableColumns(db(), $table) === null) return [];
    return db()->query("SELECT * FROM `{$table}`")->fetchAll();
}

function indexBy(array $rows, string $key): array
{
    $indexed = [];
    foreach ($rows as $row) $indexed[(string) $row[$key]] = $row;
    return $indexed;
}

function rowsByJob(string $table): array
{
    $grouped = [];
    foreach (tableRows($table) as $row) $grouped[(string) $row['job_id']][] = $row;
    return $grouped;
}

function rowsGroupedBy(string $table, string $column): array
{
    $grouped = [];
    foreach (tableRows($table) as $row) $grouped[(string) $row[$column]][] = $row;
    return $grouped;
}

function appDateTime(?string $value): ?string
{
    if (!$value) return null;
    try {
        $timestamp = new DateTimeImmutable($value, new DateTimeZone('UTC'));
    } catch (Exception) {
        return null;
    }
    return $timestamp->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

function loadAppState(): array
{
    $users = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'name' => $row['name'], 'email' => $row['email'],
        'username' => $row['username'], 'role' => $row['role'], 'department' => $row['department'],
        'branch' => $row['branch_name'] ?? '', 'position' => $row['position'],
        'phone' => $row['phone'], 'status' => $row['status'],
    ], tableRows('users'));
    $customers = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'code' => $row['code'], 'companyName' => $row['company_name'],
        'country' => $row['country'], 'type' => $row['customer_type'], 'contactPerson' => $row['contact_person'],
        'email' => $row['email'], 'phone' => $row['phone'], 'address' => $row['address'],
        'creditTermDays' => (int) $row['credit_term_days'],
    ], tableRows('customers'));
    $vessels = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'name' => $row['name'], 'imoNumber' => $row['imo_number'],
        'callSign' => $row['call_sign'], 'flag' => $row['flag'], 'vesselType' => $row['vessel_type'],
        'grt' => (float) $row['grt'], 'nrt' => (float) $row['nrt'], 'dwt' => (float) $row['dwt'],
        'loa' => (float) $row['loa'], 'beam' => (float) $row['beam'], 'yearBuilt' => (int) ($row['year_built'] ?? 0),
    ], tableRows('vessels'));
    $ports = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'code' => $row['code'], 'name' => $row['name'], 'country' => $row['country'],
        'channelDepthMeters' => (int) $row['channel_depth_meters'],
        'tideRestriction' => $row['tide_restriction'] ?? '', 'operatingHours' => $row['operating_hours'] ?? '',
    ], tableRows('ports'));
    $portNames = indexBy($ports, 'id');
    $zones = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'portId' => $row['port_id'], 'portName' => $row['port_name'] ?? $portNames[$row['port_id']]['name'] ?? '',
        'zoneCode' => $row['zone_code'], 'zoneName' => $row['zone_name'], 'type' => $row['zone_type'],
        'maxDraftMeters' => (float) $row['max_draft_meters'], 'description' => $row['description'] ?? '',
    ], tableRows('zones'));
    $fixTariffs = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'portId' => $row['port_id'], 'portName' => $row['port_name'] ?? $portNames[$row['port_id']]['name'] ?? '',
        'serviceName' => $row['service_name'], 'costCategory' => $row['cost_category'],
        'grtMin' => $row['grt_min'] === null ? null : (int) $row['grt_min'],
        'grtMax' => $row['grt_max'] === null ? null : (int) $row['grt_max'],
        'dwt' => $row['dwt'] === null ? null : (int) $row['dwt'],
        'calculationBasis' => $row['calculation_basis'], 'tariffType' => $row['tariff_type'],
        ...($row['rate_idr'] === null ? [] : ['rateIDR' => (float) $row['rate_idr']]),
        ...($row['rate_usd'] === null ? [] : ['rateUSD' => (float) $row['rate_usd']]), 'remarks' => $row['remarks'] ?? '',
    ], tableRows('fix_tariffs'));
    $expensesItems = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'portId' => $row['port_id'], 'portName' => $row['port_name'] ?? $portNames[$row['port_id']]['name'] ?? '',
        'code' => $row['code'], 'category' => $row['category'], 'name' => $row['name'],
        ...($row['rate_idr'] === null ? [] : ['rateIDR' => (float) $row['rate_idr']]),
        ...($row['rate_usd'] === null ? [] : ['rateUSD' => (float) $row['rate_usd']]),
        'calculationType' => $row['calculation_type'], 'remarks' => $row['remarks'] ?? '',
    ], tableRows('expenses_items'));
    $vendorPartners = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'vendorName' => $row['vendor_name'], 'bankName' => $row['bank_name'] ?? '',
        'picName' => $row['pic_name'] ?? '', 'address' => $row['address'] ?? '', 'phone' => $row['phone'] ?? '',
        'paidName' => $row['paid_name'] ?? '', 'accountNumber' => $row['account_number'] ?? '',
    ], tableRows('vendor_partners'));
    $bankAccounts = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'bankName' => $row['bank_name'], 'accountName' => $row['account_name'],
        'branch' => $row['branch'] ?? '', 'accountNumber' => $row['account_number'],
    ], tableRows('bank_accounts'));
    $voucherItems = [];
    foreach (tableRows('payment_voucher_items') as $row) {
        $voucherItems[$row['voucher_id']][] = [
            'line' => (int) $row['line_no'], 'id' => $row['id'], 'jobNumber' => $row['job_number'], 'customerName' => $row['customer_name'],
            'documentType' => $row['document_type'] ?? null, 'documentNumber' => $row['document_number'] ?? null,
            'itemService' => $row['item_service'], 'amount' => (float) $row['amount'], 'vatApplied' => (bool) $row['vat_applied'],
            'vatAmount' => (float) $row['vat_amount'], 'total' => (float) $row['total'], 'pph23Applied' => (bool) $row['pph23_applied'],
            'pph23Amount' => (float) $row['pph23_amount'], 'paidAmount' => (float) $row['paid_amount'],
        ];
    }
    $paymentVouchers = array_map(static function (array $row) use ($voucherItems): array {
        $items = $voucherItems[$row['id']] ?? [];
        usort($items, static fn (array $a, array $b): int => $a['line'] <=> $b['line']);
        return [
            'id' => $row['id'], 'voucherNumber' => $row['voucher_number'] ?: null, 'requestNumber' => $row['request_number'], 'requestDate' => $row['request_date'], 'currency' => $row['currency'] ?? 'IDR', 'exchangeRateUSDToIDR' => (float) ($row['exchange_rate_usd_to_idr'] ?? 0), 'exchangeRateDate' => $row['exchange_rate_date'] ?? '', 'requestedPaymentDate' => $row['requested_payment_date'] ?? $row['request_date'], 'jobInfo' => $row['job_info'],
            'paidFromBankAccountId' => $row['paid_from_bank_account_id'] ?? '',
            'requestBy' => $row['request_by'], 'requestByUserId' => $row['request_by_user_id'] ?? null, 'vendorPartnerId' => $row['vendor_partner_id'] ?? '', 'vendorName' => $row['vendor_name'],
            'paidTo' => $row['paid_to'] ?? '', 'bankName' => $row['bank_name'] ?? '', 'accountNumber' => $row['account_number'] ?? '',
            'items' => array_map(static function (array $item): array { unset($item['line']); return $item; }, $items),
            'totalPaidAmount' => (float) $row['total_paid_amount'], 'createdAt' => appDateTime($row['created_at']),
                        'status' => $row['status'] ?? 'PENDING_MANAGER', 'managerNote' => $row['manager_note'] ?? '', 'reviewedBy' => $row['reviewed_by'] ?? '',
                        'reviewedAt' => !empty($row['reviewed_at']) ? appDateTime($row['reviewed_at']) : '', 'paidBy' => $row['paid_by'] ?? '',
                        'paidAt' => !empty($row['paid_at']) ? appDateTime($row['paid_at']) : '',
                        'paymentProofDataUrl' => $row['payment_proof_data_url'] ?? '',
                        'paymentSurcharge' => (float) ($row['payment_surcharge'] ?? 0),
                        'paymentOtherExpenses' => (float) ($row['payment_other_expenses'] ?? 0),
                        'paymentDescription' => $row['payment_description'] ?? '',
                        'paymentTotalAmount' => (float) ($row['payment_total_amount'] ?? 0) ?: (float) $row['total_paid_amount'],
                    ];
    }, tableRows('payment_vouchers'));

    $itemsByQuote = [];
    $quotationItemRows = tableRows('quotation_items');
    usort($quotationItemRows, static fn (array $a, array $b): int =>
        strcmp($a['quotation_id'], $b['quotation_id'])
        ?: ((int) $a['entry_order'] <=> (int) $b['entry_order'])
    );
    foreach ($quotationItemRows as $row) {
        $itemsByQuote[$row['quotation_id']][] = [
            'id' => $row['id'], 'expenseItemId' => $row['expense_item_id'] ?? '', 'name' => $row['name'],
            'category' => $row['category'], 'basis' => $row['basis'] ?? '', 'quantity' => (float) $row['quantity'],
            'amount' => (float) $row['amount'],
            'currency' => $row['currency'], 'tariffType' => $row['tariff_type'], 'calculationBasis' => $row['calculation_basis'],
            'tariffRate' => $row['tariff_rate'] === null ? null : (float) $row['tariff_rate'], 'remarks' => $row['remarks'],
            'vatApplied' => (bool) $row['vat_applied'], 'pph23Applied' => (bool) $row['pph23_applied'],
        ];
    }
    $quotesByJob = [];
    foreach (tableRows('quotations') as $row) {
        $quotesByJob[$row['job_id']][$row['quote_type']] = [
            'quoteNo' => $row['quote_no'], 'date' => (string) $row['quote_date'], 'currency' => $row['currency'],
            'eta' => appDateTime($row['eta'] ?? null) ?? '', 'etd' => appDateTime($row['etd'] ?? null) ?? '',
            'etaRemarks' => $row['eta_remarks'] ?? '', 'etdRemarks' => $row['etd_remarks'] ?? '',
            'exchangeRateUSDToIDR' => (float) $row['exchange_rate_usd_to_idr'],
            'pph23Applied' => (bool) $row['pph23_applied'],
            'globalVatApplied' => (bool) $row['global_vat_applied'],
            'items' => $itemsByQuote[$row['id']] ?? [], 'totalAmount' => (float) $row['total_amount'],
            'status' => $row['status'],
        ];
    }
    $inquiries = indexBy(tableRows('inquiries'), 'job_id');
    $approvals = indexBy(tableRows('manager_approvals'), 'job_id');
    $operations = indexBy(tableRows('operational_data'), 'job_id');
    $sofByJob = rowsByJob('statements_of_fact');
    $fdas = indexBy(tableRows('fda_records'), 'job_id');
    $fdaItemsByJob = rowsByJob('fda_items');
    $apByJob = rowsByJob('ap_items');
    $arByJob = rowsByJob('ar_items');
    $receiptsByJob = rowsByJob('principal_receipts');
    $financeReceivablesByJob = [];
    $financeReceivableRows = db()->query(
        "SELECT id, job_id, invoice_type, income_date, remark, bank_name, idr_amount, usd_amount "
        . "FROM accounts_receivable_entries WHERE subject_data = 'PRINCIPAL' AND job_id IS NOT NULL"
    )->fetchAll();
    foreach ($financeReceivableRows as $financeReceivable) {
        $financeReceivablesByJob[(string) $financeReceivable['job_id']][] = $financeReceivable;
    }
    $invoices = indexBy(tableRows('principal_invoices'), 'job_id');
    $closings = indexBy(tableRows('closing_records'), 'job_id');
    $crewPlans = indexBy(tableRows('crew_change_plans'), 'job_id');
    $crewMembers = rowsGroupedBy('crew_members', 'crew_change_plan_id');
    $vesselById = indexBy(tableRows('vessels'), 'id');
    $portById = indexBy(tableRows('ports'), 'id');
    $customerById = indexBy(tableRows('customers'), 'id');
    $jobCalls = [];

    foreach (tableRows('vessel_calls') as $job) {
        $jobId = $job['job_id'];
        $inquiry = $inquiries[$jobId] ?? [];
        $approval = $approvals[$jobId] ?? [];
        $operation = $operations[$jobId] ?? [];
        $fda = $fdas[$jobId] ?? [];
        $invoice = $invoices[$jobId] ?? [];
        $closing = $closings[$jobId] ?? [];
        $quotes = $quotesByJob[$jobId] ?? [];
        $epda = $quotes['EPDA'] ?? ['quoteNo' => '', 'date' => (string) date('Y-m-d'), 'currency' => $job['currency'], 'exchangeRateUSDToIDR' => (float) $job['exchange_rate_usd_to_idr'], 'items' => [], 'totalAmount' => 0, 'status' => 'DRAFT'];
        $plan = $crewPlans[$jobId] ?? [];
        $members = [];
        foreach ($crewMembers[$plan['id'] ?? ''] ?? [] as $member) {
            $members[] = ['id' => $member['id'], 'name' => $member['name'], 'passportNumber' => $member['passport_number'], 'seamanBook' => $member['seaman_book'], 'rank' => $member['rank'], 'nationality' => $member['nationality'], 'type' => $member['crew_type'], 'flightDetails' => $member['flight_details'], 'hotelBooked' => (bool) $member['hotel_booked'], 'transitCostUSD' => (float) $member['transit_cost_usd'], 'immigrationStatus' => $member['immigration_status']];
        }
        $crewChange = ['id' => $plan['id'] ?? '', 'date' => $plan['plan_date'] ?? (string) date('Y-m-d'), 'signOnCount' => (int) ($plan['sign_on_count'] ?? 0), 'signOffCount' => (int) ($plan['sign_off_count'] ?? 0), 'logisticsCost' => (float) ($plan['logistics_cost'] ?? 0), 'immigrationVisaCost' => (float) ($plan['immigration_visa_cost'] ?? 0), 'transportCost' => (float) ($plan['transport_cost'] ?? 0), 'totalCostUSD' => (float) ($plan['total_cost_usd'] ?? 0), 'totalCostIDR' => (float) ($plan['total_cost_idr'] ?? 0), 'status' => $plan['status'] ?? 'PLANNED', 'members' => $members];
        $statementOfFacts = array_map(static fn (array $row): array => ['id' => $row['id'], 'timestamp' => appDateTime($row['event_time']), 'event' => $row['event'], 'remarks' => $row['remarks'] ?? ''], $sofByJob[$jobId] ?? []);
        $mapFinancial = static fn (array $row): array => $row;
        $principalReceipts = array_map(static fn (array $row): array => [
            'id' => $row['id'], 'jobId' => $row['job_id'], 'receivedDate' => (string) $row['received_date'],
            'amount' => (float) $row['amount'], 'currency' => $row['currency'], 'exchangeRateUSDToIDR' => (float) ($row['exchange_rate_usd_to_idr'] ?? 0), 'paymentType' => $row['payment_type'],
            'refundAmount' => (float) ($row['refund_amount'] ?? 0),
            'refundExchangeRateUSDToIDR' => (float) ($row['refund_exchange_rate_usd_to_idr'] ?? 0),
            'refundDate' => $row['refund_date'] ?? null,
            'refundBankReference' => $row['refund_bank_reference'] ?? '',
            'refundStatus' => $row['refund_status'] ?? 'NONE',
            'bankRemark' => $row['bank_remark'], 'attachmentName' => $row['attachment_name'],
            'attachmentDataUrl' => $row['attachment_data_url'],
        ], $receiptsByJob[$jobId] ?? []);
        $principalReceiptIds = array_fill_keys(array_column($principalReceipts, 'id'), true);
        foreach ($financeReceivablesByJob[$jobId] ?? [] as $financeReceivable) {
            $paymentType = $financeReceivable['invoice_type'] === 'FDA' ? 'ADVANCE_PAYMENT' : 'INVOICE';
            foreach (['IDR' => (float) $financeReceivable['idr_amount'], 'USD' => (float) $financeReceivable['usd_amount']] as $currency => $amount) {
                $receiptId = 'FIN-AR-' . $financeReceivable['id'] . '-' . $currency;
                $alreadyRecorded = false;
                foreach ($principalReceipts as $existingReceipt) {
                    if (($existingReceipt['paymentType'] ?? '') === $paymentType
                        && ($existingReceipt['receivedDate'] ?? '') === (string) $financeReceivable['income_date']
                        && ($existingReceipt['currency'] ?? '') === $currency
                        && abs((float) ($existingReceipt['amount'] ?? 0) - $amount) < 0.005) {
                        $alreadyRecorded = true;
                        break;
                    }
                }
                if ($amount <= 0 || $alreadyRecorded || isset($principalReceiptIds[$receiptId])) continue;
                $principalReceiptIds[$receiptId] = true;
                $principalReceipts[] = [
                    'id' => $receiptId,
                    'jobId' => $jobId,
                    'receivedDate' => (string) $financeReceivable['income_date'],
                    'amount' => $amount,
                    'currency' => $currency,
                    'paymentType' => $paymentType,
                    'bankRemark' => trim((string) $financeReceivable['remark']) . ' | ' . $financeReceivable['bank_name'],
                    'attachmentName' => null,
                    'attachmentDataUrl' => null,
                ];
            }
        }
        $jobCalls[] = [
            'jobId' => $jobId, 'vesselId' => $job['vessel_id'], 'vesselName' => $vesselById[$job['vessel_id']]['name'] ?? '',
            'portId' => $job['port_id'], 'portName' => $portById[$job['port_id']]['name'] ?? '',
            'customerId' => $job['customer_id'], 'customerName' => $customerById[$job['customer_id']]['company_name'] ?? '',
            'currency' => $job['currency'], 'exchangeRateUSDToIDR' => (float) $job['exchange_rate_usd_to_idr'],
            'eta' => appDateTime($job['eta']) ?? '', 'etd' => appDateTime($job['etd']) ?? '', 'purposeOfCall' => $inquiry['purpose_of_call'] ?? $job['purpose_of_call'],
            'currentStage' => $job['current_stage'], 'status' => $job['status'],
            'voidedAt' => appDateTime($job['voided_at'] ?? null) ?? '',
            'voidedBy' => $job['voided_by_name'] ?? '',
            'voidReason' => $job['void_reason'] ?? '',
            'createdAt' => appDateTime($job['created_at']), 'updatedAt' => appDateTime($job['updated_at']),
            'inquiry' => ['inquiryNo' => $inquiry['inquiry_no'] ?? '', 'date' => $inquiry['inquiry_date'] ?? date('Y-m-d'), 'eta' => appDateTime($inquiry['eta'] ?? null) ?? '', 'etd' => appDateTime($inquiry['etd'] ?? null) ?? '', 'etaRemarks' => $inquiry['eta_remarks'] ?? '', 'etdRemarks' => $inquiry['etd_remarks'] ?? '', 'cargoQuantity' => isset($inquiry['cargo_quantity']) ? (float) $inquiry['cargo_quantity'] : null, 'quantityUnit' => ($inquiry['quantity_unit'] ?? 'TON') === 'MATRIX_TON' ? 'MT' : ($inquiry['quantity_unit'] ?? 'TON'), 'cargoDetails' => $inquiry['cargo_details'] ?? '', 'estimatedDays' => (float) ($inquiry['estimated_days'] ?? 0), 'specialRequirements' => $inquiry['special_requirements'] ?? '', 'status' => $inquiry['status'] ?? 'RECEIVED', 'createdBy' => $inquiry['created_by'] ?? $inquiry['created_by_name'] ?? '', 'createdByName' => $inquiry['created_by_name'] ?? '', 'createdByUserId' => ($inquiry['created_by_user_id'] ?? null) ?: null, 'createdByBranch' => $inquiry['created_by_branch'] ?? ''],
            'quotation' => ['epda' => $epda, 'crewChange' => $crewChange],
            'managerApproval' => ['status' => $approval['status'] ?? 'PENDING', 'approvedBy' => $approval['approved_by_name'] ?? '', 'approvedAt' => appDateTime($approval['approved_at'] ?? null), 'notes' => $approval['notes'] ?? ''],
            'operationalData' => ['ata' => appDateTime($operation['ata'] ?? null), 'atb' => appDateTime($operation['atb'] ?? null), 'atd' => appDateTime($operation['atd'] ?? null), 'berthZoneName' => $operation['berth_zone_name'] ?? '', 'statementOfFacts' => $statementOfFacts],
            'fda' => ['fdaNo' => $fda['fda_no'] ?? '', 'date' => $fda['fda_date'] ?? date('Y-m-d'), 'eta' => appDateTime($fda['eta'] ?? null) ?? '', 'etd' => appDateTime($fda['etd'] ?? null) ?? '', 'etaRemarks' => $fda['eta_remarks'] ?? '', 'etdRemarks' => $fda['etd_remarks'] ?? '', 'currency' => $fda['currency'] ?? $job['currency'], 'exchangeRateUSDToIDR' => (float) ($fda['exchange_rate_usd_to_idr'] ?? $job['exchange_rate_usd_to_idr']), 'pph23Applied' => (bool) ($fda['pph23_applied'] ?? false), 'globalVatApplied' => (bool) ($fda['global_vat_applied'] ?? false), 'finalBilledToPrincipal' => (float) ($fda['final_billed_to_principal'] ?? $epda['totalAmount'] ?? 0), 'fdaApproved' => (bool) ($fda['fda_approved'] ?? false), 'approvalStatus' => $fda['approval_status'] ?? 'DRAFT', 'submittedBy' => $fda['submitted_by_name'] ?? '', 'submittedAt' => appDateTime($fda['submitted_at'] ?? null), 'approvedBy' => $fda['approved_by_name'] ?? '', 'approvedAt' => appDateTime($fda['approved_at'] ?? null), 'notes' => $fda['notes'] ?? '', 'pdfFileName' => $fda['pdf_file_name'] ?? '', 'pdfDataUrl' => $fda['pdf_data_url'] ?? ''],
            'fdaItems' => array_map(static fn (array $item): array => ['id' => $item['id'], 'jobId' => $item['job_id'], 'itemCode' => $item['item_code'], 'description' => $item['description'], 'category' => $item['category'], 'vendorName' => $item['vendor_name'], 'invoiceOrVoucherNo' => $item['invoice_or_voucher_no'], 'date' => (string) $item['cost_date'], 'quantity' => (float) $item['quantity'], 'amount' => (float) $item['amount'], 'currency' => $item['currency'], 'estimatedAmount' => (float) $item['estimated_amount'], 'tariffType' => $item['tariff_type'], 'calculationBasis' => $item['calculation_basis'], 'tariffRate' => $item['tariff_rate'] === null ? null : (float) $item['tariff_rate'], 'tariffDescription' => $item['tariff_description'], 'varianceAmount' => (float) $item['variance_amount'], 'status' => $item['status'], 'attachmentName' => $item['attachment_name'], 'attachmentDataUrl' => $item['attachment_data_url'], 'remarks' => $item['remarks'], 'vatApplied' => (bool) $item['vat_applied'], 'pph23Applied' => (bool) $item['pph23_applied']], $fdaItemsByJob[$jobId] ?? []),
            'ap' => array_map(static fn (array $row): array => ['id' => $row['id'], 'jobId' => $row['job_id'], 'voucherNo' => $row['voucher_no'], 'vendorName' => $row['vendor_name'], 'description' => $row['description'], 'invoiceDate' => (string) $row['invoice_date'], 'dueDate' => (string) $row['due_date'], 'amount' => (float) $row['amount'], 'currency' => $row['currency'], 'status' => $row['status'], 'paymentRef' => $row['payment_ref'], 'paidDate' => $row['paid_date']], $apByJob[$jobId] ?? []),
            'ar' => array_map(static fn (array $row): array => ['id' => $row['id'], 'jobId' => $row['job_id'], 'referenceNo' => $row['reference_no'], 'principalName' => $row['principal_name'], 'description' => $row['description'], 'requestedAmount' => (float) $row['requested_amount'], 'receivedAmount' => (float) $row['received_amount'], 'currency' => $row['currency'], 'receivedDate' => $row['received_date'], 'bankAccount' => $row['bank_account'], 'status' => $row['status']], $arByJob[$jobId] ?? []),
            'principalReceipts' => $principalReceipts,
            'principalInvoice' => ['invoiceNo' => $invoice['invoice_no'] ?? '', 'invoiceDate' => $invoice['invoice_date'] ?? date('Y-m-d'), 'dueDate' => $invoice['due_date'] ?? date('Y-m-d'), 'totalAmountUSD' => (float) ($invoice['total_amount_usd'] ?? 0), 'totalAmountIDR' => (float) ($invoice['total_amount_idr'] ?? 0), 'advanceDeductedUSD' => (float) ($invoice['advance_deducted_usd'] ?? 0), 'advanceDeductedIDR' => (float) ($invoice['advance_deducted_idr'] ?? 0), 'balanceDueUSD' => (float) ($invoice['balance_due_usd'] ?? 0), 'balanceDueIDR' => (float) ($invoice['balance_due_idr'] ?? 0), 'status' => $invoice['status'] ?? 'DRAFT', 'pdfGenerated' => (bool) ($invoice['pdf_generated'] ?? false)],
            'closing' => ['isClosed' => (bool) ($closing['is_closed'] ?? false), 'closedAt' => appDateTime($closing['closed_at'] ?? null), 'closedBy' => $closing['closed_by_name'] ?? '', 'postVoyageRemarks' => $closing['post_voyage_remarks'] ?? ''],
        ];
    }

    $auditLogs = array_map(static fn (array $row): array => ['id' => $row['id'], 'timestamp' => appDateTime($row['logged_at']), 'actorId' => $row['actor_id'], 'actorName' => $row['actor_name'], 'role' => $row['actor_role'], 'action' => $row['action'], 'entity' => $row['entity'], 'entityId' => $row['entity_id'], 'description' => $row['description']], tableRows('audit_logs'));
    $reservedJobIds = array_column(tableRows('job_call_number_registry'), 'job_id');
    return ['users' => $users, 'customers' => $customers, 'vessels' => $vessels, 'ports' => $ports, 'zones' => $zones, 'fixTariffs' => $fixTariffs, 'expensesItems' => $expensesItems, 'vendorPartners' => $vendorPartners, 'bankAccounts' => $bankAccounts, 'paymentVouchers' => $paymentVouchers, 'jobCalls' => $jobCalls, 'reservedJobIds' => $reservedJobIds, 'currentRole' => $_SESSION['user']['role'] ?? 'ADMIN', 'selectedJobId' => $jobCalls[0]['jobId'] ?? '', 'auditLogs' => $auditLogs];
}

function normalizedCostCategory(array $item, array $fixTariffs): string
{
    $validCategories = ['PORT SERVICE', 'PORT EXPENSES', 'CLEARANCE IN/OUT', 'GENERAL EXPENSES', 'CREW EXPENSES', 'OWNER MATTER', 'AGENCY FEE'];
    $normalize = static fn (mixed $value): string => strtoupper((string) preg_replace('/\s+/', ' ', preg_replace('/[_-]+/', ' ', trim((string) ($value ?? '')))));
    $aliases = [
        'PORT DUES' => 'PORT EXPENSES',
        'BERTHING' => 'PORT EXPENSES',
        'CLEARANCE' => 'CLEARANCE IN/OUT',
        'PILOTAGE TOWAGE' => 'CLEARANCE IN/OUT',
        'IMMIGRATION CUSTOMS' => 'CLEARANCE IN/OUT',
        'LOGISTICS SUPPLIES' => 'GENERAL EXPENSES',
        'SUNDRY' => 'GENERAL EXPENSES',
        'TAX CONTINGENCY' => 'GENERAL EXPENSES',
        'CREW CHANGE' => 'CREW EXPENSES',
    ];
    $category = $aliases[$normalize($item['category'] ?? '')] ?? $normalize($item['category'] ?? '');
    if (in_array($category, $validCategories, true)) return $category;

    $itemName = strtolower(trim((string) ($item['name'] ?? '')));
    foreach ($fixTariffs as $tariff) {
        if (strtolower(trim((string) ($tariff['serviceName'] ?? ''))) !== $itemName) continue;
        $tariffCategory = $aliases[$normalize($tariff['costCategory'] ?? '')] ?? $normalize($tariff['costCategory'] ?? '');
        if (in_array($tariffCategory, $validCategories, true)) return $tariffCategory;
    }

    return 'PORT EXPENSES';
}

function insertRow(PDO $pdo, string $table, array $row): void
{
    if (!$row) return;
    $existing = tableColumns($pdo, $table);
    if ($existing === null) return;
    $row = array_intersect_key($row, array_flip($existing));
    $columns = array_keys($row);
    foreach ($columns as $column) {
        if (!preg_match('/^[a-z][a-z0-9_]*$/', $column)) throw new RuntimeException('Invalid database column');
    }
    $quoted = implode(', ', array_map(static fn (string $column): string => "`{$column}`", $columns));
    $placeholders = implode(', ', array_map(static fn (string $column): string => ":{$column}", $columns));
    $statement = $pdo->prepare("INSERT INTO `{$table}` ({$quoted}) VALUES ({$placeholders})");
    $statement->execute($row);
}

function upsertRow(PDO $pdo, string $table, array $row, string $keyColumn = 'id'): void
{
    $existing = tableColumns($pdo, $table);
    if ($existing === null || !$row) return;
    $row = array_intersect_key($row, array_flip($existing));
    $columns = array_keys($row);
    foreach ($columns as $column) {
        if (!preg_match('/^[a-z][a-z0-9_]*$/', $column)) throw new RuntimeException('Invalid database column');
    }
    $quoted = implode(', ', array_map(static fn (string $column): string => "`{$column}`", $columns));
    $placeholders = implode(', ', array_map(static fn (string $column): string => ":{$column}", $columns));
    $updates = implode(', ', array_map(
        static fn (string $column): string => "`{$column}` = VALUES(`{$column}`)",
        array_values(array_diff($columns, [$keyColumn])),
    ));
    $pdo->prepare("INSERT INTO `{$table}` ({$quoted}) VALUES ({$placeholders}) ON DUPLICATE KEY UPDATE {$updates}")->execute($row);
}

function sqlDate(?string $value, bool $dateOnly = false): ?string
{
    if (!$value) return null;
    try {
        $timestamp = new DateTimeImmutable($value, new DateTimeZone('Asia/Jakarta'));
    } catch (Exception) {
        return null;
    }
    return $dateOnly
        ? $timestamp->setTimezone(new DateTimeZone('Asia/Jakarta'))->format('Y-m-d')
        : $timestamp->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}

function uniqueRecordId(array &$used, string $id, string $scope): string
{
    if (isset($used[$id])) $id = $id . '-' . $scope;
    $used[$id] = true;
    return $id;
}

function replaceAppState(array $state): void
{
    $pdo = db();
    $inquiryColumns = tableColumns($pdo, 'inquiries');
    if ($inquiryColumns === null || !in_array('created_by', $inquiryColumns, true)) {
        throw new DatabaseSchemaException(
            'Database schema mismatch: inquiries is missing the created_by column. '
            . 'Apply database/migrations/20261020_add_inquiry_created_by.sql before saving inquiries.'
        );
    }
    $vesselCallColumns = tableColumns($pdo, 'vessel_calls');
    $missingVoidColumns = $vesselCallColumns === null
        ? ['voided_at', 'voided_by_name', 'void_reason']
        : array_values(array_diff(['voided_at', 'voided_by_name', 'void_reason'], $vesselCallColumns));
    $hasVoidedJobs = count(array_filter($state['jobCalls'] ?? [], static fn (array $job): bool => !empty($job['voidedAt']))) > 0;
    if ($hasVoidedJobs && $missingVoidColumns) {
        throw new DatabaseSchemaException(
            'Database schema mismatch: vessel_calls is missing void columns: '
            . implode(', ', $missingVoidColumns)
            . '. Apply database/migrations/20261017_add_vessel_call_void_fields.sql before voiding a Job.'
        );
    }
    if (tableColumns($pdo, 'job_call_number_registry') === null && !empty($state['jobCalls'])) {
        throw new DatabaseSchemaException(
            'Database schema mismatch: job_call_number_registry is missing. '
            . 'Apply database/migrations/20261017_add_job_call_number_registry.sql before saving a Job.'
        );
    }
    $paymentVoucherColumns = tableColumns($pdo, 'payment_vouchers');
    $requiredPaymentVoucherColumns = [
        'id', 'request_number', 'request_date', 'currency', 'exchange_rate_usd_to_idr', 'exchange_rate_date', 'requested_payment_date', 'job_info', 'request_by', 'request_by_user_id', 'vendor_name',
        'total_paid_amount', 'status', 'manager_note', 'reviewed_by', 'reviewed_at',
        'paid_by', 'paid_at', 'paid_from_bank_account_id', 'voucher_number', 'payment_surcharge', 'payment_other_expenses',
        'payment_description', 'payment_total_amount', 'payment_proof_data_url',
    ];
    $missingPaymentVoucherColumns = $paymentVoucherColumns === null
        ? $requiredPaymentVoucherColumns
        : array_values(array_diff($requiredPaymentVoucherColumns, $paymentVoucherColumns));
    if ($missingPaymentVoucherColumns) {
        throw new DatabaseSchemaException(
            'Database schema mismatch: payment_vouchers is missing required columns: '
            . implode(', ', $missingPaymentVoucherColumns)
            . '. Apply the required payment voucher migrations before saving.'
        );
    }
    $paymentVoucherItemColumns = tableColumns($pdo, 'payment_voucher_items');
    $requiredPaymentVoucherItemColumns = ['id', 'voucher_id', 'line_no', 'job_number', 'document_type', 'document_number', 'customer_name', 'item_service', 'amount', 'vat_applied', 'vat_amount', 'total', 'pph23_applied', 'pph23_amount', 'paid_amount'];
    $missingPaymentVoucherItemColumns = $paymentVoucherItemColumns === null
        ? $requiredPaymentVoucherItemColumns
        : array_values(array_diff($requiredPaymentVoucherItemColumns, $paymentVoucherItemColumns));
    if ($missingPaymentVoucherItemColumns) {
        throw new DatabaseSchemaException(
            'Database schema mismatch: payment_voucher_items is missing document reference columns. '
            . 'Apply database/migrations/20261020_add_payment_voucher_item_document_reference.sql before saving payment requests.'
        );
    }
    $pdo->beginTransaction();
    $usedSofIds = [];
    try {
        $passwordHashes = indexBy($pdo->query('SELECT id, password_hash FROM users')->fetchAll(), 'id');
        // Preserve root records so cascading foreign keys cannot erase durable job documents.
        foreach (['audit_logs', 'payment_voucher_items', 'payment_vouchers', 'principal_receipts', 'principal_invoices', 'closing_records', 'ar_items', 'ap_items', 'fda_items', 'fda_records', 'statements_of_fact', 'operational_data', 'manager_approvals', 'crew_members', 'crew_change_plans', 'quotation_items', 'quotations', 'inquiries', 'zones', 'fix_tariffs', 'expenses_items', 'vendor_partners', 'bank_accounts'] as $table) {
            if (tableColumns($pdo, $table) === null) continue;
            $pdo->exec("DELETE FROM `{$table}`");
        }
        $activeJobIds = array_values(array_map(
            static fn (array $job): string => (string) $job['jobId'],
            $state['jobCalls'] ?? [],
        ));
        if ($activeJobIds) {
            $marks = implode(', ', array_fill(0, count($activeJobIds), '?'));
            $pdo->prepare("DELETE FROM `vessel_calls` WHERE `job_id` NOT IN ({$marks})")->execute($activeJobIds);
        } else {
            $pdo->exec('DELETE FROM `vessel_calls`');
        }
        $deleteMissingMasterRows = static function (string $table, array $rows) use ($pdo): void {
            $ids = array_values(array_map(static fn (array $row): string => (string) $row['id'], $rows));
            if ($ids) {
                $placeholders = implode(', ', array_fill(0, count($ids), '?'));
                $pdo->prepare("DELETE FROM `{$table}` WHERE `id` NOT IN ({$placeholders})")->execute($ids);
            } else {
                $pdo->exec("DELETE FROM `{$table}`");
            }
        };
        foreach ([
            'customers' => $state['customers'] ?? [],
            'vessels' => $state['vessels'] ?? [],
            'ports' => $state['ports'] ?? [],
            'vendor_partners' => $state['vendorPartners'] ?? [],
            'bank_accounts' => $state['bankAccounts'] ?? [],
        ] as $table => $rows) {
            $deleteMissingMasterRows($table, $rows);
        }
        $keptUserIds = array_values(array_map(static fn (array $row): string => (string) $row['id'], $state['users'] ?? []));
        if ($keptUserIds) {
            $marks = implode(', ', array_fill(0, count($keptUserIds), '?'));
            $pdo->prepare("DELETE FROM `users` WHERE `id` NOT IN ({$marks})")->execute($keptUserIds);
        } else {
            $pdo->exec('DELETE FROM `users`');
        }
        foreach (($state['users'] ?? []) as $row) {
            $existingHash = $passwordHashes[$row['id']]['password_hash'] ?? null;
            $passwordHash = !empty($row['password']) ? password_hash((string) $row['password'], PASSWORD_DEFAULT) : $existingHash;
            upsertRow($pdo, 'users', ['id' => (string) $row['id'], 'name' => (string) ($row['name'] ?? ''), 'email' => (string) ($row['email'] ?? ''), 'username' => $row['username'] ?? null, 'password_hash' => $passwordHash, 'role' => $row['role'] ?? 'SALES', 'department' => (string) ($row['department'] ?? ''), 'branch_name' => $row['branch'] ?? null, 'position' => $row['position'] ?? null, 'phone' => $row['phone'] ?? null, 'status' => $row['status'] ?? 'ACTIVE']);
        }
        foreach (($state['customers'] ?? []) as $row) upsertRow($pdo, 'customers', ['id' => $row['id'], 'code' => $row['code'], 'company_name' => $row['companyName'], 'country' => $row['country'], 'customer_type' => $row['type'], 'contact_person' => $row['contactPerson'], 'email' => $row['email'], 'phone' => $row['phone'], 'address' => $row['address'], 'credit_term_days' => $row['creditTermDays'] ?? 30]);
        foreach (($state['vessels'] ?? []) as $row) upsertRow($pdo, 'vessels', ['id' => $row['id'], 'name' => $row['name'], 'imo_number' => $row['imoNumber'], 'call_sign' => $row['callSign'], 'flag' => $row['flag'], 'vessel_type' => $row['vesselType'], 'grt' => $row['grt'], 'nrt' => $row['nrt'], 'dwt' => $row['dwt'], 'loa' => $row['loa'], 'beam' => $row['beam'], 'year_built' => $row['yearBuilt'] ?: null]);
        foreach (($state['ports'] ?? []) as $row) upsertRow($pdo, 'ports', ['id' => $row['id'], 'code' => $row['code'], 'name' => $row['name'], 'country' => $row['country'], 'channel_depth_meters' => (int) round((float) ($row['channelDepthMeters'] ?? 0)), 'tide_restriction' => $row['tideRestriction'] ?? null, 'operating_hours' => $row['operatingHours'] ?? null]);
        $portNames = indexBy($state['ports'] ?? [], 'id');
        foreach (($state['zones'] ?? []) as $row) {
            if (!isset($portNames[$row['portId']])) continue;
            insertRow($pdo, 'zones', ['id' => $row['id'], 'port_id' => $row['portId'], 'zone_code' => $row['zoneCode'], 'zone_name' => $row['zoneName'], 'zone_type' => $row['type'], 'max_draft_meters' => $row['maxDraftMeters'], 'description' => $row['description'] ?? null]);
        }
        foreach (($state['fixTariffs'] ?? []) as $row) {
            if (!isset($portNames[$row['portId']])) continue;
            $portName = trim((string) ($row['portName'] ?? $portNames[$row['portId']]['name'] ?? ''));
            if ($portName === '') throw new RuntimeException('Fix tariff must include a valid port name.');
            insertRow($pdo, 'fix_tariffs', ['id' => $row['id'], 'port_id' => $row['portId'], 'port_name' => $portName, 'service_name' => $row['serviceName'], 'cost_category' => $row['costCategory'] ?? null, 'grt_min' => isset($row['grtMin']) ? (int) round((float) $row['grtMin']) : null, 'grt_max' => isset($row['grtMax']) ? (int) round((float) $row['grtMax']) : null, 'dwt' => isset($row['dwt']) ? (int) round((float) $row['dwt']) : null, 'calculation_basis' => $row['calculationBasis'], 'tariff_type' => $row['tariffType'] ?? null, 'rate_idr' => $row['rateIDR'] ?? null, 'rate_usd' => $row['rateUSD'] ?? null, 'remarks' => $row['remarks'] ?? null]);
        }
        foreach (($state['expensesItems'] ?? []) as $row) insertRow($pdo, 'expenses_items', ['id' => $row['id'], 'port_id' => isset($portNames[$row['portId'] ?? '']) ? $row['portId'] : null, 'port_name' => $row['portName'] ?? null, 'code' => $row['code'], 'category' => $row['category'], 'name' => $row['name'], 'rate_idr' => $row['rateIDR'] ?? null, 'rate_usd' => $row['rateUSD'] ?? null, 'calculation_type' => $row['calculationType'] ?? null, 'remarks' => $row['remarks'] ?? null]);
        $vendorPartnerIds = array_fill_keys(array_map(static fn (array $partner): string => (string) $partner['id'], $state['vendorPartners'] ?? []), true);
        $bankAccountIds = array_fill_keys(array_map(static fn (array $account): string => (string) $account['id'], $state['bankAccounts'] ?? []), true);
        foreach (($state['vendorPartners'] ?? []) as $row) insertRow($pdo, 'vendor_partners', ['id' => $row['id'], 'vendor_name' => $row['vendorName'], 'pic_name' => $row['picName'] ?? null, 'address' => $row['address'] ?? null, 'phone' => $row['phone'] ?? null, 'bank_name' => $row['bankName'] ?? null, 'paid_name' => $row['paidName'] ?? null, 'account_number' => $row['accountNumber'] ?? null]);
        foreach (($state['bankAccounts'] ?? []) as $row) insertRow($pdo, 'bank_accounts', ['id' => $row['id'], 'bank_name' => $row['bankName'], 'branch' => $row['branch'] ?? null, 'account_name' => $row['accountName'], 'account_number' => $row['accountNumber']]);
        foreach (($state['paymentVouchers'] ?? []) as $voucher) {
            $requestDate = sqlDate($voucher['requestDate'] ?? null, true) ?? date('Y-m-d');
            insertRow($pdo, 'payment_vouchers', [
                'id' => $voucher['id'],
                'voucher_number' => !empty($voucher['voucherNumber']) ? $voucher['voucherNumber'] : null,
                'request_number' => $voucher['requestNumber'],
                'request_date' => $requestDate,
                'currency' => $voucher['currency'] ?? 'IDR',
                'exchange_rate_usd_to_idr' => $voucher['exchangeRateUSDToIDR'] ?? null,
                'exchange_rate_date' => sqlDate($voucher['exchangeRateDate'] ?? null),
                'requested_payment_date' => sqlDate($voucher['requestedPaymentDate'] ?? null, true) ?? $requestDate,
                'job_info' => $voucher['jobInfo'],
                'request_by' => $voucher['requestBy'] ?? '',
                'request_by_user_id' => !empty($voucher['requestByUserId']) ? $voucher['requestByUserId'] : null,
                'vendor_partner_id' => !empty($voucher['vendorPartnerId']) && isset($vendorPartnerIds[$voucher['vendorPartnerId']]) ? $voucher['vendorPartnerId'] : null,
                'vendor_name' => $voucher['vendorName'] ?? '',
                'paid_to' => $voucher['paidTo'] ?? null,
                'bank_name' => $voucher['bankName'] ?? null,
                'account_number' => $voucher['accountNumber'] ?? null,
                'total_paid_amount' => $voucher['totalPaidAmount'] ?? 0,
                'payment_surcharge' => $voucher['paymentSurcharge'] ?? 0,
                'payment_other_expenses' => $voucher['paymentOtherExpenses'] ?? 0,
                'payment_description' => $voucher['paymentDescription'] ?? null,
                'payment_total_amount' => $voucher['paymentTotalAmount'] ?? $voucher['totalPaidAmount'] ?? 0,
                'payment_proof_data_url' => $voucher['paymentProofDataUrl'] ?? null,
                'status' => $voucher['status'] ?? 'PENDING_MANAGER',
                'manager_note' => $voucher['managerNote'] ?? null,
                'reviewed_by' => $voucher['reviewedBy'] ?? null,
                'reviewed_at' => sqlDate($voucher['reviewedAt'] ?? null),
                'paid_by' => $voucher['paidBy'] ?? null,
                'paid_at' => sqlDate($voucher['paidAt'] ?? null),
                'paid_from_bank_account_id' => !empty($voucher['paidFromBankAccountId']) && isset($bankAccountIds[$voucher['paidFromBankAccountId']]) ? $voucher['paidFromBankAccountId'] : null,
                'created_at' => sqlDate($voucher['createdAt'] ?? null) ?? date('Y-m-d H:i:s'),
            ]);
            foreach (($voucher['items'] ?? []) as $index => $item) {
                insertRow($pdo, 'payment_voucher_items', ['id' => $item['id'], 'voucher_id' => $voucher['id'], 'line_no' => $index + 1, 'job_number' => $item['jobNumber'] ?? '', 'document_type' => $item['documentType'] ?? null, 'document_number' => $item['documentNumber'] ?? null, 'customer_name' => $item['customerName'] ?? '', 'item_service' => $item['itemService'] ?? '', 'amount' => $item['amount'] ?? 0, 'vat_applied' => !empty($item['vatApplied']) ? 1 : 0, 'vat_amount' => $item['vatAmount'] ?? 0, 'total' => $item['total'] ?? 0, 'pph23_applied' => !empty($item['pph23Applied']) ? 1 : 0, 'pph23_amount' => $item['pph23Amount'] ?? 0, 'paid_amount' => $item['paidAmount'] ?? 0]);
            }
        }
        foreach (($state['jobCalls'] ?? []) as $job) {
            upsertRow($pdo, 'vessel_calls', ['job_id' => $job['jobId'], 'vessel_id' => $job['vesselId'], 'port_id' => $job['portId'], 'customer_id' => $job['customerId'], 'currency' => $job['currency'], 'exchange_rate_usd_to_idr' => $job['exchangeRateUSDToIDR'] ?? 15800, 'eta' => sqlDate($job['eta'] ?? null), 'etd' => sqlDate($job['etd'] ?? null), 'purpose_of_call' => $job['purposeOfCall'], 'current_stage' => $job['currentStage'], 'status' => $job['status'], 'voided_at' => sqlDate($job['voidedAt'] ?? null), 'voided_by_name' => $job['voidedBy'] ?? null, 'void_reason' => $job['voidReason'] ?? null, 'created_at' => sqlDate($job['createdAt'] ?? null) ?? date('Y-m-d H:i:s'), 'updated_at' => sqlDate($job['updatedAt'] ?? null) ?? date('Y-m-d H:i:s')], 'job_id');
            $inquiry = $job['inquiry'] ?? [];
            insertRow($pdo, 'inquiries', ['job_id' => $job['jobId'], 'inquiry_no' => $inquiry['inquiryNo'], 'inquiry_date' => sqlDate($inquiry['date'] ?? null, true) ?? date('Y-m-d'), 'purpose_of_call' => $job['purposeOfCall'], 'eta' => sqlDate($inquiry['eta'] ?? $job['eta'] ?? null) ?? null, 'etd' => sqlDate($inquiry['etd'] ?? $job['etd'] ?? null) ?? null, 'eta_remarks' => $inquiry['etaRemarks'] ?? null, 'etd_remarks' => $inquiry['etdRemarks'] ?? null, 'cargo_quantity' => $inquiry['cargoQuantity'] ?? null, 'quantity_unit' => ($inquiry['quantityUnit'] ?? null) === 'MATRIX_TON' ? 'MT' : ($inquiry['quantityUnit'] ?? null), 'cargo_details' => $inquiry['cargoDetails'] ?? '', 'estimated_days' => $inquiry['estimatedDays'] ?? 0, 'special_requirements' => $inquiry['specialRequirements'] ?? '', 'status' => $inquiry['status'] ?? 'RECEIVED', 'created_by' => $inquiry['createdBy'] ?? $inquiry['createdByName'] ?? '', 'created_by_user_id' => !empty($inquiry['createdByUserId']) ? $inquiry['createdByUserId'] : null, 'created_by_name' => $inquiry['createdByName'] ?? $inquiry['createdBy'] ?? '', 'created_by_branch' => $inquiry['createdByBranch'] ?? null]);
            foreach (['EPDA' => 'epda'] as $quoteType => $key) {
                $quote = $job['quotation'][$key] ?? [];
                insertRow($pdo, 'quotations', ['id' => $job['jobId'] . '-' . $quoteType, 'job_id' => $job['jobId'], 'quote_type' => $quoteType, 'quote_no' => $quote['quoteNo'] ?: $job['jobId'] . '-' . $quoteType, 'quote_date' => sqlDate($quote['date'] ?? null, true) ?? date('Y-m-d'), 'eta' => sqlDate($quote['eta'] ?? null), 'etd' => sqlDate($quote['etd'] ?? null), 'eta_remarks' => $quote['etaRemarks'] ?? null, 'etd_remarks' => $quote['etdRemarks'] ?? null, 'currency' => $quote['currency'] ?? $job['currency'], 'exchange_rate_usd_to_idr' => $quote['exchangeRateUSDToIDR'] ?? $job['exchangeRateUSDToIDR'] ?? 15800, 'pph23_applied' => !empty($quote['pph23Applied']), 'global_vat_applied' => !empty($quote['globalVatApplied']), 'total_amount' => $quote['totalAmount'] ?? 0, 'status' => $quote['status'] ?? 'DRAFT']);
                    foreach (($quote['items'] ?? []) as $index => $item) insertRow($pdo, 'quotation_items', ['id' => $item['id'] ?: $job['jobId'] . '-' . $quoteType . '-' . ($index + 1), 'quotation_id' => $job['jobId'] . '-' . $quoteType, 'expense_item_id' => $item['expenseItemId'] ?: null, 'entry_order' => $index + 1, 'name' => $item['name'], 'category' => normalizedCostCategory($item, $state['fixTariffs'] ?? []), 'basis' => $item['basis'] ?? '', 'quantity' => $item['quantity'] ?? 1, 'amount' => $item['amount'] ?? 0, 'currency' => $item['currency'] ?? $quote['currency'] ?? $job['currency'], 'tariff_type' => $item['tariffType'] ?? null, 'calculation_basis' => $item['calculationBasis'] ?? null, 'tariff_rate' => $item['tariffRate'] ?? null, 'remarks' => $item['remarks'] ?? null, 'vat_applied' => !empty($item['vatApplied']), 'pph23_applied' => !empty($item['pph23Applied'])]);
            }
            $crew = $job['quotation']['crewChange'] ?? [];
            if (!empty($crew['id'])) {
                insertRow($pdo, 'crew_change_plans', ['id' => $crew['id'], 'job_id' => $job['jobId'], 'plan_date' => sqlDate($crew['date'] ?? null, true) ?? date('Y-m-d'), 'sign_on_count' => $crew['signOnCount'] ?? 0, 'sign_off_count' => $crew['signOffCount'] ?? 0, 'logistics_cost' => $crew['logisticsCost'] ?? 0, 'immigration_visa_cost' => $crew['immigrationVisaCost'] ?? 0, 'transport_cost' => $crew['transportCost'] ?? 0, 'total_cost_usd' => $crew['totalCostUSD'] ?? 0, 'total_cost_idr' => $crew['totalCostIDR'] ?? 0, 'status' => $crew['status'] ?? 'PLANNED']);
                foreach (($crew['members'] ?? []) as $member) insertRow($pdo, 'crew_members', ['id' => $member['id'], 'crew_change_plan_id' => $crew['id'], 'name' => $member['name'], 'passport_number' => $member['passportNumber'], 'seaman_book' => $member['seamanBook'], 'rank' => $member['rank'], 'nationality' => $member['nationality'], 'crew_type' => $member['type'], 'flight_details' => $member['flightDetails'] ?? null, 'hotel_booked' => $member['hotelBooked'] ?? false, 'transit_cost_usd' => $member['transitCostUSD'] ?? 0, 'immigration_status' => $member['immigrationStatus'] ?? 'PENDING']);
            }
            $approval = $job['managerApproval'] ?? [];
            insertRow($pdo, 'manager_approvals', ['job_id' => $job['jobId'], 'status' => $approval['status'] ?? 'PENDING', 'approved_by_name' => $approval['approvedBy'] ?? null, 'approved_at' => sqlDate($approval['approvedAt'] ?? null), 'notes' => $approval['notes'] ?? null]);
            $operation = $job['operationalData'] ?? [];
            insertRow($pdo, 'operational_data', ['job_id' => $job['jobId'], 'ata' => sqlDate($operation['ata'] ?? null), 'atb' => sqlDate($operation['atb'] ?? null), 'atd' => sqlDate($operation['atd'] ?? null), 'berth_zone_name' => $operation['berthZoneName'] ?? null]);
            foreach (($operation['statementOfFacts'] ?? []) as $fact) insertRow($pdo, 'statements_of_fact', ['id' => uniqueRecordId($usedSofIds, (string) $fact['id'], (string) $job['jobId']), 'job_id' => $job['jobId'], 'event_time' => sqlDate($fact['timestamp'] ?? null), 'event' => $fact['event'], 'remarks' => $fact['remarks'] ?? null]);
            $fda = $job['fda'] ?? [];
            insertRow($pdo, 'fda_records', ['job_id' => $job['jobId'], 'fda_no' => $fda['fdaNo'] ?: $job['jobId'] . '-FDA', 'fda_date' => sqlDate($fda['date'] ?? null, true) ?? date('Y-m-d'), 'eta' => sqlDate($fda['eta'] ?? null), 'etd' => sqlDate($fda['etd'] ?? null), 'eta_remarks' => $fda['etaRemarks'] ?? null, 'etd_remarks' => $fda['etdRemarks'] ?? null, 'currency' => $fda['currency'] ?? $job['currency'], 'exchange_rate_usd_to_idr' => $fda['exchangeRateUSDToIDR'] ?? $job['exchangeRateUSDToIDR'] ?? 15800, 'pph23_applied' => !empty($fda['pph23Applied']), 'global_vat_applied' => !empty($fda['globalVatApplied']), 'final_billed_to_principal' => $fda['finalBilledToPrincipal'] ?? $job['quotation']['epda']['totalAmount'] ?? 0, 'fda_approved' => $fda['fdaApproved'] ?? false, 'approval_status' => $fda['approvalStatus'] ?? 'DRAFT', 'submitted_by_name' => $fda['submittedBy'] ?? null, 'submitted_at' => sqlDate($fda['submittedAt'] ?? null), 'approved_by_name' => $fda['approvedBy'] ?? null, 'approved_at' => sqlDate($fda['approvedAt'] ?? null), 'notes' => $fda['notes'] ?? null, 'pdf_file_name' => $fda['pdfFileName'] ?? null, 'pdf_data_url' => $fda['pdfDataUrl'] ?? null]);
            foreach (($job['fdaItems'] ?? []) as $index => $item) insertRow($pdo, 'fda_items', ['id' => $item['id'], 'job_id' => $job['jobId'], 'entry_order' => $index + 1, 'item_code' => $item['itemCode'] ?? '', 'description' => $item['description'], 'category' => normalizedCostCategory(['category' => $item['category'] ?? '', 'name' => $item['description'] ?? ''], $state['fixTariffs'] ?? []), 'vendor_name' => $item['vendorName'] ?? '', 'invoice_or_voucher_no' => $item['invoiceOrVoucherNo'] ?? '', 'cost_date' => sqlDate($item['date'] ?? null, true) ?? date('Y-m-d'), 'quantity' => $item['quantity'] ?? 1, 'amount' => $item['amount'] ?? 0, 'currency' => $item['currency'] ?? $fda['currency'] ?? $job['currency'], 'estimated_amount' => $item['estimatedAmount'] ?? 0, 'tariff_type' => $item['tariffType'] ?? null, 'calculation_basis' => $item['calculationBasis'] ?? null, 'tariff_rate' => $item['tariffRate'] ?? null, 'tariff_description' => $item['tariffDescription'] ?? null, 'variance_amount' => $item['varianceAmount'] ?? 0, 'status' => $item['status'] ?? 'PENDING_VERIFICATION', 'attachment_name' => $item['attachmentName'] ?? null, 'attachment_data_url' => $item['attachmentDataUrl'] ?? null, 'remarks' => $item['remarks'] ?? null, 'vat_applied' => !empty($item['vatApplied']), 'pph23_applied' => !empty($item['pph23Applied'])]);
            foreach (($job['ap'] ?? []) as $item) insertRow($pdo, 'ap_items', ['id' => $item['id'], 'job_id' => $job['jobId'], 'voucher_no' => $item['voucherNo'], 'vendor_name' => $item['vendorName'], 'description' => $item['description'], 'invoice_date' => sqlDate($item['invoiceDate'] ?? null, true) ?? date('Y-m-d'), 'due_date' => sqlDate($item['dueDate'] ?? null, true) ?? date('Y-m-d'), 'amount' => $item['amount'] ?? 0, 'currency' => $item['currency'] ?? $job['currency'], 'status' => $item['status'] ?? 'UNPAID', 'payment_ref' => $item['paymentRef'] ?? null, 'paid_date' => sqlDate($item['paidDate'] ?? null, true)]);
            foreach (($job['ar'] ?? []) as $item) insertRow($pdo, 'ar_items', ['id' => $item['id'], 'job_id' => $job['jobId'], 'reference_no' => $item['referenceNo'], 'principal_name' => $item['principalName'], 'description' => $item['description'], 'requested_amount' => $item['requestedAmount'] ?? 0, 'received_amount' => $item['receivedAmount'] ?? 0, 'currency' => $item['currency'] ?? $job['currency'], 'received_date' => sqlDate($item['receivedDate'] ?? null, true), 'bank_account' => $item['bankAccount'] ?? null, 'status' => $item['status'] ?? 'AWAITING_REMITTANCE']);
            foreach (($job['principalReceipts'] ?? []) as $receipt) {
                if (strpos((string) ($receipt['id'] ?? ''), 'FIN-AR-') === 0) continue;
                insertRow($pdo, 'principal_receipts', ['id' => $receipt['id'], 'job_id' => $job['jobId'], 'received_date' => sqlDate($receipt['receivedDate'] ?? null, true) ?? date('Y-m-d'), 'amount' => $receipt['amount'], 'currency' => $receipt['currency'] ?? $job['currency'], 'exchange_rate_usd_to_idr' => $receipt['exchangeRateUSDToIDR'] ?? 0, 'payment_type' => $receipt['paymentType'], 'refund_amount' => $receipt['refundAmount'] ?? 0, 'refund_exchange_rate_usd_to_idr' => $receipt['refundExchangeRateUSDToIDR'] ?? 0, 'refund_date' => sqlDate($receipt['refundDate'] ?? null, true), 'refund_bank_reference' => $receipt['refundBankReference'] ?? null, 'refund_status' => $receipt['refundStatus'] ?? 'NONE', 'bank_remark' => $receipt['bankRemark'] ?? '', 'attachment_name' => $receipt['attachmentName'] ?? null, 'attachment_data_url' => $receipt['attachmentDataUrl'] ?? null]);
            }
            $invoice = $job['principalInvoice'] ?? [];
            insertRow($pdo, 'principal_invoices', ['job_id' => $job['jobId'], 'invoice_no' => $invoice['invoiceNo'] ?: $job['jobId'] . '-INV', 'invoice_date' => sqlDate($invoice['invoiceDate'] ?? null, true) ?? date('Y-m-d'), 'due_date' => sqlDate($invoice['dueDate'] ?? null, true) ?? date('Y-m-d'), 'total_amount_usd' => $invoice['totalAmountUSD'] ?? 0, 'total_amount_idr' => $invoice['totalAmountIDR'] ?? 0, 'advance_deducted_usd' => $invoice['advanceDeductedUSD'] ?? 0, 'advance_deducted_idr' => $invoice['advanceDeductedIDR'] ?? 0, 'balance_due_usd' => $invoice['balanceDueUSD'] ?? 0, 'balance_due_idr' => $invoice['balanceDueIDR'] ?? 0, 'status' => $invoice['status'] ?? 'DRAFT', 'pdf_generated' => $invoice['pdfGenerated'] ?? false]);
            $closing = $job['closing'] ?? [];
            insertRow($pdo, 'closing_records', ['job_id' => $job['jobId'], 'is_closed' => $closing['isClosed'] ?? false, 'closed_at' => sqlDate($closing['closedAt'] ?? null), 'closed_by_name' => $closing['closedBy'] ?? null, 'post_voyage_remarks' => $closing['postVoyageRemarks'] ?? null]);
        }
        foreach (($state['auditLogs'] ?? []) as $log) insertRow($pdo, 'audit_logs', ['id' => $log['id'], 'logged_at' => sqlDate($log['timestamp'] ?? null) ?? date('Y-m-d H:i:s'), 'actor_id' => $log['actorId'] ?? null, 'actor_name' => $log['actorName'] ?? 'System', 'actor_role' => $log['role'] ?? 'ADMIN', 'action' => $log['action'] ?? 'UPDATE', 'entity' => $log['entity'] ?? 'SYSTEM', 'entity_id' => $log['entityId'] ?? null, 'description' => $log['description'] ?? '']);
        if (tableColumns($pdo, 'job_call_number_registry') !== null) {
            $deletedJobIds = array_values(array_unique(array_map(
                static fn (array $log): string => (string) ($log['entityId'] ?? ''),
                array_filter(
                    $state['auditLogs'] ?? [],
                    static fn (array $log): bool => ($log['entity'] ?? '') === 'VESSEL_CALL' && ($log['action'] ?? '') === 'DELETE',
                ),
            )));
            $deletedJobIds = array_values(array_filter($deletedJobIds, static fn (string $jobId): bool => $jobId !== ''));
            if ($deletedJobIds) {
                $marks = implode(', ', array_fill(0, count($deletedJobIds), '?'));
                $pdo->prepare("DELETE FROM `job_call_number_registry` WHERE `job_id` IN ({$marks})")->execute($deletedJobIds);
            }
            $registerJobId = $pdo->prepare('INSERT IGNORE INTO job_call_number_registry (job_id) VALUES (?)');
            $jobIdsToRegister = array_unique(array_merge(
                array_values(array_diff($state['reservedJobIds'] ?? [], $deletedJobIds)),
                array_map(static fn (array $job): string => (string) $job['jobId'], $state['jobCalls'] ?? []),
                array_map(
                    static fn (array $log): string => (string) ($log['entityId'] ?? ''),
                    array_filter(
                        $state['auditLogs'] ?? [],
                        static fn (array $log): bool => ($log['entity'] ?? '') === 'VESSEL_CALL'
                            && ($log['action'] ?? '') !== 'DELETE',
                    ),
                ),
            ));
            foreach ($jobIdsToRegister as $jobId) {
                if ($jobId !== '') $registerJobId->execute([$jobId]);
            }
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
