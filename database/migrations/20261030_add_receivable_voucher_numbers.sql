ALTER TABLE accounts_receivable_entries
  ADD COLUMN receipt_number VARCHAR(40) NULL AFTER id,
  ADD UNIQUE KEY uq_accounts_receivable_receipt_number (receipt_number);

CREATE TABLE receivable_voucher_sequences (
  branch_code VARCHAR(10) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  period_key CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  last_number INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_code, period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
