import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChartOfAccount, FinanceJournalLine } from '../../types';
import { createFinanceJournalLine, getFinanceJournalTotals } from '../../utils/financeJournal';
import { FormattedNumberInput } from '../shared/FormattedNumberInput';

interface AccountSearchProps {
  accounts: ChartOfAccount[];
  value: string;
  onChange: (accountId: string) => void;
  label: string;
}

const AccountSearch: React.FC<AccountSearchProps> = ({ accounts, value, onChange, label }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedAccount = accounts.find((account) => account.id === value);
  const selectedLabel = selectedAccount ? `${selectedAccount.code} - ${selectedAccount.accountDesc}` : '';
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingAccounts = normalizedQuery
    ? accounts.filter((account) => account.isActive
      && `${account.code} ${account.accountDesc}`.toLocaleLowerCase().includes(normalizedQuery)).slice(0, 50)
    : [];
  const listId = `coa-search-${label.replaceAll(' ', '-')}`;

  useEffect(() => {
    if (!isOpen) setQuery(selectedLabel);
  }, [isOpen, selectedLabel]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePopupPosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const showBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(80, Math.min(224, showBelow ? spaceBelow : spaceAbove));
      setPopupStyle({
        position: 'fixed',
        left: rect.left,
        top: showBelow ? rect.bottom + 4 : rect.top - maxHeight - 4,
        width: rect.width,
        maxHeight,
        zIndex: 1000,
      });
    };
    updatePopupPosition();
    window.addEventListener('resize', updatePopupPosition);
    window.addEventListener('scroll', updatePopupPosition, true);
    return () => {
      window.removeEventListener('resize', updatePopupPosition);
      window.removeEventListener('scroll', updatePopupPosition, true);
    };
  }, [isOpen, query, matchingAccounts.length]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        value={query}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          if (value) onChange('');
        }}
        placeholder="Cari kode atau nama akun..."
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[10px] text-slate-800"
      />
      {isOpen && popupStyle && createPortal(
        <div id={listId} role="listbox" style={popupStyle} className="overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {!normalizedQuery ? (
            <p className="px-3 py-2 text-[10px] text-slate-500">Ketik kode atau nama akun untuk mencari.</p>
          ) : matchingAccounts.length > 0 ? matchingAccounts.map((account) => {
            const accountLabel = `${account.code} - ${account.accountDesc}`;
            return (
              <button
                key={account.id}
                type="button"
                role="option"
                aria-selected={account.id === value}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(account.id);
                  setQuery(accountLabel);
                  setIsOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[10px] text-slate-800 hover:bg-blue-50"
              >
                {accountLabel}
              </button>
            );
          }) : (
            <p className="px-3 py-2 text-[10px] text-slate-500">Akun COA aktif tidak ditemukan.</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};

interface FinanceJournalEditorProps {
  accounts: ChartOfAccount[];
  lines: FinanceJournalLine[];
  onChange: (lines: FinanceJournalLine[]) => void;
  onSaveDraft: () => void;
  onPost: () => void;
  postingLabel: string;
  isSaving?: boolean;
  canPost?: boolean;
}

const idr = (value: number) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
}).format(value);

export const FinanceJournalEditor: React.FC<FinanceJournalEditorProps> = ({
  accounts,
  lines,
  onChange,
  onSaveDraft,
  onPost,
  postingLabel,
  isSaving = false,
  canPost = true,
}) => {
  const totals = getFinanceJournalTotals(lines, accounts);
  const updateLine = (index: number, updates: Partial<FinanceJournalLine>) => {
    onChange(lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...updates } : line));
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2 xl:col-span-3">
      <div className="mb-3">
        <h2 className="text-[10px] font-black text-slate-900">Entry jurnal</h2>
        <p className="mt-1 text-[10px] text-slate-500">Pilih akun dengan mengetik kode atau nama COA, lalu isi posisi debit/kredit dan jumlah IDR. Jurnal hanya dapat diposting jika seimbang.</p>
      </div>
      <div className="finance-journal-table-scroll overflow-x-auto overscroll-x-contain pb-2">
        <table className="w-full min-w-[760px] table-fixed text-left text-[10px]">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[29%]" />
            <col className="w-[13%]" />
            <col className="w-[18%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-2 py-2">Akun</th>
              <th className="px-2 py-2">Deskripsi</th>
              <th className="w-32 px-2 py-2">D/K</th>
              <th className="w-48 px-2 py-2">Jumlah (IDR)</th>
              <th className="w-14 px-2 py-2"><span className="sr-only">Hapus</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              return (
              <tr key={line.id} className="border-b border-slate-200">
                <td className="px-2 py-2">
                  <AccountSearch
                    accounts={accounts}
                    value={line.coaId}
                    onChange={(coaId) => updateLine(index, { coaId })}
                    label={`Akun jurnal baris ${index + 1}`}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={line.memo}
                    onChange={(event) => updateLine(index, { memo: event.target.value })}
                    aria-label={`Deskripsi jurnal baris ${index + 1}`}
                    placeholder="Keterangan"
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[10px] text-slate-800"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`Debit atau kredit baris ${index + 1}`}
                    value={line.direction}
                    onChange={(event) => updateLine(index, { direction: event.target.value as FinanceJournalLine['direction'] })}
                    className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-[10px] text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="DEBIT">Debit</option>
                    <option value="CREDIT">Kredit</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <FormattedNumberInput
                    value={line.amount}
                    onValueChange={(amount) => updateLine(index, { amount: Number(amount) || 0 })}
                    label={`Jumlah jurnal baris ${index + 1}`}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-right font-mono text-[10px] text-slate-800"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    aria-label={`Hapus baris jurnal ${index + 1}`}
                    onClick={() => onChange(lines.filter((_, lineIndex) => lineIndex !== index))}
                    className="h-10 w-10 rounded-md border border-slate-200 text-lg text-rose-600 hover:bg-rose-50"
                  >×</button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onChange([...lines, createFinanceJournalLine()])}
          disabled={lines.length >= 200}
          className="rounded-md border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >+ Baris</button>
        <div className="text-[10px] text-slate-600">
          Debit <span className="font-mono font-semibold">Rp {idr(totals.debit)}</span>
          {' · '}Kredit <span className="font-mono font-semibold">Rp {idr(totals.credit)}</span>
          {' · '}Selisih <span className={`font-mono font-bold ${totals.difference === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>Rp {idr(Math.abs(totals.difference))}</span>
        </div>
      </div>
      {totals.issues.length > 0 && (
        <div role="alert" className="mt-2 text-[10px] font-semibold text-rose-700">{totals.issues.join(' ')}</div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onSaveDraft} disabled={isSaving} className="rounded-md border border-slate-200 px-4 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Simpan draft
        </button>
        <button type="button" onClick={onPost} disabled={isSaving || !canPost || totals.issues.length > 0} className="rounded-md bg-blue-700 px-4 py-2 text-[10px] font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
          {isSaving ? 'Menyimpan...' : postingLabel}
        </button>
        <button type="button" onClick={() => onChange([createFinanceJournalLine(), createFinanceJournalLine({ direction: 'CREDIT' })])} disabled={isSaving} className="rounded-md border border-slate-200 px-4 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Kosongkan
        </button>
      </div>
    </section>
  );
};
