<?php

declare(strict_types=1);

$config = [
    'db' => [
        'host' => getenv('LGM_DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('LGM_DB_PORT') ?: 3306),
        'name' => getenv('LGM_DB_NAME') ?: 'maritim lgm',
        'user' => getenv('LGM_DB_USER') ?: 'root',
        'password' => getenv('LGM_DB_PASSWORD') ?: '',
        'charset' => 'utf8mb4',
    ],
    'allowed_origin' => getenv('LGM_ALLOWED_ORIGIN') ?: 'http://localhost:3000',
    'session_name' => 'lgm_session',
    'debug' => in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost:8000', '127.0.0.1:8000'], true),
];

$localConfigPath = __DIR__ . '/config.local.php';
if (is_file($localConfigPath)) {
    $localConfig = require $localConfigPath;
    if (is_array($localConfig)) {
        $config = array_replace_recursive($config, $localConfig);
    }
}

return $config;
