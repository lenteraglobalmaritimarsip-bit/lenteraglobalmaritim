<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

function hrRequireRole(array $user, string ...$roles): void
{
    if (!in_array($user['role'] ?? '', $roles, true)) {
        jsonResponse(['error' => 'Akses tidak diizinkan untuk role ini.'], 403);
    }
}

function hrString(mixed $value, string $label): string
{
    if ($value === null) return '';
    if (!is_string($value) && !is_int($value)) jsonResponse(['error' => $label . ' tidak valid.'], 400);
    return trim((string) $value);
}

function hrDateValue(mixed $value, string $label, bool $nullable = true): ?string
{
    $date = hrString($value, $label);
    if ($date === '' && $nullable) return null;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)
        || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4))) {
        jsonResponse(['error' => $label . ' tidak valid.'], 400);
    }
    return $date;
}

function hrNewId(string $prefix): string
{
    return $prefix . '-' . bin2hex(random_bytes(12));
}

function hrRecordHistory(PDO $pdo, array $actor, string $userId, string $eventType, string $summary, ?array $before, ?array $after): void
{
    $insert = $pdo->prepare(
        'INSERT INTO hr_employee_history
         (id, user_id, event_type, summary, before_data, after_data, actor_id, actor_name)
         VALUES (:id, :user_id, :event_type, :summary, :before_data, :after_data, :actor_id, :actor_name)'
    );
    $insert->execute([
        'id' => hrNewId('HRH'),
        'user_id' => $userId,
        'event_type' => $eventType,
        'summary' => $summary,
        'before_data' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'after_data' => $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'actor_id' => $actor['id'] ?? null,
        'actor_name' => $actor['name'] ?? 'Unknown',
    ]);

    $audit = $pdo->prepare(
        'INSERT INTO audit_logs
         (id, logged_at, actor_id, actor_name, actor_role, action, entity, entity_id, description)
         VALUES (:id, UTC_TIMESTAMP(3), :actor_id, :actor_name, :actor_role, :action, \'HR_EMPLOYEE\', :entity_id, :description)'
    );
    $audit->execute([
        'id' => hrNewId('AUD-HR'),
        'actor_id' => $actor['id'] ?? null,
        'actor_name' => $actor['name'] ?? 'Unknown',
        'actor_role' => $actor['role'] ?? null,
        'action' => $eventType,
        'entity_id' => $userId,
        'description' => $summary,
    ]);
}

function hrEmployeeQuery(): string
{
    return 'SELECT u.id AS userId, u.name, u.email, u.phone,
                   COALESCE(er.position, u.position) AS position,
                   COALESCE(er.department, u.department) AS department,
                   COALESCE(b.code, u.branch_name) AS branchName,
                   COALESCE(er.branch_id, u.branch_id) AS branchId,
                   er.employee_number AS employeeNumber,
                   er.date_of_birth AS dateOfBirth, er.birth_city AS birthCity, er.gender, er.address,
                   er.emergency_contact_name AS emergencyContactName,
                   er.emergency_contact_phone AS emergencyContactPhone,
                   COALESCE(er.employment_status, \'ACTIVE\') AS employmentStatus,
                   er.contract_type AS contractType,
                   er.contract_start AS contractStart, er.contract_end AS contractEnd,
                   er.contract_duration_years AS contractDurationYears,
                   er.nik, er.npwp, er.payroll_account_number AS payrollAccountNumber,
                   er.payroll_bank_name AS payrollBankName,
                   TO_BASE64(er.photo_content) AS photoDataBase64,
                   er.photo_mime_type AS photoMimeType,
                   (er.user_id IS NOT NULL) AS hasRecord
            FROM users u
            LEFT JOIN hr_employee_records er ON er.user_id = u.id
            LEFT JOIN branches b ON b.id = COALESCE(er.branch_id, u.branch_id)
            WHERE u.role = \'PEKERJA\'';
}

function hrLoadWorkspace(PDO $pdo, array $user): array
{
    $isHr = ($user['role'] ?? '') === 'HR_ADMINISTRASI';
    if ($isHr) {
        $employees = $pdo->query(hrEmployeeQuery() . ' ORDER BY u.name, u.id')->fetchAll();
        $documents = $pdo->query(
            'SELECT d.id, d.user_id AS userId, u.name AS employeeName, d.title, d.category,
                    d.file_name AS fileName, d.mime_type AS mimeType, d.file_size AS fileSize,
                    d.uploaded_by_name AS uploadedByName, d.created_at AS uploadedAt
             FROM hr_employee_documents d JOIN users u ON u.id = d.user_id
             ORDER BY d.created_at DESC'
        )->fetchAll();
        $attendance = $pdo->query(
            'SELECT a.id, a.user_id AS userId, u.name AS employeeName, a.attendance_date AS date,
                    a.status, a.check_in AS checkIn, a.check_out AS checkOut, a.note,
                    COALESCE(a.check_in_at, a.check_in) AS checkInAt, a.check_in_latitude AS checkInLatitude,
                    a.check_in_longitude AS checkInLongitude, a.check_in_accuracy_meters AS checkInAccuracyMeters,
                    a.overtime_check_in_at AS overtimeCheckInAt, a.overtime_check_in_latitude AS overtimeCheckInLatitude,
                    a.overtime_check_in_longitude AS overtimeCheckInLongitude, a.overtime_check_in_accuracy_meters AS overtimeCheckInAccuracyMeters,
                    COALESCE(a.check_out_at, a.check_out) AS checkOutAt, a.check_out_latitude AS checkOutLatitude,
                    a.check_out_longitude AS checkOutLongitude, a.check_out_accuracy_meters AS checkOutAccuracyMeters,
                    a.overtime_check_out_at AS overtimeCheckOutAt, a.overtime_check_out_latitude AS overtimeCheckOutLatitude,
                    a.overtime_check_out_longitude AS overtimeCheckOutLongitude, a.overtime_check_out_accuracy_meters AS overtimeCheckOutAccuracyMeters,
                    a.updated_by_name AS updatedByName, a.updated_at AS updatedAt
             FROM hr_attendance a JOIN users u ON u.id = a.user_id
             ORDER BY a.attendance_date DESC, u.name'
        )->fetchAll();
        $leaveRequests = $pdo->query(
            'SELECT l.id, l.user_id AS userId, u.name AS employeeName, l.leave_type AS type,
                    l.starts_on AS startDate, l.ends_on AS endDate, l.reason, l.status,
                    l.review_note AS reviewNote, l.created_at AS createdAt,
                    l.reviewed_by_name AS reviewedByName, l.reviewed_at AS reviewedAt
             FROM hr_leave_requests l JOIN users u ON u.id = l.user_id
             ORDER BY FIELD(l.status, \'PENDING\', \'APPROVED\', \'REJECTED\'), l.created_at DESC'
        )->fetchAll();
        $profileRequests = $pdo->query(
            'SELECT r.id, r.user_id AS userId, u.name AS employeeName, r.proposed_data AS proposedData,
                    r.status, r.review_note AS reviewNote, r.created_at AS createdAt,
                    r.reviewed_by_name AS reviewedByName, r.reviewed_at AS reviewedAt
             FROM hr_profile_change_requests r JOIN users u ON u.id = r.user_id
             ORDER BY FIELD(r.status, \'PENDING\', \'APPROVED\', \'REJECTED\'), r.created_at DESC'
        )->fetchAll();
        foreach ($profileRequests as &$request) $request['proposedData'] = json_decode((string) $request['proposedData'], true) ?: [];
        unset($request);
        $history = $pdo->query(
            'SELECT h.id, h.user_id AS userId, u.name AS employeeName, h.event_type AS eventType,
                    h.summary, h.before_data AS beforeData, h.after_data AS afterData,
                    h.actor_name AS actorName, h.created_at AS createdAt,
                    DATE_FORMAT(DATE_ADD(h.created_at, INTERVAL 7 HOUR), "%Y-%m-%dT%H:%i:%s+07:00") AS createdAtWib
             FROM hr_employee_history h LEFT JOIN users u ON u.id = h.user_id
             WHERE h.event_type NOT IN ("ATTENDANCE_UPDATED", "ABSEN_DATANG", "ABSEN_PULANG", "ABSEN_LEMBUR_DATANG", "ABSEN_LEMBUR_PULANG", "CHECK_IN", "CHECK_OUT", "OVERTIME_CHECK_IN", "OVERTIME_CHECK_OUT")
             ORDER BY h.created_at DESC LIMIT 300'
        )->fetchAll();
        foreach ($history as &$entry) {
            $entry['beforeData'] = $entry['beforeData'] === null ? null : json_decode((string) $entry['beforeData'], true);
            $entry['afterData'] = $entry['afterData'] === null ? null : json_decode((string) $entry['afterData'], true);
        }
        unset($entry);
        $branches = $pdo->query('SELECT id, code, name FROM branches WHERE is_active = 1 ORDER BY id')->fetchAll();
        return compact('employees', 'documents', 'attendance', 'leaveRequests', 'profileRequests', 'history', 'branches');
    }

    $profileQuery = $pdo->prepare(hrEmployeeQuery() . ' AND u.id = :user_id LIMIT 1');
    $profileQuery->execute(['user_id' => $user['id']]);
    $profile = $profileQuery->fetch() ?: null;
    $documentsQuery = $pdo->prepare(
        'SELECT id, title, category, file_name AS fileName, mime_type AS mimeType,
                file_size AS fileSize, uploaded_by_name AS uploadedByName, created_at AS uploadedAt
         FROM hr_employee_documents WHERE user_id = :user_id ORDER BY created_at DESC'
    );
    $documentsQuery->execute(['user_id' => $user['id']]);
    $attendanceQuery = $pdo->prepare(
        'SELECT id, attendance_date AS date, status, check_in AS checkIn, check_out AS checkOut,
                note, COALESCE(check_in_at, check_in) AS checkInAt, check_in_latitude AS checkInLatitude,
                check_in_longitude AS checkInLongitude, check_in_accuracy_meters AS checkInAccuracyMeters,
                overtime_check_in_at AS overtimeCheckInAt, overtime_check_in_latitude AS overtimeCheckInLatitude,
                overtime_check_in_longitude AS overtimeCheckInLongitude, overtime_check_in_accuracy_meters AS overtimeCheckInAccuracyMeters,
                COALESCE(check_out_at, check_out) AS checkOutAt, check_out_latitude AS checkOutLatitude,
                check_out_longitude AS checkOutLongitude, check_out_accuracy_meters AS checkOutAccuracyMeters,
                overtime_check_out_at AS overtimeCheckOutAt, overtime_check_out_latitude AS overtimeCheckOutLatitude,
                overtime_check_out_longitude AS overtimeCheckOutLongitude, overtime_check_out_accuracy_meters AS overtimeCheckOutAccuracyMeters,
                updated_at AS updatedAt
         FROM hr_attendance WHERE user_id = :user_id ORDER BY attendance_date DESC'
    );
    $attendanceQuery->execute(['user_id' => $user['id']]);
    $leaveQuery = $pdo->prepare(
        'SELECT id, leave_type AS type, starts_on AS startDate, ends_on AS endDate, reason, status,
                review_note AS reviewNote, created_at AS createdAt, reviewed_by_name AS reviewedByName,
                reviewed_at AS reviewedAt
         FROM hr_leave_requests WHERE user_id = :user_id
         ORDER BY FIELD(status, \'PENDING\', \'APPROVED\', \'REJECTED\'), created_at DESC'
    );
    $leaveQuery->execute(['user_id' => $user['id']]);
    $profileQuery = $pdo->prepare(
        'SELECT id, proposed_data AS proposedData, status, review_note AS reviewNote,
                created_at AS createdAt, reviewed_by_name AS reviewedByName, reviewed_at AS reviewedAt
         FROM hr_profile_change_requests WHERE user_id = :user_id
         ORDER BY FIELD(status, \'PENDING\', \'APPROVED\', \'REJECTED\'), created_at DESC'
    );
    $profileQuery->execute(['user_id' => $user['id']]);
    $profileRequests = $profileQuery->fetchAll();
    foreach ($profileRequests as &$request) $request['proposedData'] = json_decode((string) $request['proposedData'], true) ?: [];
    unset($request);
    return [
        'profile' => $profile,
        'documents' => $documentsQuery->fetchAll(),
        'attendance' => $attendanceQuery->fetchAll(),
        'leaveRequests' => $leaveQuery->fetchAll(),
        'profileRequests' => $profileRequests,
    ];
}

function hrWorkerExists(PDO $pdo, string $userId): bool
{
    $query = $pdo->prepare('SELECT 1 FROM users WHERE id = :id AND role = \'PEKERJA\' LIMIT 1');
    $query->execute(['id' => $userId]);
    return (bool) $query->fetchColumn();
}

function hrAuditEmployeeSnapshot(PDO $pdo, string $userId): ?array
{
    $query = $pdo->prepare(hrEmployeeQuery() . ' AND u.id = :user_id LIMIT 1');
    $query->execute(['user_id' => $userId]);
    $employee = $query->fetch();
    return $employee ?: null;
}

$action = (string) ($_GET['action'] ?? '');

try {
    $user = requireAuthenticatedUser();
    $pdo = db();

    if ($action === 'workspace') {
        requireMethod('GET');
        hrRequireRole($user, 'HR_ADMINISTRASI', 'PEKERJA');
        jsonResponse(hrLoadWorkspace($pdo, $user));
    }

    if ($action === 'attendance-report') {
        requireMethod('GET');
        hrRequireRole($user, 'HR_ADMINISTRASI');
        $yearRaw = hrString($_GET['year'] ?? null, 'Tahun');
        $monthRaw = hrString($_GET['month'] ?? null, 'Bulan');
        $category = hrString($_GET['category'] ?? null, 'Kategori');
        if (!preg_match('/^\d{4}$/', $yearRaw) || (int) $yearRaw < 2000 || (int) $yearRaw > (int) date('Y') + 1
            || !preg_match('/^(0?[1-9]|1[0-2])$/', $monthRaw)
            || !in_array($category, ['ALL', 'BRANCH', 'EMPLOYEE'], true)) {
            jsonResponse(['error' => 'Filter tahun, bulan, atau kategori tidak valid.'], 400);
        }
        $startDate = sprintf('%04d-%02d-01', (int) $yearRaw, (int) $monthRaw);
        $endDate = (new DateTimeImmutable($startDate))->modify('+1 month')->format('Y-m-d');
        $reportDate = hrString($_GET['date'] ?? null, 'Tanggal laporan');
        if ($reportDate !== '') {
            $parsedDate = hrDateValue($reportDate, 'Tanggal laporan', false);
            if ($parsedDate === null || $parsedDate > date('Y-m-d')) {
                jsonResponse(['error' => 'Tanggal laporan tidak boleh melewati hari ini.'], 400);
            }
            $startDate = $parsedDate;
            $endDate = (new DateTimeImmutable($parsedDate))->modify('+1 day')->format('Y-m-d');
        }
        $where = ['a.attendance_date >= :start_date', 'a.attendance_date < :end_date'];
        $params = ['start_date' => $startDate, 'end_date' => $endDate];
        if ($category === 'BRANCH') {
            $branchIdRaw = hrString($_GET['branchId'] ?? null, 'Branch');
            if ($branchIdRaw === '' || !ctype_digit($branchIdRaw)) jsonResponse(['error' => 'Pilih branch terlebih dahulu.'], 400);
            $branchQuery = $pdo->prepare('SELECT 1 FROM branches WHERE id = :id AND is_active = 1 LIMIT 1');
            $branchQuery->execute(['id' => (int) $branchIdRaw]);
            if (!$branchQuery->fetchColumn()) jsonResponse(['error' => 'Branch tidak ditemukan atau tidak aktif.'], 400);
            $where[] = 'COALESCE(er.branch_id, u.branch_id) = :branch_id';
            $params['branch_id'] = (int) $branchIdRaw;
        } elseif ($category === 'EMPLOYEE') {
            $name = hrString($_GET['name'] ?? null, 'Nama pekerja');
            if ($name === '' || strlen($name) > 600) jsonResponse(['error' => 'Masukkan nama pekerja (maksimum 150 karakter).'], 400);
            $where[] = 'u.name LIKE :employee_name';
            $params['employee_name'] = '%' . addcslashes($name, '\\%_') . '%';
        }
        $userWhere = ['u.role = \'PEKERJA\''];
        $userParams = [];
        if ($category === 'BRANCH') {
            $userWhere[] = 'COALESCE(er.branch_id, u.branch_id) = :branch_id';
            $userParams['branch_id'] = (int) $branchIdRaw;
        } elseif ($category === 'EMPLOYEE') {
            $userWhere[] = 'u.name LIKE :employee_name';
            $userParams['employee_name'] = '%' . addcslashes($name, '\\%_') . '%';
        }
        $userQuery = $pdo->prepare(
            'SELECT u.id AS userId, u.name AS employeeName, COALESCE(b.code, u.branch_name) AS branchName
             FROM users u
             LEFT JOIN hr_employee_records er ON er.user_id = u.id
             LEFT JOIN branches b ON b.id = COALESCE(er.branch_id, u.branch_id)
             WHERE ' . implode(' AND ', $userWhere) . '
             ORDER BY u.name ASC'
        );
        $userQuery->execute($userParams);
        $employees = $userQuery->fetchAll();

        $attendanceQuery = $pdo->prepare(
            'SELECT a.attendance_date AS date, u.name AS employeeName, u.id AS userId,
                    COALESCE(b.code, u.branch_name) AS branchName,
                    COALESCE(a.check_in_at, a.check_in) AS checkInAt, a.check_in_latitude AS checkInLatitude,
                    a.check_in_longitude AS checkInLongitude, a.check_in_accuracy_meters AS checkInAccuracyMeters,
                    a.overtime_check_in_at AS overtimeCheckInAt, a.overtime_check_in_latitude AS overtimeCheckInLatitude,
                    a.overtime_check_in_longitude AS overtimeCheckInLongitude, a.overtime_check_in_accuracy_meters AS overtimeCheckInAccuracyMeters,
                    COALESCE(a.check_out_at, a.check_out) AS checkOutAt, a.check_out_latitude AS checkOutLatitude,
                    a.check_out_longitude AS checkOutLongitude, a.check_out_accuracy_meters AS checkOutAccuracyMeters,
                    a.overtime_check_out_at AS overtimeCheckOutAt, a.overtime_check_out_latitude AS overtimeCheckOutLatitude,
                    a.overtime_check_out_longitude AS overtimeCheckOutLongitude, a.overtime_check_out_accuracy_meters AS overtimeCheckOutAccuracyMeters
             FROM hr_attendance a
             JOIN users u ON u.id = a.user_id AND u.role = \'PEKERJA\'
             LEFT JOIN hr_employee_records er ON er.user_id = u.id
             LEFT JOIN branches b ON b.id = COALESCE(er.branch_id, u.branch_id)
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY a.attendance_date DESC, u.name ASC'
        );
        $attendanceQuery->execute($params);
        $attendanceByKey = [];
        foreach ($attendanceQuery->fetchAll() as $attendance) {
            $attendanceByKey[(string) $attendance['userId'] . ':' . substr((string) $attendance['date'], 0, 10)] = $attendance;
        }

        $rows = [];
        $cursor = new DateTimeImmutable($startDate);
        $last = (new DateTimeImmutable($endDate))->modify('-1 day');
        $today = new DateTimeImmutable('today', new DateTimeZone('Asia/Jakarta'));
        if ($last > $today) {
            $last = $today;
        }
        while ($cursor <= $last) {
            $date = $cursor->format('Y-m-d');
            foreach ($employees as $employee) {
                $key = (string) $employee['userId'] . ':' . $date;
                if (isset($attendanceByKey[$key])) {
                    $rows[] = $attendanceByKey[$key];
                } else {
                    $rows[] = array_merge($employee, [
                        'date' => $date,
                        'checkInAt' => null, 'checkInLatitude' => null, 'checkInLongitude' => null, 'checkInAccuracyMeters' => null,
                        'overtimeCheckInAt' => null, 'overtimeCheckInLatitude' => null, 'overtimeCheckInLongitude' => null, 'overtimeCheckInAccuracyMeters' => null,
                        'checkOutAt' => null, 'checkOutLatitude' => null, 'checkOutLongitude' => null, 'checkOutAccuracyMeters' => null,
                        'overtimeCheckOutAt' => null, 'overtimeCheckOutLatitude' => null, 'overtimeCheckOutLongitude' => null, 'overtimeCheckOutAccuracyMeters' => null,
                    ]);
                }
            }
            $cursor = $cursor->modify('+1 day');
        }
        jsonResponse(['rows' => $rows]);
    }

    if ($action === 'document') {
        requireMethod('GET');
        hrRequireRole($user, 'HR_ADMINISTRASI', 'PEKERJA');
        $documentId = hrString($_GET['id'] ?? null, 'ID dokumen');
        if ($documentId === '') jsonResponse(['error' => 'Dokumen tidak ditemukan.'], 404);
        $query = $pdo->prepare(
            'SELECT id, user_id AS userId, file_name AS fileName, mime_type AS mimeType, content
             FROM hr_employee_documents WHERE id = :id LIMIT 1'
        );
        $query->execute(['id' => $documentId]);
        $document = $query->fetch();
        if (!$document || (($user['role'] ?? '') === 'PEKERJA' && $document['userId'] !== $user['id'])) {
            jsonResponse(['error' => 'Dokumen tidak ditemukan atau Anda tidak memiliki akses.'], 404);
        }
        jsonResponse([
            'fileName' => $document['fileName'],
            'mimeType' => $document['mimeType'],
            'contentBase64' => base64_encode((string) $document['content']),
        ]);
    }

    if ($action === 'save-employee') {
        requireMethod('POST');
        hrRequireRole($user, 'HR_ADMINISTRASI');
        requireCsrfToken();
        $body = requestJson();
        $workerId = hrString($body['userId'] ?? null, 'Akun pekerja');
        if ($workerId === '' || !hrWorkerExists($pdo, $workerId)) jsonResponse(['error' => 'Akun pekerja tidak valid.'], 400);

        $employeeNumber = hrString($body['employeeNumber'] ?? null, 'Nomor pekerja');
        $name = hrString($body['name'] ?? null, 'Nama');
        $email = hrString($body['email'] ?? null, 'Email');
        $phone = hrString($body['phone'] ?? null, 'Telepon');
        $position = hrString($body['position'] ?? null, 'Jabatan');
        $department = hrString($body['department'] ?? null, 'Departemen');
        $branchIdRaw = hrString($body['branchId'] ?? null, 'Branch');
        $branchId = ctype_digit($branchIdRaw) ? (int) $branchIdRaw : 0;
        $dateOfBirth = hrDateValue($body['dateOfBirth'] ?? null, 'Tanggal lahir');
        $birthCity = hrString($body['birthCity'] ?? null, 'Kota kelahiran');
        $contractStart = hrDateValue($body['contractStart'] ?? null, 'Tanggal mulai kontrak');
        $contractEnd = hrDateValue($body['contractEnd'] ?? null, 'Tanggal akhir kontrak');
        $gender = hrString($body['gender'] ?? null, 'Jenis kelamin');
        $employmentStatus = hrString($body['employmentStatus'] ?? null, 'Status kerja');
        $contractType = hrString($body['contractType'] ?? null, 'Jenis kontrak');
        $address = hrString($body['address'] ?? null, 'Alamat');
        $emergencyName = hrString($body['emergencyContactName'] ?? null, 'Nama kontak darurat');
        $emergencyPhone = hrString($body['emergencyContactPhone'] ?? null, 'Telepon kontak darurat');
        $contractDuration = hrString($body['contractDurationYears'] ?? null, 'Lama kontrak');
        $contractDurationYears = $contractDuration !== '' ? (float) str_replace(',', '.', $contractDuration) : null;
        $nik = hrString($body['nik'] ?? null, 'NIK');
        $npwp = hrString($body['npwp'] ?? null, 'NPWP');
        $payrollAccountNumber = hrString($body['payrollAccountNumber'] ?? null, 'Nomor rekening payroll');
        $payrollBankName = hrString($body['payrollBankName'] ?? null, 'Bank payroll');
        $photoDataBase64 = isset($body['photoDataBase64']) ? (string) $body['photoDataBase64'] : '';
        $photoMimeType = hrString($body['photoMimeType'] ?? null, 'Format foto');
        if ($photoDataBase64 !== '' && !in_array($photoMimeType, ['image/jpeg', 'image/png'], true)) {
            jsonResponse(['error' => 'Format foto pekerja harus JPG atau PNG.'], 400);
        }
        $photoContent = $photoDataBase64 !== '' ? base64_decode(str_replace(["\r", "\n", ' '], '', $photoDataBase64), true) : null;
        if ($photoDataBase64 !== '' && ($photoContent === false || strlen($photoContent) > 2 * 1024 * 1024)) {
            jsonResponse(['error' => 'Foto pekerja tidak valid atau melebihi 2 MB.'], 400);
        }
        if ($photoContent !== null && (@getimagesizefromstring($photoContent) === false)) {
            jsonResponse(['error' => 'Isi berkas foto pekerja tidak valid.'], 400);
        }

        if ($employeeNumber === '' || strlen($employeeNumber) > 50 || $name === '' || strlen($name) > 150
            || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255
            || strlen($phone) > 50 || $position === '' || strlen($position) > 120
            || $department === '' || strlen($department) > 120
            || !in_array($gender, ['', 'MALE', 'FEMALE', 'OTHER'], true)
            || !in_array($employmentStatus, ['ACTIVE', 'ON_LEAVE', 'RESIGNED'], true)
            || !in_array($contractType, ['', 'PERMANENT', 'CONTRACT', 'PROBATION', 'INTERNSHIP', 'OTHER'], true)
            || strlen($address) > 10000 || strlen($emergencyName) > 150 || strlen($emergencyPhone) > 50
            || strlen($birthCity) > 120 || ($contractDurationYears !== null && ($contractDurationYears < 0 || $contractDurationYears > 99.9))
            || strlen($nik) > 20 || strlen($npwp) > 30 || strlen($payrollAccountNumber) > 50 || strlen($payrollBankName) > 100) {
            jsonResponse(['error' => 'Periksa kembali data pekerja. Nomor pekerja, nama, email, jabatan, departemen, status, dan branch wajib valid.'], 400);
        }
        if ($contractStart !== null && $contractEnd !== null && $contractEnd < $contractStart) {
            jsonResponse(['error' => 'Tanggal akhir kontrak tidak boleh sebelum tanggal mulai.'], 400);
        }
        $branchQuery = $pdo->prepare('SELECT code FROM branches WHERE id = :id AND is_active = 1 LIMIT 1');
        $branchQuery->execute(['id' => $branchId]);
        $branchCode = $branchQuery->fetchColumn();
        if (!is_string($branchCode)) jsonResponse(['error' => 'Pilih branch aktif yang valid.'], 400);

        $pdo->beginTransaction();
        $duplicate = $pdo->prepare('SELECT user_id FROM hr_employee_records WHERE employee_number = :number AND user_id <> :user_id LIMIT 1');
        $duplicate->execute(['number' => $employeeNumber, 'user_id' => $workerId]);
        if ($duplicate->fetchColumn()) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Nomor pekerja sudah digunakan.'], 409);
        }
        $before = hrAuditEmployeeSnapshot($pdo, $workerId);
        $after = [
            'employeeNumber' => $employeeNumber,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'position' => $position,
            'department' => $department,
            'branchId' => (string) $branchId,
            'dateOfBirth' => $dateOfBirth,
            'birthCity' => $birthCity !== '' ? $birthCity : null,
            'gender' => $gender !== '' ? $gender : null,
            'address' => $address,
            'emergencyContactName' => $emergencyName,
            'emergencyContactPhone' => $emergencyPhone,
            'employmentStatus' => $employmentStatus,
            'contractType' => $contractType !== '' ? $contractType : null,
            'contractStart' => $contractStart,
            'contractEnd' => $contractEnd,
            'contractDurationYears' => $contractDurationYears,
            'nik' => $nik !== '' ? $nik : null,
            'npwp' => $npwp !== '' ? $npwp : null,
            'payrollAccountNumber' => $payrollAccountNumber !== '' ? $payrollAccountNumber : null,
            'payrollBankName' => $payrollBankName !== '' ? $payrollBankName : null,
        ];
        $recordValues = [
            'employee_number' => $employeeNumber, 'date_of_birth' => $dateOfBirth,
            'birth_city' => $birthCity !== '' ? $birthCity : null,
            'gender' => $gender !== '' ? $gender : null, 'address' => $address !== '' ? $address : null,
            'emergency_contact_name' => $emergencyName !== '' ? $emergencyName : null,
            'emergency_contact_phone' => $emergencyPhone !== '' ? $emergencyPhone : null,
            'employment_status' => $employmentStatus, 'contract_type' => $contractType !== '' ? $contractType : null,
            'contract_start' => $contractStart, 'contract_end' => $contractEnd,
            'contract_duration_years' => $contractDurationYears, 'nik' => $nik !== '' ? $nik : null,
            'npwp' => $npwp !== '' ? $npwp : null,
            'payroll_account_number' => $payrollAccountNumber !== '' ? $payrollAccountNumber : null,
            'payroll_bank_name' => $payrollBankName !== '' ? $payrollBankName : null,
            'position' => $position, 'department' => $department, 'branch_id' => $branchId,
        ];
        if ($photoContent !== null) {
            $recordValues['photo_content'] = $photoContent;
            $recordValues['photo_mime_type'] = $photoMimeType;
        }
        if (!empty($before['hasRecord'])) {
            $sets = [];
            foreach (array_keys($recordValues) as $field) $sets[] = '`' . $field . '` = :' . $field;
            $updateRecord = $pdo->prepare('UPDATE hr_employee_records SET ' . implode(', ', $sets) . ' WHERE user_id = :user_id');
            $updateRecord->execute([...$recordValues, 'user_id' => $workerId]);
        } else {
            $insertRecord = $pdo->prepare(
                'INSERT INTO hr_employee_records
                 (user_id, employee_number, date_of_birth, gender, address, emergency_contact_name,
                  emergency_contact_phone, employment_status, contract_type, contract_start, contract_end,
                   birth_city, contract_duration_years, nik, npwp, payroll_account_number, payroll_bank_name,
                   position, department, branch_id, photo_content, photo_mime_type)
                 VALUES
                 (:user_id, :employee_number, :date_of_birth, :gender, :address, :emergency_contact_name,
                  :emergency_contact_phone, :employment_status, :contract_type, :contract_start, :contract_end,
                  :birth_city, :contract_duration_years, :nik, :npwp, :payroll_account_number, :payroll_bank_name,
                  :position, :department, :branch_id, :photo_content, :photo_mime_type)'
            );
            $insertRecord->execute([
                'user_id' => $workerId,
                ...$recordValues,
                'photo_content' => $photoContent,
                'photo_mime_type' => $photoContent === null ? null : $photoMimeType,
            ]);
        }
        $updateUser = $pdo->prepare(
            'UPDATE users SET name = :name, email = :email, phone = :phone, position = :position,
             department = :department, branch_name = :branch_name, branch_id = :branch_id WHERE id = :id AND role = \'PEKERJA\''
        );
        $updateUser->execute([
            'name' => $name, 'email' => $email, 'phone' => $phone !== '' ? $phone : null,
            'position' => $position, 'department' => $department, 'branch_name' => $branchCode,
            'branch_id' => $branchId, 'id' => $workerId,
        ]);
        hrRecordHistory($pdo, $user, $workerId, $before === null ? 'EMPLOYEE_CREATED' : 'EMPLOYEE_UPDATED',
            $before === null ? 'Data administrasi pekerja dibuat.' : 'Data administrasi pekerja diperbarui.', $before, $after);
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }

    if ($action === 'upload-document') {
        requireMethod('POST');
        hrRequireRole($user, 'HR_ADMINISTRASI');
        requireCsrfToken();
        $workerId = hrString($_POST['userId'] ?? null, 'Akun pekerja');
        $title = hrString($_POST['title'] ?? null, 'Judul dokumen');
        $category = hrString($_POST['category'] ?? null, 'Kategori dokumen');
        $file = $_FILES['document'] ?? null;
        if ($workerId === '' || !hrWorkerExists($pdo, $workerId)) jsonResponse(['error' => 'Akun pekerja tidak valid.'], 400);
        if ($title === '' || strlen($title) > 180 || $category === '' || strlen($category) > 60) {
            jsonResponse(['error' => 'Judul dan kategori dokumen wajib diisi.'], 400);
        }
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Pilih dokumen yang berhasil diunggah.'], 400);
        }
        if ((int) $file['size'] < 1 || (int) $file['size'] > 2 * 1024 * 1024) {
            jsonResponse(['error' => 'Ukuran maksimum dokumen adalah 2 MB.'], 400);
        }
        $content = file_get_contents((string) $file['tmp_name']);
        if ($content === false) jsonResponse(['error' => 'Dokumen gagal dibaca oleh server.'], 400);
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->buffer($content);
        if (!in_array($mimeType, ['application/pdf', 'image/jpeg', 'image/png'], true)) {
            jsonResponse(['error' => 'Format dokumen yang diizinkan hanya PDF, JPG, atau PNG.'], 400);
        }
        $originalName = str_replace('\\', '/', (string) ($file['name'] ?? 'dokumen'));
        $fileName = basename($originalName);
        $fileName = preg_replace('/[^A-Za-z0-9._ -]/', '_', $fileName) ?: 'dokumen';
        $fileName = substr($fileName, 0, 180);
        $id = hrNewId('HRDOC');
        $pdo->beginTransaction();
        $insert = $pdo->prepare(
            'INSERT INTO hr_employee_documents
             (id, user_id, title, category, file_name, mime_type, file_size, content, uploaded_by_id, uploaded_by_name)
             VALUES (:id, :user_id, :title, :category, :file_name, :mime_type, :file_size, :content, :uploaded_by_id, :uploaded_by_name)'
        );
        $insert->bindValue(':id', $id);
        $insert->bindValue(':user_id', $workerId);
        $insert->bindValue(':title', $title);
        $insert->bindValue(':category', $category);
        $insert->bindValue(':file_name', $fileName);
        $insert->bindValue(':mime_type', $mimeType);
        $insert->bindValue(':file_size', (int) $file['size'], PDO::PARAM_INT);
        $insert->bindValue(':content', $content, PDO::PARAM_LOB);
        $insert->bindValue(':uploaded_by_id', $user['id']);
        $insert->bindValue(':uploaded_by_name', $user['name']);
        $insert->execute();
        hrRecordHistory($pdo, $user, $workerId, 'DOCUMENT_UPLOADED', 'Dokumen pekerja ditambahkan: ' . $title . '.', null, [
            'documentId' => $id, 'title' => $title, 'category' => $category, 'fileName' => $fileName,
        ]);
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }

    if ($action === 'save-attendance') {
        requireMethod('POST');
        hrRequireRole($user, 'HR_ADMINISTRASI');
        requireCsrfToken();
        $body = requestJson();
        $workerId = hrString($body['userId'] ?? null, 'Akun pekerja');
        $date = hrDateValue($body['date'] ?? null, 'Tanggal kehadiran', false);
        $status = hrString($body['status'] ?? null, 'Status kehadiran');
        $checkIn = hrString($body['checkIn'] ?? null, 'Jam check-in');
        $checkOut = hrString($body['checkOut'] ?? null, 'Jam check-out');
        $note = hrString($body['note'] ?? null, 'Catatan kehadiran');
        if ($workerId === '' || !hrWorkerExists($pdo, $workerId)
            || !in_array($status, ['PRESENT', 'ABSENT', 'REMOTE', 'LEAVE'], true)
            || ($checkIn !== '' && !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $checkIn))
            || ($checkOut !== '' && !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $checkOut))
            || ($checkIn !== '' && $checkOut !== '' && $checkOut < $checkIn)
            || strlen($note) > 1000) {
            jsonResponse(['error' => 'Data kehadiran tidak valid.'], 400);
        }
        $pdo->beginTransaction();
        $beforeQuery = $pdo->prepare(
            'SELECT status, check_in AS checkIn, check_out AS checkOut, note
             FROM hr_attendance WHERE user_id = :user_id AND attendance_date = :date LIMIT 1'
        );
        $beforeQuery->execute(['user_id' => $workerId, 'date' => $date]);
        $before = $beforeQuery->fetch() ?: null;
        $idQuery = $pdo->prepare('SELECT id FROM hr_attendance WHERE user_id = :user_id AND attendance_date = :date LIMIT 1');
        $idQuery->execute(['user_id' => $workerId, 'date' => $date]);
        $id = $idQuery->fetchColumn() ?: hrNewId('HRA');
        $after = ['status' => $status, 'checkIn' => $checkIn !== '' ? $checkIn : null, 'checkOut' => $checkOut !== '' ? $checkOut : null, 'note' => $note];
        $upsert = $pdo->prepare(
            'INSERT INTO hr_attendance
             (id, user_id, attendance_date, status, check_in, check_out, note, updated_by_id, updated_by_name)
             VALUES (:id, :user_id, :date, :status, :check_in, :check_out, :note, :actor_id, :actor_name)
             ON DUPLICATE KEY UPDATE status = VALUES(status), check_in = VALUES(check_in),
              check_out = VALUES(check_out), note = VALUES(note), updated_by_id = VALUES(updated_by_id),
              updated_by_name = VALUES(updated_by_name)'
        );
        $upsert->execute([
            'id' => $id, 'user_id' => $workerId, 'date' => $date, 'status' => $status,
            'check_in' => $after['checkIn'], 'check_out' => $after['checkOut'], 'note' => $note !== '' ? $note : null,
            'actor_id' => $user['id'], 'actor_name' => $user['name'],
        ]);
        hrRecordHistory($pdo, $user, $workerId, 'ATTENDANCE_UPDATED', 'Data kehadiran tanggal ' . $date . ' diperbarui.', $before, $after);
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }

    if ($action === 'punch-attendance') {
        requireMethod('POST');
        hrRequireRole($user, 'PEKERJA');
        requireCsrfToken();
        $body = requestJson();
        $event = hrString($body['event'] ?? null, 'Jenis absensi');
        $latitude = $body['latitude'] ?? null;
        $longitude = $body['longitude'] ?? null;
        $accuracy = $body['accuracy'] ?? null;
        if (!in_array($event, ['CHECK_IN', 'OVERTIME_CHECK_IN', 'CHECK_OUT', 'OVERTIME_CHECK_OUT'], true)
            || !is_numeric($latitude) || !is_finite((float) $latitude) || (float) $latitude < -90 || (float) $latitude > 90
            || !is_numeric($longitude) || !is_finite((float) $longitude) || (float) $longitude < -180 || (float) $longitude > 180
            || !is_numeric($accuracy) || !is_finite((float) $accuracy) || (float) $accuracy < 0 || (float) $accuracy > 5000) {
            jsonResponse(['error' => 'Lokasi perangkat tidak valid atau akurasinya terlalu rendah. Aktifkan GPS/lokasi lalu coba lagi.'], 400);
        }
        $workerId = (string) $user['id'];
        $today = date('Y-m-d');
        $now = date('Y-m-d H:i:s');
        $columns = [
            'CHECK_IN' => ['check_in_at', 'check_in', 'check_in_latitude', 'check_in_longitude', 'check_in_accuracy_meters', 'ABSEN_DATANG'],
            'OVERTIME_CHECK_IN' => ['overtime_check_in_at', null, 'overtime_check_in_latitude', 'overtime_check_in_longitude', 'overtime_check_in_accuracy_meters', 'ABSEN_LEMBUR_DATANG'],
            'CHECK_OUT' => ['check_out_at', 'check_out', 'check_out_latitude', 'check_out_longitude', 'check_out_accuracy_meters', 'ABSEN_PULANG'],
            'OVERTIME_CHECK_OUT' => ['overtime_check_out_at', null, 'overtime_check_out_latitude', 'overtime_check_out_longitude', 'overtime_check_out_accuracy_meters', 'ABSEN_LEMBUR_PULANG'],
        ];
        [$timeColumn, $legacyTimeColumn, $latitudeColumn, $longitudeColumn, $accuracyColumn, $historyType] = $columns[$event];
        $pdo->beginTransaction();
        $create = $pdo->prepare(
            'INSERT IGNORE INTO hr_attendance (id, user_id, attendance_date, status, updated_by_name)
             VALUES (:id, :user_id, :date, \'PRESENT\', :name)'
        );
        $create->execute(['id' => hrNewId('HRA'), 'user_id' => $workerId, 'date' => $today, 'name' => $user['name']]);
        $lock = $pdo->prepare('SELECT * FROM hr_attendance WHERE user_id = :user_id AND attendance_date = :date LIMIT 1 FOR UPDATE');
        $lock->execute(['user_id' => $workerId, 'date' => $today]);
        $attendance = $lock->fetch();
        if (!$attendance || $attendance['status'] === 'LEAVE') {
            $pdo->rollBack();
            jsonResponse(['error' => 'Absensi tidak dapat dicatat karena data kehadiran hari ini berstatus cuti. Hubungi HR bila status tersebut keliru.'], 409);
        }
        if ($attendance[$timeColumn] !== null) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Absensi ini sudah tercatat hari ini.'], 409);
        }
        if ($event === 'CHECK_OUT' && $attendance['check_in_at'] === null && $attendance['check_in'] === null) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Absen datang harus dicatat sebelum absen pulang.'], 409);
        }
        if ($event === 'OVERTIME_CHECK_IN' && ($attendance['check_in_at'] === null || $attendance['check_out_at'] === null)) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Absen lembur datang hanya dapat dilakukan setelah absen datang dan absen pulang.'], 409);
        }
        if ($event === 'OVERTIME_CHECK_OUT' && $attendance['overtime_check_in_at'] === null) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Absen lembur datang harus dicatat sebelum absen lembur pulang.'], 409);
        }
        $setParts = [
            '`' . $timeColumn . '` = :event_time',
            '`' . $latitudeColumn . '` = :latitude',
            '`' . $longitudeColumn . '` = :longitude',
            '`' . $accuracyColumn . '` = :accuracy',
            'status = \'PRESENT\'',
            'updated_by_id = :actor_id',
            'updated_by_name = :actor_name',
        ];
        $values = [
            'event_time' => $now,
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'accuracy' => (float) $accuracy,
            'actor_id' => $workerId,
            'actor_name' => $user['name'],
            'user_id' => $workerId,
            'date' => $today,
        ];
        if ($legacyTimeColumn !== null) {
            $setParts[] = '`' . $legacyTimeColumn . '` = :legacy_time';
            $values['legacy_time'] = date('H:i:s');
        }
        $update = $pdo->prepare('UPDATE hr_attendance SET ' . implode(', ', $setParts) . ' WHERE user_id = :user_id AND attendance_date = :date');
        $update->execute($values);
        hrRecordHistory($pdo, $user, $workerId, $historyType, 'Pekerja mencatat ' . strtolower(str_replace('_', ' ', $historyType)) . ' pada ' . $now . '.', null, [
            'event' => $event,
            'occurredAt' => $now,
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'accuracyMeters' => (float) $accuracy,
        ]);
        $pdo->commit();
        jsonResponse(['ok' => true, 'event' => $event, 'occurredAt' => $now]);
    }

    if ($action === 'request-leave') {
        requireMethod('POST');
        hrRequireRole($user, 'PEKERJA');
        requireCsrfToken();
        $body = requestJson();
        $type = hrString($body['type'] ?? null, 'Jenis cuti/izin');
        $startDate = hrDateValue($body['startDate'] ?? null, 'Tanggal mulai', false);
        $endDate = hrDateValue($body['endDate'] ?? null, 'Tanggal akhir', false);
        $reason = hrString($body['reason'] ?? null, 'Alasan cuti/izin');
        if (!in_array($type, ['ANNUAL', 'SICK', 'PERSONAL', 'OTHER'], true)
            || $endDate < $startDate || $reason === '' || strlen($reason) > 2000) {
            jsonResponse(['error' => 'Periksa jenis, tanggal, dan alasan pengajuan cuti/izin.'], 400);
        }
        $id = hrNewId('HRL');
        $pdo->beginTransaction();
        $insert = $pdo->prepare(
            'INSERT INTO hr_leave_requests
             (id, user_id, leave_type, starts_on, ends_on, reason, created_by_id, created_by_name)
             VALUES (:id, :user_id, :type, :starts_on, :ends_on, :reason, :actor_id, :actor_name)'
        );
        $insert->execute([
            'id' => $id, 'user_id' => $user['id'], 'type' => $type, 'starts_on' => $startDate,
            'ends_on' => $endDate, 'reason' => $reason, 'actor_id' => $user['id'], 'actor_name' => $user['name'],
        ]);
        hrRecordHistory($pdo, $user, (string) $user['id'], 'LEAVE_REQUESTED', 'Pengajuan cuti/izin dikirim.', null, [
            'requestId' => $id, 'type' => $type, 'startDate' => $startDate, 'endDate' => $endDate,
        ]);
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }

    if ($action === 'review-leave') {
        requireMethod('POST');
        hrRequireRole($user, 'HR_ADMINISTRASI');
        requireCsrfToken();
        $body = requestJson();
        $id = hrString($body['id'] ?? null, 'ID pengajuan');
        $decision = hrString($body['decision'] ?? null, 'Keputusan');
        $note = hrString($body['note'] ?? null, 'Catatan keputusan');
        if ($id === '' || !in_array($decision, ['APPROVED', 'REJECTED'], true)
            || ($decision === 'REJECTED' && $note === '') || strlen($note) > 1000) {
            jsonResponse(['error' => 'Keputusan cuti/izin atau alasan penolakan tidak valid.'], 400);
        }
        $pdo->beginTransaction();
        $query = $pdo->prepare('SELECT user_id, status FROM hr_leave_requests WHERE id = :id LIMIT 1 FOR UPDATE');
        $query->execute(['id' => $id]);
        $request = $query->fetch();
        if (!$request || $request['status'] !== 'PENDING') {
            $pdo->rollBack();
            jsonResponse(['error' => 'Pengajuan tidak ditemukan atau sudah diproses.'], 409);
        }
        $update = $pdo->prepare(
            'UPDATE hr_leave_requests SET status = :status, review_note = :note,
             reviewed_by_id = :actor_id, reviewed_by_name = :actor_name, reviewed_at = UTC_TIMESTAMP(3)
             WHERE id = :id AND status = \'PENDING\''
        );
        $update->execute([
            'status' => $decision, 'note' => $note !== '' ? $note : null,
            'actor_id' => $user['id'], 'actor_name' => $user['name'], 'id' => $id,
        ]);
        hrRecordHistory($pdo, $user, (string) $request['user_id'], 'LEAVE_' . $decision, 'Pengajuan cuti/izin ' . strtolower($decision) . '.', ['status' => 'PENDING'], ['status' => $decision, 'note' => $note]);
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }

    if ($action === 'request-profile-change') {
        requireMethod('POST');
        hrRequireRole($user, 'PEKERJA');
        requireCsrfToken();
        $body = requestJson();
        $submitted = $body['changes'] ?? null;
        $allowed = ['name', 'email', 'phone', 'dateOfBirth', 'address', 'emergencyContactName', 'emergencyContactPhone'];
        if (!is_array($submitted) || !$submitted) jsonResponse(['error' => 'Isi minimal satu perubahan profil.'], 400);
        $changes = [];
        foreach ($submitted as $key => $value) {
            if (!in_array($key, $allowed, true)) jsonResponse(['error' => 'Kolom perubahan profil tidak valid.'], 400);
            $value = hrString($value, 'Nilai perubahan profil');
            if (strlen($value) > 10000) jsonResponse(['error' => 'Nilai perubahan terlalu panjang.'], 400);
            if ($key === 'dateOfBirth') {
                $changes[$key] = hrDateValue($value, 'Tanggal lahir');
            } elseif ($key === 'email') {
                if (!filter_var($value, FILTER_VALIDATE_EMAIL) || strlen($value) > 255) jsonResponse(['error' => 'Alamat email tidak valid.'], 400);
                $changes[$key] = $value;
            } elseif (in_array($key, ['name'], true) && ($value === '' || strlen($value) > 150)) {
                jsonResponse(['error' => 'Nama wajib diisi dan maksimal 150 karakter.'], 400);
            } elseif ($key === 'phone' && strlen($value) > 50) {
                jsonResponse(['error' => 'Nomor telepon terlalu panjang.'], 400);
            } elseif ($key === 'emergencyContactName' && strlen($value) > 150) {
                jsonResponse(['error' => 'Nama kontak darurat terlalu panjang.'], 400);
            } elseif ($key === 'emergencyContactPhone' && strlen($value) > 50) {
                jsonResponse(['error' => 'Nomor kontak darurat terlalu panjang.'], 400);
            } elseif ($key === 'address' && strlen($value) > 10000) {
                jsonResponse(['error' => 'Alamat terlalu panjang.'], 400);
            } else {
                $changes[$key] = $value;
            }
        }
        $pdo->beginTransaction();
        $lockWorker = $pdo->prepare('SELECT id FROM users WHERE id = :user_id AND role = \'PEKERJA\' LIMIT 1 FOR UPDATE');
        $lockWorker->execute(['user_id' => $user['id']]);
        if (!$lockWorker->fetchColumn()) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Akun pekerja tidak valid.'], 409);
        }
        $pending = $pdo->prepare('SELECT 1 FROM hr_profile_change_requests WHERE user_id = :user_id AND status = \'PENDING\' LIMIT 1');
        $pending->execute(['user_id' => $user['id']]);
        if ($pending->fetchColumn()) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Masih ada pengajuan perubahan profil yang menunggu persetujuan HR.'], 409);
        }
        $id = hrNewId('HRP');
        $insert = $pdo->prepare('INSERT INTO hr_profile_change_requests (id, user_id, proposed_data) VALUES (:id, :user_id, :data)');
        $insert->execute([
            'id' => $id,
            'user_id' => $user['id'],
            'data' => json_encode($changes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        hrRecordHistory($pdo, $user, (string) $user['id'], 'PROFILE_CHANGE_REQUESTED', 'Pengajuan perubahan profil dikirim untuk persetujuan HR.', null, ['requestId' => $id, 'fields' => array_keys($changes)]);
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }

    if ($action === 'update-worker-photo') {
        requireMethod('POST');
        hrRequireRole($user, 'PEKERJA');
        requireCsrfToken();
        $body = requestJson();
        $photoDataBase64 = (string) ($body['photoDataBase64'] ?? '');
        $photoMimeType = hrString($body['photoMimeType'] ?? null, 'Format foto');
        if ($photoDataBase64 === '' || !in_array($photoMimeType, ['image/jpeg', 'image/png'], true)) {
            jsonResponse(['error' => 'Foto pekerja harus berformat JPG atau PNG.'], 400);
        }
        $photoContent = base64_decode(str_replace(["\r", "\n", ' '], '', $photoDataBase64), true);
        if ($photoContent === false || strlen($photoContent) > 2 * 1024 * 1024 || @getimagesizefromstring($photoContent) === false) {
            jsonResponse(['error' => 'Foto pekerja tidak valid atau melebihi 2 MB.'], 400);
        }
        $update = $pdo->prepare('UPDATE hr_employee_records SET photo_content = :photo, photo_mime_type = :mime WHERE user_id = :user_id');
        $update->execute(['photo' => $photoContent, 'mime' => $photoMimeType, 'user_id' => $user['id']]);
        if ($update->rowCount() === 0) jsonResponse(['error' => 'Data administrasi pekerja belum dilengkapi HR.'], 409);
        hrRecordHistory($pdo, $user, (string) $user['id'], 'WORKER_PHOTO_UPDATED', 'Foto pekerja diperbarui.', null, ['photoMimeType' => $photoMimeType]);
        jsonResponse(['ok' => true]);
    }

    if ($action === 'review-profile-change') {
        requireMethod('POST');
        hrRequireRole($user, 'HR_ADMINISTRASI');
        requireCsrfToken();
        $body = requestJson();
        $id = hrString($body['id'] ?? null, 'ID pengajuan');
        $decision = hrString($body['decision'] ?? null, 'Keputusan');
        $note = hrString($body['note'] ?? null, 'Catatan keputusan');
        if ($id === '' || !in_array($decision, ['APPROVED', 'REJECTED'], true)
            || ($decision === 'REJECTED' && $note === '') || strlen($note) > 1000) {
            jsonResponse(['error' => 'Keputusan atau alasan penolakan tidak valid.'], 400);
        }
        $pdo->beginTransaction();
        $query = $pdo->prepare('SELECT user_id, proposed_data, status FROM hr_profile_change_requests WHERE id = :id LIMIT 1 FOR UPDATE');
        $query->execute(['id' => $id]);
        $request = $query->fetch();
        if (!$request || $request['status'] !== 'PENDING' || !hrWorkerExists($pdo, (string) ($request['user_id'] ?? ''))) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Pengajuan tidak ditemukan, pekerja tidak aktif, atau sudah diproses.'], 409);
        }
        $changes = json_decode((string) $request['proposed_data'], true);
        if (!is_array($changes)) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Data pengajuan profil tidak valid.'], 500);
        }
        $workerId = (string) $request['user_id'];
        if ($decision === 'APPROVED') {
            $before = hrAuditEmployeeSnapshot($pdo, $workerId);
            $userFields = [];
            $recordFields = [];
            foreach ($changes as $field => $value) {
                if ($field === 'name') $userFields['name'] = $value;
                elseif ($field === 'email') $userFields['email'] = $value;
                elseif ($field === 'phone') $userFields['phone'] = $value !== '' ? $value : null;
                elseif ($field === 'dateOfBirth') $recordFields['date_of_birth'] = $value;
                elseif ($field === 'address') $recordFields['address'] = $value !== '' ? $value : null;
                elseif ($field === 'emergencyContactName') $recordFields['emergency_contact_name'] = $value !== '' ? $value : null;
                elseif ($field === 'emergencyContactPhone') $recordFields['emergency_contact_phone'] = $value !== '' ? $value : null;
                else {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Pengajuan berisi kolom yang tidak didukung.'], 400);
                }
            }
            if ($userFields) {
                $sets = [];
                foreach ($userFields as $field => $_) $sets[] = '`' . $field . '` = :' . $field;
                $updateUser = $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id AND role = \'PEKERJA\'');
                $updateUser->execute([...$userFields, 'id' => $workerId]);
            }
            if ($recordFields) {
                $branchQuery = $pdo->prepare('SELECT branch_id FROM users WHERE id = :id AND role = \'PEKERJA\' LIMIT 1');
                $branchQuery->execute(['id' => $workerId]);
                $branchId = $branchQuery->fetchColumn();
                if (!$branchId) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Branch pekerja belum ditetapkan. Lengkapi data pekerja sebelum menyetujui perubahan profil.'], 409);
                }
                $columns = array_keys($recordFields);
                $insertColumns = ['user_id', 'branch_id', ...$columns];
                $values = [':user_id', ':branch_id', ...array_map(static fn(string $column): string => ':' . $column, $columns)];
                $updates = array_map(static fn(string $column): string => '`' . $column . '` = VALUES(`' . $column . '`)', $columns);
                $insert = $pdo->prepare(
                    'INSERT INTO hr_employee_records (' . implode(', ', array_map(static fn(string $column): string => '`' . $column . '`', $insertColumns)) . ')
                     VALUES (' . implode(', ', $values) . ')
                     ON DUPLICATE KEY UPDATE ' . implode(', ', $updates)
                );
                $insert->execute(['user_id' => $workerId, 'branch_id' => $branchId, ...$recordFields]);
            }
            hrRecordHistory($pdo, $user, $workerId, 'PROFILE_CHANGE_APPROVED', 'Perubahan profil pekerja disetujui HR.', $before, $changes);
        }
        $updateRequest = $pdo->prepare(
            'UPDATE hr_profile_change_requests SET status = :status, review_note = :note,
             reviewed_by_id = :actor_id, reviewed_by_name = :actor_name, reviewed_at = UTC_TIMESTAMP(3)
             WHERE id = :id AND status = \'PENDING\''
        );
        $updateRequest->execute([
            'status' => $decision, 'note' => $note !== '' ? $note : null,
            'actor_id' => $user['id'], 'actor_name' => $user['name'], 'id' => $id,
        ]);
        if ($decision === 'REJECTED') {
            hrRecordHistory($pdo, $user, $workerId, 'PROFILE_CHANGE_REJECTED', 'Pengajuan perubahan profil ditolak HR.', null, ['requestId' => $id, 'note' => $note]);
        }
        $pdo->commit();
        jsonResponse(['ok' => true]);
    }

    jsonResponse(['error' => 'Unknown HR action'], 404);
} catch (PDOException $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('MaritimPort HR database error: ' . $error->getMessage());
    if ($error->getCode() === '23000') jsonResponse(['error' => 'Data bertenturan dengan catatan HR yang sudah ada. Periksa nomor pekerja dan status permintaan.'], 409);
    jsonResponse(['error' => 'Penyimpanan data HR gagal.'], 500);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('MaritimPort HR error: ' . $error->getMessage());
    jsonResponse(['error' => 'Permintaan data HR gagal diproses.'], 500);
}
