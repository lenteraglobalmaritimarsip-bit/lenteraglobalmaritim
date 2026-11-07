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

function biometricDeviceId(mixed $value): string
{
    $deviceId = is_string($value) ? strtolower(trim($value)) : '';
    if (!preg_match('/^[a-f0-9]{32}$/', $deviceId)) jsonResponse(['error' => 'Identitas perangkat tidak valid.'], 400);
    return $deviceId;
}

function createBiometricChallenge(PDO $pdo, string $userId, string $deviceId, string $purpose): array
{
    $pdo->exec('DELETE FROM auth_biometric_challenges WHERE expires_at < UTC_TIMESTAMP(3) - INTERVAL 1 DAY');
    $rateLimit = $pdo->prepare(
        'SELECT COUNT(*) FROM auth_biometric_challenges
         WHERE user_id = :user_id AND device_id = :device_id
           AND created_at >= UTC_TIMESTAMP(3) - INTERVAL 10 MINUTE'
    );
    $rateLimit->execute(['user_id' => $userId, 'device_id' => $deviceId]);
    if ((int) $rateLimit->fetchColumn() >= 10) {
        jsonResponse(['error' => 'Terlalu banyak percobaan biometrik. Coba lagi beberapa menit lagi.'], 429);
    }

    $challengeId = bin2hex(random_bytes(16));
    $challenge = bin2hex(random_bytes(32));
    $signedMessage = implode('|', ['LGM-BIOMETRIC', $purpose, $challengeId, $challenge, $userId, $deviceId]);
    $insert = $pdo->prepare(
        'INSERT INTO auth_biometric_challenges
         (id, user_id, device_id, purpose, challenge_value, expires_at)
         VALUES (:id, :user_id, :device_id, :purpose, :challenge, UTC_TIMESTAMP(3) + INTERVAL 2 MINUTE)'
    );
    $insert->execute([
        'id' => $challengeId,
        'user_id' => $userId,
        'device_id' => $deviceId,
        'purpose' => $purpose,
        'challenge' => $challenge,
    ]);
    return ['challengeId' => $challengeId, 'signedMessage' => $signedMessage];
}

function verifyBiometricSignature(string $publicKeyDerBase64, string $message, string $signatureBase64): bool
{
    $publicKeyDer = base64_decode($publicKeyDerBase64, true);
    $signature = base64_decode($signatureBase64, true);
    if ($publicKeyDer === false || $signature === false || strlen($publicKeyDer) > 1024 || strlen($signature) > 256) return false;
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($publicKeyDer), 64, "\n") . "-----END PUBLIC KEY-----\n";
    $publicKey = openssl_pkey_get_public($pem);
    if ($publicKey === false) return false;
    return openssl_verify($message, $signature, $publicKey, OPENSSL_ALGO_SHA256) === 1;
}

$action = $_GET['action'] ?? '';

try {
    if ($action === 'biometric-enrollment-challenge') {
        requireMethod('POST');
        $user = requireAuthenticatedUser();
        requireCsrfToken();
        $deviceId = biometricDeviceId(requestJson()['deviceId'] ?? null);
        jsonResponse(['challenge' => createBiometricChallenge(db(), (string) $user['id'], $deviceId, 'ENROLL')]);
    }

    if ($action === 'biometric-enroll') {
        requireMethod('POST');
        $user = requireAuthenticatedUser();
        requireCsrfToken();
        $body = requestJson();
        $deviceId = biometricDeviceId($body['deviceId'] ?? null);
        $challengeId = is_string($body['challengeId'] ?? null) ? strtolower(trim($body['challengeId'])) : '';
        $publicKey = is_string($body['publicKey'] ?? null) ? trim($body['publicKey']) : '';
        $signature = is_string($body['signature'] ?? null) ? trim($body['signature']) : '';
        if (!preg_match('/^[a-f0-9]{32}$/', $challengeId) || $publicKey === '' || strlen($publicKey) > 1400 || $signature === '') {
            jsonResponse(['error' => 'Data pendaftaran biometrik tidak valid.'], 400);
        }

        $pdo = db();
        $pdo->beginTransaction();
        $query = $pdo->prepare(
            'SELECT challenge_value FROM auth_biometric_challenges
             WHERE id = :id AND user_id = :user_id AND device_id = :device_id
               AND purpose = \'ENROLL\' AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP(3)
             LIMIT 1 FOR UPDATE'
        );
        $query->execute(['id' => $challengeId, 'user_id' => $user['id'], 'device_id' => $deviceId]);
        $challengeValue = $query->fetchColumn();
        if (!is_string($challengeValue)) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Tantangan pendaftaran kedaluwarsa. Ulangi proses login biometrik.'], 409);
        }
        $updateChallenge = $pdo->prepare('UPDATE auth_biometric_challenges SET consumed_at = UTC_TIMESTAMP(3) WHERE id = :id AND consumed_at IS NULL');
        $updateChallenge->execute(['id' => $challengeId]);
        $message = implode('|', ['LGM-BIOMETRIC', 'ENROLL', $challengeId, $challengeValue, $user['id'], $deviceId]);
        if (!verifyBiometricSignature($publicKey, $message, $signature)) {
            $pdo->commit();
            jsonResponse(['error' => 'Verifikasi kunci biometrik gagal.'], 401);
        }
        $saveCredential = $pdo->prepare(
            'INSERT INTO auth_biometric_credentials (user_id, device_id, public_key_der)
             VALUES (:user_id, :device_id, :public_key)
             ON DUPLICATE KEY UPDATE public_key_der = VALUES(public_key_der), created_at = UTC_TIMESTAMP(3)'
        );
        $saveCredential->execute(['user_id' => $user['id'], 'device_id' => $deviceId, 'public_key' => $publicKey]);
        recordAuthAudit($user, 'BIOMETRIC_ENROLLED', 'Login biometrik perangkat diaktifkan.');
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }

    if ($action === 'biometric-challenge') {
        requireMethod('POST');
        $body = requestJson();
        $username = is_string($body['username'] ?? null) ? trim($body['username']) : '';
        $deviceId = biometricDeviceId($body['deviceId'] ?? null);
        if ($username === '' || strlen($username) > 100) jsonResponse(['error' => 'Biometrik tidak tersedia untuk perangkat ini.'], 401);
        $pdo = db();
        $query = $pdo->prepare(
            'SELECT u.id FROM users u
             JOIN auth_biometric_credentials c ON c.user_id = u.id
             WHERE u.username = :username AND u.status = \'ACTIVE\' AND c.device_id = :device_id
             LIMIT 1'
        );
        $query->execute(['username' => $username, 'device_id' => $deviceId]);
        $userId = $query->fetchColumn();
        if (!is_string($userId)) jsonResponse(['error' => 'Biometrik tidak tersedia untuk perangkat ini.'], 401);
        jsonResponse(['challenge' => createBiometricChallenge($pdo, $userId, $deviceId, 'LOGIN')]);
    }

    if ($action === 'biometric-login') {
        requireMethod('POST');
        $body = requestJson();
        $deviceId = biometricDeviceId($body['deviceId'] ?? null);
        $challengeId = is_string($body['challengeId'] ?? null) ? strtolower(trim($body['challengeId'])) : '';
        $signature = is_string($body['signature'] ?? null) ? trim($body['signature']) : '';
        if (!preg_match('/^[a-f0-9]{32}$/', $challengeId) || $signature === '') {
            jsonResponse(['error' => 'Data login biometrik tidak valid.'], 400);
        }

        $pdo = db();
        $pdo->beginTransaction();
        $query = $pdo->prepare(
            'SELECT ch.challenge_value, u.id, u.name, u.email, u.username, u.role,
                    u.department, u.branch_name, u.branch_id, u.position, u.phone, u.status,
                    c.public_key_der
             FROM auth_biometric_challenges ch
             JOIN auth_biometric_credentials c ON c.user_id = ch.user_id AND c.device_id = ch.device_id
             JOIN users u ON u.id = ch.user_id
             WHERE ch.id = :id AND ch.device_id = :device_id AND ch.purpose = \'LOGIN\'
               AND ch.consumed_at IS NULL AND ch.expires_at > UTC_TIMESTAMP(3)
             LIMIT 1 FOR UPDATE'
        );
        $query->execute(['id' => $challengeId, 'device_id' => $deviceId]);
        $user = $query->fetch();
        if (!$user) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Login biometrik gagal atau tantangan telah kedaluwarsa.'], 401);
        }
        $consume = $pdo->prepare('UPDATE auth_biometric_challenges SET consumed_at = UTC_TIMESTAMP(3) WHERE id = :id AND consumed_at IS NULL');
        $consume->execute(['id' => $challengeId]);
        $message = implode('|', ['LGM-BIOMETRIC', 'LOGIN', $challengeId, $user['challenge_value'], $user['id'], $deviceId]);
        if (!verifyBiometricSignature((string) $user['public_key_der'], $message, $signature)) {
            recordAuthAudit($user, 'LOGIN_FAILED', 'Verifikasi login biometrik gagal.');
            $pdo->commit();
            jsonResponse(['error' => 'Login biometrik gagal.'], 401);
        }
        if ($user['status'] !== 'ACTIVE') {
            $pdo->commit();
            jsonResponse(['error' => 'Akun tidak aktif. Hubungi administrator.'], 401);
        }
        if ($user['role'] === 'PEKERJA') {
            $employment = $pdo->prepare('SELECT employment_status FROM hr_employee_records WHERE user_id = :id LIMIT 1');
            $employment->execute(['id' => $user['id']]);
            if ($employment->fetchColumn() === 'RESIGNED') {
                $pdo->commit();
                jsonResponse(['error' => 'Akun pekerja telah dinonaktifkan karena status kerja berakhir.'], 401);
            }
        }
        $resetAttempts = $pdo->prepare('UPDATE users SET failed_login_attempts = 0, locked_at = NULL WHERE id = :id');
        $resetAttempts->execute(['id' => $user['id']]);
        recordAuthAudit($user, 'LOGIN', 'User berhasil login dengan biometrik.');
        $pdo->commit();
        session_regenerate_id(true);
        unset($user['public_key_der'], $user['challenge_value']);
        $_SESSION['user'] = $user;
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        jsonResponse(['user' => $user, 'csrfToken' => $_SESSION['csrf_token']]);
    }

    if ($action === 'login') {
        requireMethod('POST');
        $body = requestJson();
        $identifier = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($identifier === '') jsonResponse(['error' => 'Username wajib diisi'], 400);
        if ($password === '') jsonResponse(['error' => 'Password wajib diisi'], 400);

        $pdo = db();
        $pdo->beginTransaction();
        $query = db()->prepare(
            'SELECT id, name, email, username, password_hash, role, department, branch_name, branch_id, position, phone, status, failed_login_attempts
             FROM users WHERE username = :username LIMIT 1 FOR UPDATE'
        );
        $query->execute(['username' => $identifier]);
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
        if ($user['role'] === 'PEKERJA') {
            $employment = $pdo->prepare('SELECT employment_status FROM hr_employee_records WHERE user_id = :id LIMIT 1');
            $employment->execute(['id' => $user['id']]);
            if ($employment->fetchColumn() === 'RESIGNED') {
                recordAuthAudit($user, 'LOGIN_REJECTED', 'Login ditolak karena status kerja pekerja telah berakhir.');
                $pdo->commit();
                jsonResponse(['error' => 'Akun pekerja telah dinonaktifkan karena status kerja berakhir.'], 401);
            }
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
