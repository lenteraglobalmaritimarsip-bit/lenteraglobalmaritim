ALTER TABLE pda_items
  DROP FOREIGN KEY fk_pda_items_document,
  DROP INDEX uq_pda_items_line,
  ADD COLUMN pda_type ENUM('SALES', 'FDA') NOT NULL DEFAULT 'SALES' AFTER job_id;

ALTER TABLE pda_documents
  DROP PRIMARY KEY,
  ADD COLUMN pda_type ENUM('SALES', 'FDA') NOT NULL DEFAULT 'SALES' AFTER job_id,
  ADD PRIMARY KEY (job_id, pda_type);

ALTER TABLE pda_items
  ADD UNIQUE KEY uq_pda_items_line (job_id, pda_type, line_no),
  ADD CONSTRAINT fk_pda_items_document FOREIGN KEY (job_id, pda_type)
    REFERENCES pda_documents(job_id, pda_type) ON DELETE CASCADE;