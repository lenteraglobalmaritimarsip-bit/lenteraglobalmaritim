import React, { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { AccountingBalanceSheetReport, AccountingFinancialReportLine, AccountingProfitLossReport, AccountingReportBranch } from '../../types';
import { loadAccountingBalanceSheet, loadAccountingMonthlyProfitLoss, loadAccountingProfitLoss } from '../../lib/api';
import { todayISO } from '../../utils/date';
import { getPublicLogoUrl } from '../../utils/logo';
import { androidNative, isAndroidApp } from '../../lib/androidNative';

const formatIdr = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'IDR',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
}).format(amount || 0);

const reportNote = 'Berdasarkan jurnal POSTED. Saldo awal atau data historis yang belum dijurnal belum tercakup.';

const printAccountingReport = () => {
  if (!isAndroidApp()) {
    window.print();
    return;
  }
  const report = document.querySelector<HTMLElement>(
    '.accounting-balance-sheet-print, .accounting-profit-detail-print',
  );
  if (!report) {
    window.alert('Data laporan belum siap untuk dicetak. Muat laporan terlebih dahulu.');
    return;
  }
  const reportStyles = Array.from(
    report.closest('.accounting-balance-sheet-view, .accounting-profit-detail-view')?.querySelectorAll('style') ?? [],
  ).map((style) => style.outerHTML).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8">${document.head.innerHTML}${reportStyles}</head><body>${report.outerHTML}</body></html>`;
  void androidNative.printHtml(document.title || 'Laporan Akuntansi', html)
    .catch((printError) => {
      console.error('Android report print failed:', printError);
      window.alert(printError instanceof Error ? printError.message : 'Laporan gagal dicetak.');
    });
};

const ReportLines: React.FC<{ rows: AccountingFinancialReportLine[] }> = ({ rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-left text-xs">
      <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-3 py-2">Kode</th>
          <th className="px-3 py-2">Nama Akun</th>
          <th className="px-3 py-2">Kelompok</th>
          <th className="px-3 py-2 text-right">Saldo</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => (
          <tr key={`${row.code}-${row.accountName}`}>
            <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">{row.code}</td>
            <td className="px-3 py-2 font-semibold text-slate-800">{row.accountName}</td>
            <td className="px-3 py-2 text-slate-500">{row.accountGroup}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-800">{formatIdr(row.amount)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Tidak ada saldo dari jurnal posted pada periode ini.</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

const ReportSection: React.FC<{
  title: string;
  rows: AccountingFinancialReportLine[];
  total: number;
}> = ({ title, rows, total }) => (
  <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      <div className="text-right">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total</div>
        <div className="font-mono text-sm font-bold text-slate-900">{formatIdr(total)}</div>
      </div>
    </div>
    <ReportLines rows={rows} />
  </section>
);

const ReportHeader: React.FC<{ title: string; period: string; onRefresh: () => void; loading: boolean }> = ({ title, period, onRefresh, loading }) => (
  <header className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-end">
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Accounting Pusat</div>
      <h1 className="mt-1 text-xl font-black text-slate-900">{title}</h1>
      <p className="mt-1 text-xs text-slate-500">{period}</p>
    </div>
    <button type="button" onClick={onRefresh} disabled={loading} title="Muat ulang laporan" aria-label="Muat ulang laporan" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
      <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Muat ulang
    </button>
  </header>
);

const ReportMessage: React.FC<{ error: string; loading: boolean }> = ({ error, loading }) => (
  <>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
    {loading && <div role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">Memuat laporan...</div>}
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">{reportNote}</div>
  </>
);

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold normal-case text-slate-700';
type AccountingReportScope = 'ALL' | 'BRANCH' | 'HISTORICAL';

const scopeLabel = (scope: AccountingReportScope, branches: AccountingReportBranch[], branchId: string) => {
  if (scope === 'HISTORICAL') return 'Konsolidasi Historis';
  if (scope === 'BRANCH') {
    const branch = branches.find((item) => item.id === branchId);
    return branch ? `${branch.code} · ${branch.name}` : 'Per Branch';
  }
  return 'Semua Branch';
};

const ReportScopeFields: React.FC<{
  scope: AccountingReportScope;
  branchId: string;
  branches: AccountingReportBranch[];
  onScopeChange: (scope: AccountingReportScope) => void;
  onBranchChange: (branchId: string) => void;
}> = ({ scope, branchId, branches, onScopeChange, onBranchChange }) => (
  <>
    <label className="grid min-w-44 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
      Scope Laporan
      <select value={scope} onChange={(event) => onScopeChange(event.target.value as AccountingReportScope)} className={inputClass}>
        <option value="ALL">Semua Branch</option>
        <option value="BRANCH">Per Branch</option>
        <option value="HISTORICAL">Konsolidasi Historis</option>
      </select>
    </label>
    {scope === 'BRANCH' && (
      <label className="grid min-w-44 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Branch
        <select value={branchId} onChange={(event) => onBranchChange(event.target.value)} className={inputClass}>
          <option value="">Pilih branch</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
        </select>
      </label>
    )}
  </>
);

type BalanceSheetRow = {
  kind: 'section' | 'subheading' | 'item' | 'subtotal' | 'total';
  label: string;
  amount?: number;
};

const statementAmount = (amount: number) => {
  if (Math.abs(amount) < 0.005) return '-';
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(amount));
  return amount < 0 ? `(${value})` : value;
};

const sumAccounts = (accounts: AccountingFinancialReportLine[]) =>
  accounts.reduce((sum, account) => sum + account.amount, 0);

const buildBalanceSheetRows = (report: AccountingBalanceSheetReport): BalanceSheetRow[] => {
  const rows: BalanceSheetRow[] = [];
  const usedAssets = new Set<AccountingFinancialReportLine>();
  const byPrefix = (prefixes: string[]) => (account: AccountingFinancialReportLine) =>
    prefixes.some((prefix) => account.code.startsWith(prefix));
  const currentAssets = report.assets.filter((account) => !byPrefix(['FA', 'IS', 'IA'])(account));
  const nonCurrentAssets = report.assets.filter((account) => byPrefix(['FA', 'IS', 'IA'])(account));
  const addAssetItem = (label: string, accounts: AccountingFinancialReportLine[]) => {
    accounts.forEach((account) => usedAssets.add(account));
    rows.push({ kind: 'item', label, amount: sumAccounts(accounts) });
    return sumAccounts(accounts);
  };
  const currentRows = (matches: (account: AccountingFinancialReportLine) => boolean) =>
    currentAssets.filter((account) => !usedAssets.has(account) && matches(account));

  rows.push({ kind: 'section', label: 'ASSET' }, { kind: 'subheading', label: 'CURRENT ASSET' });
  addAssetItem('Cash and Cash Equivalent', currentRows(byPrefix(['CA'])));
  addAssetItem('Trade Account Receivables', currentRows(byPrefix(['AR010', 'AR020', 'AR090'])));
  rows.push({ kind: 'subheading', label: 'Other Receivable' });
  currentRows(byPrefix(['DF', 'AR030', 'AR040', 'AR15'])).forEach((account) => {
    addAssetItem(account.code.startsWith('DF01001') ? 'Affiliate - LGF'
      : account.code.startsWith('DF01002') ? 'Affiliate - RRLM'
        : account.code.startsWith('AR030') ? 'AR Employee'
          : account.accountName, [account]);
  });
  rows.push({ kind: 'subheading', label: 'Other Current Assets' });
  addAssetItem('Prepaid Taxes', currentRows(byPrefix(['PT'])));
  addAssetItem('Prepaid Expenses', currentRows(byPrefix(['PE'])));
  addAssetItem('Advance Payment', currentRows(byPrefix(['OA11', 'OA12', 'OA13'])));
  addAssetItem('TP Job Balance', currentRows((account) => account.code.startsWith('AE') && account.accountGroup === 'Asset'));
  currentAssets.filter((account) => !usedAssets.has(account)).forEach((account) => {
    addAssetItem(account.accountName, [account]);
  });
  const currentAssetTotal = sumAccounts(currentAssets);
  rows.push({ kind: 'subtotal', label: 'TOTAL CURRENT ASSET', amount: currentAssetTotal });

  rows.push({ kind: 'subheading', label: 'NON CURRENT ASSET' });
  const fixedAssetCost = addAssetItem('FA - Direct Ownership', nonCurrentAssets.filter((account) => /^FA10/.test(account.code)));
  const accumulatedDepreciation = addAssetItem('Accumulated Depreciation', nonCurrentAssets.filter((account) => /^FA99/.test(account.code)));
  rows.push({ kind: 'item', label: 'Fixed Asset Net', amount: fixedAssetCost + accumulatedDepreciation });
  const longTermInvestment = addAssetItem('Long Term Investment', nonCurrentAssets.filter(byPrefix(['IS'])));
  const intangibleAsset = addAssetItem('Intangible Asset', nonCurrentAssets.filter(byPrefix(['IA'])));
  const nonCurrentOther = sumAccounts(nonCurrentAssets.filter((account) => !usedAssets.has(account)));
  nonCurrentAssets.filter((account) => !usedAssets.has(account)).forEach((account) => {
    addAssetItem(account.accountName, [account]);
  });
  const nonCurrentAssetTotal = fixedAssetCost + accumulatedDepreciation + longTermInvestment + intangibleAsset + nonCurrentOther;
  rows.push({ kind: 'subtotal', label: 'TOTAL NON CURRENT ASSETS', amount: nonCurrentAssetTotal });
  rows.push({ kind: 'total', label: 'TOTAL ASSET', amount: report.totalAssets });

  rows.push({ kind: 'section', label: 'LIABILITIES AND EQUITY' }, { kind: 'subheading', label: 'CURRENT LIABILITIES' });
  const usedLiabilities = new Set<AccountingFinancialReportLine>();
  const nonCurrentLiabilities = report.liabilities.filter((account) => /^LT|^AP050/.test(account.code));
  const currentLiabilities = report.liabilities.filter((account) => !/^LT|^AP050/.test(account.code));
  const addLiabilityItem = (label: string, accounts: AccountingFinancialReportLine[]) => {
    accounts.forEach((account) => usedLiabilities.add(account));
    rows.push({ kind: 'item', label, amount: sumAccounts(accounts) });
    return sumAccounts(accounts);
  };
  addLiabilityItem('Account Payables', currentLiabilities.filter((account) => /^AP(01|02|09)/.test(account.code)));
  addLiabilityItem('Accrued Expenses', currentLiabilities.filter((account) => /^AE/.test(account.code)));
  addLiabilityItem('Tax Payable', currentLiabilities.filter(byPrefix(['TP'])));
  addLiabilityItem('Short Term Loan', currentLiabilities.filter(byPrefix(['SL'])));
  addLiabilityItem('Other Payable - Affiliate', currentLiabilities.filter(byPrefix(['DT'])));
  addLiabilityItem('Other Current Liabilities', currentLiabilities.filter((account) => !usedLiabilities.has(account)));
  const currentLiabilityTotal = sumAccounts(currentLiabilities);
  rows.push({ kind: 'subtotal', label: 'TOTAL CURRENT LIABILITIES', amount: currentLiabilityTotal });

  rows.push({ kind: 'subheading', label: 'NON CURRENT LIABILITIES' });
  addLiabilityItem('Long Term Bank Loans', nonCurrentLiabilities.filter(byPrefix(['LT001'])));
  addLiabilityItem('Long Term Leasing', nonCurrentLiabilities.filter(byPrefix(['LT002'])));
  addLiabilityItem('Long Term - Shareholders', nonCurrentLiabilities.filter(byPrefix(['AP050'])));
  addLiabilityItem('Other Non Current Liabilities', nonCurrentLiabilities.filter((account) => !usedLiabilities.has(account)));
  const nonCurrentLiabilityTotal = sumAccounts(nonCurrentLiabilities);
  rows.push({ kind: 'subtotal', label: 'TOTAL NON CURRENT LIABILITIES', amount: nonCurrentLiabilityTotal });

  rows.push({ kind: 'subheading', label: 'EQUITY' });
  const usedEquity = new Set<AccountingFinancialReportLine>();
  const addEquityItem = (label: string, matches: (account: AccountingFinancialReportLine) => boolean) => {
    const accounts = report.equity.filter(matches);
    accounts.forEach((account) => usedEquity.add(account));
    rows.push({ kind: 'item', label, amount: sumAccounts(accounts) });
  };
  addEquityItem('Equity', byPrefix(['EQ10']));
  addEquityItem('Retained - Earning', byPrefix(['EQ99']));
  addEquityItem('Other Equity', (account) => !usedEquity.has(account));
  rows.push({ kind: 'item', label: 'Profit and Loss Tahun Berjalan', amount: report.currentEarnings });
  rows.push({ kind: 'subtotal', label: 'TOTAL EQUITY', amount: report.totalEquity });
  rows.push({ kind: 'total', label: 'TOTAL LIABILITIES AND EQUITY', amount: report.totalLiabilities + report.totalEquity });
  return rows;
};

const BalanceSheetStatement: React.FC<{ rows: BalanceSheetRow[] }> = ({ rows }) => (
  <div className="balance-sheet-table-shell overflow-x-auto rounded-sm border border-slate-200 bg-white">
    <table className="balance-sheet-table w-full min-w-[620px] border-collapse text-left text-base">
      <tbody>
        {rows.map((row, index) => {
          const isBand = row.kind === 'subtotal' || row.kind === 'total';
          const rowClass = row.kind === 'section'
            ? 'font-black text-slate-950'
            : row.kind === 'subheading'
              ? 'font-bold text-slate-800'
              : row.kind === 'item'
                ? 'text-slate-700'
                : 'bg-[#eaf0f8] font-black text-slate-950';
          return (
            <tr key={`${row.kind}-${row.label}-${index}`} className={`${rowClass}${row.kind === 'item' ? ' balance-sheet-item' : ''}${isBand ? ' balance-sheet-band' : ''}`}>
              <td className={`px-3 py-2 ${row.kind === 'item' ? 'pl-10' : ''}`}>{row.label}</td>
              <td className="w-64 px-3 py-2 text-right font-mono tabular-nums">{row.amount === undefined ? '' : statementAmount(row.amount)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const AccountingBalanceSheetView: React.FC = () => {
  const today = todayISO();
  const currentYear = Number(today.slice(0, 4));
  const [month, setMonth] = useState(today.slice(5, 7));
  const [year, setYear] = useState(currentYear);
  const asOf = `${year}-${month}-${String(new Date(year, Number(month), 0).getDate()).padStart(2, '0')}`;
  const [scope, setScope] = useState<AccountingReportScope>('ALL');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<AccountingReportBranch[]>([]);
  const [report, setReport] = useState<AccountingBalanceSheetReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await loadAccountingBalanceSheet(asOf, scope, branchId);
      setReport(result.report);
      setBranches(result.branches);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Neraca gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  const asOfLabel = asOf
    ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(`${asOf}T00:00:00`)).replace(' ', '-')
    : '-';
  const yearOptions = Array.from({ length: Math.max(0, currentYear - 1999) }, (_, index) => currentYear - index);

  return (
    <div className="accounting-balance-sheet-view space-y-4">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          body * { visibility: hidden !important; }
          .accounting-balance-sheet-print,
          .accounting-balance-sheet-print * { visibility: visible !important; }
          .accounting-balance-sheet-print {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            color: #111827 !important;
            background: #ffffff !important;
            font-size: 9pt !important;
          }
          .balance-sheet-table-shell { overflow: visible !important; border: 0 !important; }
          .balance-sheet-print-header { margin: 0 0 2mm !important; padding: 0 0 1.5mm !important; }
          .balance-sheet-print-logo { width: 10mm !important; height: 10mm !important; }
          .balance-sheet-status { margin: 0 0 1mm !important; padding: 0.6mm 1.5mm !important; font-size: 7pt !important; }
          .balance-sheet-table { min-width: 0 !important; font-size: 9pt !important; line-height: 1.05 !important; }
          .balance-sheet-table tr { break-inside: avoid; page-break-inside: avoid; }
          .balance-sheet-table td { padding: 0.45mm 1.5mm !important; color: #111827 !important; }
          .balance-sheet-table tr.balance-sheet-item td:first-child { padding-left: 8mm !important; }
          .balance-sheet-band { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-end">
        <div>
          <div className="text-base font-black text-slate-950">PT. Lentera Global Maritim</div>
          <h1 className="mt-0.5 text-sm font-bold text-slate-800">Balance Sheet</h1>
          <div className="mt-2 flex items-baseline gap-2 text-xs font-semibold text-slate-600"><span>As Of</span><span className="font-bold text-slate-900">{asOfLabel}</span></div>
          <div className="mt-1 text-xs font-semibold text-slate-600">{scopeLabel(scope, branches, branchId)}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={printAccountingReport} title="Cetak atau simpan sebagai PDF" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Printer size={15} /> Cetak / PDF
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading} title="Muat ulang laporan" aria-label="Muat ulang Neraca" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Muat ulang
          </button>
        </div>
      </header>
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <label className="grid min-w-40 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Bulan
          <select
            value={month}
            onChange={(event) => { setMonth(event.target.value); setReport(null); }}
            className={inputClass}
            aria-label="Bulan Neraca"
          >
            {Array.from({ length: 12 }, (_, index) => {
              const value = String(index + 1).padStart(2, '0');
              const label = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(year, index, 1));
              return <option key={value} value={value}>{label}</option>;
            })}
          </select>
        </label>
        <label className="grid min-w-40 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Tahun
          <select
            value={year}
            onChange={(event) => { setYear(Number(event.target.value)); setReport(null); }}
            className={inputClass}
            aria-label="Tahun Neraca"
          >
            {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <ReportScopeFields
          scope={scope}
          branchId={branchId}
          branches={branches}
          onScopeChange={(value) => { setScope(value); setReport(null); }}
          onBranchChange={(value) => { setBranchId(value); setReport(null); }}
        />
        <button type="button" onClick={() => void refresh()} disabled={loading || !asOf || (scope === 'BRANCH' && !branchId)} className="h-10 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">Tampilkan</button>
      </section>
      <ReportMessage error={error} loading={loading} />
      {report && !loading && (
        <div className="accounting-balance-sheet-print">
          <header className="balance-sheet-print-header mb-5 flex items-center justify-between border-b-2 border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <img src={getPublicLogoUrl()} alt="Logo LGM" className="balance-sheet-print-logo h-14 w-14 object-contain" />
              <div>
                <div className="text-lg font-black text-slate-950">PT. Lentera Global Maritim</div>
                <div className="mt-1 text-base font-bold text-slate-800">Balance Sheet</div>
              </div>
            </div>
            <div className="text-right text-sm font-semibold text-slate-700">
              <div>As Of</div>
              <div className="font-bold text-slate-950">{asOfLabel}</div>
            </div>
          </header>
          <div className={`balance-sheet-status rounded-lg border px-4 py-3 text-xs font-bold ${Math.abs(report.difference) < 1 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            {Math.abs(report.difference) < 1 ? 'Neraca seimbang' : `Neraca belum seimbang · selisih ${formatIdr(report.difference)}`}
          </div>
          <BalanceSheetStatement rows={buildBalanceSheetRows(report)} />
        </div>
      )}
    </div>
  );
};

export const AccountingProfitLossView: React.FC = () => {
  const today = todayISO();
  const currentYear = Number(today.slice(0, 4));
  const [month, setMonth] = useState(today.slice(5, 7));
  const [year, setYear] = useState(currentYear);
  const [scope, setScope] = useState<AccountingReportScope>('ALL');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<AccountingReportBranch[]>([]);
  const [report, setReport] = useState<AccountingProfitLossReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${String(new Date(year, Number(month), 0).getDate()).padStart(2, '0')}`;
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(year, Number(month) - 1, 1));
  const yearOptions = Array.from({ length: Math.max(0, currentYear - 1999) }, (_, index) => currentYear - index);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await loadAccountingProfitLoss(startDate, endDate, scope, branchId);
      setReport(result.report);
      setBranches(result.branches);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Laba Rugi gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <div className="space-y-4">
      <ReportHeader title="Laba Rugi" period={`Periode ${monthLabel} ${year} · ${scopeLabel(scope, branches, branchId)}`} onRefresh={() => void refresh()} loading={loading} />
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <label className="grid min-w-40 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Bulan
          <select
            value={month}
            onChange={(event) => { setMonth(event.target.value); setReport(null); }}
            className={inputClass}
            aria-label="Bulan Laba Rugi"
          >
            {Array.from({ length: 12 }, (_, index) => {
              const value = String(index + 1).padStart(2, '0');
              const label = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(year, index, 1));
              return <option key={value} value={value}>{label}</option>;
            })}
          </select>
        </label>
        <label className="grid min-w-40 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Tahun
          <select
            value={year}
            onChange={(event) => { setYear(Number(event.target.value)); setReport(null); }}
            className={inputClass}
            aria-label="Tahun Laba Rugi"
          >
            {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <ReportScopeFields
          scope={scope}
          branchId={branchId}
          branches={branches}
          onScopeChange={(value) => { setScope(value); setReport(null); }}
          onBranchChange={(value) => { setBranchId(value); setReport(null); }}
        />
        <button type="button" onClick={() => void refresh()} disabled={loading || (scope === 'BRANCH' && !branchId)} className="h-10 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">Tampilkan</button>
      </section>
      <ReportMessage error={error} loading={loading} />
      {report && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Total Pendapatan', report.totalRevenue + report.totalOtherIncome],
              ['Total Beban', report.totalExpenses + report.totalOtherExpenses],
              ['Laba / (Rugi) Bersih', report.netIncome],
            ].map(([label, amount]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                <div className={`mt-1 font-mono text-base font-bold ${label === 'Laba / (Rugi) Bersih' && Number(amount) < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{formatIdr(Number(amount))}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <ReportSection title="Pendapatan Usaha" rows={report.revenue} total={report.totalRevenue} />
              <ReportSection title="Pendapatan Lain-lain" rows={report.otherIncome} total={report.totalOtherIncome} />
            </div>
            <div className="space-y-4">
              <ReportSection title="Beban Operasional" rows={report.expenses} total={report.totalExpenses} />
              <ReportSection title="Beban Lain-lain" rows={report.otherExpenses} total={report.totalOtherExpenses} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

type ProfitDetailRow = {
  kind: 'section' | 'account' | 'subtotal' | 'total';
  label: string;
  code?: string;
  amounts?: number[];
};

type ProfitDetailAccount = AccountingFinancialReportLine & { amounts: number[] };

const profitDetailMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const sumMonthlyAmounts = (rows: ProfitDetailAccount[]) =>
  profitDetailMonths.map((_, month) => rows.reduce((total, row) => total + row.amounts[month], 0));
const subtractMonthlyAmounts = (left: number[], right: number[]) =>
  left.map((amount, month) => amount - right[month]);

const buildProfitDetailRows = (reports: AccountingProfitLossReport[]): ProfitDetailRow[] => {
  const categories: Record<string, ProfitDetailAccount[]> = {
    revenue: [],
    cost: [],
    general: [],
    otherIncome: [],
    otherExpenses: [],
  };
  const accountsByCategory = new Map<string, Map<string, ProfitDetailAccount>>();

  reports.forEach((report, month) => {
    const addAccounts = (category: string, lines: AccountingFinancialReportLine[]) => {
      let accounts = accountsByCategory.get(category);
      if (!accounts) {
        accounts = new Map();
        accountsByCategory.set(category, accounts);
      }
      lines.forEach((line) => {
        const key = `${line.code}-${line.accountName}`;
        let account = accounts.get(key);
        if (!account) {
          account = { ...line, amount: 0, amounts: Array(12).fill(0) };
          accounts.set(key, account);
        }
        account.amounts[month] = line.amount;
      });
    };

    addAccounts('revenue', report.revenue);
    addAccounts('cost', report.expenses.filter((line) => line.accountGroup.startsWith('Expenses')));
    addAccounts('general', report.expenses.filter((line) => !line.accountGroup.startsWith('Expenses')));
    addAccounts('otherIncome', report.otherIncome);
    addAccounts('otherExpenses', report.otherExpenses);
  });

  accountsByCategory.forEach((accounts, category) => {
    categories[category] = [...accounts.values()].sort((left, right) => left.code.localeCompare(right.code));
  });

  const revenue = sumMonthlyAmounts(categories.revenue);
  const cost = sumMonthlyAmounts(categories.cost);
  const general = sumMonthlyAmounts(categories.general);
  const otherIncome = sumMonthlyAmounts(categories.otherIncome);
  const otherExpenses = sumMonthlyAmounts(categories.otherExpenses);
  const grossProfit = subtractMonthlyAmounts(revenue, cost);
  const operatingIncome = subtractMonthlyAmounts(grossProfit, general);
  const netIncome = reports.map((report) => report.netIncome);
  const rows: ProfitDetailRow[] = [];
  const addSection = (label: string, accounts: ProfitDetailAccount[], totalLabel: string, amounts: number[]) => {
    rows.push({ kind: 'section', label });
    accounts.forEach((account) => rows.push({
      kind: 'account',
      label: account.accountName,
      code: account.code,
      amounts: account.amounts,
    }));
    rows.push({ kind: 'subtotal', label: totalLabel, amounts });
  };

  addSection('Revenue', categories.revenue, 'Total Revenue', revenue);
  addSection('Harga Pokok Penjualan', categories.cost, 'Total Harga Pokok Penjualan', cost);
  rows.push({ kind: 'total', label: 'Laba Kotor', amounts: grossProfit });
  addSection('General & Adm Expenses', categories.general, 'Total General & Adm Expenses', general);
  rows.push({ kind: 'total', label: 'Laba Operasional', amounts: operatingIncome });
  addSection('Other Income (Expenses)', [...categories.otherIncome, ...categories.otherExpenses], 'Total Other Income (Expenses)', subtractMonthlyAmounts(otherIncome, otherExpenses));
  rows.push({ kind: 'total', label: 'Laba / (Rugi) Bersih', amounts: netIncome });
  return rows;
};

export const AccountingProfitDetailView: React.FC = () => {
  const currentYear = Number(todayISO().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [scope, setScope] = useState<AccountingReportScope>('ALL');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<AccountingReportBranch[]>([]);
  const [reports, setReports] = useState<AccountingProfitLossReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    if (scope === 'BRANCH' && !branchId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await loadAccountingMonthlyProfitLoss(year, scope, branchId);
      setReports(result.reports);
      setBranches(result.branches);
    } catch (loadError) {
      setReports(null);
      setError(loadError instanceof Error ? loadError.message : 'Rincian Laba gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const rows = reports ? buildProfitDetailRows(reports) : [];
  const downloadExcel = async () => {
    if (!reports || loading) return;
    setError('');
    setMessage('');
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`Rincian Laba ${year}`);
      sheet.addRow(['Rincian Laba', `Tahun ${year}`, scopeLabel(scope, branches, branchId)]);
      sheet.addRow(['Pos Laporan', ...profitDetailMonths, 'Total']);
      rows.forEach((row) => {
        if (row.kind === 'section') {
          sheet.addRow([row.label]);
          return;
        }
        sheet.addRow([
          row.code ? `${row.code} · ${row.label}` : row.label,
          ...(row.amounts || Array(12).fill(0)),
          (row.amounts || []).reduce((total, amount) => total + amount, 0),
        ]);
      });
      sheet.columns = [{ width: 38 }, ...Array.from({ length: 13 }, () => ({ width: 16 }))];
      sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
      sheet.getRow(1).font = { bold: true, size: 14 };
      sheet.getRow(2).font = { bold: true, color: { argb: 'FF1E293B' } };
      sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF0F8' } };
      rows.forEach((row, index) => {
        const excelRow = sheet.getRow(index + 3);
        if (row.kind === 'section' || row.kind === 'subtotal' || row.kind === 'total') {
          excelRow.font = { bold: true };
        }
        if (row.kind === 'subtotal' || row.kind === 'total') {
          excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF0F8' } };
        }
      });
      for (let column = 2; column <= 14; column += 1) {
        sheet.getColumn(column).numFmt = '#,##0;[Red](#,##0);-';
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `rincian-laba-${year}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('File Excel Rincian Laba berhasil diunduh.');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Excel Rincian Laba gagal dibuat.');
    }
  };

  const printAmount = (amount: number) => {
    if (Math.abs(amount) < 0.005) return '-';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(amount));
  };

  return (
    <div className="accounting-profit-detail-view space-y-4">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 7mm; }
          body * { visibility: hidden !important; }
          .accounting-profit-detail-print,
          .accounting-profit-detail-print * { visibility: visible !important; }
          .accounting-profit-detail-print {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            color: #111827 !important;
            background: #ffffff !important;
            font-size: 8pt !important;
          }
          .profit-detail-table-shell { overflow: visible !important; border: 0 !important; }
          .profit-detail-table { min-width: 0 !important; font-size: 7pt !important; }
          .profit-detail-table th, .profit-detail-table td { padding: 1mm !important; }
          .profit-detail-table tr { break-inside: avoid; page-break-inside: avoid; }
          .profit-detail-band { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Accounting Pusat</div>
          <h1 className="mt-1 text-xl font-black text-slate-900">Rincian Laba</h1>
          <p className="mt-1 text-xs text-slate-500">Tahun {year} · {scopeLabel(scope, branches, branchId)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={printAccountingReport} disabled={!reports || loading} title="Cetak atau simpan sebagai PDF" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Printer size={15} /> Cetak / PDF
          </button>
          <button type="button" onClick={() => void downloadExcel()} disabled={!reports || loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download size={15} /> Download Excel
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Muat ulang
          </button>
        </div>
      </header>
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <label className="grid min-w-40 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Tahun laporan
          <select value={year} onChange={(event) => { setYear(Number(event.target.value)); setReports(null); setMessage(''); }} className={inputClass}>
            {Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <ReportScopeFields
          scope={scope}
          branchId={branchId}
          branches={branches}
          onScopeChange={(value) => { setScope(value); setReports(null); }}
          onBranchChange={(value) => { setBranchId(value); setReports(null); }}
        />
        <button type="button" onClick={() => void refresh()} disabled={loading || (scope === 'BRANCH' && !branchId)} className="h-10 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">Tampilkan</button>
      </section>
      <ReportMessage error={error} loading={loading} />
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{message}</div>}
      {reports && !loading && (
        <div className="accounting-profit-detail-print rounded-lg border border-slate-200 bg-white p-4">
          <header className="mb-4 flex items-center justify-between border-b-2 border-slate-800 pb-3">
            <div>
              <div className="text-lg font-black text-slate-950">PT. Lentera Global Maritim</div>
              <h2 className="mt-0.5 text-base font-bold text-slate-800">Rincian Laba · Tahun {year}</h2>
            </div>
            <div className="text-right text-xs font-semibold text-slate-600">{scopeLabel(scope, branches, branchId)}</div>
          </header>
          <div className="profit-detail-table-shell overflow-x-auto rounded-md border border-slate-200">
            <table className="profit-detail-table w-full min-w-[1200px] border-collapse text-left text-[10px]">
              <thead className="profit-detail-band bg-[#eaf0f8] text-slate-700">
                <tr>
                  <th className="w-64 border border-slate-200 px-2 py-2">Pos Laporan</th>
                  {profitDetailMonths.map((month) => <th key={month} className="border border-slate-200 px-2 py-2 text-right">{month}</th>)}
                  <th className="border border-slate-200 px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const total = (row.amounts || []).reduce((sum, amount) => sum + amount, 0);
                  const rowClass = row.kind === 'section'
                    ? 'font-bold text-slate-800'
                    : row.kind === 'subtotal' || row.kind === 'total'
                      ? 'profit-detail-band bg-[#eaf0f8] font-bold text-slate-900'
                      : 'text-slate-700';
                  return (
                    <tr key={`${row.kind}-${row.label}-${index}`} className={rowClass}>
                      <td className={`border border-slate-100 px-2 py-1.5 ${row.kind === 'account' ? 'pl-5' : ''}`}>
                        {row.code && <span className="mr-2 font-mono text-slate-400">{row.code}</span>}{row.label}
                      </td>
                      {row.kind === 'section' ? (
                        <td colSpan={13} className="border border-slate-100 px-2 py-1.5" />
                      ) : (
                        <>
                          {(row.amounts || Array(12).fill(0)).map((amount, month) => (
                            <td key={month} className="whitespace-nowrap border border-slate-100 px-2 py-1.5 text-right font-mono">{amount < 0 ? `(${printAmount(amount)})` : printAmount(amount)}</td>
                          ))}
                          <td className="whitespace-nowrap border border-slate-100 px-2 py-1.5 text-right font-mono">{total < 0 ? `(${printAmount(total)})` : printAmount(total)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};