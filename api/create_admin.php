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

if ((int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'")->fetchColumn() > 0) {
    fwrite(STDERR, "An ADMIN account already exists. No account was created.\n");
    exit(1);
}

$password = str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
$insert = $pdo->prepare('INSERT INTO users (id, name, email, username, password_hash, role, department, status) VALUES (:id, :name, :email, :username, :password_hash, \'ADMIN\', \'IT & System Admin\', \'ACTIVE\')');
$insert->execute([
    'id' => 'USR-ADMIN-001',
    'name' => 'System Administrator',
    'email' => 'admin@localhost.invalid',
    'username' => 'admin',
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
]);

fwrite(STDOUT, "Admin created. Save these credentials now; the password is shown only once.\n");
fwrite(STDOUT, "Username: admin\nPassword: {$password}\n");
