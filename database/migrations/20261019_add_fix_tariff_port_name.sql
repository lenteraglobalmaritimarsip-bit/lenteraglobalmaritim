ALTER TABLE fix_tariffs
  ADD COLUMN IF NOT EXISTS port_name VARCHAR(150) NULL AFTER port_id;

UPDATE fix_tariffs AS tariff
LEFT JOIN ports AS port ON port.id = tariff.port_id
SET tariff.port_name = COALESCE(NULLIF(tariff.port_name, ''), port.name)
WHERE tariff.port_name IS NULL OR tariff.port_name = '';

ALTER TABLE fix_tariffs
  MODIFY COLUMN port_name VARCHAR(150) NOT NULL;
