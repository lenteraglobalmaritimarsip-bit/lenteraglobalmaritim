<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

const PDA_CATEGORIES = [
    'SIGN_ON_CREW',
    'SIGN_OFF_CREW',
    'CREW_MUTATION',
    'MEDICAL_TREATMENT',
    'CREW_BRIEFING',
    'AGENCY_FEE',
];

function pdaBranchCode(string $branch): string
{
    return strtoupper((string) preg_replace('/[^A-Z0-9]/i', '', trim($branch)));
}

function pdaDocumentType(mixed $value): string
{
    $type = $value ?? 'SALES';
    if (!in_array($type, ['SALES', 'FDA'], true)) jsonResponse(['error' => 'Jenis dokumen PDA tidak valid'], 400);
    return $type;
}

function pdaUserBranch(array $user, string $pdaType = 'SALES'): string
{
    $requiredRole = $pdaType === 'FDA' ? 'FDA' : 'SALES';
    if (($user['role'] ?? '') !== $requiredRole) jsonResponse(['error' => "Only {$requiredRole} can access this PDA"], 403);
    $branch = trim((string) ($user['branch_name'] ?? $user['branch'] ?? ''));
    $branchCode = pdaBranchCode($branch);
    if ($branchCode === '' || strlen($branchCode) > 100) {
        jsonResponse(['error' => 'Branch aktif user belum valid untuk PDA'], 422);
    }
    return $branchCode;
}

function pdaRequireManager(array $user): void
{
    if (($user['role'] ?? '') !== 'MANAGER_OPS') jsonResponse(['error' => 'Only Manager OPS can review PDA'], 403);
}

function pdaJob(PDO $connection, string $jobId, string $branchCode, string $pdaType = 'SALES'): string
{
    $query = $connection->prepare(
        'SELECT i.created_by_branch, ma.status AS manager_status FROM vessel_calls vc '
        . 'LEFT JOIN inquiries i ON i.job_id = vc.job_id '
        . 'LEFT JOIN manager_approvals ma ON ma.job_id = vc.job_id '
        . 'WHERE vc.job_id = :job_id LIMIT 1 FOR UPDATE'
    );
    $query->execute(['job_id' => $jobId]);
    $job = $query->fetch();
    if (!$job) jsonResponse(['error' => 'Job PDA tidak ditemukan'], 404);
    $jobBranchCode = pdaBranchCode((string) ($job['created_by_branch'] ?? ''));
    if ($pdaType === 'SALES' && $jobBranchCode !== '' && $jobBranchCode !== $branchCode) {
        jsonResponse(['error' => 'PDA hanya dapat dibuat oleh branch pembuat job'], 403);
    }
    if ($pdaType === 'FDA' && $job['manager_status'] !== 'APPROVED') {
        jsonResponse(['error' => 'PDA FDA hanya dapat dibuat setelah job disetujui Manager OPS'], 403);
    }
    return $pdaType === 'FDA' ? $branchCode : ($jobBranchCode ?: $branchCode);
}

function pdaSourceNumber(PDO $connection, string $jobId, string $pdaType): string
{
    $query = $pdaType === 'FDA'
        ? $connection->prepare('SELECT fda_no FROM fda_records WHERE job_id = :job_id LIMIT 1')
        : $connection->prepare("SELECT quote_no FROM quotations WHERE job_id = :job_id AND quote_type = 'EPDA' LIMIT 1");
    $query->execute(['job_id' => $jobId]);
    $number = trim((string) $query->fetchColumn());
    if ($number === '') {
        jsonResponse([
            'error' => $pdaType === 'FDA'
                ? 'Nomor FDA harus tersedia sebelum FPDA dibuat'
                : 'Nomor EPDA harus tersedia sebelum PDA dibuat',
        ], 409);
    }
    return $number;
}

function pdaNextFpdaNumber(PDO $connection, string $branchCode): string
{
    $numberDate = new DateTimeImmutable('now', new DateTimeZone('Asia/Jakarta'));
    $year = (int) $numberDate->format('Y');
    $month = $numberDate->format('m');
    $sequence = $connection->prepare(
        'INSERT INTO fpda_number_sequences (year, branch_code, last_sequence) '
        . 'VALUES (:year, :branch_code, 1) '
        . 'ON DUPLICATE KEY UPDATE last_sequence = last_sequence + 1'
    );
    $sequence->execute(['year' => $year, 'branch_code' => $branchCode]);

    $readSequence = $connection->prepare(
        'SELECT last_sequence FROM fpda_number_sequences WHERE year = :year AND branch_code = :branch_code'
    );
    $readSequence->execute(['year' => $year, 'branch_code' => $branchCode]);
    $number = (int) $readSequence->fetchColumn();

    return sprintf('%04d/FPDA-LGM-%s/%s/%04d', $number, $branchCode, $month, $year);
}

function pdaNextSalesPdaNumber(PDO $connection, string $branchCode): string
{
    $numberDate = new DateTimeImmutable('now', new DateTimeZone('Asia/Jakarta'));
    $year = (int) $numberDate->format('Y');
    $month = $numberDate->format('m');
    $sequence = $connection->prepare(
        'INSERT INTO pda_number_sequences (year, branch_code, last_sequence) '
        . 'VALUES (:year, :branch_code, 1) '
        . 'ON DUPLICATE KEY UPDATE last_sequence = last_sequence + 1'
    );
    $sequence->execute(['year' => $year, 'branch_code' => $branchCode]);

    $readSequence = $connection->prepare(
        'SELECT last_sequence FROM pda_number_sequences WHERE year = :year AND branch_code = :branch_code'
    );
    $readSequence->execute(['year' => $year, 'branch_code' => $branchCode]);
    $number = (int) $readSequence->fetchColumn();

    return sprintf('%04d/PDA-LGM-%s/%s/%04d', $number, $branchCode, $month, $year);
}

function pdaDefaults(array $value): array
{
    $currency = $value['currency'] ?? 'USD';
    $exchangeRate = $value['exchangeRate'] ?? 0;
    if (!in_array($currency, ['IDR', 'USD'], true) || !is_numeric($exchangeRate) || !is_finite((float) $exchangeRate) || (float) $exchangeRate < 0) {
        jsonResponse(['error' => 'Currency atau kurs PDA tidak valid'], 400);
    }

    foreach (['eta', 'etd'] as $field) {
        if (isset($value[$field]) && (!is_string($value[$field]) || strlen($value[$field]) > 32)) {
            jsonResponse(['error' => 'Tanggal PDA tidak valid'], 400);
        }
    }
    foreach (['etaRemarks', 'etdRemarks'] as $field) {
        if (isset($value[$field]) && (!is_string($value[$field]) || strlen($value[$field]) > 5000)) {
            jsonResponse(['error' => 'Keterangan PDA terlalu panjang'], 400);
        }
    }

    return [
        'currency' => $currency,
        'exchangeRate' => (float) $exchangeRate,
        'eta' => (string) ($value['eta'] ?? ''),
        'etd' => (string) ($value['etd'] ?? ''),
        'etaRemarks' => (string) ($value['etaRemarks'] ?? ''),
        'etdRemarks' => (string) ($value['etdRemarks'] ?? ''),
    ];
}

function validatePdaItemDraft(mixed $item): array
{
    if (!is_array($item)
        || !is_string($item['name'] ?? null)
        || strlen($item['name']) > 250
        || !in_array($item['category'] ?? '', PDA_CATEGORIES, true)
        || !is_numeric($item['price'] ?? null)
        || !is_finite((float) $item['price'])
        || (float) $item['price'] < 0
        || !is_numeric($item['quantity'] ?? null)
        || !is_finite((float) $item['quantity'])
        || (float) $item['quantity'] < 0
        || !is_string($item['unit'] ?? null)
        || strlen($item['unit']) > 80
        || !is_string($item['remarks'] ?? null)
        || strlen($item['remarks']) > 5000
        || !is_bool($item['vatApplied'] ?? null)
    ) {
        jsonResponse(['error' => 'Draft input item PDA tidak valid'], 400);
    }
    $continuedPdaItems = $item['continuedPdaItems'] ?? [];
    if (!is_array($continuedPdaItems) || count($continuedPdaItems) > 500) {
        jsonResponse(['error' => 'Referensi item PDA lanjutan tidak valid'], 400);
    }
    $continuedSourceIds = [];
    foreach ($continuedPdaItems as $reference) {
        if (!is_array($reference)
            || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', (string) ($reference['sourceItemId'] ?? ''))
            || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', (string) ($reference['fpdaItemId'] ?? ''))
            || isset($continuedSourceIds[$reference['sourceItemId']])
        ) {
            jsonResponse(['error' => 'Referensi item PDA lanjutan tidak valid'], 400);
        }
        $continuedSourceIds[$reference['sourceItemId']] = true;
    }
    return [
        'name' => trim($item['name']),
        'category' => $item['category'],
        'price' => (float) $item['price'],
        'quantity' => (float) $item['quantity'],
        'unit' => trim($item['unit']),
        'remarks' => trim($item['remarks']),
        'vatApplied' => $item['vatApplied'],
        'continuedPdaItems' => array_values($continuedPdaItems),
    ];
}

function readPdaDraft(PDO $connection, array $document): array
{
    $pdaType = $document['pda_type'] ?? 'SALES';
    $query = $connection->prepare(
        'SELECT id, category, description, quantity, unit, price, remarks, vat_applied '
        . 'FROM pda_items WHERE job_id = :job_id AND pda_type = :pda_type ORDER BY line_no'
    );
    $query->execute(['job_id' => $document['job_id'], 'pda_type' => $pdaType]);
    $items = array_map(static fn (array $item): array => [
        'id' => $item['id'],
        'category' => $item['category'],
        'description' => $item['description'],
        'quantity' => (float) $item['quantity'],
        'unit' => $item['unit'],
        'price' => (float) $item['price'],
        'remarks' => $item['remarks'],
        'vatApplied' => (bool) $item['vat_applied'],
    ], $query->fetchAll());

    $salesPdaNo = null;
    $salesPdaCurrency = null;
    $salesPdaItems = [];
    if ($pdaType === 'FDA') {
        $salesPdaQuery = $connection->prepare(
            "SELECT pda_no, currency FROM pda_documents WHERE job_id = :job_id AND pda_type = 'SALES' LIMIT 1"
        );
        $salesPdaQuery->execute(['job_id' => $document['job_id']]);
        $salesPda = $salesPdaQuery->fetch();
        if ($salesPda) {
            $salesPdaNo = $salesPda['pda_no'];
            $salesPdaCurrency = $salesPda['currency'];
            $salesPdaItemsQuery = $connection->prepare(
                "SELECT id, category, description, quantity, unit, price, remarks, vat_applied "
                . "FROM pda_items WHERE job_id = :job_id AND pda_type = 'SALES' ORDER BY line_no"
            );
            $salesPdaItemsQuery->execute(['job_id' => $document['job_id']]);
            $salesPdaItems = array_map(static fn (array $item): array => [
                'id' => $item['id'],
                'category' => $item['category'],
                'description' => $item['description'],
                'quantity' => (float) $item['quantity'],
                'unit' => $item['unit'],
                'price' => (float) $item['price'],
                'remarks' => $item['remarks'],
                'vatApplied' => (bool) $item['vat_applied'],
            ], $salesPdaItemsQuery->fetchAll());
        }
    }

    $itemDraft = json_decode((string) $document['item_draft'], true) ?: [
        'name' => '',
        'category' => 'SIGN_ON_CREW',
        'price' => 0,
        'quantity' => 1,
        'unit' => '',
        'remarks' => '',
        'vatApplied' => false,
    ];
    $itemDraft['continuedPdaItems'] ??= [];

    return [
        'jobId' => $document['job_id'],
        'pdaType' => $pdaType,
        'pdaNo' => $document['pda_no'],
        'salesPdaNo' => $salesPdaNo,
        'salesPdaCurrency' => $salesPdaCurrency,
        'salesPdaItems' => $salesPdaItems,
        'approvalStatus' => $document['approval_status'],
        'submittedBy' => $document['submitted_by'],
        'submittedAt' => $document['submitted_at'],
        'reviewedBy' => $document['reviewed_by'],
        'reviewedAt' => $document['reviewed_at'],
        'reviewNotes' => $document['review_notes'],
        'currency' => $document['currency'],
        'exchangeRate' => (float) $document['exchange_rate'],
        'eta' => $document['eta'] ?? '',
        'etd' => $document['etd'] ?? '',
        'etaRemarks' => $document['eta_remarks'] ?? '',
        'etdRemarks' => $document['etd_remarks'] ?? '',
        'itemDraft' => $itemDraft,
        'revision' => (int) $document['revision'],
        'items' => $items,
    ];
}

function validatePdaItems(mixed $items): array
{
    if (!is_array($items) || count($items) > 500) jsonResponse(['error' => 'Daftar item PDA tidak valid'], 400);
    $validated = [];
    $seenIds = [];
    foreach ($items as $item) {
        if (!is_array($item)
            || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', (string) ($item['id'] ?? ''))
            || !in_array($item['category'] ?? '', PDA_CATEGORIES, true)
            || !is_string($item['description'] ?? null)
            || trim($item['description']) === ''
            || strlen($item['description']) > 250
            || !is_numeric($item['quantity'] ?? null)
            || (float) $item['quantity'] < 0
            || !is_numeric($item['price'] ?? null)
            || (float) $item['price'] < 0
            || !is_string($item['unit'] ?? null)
            || strlen($item['unit']) > 80
            || !is_string($item['remarks'] ?? null)
            || strlen($item['remarks']) > 5000
            || !is_bool($item['vatApplied'] ?? null)
        ) {
            jsonResponse(['error' => 'Ada item PDA dengan data tidak valid'], 400);
        }
        $id = (string) $item['id'];
        if (isset($seenIds[$id])) jsonResponse(['error' => 'ID item PDA duplikat'], 400);
        $seenIds[$id] = true;
        $validated[] = [
            'id' => $id,
            'category' => $item['category'],
            'description' => trim($item['description']),
            'quantity' => (float) $item['quantity'],
            'unit' => trim($item['unit']),
            'price' => (float) $item['price'],
            'remarks' => trim($item['remarks']),
            'vatApplied' => $item['vatApplied'],
        ];
    }
    return $validated;
}

try {
    $user = requireAuthenticatedUser();
    $action = (string) ($_GET['action'] ?? '');
    $connection = db();

    if ($action === 'pending') {
        requireMethod('GET');
        pdaRequireManager($user);
        $query = $connection->query("SELECT * FROM pda_documents WHERE approval_status = 'SUBMITTED' ORDER BY submitted_at, pda_type, pda_no");
        $drafts = array_map(static fn (array $document): array => readPdaDraft($connection, $document), $query->fetchAll());
        jsonResponse(['drafts' => $drafts]);
    }

    if ($action === 'revisions') {
        requireMethod('GET');
        $branchCode = pdaUserBranch($user, 'SALES');
        $query = $connection->prepare(
            "SELECT * FROM pda_documents "
            . "WHERE pda_type = 'SALES' AND approval_status = 'REVISION_REQUIRED' "
            . 'AND (branch_code = :branch_code OR created_by_user_id = :user_id) '
            . 'ORDER BY reviewed_at DESC, pda_no'
        );
        $query->execute(['branch_code' => $branchCode, 'user_id' => (string) $user['id']]);
        $drafts = array_map(static fn (array $document): array => readPdaDraft($connection, $document), $query->fetchAll());
        jsonResponse(['drafts' => $drafts]);
    }

    if ($action === 'review') {
        requireMethod('POST');
        requireCsrfToken();
        pdaRequireManager($user);
        $body = requestJson();
        $jobId = trim((string) ($body['jobId'] ?? ''));
        $pdaType = pdaDocumentType($body['pdaType'] ?? 'SALES');
        $decision = $body['decision'] ?? '';
        $notes = $body['notes'] ?? '';
        if ($jobId === '' || strlen($jobId) > 50 || !in_array($decision, ['APPROVED', 'REVISION_REQUIRED'], true)
            || !is_string($notes) || strlen($notes) > 5000
            || ($decision === 'REVISION_REQUIRED' && trim($notes) === '')) {
            jsonResponse(['error' => 'Data review PDA tidak valid'], 400);
        }

        $connection->beginTransaction();
        $query = $connection->prepare('SELECT approval_status FROM pda_documents WHERE job_id = :job_id AND pda_type = :pda_type LIMIT 1 FOR UPDATE');
        $query->execute(['job_id' => $jobId, 'pda_type' => $pdaType]);
        $status = $query->fetchColumn();
        if ($status === false) {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA tidak ditemukan'], 404);
        }
        if ($status !== 'SUBMITTED') {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA tidak sedang menunggu persetujuan'], 409);
        }
        $review = $connection->prepare(
            'UPDATE pda_documents SET approval_status = :status, reviewed_by = :reviewed_by, '
            . 'reviewed_at = CURRENT_TIMESTAMP(3), review_notes = :review_notes, revision = revision + 1 '
            . 'WHERE job_id = :job_id AND pda_type = :pda_type'
        );
        $review->execute([
            'status' => $decision,
            'reviewed_by' => (string) ($user['name'] ?? $user['username'] ?? 'Manager OPS'),
            'review_notes' => trim($notes) !== '' ? trim($notes) : null,
            'job_id' => $jobId,
            'pda_type' => $pdaType,
        ]);
        $connection->commit();
        jsonResponse(['status' => $decision]);
    }

    if ($action === 'approved') {
        requireMethod('GET');
        if (!in_array($user['role'] ?? '', ['SALES', 'FDA'], true)) jsonResponse(['error' => 'Role tidak dapat melihat PDA approved'], 403);
        $branchCode = ($user['role'] ?? '') === 'SALES' ? pdaUserBranch($user, 'SALES') : '';
        $sql = "SELECT job_id FROM pda_documents WHERE pda_type = 'SALES' AND approval_status = 'APPROVED'";
        if ($branchCode !== '') $sql .= ' AND branch_code = :branch_code';
        $sql .= ' ORDER BY pda_no';
        $query = $connection->prepare($sql);
        $query->execute($branchCode !== '' ? ['branch_code' => $branchCode] : []);
        jsonResponse(['jobIds' => array_column($query->fetchAll(), 'job_id')]);
    }

    if ($action === 'view-approved') {
        requireMethod('GET');
        if (($user['role'] ?? '') !== 'FDA') jsonResponse(['error' => 'Only FDA can view approved Sales PDA'], 403);
        $jobId = trim((string) ($_GET['jobId'] ?? ''));
        if ($jobId === '' || strlen($jobId) > 50) jsonResponse(['error' => 'Job ID tidak valid'], 400);
        $query = $connection->prepare(
            "SELECT pd.* FROM pda_documents pd "
            . "INNER JOIN manager_approvals ma ON ma.job_id = pd.job_id AND ma.status = 'APPROVED' "
            . "WHERE pd.job_id = :job_id AND pd.pda_type = 'SALES' AND pd.approval_status = 'APPROVED' LIMIT 1"
        );
        $query->execute(['job_id' => $jobId]);
        $document = $query->fetch();
        if (!$document) jsonResponse(['error' => 'PDA Sales approved tidak ditemukan'], 404);
        jsonResponse(['draft' => readPdaDraft($connection, $document)]);
    }

    if ($action === 'open') {
        requireMethod('POST');
        requireCsrfToken();
        $body = requestJson();
        $jobId = trim((string) ($body['jobId'] ?? ''));
        $pdaType = pdaDocumentType($body['pdaType'] ?? 'SALES');
        $branchCode = pdaUserBranch($user, $pdaType);
        if ($jobId === '' || strlen($jobId) > 50) jsonResponse(['error' => 'Job ID tidak valid'], 400);
        pdaSourceNumber($connection, $jobId, $pdaType);
        $defaults = pdaDefaults(is_array($body['defaults'] ?? null) ? $body['defaults'] : []);

        $connection->beginTransaction();
        $documentBranchCode = pdaJob($connection, $jobId, $branchCode, $pdaType);
        $query = $connection->prepare('SELECT * FROM pda_documents WHERE job_id = :job_id AND pda_type = :pda_type LIMIT 1 FOR UPDATE');
        $query->execute(['job_id' => $jobId, 'pda_type' => $pdaType]);
        $document = $query->fetch();

        if (!$document) {
            $documentNumber = $pdaType === 'FDA'
                ? pdaNextFpdaNumber($connection, $documentBranchCode)
                : pdaNextSalesPdaNumber($connection, $documentBranchCode);
            $defaultItemDraft = json_encode([
                'name' => '',
                'category' => 'SIGN_ON_CREW',
                'price' => 0,
                'quantity' => 1,
                'unit' => '',
                'remarks' => '',
                'vatApplied' => false,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $insert = $connection->prepare(
                'INSERT INTO pda_documents '
                . '(job_id, pda_type, pda_no, branch_code, created_by_user_id, currency, exchange_rate, eta, etd, eta_remarks, etd_remarks, item_draft, revision) '
                . 'VALUES (:job_id, :pda_type, :pda_no, :branch_code, :user_id, :currency, :exchange_rate, :eta, :etd, :eta_remarks, :etd_remarks, :item_draft, 1)'
            );
            $insert->execute([
                'job_id' => $jobId,
                'pda_type' => $pdaType,
                'pda_no' => $documentNumber,
                'branch_code' => $documentBranchCode,
                'user_id' => $user['id'],
                'currency' => $defaults['currency'],
                'exchange_rate' => $defaults['exchangeRate'],
                'eta' => $defaults['eta'],
                'etd' => $defaults['etd'],
                'eta_remarks' => $defaults['etaRemarks'],
                'etd_remarks' => $defaults['etdRemarks'],
                'item_draft' => $defaultItemDraft,
            ]);
            $query->execute(['job_id' => $jobId, 'pda_type' => $pdaType]);
            $document = $query->fetch();
        } else {
            if (!hash_equals((string) $document['branch_code'], $documentBranchCode)) {
                $connection->rollBack();
                jsonResponse(['error' => 'PDA ini dimiliki branch lain'], 403);
            }
        }

        if (!hash_equals((string) $document['branch_code'], $documentBranchCode)) {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA ini dimiliki branch lain'], 403);
        }
        $draft = readPdaDraft($connection, $document);
        $connection->commit();
        jsonResponse(['draft' => $draft]);
    }

    if ($action === 'save') {
        requireMethod('PUT');
        requireCsrfToken();
        $body = requestJson();
        $jobId = trim((string) ($body['jobId'] ?? ''));
        $draft = $body['draft'] ?? null;
        $pdaType = pdaDocumentType(is_array($draft) ? ($draft['pdaType'] ?? $body['pdaType'] ?? 'SALES') : ($body['pdaType'] ?? 'SALES'));
        $branchCode = pdaUserBranch($user, $pdaType);
        if ($jobId === '' || strlen($jobId) > 50 || !is_array($draft) || !isset($draft['revision']) || !is_numeric($draft['revision'])) {
            jsonResponse(['error' => 'Data draft PDA tidak valid'], 400);
        }
        $revision = (int) $draft['revision'];
        if ($revision < 1) jsonResponse(['error' => 'Revisi draft PDA tidak valid'], 400);
        $fields = pdaDefaults($draft);
        $items = validatePdaItems($draft['items'] ?? null);
        $itemDraft = validatePdaItemDraft($draft['itemDraft'] ?? null);
        $encodedItemDraft = json_encode($itemDraft, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encodedItemDraft === false) jsonResponse(['error' => 'Draft input item PDA tidak dapat diproses'], 400);

        $connection->beginTransaction();
    $documentBranchCode = pdaJob($connection, $jobId, $branchCode, $pdaType);
    $documentQuery = $connection->prepare('SELECT * FROM pda_documents WHERE job_id = :job_id AND pda_type = :pda_type LIMIT 1 FOR UPDATE');
    $documentQuery->execute(['job_id' => $jobId, 'pda_type' => $pdaType]);
        $document = $documentQuery->fetch();
        if (!$document) {
            $connection->rollBack();
            jsonResponse(['error' => 'Draft PDA tidak ditemukan. Buka ulang form PDA.'], 404);
        }
        if (!hash_equals((string) $document['branch_code'], $documentBranchCode)) {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA ini dimiliki branch lain'], 403);
        }
        if ((int) $document['revision'] !== $revision) {
            $connection->rollBack();
            jsonResponse(['error' => 'Draft PDA berubah dari sesi lain. Muat ulang form sebelum melanjutkan.'], 409);
        }
        if (!in_array($document['approval_status'], ['DRAFT', 'REVISION_REQUIRED'], true)) {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA terkunci karena sudah dikirim atau disetujui Manager OPS'], 409);
        }

        $update = $connection->prepare(
            'UPDATE pda_documents SET currency = :currency, exchange_rate = :exchange_rate, eta = :eta, etd = :etd, '
            . 'eta_remarks = :eta_remarks, etd_remarks = :etd_remarks, item_draft = :item_draft, revision = revision + 1 '
            . 'WHERE job_id = :job_id AND pda_type = :pda_type'
        );
        $update->execute([
            'currency' => $fields['currency'],
            'exchange_rate' => $fields['exchangeRate'],
            'eta' => $fields['eta'],
            'etd' => $fields['etd'],
            'eta_remarks' => $fields['etaRemarks'],
            'etd_remarks' => $fields['etdRemarks'],
            'item_draft' => $encodedItemDraft,
            'job_id' => $jobId,
            'pda_type' => $pdaType,
        ]);
        $delete = $connection->prepare('DELETE FROM pda_items WHERE job_id = :job_id AND pda_type = :pda_type');
        $delete->execute(['job_id' => $jobId, 'pda_type' => $pdaType]);
        $insert = $connection->prepare(
            'INSERT INTO pda_items (id, job_id, pda_type, line_no, category, description, quantity, unit, price, remarks, vat_applied) '
            . 'VALUES (:id, :job_id, :pda_type, :line_no, :category, :description, :quantity, :unit, :price, :remarks, :vat_applied)'
        );
        foreach ($items as $index => $item) {
            $insert->execute([
                'id' => $item['id'],
                'job_id' => $jobId,
                'pda_type' => $pdaType,
                'line_no' => $index + 1,
                'category' => $item['category'],
                'description' => $item['description'],
                'quantity' => $item['quantity'],
                'unit' => $item['unit'],
                'price' => $item['price'],
                'remarks' => $item['remarks'],
                'vat_applied' => $item['vatApplied'] ? 1 : 0,
            ]);
        }
        $connection->commit();
        jsonResponse(['revision' => $revision + 1]);
    }

    if ($action === 'submit') {
        requireMethod('POST');
        requireCsrfToken();
        $body = requestJson();
        $jobId = trim((string) ($body['jobId'] ?? ''));
        $pdaType = pdaDocumentType($body['pdaType'] ?? 'SALES');
        $branchCode = pdaUserBranch($user, $pdaType);
        $revision = $body['revision'] ?? null;
        if ($jobId === '' || strlen($jobId) > 50 || !is_numeric($revision) || (int) $revision < 1) {
            jsonResponse(['error' => 'Data pengajuan PDA tidak valid'], 400);
        }

        $connection->beginTransaction();
        $documentBranchCode = pdaJob($connection, $jobId, $branchCode, $pdaType);
        $query = $connection->prepare('SELECT * FROM pda_documents WHERE job_id = :job_id AND pda_type = :pda_type LIMIT 1 FOR UPDATE');
        $query->execute(['job_id' => $jobId, 'pda_type' => $pdaType]);
        $document = $query->fetch();
        if (!$document) {
            $connection->rollBack();
            jsonResponse(['error' => 'Draft PDA tidak ditemukan'], 404);
        }
        if (!hash_equals((string) $document['branch_code'], $documentBranchCode)) {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA ini dimiliki branch lain'], 403);
        }
        if ((int) $document['revision'] !== (int) $revision) {
            $connection->rollBack();
            jsonResponse(['error' => 'Draft PDA berubah. Muat ulang form sebelum mengirim.'], 409);
        }
        if (!in_array($document['approval_status'], ['DRAFT', 'REVISION_REQUIRED'], true)) {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA tidak dapat dikirim dengan status saat ini'], 409);
        }
        $itemCount = $connection->prepare('SELECT COUNT(*) FROM pda_items WHERE job_id = :job_id AND pda_type = :pda_type');
        $itemCount->execute(['job_id' => $jobId, 'pda_type' => $pdaType]);
        if ((int) $itemCount->fetchColumn() < 1) {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA harus memiliki minimal satu item sebelum dikirim'], 422);
        }

        $submit = $connection->prepare(
            "UPDATE pda_documents SET approval_status = 'SUBMITTED', submitted_by = :submitted_by, "
            . 'submitted_at = CURRENT_TIMESTAMP(3), reviewed_by = NULL, reviewed_at = NULL, review_notes = NULL, '
            . 'revision = revision + 1 WHERE job_id = :job_id AND pda_type = :pda_type'
        );
        $submit->execute([
            'submitted_by' => (string) ($user['name'] ?? $user['username'] ?? $pdaType),
            'job_id' => $jobId,
            'pda_type' => $pdaType,
        ]);
        $connection->commit();
        jsonResponse(['revision' => (int) $revision + 1, 'status' => 'SUBMITTED']);
    }

    jsonResponse(['error' => 'Unknown PDA action'], 404);
} catch (PDOException $error) {
    if (isset($connection) && $connection instanceof PDO && $connection->inTransaction()) $connection->rollBack();
    error_log('MaritimPort PDA database error: ' . $error->getMessage());
    jsonResponse(['error' => 'PDA draft database operation failed'], 500);
} catch (Throwable $error) {
    if (isset($connection) && $connection instanceof PDO && $connection->inTransaction()) $connection->rollBack();
    error_log('MaritimPort PDA error: ' . $error->getMessage());
    jsonResponse(['error' => 'PDA draft operation failed'], 500);
}
