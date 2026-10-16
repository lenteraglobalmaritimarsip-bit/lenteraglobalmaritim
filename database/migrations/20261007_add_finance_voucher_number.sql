ALTER TABLE payment_vouchers
  ADD COLUMN voucher_number VARCHAR(50) NULL UNIQUE AFTER id;
