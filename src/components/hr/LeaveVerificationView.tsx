import React, { useEffect, useState } from 'react';
import { HrLeaveVerification, hrApi } from '../../lib/api';
import { formatDateDisplay, formatDateTimeWib } from '../../utils/date';

const requestTypeLabels: Record<HrLeaveVerification['type'], string> = {
  ANNUAL: 'Cuti Tahunan',
  BUSINESS_TRAVEL: 'Perjalanan Dinas',
  SICK: 'Sakit',
  PERSONAL: 'Izin Pribadi',
  OTHER: 'Izin Lainnya',
};

const requestStatusLabels: Record<HrLeaveVerification['status'], string> = {
  PENDING: 'Menunggu persetujuan HR',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export const LeaveVerificationView: React.FC<{ requestId: string }> = ({ requestId }) => {
  const [verification, setVerification] = useState<HrLeaveVerification | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void hrApi.verifyLeaveRequest(requestId)
      .then((result) => {
        if (active) setVerification(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Verifikasi surat gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [requestId]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 font-[Arial,sans-serif] text-slate-800">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">PT. Lentera Global Maritim</p>
        <h1 className="mt-2 text-2xl font-bold">Verifikasi Surat Permohonan</h1>
        <p className="mt-2 text-sm text-slate-600">Informasi ini memeriksa nomor surat dan statusnya pada sistem perusahaan.</p>
        {loading && <p role="status" className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">Memeriksa surat...</p>}
        {!loading && error && <p role="alert" className="mt-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
        {!loading && verification && (
          <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 px-4">
            {[
              ['Nomor verifikasi', verification.id],
              ['Nama karyawan', verification.employeeName],
              ['Jenis permohonan', requestTypeLabels[verification.type]],
              ['Tanggal permohonan', formatDateTimeWib(verification.submittedAt)],
              ['Tanggal mulai', formatDateDisplay(verification.startDate)],
              ['Tanggal selesai', formatDateDisplay(verification.endDate)],
              ['Status', requestStatusLabels[verification.status]],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(120px,0.8fr)_minmax(0,1.2fr)] gap-3 py-3 text-sm">
                <dt className="text-slate-500">{label}</dt>
                <dd className="break-words font-semibold text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <a href="/" className="mt-6 inline-flex rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600">Buka Portal</a>
      </section>
    </main>
  );
};
