ALTER TABLE inquiries
  ADD COLUMN created_by VARCHAR(200) NOT NULL DEFAULT '' AFTER status;

UPDATE inquiries
SET created_by = COALESCE(NULLIF(created_by, ''), created_by_name, '');
