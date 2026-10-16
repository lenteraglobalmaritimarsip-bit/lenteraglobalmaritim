ALTER TABLE payment_vouchers
  ADD COLUMN payment_surcharge DECIMAL(30,2) NOT NULL DEFAULT 0 AFTER paid_at,
  ADD COLUMN payment_other_expenses DECIMAL(30,2) NOT NULL DEFAULT 0 AFTER payment_surcharge,
  ADD COLUMN payment_description TEXT NULL AFTER payment_other_expenses,
  ADD COLUMN payment_total_amount DECIMAL(30,2) NOT NULL DEFAULT 0 AFTER payment_description;
