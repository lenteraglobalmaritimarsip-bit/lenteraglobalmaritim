<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

const PDA_CATEGORIES = [
    'SIGN_ON_CREW',
    'SIGN_OFF_CREW',
    'CREW_MUTATION',
    'MEDICAL_TREATMENT',
    'CREW_BRIEFING',
];

function pdaBranchCode(string $branch): string
{
    return strtoupper((string) preg_replace('/[^A-Z0-9]/i', '', trim($branch)));
}

function pdaUserBranch(array $user): string
{
    if (($user['role'] ?? '') !== 'SALES') jsonResponse(['error' => 'Only Sales can access PDA Crew drafts'], 403);
    $branch = trim((string) ($user['branch_name'] ?? $user['branch'] ?? ''));
    $branchCode = pdaBranchCode($branch);
    if ($branchCode === '' || strlen($branchCode) > 100) {
        jsonResponse(['error' => 'Branch aktif user belum valid untuk PDA'], 422);
    }
    return $branchCode;
}

function pdaJob(PDO $connection, string $jobId, string $branchCode): void
{
    $query = $connection->prepare(
        'SELECT i.created_by_branch FROM vessel_calls vc '
        . 'LEFT JOIN inquiries i ON i.job_id = vc.job_id WHERE vc.job_id = :job_id LIMIT 1 FOR UPDATE'
    );
    $query->execute(['job_id' => $jobId]);
    $createdByBranch = $query->fetchColumn();
    if ($createdByBranch === false) jsonResponse(['error' => 'Job PDA tidak ditemukan'], 404);
    if (is_string($createdByBranch) && trim($createdByBranch) !== '' && pdaBranchCode($createdByBranch) !== $branchCode) {
        jsonResponse(['error' => 'PDA hanya dapat dibuat oleh branch pembuat job'], 403);
    }
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
    return [
        'name' => trim($item['name']),
        'category' => $item['category'],
        'price' => (float) $item['price'],
        'quantity' => (float) $item['quantity'],
        'unit' => trim($item['unit']),
        'remarks' => trim($item['remarks']),
        'vatApplied' => $item['vatApplied'],
    ];
}

function readPdaDraft(PDO $connection, array $document): array
{
    $query = $connection->prepare(
        'SELECT id, category, description, quantity, unit, price, remarks, vat_applied '
        . 'FROM pda_items WHERE job_id = :job_id ORDER BY line_no'
    );
    $query->execute(['job_id' => $document['job_id']]);
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

    return [
        'pdaNo' => $document['pda_no'],
        'currency' => $document['currency'],
        'exchangeRate' => (float) $document['exchange_rate'],
        'eta' => $document['eta'] ?? '',
        'etd' => $document['etd'] ?? '',
        'etaRemarks' => $document['eta_remarks'] ?? '',
        'etdRemarks' => $document['etd_remarks'] ?? '',
        'itemDraft' => json_decode((string) $document['item_draft'], true) ?: [
            'name' => '',
            'category' => 'SIGN_ON_CREW',
            'price' => 0,
            'quantity' => 1,
            'unit' => '',
            'remarks' => '',
            'vatApplied' => false,
        ],
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
    $branchCode = pdaUserBranch($user);
    $action = (string) ($_GET['action'] ?? '');
    $connection = db();

    if ($action === 'open') {
        requireMethod('POST');
        requireCsrfToken();
        $body = requestJson();
        $jobId = trim((string) ($body['jobId'] ?? ''));
        if ($jobId === '' || strlen($jobId) > 50) jsonResponse(['error' => 'Job ID tidak valid'], 400);
        $defaults = pdaDefaults(is_array($body['defaults'] ?? null) ? $body['defaults'] : []);

        $connection->beginTransaction();
        pdaJob($connection, $jobId, $branchCode);
        $query = $connection->prepare('SELECT * FROM pda_documents WHERE job_id = :job_id LIMIT 1 FOR UPDATE');
        $query->execute(['job_id' => $jobId]);
        $document = $query->fetch();

        if (!$document) {
            $dateParts = $connection->query(
                'SELECT YEAR(CURRENT_DATE) AS current_year, MONTH(CURRENT_DATE) AS current_month'
            )->fetch();
            $year = (int) $dateParts['current_year'];
            $counter = $connection->prepare(
                'INSERT INTO pda_number_sequences (year, branch_code, last_sequence) VALUES (:year, :branch_code, 1) '
                . 'ON DUPLICATE KEY UPDATE last_sequence = last_sequence + 1'
            );
            $counter->execute(['year' => $year, 'branch_code' => $branchCode]);
            $sequenceQuery = $connection->prepare(
                'SELECT last_sequence FROM pda_number_sequences WHERE year = :year AND branch_code = :branch_code FOR UPDATE'
            );
            $sequenceQuery->execute(['year' => $year, 'branch_code' => $branchCode]);
            $sequence = (int) $sequenceQuery->fetchColumn();
            if ($sequence < 1 || $sequence > 9999) {
                $connection->rollBack();
                jsonResponse(['error' => 'Batas nomor PDA 9999 untuk branch dan tahun ini telah tercapai'], 409);
            }
            $pdaNo = sprintf('%04d/PDA-LGM-%s/%02d/%04d', $sequence, $branchCode, (int) $dateParts['current_month'], $year);
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
                . '(job_id, pda_no, branch_code, created_by_user_id, currency, exchange_rate, eta, etd, eta_remarks, etd_remarks, item_draft, revision) '
                . 'VALUES (:job_id, :pda_no, :branch_code, :user_id, :currency, :exchange_rate, :eta, :etd, :eta_remarks, :etd_remarks, :item_draft, 1)'
            );
            $insert->execute([
                'job_id' => $jobId,
                'pda_no' => $pdaNo,
                'branch_code' => $branchCode,
                'user_id' => $user['id'],
                'currency' => $defaults['currency'],
                'exchange_rate' => $defaults['exchangeRate'],
                'eta' => $defaults['eta'],
                'etd' => $defaults['etd'],
                'eta_remarks' => $defaults['etaRemarks'],
                'etd_remarks' => $defaults['etdRemarks'],
                'item_draft' => $defaultItemDraft,
            ]);
            $query->execute(['job_id' => $jobId]);
            $document = $query->fetch();
        }

        if (!hash_equals((string) $document['branch_code'], $branchCode)) {
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
        $documentQuery = $connection->prepare('SELECT * FROM pda_documents WHERE job_id = :job_id LIMIT 1 FOR UPDATE');
        $documentQuery->execute(['job_id' => $jobId]);
        $document = $documentQuery->fetch();
        if (!$document) {
            $connection->rollBack();
            jsonResponse(['error' => 'Draft PDA tidak ditemukan. Buka ulang form PDA.'], 404);
        }
        if (!hash_equals((string) $document['branch_code'], $branchCode)) {
            $connection->rollBack();
            jsonResponse(['error' => 'PDA ini dimiliki branch lain'], 403);
        }
        if ((int) $document['revision'] !== $revision) {
            $connection->rollBack();
            jsonResponse(['error' => 'Draft PDA berubah dari sesi lain. Muat ulang form sebelum melanjutkan.'], 409);
        }

        $update = $connection->prepare(
            'UPDATE pda_documents SET currency = :currency, exchange_rate = :exchange_rate, eta = :eta, etd = :etd, '
            . 'eta_remarks = :eta_remarks, etd_remarks = :etd_remarks, item_draft = :item_draft, revision = revision + 1 '
            . 'WHERE job_id = :job_id'
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
        ]);
        $delete = $connection->prepare('DELETE FROM pda_items WHERE job_id = :job_id');
        $delete->execute(['job_id' => $jobId]);
        $insert = $connection->prepare(
            'INSERT INTO pda_items (id, job_id, line_no, category, description, quantity, unit, price, remarks, vat_applied) '
            . 'VALUES (:id, :job_id, :line_no, :category, :description, :quantity, :unit, :price, :remarks, :vat_applied)'
        );
        foreach ($items as $index => $item) {
            $insert->execute([
                'id' => $item['id'],
                'job_id' => $jobId,
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
