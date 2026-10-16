ALTER TABLE expenses_items
  ADD COLUMN port_name VARCHAR(150) NULL AFTER port_id;

UPDATE expenses_items AS expense
LEFT JOIN ports AS port ON port.id = expense.port_id
SET expense.port_name = port.name
WHERE expense.port_name IS NULL;
