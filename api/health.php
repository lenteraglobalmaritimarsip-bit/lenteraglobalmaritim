<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
requireMethod('GET');

try {
    $version = db()->query('SELECT VERSION()')->fetchColumn();
    jsonResponse(['ok' => true, 'database' => 'connected', 'version' => $version]);
} catch (Throwable $error) {
    error_log('MaritimPort health database error: ' . $error->getMessage());
    jsonResponse(['ok' => false, 'database' => 'unavailable'], 503);
}
