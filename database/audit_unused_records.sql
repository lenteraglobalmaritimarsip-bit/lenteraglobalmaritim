-- MaritimPort: audit data master yang TIDAK DIPAKAI.
--
-- Hasil pemeriksaan skema (schema.sql vs api/*.php): seluruh 35 tabel dipakai oleh API,
-- jadi tidak ada tabel yang aman di-DROP. Yang bisa "tidak dipakai" adalah BARIS data master
-- yang tidak pernah dirujuk transaksi mana pun.
--
-- Skrip ini AMAN dijalankan: bagian 1 hanya SELECT. Penghapusan ada di bagian 2 dan
-- dikomentari. Sesuai AGENTS.md, riwayat transaksi (job, voucher, receivable, audit log)
-- TIDAK PERNAH dihapus oleh skrip ini.
--
-- Langkah: 1) BACKUP database dulu (mysqldump). 2) Jalankan bagian 1 dan periksa hasilnya.
-- 3) Hapus tanda komentar pada baris DELETE yang benar-benar ingin dijalankan.

-- ===== BAGIAN 1: LAPORAN (hanya baca) =====

-- Customer yang tidak dipakai oleh vessel call mana pun
SELECT 'customers' AS tabel, c.id, c.code, c.company_name AS nama
FROM customers c
LEFT JOIN vessel_calls vc ON vc.customer_id = c.id
WHERE vc.job_id IS NULL;

-- Vessel yang tidak dipakai oleh vessel call mana pun
SELECT 'vessels' AS tabel, v.id, v.imo_number AS kode, v.name AS nama
FROM vessels v
LEFT JOIN vessel_calls vc ON vc.vessel_id = v.id
WHERE vc.job_id IS NULL;

-- Port yang tidak dipakai vessel call dan tidak punya tarif, expenses item, atau zone
SELECT 'ports' AS tabel, p.id, p.code, p.name AS nama
FROM ports p
LEFT JOIN vessel_calls vc ON vc.port_id = p.id
WHERE vc.job_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM fix_tariffs ft WHERE ft.port_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM expenses_items ei WHERE ei.port_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM zones z WHERE z.port_id = p.id);

-- Vendor yang tidak pernah dipakai di payment voucher
SELECT 'vendor_partners' AS tabel, vp.id, NULL AS kode, vp.vendor_name AS nama
FROM vendor_partners vp
LEFT JOIN payment_vouchers pv ON pv.vendor_partner_id = vp.id
WHERE pv.id IS NULL;

-- Rekening bank yang tidak pernah dipakai di Accounts Receivable
SELECT 'bank_accounts' AS tabel, b.id, b.account_number AS kode, b.bank_name AS nama
FROM bank_accounts b
LEFT JOIN accounts_receivable_entries ar ON ar.bank_account_id = b.id
WHERE ar.id IS NULL;

-- Data draft/notifikasi milik user non-aktif (user_app_data)
SELECT 'user_app_data' AS tabel, d.user_id AS id, d.data_key AS kode, u.name AS nama
FROM user_app_data d
INNER JOIN users u ON u.id = d.user_id
WHERE u.status = 'INACTIVE';

-- ===== BAGIAN 2: PENGHAPUSAN (dikomentari; aktifkan satu per satu setelah backup) =====
-- Catatan: vendor_partners dan bank_accounts memakai ON DELETE SET NULL, tetapi baris di atas
-- dipilih karena tidak ada rujukan sama sekali, sehingga tidak ada riwayat yang berubah.
--
-- START TRANSACTION;
--
-- DELETE c FROM customers c
-- LEFT JOIN vessel_calls vc ON vc.customer_id = c.id
-- WHERE vc.job_id IS NULL;
--
-- DELETE v FROM vessels v
-- LEFT JOIN vessel_calls vc ON vc.vessel_id = v.id
-- WHERE vc.job_id IS NULL;
--
-- DELETE p FROM ports p
-- LEFT JOIN vessel_calls vc ON vc.port_id = p.id
-- WHERE vc.job_id IS NULL
--   AND NOT EXISTS (SELECT 1 FROM fix_tariffs ft WHERE ft.port_id = p.id)
--   AND NOT EXISTS (SELECT 1 FROM expenses_items ei WHERE ei.port_id = p.id)
--   AND NOT EXISTS (SELECT 1 FROM zones z WHERE z.port_id = p.id);
--
-- DELETE vp FROM vendor_partners vp
-- LEFT JOIN payment_vouchers pv ON pv.vendor_partner_id = vp.id
-- WHERE pv.id IS NULL;
--
-- DELETE b FROM bank_accounts b
-- LEFT JOIN accounts_receivable_entries ar ON ar.bank_account_id = b.id
-- WHERE ar.id IS NULL;
--
-- DELETE d FROM user_app_data d
-- INNER JOIN users u ON u.id = d.user_id
-- WHERE u.status = 'INACTIVE';
--
-- COMMIT;   -- ganti dengan ROLLBACK; jika hasilnya tidak sesuai harapan
