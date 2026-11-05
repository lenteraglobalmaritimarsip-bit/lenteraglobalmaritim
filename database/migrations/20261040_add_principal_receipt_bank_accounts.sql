ALTER TABLE principal_receipts
  ADD COLUMN received_bank_account_id VARCHAR(100) NULL AFTER payment_type,
  ADD COLUMN received_bank_name VARCHAR(150) NULL AFTER received_bank_account_id,
  ADD COLUMN received_account_name VARCHAR(150) NULL AFTER received_bank_name,
  ADD COLUMN received_account_number VARCHAR(100) NULL AFTER received_account_name,
  ADD COLUMN refund_bank_account_id VARCHAR(100) NULL AFTER refund_bank_reference,
  ADD COLUMN refund_bank_name VARCHAR(150) NULL AFTER refund_bank_account_id,
  ADD COLUMN refund_account_name VARCHAR(150) NULL AFTER refund_bank_name,
  ADD COLUMN refund_account_number VARCHAR(100) NULL AFTER refund_account_name;
