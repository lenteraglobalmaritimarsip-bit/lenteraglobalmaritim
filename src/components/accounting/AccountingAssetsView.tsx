import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { PackagePlus, Pencil, RefreshCw, Search, X } from 'lucide-react';
import { AccountingAsset, Branch, ChartOfAccount } from '../../types';
import { createAccountingAsset, loadAccountingAssets, updateAccountingAsset } from '../../lib/api';
import { DateInput } from '../shared/DateInput';
import { FormattedNumberInput } from '../shared/FormattedNumberInput';

interface AssetFormState {
  assetCode: string;
  assetName: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: string;
  usefulLifeMonths: string;
  residualValue: string;
  location: string;
  branchId: string;
  status: AccountingAsset['status'];
  coaAssetId: string;
  coaDepreciationId: string;
}

const emptyForm: AssetFormState = {
  assetCode: '',
  assetName: '',
  category: '',
  acquisitionDate: '',
  acquisitionCost: '0',
  usefulLifeMonths: '0',
  residualValue: '0',
  location: '',
  branchId: '',
  status: 'Aktif',
  coaAssetId: '',
  coaDepreciationId: '',
};

const formatAmount = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'IDR',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
}).format(value || 0);

export const AccountingAssetsView: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const [assets, setAssets] = useState<AccountingAsset[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [form, setForm] = useState<AssetFormState>(emptyForm);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await loadAccountingAssets();
      setAssets(result.assets);
      setBranches(result.branches);
      setAccounts(result.accounts);
      setForm((current) => ({ ...current, branchId: current.branchId || result.branches[0]?.id || '' }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Data aset gagal dimuat.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const categories = useMemo(() => [...new Set(assets.map((asset) => asset.category).filter((category): category is string => Boolean(category)))].sort(), [assets]);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const query = search.trim().toLocaleLowerCase();
  const filteredAssets = assets.filter((asset) => {
    const matchesBranch = branchFilter === 'ALL' || asset.branchId === branchFilter;
    const matchesStatus = statusFilter === 'ALL' || asset.status === statusFilter;
    const matchesCategory = categoryFilter === 'ALL' || asset.category === categoryFilter;
    const searchable = `${asset.assetCode} ${asset.assetName} ${asset.category || ''} ${asset.location || ''} ${asset.branchName}`.toLocaleLowerCase();
    return matchesBranch && matchesStatus && matchesCategory && (!query || searchable.includes(query));
  });
  const totalCost = filteredAssets.reduce((sum, asset) => sum + asset.acquisitionCost, 0);
  const totalMonthlyDepreciation = filteredAssets.reduce((sum, asset) => sum + asset.monthlyDepreciation, 0);

  const updateForm = (updates: Partial<AssetFormState>) => setForm((current) => ({ ...current, ...updates }));

  const startEditing = (asset: AccountingAsset) => {
    setEditingAssetId(asset.id);
    setForm({
      assetCode: asset.assetCode,
      assetName: asset.assetName,
      category: asset.category || '',
      acquisitionDate: asset.acquisitionDate || '',
      acquisitionCost: String(asset.acquisitionCost),
      usefulLifeMonths: String(asset.usefulLifeMonths),
      residualValue: String(asset.residualValue),
      location: asset.location || '',
      branchId: asset.branchId,
      status: asset.status,
      coaAssetId: asset.coaAssetId || '',
      coaDepreciationId: asset.coaDepreciationId || '',
    });
    setError('');
    setMessage('');
  };

  const cancelEditing = () => {
    setEditingAssetId(null);
    setForm((current) => ({ ...emptyForm, branchId: current.branchId }));
    setError('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const input = {
        ...form,
        assetCode: form.assetCode.trim(),
        assetName: form.assetName.trim(),
        category: form.category.trim(),
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: Number(form.acquisitionCost) || 0,
        usefulLifeMonths: Number(form.usefulLifeMonths) || 0,
        residualValue: Number(form.residualValue) || 0,
        location: form.location.trim(),
      };
      if (editingAssetId) {
        await updateAccountingAsset(editingAssetId, input);
        setMessage(`Aset ${form.assetCode.trim()} berhasil diperbarui.`);
      } else {
        await createAccountingAsset(input);
        setMessage(`Aset ${form.assetCode.trim()} berhasil ditambahkan.`);
      }
      setEditingAssetId(null);
      setForm((current) => ({ ...emptyForm, branchId: current.branchId }));
      const result = await loadAccountingAssets();
      setAssets(result.assets);
      setBranches(result.branches);
      setAccounts(result.accounts);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Aset gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  const accountLabel = (id: string | null) => {
    if (!id) return 'Belum dipetakan';
    const account = accounts.find((item) => item.id === id);
    return account ? `${account.code} · ${account.accountDesc}` : id;
  };

  const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-500 disabled:bg-slate-100';
  const labelClass = 'block text-xs font-semibold text-slate-600';

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Accounting Pusat</div>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-900"><PackagePlus size={19} /> Register Aset</h1>
          <p className="mt-1 text-xs text-slate-500">{readOnly ? 'Informasi aset dan estimasi penyusutan seluruh branch · hanya baca.' : 'Data aset dan estimasi penyusutan seluruh branch.'}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={isLoading} title="Muat ulang aset" aria-label="Muat ulang aset" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} /> Muat ulang
        </button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{message}</div>}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Nilai Perolehan · Filter Aktif</div>
          <div className="mt-2 font-mono text-lg font-black text-slate-900">{formatAmount(totalCost)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Estimasi Penyusutan / Bulan</div>
          <div className="mt-2 font-mono text-lg font-black text-slate-900">{formatAmount(totalMonthlyDepreciation)}</div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-48 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Branch
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className={inputClass}>
              <option value="ALL">Semua branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
            </select>
          </label>
          <label className="grid min-w-44 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Kategori
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={inputClass}>
              <option value="ALL">Semua kategori</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="grid min-w-40 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
              <option value="ALL">Semua status</option>
              <option value="Aktif">Aktif</option>
              <option value="Dijual">Dijual</option>
              <option value="Dihapuskan">Dihapuskan</option>
            </select>
          </label>
          <label className="relative grid min-w-56 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Cari aset
            <Search size={15} className="absolute bottom-3 left-3 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kode, nama, lokasi..." className={`${inputClass} pl-9`} />
          </label>
          <span className="pb-2 text-xs font-semibold text-slate-500">{filteredAssets.length} aset</span>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[1200px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Kode</th><th className="px-3 py-2">Nama aset</th><th className="px-3 py-2">Kategori</th><th className="px-3 py-2">Branch / Lokasi</th><th className="px-3 py-2">Tanggal perolehan</th><th className="px-3 py-2 text-right">Nilai perolehan</th><th className="px-3 py-2 text-right">Umur (bln)</th><th className="px-3 py-2 text-right">Estimasi / bln</th><th className="px-3 py-2">COA Aset</th><th className="px-3 py-2">Status</th>{!readOnly && <th className="px-3 py-2">Aksi</th>}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssets.length === 0 ? <tr><td colSpan={readOnly ? 10 : 11} className="px-3 py-8 text-center text-slate-400">{isLoading ? 'Memuat register aset...' : 'Tidak ada aset untuk filter ini.'}</td></tr> : filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-emerald-800">{asset.assetCode}</td>
                  <td className="max-w-64 px-3 py-2 font-semibold text-slate-800">{asset.assetName}</td>
                  <td className="px-3 py-2 text-slate-600">{asset.category || '-'}</td>
                  <td className="px-3 py-2 text-slate-700">{asset.branchCode || asset.branchName} · {asset.location || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{asset.acquisitionDate || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(asset.acquisitionCost)}</td>
                  <td className="px-3 py-2 text-right font-mono">{asset.usefulLifeMonths || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(asset.monthlyDepreciation)}</td>
                  <td className="max-w-48 px-3 py-2 text-slate-600">{accountLabel(asset.coaAssetId)}</td>
                  <td className="px-3 py-2">{asset.status}</td>
                  {!readOnly && <td className="px-3 py-2">
                    <button type="button" onClick={() => startEditing(asset)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
                      <Pencil size={12} /> Edit
                    </button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">Penyusutan per bulan adalah estimasi garis lurus; belum membuat jurnal otomatis. Data sumber yang belum memiliki pemetaan COA tetap belum dipetakan.</p>
      </section>

      {!readOnly && <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 border-b border-slate-100 pb-3">
          <h2 className="text-sm font-black text-slate-900">{editingAssetId ? `Edit Aset · ${form.assetCode}` : 'Tambah Aset'}</h2>
          <p className="mt-1 text-xs text-slate-500">Pilih branch pemilik aset. Kode COA dapat dipetakan sekarang atau dibiarkan kosong.</p>
        </div>
        <form onSubmit={(event) => { void handleSubmit(event); }} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className={labelClass}>Kode aset *
            <input required maxLength={60} value={form.assetCode} onChange={(event) => updateForm({ assetCode: event.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>Nama aset *
            <input required maxLength={200} value={form.assetName} onChange={(event) => updateForm({ assetName: event.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>Kategori
            <input maxLength={120} value={form.category} onChange={(event) => updateForm({ category: event.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>Branch pemilik *
            <select required value={form.branchId} onChange={(event) => updateForm({ branchId: event.target.value })} className={inputClass}>
              <option value="">Pilih branch</option>
              {editingAssetId && !branches.some((branch) => branch.id === form.branchId) && <option value={form.branchId}>{form.branchId} · {assets.find((asset) => asset.id === editingAssetId)?.branchName || 'Branch nonaktif'}</option>}
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
            </select>
          </label>
          <label className={labelClass}>Tanggal perolehan
            <DateInput value={form.acquisitionDate} onChange={(value) => updateForm({ acquisitionDate: value })} inputClassName={inputClass} ariaLabel="Tanggal perolehan aset" />
          </label>
          <label className={labelClass}>Nilai perolehan (IDR) *
            <FormattedNumberInput required min="0" value={form.acquisitionCost} onValueChange={(value) => updateForm({ acquisitionCost: value })} className={inputClass} />
          </label>
          <label className={labelClass}>Umur manfaat (bulan)
            <input type="number" min="0" step="1" value={form.usefulLifeMonths} onChange={(event) => updateForm({ usefulLifeMonths: event.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>Nilai residu (IDR)
            <FormattedNumberInput min="0" value={form.residualValue} onValueChange={(value) => updateForm({ residualValue: value })} className={inputClass} />
          </label>
          <label className={labelClass}>Lokasi
            <input maxLength={200} value={form.location} onChange={(event) => updateForm({ location: event.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>Status
            <select value={form.status} onChange={(event) => updateForm({ status: event.target.value as AccountingAsset['status'] })} className={inputClass}>
              <option value="Aktif">Aktif</option><option value="Dijual">Dijual</option><option value="Dihapuskan">Dihapuskan</option>
            </select>
          </label>
          <label className={labelClass}>COA aset
            <select value={form.coaAssetId} onChange={(event) => updateForm({ coaAssetId: event.target.value })} className={inputClass}>
              <option value="">Belum dipetakan</option>
              {editingAssetId && form.coaAssetId && !accounts.some((account) => account.id === form.coaAssetId) && <option value={form.coaAssetId}>{accountLabel(form.coaAssetId)} · tidak aktif</option>}
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.accountDesc}</option>)}
            </select>
          </label>
          <label className={labelClass}>COA penyusutan
            <select value={form.coaDepreciationId} onChange={(event) => updateForm({ coaDepreciationId: event.target.value })} className={inputClass}>
              <option value="">Belum dipetakan</option>
              {editingAssetId && form.coaDepreciationId && !accounts.some((account) => account.id === form.coaDepreciationId) && <option value={form.coaDepreciationId}>{accountLabel(form.coaDepreciationId)} · tidak aktif</option>}
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.accountDesc}</option>)}
            </select>
          </label>
          <div className="flex items-end justify-end md:col-span-2 xl:col-span-4">
            <div className="flex gap-2">
              {editingAssetId && <button type="button" onClick={cancelEditing} disabled={isSaving} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><X size={14} /> Batal</button>}
              <button type="submit" disabled={isSaving || (branches.length === 0 && !editingAssetId)} className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {isSaving ? 'Menyimpan...' : editingAssetId ? 'Simpan Perubahan' : 'Simpan Aset'}
              </button>
            </div>
          </div>
        </form>
      </section>}
    </div>
  );
};
