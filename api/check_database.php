<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/repository.php';
$state = loadAppState();
$summary = [];
foreach (['users', 'customers', 'vessels', 'ports', 'zones', 'fixTariffs', 'expensesItems', 'jobCalls', 'auditLogs'] as $key) {
    $summary[$key] = count($state[$key]);
}
echo json_encode(['ok' => true, 'counts' => $summary], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
