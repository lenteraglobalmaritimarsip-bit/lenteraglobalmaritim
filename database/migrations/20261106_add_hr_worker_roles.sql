ALTER TABLE users
  MODIFY COLUMN role ENUM('ADMIN', 'SALES', 'MANAGER_OPS', 'FDA', 'FINANCE', 'ACCOUNTING', 'DIRECTOR', 'HR_ADMINISTRASI', 'PEKERJA') NOT NULL;

ALTER TABLE audit_logs
  MODIFY COLUMN actor_role ENUM('ADMIN', 'SALES', 'MANAGER_OPS', 'FDA', 'FINANCE', 'ACCOUNTING', 'DIRECTOR', 'HR_ADMINISTRASI', 'PEKERJA') NULL;

CREATE TABLE hr_employee_records (
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  employee_number VARCHAR(50) UNIQUE,
  date_of_birth DATE,
  gender ENUM('MALE', 'FEMALE', 'OTHER'),
  address TEXT,
  emergency_contact_name VARCHAR(150),
  emergency_contact_phone VARCHAR(50),
  employment_status ENUM('ACTIVE', 'ON_LEAVE', 'RESIGNED') NOT NULL DEFAULT 'ACTIVE',
  contract_type ENUM('PERMANENT', 'CONTRACT', 'PROBATION', 'INTERNSHIP', 'OTHER'),
  contract_start DATE,
  contract_end DATE,
  position VARCHAR(120),
  department VARCHAR(120),
  branch_id SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_hr_employee_branch (branch_id),
  INDEX idx_hr_employee_status (employment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hr_employee_history (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  before_data JSON,
  after_data JSON,
  actor_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  actor_name VARCHAR(150) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_hr_history_employee (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hr_employee_documents (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(60) NOT NULL,
  file_name VARCHAR(180) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  content LONGBLOB NOT NULL,
  uploaded_by_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  uploaded_by_name VARCHAR(150) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_hr_documents_employee (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hr_attendance (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('PRESENT', 'ABSENT', 'REMOTE', 'LEAVE') NOT NULL,
  check_in TIME,
  check_out TIME,
  note VARCHAR(1000),
  updated_by_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  updated_by_name VARCHAR(150) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_hr_attendance_employee_date (user_id, attendance_date),
  INDEX idx_hr_attendance_date (attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hr_leave_requests (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  leave_type ENUM('ANNUAL', 'SICK', 'PERSONAL', 'OTHER') NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  review_note VARCHAR(1000),
  created_by_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_by_name VARCHAR(150) NOT NULL,
  reviewed_by_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  reviewed_by_name VARCHAR(150),
  reviewed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_hr_leave_employee (user_id, starts_on),
  INDEX idx_hr_leave_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hr_profile_change_requests (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  proposed_data JSON NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  review_note VARCHAR(1000),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_by_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  reviewed_by_name VARCHAR(150),
  reviewed_at DATETIME(3),
  INDEX idx_hr_profile_request_employee (user_id, created_at),
  INDEX idx_hr_profile_request_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
