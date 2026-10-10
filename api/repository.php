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
    $timestamp = strtotime($value);
    return $timestamp === false ? null : gmdate('Y-m-d\TH:i:s\Z', $timestamp);
}

function loadAppState(): array
{
    $users = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'name' => $row['name'], 'email' => $row['email'],
        'username' => $row['username'], 'role' => $row['role'], 'department' => $row['department'],
        'branch' => $row['branch_code'] ?: ($row['branch_name'] ?? ''), 'position' => $row['position'],
        'phone' => $row['phone'], 'avatar' => $row['avatar'], 'status' => $row['status'],
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
        'unlocode' => $row['unlocode'], 'channelDepthMeters' => (float) $row['channel_depth_meters'],
        'tideRestriction' => $row['tide_restriction'] ?? '', 'operatingHours' => $row['operating_hours'] ?? '',
    ], tableRows('ports'));
    $portNames = indexBy($ports, 'id');
    $zones = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'portId' => $row['port_id'], 'portName' => $portNames[$row['port_id']]['name'] ?? '',
        'zoneCode' => $row['zone_code'], 'zoneName' => $row['zone_name'], 'type' => $row['zone_type'],
        'maxDraftMeters' => (float) $row['max_draft_meters'], 'description' => $row['description'] ?? '',
    ], tableRows('zones'));
    $fixTariffs = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'portId' => $row['port_id'], 'portName' => $portNames[$row['port_id']]['name'] ?? '',
        'serviceCode' => $row['service_code'], 'serviceName' => $row['service_name'], 'costCategory' => $row['cost_category'],
        'grt' => $row['grt'] === null ? null : (float) $row['grt'],
        'grtMin' => $row['grt_min'] === null ? null : (float) $row['grt_min'],
        'grtMax' => $row['grt_max'] === null ? null : (float) $row['grt_max'],
        'dwt' => $row['dwt'] === null ? null : (float) $row['dwt'],
        'calculationBasis' => $row['calculation_basis'], 'tariffType' => $row['tariff_type'],
        'currency' => $row['currency'], 'rate' => (float) $row['rate'], 'rateIDR' => $row['rate_idr'] === null ? undefined : (float) $row['rate_idr'],
        'rateUSD' => $row['rate_usd'] === null ? undefined : (float) $row['rate_usd'], 'minCharge' => (float) $row['min_charge'],
        'description' => $row['description'],
    ], tableRows('fix_tariffs'));
    $expensesItems = array_map(static fn (array $row): array => [
        'id' => $row['id'], 'portId' => $row['port_id'], 'portName' => $portNames[$row['port_id']]['name'] ?? '',
        'code' => $row['code'], 'category' => $row['category'], 'name' => $row['name'], 'unit' => $row['unit'],
        'defaultCurrency' => $row['default_currency'], 'standardCostBuy' => (float) $row['standard_cost_buy'],
        'standardCostSell' => (float) $row['standard_cost_sell'], 'rateIDR' => $row['rate_idr'] === null ? undefined : (float) $row['rate_idr'],
        'rateUSD' => $row['rate_usd'] === null ? undefined : (float) $row['rate_usd'], 'preferredVendor' => $row['preferred_vendor'],
        'calculationType' => $row['calculation_type'],
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
            'itemService' => $row['item_service'], 'amount' => (float) $row['amount'], 'vatApplied' => (bool) $row['vat_applied'],
            'vatAmount' => (float) $row['vat_amount'], 'total' => (float) $row['total'], 'pph23Applied' => (bool) $row['pph23_applied'],
            'pph23Amount' => (float) $row['pph23_amount'], 'paidAmount' => (float) $row['paid_amount'],
        ];
    }
    $paymentVouchers = array_map(static function (array $row) use ($voucherItems): array {
        $items = $voucherItems[$row['id']] ?? [];
        usort($items, static fn (array $a, array $b): int => $a['line'] <=> $b['line']);
        return [
            'id' => $row['id'], 'voucherNumber' => $row['voucher_number'] ?: null, 'requestNumber' => $row['request_number'], 'requestDate' => $row['request_date'], 'jobInfo' => $row['job_info'],
            'requestBy' => $row['request_by'], 'requestByUserId' => $row['request_by_user_id'] ?? null, 'vendorPartnerId' => $row['vendor_partner_id'] ?? '', 'vendorName' => $row['vendor_name'],
            'paidTo' => $row['paid_to'] ?? '', 'bankName' => $row['bank_name'] ?? '', 'accountNumber' => $row['account_number'] ?? '',
            'items' => array_map(static function (array $item): array { unset($item['line']); return $item; }, $items),
            'totalPaidAmount' => (float) $row['total_paid_amount'], 'createdAt' => appDateTime($row['created_at']),
                        'status' => $row['status'] ?? 'PENDING_MANAGER', 'managerNote' => $row['manager_note'] ?? '', 'reviewedBy' => $row['reviewed_by'] ?? '',
                        'reviewedAt' => !empty($row['reviewed_at']) ? appDateTime($row['reviewed_at']) : '', 'paidBy' => $row['paid_by'] ?? '',
                        'paidAt' => !empty($row['paid_at']) ? appDateTime($row['paid_at']) : '',
                        'paymentSurcharge' => (float) ($row['payment_surcharge'] ?? 0),
                        'paymentOtherExpenses' => (float) ($row['payment_other_expenses'] ?? 0),
                        'paymentDescription' => $row['payment_description'] ?? '',
                        'paymentTotalAmount' => (float) ($row['payment_total_amount'] ?? 0) ?: (float) $row['total_paid_amount'],
                    ];
    }, tableRows('payment_vouchers'));

    $itemsByQuote = [];
    foreach (tableRows('quotation_items') as $row) {
        $itemsByQuote[$row['quotation_id']][] = [
            'id' => $row['id'], 'expenseItemId' => $row['expense_item_id'] ?? '', 'name' => $row['name'],
            'category' => $row['category'], 'basis' => $row['basis'] ?? '', 'quantity' => (float) $row['quantity'],
            'unitBuyRate' => (float) $row['unit_buy_rate'], 'unitSellRate' => (float) $row['unit_sell_rate'],
            'totalBuyRate' => (float) $row['total_buy_rate'], 'totalSellRate' => (float) $row['total_sell_rate'],
            'currency' => $row['currency'], 'tariffType' => $row['tariff_type'], 'calculationBasis' => $row['calculation_basis'],
            'tariffRate' => $row['tariff_rate'] === null ? null : (float) $row['tariff_rate'], 'remarks' => $row['remarks'],
        ];
    }
    $quotesByJob = [];
    foreach (tableRows('quotations') as $row) {
        $quotesByJob[$row['job_id']][$row['quote_type']] = [
            'quoteNo' => $row['quote_no'], 'date' => (string) $row['quote_date'], 'currency' => $row['currency'],
            'exchangeRateUSDToIDR' => (float) $row['exchange_rate_usd_to_idr'],
            'items' => $itemsByQuote[$row['id']] ?? [], 'totalBuyRate' => (float) $row['total_buy_rate'],
            'totalSellRate' => (float) $row['total_sell_rate'], 'marginAmount' => (float) $row['margin_amount'],
            'marginPercentage' => (float) $row['margin_percentage'], 'status' => $row['status'],
        ];
    }
    $inquiries = indexBy(tableRows('inquiries'), 'job_id');
    $approvals = indexBy(tableRows('manager_approvals'), 'job_id');
    $operations = indexBy(tableRows('operational_data'), 'job_id');
    $sofByJob = rowsByJob('statements_of_fact');
    $costsByJob = rowsByJob('actual_costs');
    $fdas = indexBy(tableRows('fda_records'), 'job_id');
    $apByJob = rowsByJob('ap_items');
    $arByJob = rowsByJob('ar_items');
    $receiptsByJob = rowsByJob('principal_receipts');
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
        $epda = $quotes['EPDA'] ?? ['quoteNo' => '', 'date' => (string) date('Y-m-d'), 'currency' => $job['currency'], 'exchangeRateUSDToIDR' => (float) $job['exchange_rate_usd_to_idr'], 'items' => [], 'totalBuyRate' => 0, 'totalSellRate' => 0, 'marginAmount' => 0, 'marginPercentage' => 0, 'status' => 'DRAFT'];
        $pda = $quotes['PDA'] ?? ['quoteNo' => '', 'date' => (string) date('Y-m-d'), 'currency' => $job['currency'], 'exchangeRateUSDToIDR' => (float) $job['exchange_rate_usd_to_idr'], 'items' => [], 'totalBuyRate' => 0, 'totalSellRate' => 0, 'marginAmount' => 0, 'marginPercentage' => 0, 'status' => 'DRAFT'];
        $plan = $crewPlans[$jobId] ?? [];
        $members = [];
        foreach ($crewMembers[$plan['id'] ?? ''] ?? [] as $member) {
            $members[] = ['id' => $member['id'], 'name' => $member['name'], 'passportNumber' => $member['passport_number'], 'seamanBook' => $member['seaman_book'], 'rank' => $member['rank'], 'nationality' => $member['nationality'], 'type' => $member['crew_type'], 'flightDetails' => $member['flight_details'], 'hotelBooked' => (bool) $member['hotel_booked'], 'transitCostUSD' => (float) $member['transit_cost_usd'], 'immigrationStatus' => $member['immigration_status']];
        }
        $crewChange = ['id' => $plan['id'] ?? '', 'date' => $plan['plan_date'] ?? (string) date('Y-m-d'), 'signOnCount' => (int) ($plan['sign_on_count'] ?? 0), 'signOffCount' => (int) ($plan['sign_off_count'] ?? 0), 'logisticsCost' => (float) ($plan['logistics_cost'] ?? 0), 'immigrationVisaCost' => (float) ($plan['immigration_visa_cost'] ?? 0), 'transportCost' => (float) ($plan['transport_cost'] ?? 0), 'totalCostUSD' => (float) ($plan['total_cost_usd'] ?? 0), 'totalCostIDR' => (float) ($plan['total_cost_idr'] ?? 0), 'status' => $plan['status'] ?? 'PLANNED', 'members' => $members];
        $statementOfFacts = array_map(static fn (array $row): array => ['id' => $row['id'], 'timestamp' => appDateTime($row['event_time']), 'event' => $row['event'], 'remarks' => $row['remarks'] ?? ''], $sofByJob[$jobId] ?? []);
        $actualCosts = array_map(static fn (array $row): array => ['id' => $row['id'], 'jobId' => $row['job_id'], 'itemCode' => $row['item_code'], 'description' => $row['description'], 'category' => $row['category'], 'vendorName' => $row['vendor_name'], 'invoiceOrVoucherNo' => $row['invoice_or_voucher_no'], 'date' => (string) $row['cost_date'], 'quantity' => $row['quantity'] === null ? null : (float) $row['quantity'], 'amount' => (float) $row['amount'], 'currency' => $row['currency'], 'tariffType' => $row['tariff_type'], 'pdaAmountEstimated' => (float) $row['pda_amount_estimated'], 'calculationBasis' => $row['calculation_basis'], 'tariffRate' => $row['tariff_rate'] === null ? null : (float) $row['tariff_rate'], 'varianceAmount' => (float) $row['variance_amount'], 'status' => $row['status'], 'attachmentName' => $row['attachment_name'], 'attachmentDataUrl' => $row['attachment_data_url'], 'remarks' => $row['remarks']], $costsByJob[$jobId] ?? []);
        $mapFinancial = static fn (array $row): array => $row;
        $jobCalls[] = [
            'jobId' => $jobId, 'vesselId' => $job['vessel_id'], 'vesselName' => $vesselById[$job['vessel_id']]['name'] ?? '',
            'portId' => $job['port_id'], 'portName' => $portById[$job['port_id']]['name'] ?? '',
            'customerId' => $job['customer_id'], 'customerName' => $customerById[$job['customer_id']]['company_name'] ?? '',
            'currency' => $job['currency'], 'exchangeRateUSDToIDR' => (float) $job['exchange_rate_usd_to_idr'],
            'eta' => appDateTime($job['eta']) ?? '', 'etd' => appDateTime($job['etd']) ?? '', 'purposeOfCall' => $job['purpose_of_call'],
            'currentStage' => $job['current_stage'], 'status' => $job['status'],
            'createdAt' => appDateTime($job['created_at']), 'updatedAt' => appDateTime($job['updated_at']),
            'inquiry' => ['inquiryNo' => $inquiry['inquiry_no'] ?? '', 'date' => $inquiry['inquiry_date'] ?? date('Y-m-d'), 'etaRemarks' => $inquiry['eta_remarks'] ?? '', 'etdRemarks' => $inquiry['etd_remarks'] ?? '', 'cargoQuantity' => isset($inquiry['cargo_quantity']) ? (float) $inquiry['cargo_quantity'] : null, 'quantityUnit' => ($inquiry['quantity_unit'] ?? 'TON') === 'MATRIX_TON' ? 'MT' : ($inquiry['quantity_unit'] ?? 'TON'), 'cargoDetails' => $inquiry['cargo_details'] ?? '', 'estimatedDays' => (float) ($inquiry['estimated_days'] ?? 0), 'specialRequirements' => $inquiry['special_requirements'] ?? '', 'status' => $inquiry['status'] ?? 'RECEIVED', 'createdBy' => $inquiry['created_by_name'] ?? '', 'createdByName' => $inquiry['created_by_name'] ?? '', 'createdByUserId' => $inquiry['created_by_user_id'] ?: null, 'createdByBranch' => $inquiry['created_by_branch'] ?? '', 'createdByBranchCode' => $inquiry['created_by_branch_code'] ?? '' ],
            'quotation' => ['epda' => $epda, 'pda' => $pda, 'crewChange' => $crewChange],
            'managerApproval' => ['status' => $approval['status'] ?? 'PENDING', 'approvedBy' => $approval['approved_by_name'] ?? '', 'approvedAt' => appDateTime($approval['approved_at'] ?? null), 'notes' => $approval['notes'] ?? '', 'allowedMarginTolerancePct' => (float) ($approval['allowed_margin_tolerance_pct'] ?? 0)],
            'operationalData' => ['ata' => appDateTime($operation['ata'] ?? null), 'atb' => appDateTime($operation['atb'] ?? null), 'atd' => appDateTime($operation['atd'] ?? null), 'pilotOnBoardTime' => appDateTime($operation['pilot_on_board_time'] ?? null), 'pilotOffTime' => appDateTime($operation['pilot_off_time'] ?? null), 'berthZoneName' => $operation['berth_zone_name'] ?? '', 'cargoQuantityMetricTons' => isset($operation['cargo_quantity_metric_tons']) ? (float) $operation['cargo_quantity_metric_tons'] : null, 'cargoCommodity' => $operation['cargo_commodity'] ?? '', 'harborMasterClearanceNo' => $operation['harbor_master_clearance_no'] ?? '', 'statementOfFacts' => $statementOfFacts],
            'actualCosts' => $actualCosts,
            'fda' => ['fdaNo' => $fda['fda_no'] ?? '', 'date' => $fda['fda_date'] ?? date('Y-m-d'), 'currency' => $fda['currency'] ?? $job['currency'], 'exchangeRateUSDToIDR' => (float) ($fda['exchange_rate_usd_to_idr'] ?? $job['exchange_rate_usd_to_idr']), 'totalEstimatedBuy' => (float) ($fda['total_estimated_buy'] ?? 0), 'totalEstimatedSell' => (float) ($fda['total_estimated_sell'] ?? 0), 'totalActualCost' => (float) ($fda['total_actual_cost'] ?? 0), 'finalBilledToPrincipal' => (float) ($fda['final_billed_to_principal'] ?? 0), 'varianceAmount' => (float) ($fda['variance_amount'] ?? 0), 'variancePercentage' => (float) ($fda['variance_percentage'] ?? 0), 'fdaApproved' => (bool) ($fda['fda_approved'] ?? false), 'approvalStatus' => $fda['approval_status'] ?? 'DRAFT', 'submittedBy' => $fda['submitted_by_name'] ?? '', 'submittedAt' => appDateTime($fda['submitted_at'] ?? null), 'approvedBy' => $fda['approved_by_name'] ?? '', 'approvedAt' => appDateTime($fda['approved_at'] ?? null), 'notes' => $fda['notes'] ?? '', 'pdfFileName' => $fda['pdf_file_name'] ?? '', 'pdfDataUrl' => $fda['pdf_data_url'] ?? ''],
            'ap' => array_map(static fn (array $row): array => ['id' => $row['id'], 'jobId' => $row['job_id'], 'voucherNo' => $row['voucher_no'], 'vendorName' => $row['vendor_name'], 'description' => $row['description'], 'invoiceDate' => (string) $row['invoice_date'], 'dueDate' => (string) $row['due_date'], 'amount' => (float) $row['amount'], 'currency' => $row['currency'], 'status' => $row['status'], 'paymentRef' => $row['payment_ref'], 'paidDate' => $row['paid_date']], $apByJob[$jobId] ?? []),
            'ar' => array_map(static fn (array $row): array => ['id' => $row['id'], 'jobId' => $row['job_id'], 'referenceNo' => $row['reference_no'], 'principalName' => $row['principal_name'], 'description' => $row['description'], 'requestedAmount' => (float) $row['requested_amount'], 'receivedAmount' => (float) $row['received_amount'], 'currency' => $row['currency'], 'receivedDate' => $row['received_date'], 'bankAccount' => $row['bank_account'], 'status' => $row['status']], $arByJob[$jobId] ?? []),
            'principalReceipts' => array_map(static fn (array $row): array => ['id' => $row['id'], 'jobId' => $row['job_id'], 'receivedDate' => (string) $row['received_date'], 'amount' => (float) $row['amount'], 'currency' => $row['currency'], 'paymentType' => $row['payment_type'], 'bankRemark' => $row['bank_remark'], 'attachmentName' => $row['attachment_name'], 'attachmentDataUrl' => $row['attachment_data_url']], $receiptsByJob[$jobId] ?? []),
            'principalInvoice' => ['invoiceNo' => $invoice['invoice_no'] ?? '', 'invoiceDate' => $invoice['invoice_date'] ?? date('Y-m-d'), 'dueDate' => $invoice['due_date'] ?? date('Y-m-d'), 'totalAmountUSD' => (float) ($invoice['total_amount_usd'] ?? 0), 'totalAmountIDR' => (float) ($invoice['total_amount_idr'] ?? 0), 'advanceDeductedUSD' => (float) ($invoice['advance_deducted_usd'] ?? 0), 'advanceDeductedIDR' => (float) ($invoice['advance_deducted_idr'] ?? 0), 'balanceDueUSD' => (float) ($invoice['balance_due_usd'] ?? 0), 'balanceDueIDR' => (float) ($invoice['balance_due_idr'] ?? 0), 'status' => $invoice['status'] ?? 'DRAFT', 'pdfGenerated' => (bool) ($invoice['pdf_generated'] ?? false)],
            'closing' => ['isClosed' => (bool) ($closing['is_closed'] ?? false), 'closedAt' => appDateTime($closing['closed_at'] ?? null), 'closedBy' => $closing['closed_by_name'] ?? '', 'finalGrossMarginUSD' => (float) ($closing['final_gross_margin_usd'] ?? 0), 'finalGrossMarginIDR' => (float) ($closing['final_gross_margin_idr'] ?? 0), 'postVoyageRemarks' => $closing['post_voyage_remarks'] ?? ''],
        ];
    }

    $auditLogs = array_map(static fn (array $row): array => ['id' => $row['id'], 'timestamp' => appDateTime($row['logged_at']), 'actorId' => $row['actor_id'], 'actorName' => $row['actor_name'], 'role' => $row['actor_role'], 'action' => $row['action'], 'entity' => $row['entity'], 'entityId' => $row['entity_id'], 'description' => $row['description']], tableRows('audit_logs'));
    return ['users' => $users, 'customers' => $customers, 'vessels' => $vessels, 'ports' => $ports, 'zones' => $zones, 'fixTariffs' => $fixTariffs, 'expensesItems' => $expensesItems, 'vendorPartners' => $vendorPartners, 'bankAccounts' => $bankAccounts, 'paymentVouchers' => $paymentVouchers, 'jobCalls' => $jobCalls, 'currentRole' => $_SESSION['user']['role'] ?? 'ADMIN', 'selectedJobId' => $jobCalls[0]['jobId'] ?? '', 'auditLogs' => $auditLogs];
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

function sqlDate(?string $value, bool $dateOnly = false): ?string
{
    if (!$value) return null;
    $timestamp = strtotime($value);
    if ($timestamp === false) return null;
    return $dateOnly ? date('Y-m-d', $timestamp) : date('Y-m-d H:i:s', $timestamp);
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
    $paymentVoucherColumns = tableColumns($pdo, 'payment_vouchers');
    $requiredPaymentVoucherColumns = [
        'id', 'request_number', 'request_date', 'job_info', 'request_by', 'request_by_user_id', 'vendor_name',
        'total_paid_amount', 'status', 'manager_note', 'reviewed_by', 'reviewed_at',
        'paid_by', 'paid_at', 'voucher_number', 'payment_surcharge', 'payment_other_expenses',
        'payment_description', 'payment_total_amount',
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
    $pdo->beginTransaction();
    $usedSofIds = [];
    try {
        $passwordHashes = indexBy($pdo->query('SELECT id, password_hash FROM users')->fetchAll(), 'id');
        foreach (['audit_logs', 'payment_voucher_items', 'payment_vouchers', 'principal_receipts', 'principal_invoices', 'closing_records', 'ar_items', 'ap_items', 'fda_records', 'actual_costs', 'statements_of_fact', 'operational_data', 'manager_approvals', 'crew_members', 'crew_change_plans', 'quotation_items', 'quotations', 'inquiries', 'vessel_calls', 'zones', 'fix_tariffs', 'expenses_items', 'vendor_partners', 'bank_accounts', 'customers', 'vessels', 'ports', 'users'] as $table) {
            if (tableColumns($pdo, $table) === null) continue;
            $pdo->exec("DELETE FROM `{$table}`");
        }
        foreach (($state['users'] ?? []) as $row) {
            $existingHash = $passwordHashes[$row['id']]['password_hash'] ?? null;
            $passwordHash = !empty($row['password']) ? password_hash((string) $row['password'], PASSWORD_DEFAULT) : $existingHash;
            insertRow($pdo, 'users', ['id' => (string) $row['id'], 'name' => (string) ($row['name'] ?? ''), 'email' => (string) ($row['email'] ?? ''), 'username' => $row['username'] ?? null, 'password_hash' => $passwordHash, 'role' => $row['role'] ?? 'SALES', 'department' => (string) ($row['department'] ?? ''), 'branch_code' => null, 'branch_name' => $row['branch'] ?? null, 'position' => $row['position'] ?? null, 'phone' => $row['phone'] ?? null, 'avatar' => $row['avatar'] ?? null, 'status' => $row['status'] ?? 'ACTIVE']);
        }
        foreach (($state['customers'] ?? []) as $row) insertRow($pdo, 'customers', ['id' => $row['id'], 'code' => $row['code'], 'company_name' => $row['companyName'], 'country' => $row['country'], 'customer_type' => $row['type'], 'contact_person' => $row['contactPerson'], 'email' => $row['email'], 'phone' => $row['phone'], 'address' => $row['address'], 'credit_term_days' => $row['creditTermDays'] ?? 30]);
        foreach (($state['vessels'] ?? []) as $row) insertRow($pdo, 'vessels', ['id' => $row['id'], 'name' => $row['name'], 'imo_number' => $row['imoNumber'], 'call_sign' => $row['callSign'], 'flag' => $row['flag'], 'vessel_type' => $row['vesselType'], 'grt' => $row['grt'], 'nrt' => $row['nrt'], 'dwt' => $row['dwt'], 'loa' => $row['loa'], 'beam' => $row['beam'], 'year_built' => $row['yearBuilt'] ?: null]);
        foreach (($state['ports'] ?? []) as $row) insertRow($pdo, 'ports', ['id' => $row['id'], 'code' => $row['code'], 'name' => $row['name'], 'country' => $row['country'], 'unlocode' => $row['unlocode'], 'channel_depth_meters' => $row['channelDepthMeters'], 'tide_restriction' => $row['tideRestriction'] ?? null, 'operating_hours' => $row['operatingHours'] ?? null]);
        foreach (($state['zones'] ?? []) as $row) insertRow($pdo, 'zones', ['id' => $row['id'], 'port_id' => $row['portId'], 'zone_code' => $row['zoneCode'], 'zone_name' => $row['zoneName'], 'zone_type' => $row['type'], 'max_draft_meters' => $row['maxDraftMeters'], 'description' => $row['description'] ?? null]);
        foreach (($state['fixTariffs'] ?? []) as $row) insertRow($pdo, 'fix_tariffs', ['id' => $row['id'], 'port_id' => $row['portId'], 'service_code' => $row['serviceCode'], 'service_name' => $row['serviceName'], 'cost_category' => $row['costCategory'] ?? null, 'grt' => $row['grt'] ?? null, 'grt_min' => $row['grtMin'] ?? null, 'grt_max' => $row['grtMax'] ?? null, 'dwt' => $row['dwt'] ?? null, 'calculation_basis' => $row['calculationBasis'], 'tariff_type' => $row['tariffType'] ?? null, 'currency' => $row['currency'], 'rate' => $row['rate'], 'rate_idr' => $row['rateIDR'] ?? null, 'rate_usd' => $row['rateUSD'] ?? null, 'min_charge' => $row['minCharge'], 'description' => $row['description']]);
        foreach (($state['expensesItems'] ?? []) as $row) insertRow($pdo, 'expenses_items', ['id' => $row['id'], 'port_id' => $row['portId'] ?: null, 'code' => $row['code'], 'category' => $row['category'], 'name' => $row['name'], 'unit' => $row['unit'] ?? null, 'default_currency' => $row['defaultCurrency'], 'standard_cost_buy' => $row['standardCostBuy'], 'standard_cost_sell' => $row['standardCostSell'], 'rate_idr' => $row['rateIDR'] ?? null, 'rate_usd' => $row['rateUSD'] ?? null, 'preferred_vendor' => $row['preferredVendor'] ?? null, 'calculation_type' => $row['calculationType'] ?? null]);
        foreach (($state['vendorPartners'] ?? []) as $row) insertRow($pdo, 'vendor_partners', ['id' => $row['id'], 'vendor_name' => $row['vendorName'], 'pic_name' => $row['picName'] ?? null, 'address' => $row['address'] ?? null, 'phone' => $row['phone'] ?? null, 'bank_name' => $row['bankName'] ?? null, 'paid_name' => $row['paidName'] ?? null, 'account_number' => $row['accountNumber'] ?? null]);
        foreach (($state['bankAccounts'] ?? []) as $row) insertRow($pdo, 'bank_accounts', ['id' => $row['id'], 'bank_name' => $row['bankName'], 'branch' => $row['branch'] ?? null, 'account_name' => $row['accountName'], 'account_number' => $row['accountNumber']]);
        foreach (($state['paymentVouchers'] ?? []) as $voucher) {
            insertRow($pdo, 'payment_vouchers', ['id' => $voucher['id'], 'voucher_number' => !empty($voucher['voucherNumber']) ? $voucher['voucherNumber'] : null, 'request_number' => $voucher['requestNumber'], 'request_date' => sqlDate($voucher['requestDate'] ?? null, true) ?? date('Y-m-d'), 'job_info' => $voucher['jobInfo'], 'request_by' => $voucher['requestBy'] ?? '', 'request_by_user_id' => !empty($voucher['requestByUserId']) ? $voucher['requestByUserId'] : null, 'vendor_partner_id' => !empty($voucher['vendorPartnerId']) ? $voucher['vendorPartnerId'] : null, 'vendor_name' => $voucher['vendorName'] ?? '', 'paid_to' => $voucher['paidTo'] ?? null, 'bank_name' => $voucher['bankName'] ?? null, 'account_number' => $voucher['accountNumber'] ?? null, 'total_paid_amount' => $voucher['totalPaidAmount'] ?? 0, 'payment_surcharge' => $voucher['paymentSurcharge'] ?? 0, 'payment_other_expenses' => $voucher['paymentOtherExpenses'] ?? 0, 'payment_description' => $voucher['paymentDescription'] ?? null, 'payment_total_amount' => $voucher['paymentTotalAmount'] ?? $voucher['totalPaidAmount'] ?? 0, 'status' => $voucher['status'] ?? 'PENDING_MANAGER', 'manager_note' => $voucher['managerNote'] ?? null, 'reviewed_by' => $voucher['reviewedBy'] ?? null, 'reviewed_at' => sqlDate($voucher['reviewedAt'] ?? null), 'paid_by' => $voucher['paidBy'] ?? null, 'paid_at' => sqlDate($voucher['paidAt'] ?? null), 'created_at' => sqlDate($voucher['createdAt'] ?? null) ?? date('Y-m-d H:i:s')]);
            foreach (($voucher['items'] ?? []) as $index => $item) {
                insertRow($pdo, 'payment_voucher_items', ['id' => $item['id'], 'voucher_id' => $voucher['id'], 'line_no' => $index + 1, 'job_number' => $item['jobNumber'] ?? '', 'customer_name' => $item['customerName'] ?? '', 'item_service' => $item['itemService'] ?? '', 'amount' => $item['amount'] ?? 0, 'vat_applied' => !empty($item['vatApplied']) ? 1 : 0, 'vat_amount' => $item['vatAmount'] ?? 0, 'total' => $item['total'] ?? 0, 'pph23_applied' => !empty($item['pph23Applied']) ? 1 : 0, 'pph23_amount' => $item['pph23Amount'] ?? 0, 'paid_amount' => $item['paidAmount'] ?? 0]);
            }
        }
        foreach (($state['jobCalls'] ?? []) as $job) {
            insertRow($pdo, 'vessel_calls', ['job_id' => $job['jobId'], 'vessel_id' => $job['vesselId'], 'port_id' => $job['portId'], 'customer_id' => $job['customerId'], 'currency' => $job['currency'], 'exchange_rate_usd_to_idr' => $job['exchangeRateUSDToIDR'] ?? 15800, 'eta' => sqlDate($job['eta'] ?? null), 'etd' => sqlDate($job['etd'] ?? null), 'purpose_of_call' => $job['purposeOfCall'], 'current_stage' => $job['currentStage'], 'status' => $job['status'], 'created_at' => sqlDate($job['createdAt'] ?? null) ?? date('Y-m-d H:i:s'), 'updated_at' => sqlDate($job['updatedAt'] ?? null) ?? date('Y-m-d H:i:s')]);
            $inquiry = $job['inquiry'] ?? [];
            insertRow($pdo, 'inquiries', ['job_id' => $job['jobId'], 'inquiry_no' => $inquiry['inquiryNo'], 'inquiry_date' => sqlDate($inquiry['date'] ?? null, true) ?? date('Y-m-d'), 'eta_remarks' => $inquiry['etaRemarks'] ?? null, 'etd_remarks' => $inquiry['etdRemarks'] ?? null, 'cargo_quantity' => $inquiry['cargoQuantity'] ?? null, 'quantity_unit' => ($inquiry['quantityUnit'] ?? null) === 'MATRIX_TON' ? 'MT' : ($inquiry['quantityUnit'] ?? null), 'cargo_details' => $inquiry['cargoDetails'] ?? '', 'estimated_days' => $inquiry['estimatedDays'] ?? 0, 'special_requirements' => $inquiry['specialRequirements'] ?? '', 'status' => $inquiry['status'] ?? 'RECEIVED', 'created_by_user_id' => !empty($inquiry['createdByUserId']) ? $inquiry['createdByUserId'] : null, 'created_by_name' => $inquiry['createdByName'] ?? $inquiry['createdBy'] ?? '', 'created_by_branch' => $inquiry['createdByBranch'] ?? null, 'created_by_branch_code' => $inquiry['createdByBranchCode'] ?? null]);
            foreach (['EPDA' => 'epda', 'PDA' => 'pda'] as $quoteType => $key) {
                $quote = $job['quotation'][$key] ?? [];
                insertRow($pdo, 'quotations', ['id' => $job['jobId'] . '-' . $quoteType, 'job_id' => $job['jobId'], 'quote_type' => $quoteType, 'quote_no' => $quote['quoteNo'] ?: $job['jobId'] . '-' . $quoteType, 'quote_date' => sqlDate($quote['date'] ?? null, true) ?? date('Y-m-d'), 'currency' => $quote['currency'] ?? $job['currency'], 'exchange_rate_usd_to_idr' => $quote['exchangeRateUSDToIDR'] ?? $job['exchangeRateUSDToIDR'] ?? 15800, 'total_buy_rate' => $quote['totalBuyRate'] ?? 0, 'total_sell_rate' => $quote['totalSellRate'] ?? 0, 'margin_amount' => $quote['marginAmount'] ?? 0, 'margin_percentage' => $quote['marginPercentage'] ?? 0, 'status' => $quote['status'] ?? 'DRAFT']);
                foreach (($quote['items'] ?? []) as $index => $item) insertRow($pdo, 'quotation_items', ['id' => $item['id'] ?: $job['jobId'] . '-' . $quoteType . '-' . ($index + 1), 'quotation_id' => $job['jobId'] . '-' . $quoteType, 'expense_item_id' => $item['expenseItemId'] ?: null, 'fix_tariff_id' => $item['fixTariffId'] ?? null, 'entry_order' => $index + 1, 'name' => $item['name'], 'category' => $item['category'], 'basis' => $item['basis'] ?? '', 'quantity' => $item['quantity'] ?? 1, 'unit_buy_rate' => $item['unitBuyRate'] ?? 0, 'unit_sell_rate' => $item['unitSellRate'] ?? 0, 'total_buy_rate' => $item['totalBuyRate'] ?? 0, 'total_sell_rate' => $item['totalSellRate'] ?? 0, 'currency' => $item['currency'] ?? $quote['currency'] ?? $job['currency'], 'tariff_type' => $item['tariffType'] ?? null, 'calculation_basis' => $item['calculationBasis'] ?? null, 'tariff_rate' => $item['tariffRate'] ?? null, 'remarks' => $item['remarks'] ?? null]);
            }
            $crew = $job['quotation']['crewChange'] ?? [];
            if (!empty($crew['id'])) {
                insertRow($pdo, 'crew_change_plans', ['id' => $crew['id'], 'job_id' => $job['jobId'], 'plan_date' => sqlDate($crew['date'] ?? null, true) ?? date('Y-m-d'), 'sign_on_count' => $crew['signOnCount'] ?? 0, 'sign_off_count' => $crew['signOffCount'] ?? 0, 'logistics_cost' => $crew['logisticsCost'] ?? 0, 'immigration_visa_cost' => $crew['immigrationVisaCost'] ?? 0, 'transport_cost' => $crew['transportCost'] ?? 0, 'total_cost_usd' => $crew['totalCostUSD'] ?? 0, 'total_cost_idr' => $crew['totalCostIDR'] ?? 0, 'status' => $crew['status'] ?? 'PLANNED']);
                foreach (($crew['members'] ?? []) as $member) insertRow($pdo, 'crew_members', ['id' => $member['id'], 'crew_change_plan_id' => $crew['id'], 'name' => $member['name'], 'passport_number' => $member['passportNumber'], 'seaman_book' => $member['seamanBook'], 'rank' => $member['rank'], 'nationality' => $member['nationality'], 'crew_type' => $member['type'], 'flight_details' => $member['flightDetails'] ?? null, 'hotel_booked' => $member['hotelBooked'] ?? false, 'transit_cost_usd' => $member['transitCostUSD'] ?? 0, 'immigration_status' => $member['immigrationStatus'] ?? 'PENDING']);
            }
            $approval = $job['managerApproval'] ?? [];
            insertRow($pdo, 'manager_approvals', ['job_id' => $job['jobId'], 'status' => $approval['status'] ?? 'PENDING', 'approved_by_user_id' => null, 'approved_by_name' => $approval['approvedBy'] ?? null, 'approved_at' => sqlDate($approval['approvedAt'] ?? null), 'notes' => $approval['notes'] ?? null, 'allowed_margin_tolerance_pct' => $approval['allowedMarginTolerancePct'] ?? 0]);
            $operation = $job['operationalData'] ?? [];
            insertRow($pdo, 'operational_data', ['job_id' => $job['jobId'], 'ata' => sqlDate($operation['ata'] ?? null), 'atb' => sqlDate($operation['atb'] ?? null), 'atd' => sqlDate($operation['atd'] ?? null), 'pilot_on_board_time' => sqlDate($operation['pilotOnBoardTime'] ?? null), 'pilot_off_time' => sqlDate($operation['pilotOffTime'] ?? null), 'berth_zone_name' => $operation['berthZoneName'] ?? null, 'cargo_quantity_metric_tons' => $operation['cargoQuantityMetricTons'] ?? null, 'cargo_commodity' => $operation['cargoCommodity'] ?? null, 'harbor_master_clearance_no' => $operation['harborMasterClearanceNo'] ?? null]);
            foreach (($operation['statementOfFacts'] ?? []) as $fact) insertRow($pdo, 'statements_of_fact', ['id' => uniqueRecordId($usedSofIds, (string) $fact['id'], (string) $job['jobId']), 'job_id' => $job['jobId'], 'event_time' => sqlDate($fact['timestamp'] ?? null), 'event' => $fact['event'], 'remarks' => $fact['remarks'] ?? null]);
            foreach (($job['actualCosts'] ?? []) as $cost) insertRow($pdo, 'actual_costs', ['id' => $cost['id'], 'job_id' => $job['jobId'], 'item_code' => $cost['itemCode'], 'description' => $cost['description'], 'category' => $cost['category'], 'vendor_name' => $cost['vendorName'] ?? '', 'invoice_or_voucher_no' => $cost['invoiceOrVoucherNo'] ?? '', 'cost_date' => sqlDate($cost['date'] ?? null, true) ?? date('Y-m-d'), 'quantity' => $cost['quantity'] ?? null, 'amount' => $cost['amount'] ?? 0, 'currency' => $cost['currency'] ?? $job['currency'], 'tariff_type' => $cost['tariffType'] ?? null, 'calculation_basis' => $cost['calculationBasis'] ?? null, 'tariff_rate' => $cost['tariffRate'] ?? null, 'pda_amount_estimated' => $cost['pdaAmountEstimated'] ?? 0, 'variance_amount' => $cost['varianceAmount'] ?? 0, 'status' => $cost['status'] ?? 'PENDING_VERIFICATION', 'attachment_name' => $cost['attachmentName'] ?? null, 'attachment_data_url' => $cost['attachmentDataUrl'] ?? null, 'remarks' => $cost['remarks'] ?? null]);
            $fda = $job['fda'] ?? [];
            insertRow($pdo, 'fda_records', ['job_id' => $job['jobId'], 'fda_no' => $fda['fdaNo'] ?: $job['jobId'] . '-FDA', 'fda_date' => sqlDate($fda['date'] ?? null, true) ?? date('Y-m-d'), 'currency' => $fda['currency'] ?? $job['currency'], 'exchange_rate_usd_to_idr' => $fda['exchangeRateUSDToIDR'] ?? $job['exchangeRateUSDToIDR'] ?? 15800, 'total_estimated_buy' => $fda['totalEstimatedBuy'] ?? 0, 'total_estimated_sell' => $fda['totalEstimatedSell'] ?? 0, 'total_actual_cost' => $fda['totalActualCost'] ?? 0, 'final_billed_to_principal' => $fda['finalBilledToPrincipal'] ?? 0, 'variance_amount' => $fda['varianceAmount'] ?? 0, 'variance_percentage' => $fda['variancePercentage'] ?? 0, 'fda_approved' => $fda['fdaApproved'] ?? false, 'approval_status' => $fda['approvalStatus'] ?? 'DRAFT', 'submitted_by_user_id' => null, 'submitted_by_name' => $fda['submittedBy'] ?? null, 'submitted_at' => sqlDate($fda['submittedAt'] ?? null), 'approved_by_user_id' => null, 'approved_by_name' => $fda['approvedBy'] ?? null, 'approved_at' => sqlDate($fda['approvedAt'] ?? null), 'notes' => $fda['notes'] ?? null, 'pdf_file_name' => $fda['pdfFileName'] ?? null, 'pdf_data_url' => $fda['pdfDataUrl'] ?? null]);
            foreach (($job['ap'] ?? []) as $item) insertRow($pdo, 'ap_items', ['id' => $item['id'], 'job_id' => $job['jobId'], 'voucher_no' => $item['voucherNo'], 'vendor_name' => $item['vendorName'], 'description' => $item['description'], 'invoice_date' => sqlDate($item['invoiceDate'] ?? null, true) ?? date('Y-m-d'), 'due_date' => sqlDate($item['dueDate'] ?? null, true) ?? date('Y-m-d'), 'amount' => $item['amount'] ?? 0, 'currency' => $item['currency'] ?? $job['currency'], 'status' => $item['status'] ?? 'UNPAID', 'payment_ref' => $item['paymentRef'] ?? null, 'paid_date' => sqlDate($item['paidDate'] ?? null, true)]);
            foreach (($job['ar'] ?? []) as $item) insertRow($pdo, 'ar_items', ['id' => $item['id'], 'job_id' => $job['jobId'], 'reference_no' => $item['referenceNo'], 'principal_name' => $item['principalName'], 'description' => $item['description'], 'requested_amount' => $item['requestedAmount'] ?? 0, 'received_amount' => $item['receivedAmount'] ?? 0, 'currency' => $item['currency'] ?? $job['currency'], 'received_date' => sqlDate($item['receivedDate'] ?? null, true), 'bank_account' => $item['bankAccount'] ?? null, 'status' => $item['status'] ?? 'AWAITING_REMITTANCE']);
            foreach (($job['principalReceipts'] ?? []) as $receipt) insertRow($pdo, 'principal_receipts', ['id' => $receipt['id'], 'job_id' => $job['jobId'], 'received_date' => sqlDate($receipt['receivedDate'] ?? null, true) ?? date('Y-m-d'), 'amount' => $receipt['amount'], 'currency' => $receipt['currency'] ?? $job['currency'], 'payment_type' => $receipt['paymentType'], 'bank_remark' => $receipt['bankRemark'] ?? '', 'attachment_name' => $receipt['attachmentName'] ?? null, 'attachment_data_url' => $receipt['attachmentDataUrl'] ?? null]);
            $invoice = $job['principalInvoice'] ?? [];
            insertRow($pdo, 'principal_invoices', ['job_id' => $job['jobId'], 'invoice_no' => $invoice['invoiceNo'] ?: $job['jobId'] . '-INV', 'invoice_date' => sqlDate($invoice['invoiceDate'] ?? null, true) ?? date('Y-m-d'), 'due_date' => sqlDate($invoice['dueDate'] ?? null, true) ?? date('Y-m-d'), 'total_amount_usd' => $invoice['totalAmountUSD'] ?? 0, 'total_amount_idr' => $invoice['totalAmountIDR'] ?? 0, 'advance_deducted_usd' => $invoice['advanceDeductedUSD'] ?? 0, 'advance_deducted_idr' => $invoice['advanceDeductedIDR'] ?? 0, 'balance_due_usd' => $invoice['balanceDueUSD'] ?? 0, 'balance_due_idr' => $invoice['balanceDueIDR'] ?? 0, 'status' => $invoice['status'] ?? 'DRAFT', 'pdf_generated' => $invoice['pdfGenerated'] ?? false]);
            $closing = $job['closing'] ?? [];
            insertRow($pdo, 'closing_records', ['job_id' => $job['jobId'], 'is_closed' => $closing['isClosed'] ?? false, 'closed_at' => sqlDate($closing['closedAt'] ?? null), 'closed_by_user_id' => null, 'closed_by_name' => $closing['closedBy'] ?? null, 'final_gross_margin_usd' => $closing['finalGrossMarginUSD'] ?? 0, 'final_gross_margin_idr' => $closing['finalGrossMarginIDR'] ?? 0, 'post_voyage_remarks' => $closing['postVoyageRemarks'] ?? null]);
        }
        foreach (($state['auditLogs'] ?? []) as $log) insertRow($pdo, 'audit_logs', ['id' => $log['id'], 'logged_at' => sqlDate($log['timestamp'] ?? null) ?? date('Y-m-d H:i:s'), 'actor_id' => $log['actorId'] ?? null, 'actor_name' => $log['actorName'] ?? 'System', 'actor_role' => $log['role'] ?? 'ADMIN', 'action' => $log['action'] ?? 'UPDATE', 'entity' => $log['entity'] ?? 'SYSTEM', 'entity_id' => $log['entityId'] ?? null, 'description' => $log['description'] ?? '']);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
