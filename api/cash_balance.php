<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

try {
    requireAuthenticatedUser();
    requireMethod('GET');
    jsonResponse(['error' => 'Saldo pembuka rekening ditetapkan melalui pembaruan aplikasi dan tidak dapat diubah lewat API'], 410);
} catch (Throwable $error) {
    error_log('Cash balance request failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Pembukuan saldo kas gagal diproses'], 500);
}
