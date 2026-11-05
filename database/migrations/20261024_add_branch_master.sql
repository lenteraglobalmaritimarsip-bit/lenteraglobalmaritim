CREATE TABLE IF NOT EXISTS branches (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO branches (id, code, name) VALUES
  (1, 'JKT', 'Jakarta'),
  (2, 'BJM', 'Banjarmasin'),
  (3, 'SBY', 'Surabaya'),
  (4, 'MKS', 'Makassar'),
  (5, 'SRG', 'Semarang'),
  (6, 'BTM', 'Batam')
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);

ALTER TABLE users
  ADD COLUMN branch_id SMALLINT UNSIGNED NULL AFTER branch_name,
  ADD INDEX idx_users_branch (branch_id),
  ADD CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE bank_accounts
  ADD COLUMN branch_id SMALLINT UNSIGNED NULL AFTER branch_name,
  ADD INDEX idx_bank_accounts_branch_id (branch_id),
  ADD CONSTRAINT fk_bank_accounts_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE cash_balance_adjustments
  ADD COLUMN branch_id SMALLINT UNSIGNED NULL AFTER branch_name,
  ADD INDEX idx_cash_balance_adjustments_branch_id_date (branch_id, effective_date),
  ADD CONSTRAINT fk_cash_balance_adjustments_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE payment_vouchers
  ADD COLUMN branch_id SMALLINT UNSIGNED NULL AFTER branch_name,
  ADD INDEX idx_payment_vouchers_branch_id_date (branch_id, request_date),
  ADD CONSTRAINT fk_payment_vouchers_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE inquiries
  ADD COLUMN created_by_branch_id SMALLINT UNSIGNED NULL AFTER created_by_branch,
  ADD INDEX idx_inquiries_branch_id (created_by_branch_id),
  ADD CONSTRAINT fk_inquiries_branch FOREIGN KEY (created_by_branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE accounts_receivable_entries
  ADD COLUMN branch_id SMALLINT UNSIGNED NULL AFTER branch_name,
  ADD INDEX idx_accounts_receivable_branch_id_date (branch_id, income_date),
  ADD CONSTRAINT fk_accounts_receivable_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

UPDATE users u
INNER JOIN branches b
  ON LOWER(TRIM(u.branch_name)) IN (LOWER(b.code), LOWER(b.name))
SET u.branch_id = b.id,
    u.branch_name = b.code
WHERE u.branch_id IS NULL;

UPDATE inquiries i
INNER JOIN branches b
  ON LOWER(TRIM(i.created_by_branch)) IN (LOWER(b.code), LOWER(b.name))
SET i.created_by_branch_id = b.id,
    i.created_by_branch = b.code
WHERE i.created_by_branch_id IS NULL;

UPDATE bank_accounts a
INNER JOIN branches b
  ON LOWER(TRIM(a.branch_name)) IN (LOWER(b.code), LOWER(b.name))
SET a.branch_id = b.id,
    a.branch_name = b.code
WHERE a.branch_id IS NULL;

UPDATE cash_balance_adjustments a
INNER JOIN branches b
  ON LOWER(TRIM(a.branch_name)) IN (LOWER(b.code), LOWER(b.name))
SET a.branch_id = b.id,
    a.branch_name = b.code
WHERE a.branch_id IS NULL;

UPDATE payment_vouchers v
INNER JOIN branches b
  ON LOWER(TRIM(v.branch_name)) IN (LOWER(b.code), LOWER(b.name))
SET v.branch_id = b.id,
    v.branch_name = b.code
WHERE v.branch_id IS NULL;

UPDATE accounts_receivable_entries a
INNER JOIN branches b
  ON LOWER(TRIM(a.branch_name)) IN (LOWER(b.code), LOWER(b.name))
SET a.branch_id = b.id,
    a.branch_name = b.code
WHERE a.branch_id IS NULL;
