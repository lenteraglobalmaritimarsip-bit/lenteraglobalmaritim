ALTER TABLE payment_vouchers
  ADD COLUMN paid_from_bank_account_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER paid_at,
  ADD INDEX idx_payment_vouchers_source_bank (paid_from_bank_account_id),
  ADD CONSTRAINT fk_payment_vouchers_source_bank
    FOREIGN KEY (paid_from_bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;