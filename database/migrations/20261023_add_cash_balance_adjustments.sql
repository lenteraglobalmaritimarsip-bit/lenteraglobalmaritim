CREATE TABLE cash_balance_adjustments (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  bank_account_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  bank_name VARCHAR(200) NOT NULL,
  account_number VARCHAR(80) NOT NULL,
  currency ENUM('IDR', 'USD') NOT NULL,
  amount DECIMAL(30,2) NOT NULL,
  effective_date DATE NOT NULL,
  reason TEXT NOT NULL,
  created_by VARCHAR(200) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_cash_balance_adjustments_account_date (bank_account_id, effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
