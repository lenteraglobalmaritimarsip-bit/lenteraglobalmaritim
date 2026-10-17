import React, { useMemo, useState } from 'react';
import { ExpensesItem, FixTariff } from '../../types';
import { formatCostCategoryLabel } from '../../utils/costCategories';

export interface MasterItemSearchOption {
  key: string;
  name: string;
  category: string;
  label: string;
  compatible: boolean;
  reason: string;
}

export const createMasterItemSearchOptions = (
  fixTariffs: FixTariff[],
  expensesItems: ExpensesItem[],
  eligibleKeys: Set<string>,
): MasterItemSearchOption[] => {
  const candidates = new Map<string, {
    name: string;
    category: string;
    ports: Set<string>;
    sources: Set<string>;
  }>();
  const addCandidate = (name: string, category: string, portName: string, source: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const key = JSON.stringify([cleanName, category]);
    const candidate = candidates.get(key) || {
      name: cleanName,
      category,
      ports: new Set<string>(),
      sources: new Set<string>(),
    };
    if (portName.trim()) candidate.ports.add(portName.trim());
    candidate.sources.add(source);
    candidates.set(key, candidate);
  };

  fixTariffs.forEach((tariff) => addCandidate(
    tariff.serviceName,
    tariff.costCategory || 'PORT_EXPENSES',
    tariff.portName || '',
    'FIX_TARIFF',
  ));
  expensesItems.forEach((item) => addCandidate(
    item.name,
    item.category,
    item.portName || '',
    'EXPENSES_ITEM',
  ));

  return Array.from(candidates, ([key, candidate]) => {
    const compatible = eligibleKeys.has(key);
    const sourceRules = [
      candidate.sources.has('FIX_TARIFF') ? 'port, mata uang, atau rentang GRT Fix Tariff' : '',
      candidate.sources.has('EXPENSES_ITEM') ? 'port atau mata uang Expenses Item' : '',
    ].filter(Boolean).join(' / ');
    const ports = Array.from(candidate.ports).sort((first, second) => first.localeCompare(second));
    return {
      key,
      name: candidate.name,
      category: candidate.category,
      label: `${candidate.name} ${formatCostCategoryLabel(candidate.category)} ${ports.join(' ')}`,
      compatible,
      reason: sourceRules ? `tidak sesuai ${sourceRules} Job ini` : 'tarif master tidak tersedia',
    };
  }).sort((first, second) =>
    first.name.localeCompare(second.name) || first.category.localeCompare(second.category)
  );
};

interface MasterItemSearchProps {
  options: MasterItemSearchOption[];
  value: string;
  onSelect: (key: string) => void;
  onIncompatibleSelect: (option: MasterItemSearchOption) => void;
  placeholder: string;
  ariaLabel: string;
}

export const MasterItemSearch: React.FC<MasterItemSearchProps> = ({
  options,
  value,
  onSelect,
  onIncompatibleSelect,
  placeholder,
  ariaLabel,
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [warning, setWarning] = useState('');
  const selected = options.find((option) => option.key === value);
  const filteredOptions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return [];
    return options.filter((option) => option.name.toLocaleLowerCase().includes(search));
  }, [options, query]);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
          setQuery('');
          setIsSearching(false);
        }
      }}
    >
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={`master-item-options-${ariaLabel.replace(/[^a-z0-9]/gi, '-')}`}
        placeholder={placeholder}
        value={isSearching ? query : selected?.name || ''}
        onFocus={(event) => {
          setQuery('');
          setWarning('');
          setIsOpen(false);
          setIsSearching(true);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setWarning('');
          setIsOpen(!!event.target.value.trim());
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
            setQuery('');
            setIsSearching(false);
          }
        }}
        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
      />
      {isOpen && (
        <div
          id={`master-item-options-${ariaLabel.replace(/[^a-z0-9]/gi, '-')}`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-xl"
        >
          {warning && (
            <div role="alert" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              <p className="font-semibold">Data belum cocok, lakukan entry manual</p>
              <p className="mt-0.5 text-[10px] text-amber-800">
                Nama master tetap dapat dijadikan referensi. Pilih mode Manual untuk menggunakannya.
              </p>
            </div>
          )}
          {filteredOptions.length ? filteredOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={option.key === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (!option.compatible) {
                  onIncompatibleSelect(option);
                  setWarning('incompatible');
                  return;
                }
                onSelect(option.key);
                setWarning('');
                setQuery('');
                setIsOpen(false);
                setIsSearching(false);
              }}
              className={`block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 ${
                option.compatible
                  ? 'text-slate-700 hover:bg-emerald-50'
                  : 'text-slate-400 hover:bg-amber-50'
              }`}
            >
              <span className="block font-semibold">{option.name}</span>
            </button>
          )) : (
            <p className="p-3 text-xs text-slate-500">Tidak ada nama item yang cocok.</p>
          )}
        </div>
      )}
    </div>
  );
};
