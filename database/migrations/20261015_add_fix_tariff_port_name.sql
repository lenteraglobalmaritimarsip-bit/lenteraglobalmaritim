ALTER TABLE fix_tariffs
  ADD COLUMN port_name VARCHAR(150) NULL AFTER port_id;

UPDATE fix_tariffs AS tariff
LEFT JOIN ports AS port ON port.id = tariff.port_id
SET tariff.port_name = port.name
WHERE tariff.port_name IS NULL;
