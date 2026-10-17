ALTER TABLE pda_documents
  ADD COLUMN approval_status ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REVISION_REQUIRED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN submitted_by VARCHAR(150) NULL,
  ADD COLUMN submitted_at DATETIME(3) NULL,
  ADD COLUMN reviewed_by VARCHAR(150) NULL,
  ADD COLUMN reviewed_at DATETIME(3) NULL,
  ADD COLUMN review_notes TEXT NULL,
  ADD INDEX idx_pda_documents_approval_status (approval_status);