# MARITIMPORT — SHIPPING AGENCY WORK PORTAL

Portal kerja Shipping Agency berbasis React + TypeScript + Vite.

## Alur utama

START → SALES / INQUIRY → QUOTATION (EPDA) → MANAGER APPROVAL → OPERATIONS / FDA → PRINCIPAL INVOICE → CLOSING

**Aturan utama:** 1 Job / Vessel Call = 1 Job ID. Nomor baru mencantumkan branch dan tahun, contoh `VC-JKT-2026-0001`; nomor lama tetap berlaku untuk riwayat.

Inquiry yang belum masuk approval dapat dikoreksi oleh Sales dari cabang pembuatnya dengan alasan wajib; Job ID tetap. Job yang tidak dapat dipakai lagi dibatalkan sebagai VOID, bukan dihapus, sehingga nomor, data, alasan, waktu, dan pembatalnya tetap menjadi riwayat audit. Registry nomor Job menyimpan semua nomor yang pernah diterbitkan agar tidak digunakan kembali. Untuk database yang sudah berjalan, terapkan migrasi `database/migrations/20261017_add_vessel_call_void_fields.sql` dan `database/migrations/20261017_add_job_call_number_registry.sql`.

Menu **Sales > Quotes > Buat PDA** menyediakan form PDA Crew dengan nomor otomatis berformat `xxxx/PDA-LGM-ttt/mm/yyyy` (`ttt` mengikuti branch user aktif). Urutan nomor dimulai dari `0001` setiap tahun untuk masing-masing branch. Data header, rincian item, dan isian item yang belum ditambahkan disimpan otomatis ke MariaDB saat entry; draft dimuat kembali saat form dibuka untuk job yang sama.

Nomor EPDA, FDA, PDA, FPDA, Job/Inquiry, payment request, dan payment voucher menyertakan kode branch serta memiliki penomoran branch masing-masing. Master branch menggunakan ID internal tetap dan kode untuk nomor dokumen: 001/JKT/Jakarta, 002/BJM/Banjarmasin, 003/SBY/Surabaya, 004/MKS/Makassar, 005/SRG/Semarang, dan 006/BTM/Batam. ID tidak berubah atau dipakai ulang; kode branch tidak diubah tanpa migrasi terkontrol karena sudah tercetak dalam nomor dokumen. Approval Manager OPS tetap satu approval per Job dan hanya dapat diproses oleh Manager pada branch Job tersebut. Untuk database lama, jalankan `database/migrations/20261024_add_branch_finance_scope.sql`, kemudian `database/migrations/20261024_add_branch_master.sql`. Nilai lama yang tidak cocok dengan kode atau nama di master perlu dipetakan oleh Admin. Rekening lama yang pemilik branch-nya tidak dapat disimpulkan tetap perlu ditetapkan di Admin > Bank Account. Saldo kas, rekening yang tersedia, dan rekap Finance dipisahkan menurut branch user.

Untuk koreksi Payment Voucher yang sudah dibayar, Finance dapat membuka **Error Correction** dari History Payable. Aksi ini wajib mencatat alasan dan rekening tujuan yang sudah diperbaiki, mempertahankan pembayaran dan nomor PV lama di riwayat, lalu mengembalikan request ke Accounts Payable. Pembayaran koreksi mendapat nomor PV baru; riwayat pembayaran lama dan baru tetap masuk ke laporan kas/keuangan. Satu voucher hanya dapat menjalani satu Error Correction. Sebelum memakai fitur pada database lama, terapkan `database/migrations/20261023_add_payment_voucher_error_correction.sql`.

Pembayaran Accounts Payable hanya dapat diproses dari rekening dengan mata uang yang sama dengan voucher. Atur currency setiap rekening di Master Bank Account. Untuk database lama, jalankan `database/migrations/20261023_add_bank_account_currency.sql` sebelum deployment; migrasi ini menetapkan rekening Mandiri `1200055755990` sebagai USD dan rekening Mandiri `1200055755883` serta BNI `2824121209` sebagai IDR.

Admin dapat membuat koreksi bertanda plus/minus melalui **Master Data → Penyesuaian Saldo Kas**. Koreksi berlaku pada saldo awal sejak tanggal efektif (minimal 22 Oktober 2026) dan tidak mengubah tanggal sebelumnya. Catatan tersimpan permanen bersama rekening, currency, alasan, Admin pembuat, dan waktu; catatan tidak dapat diedit atau dihapus. Database lama harus menjalankan `database/migrations/20261023_add_cash_balance_adjustments.sql` sebelum fitur dirilis.

Chart of Accounts tetap tersedia di **Admin → Master Data → Chart of Accounts** dan datanya dipertahankan. Role Finance kembali menggunakan alur pembayaran dan penerimaan sebelum jurnal COA: proses AP tidak memerlukan mapping COA rekening atau jurnal, dan input AR tidak memerlukan baris jurnal. Penerimaan baru mendapat nomor bukti `RV{BRANCH}-{URUT}-{MMYY}` secara terpisah dari Payment Voucher `PV`; data penerimaan lama tetap tanpa nomor. Role **ACCOUNTING** adalah workspace pusat tanpa branch user khusus; ia melihat transaksi AP yang sudah dibayar dan AR yang sudah diterima dari seluruh branch, lalu menyusun draft/post jurnal COA terpisah yang tertaut ke transaksi sumber. Menu **Manajemen Aset** menampilkan register seluruh branch, impor 48 aset legacy dari `lgm_assets.sql`, estimasi penyusutan garis lurus, dan input aset baru dengan COA opsional. Posting jurnal memvalidasi debit = kredit, menghasilkan nomor jurnal per branch/tahun, dan mencatat audit; jurnal posted tidak dapat diubah. Untuk database lama, jalankan `20261029_add_accounting_role_and_journals.sql`, `20261030_add_receivable_voucher_numbers.sql`, lalu `20261031_add_accounting_assets.sql` dari folder migrations setelah master branch dan COA tersedia. Migrasi jurnal Finance `20261026` sampai `20261028` tetap tidak diperlukan untuk transaksi AP/AR Finance. Jika tabel/data lama sudah ada, jangan dihapus.

Role **DIRECTOR (Direktur)** adalah role pusat lintas branch yang dapat membaca dashboard keuangan, register aset, jurnal posted, Neraca, Laba Rugi, monitoring Vessel Call, log aktivitas, dan **Monitoring JOB Invoice**. Menu Monitoring JOB Invoice juga tersedia untuk Manager OPS setelah Management Vessel. Keduanya menampilkan FDA yang telah disetujui, termasuk histori job closed; nilai tagihan dan penerimaan dikonversi ke IDR, uang muka ditampilkan tersendiri, sisa tagihan mengurangi seluruh penerimaan FDA (tidak termasuk FPDA), dan status Lunas ditentukan dari saldo sisa nol. Umur tagihan dihitung dari tanggal approval FDA sampai saldo lunas atau sampai hari ini jika masih ada saldo. Menu bersifat baca-saja dan tidak memerlukan migrasi database. Direktur juga dapat menyetujui atau menolak Payment Voucher yang secara khusus ditujukan kepada akun tersebut; di luar keputusan voucher ini role Direktur tetap tidak dapat mengubah application state, jurnal, atau aset. Untuk database lama, jalankan `database/migrations/20261034_add_director_role.sql`; pada instalasi baru role sudah ada di `database/schema.sql`. Admin dapat menambahkan user Direktur tanpa memilih branch.

Email corporate dapat digunakan oleh beberapa user. Login hanya menggunakan username yang unik. Pada database lama, jalankan `database/migrations/20261039_allow_shared_user_emails.sql` sebelum deployment agar email tidak lagi dibatasi unik.

Pada menu **Finance → Request Payment → Created Payment**, kotak **Sign to approval** mengirim voucher ke satu user Manager OPS dari branch yang sama atau user DIRECTOR aktif. Setiap voucher hanya dapat diproses oleh user approver yang dipilih. Untuk database lama, jalankan `database/migrations/20261037_add_payment_voucher_approval_targets.sql` sebelum deployment.

## Standar pesan informasi

Pesan informasi, status, peringatan, dan validasi di semua role menggunakan gaya terpusat di `src/index.css`: panel biru muda, border biru, teks gelap, font Inter/system, ukuran 14 px, dan radius 8 px. Gunakan `role="status"` untuk pembaruan non-kritis dan `role="alert"` untuk kesalahan/validasi agar gaya dan aksesibilitas tetap konsisten. Notifikasi login menampilkan nama lengkap pemegang user dan menggunakan standar yang sama di seluruh role. Jangan menimpa warnanya dengan kelas role-specific.

## Cara menjalankan di Windows + VS Code

### 1. Install Node.js
Gunakan Node.js versi LTS.

### 2. Extract ZIP
Klik kanan file ZIP → **Extract All**. Jangan membuka file JSX/TSX satu per satu dari ZIP.

### 3. Buka folder di VS Code
VS Code → **File → Open Folder** → pilih folder yang berisi `package.json`.

### 4. Buka Terminal
Di VS Code pilih **Terminal → New Terminal**.

Pastikan terminal berada di folder project. Cek:

```powershell
npm -v
node -v
```

### 5. Install dependency
Jalankan satu kali:

```powershell
npm install
```

### 6. Jalankan portal

```powershell
npm run dev
```

Kemudian buka alamat yang ditampilkan Vite, biasanya:

`http://localhost:3000`

### 7. Menghentikan portal
Di terminal tekan `Ctrl + C`.

## Jika ingin menjalankan lagi
Tidak perlu `npm install` setiap kali. Cukup:

```powershell
npm run dev
```

## Jika muncul error dependency
Hapus folder `node_modules` dan file `package-lock.json`, lalu:

```powershell
npm install
npm run dev
```

## Catatan data
Data aplikasi disimpan di **MariaDB melalui PHP API** (`api/`). Browser tidak menyimpan data aplikasi (hanya cookie sesi HttpOnly).
Setup database, akun admin pertama, dan migrasi: lihat [api/README.md](api/README.md). Skema lengkap ada di `database/schema.sql`;
database lama cukup menjalankan file yang diperlukan di `database/migrations/` sesuai skema versi database. Untuk database yang sudah berjalan, jalankan `database/migrations/20261019_add_fix_tariff_port_name.sql` agar nama port pada Fix Tariff tersimpan dan dapat dipakai saat memuat tarif riwayat EPDA.

## Struktur modul
- Dashboard
- Sales / Inquiry
- Quotation — EPDA
- Manager Approval
- Operations / FDA
- Actual Cost
- AP / AR
- Principal Invoice
- Closing
- Master Data
- Job Hierarchy / Job Detail

## Struktur Job
Semua transaksi ditautkan ke Job/Vessel Call ID yang sama:

`VC-2026-0098`

├── Inquiry
├── Quotation
│   └── EPDA
├── Manager Approval
├── Operations / FDA
│   ├── Operational Data
│   ├── Actual Cost
│   └── AP / AR Monitoring
├── Principal Invoice
└── Closing


## UI Update
The portal now opens in the SALES workspace with a light enterprise dashboard inspired by the provided LGM Keagenan reference: blue top header, navy left navigation, KPI cards, inquiry/quotation panels, active vessel calls and quick actions. Other modules retain their functions and are visually skinned to the same light workspace.

## Login & Active User
Login memakai akun di tabel `users` (PHP session + CSRF). Akun admin pertama dibuat lewat `api/create_admin.php`
(password acak 8 digit dicetak satu kali); akun role lain dibuat di **Admin > Users**. Tidak ada akun/password demo.
User aktif tampil di header dan dapat logout.
PROJECT INI SUDAHH LIVE DI HOSTINGER https://lenteraglobalmaritim.agency/

## Login Info News
Info News pada halaman login dikelola oleh role **Admin** melalui menu **Info News**. Data menggunakan tabel `news_items`; hanya item aktif yang berada dalam rentang tanggal tampil untuk pengguna yang belum login. Admin dapat mengatur teks, tautan, atau gambar, serta jadwal tampil.

TAMBAH DATA VESSEL DI INQUIRY DAN MENGUPDATE DATABASE DAN MASTERDATA

PERUBAHAN TAMPILAN INFORMASI INQUIRY VESSEL 05/11/2026
