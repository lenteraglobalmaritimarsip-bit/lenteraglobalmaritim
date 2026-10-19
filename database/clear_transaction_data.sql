-- Permanently clears transaction data while preserving users and master data.
-- Job IDs and PDA/FPDA numbers may be reused after this script runs.

START TRANSACTION;

DELETE FROM audit_logs;
DELETE FROM user_app_data;

DELETE FROM payment_voucher_items;
DELETE FROM payment_vouchers;

DELETE FROM principal_receipts;
DELETE FROM principal_invoices;
DELETE FROM closing_records;
DELETE FROM accounts_receivable_entries;
DELETE FROM ar_items;
DELETE FROM ap_items;

DELETE FROM pda_items;
DELETE FROM pda_documents;

DELETE FROM quotation_items;
DELETE FROM quotations;
DELETE FROM fda_items;
DELETE FROM fda_records;
DELETE FROM statements_of_fact;
DELETE FROM operational_data;
DELETE FROM manager_approvals;
DELETE FROM crew_members;
DELETE FROM crew_change_plans;
DELETE FROM inquiries;

DELETE FROM job_call_number_registry;
DELETE FROM vessel_calls;

DELETE FROM pda_number_sequences;
DELETE FROM fpda_number_sequences;

COMMIT;