<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

function recordAuthAudit(?array $user, string $action, string $description): void
{
    $insert = db()->prepare(
        'INSERT INTO audit_logs (id, logged_at, actor_id, actor_name, actor_role, action, entity, entity_id, description)
         VALUES (:id, UTC_TIMESTAMP(3), :actor_id, :actor_name, :actor_role, :action, \'AUTH\', :entity_id, :description)'
    );
    $insert->execute([
        'id' => 'AUD-AUTH-' . bin2hex(random_bytes(12)),
        'actor_id' => $user['id'] ?? null,
        'actor_name' => $user['name'] ?? 'Unrecognized account',
        'actor_role' => $user['role'] ?? null,
        'action' => $action,
        'entity_id' => $user['id'] ?? null,
        'description' => $description,
    ]);
}

$action = $_GET['action'] ?? '';

try {
    if ($action === 'login') {
        requireMethod('POST');
        $body = requestJson();
        $identifier = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($identifier === '') jsonResponse(['error' => 'Username atau email wajib diisi'], 400);
        if ($password === '') jsonResponse(['error' => 'Password wajib diisi'], 400);

        $pdo = db();
        $pdo->beginTransaction();
        $query = db()->prepare(
            'SELECT id, name, email, username, password_hash, role, department, branch_name, position, phone, status, failed_login_attempts
             FROM users WHERE username = :username OR email = :email LIMIT 1 FOR UPDATE'
        );
        $query->execute(['username' => $identifier, 'email' => $identifier]);
        $user = $query->fetch();

        if (!$user) {
            $pdo->commit();
            recordAuthAudit(null, 'LOGIN_FAILED', 'Percobaan login gagal untuk akun yang tidak dikenali.');
            jsonResponse(['error' => 'Username atau password tidak valid'], 401);
        }

        if ($user['status'] !== 'ACTIVE') {
            recordAuthAudit($user, 'LOGIN_REJECTED', 'Login ditolak karena akun berstatus nonaktif.');
            $pdo->commit();
            jsonResponse(['error' => 'Akun tidak aktif. Hubungi administrator.'], 401);
        }

        $passwordMatches = preg_match('/^\d{8}$/', $password)
            && !empty($user['password_hash'])
            && password_verify($password, $user['password_hash']);
        if (!$passwordMatches) {
            $failedAttempts = (int) $user['failed_login_attempts'] + 1;
            $locked = $failedAttempts >= 3;
            $update = $locked
                ? $pdo->prepare(
                    'UPDATE users
                     SET failed_login_attempts = :failed_login_attempts,
                         status = \'INACTIVE\',
                         locked_at = CURRENT_TIMESTAMP(3)
                     WHERE id = :id AND status = \'ACTIVE\''
                )
                : $pdo->prepare(
                    'UPDATE users
                     SET failed_login_attempts = :failed_login_attempts,
                         locked_at = NULL
                     WHERE id = :id AND status = \'ACTIVE\''
                );
            $update->execute(['failed_login_attempts' => $failedAttempts, 'id' => $user['id']]);
            if ($update->rowCount() !== 1) {
                throw new RuntimeException('Account lockout update did not affect exactly one active user.');
            }
            recordAuthAudit(
                $user,
                $locked ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
                $locked
                    ? 'Akun dinonaktifkan otomatis setelah 3 kali gagal login.'
                    : 'Login gagal karena password tidak sesuai.',
            );
            $pdo->commit();
            jsonResponse([
                'error' => $locked
                    ? 'Akun dinonaktifkan setelah 3 kali gagal login. Hubungi administrator untuk mengaktifkan kembali.'
                    : 'Username atau password tidak valid',
            ], $locked ? 423 : 401);
        }

        $resetAttempts = $pdo->prepare('UPDATE users SET failed_login_attempts = 0, locked_at = NULL WHERE id = :id');
        $resetAttempts->execute(['id' => $user['id']]);
        recordAuthAudit($user, 'LOGIN', 'User berhasil login.');
        $pdo->commit();

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
        $user = requireAuthenticatedUser();
        requireCsrfToken();
        recordAuthAudit($user, 'LOGOUT', 'User logout.');
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
        recordAuthAudit($user, 'PASSWORD_CHANGED', 'User mengubah password.');
        jsonResponse(['ok' => true]);
    }

    if ($action === 'verify-current-password') {
        requireMethod('POST');
        $user = requireAuthenticatedUser();
        requireCsrfToken();
        $body = requestJson();
        $password = (string) ($body['password'] ?? '');
        if ($password === '') jsonResponse(['error' => 'Password wajib diisi.'], 400);

        $query = db()->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
        $query->execute(['id' => $user['id']]);
        $storedHash = $query->fetchColumn();
        if (!$storedHash || !preg_match('/^\d{8}$/', $password) || !password_verify($password, $storedHash)) {
            jsonResponse(['error' => 'Password salah.'], 401);
        }

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
