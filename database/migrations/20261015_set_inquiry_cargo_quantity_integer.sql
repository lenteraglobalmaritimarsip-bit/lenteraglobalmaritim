UPDATE inquiries
SET cargo_quantity = ROUND(cargo_quantity)
WHERE cargo_quantity IS NOT NULL;

ALTER TABLE inquiries
  MODIFY COLUMN cargo_quantity BIGINT NULL;
