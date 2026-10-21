ALTER TABLE principal_receipts
  ADD COLUMN refund_amount DECIMAL(30,12) NOT NULL DEFAULT 0 AFTER payment_type,
  ADD COLUMN refund_exchange_rate_usd_to_idr DECIMAL(30,12) NOT NULL DEFAULT 0 AFTER refund_amount,
  ADD COLUMN refund_date DATE NULL AFTER refund_exchange_rate_usd_to_idr,
  ADD COLUMN refund_bank_reference VARCHAR(150) NULL AFTER refund_date,
  ADD COLUMN refund_status ENUM('NONE', 'PENDING', 'PAID') NOT NULL DEFAULT 'NONE' AFTER refund_bank_reference;