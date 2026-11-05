ALTER TABLE payment_vouchers
  ADD COLUMN journal_number VARCHAR(40) NULL AFTER voucher_number,
  ADD UNIQUE KEY uq_payment_vouchers_journal_number (journal_number);

ALTER TABLE accounts_receivable_entries
  ADD COLUMN journal_number VARCHAR(40) NULL AFTER id,
  ADD UNIQUE KEY uq_accounts_receivable_journal_number (journal_number);

CREATE TABLE finance_journal_sequences (
  branch_code VARCHAR(10) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  journal_year SMALLINT UNSIGNED NOT NULL,
  last_number INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (branch_code, journal_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
