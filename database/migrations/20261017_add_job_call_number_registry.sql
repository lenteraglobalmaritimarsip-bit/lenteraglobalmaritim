CREATE TABLE IF NOT EXISTS job_call_number_registry (
  job_id VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  registered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO job_call_number_registry (job_id)
SELECT job_id FROM vessel_calls;

INSERT IGNORE INTO job_call_number_registry (job_id)
SELECT entity_id
FROM audit_logs
WHERE entity = 'VESSEL_CALL'
  AND entity_id IS NOT NULL
  AND entity_id LIKE 'VC-%';
