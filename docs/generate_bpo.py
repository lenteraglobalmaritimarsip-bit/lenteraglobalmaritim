from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "BPO_Panduan_Proses_dan_Operasional_MaritimPort.pdf"
NAVY = colors.HexColor("#10243A")
BLUE = colors.HexColor("#1769AA")
CYAN = colors.HexColor("#1AA6B7")
PALE = colors.HexColor("#EAF3FA")
PALE_CYAN = colors.HexColor("#E9F7F8")
INK = colors.HexColor("#203040")
MUTED = colors.HexColor("#5D6B78")
LINE = colors.HexColor("#D5DEE7")
WHITE = colors.white


def register_fonts():
    candidates = [
        (Path(r"C:\Windows\Fonts\arial.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")),
        (Path(r"C:\Windows\Fonts\segoeui.ttf"), Path(r"C:\Windows\Fonts\segoeuib.ttf")),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("Guide", str(regular)))
            pdfmetrics.registerFont(TTFont("Guide-Bold", str(bold)))
            return
    raise FileNotFoundError("Font Arial or Segoe UI was not found in C:\\Windows\\Fonts.")


register_fonts()


class GuideDocTemplate(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=19 * mm,
            rightMargin=19 * mm,
            topMargin=20 * mm,
            bottomMargin=17 * mm,
            title="BPO MaritimPort - Panduan Proses Bisnis dan Operasional",
            author="PT Lentera Global Maritim",
            subject="Business Process Overview dan panduan pengoperasian portal MaritimPort",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="normal",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="guide", frames=[frame], onPage=self.draw_page),
            ]
        )

    def draw_page(self, canvas, doc):
        page_width, page_height = A4
        canvas.saveState()
        if doc.page == 1:
            canvas.setFillColor(NAVY)
            canvas.rect(0, page_height - 67 * mm, page_width, 67 * mm, fill=1, stroke=0)
            canvas.setFillColor(CYAN)
            canvas.rect(0, page_height - 69 * mm, page_width, 2 * mm, fill=1, stroke=0)
            canvas.setFillColor(colors.HexColor("#D6E9F5"))
            canvas.setFont("Guide-Bold", 9)
            canvas.drawString(21 * mm, page_height - 16 * mm, "PT LENTERA GLOBAL MARITIM")
        else:
            canvas.setStrokeColor(LINE)
            canvas.setLineWidth(0.5)
            canvas.line(19 * mm, page_height - 13 * mm, page_width - 19 * mm, page_height - 13 * mm)
            canvas.setFont("Guide-Bold", 7.5)
            canvas.setFillColor(NAVY)
            canvas.drawString(19 * mm, page_height - 10 * mm, "MARITIMPORT  |  PANDUAN PROSES BISNIS & OPERASIONAL")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(19 * mm, 12 * mm, page_width - 19 * mm, 12 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Guide", 7.5)
        canvas.drawString(19 * mm, 8 * mm, "Dokumen kerja internal  |  Versi 1.0  |  25 Oktober 2026")
        canvas.drawRightString(page_width - 19 * mm, 8 * mm, f"Halaman {doc.page}")
        canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", fontName="Guide-Bold", fontSize=27, leading=33,
    textColor=WHITE, alignment=TA_LEFT, spaceAfter=5 * mm,
))
styles.add(ParagraphStyle(
    name="CoverSub", fontName="Guide", fontSize=13, leading=19,
    textColor=colors.HexColor("#D7E7F2"), alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name="CoverMeta", fontName="Guide-Bold", fontSize=9, leading=14,
    textColor=INK, alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name="H1Guide", fontName="Guide-Bold", fontSize=18, leading=23,
    textColor=NAVY, spaceBefore=1 * mm, spaceAfter=3 * mm, keepWithNext=True,
))
styles.add(ParagraphStyle(
    name="H2Guide", fontName="Guide-Bold", fontSize=11.5, leading=15,
    textColor=BLUE, spaceBefore=3 * mm, spaceAfter=1.4 * mm, keepWithNext=True,
))
styles.add(ParagraphStyle(
    name="BodyGuide", fontName="Guide", fontSize=9, leading=13,
    textColor=INK, spaceAfter=2 * mm,
))
styles.add(ParagraphStyle(
    name="SmallGuide", fontName="Guide", fontSize=7.7, leading=10.5,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="SmallBoldGuide", fontName="Guide-Bold", fontSize=7.7, leading=10.5,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="CellHeadGuide", fontName="Guide-Bold", fontSize=7.7, leading=10,
    textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="CalloutGuide", fontName="Guide", fontSize=8.5, leading=12,
    textColor=NAVY,
))
styles.add(ParagraphStyle(
    name="StepNumGuide", fontName="Guide-Bold", fontSize=9, leading=12,
    textColor=BLUE, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="CenterGuide", fontName="Guide", fontSize=9, leading=12,
    textColor=INK, alignment=TA_CENTER,
))


def p(text, style="BodyGuide"):
    return Paragraph(text, styles[style])


def bullet(text):
    return p(f"<font color='{BLUE}'><b>-</b></font>&nbsp; {text}")


def heading(title, subtitle=None):
    result = [p(title, "H1Guide")]
    if subtitle:
        result.append(p(subtitle, "BodyGuide"))
    return result


def grid(headers, rows, widths, repeat=1):
    data = [[p(str(value), "CellHeadGuide") for value in headers]]
    for row in rows:
        data.append([
            value if isinstance(value, (Paragraph, Table)) else p(str(value), "SmallGuide")
            for value in row
        ])
    table = Table(data, colWidths=widths, repeatRows=repeat, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#F5F8FB")]),
    ]))
    return table


def callout(title, body, fill=PALE):
    box = Table(
        [[p(f"<b>{title}</b><br/>{body}", "CalloutGuide")]],
        colWidths=[172 * mm],
    )
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.8, BLUE if fill == PALE else CYAN),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return box


def steps(items):
    data = []
    for number, title, detail in items:
        data.append([
            p(str(number), "StepNumGuide"),
            p(f"<b>{title}</b><br/>{detail}", "SmallGuide"),
        ])
    table = Table(data, colWidths=[10 * mm, 162 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), PALE),
        ("BOX", (0, 0), (0, -1), 0.5, LINE),
        ("LINEBELOW", (1, 0), (-1, -2), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


story = []

# Cover
story += [Spacer(1, 27 * mm)]
story += [
    p("BPO<br/>MARITIMPORT", "CoverTitle"),
    p("Business Process Overview<br/>dan Panduan Pengoperasian", "CoverSub"),
    Spacer(1, 14 * mm),
]
story.append(callout(
    "Tujuan dokumen",
    "Menjelaskan perjalanan satu pekerjaan kapal dari permintaan layanan sampai penutupan, "
    "siapa melakukan apa, serta langkah operasional menggunakan portal MaritimPort.",
))
story += [Spacer(1, 10 * mm)]
story.append(grid(
    ["Identitas dokumen", "Keterangan"],
    [
        ["Nama sistem", "MaritimPort - Shipping Agency Work Portal"],
        ["Organisasi", "PT Lentera Global Maritim"],
        ["Versi panduan", "1.0"],
        ["Tanggal", "25 Oktober 2026"],
        ["Pembaca", "Sales, Manager OPS, FDA, Finance, Accounting, dan Admin"],
    ],
    [48 * mm, 124 * mm],
))
story += [Spacer(1, 7 * mm)]
story.append(p(
    "Panduan ini menerangkan fungsi portal dan urutan kerja yang tersedia pada aplikasi. "
    "Batas kewenangan, dokumen pendukung, SLA, pajak, dan kebijakan keuangan tetap mengikuti "
    "ketentuan perusahaan yang berlaku.",
    "SmallGuide",
))
story.append(PageBreak())

# Page 2: overview and roles
story += heading(
    "1. Ringkasan proses bisnis",
    "Satu kunjungan kapal dikelola sebagai satu Job/Vessel Call ID. Seluruh dokumen dan aktivitas "
    "ditautkan ke ID tersebut agar data komersial, operasi, pembayaran, penerimaan, dan akuntansi "
    "dapat ditelusuri bersama.",
)
flow_rows = [
    ["1", "Sales", "Inquiry > Job ID > EPDA / quotation", "Kebutuhan layanan dan estimasi biaya"],
    ["2", "Manager OPS", "Review quotation > persetujuan", "Keputusan sebelum pekerjaan diteruskan"],
    ["3", "FDA / OPS", "Data operasi > biaya aktual > FDA", "Realisasi dan pertanggungjawaban biaya"],
    ["4", "Manager OPS", "Review FDA dan permintaan pembayaran", "Kontrol dan persetujuan berjenjang"],
    ["5", "Finance", "AP / pembayaran vendor > invoice principal > AR", "Pengeluaran dan penagihan/penerimaan"],
    ["6", "Accounting", "Inbox transaksi > draft / posting jurnal > laporan", "Pencatatan COA dan pelaporan"],
    ["7", "Finance", "Rekonsiliasi > JOB Closing", "Penyelesaian siklus pekerjaan"],
]
story.append(grid(
    ["Urut", "Pemilik proses", "Alur utama", "Hasil / titik serah"],
    flow_rows,
    [12 * mm, 30 * mm, 72 * mm, 58 * mm],
))
story += [Spacer(1, 3 * mm), p("Peran dan tanggung jawab", "H2Guide")]
story.append(grid(
    ["Role aplikasi", "Tanggung jawab pokok", "Batas cakupan"],
    [
        ["ADMIN", "Mengelola akun, master data, cabang, bank, COA, dan pengaturan data master.", "Administrasi sistem; bukan pengganti approval transaksi."],
        ["SALES", "Mencatat Inquiry, membuat EPDA/PDA, memantau Job.", "Inquiry dan dokumen Sales mengikuti cabang pemilik."],
        ["MANAGER_OPS", "Review/approval quotation, FDA/PDA, serta voucher sesuai menu approval.", "Approval Job OPS mengikuti cabang Job."],
        ["FDA", "Mengisi data FDA/biaya aktual dan membuat/mengelola permintaan pembayaran.", "Umumnya bekerja pada Job cabang yang sudah disetujui Manager."],
        ["FINANCE", "Mengelola AP, pembayaran, AR/penerimaan, invoice, rekap, dan penutupan Job.", "Saldo, rekening, dan rekap Finance mengikuti cabang user."],
        ["ACCOUNTING", "Menyusun jurnal COA dari transaksi AP/AR yang memenuhi syarat; mengelola aset dan laporan.", "Workspace pusat lintas cabang."],
    ],
    [31 * mm, 91 * mm, 50 * mm],
))
story.append(PageBreak())

# Page 3: prerequisites and controls
story += heading(
    "2. Sebelum mulai bekerja",
    "Siapkan akses dan data pendukung terlebih dahulu. Menu yang terlihat menyesuaikan role; bila menu tidak tersedia, minta Admin memeriksa akun dan penetapan cabang.",
)
story += [
    p("Prasyarat pengguna", "H2Guide"),
    bullet("Gunakan akun pribadi yang aktif. Pastikan nama, role, dan branch pada header sudah sesuai sebelum mencatat transaksi."),
    bullet("Masuk dengan username/email dan password yang diberikan Admin. Keluar dari portal setelah selesai, khususnya pada komputer bersama."),
    bullet("Portal harus terhubung ke PHP API dan MariaDB. Jika data gagal dimuat atau pesan database gagal menyimpan muncul, hentikan proses transaksi dan hubungi Admin."),
    bullet("Perubahan data disimpan ke database melalui API; aplikasi tidak menggunakan penyimpanan lokal browser sebagai cadangan."),
    p("Master data yang perlu tersedia", "H2Guide"),
]
story.append(grid(
    ["Master", "Dipakai untuk", "Pemeriksaan sebelum transaksi"],
    [
        ["Customer / Principal", "Inquiry, quotation, invoice, dan penerimaan.", "Nama badan usaha dan kontak benar."],
        ["Vessel, Port, Zone", "Identitas kapal dan lokasi pelayanan.", "Nama kapal, port, parameter kapal, dan lokasi sesuai dokumen."],
        ["Fix Tariff / Expenses Item", "Estimasi EPDA serta pencatatan biaya.", "Kategori, mata uang/rate, basis perhitungan, dan tarif terbaru."],
        ["Vendor Partner", "Permintaan pembayaran kepada vendor.", "Nama penerima dan rincian vendor sesuai bukti."],
        ["Bank Account", "Pembayaran AP dan pencatatan penerimaan.", "Pemilik branch dan currency rekening sudah ditetapkan."],
        ["Chart of Accounts", "Jurnal Accounting.", "Akun COA aktif tersedia; Finance AP/AR tidak memerlukan mapping jurnal COA."],
        ["Users / Branch", "Akses dan pembatasan cakupan kerja.", "Role dan branch user sesuai tanggung jawab."],
    ],
    [37 * mm, 64 * mm, 71 * mm],
))
story += [
    Spacer(1, 3 * mm),
    callout(
        "Aturan integritas data",
        "Jangan menghapus Job/dokumen atau menggunakan ulang nomor. Jika Job tidak dapat dilanjutkan, "
        "gunakan status VOID/pembatalan sesuai kewenangan dan simpan alasan. Riwayat transaksi harus "
        "tetap dapat ditelusuri.",
    ),
    PageBreak(),
]

# Page 4: Sales
story += heading(
    "3. Alur Sales - Inquiry dan quotation EPDA",
    "Sales membuka pekerjaan dan menyiapkan estimasi biaya. Periksa bahwa satu kapal/kunjungan hanya memiliki satu Job ID.",
)
story += [
    p("A. Membuat Inquiry / Job Call", "H2Guide"),
    steps([
        (1, "Buka menu Inquiries", "Pilih <b>Sales &gt; Inquiries</b>, lalu pilih aksi untuk membuat Inquiry baru."),
        (2, "Isi data kunjungan kapal", "Pilih Customer/Principal, Vessel, Port/lokasi, purpose of call, ETA/ETD, mata uang, dan informasi lain yang diminta form. Pastikan tanggal dan waktu mengikuti sumber resmi."),
        (3, "Simpan dan catat Job ID", "Simpan Inquiry. Sistem menerbitkan nomor Job/Inquiry dengan branch dan tahun, misalnya <b>VC-JKT-2026-0001</b>. Gunakan nomor ini sebagai rujukan semua tim."),
        (4, "Periksa hasil simpan", "Cari Job pada daftar/Monitoring Vessel Calls dan pastikan kapal, customer, cabang, ETA/ETD, serta statusnya benar."),
        (5, "Koreksi jika belum diajukan approval", "Inquiry yang belum masuk approval dapat dikoreksi oleh Sales cabang pembuat dengan alasan wajib; Job ID dipertahankan. Job yang batal diproses sebagai VOID, bukan dihapus."),
    ]),
    p("B. Menyusun quotation EPDA", "H2Guide"),
    steps([
        (1, "Pilih Job yang benar", "Buka <b>Sales &gt; Quotes</b>, pilih Job ID, dan pastikan identitas kapal, principal, port, serta jadwal sesuai Inquiry."),
        (2, "Lengkapi jadwal dan komersial", "Isi tanggal EPDA, mata uang dan kurs bila relevan, serta ETA/ETD dan keterangannya. Periksa mata uang konsisten untuk seluruh item."),
        (3, "Masukkan estimasi biaya", "Pilih item dari Expenses Item/Fix Tariff bila tersedia; cek basis tarif, kuantitas, GRT/parameter kapal, rate, pajak, dan remarks. Jika perlu item manual, pastikan deskripsi dan nilai dapat ditelusuri."),
        (4, "Periksa rincian", "Cocokkan setiap item dengan penawaran/ketentuan terkait; pastikan subtotal dan total EPDA masuk akal. Tinjau kembali kurs dan perlakuan VAT/PPH sesuai kebijakan."),
        (5, "Simpan lalu kirim", "Simpan EPDA. Setelah siap, pilih <b>Kirim ke Manager OPS</b>. Status menjadi SUBMITTED dan dokumen terkunci untuk perubahan biasa sampai proses review selesai."),
        (6, "Pantau keputusan", "Periksa menu Quotes/Monitoring. Jika diminta koreksi, tindak lanjuti melalui alur review yang tersedia; jangan membuat Job duplikat hanya untuk memperbaiki quotation."),
    ]),
    Spacer(1, 2 * mm),
    callout(
        "Nomor dokumen",
        "Seri Inquiry/Job, EPDA, FDA, PDA, dan FPDA dipisahkan per cabang; sebagian seri juga dipisahkan per tahun. "
        "Gunakan nomor yang diterbitkan sistem, bukan nomor buatan manual.",
    ),
    PageBreak(),
]

# Page 5: Manager + PDA
story += heading(
    "4. Alur Manager OPS - review dan approval",
    "Manager OPS bertindak sebagai titik kontrol sebelum pekerjaan bergerak ke pelaksanaan dan sebelum voucher dibayar.",
)
story += [
    p("Review EPDA dan Job", "H2Guide"),
    steps([
        (1, "Buka Quotes Review / Approval Center", "Gunakan antrean approval untuk menemukan quotation berstatus menunggu. Pastikan Job berasal dari cabang yang menjadi kewenangan Anda."),
        (2, "Buka detail dokumen", "Tinjau identitas Job, vessel, principal, port, jadwal, mata uang, item, basis/rate, total, dan catatan pendukung."),
        (3, "Ambil keputusan", "Gunakan aksi review yang tersedia di aplikasi. Bila menyetujui, pastikan keputusan tepat dan Job yang dipilih benar; bila perlu perbaikan, ikuti aksi/keterangan yang tampil dan koordinasikan koreksinya."),
        (4, "Pastikan status tercatat", "Setelah aksi selesai, periksa status dan nama/riwayat approval pada Job. Jangan menginstruksikan operasi berdasarkan dokumen yang masih menunggu keputusan."),
    ]),
    p("Approval FDA/PDA/FPDA dan voucher", "H2Guide"),
    bullet("Gunakan antrean approval pada Manager OPS untuk memeriksa dokumen FDA/PDA/FPDA yang diajukan; bandingkan hasil aktual, ringkasan biaya, dan dokumen sumber."),
    bullet("Gunakan <b>Voucher Approval</b> untuk meninjau request pembayaran, vendor, rincian Job/dokumen, nilai, currency, dan alasan sebelum memberikan persetujuan."),
    bullet("Persetujuan Manager tidak sama dengan pembayaran. Setelah voucher disetujui, Finance masih harus mengisi detail transfer, rekening yang sesuai currency, dan bukti pembayaran."),
    p("Jalur pekerjaan crew - PDA / FPDA", "H2Guide"),
    steps([
        (1, "Sales menyiapkan PDA", "PDA Crew dibuat pada menu Quotes untuk Job yang memenuhi kebutuhan crew. EPDA harus tersedia sebelum PDA dibuka; data draft dapat tersimpan otomatis."),
        (2, "Manager meninjau PDA", "Periksa draft/preview dan rincian item pada antrean PDA. Pastikan nomor dan Job tepat sebelum memutuskan."),
        (3, "FDA melanjutkan menjadi FPDA", "FDA dapat melanjutkan item dari PDA Sales untuk Job yang sama; hindari menyalin item yang sama dua kali."),
        (4, "Manager meninjau FPDA", "Periksa hasil akhir dan status persetujuan. Finance menggunakan dokumen yang sudah disetujui untuk proses invoice/keuangan terkait."),
    ]),
    Spacer(1, 2 * mm),
    callout(
        "Catatan kontrol",
        "Approval Manager OPS untuk Job adalah satu approval per Job dan mengikuti cabang Job. Pastikan antrian tidak diproses pada Job lintas cabang yang bukan kewenangan Anda.",
        fill=PALE_CYAN,
    ),
    PageBreak(),
]

# Page 6: FDA / operations
story += heading(
    "5. Alur FDA dan pelaksanaan operasi",
    "Setelah Job memperoleh approval yang diperlukan, FDA/OPS mencatat perkembangan pelaksanaan dan biaya aktual untuk dibandingkan dengan estimasi.",
)
story += [
    steps([
        (1, "Pilih Job yang telah disetujui", "Buka <b>FDA &gt; Inquiries</b> atau <b>Create FDA</b>. Pilih Job ID yang benar; cek vessel, customer, port, jadwal, dan approval sebelumnya."),
        (2, "Lengkapi informasi pelaksanaan", "Catat informasi yang diminta aplikasi untuk kejadian/aktivitas kapal. Gunakan sumber operasional resmi; periksa waktu dan keterangan agar dapat direkonsiliasi."),
        (3, "Catat actual cost", "Tambahkan item biaya aktual berdasarkan kategori dan master yang tersedia. Isi jumlah/rate, mata uang, kuantitas bila ada, VAT/PPH jika berlaku, vendor/remarks, dan referensi bukti sesuai field."),
        (4, "Rekonsiliasi dengan EPDA", "Bandingkan realisasi dan estimasi. Jelaskan selisih secara memadai, pastikan total dan kurs benar, serta pastikan item tidak tercatat ganda."),
        (5, "Siapkan FDA / FPDA", "Lengkapi informasi final, referensi biaya, jadwal dan dokumen pendukung yang diminta. Untuk alur crew, gunakan FPDA yang melanjutkan PDA Sales."),
        (6, "Pratinjau dan ajukan", "Gunakan preview/cetak untuk memeriksa dokumen. Setelah valid, ajukan untuk approval sesuai menu aplikasi. Dokumen yang sudah diajukan/approved dapat menjadi read-only."),
        (7, "Tindak lanjuti status", "Pantau status approval pada menu FDA dan Monitoring Vessel Calls. Sampaikan status yang benar kepada Finance; jangan menganggap draft/submitted sebagai dokumen final yang disetujui."),
    ]),
    p("Request payment untuk pengeluaran operasional", "H2Guide"),
    steps([
        (1, "Buka Created Payment", "Pengguna FDA atau Finance yang diberi tugas dapat membuka menu Request Payment &gt; Created Payment dan memulai request."),
        (2, "Isi kepala request", "Pilih tanggal dan currency; pilih vendor serta jenis konteks (Job/Vessel atau operasional sesuai kebutuhan form)."),
        (3, "Tambahkan item dan referensi", "Cantumkan Job, dokumen FDA/FPDA bila relevan, principal/beneficiary, jasa, jumlah, serta opsi pajak sesuai dokumen sumber."),
        (4, "Simpan dan pantau", "Simpan request, catat nomor request, dan pantau status. Request menunggu review/approval Manager OPS sebelum dibayar."),
    ]),
    Spacer(1, 3 * mm),
    callout(
        "Jangan melompati approval",
        "Request pembayaran dan pencatatan biaya aktual merupakan catatan yang berbeda. Jangan menganggap item FDA otomatis sudah dibayar; gunakan riwayat voucher dan bukti transaksi Finance untuk memastikan pembayaran.",
    ),
    PageBreak(),
]

# Page 7: payment finance
story += heading(
    "6. Alur Finance - Accounts Payable dan pembayaran",
    "Finance mengubah voucher yang sudah disetujui menjadi transaksi pembayaran, lalu memantau riwayat untuk rekonsiliasi kas.",
)
story += [
    p("A. Review AP dan bayar voucher", "H2Guide"),
    steps([
        (1, "Buka Input Payable / View Payable", "Di menu Accounts Payable, cari request yang sudah disetujui. Baca nomor request/voucher, cabang, vendor, Job, dokumen, rincian item, jumlah, dan currency."),
        (2, "Pastikan kesiapan pembayaran", "Cocokkan nilai dengan approval, faktur/tagihan vendor, tanggal pembayaran, perlakuan pajak, dan otorisasi internal. Minta klarifikasi bila ada ketidaksesuaian."),
        (3, "Pilih rekening yang benar", "Pilih rekening milik branch yang sesuai dan memiliki currency sama dengan voucher. Aplikasi membatasi pilihan rekening menurut currency; jangan mengakali pembatasan."),
        (4, "Isi detail pembayaran", "Masukkan tanggal pembayaran, deskripsi/referensi transfer, surcharge atau biaya lain jika berlaku. Sertakan bukti pembayaran apabila diminta/tersedia."),
        (5, "Simpan pembayaran", "Simpan transaksi dan pastikan sistem memberi konfirmasi/nomor Payment Voucher (PV). Jika pesan database gagal muncul, cek riwayat dahulu sebelum mencoba lagi agar tidak tercatat ganda."),
        (6, "Rekonsiliasi riwayat", "Buka History Payable/Payment History. Cocokkan voucher, rekening, jumlah, tanggal, referensi, dan bukti dengan mutasi bank."),
    ]),
    p("B. Rekap dan saldo kas", "H2Guide"),
    bullet("Gunakan Financial Overview, Saldo Kas, dan Rekap Keuangan untuk memeriksa transaksi berdasarkan periode/cabang yang tersedia."),
    bullet("Saldo rekening dan pilihan rekening mengikuti branch Finance. Pastikan bank account memiliki pemilik branch dan currency yang benar."),
    bullet("Koreksi saldo kas hanya dilakukan Admin melalui Penyesuaian Saldo Kas dengan tanda plus/minus, tanggal efektif, alasan, rekening, dan catatan yang permanen."),
    p("Nomor transaksi yang umum", "H2Guide"),
    grid(
        ["Dokumen", "Pola nomor (contoh format)", "Catatan"],
        [
            ["Request pembayaran", "OPS{BRANCH}-####-MMYY", "Nomor request; branch dan periode masuk ke seri."],
            ["Payment Voucher", "PV{BRANCH}-####-MMYY", "Nomor pembayaran; periksa pada bukti/riwayat."],
            ["Penerimaan AR", "RV{BRANCH}-{URUT}-{MMYY}", "Seri penerimaan terpisah dari PV."],
        ],
        [37 * mm, 58 * mm, 77 * mm],
    ),
    Spacer(1, 3 * mm),
    callout(
        "Bukti dan jejak audit",
        "Jangan membayar voucher yang belum disetujui. Simpan bukti transfer sesuai prosedur perusahaan dan pastikan riwayat aplikasi cocok dengan mutasi bank.",
        fill=PALE_CYAN,
    ),
    PageBreak(),
]

# Page 8: invoicing, AR, closing
story += heading(
    "7. Alur Finance - Invoice, penerimaan, dan closing",
    "Finance menggunakan dokumen FDA/FPDA yang sudah memenuhi persetujuan untuk invoice principal, mencatat penerimaan, dan menyelesaikan Job.",
)
story += [
    p("A. Menyiapkan Principal Invoice", "H2Guide"),
    steps([
        (1, "Buka JOB Invoice", "Cari Job yang siap ditagihkan. Untuk pekerjaan operasional gunakan dokumen FDA yang telah disetujui; untuk jalur crew gunakan FPDA yang memenuhi status persetujuan."),
        (2, "Periksa dasar tagihan", "Verifikasi principal, vessel, Job ID, nomor FDA/FPDA, rincian, currency, kurs, total, potongan/pajak, serta advance payment yang sudah diterima."),
        (3, "Pratinjau dokumen", "Gunakan preview/print dan bandingkan seluruh nilai dengan dokumen final yang disetujui. Jangan menerbitkan invoice dari draft yang belum approved."),
        (4, "Terbitkan/kirim dan simpan referensi", "Ikuti proses penerbitan invoice perusahaan di menu yang tersedia. Catat tipe dan nomor invoice agar dapat dipilih saat input AR."),
    ]),
    p("B. Mencatat Accounts Receivable", "H2Guide"),
    steps([
        (1, "Buka Input Receivable", "Pilih Accounts Receivable &gt; Input Receivable. Tentukan Subject (Principal atau Operasional) sesuai tujuan penerimaan."),
        (2, "Pilih jenis dan referensi", "Untuk penerimaan principal, pilih principal, vessel, invoice FDA/FPDA, atau advance payment yang sesuai. Penerimaan operasional dapat dicatat tanpa JOB/Vessel invoice reference bila memang bukan penerimaan invoice principal."),
        (3, "Masukkan tanggal, rekening, dan nominal", "Pilih tanggal penerimaan dan rekening branch/currency yang benar. Masukkan nominal IDR/USD dan kurs yang berlaku; periksa total konversi."),
        (4, "Lampirkan bukti dan catatan", "Isi remark dan lampirkan foto bukti kas/bank sesuai ketentuan form. Pastikan nominal, tanggal, rekening dan nama pengirim cocok dengan bukti."),
        (5, "Simpan dan cocokkan", "Simpan penerimaan, catat nomor RV yang diterbitkan, lalu cek History Receivable dan mutasi bank."),
    ]),
    p("C. JOB Closing", "H2Guide"),
    steps([
        (1, "Rekonsiliasi Job", "Sebelum menutup, pastikan dokumen final, seluruh pembayaran AP, invoice, penerimaan/advance, selisih biaya, dan bukti pendukung telah diperiksa."),
        (2, "Konfirmasi saldo dan tindak lanjut", "Tinjau sisa tagihan, kewajiban vendor, refund/advance bila ada, serta item yang masih terbuka. Tindak lanjuti sesuai kebijakan perusahaan."),
        (3, "Tutup Job", "Buka JOB Closing, pilih Job yang tepat, tinjau ringkasan, lalu gunakan aksi closing yang tersedia setelah pihak berwenang menyatakan lengkap."),
        (4, "Verifikasi status", "Pastikan Job berstatus Closed dan tetap tersedia di Monitoring/riwayat. Closing adalah penanda penyelesaian, bukan perintah menghapus data."),
    ]),
    Spacer(1, 2 * mm),
    callout(
        "Penerimaan adalah catatan terpisah",
        "Invoice yang diterbitkan tidak otomatis berarti sudah dibayar. Catat uang masuk di AR, simpan buktinya, dan cocokkan penerimaan dengan invoice serta rekening.",
    ),
    PageBreak(),
]

# Page 9: accounting
story += heading(
    "8. Alur Accounting - jurnal, aset, dan laporan",
    "Workspace Accounting adalah fungsi pusat. Sumber yang tersedia mencakup transaksi AP yang sudah dibayar dan AR yang sudah diterima dari seluruh branch.",
)
story += [
    steps([
        (1, "Buka Dashboard Keuangan", "Tinjau ringkasan pusat dan gunakan Inbox & Jurnal COA untuk memproses sumber transaksi yang belum posted."),
        (2, "Filter dan pilih sumber", "Filter branch, status, tanggal, atau pencarian. Pilih transaksi PAYABLE (pengeluaran) atau RECEIVABLE (penerimaan), lalu buka rincian sumber."),
        (3, "Periksa sumber terlebih dahulu", "Cocokkan nomor sumber, tanggal, branch, counterparty, mata uang, kurs/nilai IDR, item, pajak, rekening, Job, dan dokumen referensi dengan bukti Finance."),
        (4, "Lengkapi jurnal", "Pilih COA aktif untuk setiap baris, isi memo, arah debit/kredit, dan jumlah. Pastikan tanggal serta keterangan jurnal menggambarkan transaksi."),
        (5, "Simpan draft bila belum final", "Simpan sebagai Draft apabila masih memerlukan pemeriksaan/konfirmasi. Kembali ke item berstatus Draft untuk melanjutkan."),
        (6, "Validasi lalu posting", "Pastikan total debit sama dengan total kredit dan akun/rincian benar. Posting setelah konfirmasi; sistem membuat nomor jurnal dan mencatat pelaku serta waktu."),
        (7, "Periksa hasil", "Tinjau Hasil Posted Jurnal, Neraca, dan Laba Rugi. Posted jurnal tidak dapat diedit; koreksi mengikuti prosedur akuntansi perusahaan yang menjaga jejak audit."),
    ]),
    p("Manajemen Aset", "H2Guide"),
    bullet("Gunakan menu Manajemen Aset untuk melihat register lintas cabang dan mencatat aset baru."),
    bullet("Sebelum menyimpan, verifikasi kode/nama aset, cabang, tanggal dan harga perolehan, umur manfaat, nilai residu, lokasi, status, serta COA bila diisi."),
    bullet("Nilai penyusutan bulanan adalah estimasi garis lurus yang dihitung aplikasi. Cocokkan dengan kebijakan akuntansi perusahaan sebelum pelaporan resmi."),
    bullet("Jangan mengubah/menghapus data aset historis hanya untuk menyesuaikan laporan; eskalasi selisih kepada Accounting/Admin."),
    Spacer(1, 3 * mm),
    callout(
        "Kontrol posting",
        "Posting jurnal adalah tindakan final dan tidak dapat diubah. Review bukti sumber, branch, periode, dan keseimbangan debit-kredit sebelum menekan aksi posting.",
        fill=PALE_CYAN,
    ),
    PageBreak(),
]

# Page 10: admin and routine checklist
story += heading(
    "9. Admin, monitoring, dan rutinitas kontrol",
    "Master data yang bersih mengurangi kesalahan pilihan transaksi. Perubahan master dan akses sebaiknya ditangani personel Admin yang ditunjuk.",
)
story += [
    p("Tugas Admin", "H2Guide"),
    bullet("Buat/kelola akun pengguna di Admin &gt; Users. Tetapkan role dan branch sesuai persetujuan atasan; nonaktifkan akses yang tidak lagi diperlukan."),
    bullet("Rawat Customer, Vessel, Port, Fix Tariff, Expenses Item, Vendor Partner, Bank Account, dan Chart of Accounts sebelum transaksi terkait dibuat."),
    bullet("Untuk rekening bank, tetapkan pemilik branch kantor dan currency yang benar; jangan menyamakan branch kantor pemilik rekening dengan lokasi fisik cabang bank."),
    bullet("Pantau Monitoring Vessel Calls dan jejak audit untuk membantu menemukan Job tertunda, dibatalkan, atau selesai."),
    bullet("Penyesuaian saldo kas dicatat dengan alasan dan tanggal efektif. Riwayat penyesuaian permanen; jangan mengubah bukti transaksi untuk menutupi selisih."),
    p("Checklist awal hari / sebelum memproses", "H2Guide"),
]
story.append(grid(
    ["Pemeriksaan", "Pertanyaan kontrol"],
    [
        ["Identitas", "Apakah Job ID, principal, kapal, port, dan branch benar?"],
        ["Status", "Apakah dokumen sumber sudah disubmit/approved sesuai langkah yang diperlukan?"],
        ["Nilai", "Apakah currency, kurs, pajak, jumlah, total, dan pembulatan sesuai sumber?"],
        ["Referensi", "Apakah nomor invoice, FDA/FPDA, request, voucher, atau receipt dapat ditelusuri?"],
        ["Bukti", "Apakah dokumen pendukung dapat dibaca dan sesuai tanggal/nilai transaksi?"],
        ["Penyimpanan", "Apakah ada konfirmasi berhasil simpan dan transaksi terlihat di daftar riwayat?"],
        ["Akses", "Apakah pelaksana benar-benar berada pada role/branch yang berwenang?"],
    ],
    [35 * mm, 137 * mm],
))
story += [
    Spacer(1, 4 * mm),
    p("Rutinitas penutupan hari", "H2Guide"),
    bullet("Perbarui status pekerjaan yang menjadi tanggung jawab Anda; catat alasan keterlambatan dan pihak yang harus menindaklanjuti."),
    bullet("Finance mencocokkan voucher dan penerimaan dengan mutasi bank. Manager memeriksa antrian approval yang tertunda."),
    bullet("Simpan nomor Job dan nomor dokumen dalam komunikasi internal; hindari mengirim kredensial melalui chat/email."),
    PageBreak(),
]

# Page 11: exceptions, technical note and glossary
story += heading(
    "10. Penanganan kendala dan istilah",
    "Jika proses terhenti, utamakan menjaga data dan menghindari duplikasi. Gunakan pesan kesalahan aplikasi dan referensi Job saat meminta bantuan.",
)
story.append(grid(
    ["Kondisi", "Tindakan pengguna"],
    [
        ["Tidak bisa login", "Periksa username/password dan hubungi Admin untuk bantuan/reset. Jangan berbagi password. Aplikasi/API dapat menonaktifkan akun setelah beberapa kegagalan login."],
        ["Menu/Job tidak terlihat", "Pastikan role, branch, Job ID, dan status approval. Minta Admin memeriksa penugasan; jangan mencoba masuk lewat akun orang lain."],
        ["Data gagal disimpan / API tidak tersedia", "Jangan mengulang pembayaran atau membuat Job baru. Catat pesan error dan nomor Job; periksa riwayat setelah koneksi pulih atau minta Admin mengecek database."],
        ["Nomor dokumen sudah muncul tetapi belum yakin tersimpan", "Cari nomor/Job pada daftar dan riwayat terlebih dahulu. Jangan menekan simpan berulang sebelum memastikan hasilnya."],
        ["Nilai atau referensi salah", "Hentikan pemrosesan dan hubungi pemilik data serta approver. Gunakan mekanisme koreksi/void yang tersedia dan berwenang; jangan menghapus transaksi atau mengganti nomor."],
        ["Approval tertunda", "Periksa antrean dan branch, hubungi approver, serta jangan melanjutkan ke langkah yang memerlukan status approved."],
        ["Selisih kas/rekening", "Cocokkan mutasi, payment/receipt history, tanggal, currency, kurs, dan bukti. Eskalasi kepada Finance lead/Admin; gunakan penyesuaian resmi bila diotorisasi."],
    ],
    [48 * mm, 124 * mm],
))
story += [
    p("Prasyarat teknis operasional", "H2Guide"),
    p(
        "Portal menggunakan PHP API dan MariaDB; penyimpanan data bisnis tidak dilakukan di browser. "
        "Untuk pemasangan lokal, Admin/IT menyiapkan layanan API/database, akun admin awal, konfigurasi API, "
        "dan akses portal. Panduan setup lengkap berada di <b>api/README.md</b>. Operator cukup menggunakan "
        "alamat portal dan akun yang disediakan, bukan mengubah konfigurasi server.",
        "BodyGuide",
    ),
    callout(
        "Catatan kesiapan deployment",
        "Dokumentasi teknis proyek menyatakan adapter sinkronisasi saat ini ditujukan untuk pengujian workflow lokal "
        "dengan satu sesi browser aktif. Sebelum penggunaan publik atau multi-user berskala produksi, minta IT menilai "
        "kesiapan sinkronisasi perubahan dan penegakan izin workflow di sisi server.",
    ),
    p("Glosarium singkat", "H2Guide"),
]
story.append(grid(
    ["Istilah", "Arti ringkas"],
    [
        ["Job / Vessel Call", "Nomor induk untuk satu pekerjaan/kunjungan kapal."],
        ["Inquiry", "Permintaan/rekaman awal pekerjaan yang dibuat Sales."],
        ["EPDA", "Estimasi biaya sebelum/untuk layanan; dasar review komersial."],
        ["FDA", "Dokumen biaya akhir/pengeluaran aktual untuk pekerjaan."],
        ["PDA / FPDA", "Proforma dan final disbursement pada jalur crew sesuai alur aplikasi."],
        ["AP / AR", "Accounts Payable (utang/pembayaran) dan Accounts Receivable (tagihan/penerimaan)."],
        ["COA / jurnal", "Chart of Accounts dan catatan debit-kredit untuk pembukuan."],
        ["Branch", "Cabang perusahaan pemilik pekerjaan atau transaksi; menjadi cakupan nomor/akses Finance."],
    ],
    [40 * mm, 132 * mm],
))
story += [Spacer(1, 3 * mm)]
story.append(p(
    "Acuan penyusunan: struktur menu dan role pada portal MaritimPort; README.md dan api/README.md; "
    "serta komponen workflow Sales, Manager OPS, FDA, Finance, Accounting, dan Admin yang ada di repository.",
    "SmallGuide",
))


doc = GuideDocTemplate(str(OUTPUT))
doc.build(story)
print(f"Created {OUTPUT}")
