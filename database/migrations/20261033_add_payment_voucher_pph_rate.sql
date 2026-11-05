ALTER TABLE payment_voucher_items
  ADD COLUMN pph_rate DECIMAL(5,4) NOT NULL DEFAULT 0 AFTER pph23_applied;

UPDATE payment_voucher_items
SET pph_rate = 0.0200
WHERE pph23_applied = 1;
