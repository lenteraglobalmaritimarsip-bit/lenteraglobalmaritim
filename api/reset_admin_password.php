<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$config = require __DIR__ . '/config.php';
$dbConfig = $config['db'];
$dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $dbConfig['host'], $dbConfig['port'], $dbConfig['name'], $dbConfig['charset']);
$pdo = new PDO($dsn, $dbConfig['user'], $dbConfig['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$adminId = $pdo->query("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1")->fetchColumn();
if (!$adminId) {
    fwrite(STDERR, "No ADMIN account exists. Run create_admin.php first.\n");
    exit(1);
}

$password = str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
$update = $pdo->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
$update->execute(['password_hash' => password_hash($password, PASSWORD_DEFAULT), 'id' => $adminId]);
$username = $pdo->prepare('SELECT username FROM users WHERE id = :id');
$username->execute(['id' => $adminId]);

fwrite(STDOUT, "Admin password reset. Save these credentials now; the password is shown only once.\n");
fwrite(STDOUT, "Username: " . ($username->fetchColumn() ?: 'admin') . "\n");
fwrite(STDOUT, "Password: {$password}\n");
