import React, { useState } from 'react';
import { FileSpreadsheet, Plus, Trash2, Save, Ship, Building, CheckCircle2, Download, Printer, Eye, Send } from 'lucide-react';
import { JobCall, DisbursementItem, Currency, User, Vessel, FixTariff, ExpensesItem } from '../../types';
import { db, getCurrentBranchName, buildBranchAwareEPDANumber } from '../../db/storage';
import { calculateTariffForJob, CalculationBasis } from '../../utils/tariff';

interface QuotesEPDAViewProps {
  job?: JobCall;
  vessels: Vessel[];
  onSelectJob: (jobId: string) => void;
  allJobs: JobCall[];
  users: User[];
  fixTariffs?: FixTariff[];
  expensesItems?: ExpensesItem[];
  onDataSaved?: () => void;
}

export const QuotesEPDAView: React.FC<QuotesEPDAViewProps> = ({ job, vessels, users, fixTariffs = [], expensesItems = [], onDataSaved }) => {
  if (!job) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-200">
        Data EPDA belum tersedia untuk job yang dipilih.
      </div>
    );
  }

  const isReviewOnly = false;
  const epdaQuote = job.quotation?.epda || {
    quoteNo: '',
    date: job.inquiry?.date || new Date().toISOString().slice(0, 10),
    currency: job.currency || 'USD',
    items: [] as DisbursementItem[],
    totalBuyRate: 0,
    totalSellRate: 0,
    marginAmount: 0,
    marginPercentage: 0,
    status: 'DRAFT' as const,
  };
  const initialCurrency: Currency = epdaQuote.currency || job.currency || 'IDR';
  const [viewCurrency, setViewCurrency] = useState<Currency>(initialCurrency);
  const [items, setItems] = useState<DisbursementItem[]>(() => (epdaQuote.items || []).map((item) => ({
    ...item,
    currency: initialCurrency,
    totalBuyRate: Number(item.unitBuyRate || 0) * (item.quantity || 1),
    totalSellRate: Number(item.unitSellRate || item.unitBuyRate || 0) * (item.quantity || 1),
    unitSellRate: Number(item.unitSellRate || item.unitBuyRate || 0),
  })));
  const [exchangeRate, setExchangeRate] = useState<number>(job.exchangeRateUSDToIDR || 15800);
  const [isSaved, setIsSaved] = useState(false);
  const [itemEntryMode, setItemEntryMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'PORT_EXPENSES',
    basis: 'Per Call / Lump Sum',
    quantity: 1,
    unitBuyRate: 0,
    unitSellRate: 0,
    amount: 0,
    remarks: '',
    calculationBasis: 'PER_GRT' as CalculationBasis,
    tariffType: 'VARIABLE' as 'FIXED' | 'VARIABLE' | 'RANGE',
    rate: 0,
    minCharge: 0,
  });

  const formatAmount = (value: number) => viewCurrency === 'IDR'
    ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(value)
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);

  const formatDate = (value: string) => {
    const datePart = value?.split('T')[0] || '';
    const [year, month, day] = datePart.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value || '-';
  };

  const formatEntryAmount = (value: number | '') => {
    if (value === '') return '';
    return new Intl.NumberFormat(viewCurrency === 'IDR' ? 'id-ID' : 'en-US', {
      maximumFractionDigits: 4,
    }).format(value);
  };

  const parseEntryAmount = (value: string): number | '' => {
    if (!value.trim()) return '';
    const normalized = viewCurrency === 'IDR'
      ? value.replace(/[^0-9]/g, '')
      : (() => {
        const cleaned = value.replace(/[^0-9,.-]/g, '');
        const commaIndex = cleaned.lastIndexOf(',');
        const dotIndex = cleaned.lastIndexOf('.');
        return commaIndex > dotIndex
          ? cleaned.replace(/\./g, '').replace(',', '.')
          : cleaned.replace(/,/g, '');
      })();
    if (!normalized) return '';
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : '';
  };

  const totalBuyUSD = items.reduce((sum, it) => sum + it.totalBuyRate, 0);
  const totalSellUSD = items.reduce((sum, it) => sum + it.totalSellRate, 0);
  const marginUSD = totalSellUSD - totalBuyUSD;
  const marginPct = totalSellUSD > 0 ? ((marginUSD / totalSellUSD) * 100).toFixed(2) : '0.00';
  const documentDate = new Date(job.inquiry.date || job.createdAt);
  const creatorName = job.inquiry.createdBy.split(' (')[0].trim().toLowerCase();
  const creator = users.find((user) => user.name.trim().toLowerCase() === creatorName);
  const vesselMaster = vessels.find((vessel) => vessel.id === job.vesselId);
  const activeBranchName = getCurrentBranchName();
  const epdaNo = buildBranchAwareEPDANumber(job.jobId, activeBranchName, documentDate);
  const portMatches = (portId?: string, portName?: string) => {
    const currentPortId = (job.portId || job.inquiry?.portId || '').trim();
    const currentPortName = (job.portName || job.inquiry?.portName || '').trim();
    const targetPortId = portId?.trim();
    const targetPortName = portName?.trim();

    return (!!currentPortId && !!targetPortId && currentPortId === targetPortId)
      || (!!currentPortName && !!targetPortName && currentPortName.toLowerCase() === targetPortName.toLowerCase());
  };
  const autoServiceOptions = [
    ...fixTariffs
      .filter((tariff) => portMatches(tariff.portId, tariff.portName))
      .map((tariff) => ({
        name: tariff.serviceName,
        category: tariff.costCategory || 'PORT_EXPENSES',
        calculationBasis: tariff.calculationBasis,
        tariffType: tariff.tariffType || (tariff.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE'),
        rate: tariff.rate,
        minCharge: tariff.minCharge,
        currency: tariff.currency,
      })),
    ...expensesItems
      .filter((item) => portMatches(item.portId, item.portName))
      .map((item) => ({
        name: item.name,
        category: item.category,
        calculationBasis: 'PER_GRT' as CalculationBasis,
        tariffType: item.calculationType === 'FIXED' ? 'FIXED' : 'VARIABLE',
        rate: item.standardCostSell || 0,
        minCharge: item.standardCostBuy || 0,
        currency: item.defaultCurrency,
      })),
  ].filter((option, index, arr) => option.name && arr.findIndex((item) => item.name === option.name && item.category === option.category) === index);

  const applySelectedAutoService = (selectedName: string) => {
    const selected = autoServiceOptions.find((option) => option.name === selectedName);
    if (!selected) {
      setNewItem({ ...newItem, name: selectedName });
      return;
    }

    setViewCurrency(selected.currency ?? viewCurrency);
    setNewItem({
      ...newItem,
      name: selected.name,
      category: selected.category,
      calculationBasis: selected.tariffType === 'FIXED' ? 'LUMP_SUM' : selected.calculationBasis,
      tariffType: selected.tariffType,
      rate: selected.rate,
      minCharge: selected.minCharge,
    });
  };

  const persist = () => {
    const currencyItems = items.map((item) => ({ ...item, currency: viewCurrency }));
    db.updateJob(job.jobId, {
      exchangeRateUSDToIDR: exchangeRate,
      quotation: {
        ...job.quotation,
        epda: { ...job.quotation.epda, quoteNo: epdaNo, items: currencyItems, currency: viewCurrency, totalBuyRate: totalBuyUSD, totalSellRate: totalSellUSD, marginAmount: marginUSD, marginPercentage: Number(marginPct), status: 'SUBMITTED' },
      },
      currentStage: 'QUOTATION',
    });
  };

  const autosaveItems = (nextItems: DisbursementItem[]) => {
    if (isReviewOnly) return;
    const manualItems = nextItems.map((item) => ({
      ...item,
      currency: viewCurrency,
      quantity: item.quantity || 1,
      totalBuyRate: Number(item.totalBuyRate || 0),
      totalSellRate: Number(item.totalSellRate || 0),
      unitBuyRate: Number(item.unitBuyRate || 0),
      unitSellRate: Number(item.unitSellRate || 0),
    }));
    setItems(manualItems);
    db.updateJob(job.jobId, {
      quotation: {
        ...job.quotation,
        epda: { ...job.quotation.epda, quoteNo: epdaNo, items: manualItems, currency: viewCurrency },
      },
    });
    onDataSaved?.();
  };

  const handleQuickAddMasterData = () => {
    const itemName = newItem.name.trim();
    const rateValue = Number(newItem.unitBuyRate) || Number(newItem.rate) || 0;
    if (!itemName) {
      window.alert('Isi nama item service terlebih dahulu sebelum menambah data master.');
      return;
    }

    const portId = (job.portId || job.inquiry?.portId || '').trim();
    const portName = (job.portName || job.inquiry?.portName || '').trim();
    const quickRate = rateValue || Number(newItem.amount) || 0;

    const tariffPayload = {
      portId,
      portName,
      costCategory: newItem.category || 'PORT_EXPENSES',
      serviceCode: '',
      serviceName: itemName,
      calculationBasis: newItem.calculationBasis || 'LUMP_SUM',
      tariffType: newItem.tariffType || 'FIXED',
      currency: viewCurrency,
      rate: quickRate,
      minCharge: quickRate,
      description: newItem.remarks || 'Created from EPDA manual entry',
    };

    const expensePayload = {
      portId: portId || undefined,
      portName: portName || undefined,
      code: `EPDA-${Date.now().toString().slice(-6)}`,
      category: (newItem.category || 'PORT_EXPENSES') as any,
      name: itemName,
      unit: 'job',
      defaultCurrency: viewCurrency,
      standardCostBuy: quickRate,
      standardCostSell: quickRate,
      preferredVendor: '',
      calculationType: newItem.tariffType || 'FIXED',
    };

    db.addFixTariff(tariffPayload);
    db.addExpensesItem(expensePayload);
    window.alert('Data master item berhasil ditambahkan. Item baru akan muncul di daftar otomatis.');
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReviewOnly) return;
    if (!newItem.name.trim()) return;

    const quantity = Number(newItem.quantity) || 1;
    const selectedBasis = newItem.calculationBasis || 'PER_GRT';
    const selectedType = newItem.tariffType || (selectedBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');
    const manualRate = Number(newItem.unitBuyRate) || 0;
    const autoRate = Number(newItem.rate) || 0;
    const autoMinCharge = Number(newItem.minCharge) || 0;
    const tariffRate = itemEntryMode === 'AUTO' ? calculateTariffForJob({
      vesselGRT: vesselMaster?.grt || 0,
      estimatedDays: Number(job.inquiry?.estimatedDays || 0),
      hours: 1,
      moveCount: 1,
      rate: autoRate,
      minCharge: autoMinCharge,
      calculationBasis: selectedBasis,
      tariffType: selectedType,
    }) : manualRate;
    const calculatedAmount = quantity * tariffRate;
    const item: DisbursementItem = {
      id: `ITM-EPDA-${Date.now()}`,
      expenseItemId: '',
      name: newItem.name.trim(),
      category: newItem.category,
      basis: itemEntryMode === 'AUTO'
        ? `${selectedBasis.replace(/_/g, ' ')} · ${autoRate > 0 ? `Rp ${autoRate.toLocaleString('id-ID')}` : 'rate belum diisi'}`
        : newItem.basis,
      quantity,
      unitBuyRate: tariffRate,
      unitSellRate: Number(newItem.unitSellRate) || tariffRate,
      totalBuyRate: calculatedAmount,
      totalSellRate: calculatedAmount,
      currency: viewCurrency,
      remarks: newItem.remarks,
    };

    autosaveItems([...items, item]);
    setNewItem({
      name: '',
      category: 'PORT_EXPENSES',
      basis: 'Per Call / Lump Sum',
      quantity: 1,
      unitBuyRate: 0,
      unitSellRate: 0,
      amount: 0,
      remarks: '',
      calculationBasis: 'PER_GRT',
      tariffType: 'VARIABLE',
      rate: 0,
      minCharge: 0,
    });
  };

  const handleSubmit = () => {
    if (isReviewOnly) return;
    persist();
    onDataSaved?.();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3500);
  };

  const categoryRank: Record<string, number> = {
    PORT_EXPENSES: 1,
    PORT_DUES: 1,
    BERTHING: 1,
    PILOTAGE_TOWAGE: 1,
    CLEARANCE: 2,
    IMMIGRATION_CUSTOMS: 2,
    GENERAL_EXPENSES: 3,
    LOGISTICS_SUPPLIES: 3,
    SUNDRY: 3,
    CREW_EXPENSES: 4,
    CREW_CHANGE: 4,
    AGENCY_FEE: 5,
    TAX_CONTINGENCY: 6,
    OWNER_MATTER: 7,
  };
  const sortedItems = [...items].sort((left, right) => {
    const rankDifference = (categoryRank[left.category] || 99) - (categoryRank[right.category] || 99);
    return rankDifference || left.name.localeCompare(right.name);
  });
  const categoryLabel = (category: string) => {
    const map: Record<string, string> = {
      PORT_EXPENSES: 'PORT EXPENSES',
      CLEARANCE: 'CLEARANCE IN/OUT',
      GENERAL_EXPENSES: 'GENERAL EXPENSES',
      CREW_EXPENSES: 'CREW EXPENSES',
      AGENCY_FEE: 'AGENCY FEE',
      TAX_CONTINGENCY: 'TAX & CONTINGENCY',
      OWNER_MATTER: 'OWNER MATTER',
      VAT_11: 'VAT 11%',
      PPH_INCOME_TAX: 'PPH / INCOME TAX',
    };
    return map[category] || category.replaceAll('_', ' ');
  };
  const categoryTone = { screen: 'bg-slate-600 text-white', background: '#4b5563' };
  const groupedItems = sortedItems.reduce<Array<{ category: string; items: DisbursementItem[] }>>((groups, item) => {
    const existing = groups.find((group) => group.category === item.category);
    if (existing) existing.items.push(item);
    else groups.push({ category: item.category, items: [item] });
    return groups;
  }, []);
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const getBankFooterByCurrency = (currency: Currency) => currency === 'USD'
    ? '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK MANDIRI (Persero) Tbk</b><br>Address:<br>BANK MANDIRI TEBET SUPOMO<br>Jl. Prof. Dr.Supomo SH No 43, Tebet, RT.04/RW.03<br>Tebet barat , Kec. Tebet, Kota Jakarta Selatan,<br>Daerah Khusus Ibukota Jakarta 12810<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number (USD) : 120-00-5575599-0</b><br><b>Swift Code Bank : BMRIIDJAXXX</b></div><div class="signature">Sincerely,<br>PT. Lentera Global Maritim<br><br><br>Finance</div>'
    : '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK NEGARA INDONESIA (Persero) Tbk</b><br>Address:<br>BNI BIDAKARA<br>Jl. Gatot Subroto Kab 71-73, RT.12/RW.5, Tebet Timur,<br>Kec. Tebet, Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta 12820<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number : 2824-1212-09</b><br><b>Swift Code Bank : BNINIDJAXXX</b></div><div class="signature">Sincerely,<br>PT. Lentera Global Maritim<br><br><br>Finance</div>';
  const officeFooter = '<div class="office-footer" style="position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:9px;line-height:1.45;font-weight:600;color:#111;z-index:3;">Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br><span style="color:#dc2626;text-decoration:underline">email : maritim@lentera-global.com / web : www.lentera-global.com</span></div>';
  const printFooter = getBankFooterByCurrency(viewCurrency);
  const enhanceExportHeader = (html: string) => html
    .replaceAll('.brand-row{text-align:center;margin-bottom:10px}', '.brand-row{text-align:center;margin-bottom:12px}')
    .replaceAll('.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}', '.brand-wrap{display:inline-flex;align-items:center;gap:18px;text-align:left;min-height:78px}')
    .replaceAll('.logo{width:76px;height:58px;object-fit:contain}', '.logo{width:96px;height:72px;object-fit:contain}')
    .replaceAll('.brand{font-weight:700;font-size:21px;line-height:1.15}', '.brand{font-weight:700;font-size:23px;line-height:1.15}')
    .replaceAll('.tag{color:#666;font-size:13px;margin-top:5px}', '.tag{color:#555;font-size:15px;font-weight:600;margin-top:7px}')
    .replaceAll('.footer{position:fixed;bottom:0;width:100%;text-align:center;font-size:8px;color:#666}', '.office-footer{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:9px;line-height:1.45;color:#111;font-weight:600;z-index:3}.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.office-footer .contact{color:#e11d48;text-decoration:underline}')
    .replaceAll('.footer{left:0;right:0;text-align:center!important;font-size:12px;line-height:1.45;font-weight:600;color:#111}.footer .contact{color:#e11d48;text-decoration:underline}', '.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.office-footer{left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center!important;font-size:9px;line-height:1.45;font-weight:600;color:#111;z-index:3}.office-footer .contact{color:#e11d48;text-decoration:underline}')
    .replaceAll('th,td{border:1px solid #777;padding:6px 7px}th{background:#e8ecf2;text-align:left}', 'table{border:2px solid #6b7280}th,td{border:0;padding:6px 7px}th{background:#e8ecf2;text-align:center;border-bottom:2px solid #9ca3af}.item-row td{border:0}.subtotal td{border-top:1px solid #d1d5db}.office-footer{left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center!important;font-size:9px;line-height:1.45;font-weight:600;color:#111;z-index:3}.office-footer .contact{color:#e11d48;text-decoration:underline}')
    .replaceAll(job.inquiry.date, formatDate(job.inquiry.date))
    .replace(/<\/body>/i, `${printFooter}${officeFooter}</body>`);

  const formatExportTable = (html: string) => html
    .replace(/<thead><tr>[\s\S]*?<\/tr><\/thead>/g, '<thead><tr><th>NO.</th><th>DESCRIPTION</th><th>CURRENCY</th><th>AMOUNT</th><th>REMARKS</th></tr></thead>')
    .replaceAll('<table>', '<table style="width:100%;table-layout:fixed">')
    .replaceAll('<tr class="grand"><td colspan="2"', '<tr class="grand"><td colspan="3"')
    .replaceAll('</style>', 'table{table-layout:fixed!important}table th,table td{box-sizing:border-box!important}table th:nth-child(1),table td:nth-child(1){width:5%!important}table th:nth-child(2),table td:nth-child(2){width:42%!important}table th:nth-child(3),table td:nth-child(3){width:8%!important}table th:nth-child(4),table td:nth-child(4){width:17%!important}table th:nth-child(5),table td:nth-child(5){width:28%!important}table th{text-align:center!important}table td:nth-child(1),table td:nth-child(3){text-align:center!important}table td:nth-child(2),table td:nth-child(5){text-align:left!important}table td:nth-child(4){text-align:right!important;white-space:nowrap}table tr[style*="background:#4b5563"] td:first-child{padding-left:0!important;text-align:left!important}table tr.subtotal td:first-child,table tr.grand td:first-child{font-weight:700;text-align:right!important}table tr.subtotal td.amount,table tr.grand td.amount,table tr.subtotal td:nth-child(2),table tr.grand td:nth-child(2){font-variant-numeric:tabular-nums;text-align:right!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}.sign{display:none!important}</style>')
    .replace(/<div class="sign">[\s\S]*?<\/div>/, '');

  const buildDocument = () => {
    const amount = (value: number) => viewCurrency === 'IDR'
      ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)
      : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const rows = groupedItems.map((group) => {
      const groupRows = group.items.map((it, index) => `<tr class="item-row"><td>${index + 1}</td><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.currency || viewCurrency)}</td><td style="text-align:right">${amount(it.totalSellRate)}</td><td>${escapeHtml(it.remarks || '')}</td></tr>`).join('');
      const subtotal = group.items.reduce((sum, item) => sum + item.totalSellRate, 0);
      return `<tr style="background:${categoryTone.background};color:#fff;font-weight:700;text-transform:uppercase"><td colspan="5" style="text-align:left;padding-left:0">${escapeHtml(categoryLabel(group.category))}</td></tr>${groupRows}<tr class="subtotal" style="background:#f1f3f6;font-weight:700"><td colspan="3" style="text-align:right">SUBTOTAL</td><td class="amount" style="text-align:right">${amount(subtotal)}</td><td></td></tr>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${epdaNo}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px}.brand-row{text-align:center;margin-bottom:10px}.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}.logo{width:76px;height:58px;object-fit:contain}.brand{font-weight:700;font-size:21px;line-height:1.15}.tag{color:#666;font-size:13px;margin-top:5px}h2{text-align:center;background:#182a50;color:white;padding:8px;font-size:13px;margin:18px 0 12px}.meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 34px;margin-bottom:12px}.meta-col{display:flex;flex-direction:column;gap:4px}.meta-col.right{justify-self:stretch}.meta-row{display:grid;grid-template-columns:125px 10px minmax(0,1fr);line-height:1.35}.meta-row .label{font-weight:700}.meta-row .colon{text-align:center}.meta-col.right .meta-row{grid-template-columns:85px 10px minmax(0,1fr)}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px 7px}th{background:#e8ecf2;text-align:left}.grand{font-weight:700}.sign{margin-top:34px;text-align:right}.footer{position:fixed;bottom:0;width:100%;text-align:center;font-size:8px;color:#666}</style></head><body><div class="brand-row"><div class="brand-wrap"><img class="logo" src="/lenteraglobalmaritim/lgm-logo.png" alt="LGM"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div><h2>ESTIMATE PORT DISBURSEMENT OF ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">No.</span><span class="colon">:</span><span>${epdaNo}</span></div><div class="meta-row"><span class="label">Date Inquiry</span><span class="colon">:</span><span>${job.inquiry.date}</span></div><div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${escapeHtml(job.customerName)}</span></div><div class="meta-row"><span class="label">Job/Vessel Call ID</span><span class="colon">:</span><span>${job.jobId}</span></div></div><div class="meta-col right"><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${escapeHtml(job.portName)}</span></div><div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${escapeHtml(job.vesselName)}</span></div><div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${job.eta}</span></div><div class="meta-row"><span class="label">GRT</span><span class="colon">:</span><span>${vesselMaster?.grt?.toLocaleString() || '-'}</span></div></div></div><table><thead><tr><th>NO.</th><th>DESCRIPTION</th><th>AMOUNT ${viewCurrency}</th><th>REMARKS</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="grand"><td colspan="2" style="text-align:right">GRAND TOTAL</td><td style="text-align:right">${amount(totalSellUSD)}</td><td></td></tr></tfoot></table><div class="sign">Banjarmasin, ${new Date().toLocaleDateString('id-ID')}<br><br><br><b>PT. Lentera Global Maritim</b></div><div class="footer">PT Lentera Global Maritim • Shipping Agency • ${epdaNo}</div></body></html>`;
  };

  const openPreview = (print = false) => {
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) return;
    const inquiryMeta = `<div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">No EPDA</span><span class="colon">:</span><span>${epdaNo}</span></div><div class="meta-row"><span class="label">Date Inquiry</span><span class="colon">:</span><span>${formatDate(job.inquiry.date)}</span></div><div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${escapeHtml(job.customerName)}</span></div><div class="meta-row"><span class="label">GRT</span><span class="colon">:</span><span>${vesselMaster?.grt?.toLocaleString('id-ID') || '-'}</span></div><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${escapeHtml(job.portName)}</span></div><div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${escapeHtml(job.eta || '-')}</span></div></div><div class="meta-col right"><div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${escapeHtml(job.vesselName)}</span></div><div class="meta-row"><span class="label">Estimated Day</span><span class="colon">:</span><span>${job.inquiry.estimatedDays || '-'}</span></div><div class="meta-row"><span class="label">Flag</span><span class="colon">:</span><span>${escapeHtml(vesselMaster?.flag || '-')}</span></div><div class="meta-row"><span class="label">Cargo Details</span><span class="colon">:</span><span>${escapeHtml(job.inquiry.cargoDetails || '-')}</span></div><div class="meta-row"><span class="label">IMO</span><span class="colon">:</span><span>${escapeHtml(vesselMaster?.imoNumber || '-')}</span></div></div></div>`;
    const html = formatExportTable(enhanceExportHeader(buildDocument())).replace(/<div class="footer">PT Lentera Global Maritim • Shipping Agency • [^<]*<\/div>/, '').replaceAll('class="meta-col right"', 'class="meta-col right" style="padding-right:18px"').replaceAll('>No.</span>', '>No EPDA</span>');
    const onePageHtml = html.replace('</style>', '@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;font-size:10px;color:#172033}.brand-row{margin-bottom:8px}.brand-wrap{min-height:58px;gap:12px}.logo{width:78px;height:58px}.brand{font-size:20px;color:#3562a8}.tag{font-size:11px;color:#3562a8;margin-top:3px}h2{background:#214f84;font-size:12px;padding:5px;margin:8px 0 9px}.meta{gap:2px 28px;margin-bottom:9px}.meta-col{gap:2px}.meta-row{line-height:1.25}.meta-row .label{font-size:10px}table{page-break-inside:avoid;table-layout:fixed;border:1px solid #9ca3af;border-collapse:collapse}tr{page-break-inside:avoid}th,td{padding:4px 5px;font-size:9px;border:1px solid #9ca3af!important}thead th,table thead th{background:#dbe8f2!important;text-align:center!important;border-bottom:1px solid #9ca3af!important}table th:nth-child(1),table td:nth-child(1){width:5%!important;text-align:center!important}table th:nth-child(2),table td:nth-child(2){width:42%!important;text-align:left!important}table th:nth-child(3),table td:nth-child(3){width:8%!important;text-align:center!important}table th:nth-child(4),table td:nth-child(4){width:17%!important;text-align:right!important;white-space:nowrap}table th:nth-child(5),table td:nth-child(5){width:28%!important;text-align:left!important}thead th:nth-child(1),thead th:nth-child(2),thead th:nth-child(3),thead th:nth-child(4),thead th:nth-child(5){text-align:center!important}.item-row td{background:#fff!important;border:1px solid #9ca3af!important}.subtotal{background:#dbe8f2!important;font-weight:700}.subtotal td{border-top:1px solid #9ca3af!important}.grand{background:#dbe8f2!important;color:#f00;font-weight:800}.grand td{border-top:1px solid #9ca3af!important}.subtotal td:first-child,.grand td:first-child{text-align:right!important}.subtotal td.amount,.grand td.amount{padding-left:0!important;padding-right:4px!important;text-align:right!important;white-space:nowrap}.bank{display:inline-block;width:42%;margin-top:16px;border:1px solid #777;padding:8px;font-size:8px;line-height:1.3;vertical-align:top}.signature{display:inline-block;width:42%;margin:16px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.footer{margin-top:16px;text-align:center;font-size:9px;line-height:1.35;font-weight:600}.footer .contact{color:#e11d48;text-decoration:underline}</style>');
    w.document.write(onePageHtml.replace(/<div class="meta">[\s\S]*?(?=<table(?:\s|>))/i, inquiryMeta));
    w.document.close();
    if (print) w.onload = () => { w.focus(); w.print(); };
  };

  const downloadExcel = () => {
    const amountValue = (value: number) => viewCurrency === 'IDR' ? value.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = groupedItems.map((group) => {
      const groupRows = group.items.map((it, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.currency || viewCurrency)}</td><td class="amount">${amountValue(it.totalSellRate)}</td><td>${escapeHtml(it.remarks || '')}</td></tr>`).join('');
      const subtotal = group.items.reduce((sum, item) => sum + item.totalSellRate, 0);
      return `<tr style="background:${categoryTone.background};color:#fff;font-weight:700;text-transform:uppercase"><td colspan="5" style="text-align:left;padding-left:0">${escapeHtml(categoryLabel(group.category))}</td></tr>${groupRows}<tr class="subtotal" style="background:#f1f3f6;font-weight:700"><td colspan="3">SUBTOTAL</td><td class="amount">${amountValue(subtotal)}</td><td></td></tr>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#172033}.header{text-align:center;padding:14px}.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}.logo{width:76px;height:58px;object-fit:contain}.brand{font-weight:700;font-size:21px;line-height:1.15}.tag{color:#666;font-size:13px;margin-top:5px}h2{text-align:center;background:#182a50;color:white;padding:8px;font-size:13px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 34px;margin-bottom:12px}.meta-col{display:flex;flex-direction:column;gap:4px}.meta-row{display:grid;grid-template-columns:125px 10px minmax(0,1fr)}.meta-col.right .meta-row{grid-template-columns:85px 10px minmax(0,1fr)}.meta-row .label{font-weight:700}.meta-row .colon{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px 7px}th{background:#e8ecf2;text-align:left}.amount{text-align:right}.grand{font-weight:700}</style></head><body><div class="header"><div class="brand-wrap"><img class="logo" src="/lenteraglobalmaritim/lgm-logo.png" alt="LGM"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div><h2>ESTIMATE PORT DISBURSEMENT OF ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">No.</span><span class="colon">:</span><span>${epdaNo}</span></div><div class="meta-row"><span class="label">Date Inquiry</span><span class="colon">:</span><span>${job.inquiry.date}</span></div><div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${escapeHtml(job.customerName)}</span></div><div class="meta-row"><span class="label">Job/Vessel Call ID</span><span class="colon">:</span><span>${job.jobId}</span></div></div><div class="meta-col right"><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${escapeHtml(job.portName)}</span></div><div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${escapeHtml(job.vesselName)}</span></div><div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${job.eta}</span></div><div class="meta-row"><span class="label">GRT</span><span class="colon">:</span><span>${vesselMaster?.grt?.toLocaleString() || '-'}</span></div></div></div><table><thead><tr><th>NO.</th><th>DESCRIPTION</th><th>AMOUNT ${viewCurrency}</th><th>REMARKS</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="grand"><td colspan="2">GRAND TOTAL</td><td class="amount">${amountValue(totalSellUSD)}</td><td></td></tr></tfoot></table></body></html>`;
    const alignedHtml = formatExportTable(enhanceExportHeader(html)).replaceAll('class="meta-col right"', 'class="meta-col right" style="padding-right:18px"');
    const blob = new Blob([alignedHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${epdaNo.replaceAll('/', '-')}.xls`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 epda-form-root">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase"><FileSpreadsheet className="w-4 h-4"/><span>SALES / EPDA</span><span className="text-cyan-300">• JOB ID: {job.jobId}</span></div>
          <h1 className="text-2xl font-black text-white mt-1">Quotes EPDA</h1>
          <p className="text-xs text-slate-400">Estimate Port Disbursement of Account sesuai format dokumen PDF LGM.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800"><button onClick={() => setViewCurrency('IDR')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewCurrency==='IDR'?'bg-emerald-600 text-white':'text-slate-400'}`}>IDR (Rp)</button><button onClick={() => setViewCurrency('USD')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewCurrency==='USD'?'bg-emerald-600 text-white':'text-slate-400'}`}>USD ($)</button></div>
          <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">Kurs USD <input value={exchangeRate} onChange={e=>setExchangeRate(Number(e.target.value)||0)} className="w-20 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white text-right"/></div>
          {!isReviewOnly && <button onClick={handleSubmit} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"><Send className="w-4 h-4"/>Kirim ke Manager OPS</button>}
          {isReviewOnly && <span className="px-3.5 py-2 rounded-xl bg-slate-700 text-white text-xs font-bold">REVIEW ONLY · APPROVED</span>}
        </div>
      </div>

      {isSaved && <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/>EPDA tersimpan dan status menjadi SUBMITTED untuk Manager OPS.</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><span className="text-xs uppercase font-bold text-slate-400">No. EPDA</span><b className="block mt-1 text-cyan-300 font-mono">{epdaNo}</b></div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><span className="text-xs uppercase font-bold text-slate-400">Principal / Vessel</span><b className="block mt-1 text-white">{job.customerName} • {job.vesselName}</b></div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><span className="text-xs uppercase font-bold text-slate-400">Grand Total</span><b className="block mt-1 text-emerald-300 font-mono">{formatAmount(totalSellUSD)}</b></div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">Inquiry Vessel Details</div>
            <h2 className="text-lg font-black text-white mt-1">Informasi Lengkap Inquiry Vessel</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Inquiry No</div><div className="mt-1 font-bold text-cyan-300 font-mono">{job.inquiry.inquiryNo}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Tanggal Inquiry</div><div className="mt-1 font-bold text-white">{job.inquiry.date ? formatDate(job.inquiry.date) : '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Status Inquiry</div><div className="mt-1 font-bold text-emerald-300">{job.inquiry.status}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Dibuat Oleh</div><div className="mt-1 font-bold text-white">{job.inquiry.createdBy || 'System'}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Branch</div><div className="mt-1 font-bold text-white">{job.inquiry.createdByBranch || creator?.branch || 'Head Office'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Vessel</div><div className="mt-1 font-bold text-white">{job.vesselName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">IMO</div><div className="mt-1 font-bold text-white font-mono">{vesselMaster?.imoNumber || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Call Sign / Flag</div><div className="mt-1 font-bold text-white font-mono">{vesselMaster?.callSign || '-'} / {vesselMaster?.flag || '-'}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Principal</div><div className="mt-1 font-bold text-white">{job.customerName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Port</div><div className="mt-1 font-bold text-white">{job.portName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETA</div><div className="mt-1 font-bold text-white font-mono">{formatDate(job.eta)}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETD</div><div className="mt-1 font-bold text-white font-mono">{formatDate(job.etd)}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Keterangan ETA</div><div className="mt-1 font-bold text-white">{job.inquiry.etaRemarks || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Keterangan ETD</div><div className="mt-1 font-bold text-white">{job.inquiry.etdRemarks || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Quantity</div><div className="mt-1 font-bold text-white">{job.inquiry.quantity || 0} {job.inquiry.quantityUnit || 'TON'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Purpose</div><div className="mt-1 font-bold text-white">{job.purposeOfCall}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Estimated Days</div><div className="mt-1 font-bold text-white">{job.inquiry.estimatedDays || 0} hari</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Cargo Details</div><div className="mt-1 font-bold text-white">{job.inquiry.cargoDetails || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Vessel Type</div><div className="mt-1 font-bold text-white">{vesselMaster?.vesselType || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Gross / Net / DWT</div><div className="mt-1 font-bold text-white font-mono">{vesselMaster?.grt?.toLocaleString() || '-'} / {vesselMaster?.nrt?.toLocaleString() || '-'} / {vesselMaster?.dwt?.toLocaleString() || '-'}</div></div>

          <div className="md:col-span-2 xl:col-span-4 bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 uppercase tracking-wider">Special Requirements</div>
            <div className="mt-1 text-white leading-relaxed">{job.inquiry.specialRequirements || 'Tidak ada requirement khusus.'}</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4"><div><h2 className="text-base font-bold text-white uppercase tracking-wider">Hasil Quotes EPDA</h2><span className="text-xs text-slate-400">Hasil entry data manual Estimasi Biaya</span></div><div className="flex flex-wrap gap-2"><button onClick={()=>openPreview(false)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5"/>Lihat Hasil EPDA</button><button onClick={downloadExcel} className="px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5"><Download className="w-3.5 h-3.5"/>Download Excel</button><button onClick={()=>openPreview(true)} className="px-3 py-2 rounded-lg bg-white text-slate-900 text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5"/>Cetak / PDF</button></div></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs border-separate border-spacing-0"><thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider"><tr><th className="p-3.5 border-l border-slate-700">No</th><th className="p-3.5 border-l border-slate-700">Description</th><th className="p-3.5 border-l border-slate-700">Currency</th><th className="p-3.5 text-right border-l border-slate-700">Amount</th><th className="p-3.5 border-l border-slate-700">Remark</th></tr></thead><tbody className="divide-y divide-slate-800">{groupedItems.map((group) => <React.Fragment key={group.category}><tr className={`${categoryTone.screen} font-bold`}><td colSpan={5} style={{ color: '#fff', backgroundColor: '#4b5563' }} className="p-2.5 font-black uppercase tracking-[0.16em] border-l border-slate-700">{categoryLabel(group.category)}</td></tr>{group.items.map((it, index) => <tr key={it.id} className="transition-colors hover:bg-slate-700/40"><td className="p-3.5 font-mono text-slate-300 border-l border-slate-800">{index + 1}</td><td className="p-3.5 font-bold text-white border-l border-slate-800">{it.name}</td><td className="p-3.5 font-mono text-cyan-300 uppercase border-l border-slate-800">{it.currency || viewCurrency}</td><td className="p-3.5 text-right font-mono font-bold text-white border-l border-slate-800">{formatAmount(it.totalSellRate)}</td><td className="p-3.5 text-slate-300 border-l border-slate-800"><div className="flex items-center justify-between gap-3"><span>{it.remarks || '-'}</span><button type="button" onClick={() => autosaveItems(items.filter((item) => item.id !== it.id))} className="p-1.5 rounded-md text-rose-300 hover:bg-rose-500/20 hover:text-rose-200" title="Hapus item EPDA" aria-label={`Hapus ${it.name}`}><Trash2 className="w-3.5 h-3.5" /></button></div></td></tr>)}<tr className="bg-slate-950/70"><td colSpan={3} className="p-2.5 text-right font-bold uppercase tracking-wider text-slate-200 border-l border-slate-800">SUB TOTAL</td><td className="p-2.5 text-right font-mono font-bold text-white border-l border-slate-800">{formatAmount(group.items.reduce((sum, item) => sum + item.totalSellRate, 0))}</td><td className="border-l border-slate-800" /></tr></React.Fragment>)}</tbody><tfoot className="bg-slate-950"><tr><td colSpan={3} className="p-3.5 text-right font-black uppercase tracking-wider text-white border-l border-slate-800">GRAND TOTAL</td><td className="p-3.5 text-right font-mono text-lg font-black text-white border-l border-slate-800">{formatAmount(totalSellUSD)}</td><td className="border-l border-slate-800"/></tr></tfoot></table></div>
      </div>

      {!isReviewOnly && <div className="rounded-2xl border border-slate-300 bg-[#edf2f4] p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2 text-emerald-600">
            <Plus className="h-4 w-4" />
            <h3 className="text-[15px] font-bold uppercase tracking-wide text-slate-700">
              {itemEntryMode === 'AUTO' ? 'Tambah Item EPDA Otomatis' : 'Tambah Item EPDA Manual'}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setItemEntryMode('AUTO')} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${itemEntryMode === 'AUTO' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>
              Otomatis
            </button>
            <button type="button" onClick={() => setItemEntryMode('MANUAL')} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${itemEntryMode === 'MANUAL' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>
              Manual
            </button>
          </div>

          <div className="flex items-center gap-2">
            {itemEntryMode === 'MANUAL' && (
              <button type="button" onClick={handleQuickAddMasterData} className="flex items-center gap-1.5 rounded-xl border border-violet-500 bg-violet-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-violet-500 shadow-sm">
                <Plus className="h-4 w-4" />
                TAMBAH DATA MASTER
              </button>
            )}
            <button type="submit" form={itemEntryMode === 'AUTO' ? 'epda-auto-entry-form' : 'epda-entry-form'} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 shadow-sm">
              <Plus className="h-4 w-4" />
              TAMBAH ITEM
            </button>
          </div>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          {itemEntryMode === 'AUTO'
            ? 'Mode otomatis: tarif dihitung dari basis port/vessel dan data estimasi job, lalu diinput ke item EPDA.'
            : 'Mode manual: semua data item EPDA diisi langsung tanpa master tarif atau expenses.'}
        </p>

        {itemEntryMode === 'AUTO' ? (
          <form id="epda-auto-entry-form" onSubmit={handleAddItem} className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-slate-600">Item Service</label>
              {autoServiceOptions.length > 0 ? (
                <select
                  value={newItem.name}
                  onChange={(e) => applySelectedAutoService(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Pilih item service</option>
                  {autoServiceOptions.map((option) => (
                    <option key={`${option.name}-${option.category}`} value={option.name}>{option.name}</option>
                  ))}
                </select>
              ) : (
                <input required value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Nama service otomatis" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"/>
              )}
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Category Cost</label>
              <select value={newItem.category} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500">
                <option value="PORT_EXPENSES">PORT EXPENSES</option>
                <option value="CLEARANCE">CLEARANCE IN/OUT</option>
                <option value="GENERAL_EXPENSES">GENERAL EXPENSES</option>
                <option value="CREW_EXPENSES">CREW EXPENSES</option>
                <option value="AGENCY_FEE">AGENCY FEE</option>
                <option value="TAX_CONTINGENCY">TAX &amp; CONTINGENCY</option>
                <option value="OWNER_MATTER">OWNER MATTER</option>
                <option value="VAT_11">VAT 11%</option>
                <option value="PPH_INCOME_TAX">PPH / INCOME TAX</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Basis</label>
              <select value={newItem.calculationBasis} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500">
                <option value="PER_GRT">Per GRT</option>
                <option value="PER_DAY">Per Day</option>
                <option value="LUMP_SUM">Lump Sum</option>
                <option value="PER_HOUR">Per Hour</option>
                <option value="PER_MOVE">Per Move</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Type</label>
              <select value={newItem.tariffType} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500">
                <option value="FIXED">Fixed</option>
                <option value="VARIABLE">Variabel</option>
                <option value="RANGE">Range</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Rate</label>
              <input type="text" inputMode="decimal" readOnly value={formatEntryAmount(Number(newItem.rate) || 0)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Min Charge</label>
              <input type="text" inputMode="decimal" readOnly value={formatEntryAmount(Number(newItem.minCharge) || 0)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">QTY</label>
              <input type="number" min="1" step="1" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div className="lg:col-span-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="mb-1 block text-slate-600">Basis Value</label>
                <input readOnly value={newItem.calculationBasis === 'PER_GRT' ? `${vesselMaster?.grt?.toLocaleString('id-ID') || 0} GRT` : newItem.calculationBasis === 'PER_DAY' ? `${job.inquiry?.estimatedDays || 0} hari` : '1 lump sum'} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"/>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Tarif ({viewCurrency})</label>
                <input readOnly value={formatEntryAmount(calculateTariffForJob({ vesselGRT: vesselMaster?.grt || 0, estimatedDays: Number(job.inquiry?.estimatedDays || 0), hours: 1, moveCount: 1, rate: Number(newItem.rate) || 0, minCharge: Number(newItem.minCharge) || 0, calculationBasis: newItem.calculationBasis }))} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"/>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Amount</label>
                <input readOnly value={formatEntryAmount((Number(newItem.quantity) || 1) * calculateTariffForJob({ vesselGRT: vesselMaster?.grt || 0, estimatedDays: Number(job.inquiry?.estimatedDays || 0), hours: 1, moveCount: 1, rate: Number(newItem.rate) || 0, minCharge: Number(newItem.minCharge) || 0, calculationBasis: newItem.calculationBasis }))} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"/>
              </div>
            </div>
            <div className="lg:col-span-6">
              <label className="mb-1 block text-slate-600">Remark</label>
              <input value={newItem.remarks} onChange={e => setNewItem({ ...newItem, remarks: e.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"/>
            </div>
          </form>
        ) : (
          <form id="epda-entry-form" onSubmit={handleAddItem} className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-slate-600">Item Service</label>
              <input required value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Nama service manual" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Category Cost</label>
              <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none">
                <option value="PORT_EXPENSES">PORT EXPENSES</option>
                <option value="CLEARANCE">CLEARANCE IN/OUT</option>
                <option value="GENERAL_EXPENSES">GENERAL EXPENSES</option>
                <option value="CREW_EXPENSES">CREW EXPENSES</option>
                <option value="AGENCY_FEE">AGENCY FEE</option>
                <option value="TAX_CONTINGENCY">TAX &amp; CONTINGENCY</option>
                <option value="OWNER_MATTER">OWNER MATTER</option>
                <option value="VAT_11">VAT 11%</option>
                <option value="PPH_INCOME_TAX">PPH / INCOME TAX</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Type</label>
              <select value={newItem.tariffType} onChange={e => setNewItem({ ...newItem, tariffType: e.target.value as 'FIXED' | 'VARIABLE' | 'RANGE' })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none">
                <option value="FIXED">Fixed</option>
                <option value="VARIABLE">Variabel</option>
                <option value="RANGE">Range</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">QTY</label>
              <input type="number" min="1" step="1" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Tarif ({viewCurrency})</label>
              <input type="text" inputMode="decimal" value={formatEntryAmount(newItem.unitBuyRate)} onChange={e => setNewItem({ ...newItem, unitBuyRate: parseEntryAmount(e.target.value) as number })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Amount</label>
              <input type="text" value={formatEntryAmount((Number(newItem.quantity) || 1) * (Number(newItem.unitBuyRate) || 0))} readOnly className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"/>
            </div>
            <div className="lg:col-span-6">
              <label className="mb-1 block text-slate-600">Remark</label>
              <input value={newItem.remarks} onChange={e => setNewItem({ ...newItem, remarks: e.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"/>
            </div>
          </form>
        )}

        <div className="mt-3 text-[10px] text-slate-500">
          {itemEntryMode === 'AUTO'
            ? 'Formula otomatis: basis x rate, dengan minimum charge yang diizinkan.'
            : 'Amount dihitung otomatis dari QTY x Tarif. Data item lainnya tetap diisi secara manual.'}
        </div>
      </div>}
    </div>
  );
};
