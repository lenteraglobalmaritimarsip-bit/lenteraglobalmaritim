-- Correct two historical 2026 journal dates using the revised workbook.
-- The correction moves 10 existing lines from 2026-05-30 to 2026-06-29.
-- It does not insert, delete, or change any journal lines.
-- Back up the database before running. Expected source rows must match exactly;
-- otherwise the guarded UPDATE changes nothing and reports STOP.

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_lgm_june26_headers;
DROP TEMPORARY TABLE IF EXISTS tmp_lgm_june26_lines;

CREATE TEMPORARY TABLE tmp_lgm_june26_headers (
  id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  source_key VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  old_journal_number VARCHAR(80) NOT NULL,
  new_journal_number VARCHAR(80) NOT NULL,
  old_entry_date DATE NOT NULL,
  new_entry_date DATE NOT NULL,
  old_description VARCHAR(250) NOT NULL,
  new_description VARCHAR(250) NOT NULL,
  expected_line_count INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

CREATE TEMPORARY TABLE tmp_lgm_june26_lines (
  source_key VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  coa_code VARCHAR(20) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  memo VARCHAR(250) NOT NULL,
  direction ENUM('DEBIT', 'CREDIT') NOT NULL,
  amount DECIMAL(30,2) NOT NULL,
  PRIMARY KEY (source_key, line_no)
) ENGINE=InnoDB;

INSERT INTO tmp_lgm_june26_headers
  (id, source_key, old_journal_number, new_journal_number, old_entry_date, new_entry_date, old_description, new_description, expected_line_count)
VALUES
  (
    'ACJ-HIST26-ae2c1ed3b7f418b69e3ddbaaf9cd',
    'lgm-gl-2026-ae2c1ed3b7f418b69e3ddbaaf9cd688c48de1553599fa2b223f0ffcc3501ce4a',
    'HIST/2026/PC-26-06-015-260530',
    'HIST/2026/PC-26-06-015-260629',
    '2026-05-30',
    '2026-06-29',
    'Historical GL | PC/26/06/015 | 2026-05-30',
    'Historical GL | PC/26/06/015 | 2026-06-29',
    2
  ),
  (
    'ACJ-HIST26-e792c6b496f5ee5967f03e5af11d',
    'lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609',
    'HIST/2026/GEN-260530-2213',
    'HIST/2026/GEN-260629-2213',
    '2026-05-30',
    '2026-06-29',
    'Historical GL tanpa nomor | GL All rows 2213-2220 | 2026-05-30',
    'Historical GL tanpa nomor | GL All rows 2213-2220 | 2026-06-29',
    8
  );

INSERT INTO tmp_lgm_june26_lines (source_key, line_no, coa_code, memo, direction, amount) VALUES
  ('lgm-gl-2026-ae2c1ed3b7f418b69e3ddbaaf9cd688c48de1553599fa2b223f0ffcc3501ce4a', 1, 'GA25003', 'Lapangan Badminton 4 Jam Tanggal 1, 8, 15, 22 & 29 Juli 2026', 'DEBIT', 2332000.00),
  ('lgm-gl-2026-ae2c1ed3b7f418b69e3ddbaaf9cd688c48de1553599fa2b223f0ffcc3501ce4a', 2, 'CA01001', 'Lapangan Badminton 4 Jam Tanggal 1, 8, 15, 22 & 29 Juli 2026', 'CREDIT', 2332000.00),
  ('lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609', 1, 'GA26001', 'Biaya Adm Bank Mandiri Juni USD 2026', 'DEBIT', 89280.00),
  ('lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609', 2, 'CA12001', 'Biaya Adm Bank Mandiri Juni USD 2026', 'CREDIT', 89280.00),
  ('lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609', 3, 'GA26001', 'Biaya Adm Bank BNI Juni USD 2026', 'DEBIT', 44640.00),
  ('lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609', 4, 'CA12002', 'Biaya Adm Bank BNI Juni USD 2026', 'CREDIT', 44640.00),
  ('lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609', 5, 'CA12002', 'Bunga Bank', 'DEBIT', 1249.92),
  ('lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609', 6, 'OT10001', 'Bunga Bank', 'CREDIT', 1249.92),
  ('lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609', 7, 'GA24002', 'Jasa Giro Bank BNI Juni USD 2026', 'DEBIT', 357.12),
  ('lgm-gl-2026-e792c6b496f5ee5967f03e5af11d9113ee880abfdf4729f462bbca109efec609', 8, 'CA12002', 'Jasa Giro Bank BNI Juni USD 2026', 'CREDIT', 357.12);

SET @lgm_june26_ready = (
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM tmp_lgm_june26_headers) = 2
    AND (SELECT COUNT(*) FROM tmp_lgm_june26_lines) = 10
    AND (
      SELECT COUNT(*)
      FROM tmp_lgm_june26_headers s
      JOIN accounting_journals j
        ON j.id = s.id
       AND j.source_type = 'HISTORICAL'
       AND j.source_key = s.source_key
       AND j.journal_number = s.old_journal_number
       AND j.entry_date = s.old_entry_date
       AND j.description = s.old_description
       AND j.status = 'POSTED'
    ) = 2
    AND (
      SELECT COUNT(*)
      FROM tmp_lgm_june26_lines x
      JOIN tmp_lgm_june26_headers s ON s.source_key = x.source_key
      JOIN accounting_journals j ON j.id = s.id
      JOIN accounting_journal_lines l ON l.journal_id = j.id AND l.line_no = x.line_no
      JOIN chart_of_accounts c ON c.id = l.coa_id AND c.code = x.coa_code
      WHERE l.memo = x.memo AND l.direction = x.direction AND l.amount = x.amount
    ) = 10
    AND (
      SELECT COUNT(*)
      FROM accounting_journal_lines l
      JOIN tmp_lgm_june26_headers s ON s.id = l.journal_id
    ) = 10
    AND NOT EXISTS (
      SELECT 1
      FROM accounting_journals j
      JOIN tmp_lgm_june26_headers s ON s.new_journal_number = j.journal_number
      WHERE j.id <> s.id
    )
  THEN 1 ELSE 0 END
);

UPDATE accounting_journals j
JOIN tmp_lgm_june26_headers s ON s.id = j.id
SET
  j.entry_date = s.new_entry_date,
  j.journal_number = s.new_journal_number,
  j.description = s.new_description
WHERE @lgm_june26_ready = 1
  AND j.source_type = 'HISTORICAL'
  AND j.source_key = s.source_key
  AND j.journal_number = s.old_journal_number
  AND j.entry_date = s.old_entry_date
  AND j.description = s.old_description
  AND j.status = 'POSTED';

SET @lgm_june26_updated = ROW_COUNT();

SELECT CASE
  WHEN @lgm_june26_ready = 1 AND @lgm_june26_updated = 2 THEN 'OK - 2 jurnal / 10 baris dipindahkan ke 29 Juni 2026; tidak ada jurnal baru'
  WHEN @lgm_june26_ready = 0 THEN 'STOP - data tidak cocok dengan prasyarat; tidak ada jurnal yang diubah'
  ELSE 'PERIKSA - jumlah jurnal yang berubah tidak sesuai; tinjau transaksi sebelum melanjutkan'
END AS correction_status,
@lgm_june26_updated AS updated_journals;

COMMIT;
