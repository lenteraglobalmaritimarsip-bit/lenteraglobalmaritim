<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$allowedKeys = ['voucher_draft', 'finance_payment_draft', 'notification_reads'];

try {
    $user = requireAuthenticatedUser();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        requireMethod('GET');
        $key = (string) ($_GET['key'] ?? '');
        if (!in_array($key, $allowedKeys, true)) jsonResponse(['error' => 'Invalid user data key'], 400);

        $query = db()->prepare('SELECT data_json FROM user_app_data WHERE user_id = :user_id AND data_key = :data_key LIMIT 1');
        $query->execute(['user_id' => $user['id'], 'data_key' => $key]);
        $value = $query->fetchColumn();
        jsonResponse(['value' => $value === false ? null : json_decode((string) $value, true)]);
    }

    if ($method === 'PUT') {
        requireMethod('PUT');
        requireCsrfToken();
        $body = requestJson();
        $key = (string) ($body['key'] ?? '');
        if (!in_array($key, $allowedKeys, true) || !array_key_exists('value', $body)) {
            jsonResponse(['error' => 'Invalid user data'], 400);
        }
        $encoded = json_encode($body['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encoded === false || strlen($encoded) > 1048576) jsonResponse(['error' => 'User data is invalid or too large'], 400);

        $query = db()->prepare(
            'INSERT INTO user_app_data (user_id, data_key, data_json) VALUES (:user_id, :data_key, :data_json) '
            . 'ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = CURRENT_TIMESTAMP(3)'
        );
        $query->execute(['user_id' => $user['id'], 'data_key' => $key, 'data_json' => $encoded]);
        jsonResponse(['ok' => true]);
    }

    if ($method === 'DELETE') {
        requireMethod('DELETE');
        requireCsrfToken();
        $key = (string) ($_GET['key'] ?? '');
        if (!in_array($key, $allowedKeys, true)) jsonResponse(['error' => 'Invalid user data key'], 400);

        $query = db()->prepare('DELETE FROM user_app_data WHERE user_id = :user_id AND data_key = :data_key');
        $query->execute(['user_id' => $user['id'], 'data_key' => $key]);
        jsonResponse(['ok' => true]);
    }

    requireMethod('GET', 'PUT', 'DELETE');
} catch (PDOException $error) {
    error_log('MaritimPort user data database error: ' . $error->getMessage());
    jsonResponse(['error' => 'User data operation failed'], 500);
} catch (Throwable $error) {
    error_log('MaritimPort user data error: ' . $error->getMessage());
    jsonResponse(['error' => 'User data operation failed'], 500);
}
