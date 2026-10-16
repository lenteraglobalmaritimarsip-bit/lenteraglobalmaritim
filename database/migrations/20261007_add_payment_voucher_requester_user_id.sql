ALTER TABLE payment_vouchers
  ADD COLUMN request_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER request_by,
  ADD INDEX idx_payment_vouchers_requester (request_by_user_id);