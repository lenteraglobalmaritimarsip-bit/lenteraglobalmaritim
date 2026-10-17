CREATE TABLE IF NOT EXISTS pda_documents (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  pda_no VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  branch_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_by_user_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency ENUM('IDR', 'USD') NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(30,12) NOT NULL DEFAULT 0,
  eta VARCHAR(32) NOT NULL DEFAULT '',
  etd VARCHAR(32) NOT NULL DEFAULT '',
  eta_remarks TEXT NOT NULL,
  etd_remarks TEXT NOT NULL,
  item_draft JSON NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_pda_documents_branch (branch_code),
  CONSTRAINT fk_pda_documents_job FOREIGN KEY (job_id) REFERENCES vessel_calls(job_id) ON DELETE CASCADE,
  CONSTRAINT fk_pda_documents_user FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pda_items (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  category ENUM('SIGN_ON_CREW', 'SIGN_OFF_CREW', 'CREW_MUTATION', 'MEDICAL_TREATMENT', 'CREW_BRIEFING') NOT NULL,
  description VARCHAR(250) NOT NULL,
  quantity DECIMAL(18,6) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit VARCHAR(80) NOT NULL DEFAULT '',
  price DECIMAL(30,12) NOT NULL DEFAULT 0 CHECK (price >= 0),
  remarks TEXT NOT NULL,
  vat_applied TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_pda_items_line (job_id, line_no),
  CONSTRAINT fk_pda_items_document FOREIGN KEY (job_id) REFERENCES pda_documents(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
