<?php

declare(strict_types=1);

$projectRoot = dirname(__DIR__, 2);
$seedPath = $projectRoot . '/database/migrations/20261025_add_finance_coa.sql';
$outputPath = __DIR__ . '/legacy_2025_accounting_import.sql';
$pdo = new PDO(
    'mysql:host=127.0.0.1;port=3306;dbname=portal managemet lgm;charset=utf8mb4',
    'root',
    '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
);

function sqlFields(string $tuple): array
{
    $fields = [];
    $value = '';
    $quoted = false;
    $length = strlen($tuple);
    for ($index = 0; $index < $length; $index++) {
        $character = $tuple[$index];
        if ($character === "'") {
            if ($quoted && ($tuple[$index + 1] ?? '') === "'") {
                $value .= "'";
                $index++;
            } else {
                $quoted = !$quoted;
            }
        } elseif ($character === ',' && !$quoted) {
            $fields[] = trim($value);
            $value = '';
        } else {
            $value .= $character;
        }
    }
    $fields[] = trim($value);
    return $fields;
}

function normalizeAccountName(string $value): string
{
    return mb_strtolower((string) preg_replace('/\s+/u', ' ', trim($value)), 'UTF-8');
}

function quoteSql(?string $value): string
{
    if ($value === null) return 'NULL';
    return "'" . str_replace(["\\", "'", "\0"], ["\\\\", "''", ''], $value) . "'";
}

function amountSql(mixed $value): string
{
    return number_format((float) $value, 2, '.', '');
}

$coaSeed = file_get_contents($seedPath);
if ($coaSeed === false) throw new RuntimeException('COA seed could not be read.');
$coaByCodeAndName = [];
$coaByCode = [];
foreach (preg_split('/\R/', $coaSeed) as $line) {
    $line = trim($line);
    if (!str_starts_with($line, "('COA-")) continue;
    $open = strpos($line, '(');
    $close = strrpos($line, ')');
    if ($open === false || $close === false) continue;
    $fields = sqlFields(substr($line, $open + 1, $close - $open - 1));
    if (count($fields) < 4) continue;
    $id = $fields[0];
    $code = $fields[1];
    $name = $fields[2];
    $account = ['id' => $id, 'code' => $code, 'name' => $name];
    $coaByCodeAndName[$code . '|' . normalizeAccountName($name)] = $account;
    $coaByCode[$code][] = $account;
}

$query = $pdo->query(
    "SELECT h.id AS legacy_id, h.entry_no, h.entry_date, h.description, h.reference_no, h.status, "
    . 'l.id AS legacy_line_id, c.code AS coa_code, c.name AS coa_name, l.debit, l.credit, l.memo '
    . 'FROM lgm_journal_entries h '
    . 'INNER JOIN lgm_journal_lines l ON l.journal_id = h.id '
    . 'INNER JOIN lgm_coa c ON c.id = l.coa_id '
    . "WHERE h.status = 'Posted' AND h.entry_date >= '2025-01-01' AND h.entry_date < '2026-01-01' "
    . 'ORDER BY h.entry_date, h.id, l.id'
);

$journals = [];
$unmatchedAccounts = [];
foreach ($query as $row) {
    $coaKey = $row['coa_code'] . '|' . normalizeAccountName((string) $row['coa_name']);
    $account = $coaByCodeAndName[$coaKey] ?? null;
    if ($account === null && count($coaByCode[$row['coa_code']] ?? []) === 1) {
        $account = $coaByCode[$row['coa_code']][0];
    }
    if ($account === null) {
        $unmatchedAccounts[$row['coa_code'] . '|' . $row['coa_name']] = true;
        continue;
    }
    $journalId = (string) $row['legacy_id'];
    if (!isset($journals[$journalId])) {
        $journals[$journalId] = [
            'legacyId' => $journalId,
            'entryNo' => (string) $row['entry_no'],
            'entryDate' => (string) $row['entry_date'],
            'description' => (string) $row['description'],
            'referenceNo' => (string) ($row['reference_no'] ?? ''),
            'debitTotal' => 0.0,
            'creditTotal' => 0.0,
            'lines' => [],
        ];
    }
    $debit = round((float) $row['debit'], 2);
    $credit = round((float) $row['credit'], 2);
    $journals[$journalId]['debitTotal'] += $debit;
    $journals[$journalId]['creditTotal'] += $credit;
    $lineNo = count($journals[$journalId]['lines']) + 1;
    if ($debit > 0) {
        $journals[$journalId]['lines'][] = [
            'id' => 'ACL-H25-' . $row['legacy_line_id'] . '-D',
            'lineNo' => $lineNo,
            'coaId' => $account['id'],
            'memo' => (string) ($row['memo'] ?? ''),
            'direction' => 'DEBIT',
            'amount' => $debit,
        ];
        $lineNo++;
    }
    if ($credit > 0) {
        $journals[$journalId]['lines'][] = [
            'id' => 'ACL-H25-' . $row['legacy_line_id'] . '-C',
            'lineNo' => $lineNo,
            'coaId' => $account['id'],
            'memo' => (string) ($row['memo'] ?? ''),
            'direction' => 'CREDIT',
            'amount' => $credit,
        ];
    }
}

if ($unmatchedAccounts) {
    fwrite(STDERR, "COA mapping failed; no import SQL was generated:\n");
    foreach (array_keys($unmatchedAccounts) as $account) fwrite(STDERR, $account . "\n");
    exit(1);
}
if (!$journals) throw new RuntimeException('No posted 2025 journal lines were found.');
foreach ($journals as $journal) {
    if (abs(round($journal['debitTotal'] - $journal['creditTotal'], 2)) > 0.01) {
        throw new RuntimeException('Unbalanced legacy journal: ' . $journal['entryNo']);
    }
}

$sql = [
    '-- Historical GL 2025 transfer from local legacy database.',
    '-- Import this only after applying 20261032_add_historical_accounting_source.sql.',
    '-- All consolidated entries use JKT as a required branch anchor; statement totals remain company-wide.',
    'SET @legacy_actor_id := (SELECT id FROM users WHERE role = \'ADMIN\' AND status = \'ACTIVE\' ORDER BY created_at, id LIMIT 1);',
    'SET @legacy_actor_name := (SELECT name FROM users WHERE id = @legacy_actor_id LIMIT 1);',
    'SET @legacy_branch_id := (SELECT id FROM branches WHERE code = \'JKT\' LIMIT 1);',
    'SELECT @legacy_actor_id AS import_actor_id, @legacy_branch_id AS branch_anchor_id;',
    'START TRANSACTION;',
];

$headerValues = [];
foreach ($journals as $journal) {
    $reference = $journal['referenceNo'] !== '' ? ' | Ref ' . $journal['referenceNo'] : '';
    $description = $journal['description'] . ' [Legacy ' . $journal['entryNo'] . $reference . ']';
    $journalNumber = 'HIST/2025/' . str_pad((string) $journal['legacyId'], 6, '0', STR_PAD_LEFT);
    $sourceKey = 'legacy-gl-2025-' . $journal['legacyId'];
    $sourceId = 'LGM-GL-' . $journal['legacyId'];
    $headerValues[] = '(' . implode(', ', [
        quoteSql('ACJ-HIST25-' . $journal['legacyId']),
        quoteSql($journalNumber),
        quoteSql('HISTORICAL'),
        quoteSql($sourceKey),
        quoteSql($sourceId),
        '@legacy_branch_id',
        quoteSql('KONSOLIDASI (JKT anchor)'),
        quoteSql($journal['entryDate']),
        quoteSql($description),
        quoteSql('POSTED'),
        '@legacy_actor_id',
        '@legacy_actor_name',
        '@legacy_actor_id',
        '@legacy_actor_name',
        'NULL',
        'NULL',
        'NULL',
    ]) . ')';
}
$sql[] = 'INSERT IGNORE INTO accounting_journals '
    . '(id, journal_number, source_type, source_key, source_id, branch_id, branch_name, entry_date, description, status, '
    . 'created_by_user_id, created_by_name, updated_by_user_id, updated_by_name, posted_by_user_id, posted_by_name, posted_at) VALUES';
$sql[] = implode(",\n", $headerValues) . ';';

$lineValues = [];
foreach ($journals as $journal) {
    foreach ($journal['lines'] as $line) {
        $lineValues[] = '(' . implode(', ', [
            quoteSql($line['id']),
            quoteSql('ACJ-HIST25-' . $journal['legacyId']),
            (string) $line['lineNo'],
            quoteSql($line['coaId']),
            quoteSql($line['memo']),
            quoteSql($line['direction']),
            amountSql($line['amount']),
        ]) . ')';
    }
}
$sql[] = 'INSERT IGNORE INTO accounting_journal_lines (id, journal_id, line_no, coa_id, memo, direction, amount) VALUES';
$sql[] = implode(",\n", $lineValues) . ';';
$sql[] = 'COMMIT;';
$sql[] = "SELECT COUNT(*) AS imported_historical_journals FROM accounting_journals WHERE source_type = 'HISTORICAL' AND source_key LIKE 'legacy-gl-2025-%';";
$sql[] = "SELECT COUNT(*) AS imported_historical_lines FROM accounting_journal_lines l INNER JOIN accounting_journals j ON j.id = l.journal_id WHERE j.source_type = 'HISTORICAL' AND j.source_key LIKE 'legacy-gl-2025-%';";

if (file_put_contents($outputPath, implode("\n", $sql) . "\n") === false) {
    throw new RuntimeException('Could not write generated import SQL.');
}

printf(
    "Generated %s\nJournals: %d\nJournal lines: %d\nAll journals balanced and all COAs mapped.\n",
    $outputPath,
    count($journals),
    count($lineValues),
);
