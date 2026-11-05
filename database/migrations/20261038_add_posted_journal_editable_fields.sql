ALTER TABLE accounting_journal_lines
  ADD COLUMN report_overrides JSON NULL AFTER amount;
