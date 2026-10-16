ALTER TABLE payment_vouchers
  ADD COLUMN payment_proof_data_url LONGTEXT NULL AFTER payment_total_amount;
