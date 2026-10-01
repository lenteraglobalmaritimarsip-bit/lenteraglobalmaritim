<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? '';

try {
    if ($action === 'login') {
        requireMethod('POST');
        $body = requestJson();
        $identifier = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($identifier === '' || $password === '') jsonResponse(['error' => 'Username dan password wajib diisi'], 400);
        if (!preg_match('/^\d{8}$/', $password)) jsonResponse(['error' => 'Password harus tepat 8 digit angka'], 400);

        $query = db()->prepare(
            'SELECT id, name, email, username, password_hash, role, department, branch_code, branch_name, position, phone, avatar, status FROM users WHERE (username = :username OR email = :email) AND status = \'ACTIVE\' LIMIT 1'
        );
        $query->execute(['username' => $identifier, 'email' => $identifier]);
        $user = $query->fetch();
        if (!$user || empty($user['password_hash']) || !password_verify($password, $user['password_hash'])) {
            jsonResponse(['error' => 'Username atau password tidak valid'], 401);
        }

        session_regenerate_id(true);
        unset($user['password_hash']);
        $_SESSION['user'] = $user;
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        jsonResponse(['user' => $user, 'csrfToken' => $_SESSION['csrf_token']]);
    }

    if ($action === 'me') {
        requireMethod('GET');
        $user = requireAuthenticatedUser();
        jsonResponse(['user' => $user, 'csrfToken' => $_SESSION['csrf_token'] ?? '']);
    }

    if ($action === 'logout') {
        requireMethod('POST');
        requireAuthenticatedUser();
        requireCsrfToken();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        jsonResponse(['ok' => true]);
    }

    if ($action === 'change-password') {
        requireMethod('POST');
        $user = requireAuthenticatedUser();
        requireCsrfToken();
        $body = requestJson();
        $oldPassword = (string) ($body['oldPassword'] ?? '');
        $newPassword = (string) ($body['newPassword'] ?? '');
        if (!preg_match('/^\d{8}$/', $newPassword)) jsonResponse(['error' => 'Password baru harus tepat 8 digit angka'], 400);

        $query = db()->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
        $query->execute(['id' => $user['id']]);
        $storedHash = $query->fetchColumn();
        if (!$storedHash || !password_verify($oldPassword, $storedHash)) jsonResponse(['error' => 'Password lama tidak sesuai'], 403);

        $update = db()->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
        $update->execute(['password_hash' => password_hash($newPassword, PASSWORD_DEFAULT), 'id' => $user['id']]);
        jsonResponse(['ok' => true]);
    }

    jsonResponse(['error' => 'Unknown auth action'], 404);
} catch (PDOException $error) {
    error_log('MaritimPort auth database error: ' . $error->getMessage());
    jsonResponse(['error' => 'Database authentication failed'], 500);
} catch (Throwable $error) {
    error_log('MaritimPort auth error: ' . $error->getMessage());
    jsonResponse(['error' => 'Authentication failed'], 500);
}
