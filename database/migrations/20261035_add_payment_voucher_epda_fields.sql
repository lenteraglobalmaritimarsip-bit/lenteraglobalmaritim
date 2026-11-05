ALTER TABLE payment_voucher_items
  ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT '' AFTER item_service,
  ADD COLUMN price DECIMAL(30,2) NOT NULL DEFAULT 0 AFTER category,
  ADD COLUMN quantity DECIMAL(12,3) NOT NULL DEFAULT 1 AFTER price,
  ADD COLUMN unit VARCHAR(60) NULL AFTER quantity,
  ADD COLUMN remarks TEXT NULL AFTER unit;

UPDATE payment_voucher_items
SET price = amount,
    quantity = 1
WHERE price = 0 AND amount <> 0;