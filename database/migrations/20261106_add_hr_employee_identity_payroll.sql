ALTER TABLE hr_employee_records
  ADD COLUMN birth_city VARCHAR(120) NULL AFTER date_of_birth,
  ADD COLUMN contract_duration_years DECIMAL(4,1) NULL AFTER contract_end,
  ADD COLUMN nik VARCHAR(20) NULL AFTER contract_duration_years,
  ADD COLUMN npwp VARCHAR(30) NULL AFTER nik,
  ADD COLUMN payroll_account_number VARCHAR(50) NULL AFTER npwp,
  ADD COLUMN payroll_bank_name VARCHAR(100) NULL AFTER payroll_account_number;
