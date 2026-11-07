CREATE TABLE IF NOT EXISTS payroll_batches (
  id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  period VARCHAR(7) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  status ENUM('DRAFT', 'FINAL') NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payroll_period (period),
  CONSTRAINT fk_payroll_batch_user FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_slips (
  id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  batch_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  employee_number VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  employee_name VARCHAR(150) NOT NULL,
  position VARCHAR(120),
  basic_salary DECIMAL(18,2) NOT NULL DEFAULT 0,
  meals DECIMAL(18,2) NOT NULL DEFAULT 0,
  transport DECIMAL(18,2) NOT NULL DEFAULT 0,
  position_allowance DECIMAL(18,2) NOT NULL DEFAULT 0,
  gross_income DECIMAL(18,2) NOT NULL DEFAULT 0,
  deductions DECIMAL(18,2) NOT NULL DEFAULT 0,
  take_home_pay DECIMAL(18,2) NOT NULL DEFAULT 0,
  slip_number VARCHAR(50) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payroll_batch_employee (batch_id, employee_number),
  INDEX idx_payroll_slip_number (employee_number),
  CONSTRAINT fk_payroll_slip_batch FOREIGN KEY (batch_id) REFERENCES payroll_batches(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
