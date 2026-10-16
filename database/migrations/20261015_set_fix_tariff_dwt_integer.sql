UPDATE fix_tariffs
SET dwt = ROUND(dwt)
WHERE dwt IS NOT NULL;

ALTER TABLE fix_tariffs
  MODIFY COLUMN dwt INT NULL;
