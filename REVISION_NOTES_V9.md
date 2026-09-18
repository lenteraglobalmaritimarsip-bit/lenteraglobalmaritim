# MaritimPort LGM ERP Work Portal – Revision V9

Basis revisi: `REVISI Menu dan alur portal kerja maritim.pdf`.

## Implemented
- Administrator Master Data disesuaikan dengan struktur PDF:
  - User
  - Customer
  - Port
  - Zone
  - Fix Tarif (Fixed / Variabel / Range)
  - Expenses Item (Fixed / Variabel / Qty_rate / Percentage / Range)
- Administrator: menu monitoring Vessel Calls.
- Sales / EPDA:
  - ETD dihapus dari form Inquiry.
  - EPDA result table menjadi No | Description | Amount | Remark.
  - Amount dapat ditampilkan dalam IDR / USD.
  - Nomor EPDA mengikuti `xxxx/EPDA-LGM/XX/2026`.
  - Tombol Lihat Hasil, Download Excel, Cetak / PDF, dan Kirim ke Manager OPS.
  - Output print menggunakan ukuran A4 dan header/footer LGM.
- FDA:
  - Sidebar hanya Dashboard, Job ID, Monitoring Vessel Calls.
  - Menu Actual Cost, Crew Change, Quotes View, Approval dihapus dari navigasi.
  - Job ID mengambil job yang sudah Approved Manager OPS.
  - FDA entry difokuskan pada Amount aktual dan tombol tambah item.
  - Output FDA memakai format nomor `xxxx/FDA-LGM/XX/2026` dan layout A4.
  - Lihat Hasil, Download Excel, Cetak / PDF tersedia setelah FDA final.
- Manager OPS:
  - Approval queue hanya menampilkan Job yang EPDA DAN PDA sama-sama `SUBMITTED`.
  - Guard database tetap mencegah approval jika salah satu belum `SUBMITTED`.
- Finance:
  - Struktur/menu dan gate tetap mengikuti workflow yang sudah ada; Finance baru dapat memproses setelah FDA Approved.
- Database workflow:
  - Guard FDA tidak lagi mewajibkan attachment/vendor untuk input Amount sederhana sesuai revisi PDF.

## Run
1. Extract ZIP.
2. Buka folder project di VS Code.
3. Jalankan `npm install`.
4. Jalankan `npm run dev` atau gunakan `START_PORTAL.bat`.
