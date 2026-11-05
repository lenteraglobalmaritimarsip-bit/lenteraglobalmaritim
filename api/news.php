<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

function newsAdmin(): array
{
    $user = requireAuthenticatedUser();
    if (($user['role'] ?? '') !== 'ADMIN') jsonResponse(['error' => 'Admin access required'], 403);
    return $user;
}

function newsItemPayload(array $row): array
{
    return [
        'id' => (string) $row['id'],
        'title' => (string) $row['title'],
        'body' => (string) $row['body'],
        'contentType' => (string) $row['content_type'],
        'targetUrl' => $row['target_url'] === null ? null : (string) $row['target_url'],
        'imageMime' => $row['image_mime'] === null ? null : (string) $row['image_mime'],
        'imageDataBase64' => $row['image_data'] === null ? null : base64_encode((string) $row['image_data']),
        'startsAt' => $row['starts_at'] === null ? null : str_replace(' ', 'T', substr((string) $row['starts_at'], 0, 16)),
        'endsAt' => $row['ends_at'] === null ? null : str_replace(' ', 'T', substr((string) $row['ends_at'], 0, 16)),
        'isActive' => (bool) $row['is_active'],
        'createdAt' => (string) $row['created_at'],
        'updatedAt' => (string) $row['updated_at'],
    ];
}

function newsDateValue(mixed $value, string $field): ?string
{
    if ($value === null || $value === '') return null;
    if (!is_string($value)) jsonResponse(['error' => "{$field} tidak valid"], 400);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $value, new DateTimeZone('Asia/Jakarta'));
    $errors = DateTimeImmutable::getLastErrors();
    if ($date === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        || $date->format('Y-m-d\TH:i') !== $value) {
        jsonResponse(['error' => "{$field} tidak valid"], 400);
    }
    return $date->format('Y-m-d H:i:s');
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        requireMethod('GET');
        $manage = ($_GET['manage'] ?? '') === '1';
        if ($manage) {
            newsAdmin();
            $query = db()->query(
                'SELECT id, title, body, content_type, target_url, image_mime, image_data,
                        starts_at, ends_at, is_active, created_at, updated_at
                 FROM news_items ORDER BY created_at DESC, id DESC'
            );
        } else {
            $now = (new DateTimeImmutable('now', new DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $query = db()->prepare(
                'SELECT id, title, body, content_type, target_url, image_mime, image_data,
                        starts_at, ends_at, is_active, created_at, updated_at
                 FROM news_items
                 WHERE is_active = 1
                   AND (starts_at IS NULL OR starts_at <= :starts_now)
                   AND (ends_at IS NULL OR ends_at >= :ends_now)
                 ORDER BY COALESCE(starts_at, created_at) DESC, created_at DESC'
            );
            $query->execute(['starts_now' => $now, 'ends_now' => $now]);
        }
        jsonResponse(['items' => array_map('newsItemPayload', $query->fetchAll())]);
    }

    if ($method === 'POST') {
        requireMethod('POST');
        $user = newsAdmin();
        requireCsrfToken();
        $body = requestJson();

        $id = trim((string) ($body['id'] ?? ''));
        $title = trim((string) ($body['title'] ?? ''));
        $text = trim((string) ($body['body'] ?? ''));
        $contentType = (string) ($body['contentType'] ?? 'TEXT');
        $targetUrl = trim((string) ($body['targetUrl'] ?? ''));
        $imageMime = (string) ($body['imageMime'] ?? '');
        $imageBase64 = (string) ($body['imageDataBase64'] ?? '');
        $isActive = filter_var($body['isActive'] ?? false, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        $startsAt = newsDateValue($body['startsAt'] ?? null, 'Tanggal mulai');
        $endsAt = newsDateValue($body['endsAt'] ?? null, 'Tanggal berakhir');

        if ($title === '' || strlen($title) > 640) jsonResponse(['error' => 'Judul wajib diisi (maksimal 160 karakter)'], 400);
        if (!in_array($contentType, ['TEXT', 'IMAGE', 'LINK'], true)) jsonResponse(['error' => 'Tipe konten tidak valid'], 400);
        if ($isActive === null) jsonResponse(['error' => 'Status aktif tidak valid'], 400);
        if ($startsAt !== null && $endsAt !== null && $endsAt < $startsAt) {
            jsonResponse(['error' => 'Tanggal berakhir harus setelah tanggal mulai'], 400);
        }
        if ($contentType === 'LINK') {
            if ($targetUrl === '' || strlen($targetUrl) > 2048
                || !filter_var($targetUrl, FILTER_VALIDATE_URL)
                || !in_array(strtolower((string) parse_url($targetUrl, PHP_URL_SCHEME)), ['http', 'https'], true)) {
                jsonResponse(['error' => 'Tautan harus berupa URL HTTP atau HTTPS yang valid'], 400);
            }
        } else {
            $targetUrl = '';
        }

        $imageData = null;
        if ($contentType === 'IMAGE') {
            if (!in_array($imageMime, ['image/jpeg', 'image/png', 'image/webp'], true) || $imageBase64 === '') {
                jsonResponse(['error' => 'Pilih gambar JPEG, PNG, atau WebP'], 400);
            }
            $imageData = base64_decode($imageBase64, true);
            if ($imageData === false || strlen($imageData) > 2097152) {
                jsonResponse(['error' => 'Ukuran gambar maksimal 2 MB'], 400);
            }
        } else {
            $imageMime = '';
        }

        if ($id === '') $id = 'NEWS-' . bin2hex(random_bytes(12));
        if (strlen($id) > 100) jsonResponse(['error' => 'ID News tidak valid'], 400);

        $pdo = db();
        $exists = $pdo->prepare('SELECT id FROM news_items WHERE id = :id LIMIT 1');
        $exists->execute(['id' => $id]);
        $isUpdate = $exists->fetchColumn() !== false;
        if ($isUpdate) {
            $save = $pdo->prepare(
                'UPDATE news_items SET title = :title, body = :body, content_type = :content_type,
                    target_url = :target_url, image_mime = :image_mime, image_data = :image_data,
                    starts_at = :starts_at, ends_at = :ends_at, is_active = :is_active,
                    updated_by_user_id = :updated_by_user_id WHERE id = :id'
            );
        } else {
            $save = $pdo->prepare(
                'INSERT INTO news_items (id, title, body, content_type, target_url, image_mime, image_data,
                    starts_at, ends_at, is_active, created_by_user_id, updated_by_user_id)
                 VALUES (:id, :title, :body, :content_type, :target_url, :image_mime, :image_data,
                    :starts_at, :ends_at, :is_active, :created_by_user_id, :updated_by_user_id)'
            );
            $save->bindValue(':created_by_user_id', $user['id'], PDO::PARAM_STR);
        }
        $save->bindValue(':id', $id, PDO::PARAM_STR);
        $save->bindValue(':title', $title, PDO::PARAM_STR);
        $save->bindValue(':body', $text, PDO::PARAM_STR);
        $save->bindValue(':content_type', $contentType, PDO::PARAM_STR);
        $save->bindValue(':target_url', $targetUrl === '' ? null : $targetUrl, $targetUrl === '' ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $save->bindValue(':image_mime', $contentType === 'IMAGE' ? $imageMime : null, $contentType === 'IMAGE' ? PDO::PARAM_STR : PDO::PARAM_NULL);
        $save->bindValue(':image_data', $contentType === 'IMAGE' ? $imageData : null, $contentType === 'IMAGE' ? PDO::PARAM_LOB : PDO::PARAM_NULL);
        $save->bindValue(':starts_at', $startsAt, $startsAt === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $save->bindValue(':ends_at', $endsAt, $endsAt === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $save->bindValue(':is_active', $isActive ? 1 : 0, PDO::PARAM_INT);
        $save->bindValue(':updated_by_user_id', $user['id'], PDO::PARAM_STR);
        $save->execute();

        jsonResponse(['ok' => true, 'id' => $id]);
    }

    requireMethod('GET', 'POST');
} catch (PDOException $error) {
    error_log('MaritimPort news database error: ' . $error->getMessage());
    jsonResponse(['error' => 'Operasi News gagal'], 500);
} catch (Throwable $error) {
    error_log('MaritimPort news error: ' . $error->getMessage());
    jsonResponse(['error' => 'Operasi News gagal'], 500);
}
