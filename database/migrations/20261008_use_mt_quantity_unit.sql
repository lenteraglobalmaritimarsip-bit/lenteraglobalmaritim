ALTER TABLE inquiries
  MODIFY COLUMN quantity_unit ENUM('MT', 'TON', 'MATRIX_TON') NULL;

UPDATE inquiries
SET quantity_unit = 'MT'
WHERE quantity_unit = 'MATRIX_TON';

ALTER TABLE inquiries
  MODIFY COLUMN quantity_unit ENUM('MT', 'TON') NULL;
