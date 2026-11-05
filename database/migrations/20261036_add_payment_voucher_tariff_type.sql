ALTER TABLE payment_voucher_items
  ADD COLUMN tariff_type VARCHAR(20) NOT NULL DEFAULT 'FIXED' AFTER category;