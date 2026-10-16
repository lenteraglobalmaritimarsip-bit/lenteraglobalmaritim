DELETE quotation_items
FROM quotation_items
INNER JOIN quotations ON quotations.id = quotation_items.quotation_id
WHERE quotations.quote_type = 'PDA';

DELETE FROM quotations
WHERE quote_type = 'PDA';

ALTER TABLE quotations
  MODIFY COLUMN quote_type ENUM('EPDA') NOT NULL;

ALTER TABLE actual_costs
  CHANGE COLUMN pda_amount_estimated estimated_amount DECIMAL(30,12) NOT NULL DEFAULT 0;
