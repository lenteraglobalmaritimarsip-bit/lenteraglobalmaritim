ALTER TABLE payment_vouchers
  ADD COLUMN currency ENUM('IDR', 'USD') NOT NULL DEFAULT 'IDR' AFTER request_date,
  ADD COLUMN exchange_rate_usd_to_idr DECIMAL(30,12) NULL AFTER currency,
  ADD COLUMN exchange_rate_date DATE NULL AFTER exchange_rate_usd_to_idr;