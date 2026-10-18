ALTER TABLE payment_vouchers
  ADD COLUMN requested_payment_date DATE NULL AFTER request_date;

UPDATE payment_vouchers
SET requested_payment_date = request_date
WHERE requested_payment_date IS NULL;

ALTER TABLE payment_vouchers
  MODIFY COLUMN requested_payment_date DATE NOT NULL;