CREATE TABLE bank_account_opening_balances (
  bank_account_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency ENUM('IDR', 'USD') NOT NULL,
  opening_amount DECIMAL(30,2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  effective_date DATE NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (bank_account_id, currency),
  INDEX idx_bank_account_opening_balances_date (effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
