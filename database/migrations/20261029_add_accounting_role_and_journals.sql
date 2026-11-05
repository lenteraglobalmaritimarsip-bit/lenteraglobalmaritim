ALTER TABLE users
  MODIFY COLUMN role ENUM('ADMIN', 'SALES', 'MANAGER_OPS', 'FDA', 'FINANCE', 'ACCOUNTING') NOT NULL;

ALTER TABLE audit_logs
  MODIFY COLUMN actor_role ENUM('ADMIN', 'SALES', 'MANAGER_OPS', 'FDA', 'FINANCE', 'ACCOUNTING') NULL;

CREATE TABLE accounting_journal_sequences (
  branch_code VARCHAR(10) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  journal_year SMALLINT UNSIGNED NOT NULL,
  last_number INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_code, journal_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE accounting_journals (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  journal_number VARCHAR(40) UNIQUE,
  source_type ENUM('PAYABLE', 'RECEIVABLE') NOT NULL,
  source_key VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  branch_id SMALLINT UNSIGNED NOT NULL,
  branch_name VARCHAR(150) NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  status ENUM('DRAFT', 'POSTED') NOT NULL DEFAULT 'DRAFT',
  created_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_by_name VARCHAR(200) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_by_name VARCHAR(200) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  posted_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin,
  posted_by_name VARCHAR(200),
  posted_at DATETIME(3),
  UNIQUE KEY uq_accounting_journal_source (source_type, source_key),
  INDEX idx_accounting_journals_branch_date (branch_id, entry_date),
  INDEX idx_accounting_journals_status_date (status, entry_date),
  CONSTRAINT fk_accounting_journals_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_accounting_journals_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_accounting_journals_updater FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_accounting_journals_poster FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE accounting_journal_lines (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  journal_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  coa_id VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  memo VARCHAR(250) NOT NULL DEFAULT '',
  direction ENUM('DEBIT', 'CREDIT') NOT NULL,
  amount DECIMAL(30,2) NOT NULL CHECK (amount > 0),
  UNIQUE KEY uq_accounting_journal_line (journal_id, line_no),
  INDEX idx_accounting_journal_lines_coa (coa_id),
  CONSTRAINT fk_accounting_journal_lines_journal FOREIGN KEY (journal_id) REFERENCES accounting_journals(id) ON DELETE CASCADE,
  CONSTRAINT fk_accounting_journal_lines_coa FOREIGN KEY (coa_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
