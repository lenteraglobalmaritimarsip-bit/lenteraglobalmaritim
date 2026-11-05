ALTER TABLE payment_vouchers
  ADD COLUMN approval_target_role VARCHAR(30) NULL AFTER status,
  ADD COLUMN approval_target_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER approval_target_role,
  ADD COLUMN approval_target_name VARCHAR(200) NULL AFTER approval_target_user_id,
  ADD INDEX idx_payment_vouchers_approval_target (approval_target_user_id, status);
