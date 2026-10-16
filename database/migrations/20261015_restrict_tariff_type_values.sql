UPDATE fix_tariffs
SET tariff_type = 'QTY_CARGO'
WHERE tariff_type = 'RANGE';

UPDATE expenses_items
SET calculation_type = CASE
  WHEN calculation_type = 'PERCENTAGE' THEN 'VARIABLE'
  ELSE 'QTY_CARGO'
END
WHERE calculation_type IN ('QTY_RATE', 'PERCENTAGE', 'RANGE');

UPDATE quotation_items
SET tariff_type = 'QTY_CARGO'
WHERE tariff_type = 'RANGE';

UPDATE actual_costs
SET tariff_type = 'QTY_CARGO'
WHERE tariff_type = 'RANGE';

ALTER TABLE fix_tariffs
  MODIFY COLUMN tariff_type ENUM('FIXED', 'VARIABLE', 'QTY_CARGO') NULL;

ALTER TABLE expenses_items
  MODIFY COLUMN calculation_type ENUM('FIXED', 'VARIABLE', 'QTY_CARGO') NULL;

ALTER TABLE quotation_items
  MODIFY COLUMN tariff_type ENUM('FIXED', 'VARIABLE', 'QTY_CARGO') NULL;

ALTER TABLE actual_costs
  MODIFY COLUMN tariff_type ENUM('FIXED', 'VARIABLE', 'QTY_CARGO') NULL;
