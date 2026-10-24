ALTER TABLE users
  ADD COLUMN failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN locked_at DATETIME(3) NULL AFTER failed_login_attempts;

ALTER TABLE audit_logs
  MODIFY COLUMN actor_role ENUM('ADMIN', 'SALES', 'MANAGER_OPS', 'FDA', 'FINANCE') NULL;
