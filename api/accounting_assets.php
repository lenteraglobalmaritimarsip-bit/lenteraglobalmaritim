<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function requireAccountingAssetUser(): array
{
    $sessionUser = requireAuthenticatedUser();
    $query = db()->prepare('SELECT id, name, role, status FROM users WHERE id = :id LIMIT 1');
    $query->execute(['id' => $sessionUser['id']]);
    $user = $query->fetch();
    if (!$user || $user['status'] !== 'ACTIVE') jsonResponse(['error' => 'Akun tidak aktif. Hubungi administrator.'], 401);
    if (!in_array($user['role'], ['ACCOUNTING', 'DIRECTOR'], true)) jsonResponse(['error' => 'Akses hanya untuk role Accounting atau Direktur.'], 403);
    return $user;
}

function validAccountingAssetDate(string $value): bool
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $parts)) return false;
    return checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1]);
}

try {
    $user = requireAccountingAssetUser();
    $action = (string) ($_GET['action'] ?? 'list');
    $pdo = db();

    if ($action === 'list') {
        requireMethod('GET');
        $assets = $pdo->query(
            'SELECT a.id, a.asset_code, a.asset_name, a.category, a.acquisition_date, a.acquisition_cost, '
            . 'a.useful_life_months, a.residual_value, a.location, a.branch_id, b.code AS branch_code, '
            . 'b.name AS branch_name, a.status, a.coa_asset_id, a.coa_depreciation_id '
            . 'FROM accounting_assets a INNER JOIN branches b ON b.id = a.branch_id '
            . 'ORDER BY a.acquisition_date DESC, a.asset_code'
        )->fetchAll();
        $branches = $pdo->query('SELECT id, code, name FROM branches WHERE is_active = 1 ORDER BY code')->fetchAll();
        $accounts = $pdo->query(
            'SELECT id, code, account_desc, account_group FROM chart_of_accounts WHERE is_active = 1 ORDER BY code, account_desc'
        )->fetchAll();
        $mappedAssets = array_map(static function (array $asset): array {
            $cost = (float) $asset['acquisition_cost'];
            $residual = (float) $asset['residual_value'];
            $life = (int) $asset['useful_life_months'];
            return [
                'id' => (string) $asset['id'],
                'assetCode' => (string) $asset['asset_code'],
                'assetName' => (string) $asset['asset_name'],
                'category' => $asset['category'],
                'acquisitionDate' => $asset['acquisition_date'],
                'acquisitionCost' => $cost,
                'usefulLifeMonths' => $life,
                'residualValue' => $residual,
                'location' => $asset['location'],
                'branchId' => str_pad((string) $asset['branch_id'], 3, '0', STR_PAD_LEFT),
                'branchName' => (string) $asset['branch_name'],
                'branchCode' => (string) $asset['branch_code'],
                'status' => (string) $asset['status'],
                'coaAssetId' => $asset['coa_asset_id'] === null ? null : (string) $asset['coa_asset_id'],
                'coaDepreciationId' => $asset['coa_depreciation_id'] === null ? null : (string) $asset['coa_depreciation_id'],
                'monthlyDepreciation' => $asset['status'] === 'Aktif' && $life > 0 ? max(0, $cost - $residual) / $life : 0,
            ];
        }, $assets);
        $mappedAccounts = array_map(static fn (array $account): array => [
            'id' => (string) $account['id'],
            'code' => (string) $account['code'],
            'accountDesc' => (string) $account['account_desc'],
            'accountGroup' => (string) $account['account_group'],
        ], $accounts);
        $mappedBranches = array_map(static fn (array $branch): array => [
            'id' => str_pad((string) $branch['id'], 3, '0', STR_PAD_LEFT),
            'code' => (string) $branch['code'],
            'name' => (string) $branch['name'],
        ], $branches);
        jsonResponse(['assets' => $mappedAssets, 'branches' => $mappedBranches, 'accounts' => $mappedAccounts]);
    }

    if (!in_array($action, ['create', 'update'], true)) jsonResponse(['error' => 'Unknown Accounting Assets action'], 404);
    if ($user['role'] !== 'ACCOUNTING') jsonResponse(['error' => 'Direktur hanya memiliki akses baca data aset.'], 403);
    requireMethod('POST');
    requireCsrfToken();
    $assetId = trim((string) ($_GET['assetId'] ?? ''));
    if ($action === 'update' && ($assetId === '' || strlen($assetId) > 100)) {
        jsonResponse(['error' => 'ID aset tidak valid.'], 400);
    }
    $existingAsset = null;
    if ($action === 'update') {
        $existingQuery = $pdo->prepare(
            'SELECT id, branch_id, coa_asset_id, coa_depreciation_id FROM accounting_assets WHERE id = :id LIMIT 1'
        );
        $existingQuery->execute(['id' => $assetId]);
        $existingAsset = $existingQuery->fetch();
        if (!$existingAsset) jsonResponse(['error' => 'Aset tidak ditemukan.'], 404);
    }
    $body = requestJson();
    $assetCode = trim((string) ($body['assetCode'] ?? ''));
    $assetName = trim((string) ($body['assetName'] ?? ''));
    $category = trim((string) ($body['category'] ?? ''));
    $acquisitionDate = trim((string) ($body['acquisitionDate'] ?? ''));
    $location = trim((string) ($body['location'] ?? ''));
    $branchId = trim((string) ($body['branchId'] ?? ''));
    $status = (string) ($body['status'] ?? 'Aktif');
    $assetCoaId = trim((string) ($body['coaAssetId'] ?? ''));
    $depreciationCoaId = trim((string) ($body['coaDepreciationId'] ?? ''));
    $cost = $body['acquisitionCost'] ?? null;
    $life = $body['usefulLifeMonths'] ?? null;
    $residual = $body['residualValue'] ?? null;

    if ($assetCode === '' || strlen($assetCode) > 60 || $assetName === '' || strlen($assetName) > 200
        || strlen($category) > 120 || strlen($location) > 200
        || !ctype_digit($branchId) || !in_array($status, ['Aktif', 'Dijual', 'Dihapuskan'], true)
        || !is_numeric($cost) || !is_finite((float) $cost) || (float) $cost < 0
        || !is_numeric($life) || filter_var($life, FILTER_VALIDATE_INT) === false || (int) $life < 0
        || !is_numeric($residual) || !is_finite((float) $residual) || (float) $residual < 0
        || (float) $residual > (float) $cost
        || ($acquisitionDate !== '' && !validAccountingAssetDate($acquisitionDate))) {
        jsonResponse(['error' => 'Lengkapi kode, nama, branch, tanggal, dan nominal aset dengan nilai yang valid.'], 400);
    }

    $branchQuery = $pdo->prepare('SELECT id, is_active FROM branches WHERE id = :id LIMIT 1');
    $branchQuery->execute(['id' => (int) $branchId]);
    $branch = $branchQuery->fetch();
    if (!$branch || (!(bool) $branch['is_active'] && (int) ($existingAsset['branch_id'] ?? 0) !== (int) $branchId)) {
        jsonResponse(['error' => 'Branch aset tidak aktif atau tidak ditemukan.'], 400);
    }

    foreach (['COA aset' => $assetCoaId, 'COA penyusutan' => $depreciationCoaId] as $label => $coaId) {
        if ($coaId === '') continue;
        $coaQuery = $pdo->prepare('SELECT id, is_active FROM chart_of_accounts WHERE id = :id LIMIT 1');
        $coaQuery->execute(['id' => $coaId]);
        $coa = $coaQuery->fetch();
        $existingCoaId = $label === 'COA aset'
            ? (string) ($existingAsset['coa_asset_id'] ?? '')
            : (string) ($existingAsset['coa_depreciation_id'] ?? '');
        if (!$coa || (!(bool) $coa['is_active'] && ($action !== 'update' || $existingCoaId !== $coaId))) {
            jsonResponse(['error' => $label . ' tidak aktif atau tidak ditemukan.'], 400);
        }
    }

    if ($action === 'create') $assetId = 'ASSET-' . bin2hex(random_bytes(16));
    $pdo->beginTransaction();
    try {
        $values = [
            'id' => $assetId,
            'asset_code' => $assetCode,
            'asset_name' => $assetName,
            'category' => $category !== '' ? $category : null,
            'acquisition_date' => $acquisitionDate !== '' ? $acquisitionDate : null,
            'acquisition_cost' => round((float) $cost, 2),
            'useful_life_months' => (int) $life,
            'residual_value' => round((float) $residual, 2),
            'location' => $location !== '' ? $location : null,
            'branch_id' => (int) $branch['id'],
            'status' => $status,
            'coa_asset_id' => $assetCoaId !== '' ? $assetCoaId : null,
            'coa_depreciation_id' => $depreciationCoaId !== '' ? $depreciationCoaId : null,
        ];
        if ($action === 'create') {
            $save = $pdo->prepare(
                'INSERT INTO accounting_assets (id, asset_code, asset_name, category, acquisition_date, acquisition_cost, '
                . 'useful_life_months, residual_value, location, branch_id, status, coa_asset_id, coa_depreciation_id) '
                . 'VALUES (:id, :asset_code, :asset_name, :category, :acquisition_date, :acquisition_cost, '
                . ':useful_life_months, :residual_value, :location, :branch_id, :status, :coa_asset_id, :coa_depreciation_id)'
            );
        } else {
            $save = $pdo->prepare(
                'UPDATE accounting_assets SET asset_code = :asset_code, asset_name = :asset_name, category = :category, '
                . 'acquisition_date = :acquisition_date, acquisition_cost = :acquisition_cost, '
                . 'useful_life_months = :useful_life_months, residual_value = :residual_value, location = :location, '
                . 'branch_id = :branch_id, status = :status, coa_asset_id = :coa_asset_id, '
                . 'coa_depreciation_id = :coa_depreciation_id WHERE id = :id'
            );
        }
        $save->execute($values);
        $audit = $pdo->prepare(
            'INSERT INTO audit_logs (id, logged_at, actor_id, actor_name, actor_role, action, entity, entity_id, description) '
            . 'VALUES (:id, UTC_TIMESTAMP(3), :actor_id, :actor_name, \'ACCOUNTING\', :action, \'ACCOUNTING_ASSET\', :entity_id, :description)'
        );
        $audit->execute([
            'id' => 'AUD-ASSET-' . bin2hex(random_bytes(12)),
            'actor_id' => $user['id'],
            'actor_name' => $user['name'],
            'action' => $action === 'create' ? 'CREATE' : 'UPDATE',
            'entity_id' => $assetId,
            'description' => $action === 'create'
                ? 'Aset ' . $assetCode . ' ditambahkan ke register Accounting.'
                : 'Data aset ' . $assetCode . ' diperbarui di register Accounting.',
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    jsonResponse(['ok' => true, 'id' => $assetId]);
} catch (PDOException $error) {
    error_log('MaritimPort accounting assets database error: ' . $error->getMessage());
    if ((string) $error->getCode() === '23000') jsonResponse(['error' => 'Kode aset sudah digunakan.'], 409);
    jsonResponse(['error' => 'Accounting assets operation failed'], 500);
} catch (Throwable $error) {
    error_log('MaritimPort accounting assets error: ' . $error->getMessage());
    jsonResponse(['error' => 'Accounting assets operation failed'], 500);
}
