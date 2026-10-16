ALTER TABLE actual_costs
  ADD COLUMN entry_order INT NOT NULL DEFAULT 0 AFTER job_id;

UPDATE actual_costs ac
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY id) AS item_order
  FROM actual_costs
) ordered_items ON ordered_items.id = ac.id
SET ac.entry_order = ordered_items.item_order;

ALTER TABLE actual_costs
  MODIFY COLUMN entry_order INT NOT NULL,
  ADD UNIQUE KEY uq_actual_costs_order (job_id, entry_order);
