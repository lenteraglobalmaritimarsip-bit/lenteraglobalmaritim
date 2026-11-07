<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    requireMethod('GET', 'POST');
    $user = requireAuthenticatedUser();
    $role = (string) ($user['role'] ?? '');
    if (!in_array($role, ['FINANCE', 'HR_ADMINISTRASI', 'ADMIN', 'PEKERJA'], true)) {
        jsonResponse(['error' => 'Payroll access required'], 403);
    }

    if ($method === 'GET') {
        if ($role === 'PEKERJA') {
            $period = trim((string) ($_GET['period'] ?? ''));
            $identityStatement = db()->prepare(
                'SELECT employee_number FROM hr_employee_records WHERE user_id = :user_id LIMIT 1'
            );
            $identityStatement->execute(['user_id' => $user['id']]);
            $identity = $identityStatement->fetch();
            $employeeNumber = trim((string) ($identity['employee_number'] ?? ''));

            $statement = db()->prepare(
                'SELECT b.id, b.period, b.file_name, b.status,
                        s.`NO` AS payroll_row_number, s.`NAMA` AS employee_name, s.`NOMOR PEKERJA` AS employee_number,
                        s.`CABANG` AS branch, s.`JABATAN` AS position,
                        s.`TGL MASUK` AS date_joined, s.`BANK` AS bank_name,
                        s.`NO REKENING` AS bank_account_number, s.`STATUS PTKP` AS tax_status,
                        s.`GAJI POKOK` AS basic_salary, s.`TUNJ MAKAN` AS meals,
                        s.`TUNJ TRANSPORT` AS transport, s.`TUNJ JABATAN` AS position_allowance,
                        s.`LEMBUR` AS overtime, s.`THR` AS thr, s.`TUNJ PPh 21` AS tax_allowance,
                        s.`TOTAL PENDAPATAN DITERIMA` AS total_income_received,
                        s.`UPAH BPJS (PREMI DIDAFTARKAN)` AS bpjs_wage,
                        s.`PREMI JHT` AS jht_employer, s.`PREMI JKM` AS jkm_employer,
                        s.`PREMI JKK` AS jkk_employer, s.`PREMI JP` AS jp_employer,
                        s.`TOTAL BPJS TK PERUSAHAAN` AS bpjs_employer_total,
                        s.`BPJS KESEHATAN PERUSAHAAN` AS bpjs_health_employer,
                        s.`TOTAL PENDAPATAN TIDAK DITERIMA` AS employer_benefits_total,
                        s.`GAJI BRUTO` AS gross_income,
                        s.`POT. BPJS TK PERUSAHAAN` AS deduction_bpjs_tk_employer,
                        s.`POT. BPJS KES PERUSAHAAN` AS deduction_bpjs_health_employer,
                        s.`POT. BPJS TK KARYAWAN` AS deduction_bpjs_tk_employee,
                        s.`POT. BPJS KES KARYAWAN` AS deduction_bpjs_health_employee,
                        s.`POT. PPh 21 DITANGGUNG` AS deduction_pph21,
                        s.`POT. KARYAWAN / LOAN` AS deduction_loan,
                        s.`POT. TIDAK HADIR / TELAT` AS deduction_absence,
                        s.`POT. THR` AS deduction_thr, s.`TOTAL POTONGAN` AS deductions,
                        s.`TAKE HOME PAY` AS take_home_pay, s.`TERBILANG` AS terbilang,
                        s.`SLIP NO` AS slip_number, s.`PERIODE` AS period_label,
                        s.`MASUK` AS attendance_present,
                        s.`SAKIT` AS attendance_sick, s.`IZIN` AS attendance_leave,
                        s.`CUTI` AS attendance_annual_leave, s.`ALFA` AS attendance_absent,
                        s.`OFF` AS attendance_off
                 FROM payroll_batches b
                 JOIN payroll_slips s ON s.batch_id = b.id
                 ORDER BY b.period DESC'
            );
            $statement->execute();
            $rows = array_filter($statement->fetchAll(), static function (array $row) use ($employeeNumber): bool {
                if ((string) $row['status'] !== 'FINAL') return false;
                return $employeeNumber !== '' && trim((string) $row['employee_number']) === $employeeNumber;
            });
            if ($period !== '') {
                $rows = array_filter($rows, static fn(array $row): bool => (string) $row['period'] === $period);
            }
            $slips = array_map(static fn(array $row): array => [
                'batchId' => (string) $row['id'],
                'period' => (string) $row['period'],
                'rowNumber' => (int) $row['payroll_row_number'],
                'employeeNumber' => (string) $row['employee_number'],
                'employeeName' => (string) $row['employee_name'],
                'branch' => (string) $row['branch'],
                'position' => (string) ($row['position'] ?? ''),
                'dateJoined' => (string) ($row['date_joined'] ?? ''),
                'bankName' => (string) $row['bank_name'],
                'bankAccountNumber' => (string) $row['bank_account_number'],
                'taxStatus' => (string) $row['tax_status'],
                'basicSalary' => (float) $row['basic_salary'],
                'meals' => (float) $row['meals'],
                'transport' => (float) $row['transport'],
                'positionAllowance' => (float) $row['position_allowance'],
                'overtime' => (float) $row['overtime'],
                'thr' => (float) $row['thr'],
                'taxAllowance' => (float) $row['tax_allowance'],
                'totalIncomeReceived' => (float) $row['total_income_received'],
                'bpjsWage' => (float) $row['bpjs_wage'],
                'jhtEmployer' => (float) $row['jht_employer'],
                'jkmEmployer' => (float) $row['jkm_employer'],
                'jkkEmployer' => (float) $row['jkk_employer'],
                'jpEmployer' => (float) $row['jp_employer'],
                'bpjsEmployerTotal' => (float) $row['bpjs_employer_total'],
                'bpjsHealthEmployer' => (float) $row['bpjs_health_employer'],
                'employerBenefitsTotal' => (float) $row['employer_benefits_total'],
                'grossIncome' => (float) $row['gross_income'],
                'deductionBpjsTkEmployer' => (float) $row['deduction_bpjs_tk_employer'],
                'deductionBpjsHealthEmployer' => (float) $row['deduction_bpjs_health_employer'],
                'deductionBpjsTkEmployee' => (float) $row['deduction_bpjs_tk_employee'],
                'deductionBpjsHealthEmployee' => (float) $row['deduction_bpjs_health_employee'],
                'deductionPph21' => (float) $row['deduction_pph21'],
                'deductionLoan' => (float) $row['deduction_loan'],
                'deductionAbsence' => (float) $row['deduction_absence'],
                'deductionThr' => (float) $row['deduction_thr'],
                'deductions' => (float) $row['deductions'],
                'takeHomePay' => (float) $row['take_home_pay'],
                'terbilang' => (string) $row['terbilang'],
                'slipNumber' => (string) $row['slip_number'],
                'periodLabel' => (string) $row['period_label'],
                'attendancePresent' => (int) $row['attendance_present'],
                'attendanceSick' => (int) $row['attendance_sick'],
                'attendanceLeave' => (int) $row['attendance_leave'],
                'attendanceAnnualLeave' => (int) $row['attendance_annual_leave'],
                'attendanceAbsent' => (int) $row['attendance_absent'],
                'attendanceOff' => (int) $row['attendance_off'],
            ], array_values($rows));
            jsonResponse(['slips' => $slips]);
        }

        $statement = db()->query(
            'SELECT b.id, b.period, b.file_name, b.status, b.created_at,
                    COUNT(s.id) AS slip_count
             FROM payroll_batches b
             LEFT JOIN payroll_slips s ON s.batch_id = b.id
             GROUP BY b.id, b.period, b.file_name, b.status, b.created_at
             ORDER BY b.period DESC, b.created_at DESC'
        );
        $batches = array_map(static fn(array $row): array => [
            'id' => (string) $row['id'],
            'period' => (string) $row['period'],
            'fileName' => (string) $row['file_name'],
            'status' => (string) $row['status'],
            'slipCount' => (int) $row['slip_count'],
            'createdAt' => (string) $row['created_at'],
        ], $statement->fetchAll());
        jsonResponse(['batches' => $batches]);
    }

    if (!in_array($role, ['FINANCE', 'HR_ADMINISTRASI', 'ADMIN'], true)) {
        jsonResponse(['error' => 'Finance access required'], 403);
    }
    requireCsrfToken();
    $body = requestJson();
    if (($body['action'] ?? '') === 'delete-period') {
        $periodToDelete = trim((string) ($body['period'] ?? ''));
        $confirmedPeriod = trim((string) ($body['confirmPeriod'] ?? ''));
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $periodToDelete)) {
            jsonResponse(['error' => 'Periode payroll tidak valid'], 400);
        }
        if ($confirmedPeriod !== $periodToDelete) {
            jsonResponse(['error' => 'Konfirmasi periode tidak cocok'], 400);
        }

        $database = db();
        $database->beginTransaction();
        $findBatch = $database->prepare('SELECT id, period, file_name, status FROM payroll_batches WHERE period = :period FOR UPDATE');
        $findBatch->execute(['period' => $periodToDelete]);
        $targetBatch = $findBatch->fetch();
        if ($targetBatch === null) {
            $database->rollBack();
            jsonResponse(['error' => "Payroll periode {$periodToDelete} tidak ditemukan"], 404);
        }

        $countSlips = $database->prepare('SELECT COUNT(*) FROM payroll_slips WHERE batch_id = :batch_id');
        $countSlips->execute(['batch_id' => $targetBatch['id']]);
        $slipCount = (int) $countSlips->fetchColumn();

        $deleteBatch = $database->prepare('DELETE FROM payroll_batches WHERE id = :id');
        $deleteBatch->execute(['id' => $targetBatch['id']]);
        if ($deleteBatch->rowCount() !== 1) {
            throw new RuntimeException("Payroll periode {$periodToDelete} gagal dihapus.");
        }

        $audit = $database->prepare(
            'INSERT INTO audit_logs
             (id, logged_at, actor_id, actor_name, actor_role, action, entity, entity_id, description)
             VALUES (:id, UTC_TIMESTAMP(3), :actor_id, :actor_name, :actor_role, \'DELETE\', \'PAYROLL_BATCH\', :entity_id, :description)'
        );
        $audit->execute([
            'id' => 'AUD-PAY-' . bin2hex(random_bytes(12)),
            'actor_id' => $user['id'],
            'actor_name' => mb_substr((string) ($user['name'] ?? 'Unknown'), 0, 150),
            'actor_role' => $role,
            'entity_id' => $targetBatch['id'],
            'description' => sprintf(
                'Menghapus payroll periode %s (%s), status %s, %d slip; membuka ulang periode untuk entry ulang.',
                $periodToDelete,
                (string) $targetBatch['file_name'],
                (string) $targetBatch['status'],
                $slipCount
            ),
        ]);
        $database->commit();
        jsonResponse(['ok' => true, 'period' => $periodToDelete, 'deletedSlipCount' => $slipCount]);
    }

    $period = trim((string) ($body['period'] ?? ''));
    $fileName = trim((string) ($body['fileName'] ?? ''));
    $status = strtoupper(trim((string) ($body['status'] ?? 'DRAFT')));
    $rows = $body['rows'] ?? [];

    if (!preg_match('/^\d{4}-\d{2}$/', $period)) jsonResponse(['error' => 'Periode payroll tidak valid'], 400);
    if ($fileName === '') jsonResponse(['error' => 'Nama file wajib diisi'], 400);
    if (!in_array($status, ['DRAFT', 'FINAL'], true)) jsonResponse(['error' => 'Status payroll tidak valid'], 400);
    if (!is_array($rows) || count($rows) === 0) jsonResponse(['error' => 'Tidak ada data pekerja'], 400);

    $employeeNumbers = [];
    foreach ($rows as $row) {
        if (!is_array($row)) jsonResponse(['error' => 'Data pekerja tidak valid'], 400);
        $employeeNumber = trim((string) ($row['employeeNumber'] ?? ''));
        if ($employeeNumber === '') jsonResponse(['error' => 'Nomor pekerja wajib diisi'], 400);
        if (isset($employeeNumbers[$employeeNumber])) jsonResponse(['error' => "Nomor pekerja {$employeeNumber} muncul lebih dari satu kali"], 400);
        foreach (['dateJoined', 'dateOfBirth'] as $dateField) {
            $date = trim((string) ($row[$dateField] ?? ''));
            if ($date !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4)))) {
                jsonResponse(['error' => "Tanggal {$dateField} tidak valid untuk nomor pekerja {$employeeNumber}"], 400);
            }
        }
        $employeeNumbers[$employeeNumber] = true;
    }

    $database = db();
    foreach ($database->query('SELECT period FROM payroll_batches')->fetchAll() as $existingBatch) {
        if ((string) $existingBatch['period'] === $period) {
            jsonResponse(['error' => "Payroll periode {$period} sudah ada"], 409);
        }
    }

    $database->beginTransaction();
    $batchId = 'PAY-' . bin2hex(random_bytes(12));
    $insertBatch = $database->prepare(
        'INSERT INTO payroll_batches (id, period, file_name, status, created_by) VALUES (:id, :period, :file_name, :status, :created_by)'
    );
    $insertBatch->execute([
        'id' => $batchId,
        'period' => $period,
        'file_name' => mb_substr($fileName, 0, 255),
        'status' => $status,
        'created_by' => $user['id'],
    ]);
    $payrollFields = [
        'rowNumber' => 'NO',
        'branch' => 'CABANG',
        'position' => 'JABATAN',
        'dateJoined' => 'TGL MASUK',
        'dateOfBirth' => 'TGL LAHIR',
        'bankName' => 'BANK',
        'bankAccountNumber' => 'NO REKENING',
        'taxStatus' => 'STATUS PTKP',
        'spouseCount' => 'ISTRI/SUAMI',
        'childrenCount' => 'ANAK',
        'basicSalary' => 'GAJI POKOK',
        'meals' => 'TUNJ MAKAN',
        'transport' => 'TUNJ TRANSPORT',
        'positionAllowance' => 'TUNJ JABATAN',
        'overtime' => 'LEMBUR',
        'thr' => 'THR',
        'taxAllowance' => 'TUNJ PPh 21',
        'totalIncomeReceived' => 'TOTAL PENDAPATAN DITERIMA',
        'bpjsWage' => 'UPAH BPJS (PREMI DIDAFTARKAN)',
        'jhtEmployer' => 'PREMI JHT',
        'jkmEmployer' => 'PREMI JKM',
        'jkkEmployer' => 'PREMI JKK',
        'jpEmployer' => 'PREMI JP',
        'bpjsEmployerTotal' => 'TOTAL BPJS TK PERUSAHAAN',
        'bpjsHealthEmployer' => 'BPJS KESEHATAN PERUSAHAAN',
        'employerBenefitsTotal' => 'TOTAL PENDAPATAN TIDAK DITERIMA',
        'grossIncome' => 'GAJI BRUTO',
        'deductionBpjsTkEmployer' => 'POT. BPJS TK PERUSAHAAN',
        'deductionBpjsHealthEmployer' => 'POT. BPJS KES PERUSAHAAN',
        'deductionBpjsTkEmployee' => 'POT. BPJS TK KARYAWAN',
        'deductionBpjsHealthEmployee' => 'POT. BPJS KES KARYAWAN',
        'deductionPph21' => 'POT. PPh 21 DITANGGUNG',
        'deductionLoan' => 'POT. KARYAWAN / LOAN',
        'deductionAbsence' => 'POT. TIDAK HADIR / TELAT',
        'deductionThr' => 'POT. THR',
        'deductions' => 'TOTAL POTONGAN',
        'takeHomePay' => 'TAKE HOME PAY',
        'terbilang' => 'TERBILANG',
        'slipNumber' => 'SLIP NO',
        'attendancePresent' => 'MASUK',
        'attendanceSick' => 'SAKIT',
        'attendanceLeave' => 'IZIN',
        'attendanceAnnualLeave' => 'CUTI',
        'attendanceAbsent' => 'ALFA',
        'attendanceOff' => 'OFF',
        'periodLabel' => 'PERIODE',
    ];
    $baseColumns = ['id', 'batch_id', 'NOMOR PEKERJA', 'NAMA'];
    $columns = array_merge($baseColumns, array_values($payrollFields));
    $valueTokens = array_merge(
        [':id', ':batch_id', ':employee_number', ':employee_name'],
        array_map(static fn(string $field): string => ':' . $field, array_keys($payrollFields))
    );
    $insertSlip = $database->prepare(
        'INSERT INTO payroll_slips (' . implode(', ', array_map(static fn(string $column): string => '`' . $column . '`', $columns)) . ') VALUES (' . implode(', ', $valueTokens) . ')'
    );
    $stringLimits = [
        'branch' => 150, 'position' => 120, 'bankName' => 80, 'bankAccountNumber' => 80,
        'taxStatus' => 20, 'terbilang' => 255, 'slipNumber' => 50, 'periodLabel' => 50,
    ];
    $dateFields = ['dateJoined', 'dateOfBirth'];
    foreach ($rows as $row) {
        $params = [
            'id' => 'SLIP-' . bin2hex(random_bytes(12)),
            'batch_id' => $batchId,
            'employee_number' => trim((string) ($row['employeeNumber'] ?? '')),
            'employee_name' => mb_substr(trim((string) ($row['name'] ?? '')), 0, 150),
        ];
        foreach ($payrollFields as $property => $column) {
            $value = $row[$property] ?? (isset($stringLimits[$property]) || in_array($property, $dateFields, true) ? '' : 0);
            if (in_array($property, $dateFields, true)) {
                $date = trim((string) $value);
                $params[$property] = $date !== '' ? $date : null;
            } elseif (isset($stringLimits[$property])) {
                $params[$property] = mb_substr(trim((string) $value), 0, $stringLimits[$property]);
            } else {
                $params[$property] = (float) $value;
            }
        }
        $insertSlip->execute($params);
    }
    $database->commit();
    jsonResponse(['batch' => [
        'id' => $batchId,
        'period' => $period,
        'fileName' => $fileName,
        'status' => $status,
        'slipCount' => count($rows),
        'createdAt' => (new DateTimeImmutable('now', new DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s'),
    ]]);
} catch (Throwable $error) {
    if (isset($database) && $database->inTransaction()) $database->rollBack();
    jsonResponse(['error' => $error->getMessage()], 500);
}
