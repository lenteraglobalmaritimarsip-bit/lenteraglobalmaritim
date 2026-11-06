ALTER TABLE hr_employee_records
  ADD COLUMN photo_content LONGBLOB NULL AFTER branch_id,
  ADD COLUMN photo_mime_type VARCHAR(100) NULL AFTER photo_content;
