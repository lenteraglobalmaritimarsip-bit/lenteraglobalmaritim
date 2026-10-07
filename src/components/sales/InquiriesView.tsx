import React, { useRef, useState } from 'react';
import {
  FileQuestion,
  Plus,
  Search,
  ArrowRight,
  Ship,
  Calendar,
  Building,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Eye,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { JobCall, Vessel, Port, Customer, PurposeOfCall, PURPOSE_OF_CALL_OPTIONS } from '../../types';
import { db } from '../../db/storage';
import { AuthAccount } from '../../auth';
import { formatDateDisplay } from '../../utils/date';

interface InquiriesViewProps {
  jobCalls: JobCall[];
  vessels: Vessel[];
  ports: Port[];
  customers: Customer[];
  currentUser: AuthAccount;
  onSelectJob: (jobId: string) => void;
  onNavigateToQuotes: () => void;
  onDataSaved?: () => void;
}

interface SearchableMasterSelectProps {
  value: string;
  options: { id: string; label: string }[];
  placeholder: string;
  className?: string;
  onChange: (value: string) => void;
}

const SearchableMasterSelect: React.FC<SearchableMasterSelectProps> = ({
  value,
  options,
  placeholder,
  className = '',
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedOption = options.find((option) => option.id === value);
  const filteredOptions = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  const selectOption = (option: SearchableMasterSelectProps['options'][number]) => {
    onChange(option.id);
    setQuery(option.label);
    setIsOpen(false);
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={`master-options-${placeholder.replace(/[^a-z0-9]/gi, '-')}`}
          placeholder={placeholder}
          value={isOpen ? query : selectedOption?.label || query}
          onFocus={(event) => {
            setIsOpen(true);
            setQuery('');
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false);
              setQuery(selectedOption?.label || '');
            } else if (event.key === 'Enter' && isOpen && filteredOptions[0]) {
              event.preventDefault();
              selectOption(filteredOptions[0]);
            }
          }}
          className={`w-full bg-slate-950 border border-slate-800 rounded-lg p-2 pr-9 text-white focus:outline-none focus:border-emerald-500 ${className}`}
        />
        <ChevronDown
          aria-hidden="true"
          className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>
      {isOpen && (
        <ul
          id={`master-options-${placeholder.replace(/[^a-z0-9]/gi, '-')}`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
        >
          {filteredOptions.length ? filteredOptions.map((option) => (
            <li key={option.id} role="option" aria-selected={option.id === value}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                className={`w-full px-3 py-2 text-left text-xs transition hover:bg-slate-800 ${option.id === value ? 'bg-slate-800 text-emerald-300' : 'text-slate-200'}`}
              >
                {option.label}
              </button>
            </li>
          )) : (
            <li className="px-3 py-2 text-xs text-slate-400">Tidak ada data yang cocok.</li>
          )}
        </ul>
      )}
    </div>
  );
};

export const InquiriesView: React.FC<InquiriesViewProps> = ({
  jobCalls,
  vessels,
  ports,
  customers,
  currentUser,
  onSelectJob,
  onNavigateToQuotes,
  onDataSaved,
}) => {
  const [showNewForm, setShowNewForm] = useState(false);
  const [search, setSearch] = useState('');
  const [inquiryMonth, setInquiryMonth] = useState('ALL');
  const [quantityError, setQuantityError] = useState('');
  const [masterDataError, setMasterDataError] = useState('');

  const getJobStatus = (job: JobCall): { label: string; color: string } => {
    if (currentUser.role === 'FDA') {
      if (job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED') {
        return { label: 'Closed', color: 'bg-slate-500/20 text-slate-300' };
      }

      if (job.fda?.fdaApproved) {
        return { label: 'Kirim ke Finance', color: 'bg-emerald-500/20 text-emerald-300' };
      }

      return { label: 'DRAFT', color: 'bg-amber-500/20 text-amber-300' };
    }

    if (job.managerApproval.status === 'APPROVED') {
      return { label: 'Approval', color: 'bg-emerald-500/20 text-emerald-300' };
    }

    if (job.quotation.epda.status === 'SUBMITTED' || job.quotation.epda.status === 'APPROVED') {
      if (job.managerApproval.status === 'PENDING') {
        return { label: 'Pending Approval', color: 'bg-blue-500/20 text-blue-300' };
      }
    }

    return { label: 'Draft', color: 'bg-amber-500/20 text-amber-300' };
  };

  const [form, setForm] = useState({
    vesselId: vessels[0]?.id || '',
    portId: ports[0]?.id || '',
    customerId: customers[0]?.id || '',
    inquiryDate: new Date().toISOString().slice(0, 10),
    eta: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 16),
    etd: new Date(Date.now() + 86400000 * 6).toISOString().slice(0, 16),
    etaRemarks: '',
    etdRemarks: '',
    cargoQuantity: '' as number | '',
    quantityUnit: 'TON' as 'MT' | 'TON',
    purposeOfCall: 'CARGO_DISCHARGE' as PurposeOfCall,
    cargoDetails: '',
    estimatedDays: '3',
    specialRequirements: '',
  });

  const selectedVessel = vessels.find((v) => v.id === form.vesselId);
  const inquiryDatePickerRef = useRef<HTMLInputElement>(null);
  const openInquiryDatePicker = () => {
    const datePicker = inquiryDatePickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (datePicker?.showPicker) datePicker.showPicker();
    else datePicker?.click();
  };
  const inquiryMonths: string[] = Array.from(new Set<string>(jobCalls.map((job) => job.inquiry.date.slice(0, 7)).filter(Boolean))).sort().reverse();
  const filteredInquiries = jobCalls.filter((job) => {
    const query = search.toLowerCase();
    const matchesSearch = [job.vesselName, job.inquiry.inquiryNo, job.portName, job.customerName]
      .some((value) => value.toLowerCase().includes(query));
    return matchesSearch && (inquiryMonth === 'ALL' || job.inquiry.date.startsWith(inquiryMonth));
  });

  const formatInquiryMonth = (value: string) => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(`${value}-01T00:00:00`));

  const handleCreateInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.role === 'FDA') return;
    if (!form.customerId || !form.vesselId || !form.portId) {
      setMasterDataError('Pilih Customer, Kapal, dan Pelabuhan dari daftar master data.');
      return;
    }
    setMasterDataError('');
    if (form.cargoQuantity === '' || !Number.isFinite(Number(form.cargoQuantity))) {
      setQuantityError('Berat muatan wajib diisi.');
      return;
    }
    if (Number(form.cargoQuantity) < 0) {
      setQuantityError('Berat muatan tidak boleh minus.');
      return;
    }
    setQuantityError('');
    const vessel = vessels.find((v) => v.id === form.vesselId);
    const port = ports.find((p) => p.id === form.portId);
    const customer = customers.find((c) => c.id === form.customerId);

    const inquiryBranchCode = (currentUser.branch || 'Head Office')
      .replace(/[^A-Za-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2)
      .padEnd(2, 'X');

    const createdJob = db.createJob({
      vesselId: form.vesselId,
      vesselName: vessel?.name || 'MV UNNAMED',
      portId: form.portId,
      portName: port?.name || 'PORT',
      customerId: form.customerId,
      customerName: customer?.companyName || 'CUSTOMER',
      eta: form.eta,
      etd: form.etd,
      purposeOfCall: form.purposeOfCall,
      inquiry: {
        inquiryNo: `INQ-2026-${Math.floor(100 + Math.random() * 900)}`,
        date: form.inquiryDate,
        etaRemarks: form.etaRemarks,
        etdRemarks: form.etdRemarks,
        cargoQuantity: Number(form.cargoQuantity),
        quantityUnit: form.quantityUnit,
        cargoDetails: form.cargoDetails || 'General bulk shipment',
        estimatedDays: Number(form.estimatedDays),
        specialRequirements: form.specialRequirements || 'Standard agency services',
        status: 'CONVERTED',
        createdBy: `${currentUser.name} (${currentUser.role})`,
        createdByName: currentUser.name,
        createdByUserId: currentUser.id,
        createdByBranch: currentUser.branch || 'Head Office',
        createdByBranchCode: inquiryBranchCode,
      },
    });

    setShowNewForm(false);
    onSelectJob(createdJob.jobId);
    onDataSaved?.();
    onNavigateToQuotes();
  };

  return (
    <div className="space-y-5">
      {!showNewForm && (
        <>
      {/* Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
            <FileQuestion className="w-4 h-4" />
            <span>SALES & OPERATOR • INQUIRY MODULE</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">
            Inquiries Management
          </h1>
          <p className="text-xs text-slate-400">
            Daftar permintaan keagenan kapal masuk dari Principal / Charterer & konversi menjadi Job/Vessel Call ID
          </p>
        </div>

        {currentUser.role !== 'FDA' && (
          <button
            onClick={() => setShowNewForm(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-900/20 transition flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Inquiry Baru</span>
          </button>
        )}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-3 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari inquiry berdasarkan Kapal, No. Inquiry, Pelabuhan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select value={inquiryMonth} onChange={(e) => setInquiryMonth(e.target.value)} className="sales-filter-control">
            <option value="ALL">Semua Bulan Inquiry</option>
            {inquiryMonths.map((month) => <option key={month} value={month}>{formatInquiryMonth(month)}</option>)}
          </select>
          <span className="text-xs text-slate-400">Total: {filteredInquiries.length}</span>
        </div>
      </div>

      {/* Inquiry register table */}
      <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <table className="w-full min-w-[1100px] table-fixed text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="w-[3%] p-2">No</th>
              <th className="w-[8%] p-2">Req Inquiry</th>
              <th className="w-[9%] p-2">REG Vessel Call</th>
              <th className="w-[6%] p-2">IMO</th>
              <th className="w-[14%] p-2">Customer / Principal</th>
              <th className="w-[10%] p-2">Vessel</th>
              <th className="w-[10%] p-2">Port</th>
              <th className="w-[6%] p-2">Branch</th>
              <th className="w-[8%] p-2">Create Name</th>
              <th className="w-[9%] p-2">ETA</th>
              <th className="w-[7%] p-2">Status</th>
              <th className="w-[10%] p-2 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredInquiries.map((job, index) => {
              const vessel = vessels.find((v) => v.id === job.vesselId);
              const imoNumber = vessel?.imoNumber || '-';
              const jobStatus = getJobStatus(job);
              const isFinalApproved = job.managerApproval.status === 'APPROVED';
              const canDeleteJob = currentUser.role === 'SALES'
                && !isFinalApproved
                && job.quotation.epda.status !== 'SUBMITTED'
                && job.quotation.epda.status !== 'APPROVED'
                && !job.fda?.fdaApproved
                && !(job.actualCosts?.length)
                && !job.closing?.isClosed
                && job.currentStage !== 'CLOSED'
                && job.status !== 'CLOSED';
              return (
                <tr key={job.jobId} className="hover:bg-slate-800/60 transition-colors">
                  <td className="break-words p-2 font-mono font-bold text-slate-400">{index + 1}</td>
                  <td className="break-words p-2 font-mono font-bold text-cyan-300">{job.inquiry.inquiryNo}</td>
                  <td className="break-words p-2 font-mono font-bold text-blue-300">{job.jobId}</td>
                  <td className="break-words p-2 font-mono text-slate-300">{imoNumber}</td>
                  <td className="break-words p-2 font-semibold text-white">{job.customerName}</td>
                  <td className="break-words p-2 font-bold text-emerald-300">{job.vesselName}</td>
                  <td className="break-words p-2 text-slate-300">{job.portName}</td>
                  <td className="break-words p-2 text-slate-300">{job.inquiry.createdByBranch || job.inquiry.createdByBranchCode || '-'}</td>
                  <td className="break-words p-2 text-slate-300">{job.inquiry.createdByName || job.inquiry.createdBy || '-'}</td>
                  <td className="break-words p-2 text-slate-300">{formatDateDisplay(job.eta, true)}</td>
                  <td className="p-2">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${jobStatus.color}`}>
                      {jobStatus.label}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {isFinalApproved ? (
                        <button
                          type="button"
                          title="Lihat Quotes EPDA yang telah disetujui"
                          aria-label="Lihat Quotes EPDA yang telah disetujui"
                          onClick={() => { onSelectJob(job.jobId); onNavigateToQuotes(); }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 transition hover:bg-emerald-500/25"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { onSelectJob(job.jobId); onNavigateToQuotes(); }}
                          className="mx-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          Buat EPDA
                        </button>
                      )}
                      {canDeleteJob && (
                        <button
                          type="button"
                          title="Hapus Job/Vessel Call yang belum disetujui"
                          aria-label={`Hapus Job/Vessel Call ${job.jobId}`}
                          onClick={() => {
                            const confirmed = window.confirm(`Hapus Job/Vessel Call ${job.jobId} untuk ${job.vesselName} di ${job.portName}? Data yang sudah masuk proses approval tidak dapat dihapus.`);
                            if (!confirmed) return;
                            if (!db.deleteJob(job.jobId)) {
                              window.alert('Job tidak dapat dihapus karena sudah masuk proses approval atau role/branch tidak sesuai.');
                              return;
                            }
                            onDataSaved?.();
                          }}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/25"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredInquiries.length && <tr><td colSpan={12} className="p-8 text-center text-slate-500">Tidak ada inquiry sesuai pencarian.</td></tr>}
          </tbody>
        </table>
      </div>
        </>
      )}

      {showNewForm && currentUser.role !== 'FDA' && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-4 sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="w-full">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">Inquiry Management</div>
                <h3 className="text-lg font-bold text-white mt-1">
                  Buat Inquiry & Register Job Call ID Baru
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                aria-label="Kembali ke daftar inquiry"
                title="Kembali ke daftar inquiry"
                className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-500 hover:text-slate-800 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInquiry} autoComplete="off" className="space-y-2 text-xs text-slate-700 overflow-hidden w-full max-w-full bg-slate-100 rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="w-full">
                  <label className="text-slate-500 block mb-1 font-semibold">Date Inquiry</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={formatDateDisplay(form.inquiryDate)}
                      onClick={openInquiryDatePicker}
                      aria-label="Tanggal inquiry"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 pr-10 text-white font-mono"
                    />
                    <button type="button" onClick={openInquiryDatePicker} aria-label="Pilih tanggal inquiry" title="Pilih tanggal" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 hover:bg-slate-800">
                      <Calendar size={16} />
                    </button>
                    <input
                      ref={inquiryDatePickerRef}
                      type="date"
                      required
                      value={form.inquiryDate}
                      onChange={(e) => setForm({ ...form, inquiryDate: e.target.value })}
                      aria-label="Pilih tanggal inquiry"
                      className="pointer-events-none absolute h-px w-px opacity-0"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Customer / Principal / Charterer</label>
                  <SearchableMasterSelect
                    value={form.customerId}
                    options={customers.map((customer) => ({
                      id: customer.id,
                      label: `${customer.companyName} (${customer.type})`,
                    }))}
                    placeholder="Cari customer / principal / charterer..."
                    onChange={(customerId) => {
                      setMasterDataError('');
                      setForm({ ...form, customerId });
                    }}
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Branch</label>
                  <input
                    type="text"
                    value={currentUser.branch || 'Head Office'}
                    readOnly
                    className="w-full bg-slate-200 border border-slate-300 rounded-lg p-2 text-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Create Name</label>
                  <input
                    type="text"
                    value={currentUser.name}
                    readOnly
                    className="w-full bg-slate-200 border border-slate-300 rounded-lg p-2 text-slate-700 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="w-full">
                  <label className="text-slate-500 block mb-1 font-semibold">Pilih Kapal (Vessel Master)</label>
                  <SearchableMasterSelect
                    value={form.vesselId}
                    options={vessels.map((vessel) => ({
                      id: vessel.id,
                      label: `${vessel.name} (${vessel.vesselType})`,
                    }))}
                    placeholder="Cari nama kapal..."
                    className="font-mono"
                    onChange={(vesselId) => {
                      setMasterDataError('');
                      setForm({ ...form, vesselId });
                    }}
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Pelabuhan Tujuan</label>
                  <SearchableMasterSelect
                    value={form.portId}
                    options={ports.map((port) => ({
                      id: port.id,
                      label: `${port.name} (${port.code})`,
                    }))}
                    placeholder="Cari nama atau kode pelabuhan..."
                    onChange={(portId) => {
                      setMasterDataError('');
                      setForm({ ...form, portId });
                    }}
                  />
                </div>
              </div>
              {masterDataError && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {masterDataError}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                <div className="w-full">
                  <label className="text-slate-500 block mb-1 font-semibold">IMO Vessel</label>
                  <input
                    readOnly
                    value={selectedVessel?.imoNumber || '-'}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Call Sign</label>
                  <input
                    readOnly
                    value={selectedVessel?.callSign || '-'}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Flag</label>
                  <input
                    readOnly
                    value={selectedVessel?.flag || '-'}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start w-full">
                <div className="text-slate-500 text-[10px] leading-4 w-full">
                  <label className="block mb-1 font-semibold">GRT (Gross Tonnage)</label>
                  <input readOnly value={selectedVessel?.grt?.toLocaleString() || '-'} className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono" />
                  <div className="mt-2">
                    <label className="block mb-1 font-semibold">Cargo Quantity</label>
                    <input type="text" inputMode="decimal" pattern="[0-9]*[.]?[0-9]*" required value={form.cargoQuantity} onChange={(e) => { const value = e.target.value; setQuantityError(''); setForm({ ...form, cargoQuantity: value === '' ? '' : Number(value) }); }} className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono" aria-invalid={!!quantityError} />
                    {quantityError && <span className="block mt-1 text-[10px] text-rose-400">{quantityError}</span>}
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-300">
                      <label className="inline-flex items-center gap-1"><input type="radio" name="quantityUnit" value="MT" checked={form.quantityUnit === 'MT'} onChange={() => setForm({ ...form, quantityUnit: 'MT' })} /> MT</label>
                      <label className="inline-flex items-center gap-1"><input type="radio" name="quantityUnit" value="TON" checked={form.quantityUnit === 'TON'} onChange={() => setForm({ ...form, quantityUnit: 'TON' })} /> Ton</label>
                    </div>
                  </div>
                </div>
                <label className="block text-slate-500 text-[10px] leading-4">
                  <span className="block mb-1 font-semibold">NRT (Net Tonnage)</span>
                  <input readOnly value={selectedVessel?.nrt?.toLocaleString() || '-'} className="mt-1 w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono" />
                </label>
                <label className="block text-slate-500 text-[10px] leading-4">
                  <span className="block mb-1 font-semibold">DWT (Dead Weight)</span>
                  <input readOnly value={selectedVessel?.dwt?.toLocaleString() || '-'} className="mt-1 w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono" />
                </label>
                <label className="block text-slate-500 text-[10px] leading-4">
                  <span className="block mb-1 font-semibold">LOA (meter)</span>
                  <input readOnly value={selectedVessel ? `${selectedVessel.loa} m` : '-'} className="mt-1 w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono" />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="w-full">
                  <label className="text-slate-500 block mb-1 font-semibold">Estimated Time Arrival (ETA)</label>
                  <input
                    type="datetime-local"
                    required
                    value={form.eta}
                    onChange={(e) => setForm({ ...form, eta: e.target.value })}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Estimated Time Departure (ETD)</label>
                  <input
                    type="datetime-local"
                    required
                    value={form.etd}
                    onChange={(e) => setForm({ ...form, etd: e.target.value })}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Keterangan ETA</label>
                  <input
                    type="text"
                    value={form.etaRemarks}
                    onChange={(e) => setForm({ ...form, etaRemarks: e.target.value })}
                    placeholder="Contoh: menunggu konfirmasi agen"
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Keterangan ETD</label>
                  <input
                    type="text"
                    value={form.etdRemarks}
                    onChange={(e) => setForm({ ...form, etdRemarks: e.target.value })}
                    placeholder="Contoh: mengikuti jadwal muat"
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg px-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="w-full">
                  <label className="text-slate-500 block mb-1 font-semibold">Tujuan Kunjungan (Purpose)</label>
                  <select
                    value={form.purposeOfCall}
                    onChange={(e) => setForm({ ...form, purposeOfCall: e.target.value as PurposeOfCall })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  >
                    {PURPOSE_OF_CALL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 block mb-1 font-semibold">Estimasi Port Stay (Hari)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.]?[0-9]*"
                    value={form.estimatedDays}
                    onChange={(e) => setForm({ ...form, estimatedDays: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-1 font-semibold">Detail Muatan / Cargo Activity</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Contoh: Bongkar 45,000 MT Nikel Ore / Batubara di Dermaga..."
                  value={form.cargoDetails}
                  onChange={(e) => setForm({ ...form, cargoDetails: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1 font-semibold">Kebutuhan Khusus (Special Requirements)</label>
                <input
                  type="text"
                  placeholder="Contoh: 3 crew sign off, permohonan priority pilotage..."
                  value={form.specialRequirements}
                  onChange={(e) => setForm({ ...form, specialRequirements: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg border border-slate-300 bg-slate-200 text-slate-700 font-semibold shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Generate Job Call ID</span>
                </button>
              </div>
            </form>
        </section>
      )}
    </div>
  );
};
