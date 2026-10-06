import React, { useEffect, useRef, useState } from 'react';
import {
  Users,
  Building2,
  Ship,
  MapPin,
  Compass,
  Coins,
  Receipt,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Check,
  ShieldAlert,
  Upload,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  User,
  Customer,
  Vessel,
  Port,
  Zone,
  FixTariff,
  ExpensesItem,
  VendorPartner,
  BankAccount,
  UserRole,
  ActiveTab,
} from '../../types';
import { db } from '../../db/storage';
import { saveStoredAccount } from '../../auth';
import { apiAuth } from '../../lib/api';
import { formatTariffNumber, getTariffRateForCurrency, parseTariffNumber } from '../../utils/tariff';

interface AdminMasterDataViewProps {
  initialTab?: 'USERS' | 'CUSTOMERS' | 'VESSELS' | 'PORTS' | 'ZONES' | 'FIX_TARIFF' | 'EXPENSES_ITEM' | 'VENDOR_PARTNERS' | 'BANK_ACCOUNT';
  users: User[];
  customers: Customer[];
  vessels: Vessel[];
  ports: Port[];
  zones: Zone[];
  fixTariffs: FixTariff[];
  expensesItems: ExpensesItem[];
  vendorPartners?: VendorPartner[];
  bankAccounts?: BankAccount[];
  onDataSaved?: (returnToTab?: ActiveTab) => void;
}

export const AdminMasterDataView: React.FC<AdminMasterDataViewProps> = ({
  initialTab = 'USERS',
  users,
  customers,
  vessels,
  ports,
  zones,
  fixTariffs,
  expensesItems,
  vendorPartners = [],
  bankAccounts = [],
  onDataSaved,
}) => {
  const formatMasterRate = (value: unknown) => {
    const parsed = parseTariffNumber(value, Number.NaN);
    if (!Number.isFinite(parsed) || parsed === 0) return '-';
    return new Intl.NumberFormat('en-US', { useGrouping: true, maximumFractionDigits: 8 }).format(parsed);
  };
  const formatRateInput = (value: unknown) => {
    const parsed = parseTariffNumber(value, Number.NaN);
    return Number.isFinite(parsed)
      ? new Intl.NumberFormat('en-US', { useGrouping: true, maximumFractionDigits: 8 }).format(parsed)
      : '';
  };
  const formatMasterNumber = (value: unknown) => formatTariffNumber(value);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormError, setAddFormError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState<Partial<User> & { newPassword?: string }>({});
  const [userEditError, setUserEditError] = useState('');
  const [editingMaster, setEditingMaster] = useState<
    { type: 'CUSTOMERS' | 'VESSELS' | 'PORTS' | 'FIX_TARIFF' | 'EXPENSES_ITEM' | 'VENDOR_PARTNERS' | 'BANK_ACCOUNT'; id: string } | null
  >(null);
  const [editMasterForm, setEditMasterForm] = useState<any>({});

  const openMasterEditor = (
    type: 'CUSTOMERS' | 'VESSELS' | 'PORTS' | 'FIX_TARIFF' | 'EXPENSES_ITEM' | 'VENDOR_PARTNERS' | 'BANK_ACCOUNT',
    item: Customer | Vessel | Port | FixTariff | ExpensesItem | VendorPartner | BankAccount
  ) => {
    setShowAddModal(false);
    setAddFormError('');
    setEditingMaster({ type, id: item.id });
    setEditMasterForm({ ...item });
  };

  const closeMasterEditor = () => {
    setEditingMaster(null);
    setEditMasterForm({});
    setAddFormError('');
  };

  const saveMasterEditor = async (e: React.FormEvent | null) => {
    e?.preventDefault();
    if (!editingMaster) return;

    try {
      const { type, id } = editingMaster;
      if (type === 'CUSTOMERS') await db.updateCustomer(id, editMasterForm);
      if (type === 'VESSELS') await db.updateVessel(id, editMasterForm);
      if (type === 'PORTS') await db.updatePort(id, editMasterForm);
      if (type === 'FIX_TARIFF') {
        const port = ports.find((p) => p.id === editMasterForm.portId);
        const rateIDR = parseTariffNumber(editMasterForm.rateIDR);
        const rateUSD = parseTariffNumber(editMasterForm.rateUSD);
        const rangeError = validateGRTBounds(editMasterForm.grtMin ?? editMasterForm.grt ?? 0, editMasterForm.grtMax ?? editMasterForm.grt ?? 0);
        if (rangeError) {
          setAddFormError(rangeError);
          return;
        }
        const tariffUpdate = {
          ...editMasterForm,
          tariffType: editMasterForm.tariffType === 'RANGE' ? 'QTY_CARGO' : editMasterForm.tariffType,
          portName: port?.name || editMasterForm.portName || '',
          rateIDR,
          rateUSD,
          rate: rateUSD || rateIDR || Number(editMasterForm.rate) || 0,
          currency: rateUSD ? 'USD' : 'IDR',
        } as Omit<FixTariff, 'id'>;
        const conflict = findOverlappingFixTariff(tariffUpdate, id);
        if (conflict) {
          setAddFormError(`Range GRT overlap dengan ${conflict.serviceName} (${formatMasterNumber(conflict.grtMin ?? conflict.grt)}–${formatMasterNumber(conflict.grtMax ?? conflict.grt)}).`);
          return;
        }
        await db.updateFixTariff(id, tariffUpdate);
      }
      if (type === 'VENDOR_PARTNERS') {
        if (!editMasterForm.vendorName?.trim()) {
          setAddFormError('Vendor Name wajib diisi sebelum menyimpan.');
          return;
        }
        await db.updateVendorPartner(id, {
          vendorName: editMasterForm.vendorName.trim(),
          bankName: (editMasterForm.bankName || '').trim(),
          paidName: (editMasterForm.paidName || '').trim(),
          accountNumber: (editMasterForm.accountNumber || '').trim(),
        });
      }
      if (type === 'BANK_ACCOUNT') {
        if (!editMasterForm.bankName?.trim() || !editMasterForm.accountName?.trim() || !editMasterForm.accountNumber?.trim()) {
          setAddFormError('Bank Name, A/C Name, dan A/C Number wajib diisi sebelum menyimpan.');
          return;
        }
        await db.updateBankAccount(id, {
          bankName: editMasterForm.bankName.trim(),
          branch: (editMasterForm.branch || '').trim(),
          accountName: editMasterForm.accountName.trim(),
          accountNumber: editMasterForm.accountNumber.trim(),
        });
      }
      if (type === 'EXPENSES_ITEM') {
        const rateIDR = parseTariffNumber(editMasterForm.rateIDR);
        const rateUSD = parseTariffNumber(editMasterForm.rateUSD);
        const selectedRate = rateUSD || rateIDR || parseTariffNumber(editMasterForm.standardCostSell) || parseTariffNumber(editMasterForm.standardCostBuy);
        await db.updateExpensesItem(id, {
          ...editMasterForm,
          calculationType: editMasterForm.calculationType === 'RANGE' ? 'QTY_CARGO' : editMasterForm.calculationType,
          rateIDR,
          rateUSD,
          defaultCurrency: rateUSD ? 'USD' : 'IDR',
          standardCostBuy: selectedRate,
          standardCostSell: selectedRate,
        });
      }

      closeMasterEditor();
      onDataSaved?.(activeTab);
    } catch (error) {
      console.error('Master data save failed:', error);
      setAddFormError(error instanceof Error ? error.message : 'Perubahan master data gagal disimpan.');
    }
  };

  const openUserEditor = (user: User) => {
    setShowAddModal(false);
    setAddFormError('');
    setEditingUser(user);
    setUserEditError('');
    setEditUserForm({ ...user, newPassword: '' });
  };

  const saveUserEditor = async (e: React.FormEvent | null) => {
    e?.preventDefault();
    if (!editingUser) return;

    if (!editUserForm.username || !editUserForm.name || !editUserForm.email || !editUserForm.position) {
      setUserEditError('User, nama, jabatan, dan email wajib diisi.');
      return;
    }
    if (editUserForm.newPassword && (apiAuth.enabled ? !/^\d{8}$/.test(editUserForm.newPassword) : editUserForm.newPassword.length < 6)) {
      setUserEditError(apiAuth.enabled ? 'Password harus tepat 8 digit angka.' : 'Password baru minimal 6 karakter.');
      return;
    }

    try {
      const updates: Partial<User> = {
        username: editUserForm.username,
        name: editUserForm.name,
        role: editUserForm.role as UserRole,
        position: editUserForm.position,
        department: editUserForm.department || editingUser.department,
        branch: editUserForm.branch || editingUser.branch,
        email: editUserForm.email,
        phone: editUserForm.phone,
        status: editUserForm.status as User['status'],
        ...(editUserForm.newPassword ? { password: editUserForm.newPassword } : {}),
      };
      await db.updateUser(editingUser.id, updates);
      const updated = { ...editingUser, ...updates } as User;
      if (!apiAuth.enabled) saveStoredAccount({ ...updated, username: updated.username || editingUser.username || '', password: updated.password || editingUser.password || '' });
      setEditingUser(null);
      setEditUserForm({});
      onDataSaved?.(activeTab);
    } catch (error) {
      console.error('User edit save failed:', error);
      setUserEditError(error instanceof Error ? error.message : 'Perubahan user gagal disimpan.');
    }
  };

  // Keep the content synchronized with the sidebar selection.
  // Without this, initialTab is only read on first mount, so clicking
  // Customers/Vessels/Ports/etc. in the sidebar would leave the old table visible.
  useEffect(() => {
    setActiveTab(initialTab);
    setSearchQuery('');
    // Auto-back/reset whenever another master-data menu is clicked.
    setShowAddModal(false);
    closeMasterEditor();
    setEditingUser(null);
  }, [initialTab]);

  // Simple state holders for new items
  const [newUser, setNewUser] = useState<Partial<User>>({
    name: '',
    email: '',
    department: '',
    branch: '',
    phone: '',
    username: '',
    password: '',
    position: '',
  });
  const resetNewUser = () => {
    setNewUser({ name: '', email: '', department: '', branch: '', phone: '', username: '', password: '', position: '' });
    setNewVendor({ vendorName: '', bankName: '', paidName: '', accountNumber: '' });
    setNewBankAccount({ bankName: '', branch: '', accountName: '', accountNumber: '' });
    setAddFormError('');
  };

  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
    code: '',
    companyName: '',
    country: 'Singapore',
    type: 'PRINCIPAL',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    creditTermDays: 30,
  });

  const [newVessel, setNewVessel] = useState<Partial<Vessel>>({
    name: '',
    imoNumber: '',
    callSign: '',
    flag: 'Panama',
    vesselType: 'BULK CARRIER',
    grt: 30000,
    nrt: 15000,
    dwt: 50000,
    loa: 180,
    beam: 30,
    yearBuilt: 2020,
  });

  const [newPort, setNewPort] = useState<Partial<Port>>({
    code: '',
    name: '',
    country: 'Indonesia',
    unlocode: '',
    channelDepthMeters: 14,
    tideRestriction: 'Standard tidal window',
    operatingHours: '24/7',
  });

  const [newZone, setNewZone] = useState<Partial<Zone>>({
    portId: ports[0]?.id || '',
    portName: ports[0]?.name || '',
    zoneCode: '',
    zoneName: '',
    type: 'BERTH',
    maxDraftMeters: 12,
    description: '',
  });

  const [newTariff, setNewTariff] = useState<Partial<FixTariff>>({
    portId: ports[0]?.id || '',
    portName: ports[0]?.name || '',
    costCategory: 'PORT_EXPENSES',
    serviceCode: '',
    serviceName: '',
    grt: 0,
    grtMin: 0,
    grtMax: 0,
    dwt: 0,
    calculationBasis: 'PER_GRT',
    tariffType: 'VARIABLE',
    currency: 'USD',
    rate: 0.05,
    rateIDR: 0,
    rateUSD: 0,
    minCharge: 500,
    description: '',
  });

  const applyTariffDefaultsFromMaster = (serviceName: string, portId?: string) => {
    if (!serviceName?.trim()) return;

    const normalized = serviceName.trim().toLowerCase();
    const match = expensesItems.find((item) => {
      const samePort = !portId || !item.portId || item.portId === portId;
      return samePort && (item.name.toLowerCase() === normalized || item.name.toLowerCase().includes(normalized) || normalized.includes(item.name.toLowerCase()));
    });

    if (!match) return;

    setNewTariff((current) => ({
      ...current,
      portId: portId || current.portId || match.portId || '',
      portName: portId ? ports.find((p) => p.id === portId)?.name || current.portName || '' : match.portName || current.portName || '',
      costCategory: match.category,
      tariffType: match.calculationType === 'FIXED'
        ? 'FIXED'
        : match.calculationType === 'QTY_CARGO' || match.calculationType === 'RANGE'
          ? 'QTY_CARGO'
          : match.calculationType === 'VARIABLE'
            ? 'VARIABLE'
            : current.tariffType || 'VARIABLE',
      currency: match.defaultCurrency || current.currency || 'USD',
      rate: Number(match.standardCostSell || match.standardCostBuy || current.rate || 0),
      minCharge: Number(match.standardCostBuy || match.standardCostSell || current.minCharge || 0),
      calculationBasis: match.calculationType === 'QTY_RATE' || match.calculationType === 'QTY_CARGO'
        ? 'PER_MOVE'
        : match.calculationType === 'PERCENTAGE'
          ? 'PER_GRT'
          : match.calculationType === 'FIXED'
            ? 'LUMP_SUM'
            : match.calculationType === 'VARIABLE'
              ? 'PER_DAY'
              : current.calculationBasis || 'PER_GRT',
    }));
  };

  const [newExpense, setNewExpense] = useState<Partial<ExpensesItem>>({
    portId: ports[0]?.id || '',
    portName: ports[0]?.name || '',
    code: '',
    category: 'PORT_EXPENSES',
    name: '',
    unit: 'job',
    defaultCurrency: 'USD',
    standardCostBuy: 1000,
    standardCostSell: 1300,
    rateIDR: 0,
    rateUSD: 1300,
    preferredVendor: '',
    calculationType: 'FIXED',
  });

  const emptyVendor = { vendorName: '', bankName: '', paidName: '', accountNumber: '' };
  const [newVendor, setNewVendor] = useState<Omit<VendorPartner, 'id'>>(emptyVendor);
  const [newBankAccount, setNewBankAccount] = useState<Omit<BankAccount, 'id'>>({
    bankName: '',
    branch: '',
    accountName: '',
    accountNumber: '',
  });

  const deleteVendorPartner = async (id: string) => {
    try {
      await db.deleteVendorPartner(id);
      onDataSaved?.(activeTab);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : 'Vendor partner gagal dihapus.');
    }
  };

  const deleteBankAccount = async (id: string) => {
    try {
      await db.deleteBankAccount(id);
      onDataSaved?.(activeTab);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : 'Bank account gagal dihapus.');
    }
  };

  const normalizeUploadHeader = (value: unknown) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  const readUploadValue = (row: Record<string, unknown>, ...headers: string[]) => {
    const normalizedRow = Object.entries(row).reduce<Record<string, unknown>>((result, [key, value]) => {
      result[normalizeUploadHeader(key)] = value;
      return result;
    }, {});
    for (const header of headers) {
      const value = normalizedRow[normalizeUploadHeader(header)];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  };

  const uploadNumber = (value: unknown, fallback = 0) => parseTariffNumber(value, fallback);

  const uploadGRTRange = (row: Record<string, unknown>) => {
    const minimum = uploadNumber(readUploadValue(row, 'grtMin', 'grt_min', 'grtFrom', 'grt_from'));
    const maximum = uploadNumber(readUploadValue(row, 'grtMax', 'grt_max', 'grtTo', 'grt_to'));
    const raw = String(readUploadValue(row, 'grt', 'GRT')).trim();
    const parts = raw.split(/\s*(?:-|–|to)\s*/i).filter(Boolean);
    const legacyMinimum = parts.length > 1 ? uploadNumber(parts[0]) : uploadNumber(raw);
    const legacyMaximum = parts.length > 1 ? uploadNumber(parts[1]) : uploadNumber(raw);
    return { grtMin: minimum || legacyMinimum, grtMax: maximum || legacyMaximum };
  };

  const validateGRTBounds = (minimumValue: unknown, maximumValue: unknown): string => {
    const minimum = parseTariffNumber(minimumValue, Number.NaN);
    const maximum = parseTariffNumber(maximumValue, Number.NaN);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return 'GRT Min dan GRT Max harus berupa angka.';
    if (minimum < 0 || maximum < 0) return 'GRT Min dan GRT Max tidak boleh bernilai negatif.';
    if (minimum > maximum) return 'GRT Min tidak boleh lebih besar dari GRT Max.';
    return '';
  };

  const getFixTariffBounds = (tariff: Pick<FixTariff, 'grt' | 'grtMin' | 'grtMax'>) => {
    const minimum = parseTariffNumber(tariff.grtMin ?? tariff.grt);
    const maximum = parseTariffNumber(tariff.grtMax ?? tariff.grt);
    return {
      minimum: minimum > 0 ? minimum : Number.NEGATIVE_INFINITY,
      maximum: maximum > 0 ? maximum : Number.POSITIVE_INFINITY,
    };
  };

  const findOverlappingFixTariff = (
    candidate: Omit<FixTariff, 'id'>,
    ignoreId?: string,
    records: FixTariff[] = fixTariffs,
  ) => {
    const candidateBounds = getFixTariffBounds(candidate);
    return records.find((tariff) => {
      if (tariff.id === ignoreId) return false;
      if (tariff.portId !== candidate.portId) return false;
      if (tariff.serviceName.trim().toLowerCase() !== candidate.serviceName.trim().toLowerCase()) return false;
      if ((tariff.costCategory || 'PORT_EXPENSES').toUpperCase() !== (candidate.costCategory || 'PORT_EXPENSES').toUpperCase()) return false;

      const sharesCurrency = (['IDR', 'USD'] as const).some((currency) =>
        getTariffRateForCurrency(currency, tariff.rateIDR, tariff.rateUSD, tariff.rate, tariff.currency) > 0
        && getTariffRateForCurrency(currency, candidate.rateIDR, candidate.rateUSD, candidate.rate, candidate.currency) > 0
      );
      if (!sharesCurrency) return false;

      const tariffBounds = getFixTariffBounds(tariff);
      const intersects = candidateBounds.minimum <= tariffBounds.maximum && tariffBounds.minimum <= candidateBounds.maximum;
      if (!intersects) return false;
      const sameRange = candidateBounds.minimum === tariffBounds.minimum && candidateBounds.maximum === tariffBounds.maximum;
      if (sameRange) return true;
      const candidateContainsTariff = candidateBounds.minimum <= tariffBounds.minimum && candidateBounds.maximum >= tariffBounds.maximum;
      const tariffContainsCandidate = tariffBounds.minimum <= candidateBounds.minimum && tariffBounds.maximum >= candidateBounds.maximum;
      return !candidateContainsTariff && !tariffContainsCandidate;
    });
  };

  const normalizeExpenseCategory = (value: unknown) => {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const aliases: Record<string, string> = {
      'CLEARANCE_IN/OUT': 'CLEARANCE',
      CLEARANCE_IN_OUT: 'CLEARANCE',
      'PORT SERVICE': 'PORT_SERVICE',
      POST_EXPENSES: 'PORT_EXPENSES',
      PORT_TARIFF: 'PORT_EXPENSES',
      PORT_TARIFFS: 'PORT_EXPENSES',
      PORT_CHARGE: 'PORT_EXPENSES',
      PORT_CHARGES: 'PORT_EXPENSES',
      PILOT_TOWAGE: 'PILOTAGE_TOWAGE',
    };
    return aliases[normalized] || normalized;
  };

  const uploadTariffCategories = new Set([
    'PORT_EXPENSES', 'PORT_SERVICE', 'CLEARANCE', 'GENERAL_EXPENSES', 'CREW_EXPENSES',
    'AGENCY_FEE', 'TAX_CONTINGENCY', 'OWNER_MATTER', 'VAT_11',
    'PPH_INCOME_TAX',
  ]);

  const deleteFixTariff = async (id: string) => {
    try {
      await db.deleteFixTariff(id);
      setUploadMessage('Fix tariff berhasil dihapus.');
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : 'Fix tariff gagal dihapus.');
    }
  };

  const deleteExpensesItem = async (id: string) => {
    try {
      await db.deleteExpensesItem(id);
      setUploadMessage('Expense item berhasil dihapus.');
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : 'Expense item gagal dihapus.');
    }
  };

  const deleteMasterRecord = async (label: string, action: () => Promise<void>) => {
    try {
      await action();
      setUploadMessage(`${label} berhasil dihapus.`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : `${label} gagal dihapus.`);
    }
  };

  const downloadMasterDataTemplate = async () => {
    const headers = activeTab === 'FIX_TARIFF'
      ? ['portId', 'portName', 'serviceName', 'costCategory', 'grtMin', 'grtMax', 'dwt', 'tariffType', 'rateIDR', 'rateUSD']
      : ['portId', 'portName', 'category', 'calculationType', 'name', 'unit', 'rateIDR', 'rateUSD'];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(activeTab === 'FIX_TARIFF' ? 'Fix Tariff' : 'Expenses Item');
    const lists = workbook.addWorksheet('Lists');
    lists.state = 'veryHidden';

    worksheet.addRow(headers);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headers.length)}1` };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };

    const portIds = ports.map((port) => port.id);
    const portNames = ports.map((port) => port.name);
    const categories = [
      'PORT_EXPENSES', 'PORT_SERVICE', 'CLEARANCE', 'GENERAL_EXPENSES', 'CREW_EXPENSES',
      'AGENCY_FEE', 'TAX_CONTINGENCY', 'OWNER_MATTER', 'VAT_11',
      'PPH_INCOME_TAX',
    ];
    const currencies = ['USD', 'IDR'];
    const expenseCalculationTypes = ['FIXED', 'VARIABLE', 'QTY_RATE', 'PERCENTAGE', 'QTY_CARGO'];
    const tariffTypes = ['FIXED', 'VARIABLE', 'QTY_CARGO'];
    const tariffBases = ['PER_GRT', 'PER_DAY', 'LUMP_SUM', 'PER_HOUR', 'PER_MOVE'];
    const listColumns = [portIds, portNames, categories, expenseCalculationTypes, currencies, tariffTypes, tariffBases];
    listColumns.forEach((values, columnIndex) => {
      values.forEach((value, rowIndex) => {
        lists.getCell(rowIndex + 2, columnIndex + 1).value = value;
      });
    });

    const listRange = (columnIndex: number, values: string[]) => `=Lists!$${String.fromCharCode(65 + columnIndex)}$2:$${String.fromCharCode(65 + columnIndex)}$${Math.max(values.length + 1, 2)}`;
    const validationByHeader: Record<string, string> = activeTab === 'FIX_TARIFF'
      ? {
          portId: listRange(0, portIds),
          portName: listRange(1, portNames),
          costCategory: listRange(2, categories),
          tariffType: listRange(7, tariffTypes),
          currency: listRange(4, currencies),
        }
      : {
          portId: listRange(0, portIds),
          portName: listRange(1, portNames),
          category: listRange(2, categories),
          calculationType: listRange(3, expenseCalculationTypes),
          defaultCurrency: listRange(4, currencies),
        };

    headers.forEach((header, columnIndex) => {
      const column = worksheet.getColumn(columnIndex + 1);
      column.width = Math.max(header.length + 4, 18);
      const formulae = validationByHeader[header];
      if (formulae) {
        for (let row = 2; row <= 501; row += 1) {
          worksheet.getCell(row, columnIndex + 1).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [formulae],
            showErrorMessage: true,
            errorTitle: 'Nilai tidak valid',
            error: 'Pilih nilai dari dropdown yang tersedia.',
          };
        }
      }
    });

    if (activeTab === 'FIX_TARIFF') {
      worksheet.getColumn('F').numFmt = '#,##0.00';
      worksheet.getColumn('E').numFmt = '#,##0.00';
      worksheet.getColumn('G').numFmt = '#,##0.00';
      worksheet.getColumn('I').numFmt = '#,##0.00';
      worksheet.getColumn('J').numFmt = '#,##0.00';
    } else {
      worksheet.getColumn('G').numFmt = '#,##0.00';
      worksheet.getColumn('H').numFmt = '#,##0.00';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeTab === 'FIX_TARIFF' ? 'fix-tariff-template.xlsx' : 'expenses-item-template.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  const sameUploadPort = (portId: string, portName: string, masterPortId?: string, masterPortName?: string) =>
    (!!portId && !!masterPortId && portId.toLowerCase() === masterPortId.toLowerCase())
    || (!!portName && !!masterPortName && portName.toLowerCase() === masterPortName.toLowerCase());

  const normalizeUploadMatch = (value: unknown) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const matchesUploadPort = (rawInput: unknown, candidate: unknown) => {
    const input = normalizeUploadMatch(rawInput);
    const actual = normalizeUploadMatch(candidate);
    if (!input || !actual) return false;
    return input === actual || input.includes(actual) || actual.includes(input);
  };

  const handleMasterDataUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || (activeTab !== 'FIX_TARIFF' && activeTab !== 'EXPENSES_ITEM')) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
      if (!firstSheet) {
        setUploadMessage('File gagal dibaca. Gunakan file Excel/CSV dengan header yang sesuai.');
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      if (!rows.length) {
        setUploadMessage('Sheet pertama kosong atau header tidak terbaca. Pastikan header berada di baris pertama dan gunakan template dari tombol Download Template.');
        return;
      }
      let imported = 0;
      let duplicates = 0;
      let invalid = 0;
      const invalidReasons: Record<string, number> = {};
      const markInvalid = (reason: string) => {
        invalid += 1;
        invalidReasons[reason] = (invalidReasons[reason] || 0) + 1;
      };
      const importedTariffs: FixTariff[] = [];
      const importedExpenses: ExpensesItem[] = [];

      rows.forEach((row, index) => {
        if (Object.values(row).every((value) => String(value ?? '').trim() === '')) {
          return;
        }

        const portId = String(readUploadValue(row, 'portId', 'port_id')).trim();
        const portInput = String(readUploadValue(row, 'portName', 'portName', 'port', 'port_name', 'namaPelabuhan', 'pelabuhan', 'portNameValue')).trim();
        const selectedPort = ports.find((port) =>
          (!!portId && matchesUploadPort(portId, port.id))
          || (!!portId && matchesUploadPort(portId, port.code))
          || (!!portId && matchesUploadPort(portId, port.unlocode))
          || (!!portInput && (
            matchesUploadPort(portInput, port.id)
            || matchesUploadPort(portInput, port.code)
            || matchesUploadPort(portInput, port.name)
            || matchesUploadPort(portInput, port.unlocode)
          ))
        );
        if (!selectedPort) {
          markInvalid('port tidak cocok dengan master data / header port tidak terbaca');
          return;
        }
        const resolvedPortId = selectedPort.id;
        const portName = selectedPort.name;
        const currency = String(readUploadValue(row, 'currency', 'defaultCurrency', 'default_currency')).trim().toUpperCase();
        const category = normalizeExpenseCategory(readUploadValue(row, 'category', 'costCategory', 'categoryCost', 'cost_category', 'category_cost')) || 'PORT_EXPENSES';

        if (activeTab === 'FIX_TARIFF') {
          const serviceName = String(readUploadValue(row, 'serviceName', 'service_name', 'itemService', 'item_service')).trim();
          const rateIDR = uploadNumber(readUploadValue(row, 'rateIDR', 'rate_idr', 'idr'));
          const rateUSD = uploadNumber(readUploadValue(row, 'rateUSD', 'rate_usd', 'usd'));
          const resolvedCurrency = rateUSD > 0 ? 'USD' : rateIDR > 0 ? 'IDR' : currency;
          const resolvedRate = rateUSD > 0 ? rateUSD : rateIDR > 0 ? rateIDR : uploadNumber(readUploadValue(row, 'rate'));
          const grtRange = uploadGRTRange(row);
          const rangeError = validateGRTBounds(grtRange.grtMin, grtRange.grtMax);
          if (rangeError) {
            markInvalid(rangeError);
            return;
          }
          const dwt = uploadNumber(readUploadValue(row, 'dwt', 'DWT'));
          const rawUploadedTariffType = String(readUploadValue(row, 'tariffType', 'tariff_type', 'type')).trim().toUpperCase();
          const uploadedTariffType = (rawUploadedTariffType === 'RANGE' ? 'QTY_CARGO' : rawUploadedTariffType) as FixTariff['tariffType'] || 'FIXED';
          const uploadedCalculationBasis = String(readUploadValue(row, 'calculationBasis', 'calculation_basis', 'basis')).trim().toUpperCase() as FixTariff['calculationBasis']
            || (uploadedTariffType === 'VARIABLE' ? 'PER_GRT' : uploadedTariffType === 'QTY_CARGO' ? 'PER_MOVE' : 'LUMP_SUM');
          if (!serviceName || !['USD', 'IDR'].includes(resolvedCurrency) || resolvedRate < 0) {
            markInvalid('serviceName / currency / rate tidak valid');
            return;
          }
          if (!uploadTariffCategories.has(category)) {
            markInvalid(`kategori tidak didukung: ${category}`);
            return;
          }
          const duplicate = [...fixTariffs, ...importedTariffs].some((tariff) =>
            tariff.serviceName.trim().toLowerCase() === serviceName.toLowerCase()
            && sameUploadPort(resolvedPortId, portName, tariff.portId, tariff.portName)
            && (tariff.costCategory || 'PORT_EXPENSES').toUpperCase() === category
            && tariff.currency === resolvedCurrency
            && Number(tariff.grtMin ?? tariff.grt ?? 0) === grtRange.grtMin
            && Number(tariff.grtMax ?? tariff.grt ?? 0) === grtRange.grtMax
            && Number(tariff.dwt ?? 0) === dwt
          );
          if (duplicate) {
            duplicates += 1;
            return;
          }
          const tariff: FixTariff = {
            id: '',
            portId: resolvedPortId,
            portName,
            costCategory: category,
            serviceCode: String(readUploadValue(row, 'serviceCode', 'service_code')).trim(),
            serviceName,
            grt: grtRange.grtMin === grtRange.grtMax ? grtRange.grtMin : undefined,
            grtMin: grtRange.grtMin,
            grtMax: grtRange.grtMax,
            dwt,
            calculationBasis: uploadedCalculationBasis,
            tariffType: uploadedTariffType,
            currency: resolvedCurrency as FixTariff['currency'],
            rate: resolvedRate,
            rateIDR,
            rateUSD,
            minCharge: uploadNumber(readUploadValue(row, 'minCharge', 'min_charge')),
            description: String(readUploadValue(row, 'description')).trim(),
          };
          const overlappingTariff = findOverlappingFixTariff(tariff, undefined, [...fixTariffs, ...importedTariffs]);
          if (overlappingTariff) {
            markInvalid(`range GRT overlap dengan ${overlappingTariff.serviceName}`);
            return;
          }
          importedTariffs.push(tariff);
          imported += 1;
          return;
        }

        const name = String(readUploadValue(row, 'name', 'itemName', 'item_name', 'serviceName', 'service_name')).trim();
        const rateIDR = uploadNumber(readUploadValue(row, 'rateIDR', 'rate_idr', 'idr'));
        const rateUSD = uploadNumber(readUploadValue(row, 'rateUSD', 'rate_usd', 'usd'));
        const resolvedExpenseCurrency = rateUSD > 0 ? 'USD' : rateIDR > 0 ? 'IDR' : currency;
        const resolvedExpenseRate = rateUSD > 0 ? rateUSD : rateIDR > 0 ? rateIDR : uploadNumber(readUploadValue(row, 'rate'));
        if (!name || !['USD', 'IDR'].includes(resolvedExpenseCurrency) || resolvedExpenseRate < 0) {
          markInvalid('name / currency / rate tidak valid');
          return;
        }
        const duplicate = [...expensesItems, ...importedExpenses].some((expense) =>
          expense.name.trim().toLowerCase() === name.toLowerCase()
          && sameUploadPort(resolvedPortId, portName, expense.portId, expense.portName)
          && expense.category.toUpperCase() === category
          && expense.defaultCurrency === resolvedExpenseCurrency
        );
        if (duplicate) {
          duplicates += 1;
          return;
        }
        const expense: ExpensesItem = {
          id: '',
          portId: resolvedPortId,
          portName,
          code: String(readUploadValue(row, 'code')).trim(),
          category: category as ExpensesItem['category'],
          name,
          unit: String(readUploadValue(row, 'unit')).trim() || 'job',
          defaultCurrency: resolvedExpenseCurrency as ExpensesItem['defaultCurrency'],
          standardCostBuy: uploadNumber(readUploadValue(row, 'standardCostBuy', 'standard_cost_buy'), resolvedExpenseRate),
          standardCostSell: resolvedExpenseRate,
          rateIDR,
          rateUSD,
          preferredVendor: String(readUploadValue(row, 'preferredVendor', 'preferred_vendor')).trim(),
          calculationType: (['RANGE', 'QTY_CARGO'].includes(String(readUploadValue(row, 'calculationType', 'calculation_type', 'type')).trim().toUpperCase())
            ? 'QTY_CARGO'
            : String(readUploadValue(row, 'calculationType', 'calculation_type', 'type')).trim().toUpperCase()) as ExpensesItem['calculationType'] || 'FIXED',
        };
        importedExpenses.push(expense);
        imported += 1;
      });

      if (activeTab === 'EXPENSES_ITEM' && importedExpenses.length) {
        await Promise.all(importedExpenses.map((expense) => db.addExpensesItem(expense)));
      }

      if (activeTab === 'FIX_TARIFF' && importedTariffs.length) {
        await db.addFixTariffsBulk(importedTariffs.map(({ id: _id, ...tariff }) => tariff));
      }

      const invalidReasonSummary = Object.entries(invalidReasons)
        .sort(([, a], [, b]) => b - a)
        .map(([reason, count]) => `${reason} (${count})`)
        .join('; ');
      const detailedReason = invalidReasonSummary ? ` Alasan: ${invalidReasonSummary}.` : '';
      setUploadMessage(`Upload selesai: ${imported} tersimpan, ${duplicates} duplikat dilewati, ${invalid} baris tidak valid.${detailedReason}`);
      onDataSaved?.(activeTab);
    } catch (error) {
      console.error('Master data upload failed:', error);
      const detail = error instanceof Error
        ? error.message
        : error && typeof error === 'object'
          ? [
              'message' in error ? error.message : '',
              'details' in error ? error.details : '',
              'hint' in error ? error.hint : '',
              'code' in error ? `kode ${error.code}` : '',
            ].filter(Boolean).join(' | ') || JSON.stringify(error)
          : String(error || 'kesalahan tidak dikenal');
      setUploadMessage(`Upload Fix Tariff gagal diproses: ${detail}`);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddFormError('');
    try {
      if (activeTab === 'USERS') {
        if (!newUser.name?.trim() || !newUser.email?.trim() || !newUser.username?.trim() || !newUser.password || !newUser.position?.trim() || !newUser.role || !newUser.status || !newUser.department?.trim() || !newUser.branch?.trim()) {
          setAddFormError('Lengkapi User, Password, Nama, Jabatan, Email, Role, Status, Departemen, dan Branch sebelum menyimpan.');
          return;
        }
        if (apiAuth.enabled && !/^\d{8}$/.test(newUser.password)) {
          setAddFormError('Password harus tepat 8 digit angka.');
          return;
        }
        const created = await db.addUser(newUser as Omit<User, 'id'>);
        if (!apiAuth.enabled) saveStoredAccount({ ...created, username: newUser.username!, password: newUser.password! });
      } else if (activeTab === 'CUSTOMERS') {
        if (!newCustomer.companyName?.trim()) {
          setAddFormError('Nama perusahaan wajib diisi sebelum menyimpan.');
          return;
        }
        await db.addCustomer(newCustomer as Omit<Customer, 'id'>);
      } else if (activeTab === 'VESSELS') {
        if (!newVessel.name?.trim()) {
          setAddFormError('Nama kapal wajib diisi sebelum menyimpan.');
          return;
        }
        await db.addVessel(newVessel as Omit<Vessel, 'id'>);
      } else if (activeTab === 'PORTS') {
        if (!newPort.code?.trim() || !newPort.name?.trim()) {
          setAddFormError('Kode dan nama pelabuhan wajib diisi sebelum menyimpan.');
          return;
        }
        await db.addPort(newPort as Omit<Port, 'id'>);
      } else if (activeTab === 'ZONES') {
        if (!newZone.zoneName?.trim()) {
          setAddFormError('Nama zona wajib diisi sebelum menyimpan.');
          return;
        }
        const port = ports.find((p) => p.id === newZone.portId);
        db.addZone({ ...newZone, portName: port?.name || '' } as Omit<Zone, 'id'>);
      } else if (activeTab === 'FIX_TARIFF') {
        if (!newTariff.serviceName?.trim()) {
          setAddFormError('Nama layanan wajib diisi sebelum menyimpan.');
          return;
        }
        const rangeError = validateGRTBounds(newTariff.grtMin ?? 0, newTariff.grtMax ?? 0);
        if (rangeError) {
          setAddFormError(rangeError);
          return;
        }
        const port = ports.find((p) => p.id === newTariff.portId);
        const rateIDR = parseTariffNumber(newTariff.rateIDR);
        const rateUSD = parseTariffNumber(newTariff.rateUSD);
        const tariffToAdd = {
          ...newTariff,
          serviceName: newTariff.serviceName.trim(),
          costCategory: newTariff.costCategory || 'PORT_EXPENSES',
          portName: port?.name || '',
          rateIDR,
          rateUSD,
          rate: rateUSD || rateIDR || 0,
          currency: rateUSD ? 'USD' : 'IDR',
        } as Omit<FixTariff, 'id'>;
        const conflict = findOverlappingFixTariff(tariffToAdd);
        if (conflict) {
          setAddFormError(`Range GRT overlap dengan ${conflict.serviceName} (${formatMasterNumber(conflict.grtMin ?? conflict.grt)}–${formatMasterNumber(conflict.grtMax ?? conflict.grt)}).`);
          return;
        }
        await db.addFixTariff(tariffToAdd);
      } else if (activeTab === 'EXPENSES_ITEM') {
        if (!newExpense.name?.trim()) {
          setAddFormError('Nama item wajib diisi sebelum menyimpan.');
          return;
        }
        const port = ports.find((p) => p.id === newExpense.portId);
        const rateIDR = parseTariffNumber(newExpense.rateIDR);
        const rateUSD = parseTariffNumber(newExpense.rateUSD);
        const selectedRate = rateUSD || rateIDR || 0;
        await db.addExpensesItem({
          ...newExpense,
          code: newExpense.code?.trim() || '',
          name: newExpense.name.trim(),
          portId: newExpense.portId || '',
          portName: port?.name || newExpense.portName || '',
          rateIDR,
          rateUSD,
          defaultCurrency: rateUSD ? 'USD' : 'IDR',
          standardCostBuy: selectedRate,
          standardCostSell: selectedRate,
        } as Omit<ExpensesItem, 'id'>);
      } else if (activeTab === 'VENDOR_PARTNERS') {
        if (!newVendor.vendorName.trim()) {
          setAddFormError('Vendor Name wajib diisi sebelum menyimpan.');
          return;
        }
        await db.addVendorPartner({
          vendorName: newVendor.vendorName.trim(),
          bankName: newVendor.bankName.trim(),
          paidName: newVendor.paidName.trim(),
          accountNumber: newVendor.accountNumber.trim(),
        });
        setNewVendor(emptyVendor);
      } else if (activeTab === 'BANK_ACCOUNT') {
        if (!newBankAccount.bankName.trim() || !newBankAccount.accountName.trim() || !newBankAccount.accountNumber.trim()) {
          setAddFormError('Bank Name, A/C Name, dan A/C Number wajib diisi sebelum menyimpan.');
          return;
        }
        await db.addBankAccount({
          bankName: newBankAccount.bankName.trim(),
          branch: (newBankAccount.branch || '').trim(),
          accountName: newBankAccount.accountName.trim(),
          accountNumber: newBankAccount.accountNumber.trim(),
        });
        setNewBankAccount({ bankName: '', branch: '', accountName: '', accountNumber: '' });
      } else {
        setAddFormError('Menu master data tidak dikenali.');
        return;
      }
    } catch (error) {
      console.error('Master data save failed:', error);
      setAddFormError('Data gagal disimpan. Periksa penyimpanan browser lalu coba lagi.');
      return;
    }

    setShowAddModal(false);
    setAddFormError('');
    if (activeTab === 'USERS') resetNewUser();
    onDataSaved?.(activeTab);
  };

  const formatCostCategory = (category?: string) => ({
    PORT_EXPENSES: 'PORT EXPENSES',
    PORT_SERVICE: 'PORT SERVICE',
    CLEARANCE: 'CLEARANCE IN/OUT',
    GENERAL_EXPENSES: 'GENERAL EXPENSES',
    CREW_EXPENSES: 'CREW EXPENSES',
    OWNER_MATTER: 'OWNER MATTER',
    AGENCY_FEE: 'AGENCY FEE',
  } as Record<string, string>)[category || ''] || category || '-';

  const formatExpenseCategory = (category?: string) => ({
    PORT_EXPENSES: 'PORT EXPENSES',
    PORT_SERVICE: 'PORT SERVICE',
    CLEARANCE: 'CLEARANCE IN/OUT',
    GENERAL_EXPENSES: 'GENERAL EXPENSES',
    CREW_EXPENSES: 'CREW EXPENSES',
    OWNER_MATTER: 'OWNER MATTER',
    AGENCY_FEE: 'AGENCY FEE',
    PORT_DUES: 'PORT EXPENSES',
    PILOTAGE_TOWAGE: 'CLEARANCE IN/OUT',
    BERTHING: 'PORT EXPENSES',
    CREW_CHANGE: 'CREW EXPENSES',
    IMMIGRATION_CUSTOMS: 'CLEARANCE IN/OUT',
    LOGISTICS_SUPPLIES: 'GENERAL EXPENSES',
    SUNDRY: 'GENERAL EXPENSES',
  } as Record<string, string>)[category || ''] || category || '-';
  const isUserFormOpen = activeTab === 'USERS' && (showAddModal || editingUser !== null);
  const isMasterFormOpen = activeTab !== 'USERS' && (showAddModal || editingMaster !== null);
  const isFormOpen = isUserFormOpen || isMasterFormOpen;
  const userForm = editingUser ? editUserForm : newUser;
  const updateUserForm = (updates: Partial<User> & { newPassword?: string }) => {
    if (editingUser) {
      setEditUserForm((current) => ({ ...current, ...updates }));
    } else {
      setNewUser((current) => ({ ...current, ...updates }));
    }
  };
  const closeUserForm = () => {
    setEditingUser(null);
    setEditUserForm({});
    setUserEditError('');
    resetNewUser();
    setShowAddModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-violet-500 text-xs font-mono font-bold uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" />
              <span>Admin Control Center</span>
            </div>
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 mt-1">
              Master Data Management
            </h1>
            <p className="text-xs text-slate-500">
              Konfigurasi data master portal: User, Customer, Vessel, Port, Fix Tariff & Expenses Item
            </p>
          </div>

          <div className="admin-master-actions flex flex-wrap items-center justify-end gap-2 self-start sm:self-auto">
            {!isFormOpen && (activeTab === 'FIX_TARIFF' || activeTab === 'EXPENSES_ITEM') && (
              <>
                <input ref={uploadInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleMasterDataUpload} className="hidden" />
                <button
                  type="button"
                  onClick={downloadMasterDataTemplate}
                  className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={isFormOpen}
                  className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[11px] font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Excel</span>
                </button>
              </>
            )}
            {!isFormOpen && (
              <button
                onClick={() => {
                  resetNewUser();
                  setEditingUser(null);
                  setUserEditError('');
                  setEditingMaster(null);
                  setShowAddModal(true);
                }}
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-slate-200 px-3.5 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-300"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Data {activeTab.replace('_', ' ')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200" />
      </div>

      {isUserFormOpen && (
        <section className="admin-add-modal rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 border-b border-slate-200 pb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600">User Management</div>
            <h2 className="mt-1 text-lg font-black text-slate-900">{editingUser ? 'Edit Data User' : 'Tambah Data User'}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {editingUser ? 'Perubahan disimpan ke database dan akun login.' : 'Lengkapi informasi akun dan akses user.'}
            </p>
          </div>
          <form
            noValidate
            onSubmit={editingUser ? saveUserEditor : handleSaveItem}
            className="space-y-4 text-xs text-slate-700"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="font-semibold text-slate-600">User / Username</span>
                <input required value={userForm.username || ''} onChange={(e) => updateUserForm({ username: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800" placeholder="contoh: budi.admin" />
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">{editingUser ? 'Password Baru' : 'Password'}</span>
                <input
                  required={!editingUser}
                  type="password"
                  inputMode={apiAuth.enabled ? 'numeric' : undefined}
                  maxLength={apiAuth.enabled ? 8 : undefined}
                  placeholder={editingUser ? (apiAuth.enabled ? '8 digit angka; kosongkan jika tidak diubah' : 'Kosongkan jika tidak diubah') : (apiAuth.enabled ? '8 digit angka' : 'minimal 6 karakter')}
                  value={editingUser ? editUserForm.newPassword || '' : newUser.password || ''}
                  onChange={(e) => {
                    const password = apiAuth.enabled ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value;
                    updateUserForm(editingUser ? { newPassword: password } : { password });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">Nama Pemegang User</span>
                <input required value={userForm.name || ''} onChange={(e) => updateUserForm({ name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800" />
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">Role</span>
                <select required value={userForm.role || ''} onChange={(e) => updateUserForm({ role: e.target.value as UserRole })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800">
                  <option value="">Pilih role</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SALES">SALES</option>
                  <option value="MANAGER_OPS">MANAGER_OPS</option>
                  <option value="FDA">FDA</option>
                  <option value="FINANCE">FINANCE</option>
                </select>
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">Jabatan</span>
                <input required value={userForm.position || ''} onChange={(e) => updateUserForm({ position: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800" />
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">Email</span>
                <input required type="email" value={userForm.email || ''} onChange={(e) => updateUserForm({ email: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800" />
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">Status</span>
                <select required value={userForm.status || ''} onChange={(e) => updateUserForm({ status: e.target.value as User['status'] })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800">
                  <option value="">Pilih status</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">Branch</span>
                <input required value={userForm.branch || ''} onChange={(e) => updateUserForm({ branch: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800" placeholder="contoh: JKT, Head Office, Surabaya" />
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">Departemen</span>
                <input required value={userForm.department || ''} onChange={(e) => updateUserForm({ department: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800" />
              </label>
              <label className="block">
                <span className="font-semibold text-slate-600">Phone</span>
                <input value={userForm.phone || ''} onChange={(e) => updateUserForm({ phone: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-slate-800" />
              </label>
            </div>
            {(editingUser ? userEditError : addFormError) && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {editingUser ? userEditError : addFormError}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={closeUserForm} className="master-data-cancel rounded-lg px-4 py-2 font-semibold">Batal</button>
              <button type="submit" className="master-data-submit rounded-lg px-4 py-2 font-semibold">
                {editingUser ? 'Simpan Perubahan' : 'Simpan Data User'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Filter and Search Bar */}
      {!isFormOpen && <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder={`Cari dalam master ${activeTab.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-violet-500"
          />
        </div>
        <span className="text-xs text-slate-500">
          Tersimpan di Relational Database Browser Storage
        </span>
      </div>}

      {!isFormOpen && uploadMessage && (activeTab === 'FIX_TARIFF' || activeTab === 'EXPENSES_ITEM') && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          {uploadMessage}
        </div>
      )}

      {/* Tables for each Tab */}
      {!isFormOpen && <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* USERS TABLE */}
        {activeTab === 'USERS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">No</th><th className="p-3.5">User</th><th className="p-3.5">Nama Pemegang User</th><th className="p-3.5">Jabatan</th><th className="p-3.5">Email</th><th className="p-3.5">Branch</th><th className="p-3.5">Status</th><th className="p-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.filter((u) => `${u.username || ''} ${u.name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase())).map((u) => (
                  <tr key={u.id} className="hover:bg-violet-50/40 transition-colors cursor-pointer" onDoubleClick={() => openUserEditor(u)}>
                    <td className="p-3.5 font-mono text-slate-500">{users.indexOf(u) + 1}</td>
                    <td className="p-3.5"><button type="button" onClick={() => openUserEditor(u)} className="text-left"><div className="font-mono font-bold text-violet-600 hover:text-indigo-700 hover:underline">{u.username || '-'}</div></button></td>
                    <td className="p-3.5"><button type="button" onClick={() => openUserEditor(u)} className="font-bold text-slate-900 hover:text-violet-700 hover:underline text-left">{u.name}</button></td>
                    <td className="p-3.5 text-slate-600">{u.position || u.department || '-'}</td>
                    <td className="p-3.5 text-slate-600">{u.email}</td>
                    <td className="p-3.5 text-slate-600">{u.branch || '-'}</td>
                    <td className="p-3.5"><button onClick={()=>void db.updateUser(u.id,{status:u.status==='ACTIVE'?'INACTIVE':'ACTIVE'})} className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${u.status==='ACTIVE'?'bg-emerald-50 text-emerald-600 hover:bg-emerald-100':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{u.status}</button></td>
                    <td className="p-3.5 text-right"><div className="flex items-center justify-end gap-1.5"><button onClick={() => openUserEditor(u)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-600 text-slate-500 transition" title="Edit User"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => void deleteMasterRecord('User', () => db.deleteUser(u.id))} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition" title="Hapus User"><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* CUSTOMERS TABLE */}
        {activeTab === 'CUSTOMERS' && (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200"><tr><th className="p-3.5">No</th><th className="p-3.5">Code</th><th className="p-3.5">Nama Perusahaan</th><th className="p-3.5">Country</th><th className="p-3.5">Contact Person</th><th className="p-3.5">Email</th><th className="p-3.5 text-right">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{customers.filter(c=>c.companyName.toLowerCase().includes(searchQuery.toLowerCase())).map(c=><tr key={c.id} className="hover:bg-slate-50"><td className="p-3.5 font-mono text-slate-500">{customers.indexOf(c)+1}</td><td className="p-3.5 font-mono font-bold text-cyan-600">{c.code}</td><td className="p-3.5 font-bold text-slate-900">{c.companyName}</td><td className="p-3.5 text-slate-600">{c.country}</td><td className="p-3.5 text-slate-600">{c.contactPerson}</td><td className="p-3.5 text-slate-600">{c.email}</td><td className="p-3.5 text-right"><div className="flex items-center justify-end gap-1.5"><button onClick={()=>openMasterEditor('CUSTOMERS', c)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-600 text-slate-500" title="Edit Customer"><Edit2 className="w-3.5 h-3.5"/></button><button onClick={()=>void deleteMasterRecord('Customer', () => db.deleteCustomer(c.id))} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500" title="Hapus Customer"><Trash2 className="w-3.5 h-3.5"/></button></div></td></tr>)}</tbody>
          </table></div>
        )}

        {/* VESSELS TABLE */}
        {activeTab === 'VESSELS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">No</th>
                  <th className="p-3.5">Vessel Name</th>
                  <th className="p-3.5">IMO / Call Sign</th>
                  <th className="p-3.5">Flag</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5 text-right">GRT</th>
                  <th className="p-3.5 text-right">DWT</th>
                  <th className="p-3.5 text-right">LOA / Beam (m)</th>
                  <th className="p-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vessels
                  .filter((v) => v.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((v, index) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-mono text-slate-500">{index + 1}</td>
                      <td className="p-3.5 font-bold text-slate-900 font-mono">{v.name}</td>
                      <td className="p-3.5 text-slate-600 font-mono">
                        {v.imoNumber} <span className="text-slate-500">• {v.callSign}</span>
                      </td>
                      <td className="p-3.5 text-slate-600">{v.flag}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-cyan-300">
                          {v.vesselType}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">
                        {formatMasterNumber(v.grt)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-600">
                        {formatMasterNumber(v.dwt)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-500">
                        {v.loa}m / {v.beam}m
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openMasterEditor('VESSELS', v)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-600 text-slate-500 transition" title="Edit Vessel">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => void deleteMasterRecord('Vessel', () => db.deleteVessel(v.id))} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition" title="Hapus Vessel">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PORTS TABLE */}
        {activeTab === 'PORTS' && (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200"><tr><th className="p-3.5">No</th><th className="p-3.5">Code</th><th className="p-3.5">Port</th><th className="p-3.5">Country</th><th className="p-3.5 text-right">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{ports.filter(p=>p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p=><tr key={p.id} className="hover:bg-slate-50"><td className="p-3.5 font-mono text-slate-500">{ports.indexOf(p)+1}</td><td className="p-3.5 font-mono font-bold text-cyan-600">{p.code}</td><td className="p-3.5 font-bold text-slate-900">{p.name}</td><td className="p-3.5 text-slate-600">{p.country}</td><td className="p-3.5 text-right"><div className="flex items-center justify-end gap-1.5"><button onClick={()=>openMasterEditor('PORTS', p)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-600 text-slate-500" title="Edit Port"><Edit2 className="w-3.5 h-3.5"/></button><button onClick={()=>void deleteMasterRecord('Port', () => db.deletePort(p.id))} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500" title="Hapus Port"><Trash2 className="w-3.5 h-3.5"/></button></div></td></tr>)}</tbody>
          </table></div>
        )}

        {/* ZONES TABLE */}
        {activeTab === 'ZONES' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">No</th>
                  <th className="p-3.5">Zone Code</th>
                  <th className="p-3.5">Nama Zone / Dermaga</th>
                  <th className="p-3.5">Port</th>
                  <th className="p-3.5">Tipe Zona</th>
                  <th className="p-3.5">Max Draft (m)</th>
                  <th className="p-3.5">Deskripsi</th>
                  <th className="p-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {zones
                  .filter((z) => z.zoneName.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((z, index) => (
                    <tr key={z.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-mono text-slate-500">{index + 1}</td>
                      <td className="p-3.5 font-mono font-bold text-cyan-400">{z.zoneCode}</td>
                      <td className="p-3.5 font-bold text-slate-900">{z.zoneName}</td>
                      <td className="p-3.5 text-slate-600">{z.portName}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                          {z.type}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">{z.maxDraftMeters}m</td>
                      <td className="p-3.5 text-slate-500">{z.description}</td>
                      <td className="p-3.5 text-right">
                          <button
                            onClick={() => void deleteMasterRecord('Zone', () => db.deleteZone(z.id))}
                          className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* FIX TARIFF TABLE */}
        {activeTab === 'FIX_TARIFF' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">No</th>
                  <th className="p-3.5">Port</th>
                  <th className="p-3.5">Item Service</th>
                  <th className="p-3.5">Category Cost</th>
                  <th className="p-3.5 text-right">GRT Min</th>
                  <th className="p-3.5 text-right">GRT Max</th>
                  <th className="p-3.5 text-right">DWT</th>
                  <th className="p-3.5">Tariff Type</th>
                  <th className="p-3.5 text-right">Rate IDR</th>
                  <th className="p-3.5 text-right">Rate USD</th>
                  <th className="p-3.5 text-right">action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fixTariffs
                  .filter((t) => `${t.portName || ''} ${t.serviceName}`.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-mono text-slate-500">{fixTariffs.indexOf(t) + 1}</td>
                      <td className="p-3.5 font-semibold text-slate-700">{t.portName || ports.find((port) => port.id === t.portId)?.name || '-'}</td>
                      <td className="p-3.5 font-bold text-slate-900">{t.serviceName}</td>
                      <td className="p-3.5 text-slate-600">{(t.costCategory || 'PORT_EXPENSES').replace(/_/g, ' ')}</td>
                      <td className="p-3.5 text-right font-mono text-slate-600">{formatMasterNumber(t.grtMin ?? t.grt)}</td>
                      <td className="p-3.5 text-right font-mono text-slate-600">{formatMasterNumber(t.grtMax ?? t.grt)}</td>
                      <td className="p-3.5 text-right font-mono text-slate-600">{formatMasterNumber(t.dwt)}</td>
                      <td className="p-3.5"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-600">{t.tariffType || (t.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE')}</span></td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{formatMasterRate(t.rateIDR ?? (t.currency === 'IDR' ? t.rate : 0))}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{formatMasterRate(t.rateUSD ?? (t.currency === 'USD' ? t.rate : 0))}</td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openMasterEditor('FIX_TARIFF', t)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-600 text-slate-500 transition" title="Edit Fix Tariff">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => void deleteFixTariff(t.id)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition" title="Hapus Fix Tariff">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* EXPENSES ITEM TABLE */}
        {activeTab === 'EXPENSES_ITEM' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">No</th>
                  <th className="p-3.5">Port</th>
                  <th className="p-3.5">Item Name</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5 text-right">IDR</th>
                  <th className="p-3.5 text-right">USD</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expensesItems
                  .filter((e) => `${e.name} ${e.code} ${e.category}`.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((e, index) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-mono text-slate-500">{index + 1}</td>
                      <td className="p-3.5 font-semibold text-slate-700">{e.portName || ports.find((port) => port.id === e.portId)?.name || '-'}</td>
                      <td className="p-3.5 font-bold text-slate-900">{e.name}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 text-slate-600">
                          {formatExpenseCategory(e.category)}
                        </span>
                      </td>
                      <td className="p-3.5"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-600">{e.calculationType || 'FIXED'}</span></td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{formatMasterRate(e.rateIDR ?? (e.defaultCurrency === 'IDR' ? e.standardCostSell : 0))}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{formatMasterRate(e.rateUSD ?? (e.defaultCurrency === 'USD' ? e.standardCostSell : 0))}</td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openMasterEditor('EXPENSES_ITEM', e)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-600 text-slate-500" title="Edit Expense Item"><Edit2 className="w-3.5 h-3.5"/></button>
                          <button onClick={() => void deleteExpensesItem(e.id)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500" title="Hapus Expense Item"><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* VENDOR PARTNERS TABLE */}
        {activeTab === 'VENDOR_PARTNERS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">No</th>
                  <th className="p-3.5">Vendor Name</th>
                  <th className="p-3.5">Bank Name</th>
                  <th className="p-3.5">Paid Name</th>
                  <th className="p-3.5">A/C Number</th>
                  <th className="p-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendorPartners
                  .filter((v) => `${v.vendorName} ${v.bankName} ${v.paidName} ${v.accountNumber}`.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((v, index) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-mono text-slate-500">{index + 1}</td>
                      <td className="p-3.5 font-bold text-slate-900">{v.vendorName}</td>
                      <td className="p-3.5 text-slate-700">{v.bankName || '-'}</td>
                      <td className="p-3.5 text-slate-700">{v.paidName || '-'}</td>
                      <td className="p-3.5 font-mono text-slate-700">{v.accountNumber || '-'}</td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openMasterEditor('VENDOR_PARTNERS', v)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-600 text-slate-500" title="Edit Vendor Partner"><Edit2 className="w-3.5 h-3.5"/></button>
                          <button onClick={() => void deleteVendorPartner(v.id)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500" title="Hapus Vendor Partner"><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {vendorPartners.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400">Belum ada data vendor partner.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'BANK_ACCOUNT' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">No</th>
                  <th className="p-3.5">Bank Name</th>
                  <th className="p-3.5">Branch</th>
                  <th className="p-3.5">A/c Name</th>
                  <th className="p-3.5">A/c Number</th>
                  <th className="p-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bankAccounts
                  .filter((item) => `${item.bankName} ${item.branch || ''} ${item.accountName} ${item.accountNumber}`.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((item, index) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-mono text-slate-500">{index + 1}</td>
                      <td className="p-3.5 font-bold text-slate-900">{item.bankName}</td>
                      <td className="p-3.5 text-slate-700">{item.branch || '-'}</td>
                      <td className="p-3.5 text-slate-700">{item.accountName || '-'}</td>
                      <td className="p-3.5 font-mono text-slate-700">{item.accountNumber || '-'}</td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openMasterEditor('BANK_ACCOUNT', item)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-600 text-slate-500" title="Edit Bank Account"><Edit2 className="w-3.5 h-3.5"/></button>
                          <button onClick={() => void deleteBankAccount(item.id)} className="p-1.5 rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500" title="Hapus Bank Account"><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {bankAccounts.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400">Belum ada data bank account.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Generic Master Data Edit Modal */}
      {editingMaster && (
        <section className="admin-add-modal rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600">Master Data</div>
                <h3 className="text-lg font-black text-slate-900">
                  Edit {editingMaster.type === 'CUSTOMERS' ? 'Customer' : editingMaster.type === 'VESSELS' ? 'Vessel' : editingMaster.type === 'PORTS' ? 'Port' : editingMaster.type === 'FIX_TARIFF' ? 'Fix Tariff' : editingMaster.type === 'VENDOR_PARTNERS' ? 'Vendor Partner' : editingMaster.type === 'BANK_ACCOUNT' ? 'Bank Account' : 'Expense Item'}
                </h3>
                <p className="text-xs text-slate-500">Perubahan langsung disimpan ke database portal.</p>
              </div>
              <button type="button" onClick={closeMasterEditor} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={saveMasterEditor} className="space-y-4 text-xs">
              {editingMaster.type === 'CUSTOMERS' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Kode Customer</span><input required value={editMasterForm.code || ''} onChange={e=>setEditMasterForm({...editMasterForm,code:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Tipe Customer</span><select value={editMasterForm.type || 'PRINCIPAL'} onChange={e=>setEditMasterForm({...editMasterForm,type:e.target.value})} className="master-edit-input"><option value="PRINCIPAL">PRINCIPAL</option><option value="CHARTERER">CHARTERER</option><option value="SHIPOWNER">SHIPOWNER</option></select></label>
                  </div>
                  <label className="block"><span className="text-slate-500 font-semibold">Nama Perusahaan</span><input required value={editMasterForm.companyName || ''} onChange={e=>setEditMasterForm({...editMasterForm,companyName:e.target.value})} className="master-edit-input" /></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Country</span><input value={editMasterForm.country || ''} onChange={e=>setEditMasterForm({...editMasterForm,country:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Contact Person</span><input value={editMasterForm.contactPerson || ''} onChange={e=>setEditMasterForm({...editMasterForm,contactPerson:e.target.value})} className="master-edit-input" /></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Email</span><input type="email" value={editMasterForm.email || ''} onChange={e=>setEditMasterForm({...editMasterForm,email:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Phone</span><input value={editMasterForm.phone || ''} onChange={e=>setEditMasterForm({...editMasterForm,phone:e.target.value})} className="master-edit-input" /></label>
                  </div>
                  <label className="block"><span className="text-slate-500 font-semibold">Address</span><textarea value={editMasterForm.address || ''} onChange={e=>setEditMasterForm({...editMasterForm,address:e.target.value})} className="master-edit-input min-h-20" /></label>
                  <label className="block"><span className="text-slate-500 font-semibold">Credit Term (days)</span><input type="number" min="0" value={editMasterForm.creditTermDays ?? 30} onChange={e=>setEditMasterForm({...editMasterForm,creditTermDays:Number(e.target.value)})} className="master-edit-input" /></label>
                </>
              )}

              {editingMaster.type === 'VESSELS' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Vessel Name</span><input required value={editMasterForm.name || ''} onChange={e=>setEditMasterForm({...editMasterForm,name:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Vessel Type</span><select value={editMasterForm.vesselType || 'BULK CARRIER'} onChange={e=>setEditMasterForm({...editMasterForm,vesselType:e.target.value})} className="master-edit-input"><option>BULK CARRIER</option><option>CONTAINER</option><option>OIL TANKER</option><option>GENERAL CARGO</option><option>TUG & BARGE</option><option>LNG CARRIER</option></select></label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">IMO Number</span><input value={editMasterForm.imoNumber || ''} onChange={e=>setEditMasterForm({...editMasterForm,imoNumber:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Call Sign</span><input value={editMasterForm.callSign || ''} onChange={e=>setEditMasterForm({...editMasterForm,callSign:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Flag</span><input value={editMasterForm.flag || ''} onChange={e=>setEditMasterForm({...editMasterForm,flag:e.target.value})} className="master-edit-input" /></label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">GRT</span><input type="number" value={editMasterForm.grt ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,grt:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">NRT</span><input type="number" value={editMasterForm.nrt ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,nrt:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">DWT</span><input type="number" value={editMasterForm.dwt ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,dwt:Number(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block"><span className="text-violet-600 font-bold">LOA (meter) — manual</span><input type="number" step="0.01" min="0" required value={editMasterForm.loa ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,loa:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Beam (meter)</span><input type="number" step="0.01" value={editMasterForm.beam ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,beam:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Year Built</span><input type="number" value={editMasterForm.yearBuilt ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,yearBuilt:Number(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                </>
              )}

              {editingMaster.type === 'PORTS' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Kode Port</span><input required value={editMasterForm.code || ''} onChange={e=>setEditMasterForm({...editMasterForm,code:e.target.value.toUpperCase()})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">UN/LOCODE</span><input value={editMasterForm.unlocode || ''} onChange={e=>setEditMasterForm({...editMasterForm,unlocode:e.target.value.toUpperCase()})} className="master-edit-input" /></label>
                  </div>
                  <label className="block"><span className="text-slate-500 font-semibold">Port</span><input required value={editMasterForm.name || ''} onChange={e=>setEditMasterForm({...editMasterForm,name:e.target.value})} className="master-edit-input" /></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Country</span><input value={editMasterForm.country || ''} onChange={e=>setEditMasterForm({...editMasterForm,country:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Channel Depth (m)</span><input type="number" step="0.01" value={editMasterForm.channelDepthMeters ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,channelDepthMeters:Number(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Tide Restriction</span><input value={editMasterForm.tideRestriction || ''} onChange={e=>setEditMasterForm({...editMasterForm,tideRestriction:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Operating Hours</span><input value={editMasterForm.operatingHours || ''} onChange={e=>setEditMasterForm({...editMasterForm,operatingHours:e.target.value})} className="master-edit-input" /></label>
                  </div>
                </>
              )}

              {editingMaster.type === 'FIX_TARIFF' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Port</span><select value={editMasterForm.portId || ''} onChange={e=>setEditMasterForm({...editMasterForm,portId:e.target.value})} className="master-edit-input">{ports.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Category Cost</span><select value={editMasterForm.costCategory || 'PORT_EXPENSES'} onChange={e=>setEditMasterForm({...editMasterForm,costCategory:e.target.value})} className="master-edit-input"><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="PORT_SERVICE">PORT SERVICE</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="AGENCY_FEE">AGENCY FEE</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Tariff Type</span><select value={editMasterForm.tariffType === 'RANGE' ? 'QTY_CARGO' : editMasterForm.tariffType || 'VARIABLE'} onChange={e=>setEditMasterForm({...editMasterForm,tariffType:e.target.value})} className="master-edit-input"><option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="QTY_CARGO">QTY_CARGO</option></select></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Item Service</span><input required value={editMasterForm.serviceName || ''} onChange={e=>setEditMasterForm({...editMasterForm,serviceName:e.target.value})} className="master-edit-input" /></label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">GRT Min</span><input type="text" inputMode="numeric" value={formatRateInput(editMasterForm.grtMin ?? editMasterForm.grt ?? 0)} onChange={e=>setEditMasterForm({...editMasterForm,grtMin:parseTariffNumber(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">GRT Max</span><input type="text" inputMode="numeric" value={formatRateInput(editMasterForm.grtMax ?? editMasterForm.grt ?? 0)} onChange={e=>setEditMasterForm({...editMasterForm,grtMax:parseTariffNumber(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">DWT</span><input type="number" step="0.01" value={editMasterForm.dwt ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,dwt:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Minimum Charge</span><input type="number" value={editMasterForm.minCharge ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,minCharge:Number(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                  <p className="text-[10px] text-slate-500">`0` pada Min atau Max berarti batas terbuka; `0/0` berarti tanpa batas GRT.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">IDR</span><input type="text" inputMode="decimal" value={formatRateInput(editMasterForm.rateIDR ?? 0)} onChange={e=>setEditMasterForm({...editMasterForm,rateIDR:parseTariffNumber(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">USD</span><input type="text" inputMode="decimal" value={formatRateInput(editMasterForm.rateUSD ?? 0)} onChange={e=>setEditMasterForm({...editMasterForm,rateUSD:parseTariffNumber(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                </>
              )}

              {editingMaster.type === 'EXPENSES_ITEM' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Port</span><select value={editMasterForm.portId || ''} onChange={e=>setEditMasterForm({...editMasterForm,portId:e.target.value,portName: ports.find((p) => p.id === e.target.value)?.name || ''})} className="master-edit-input">{ports.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Category</span><select required value={editMasterForm.category || 'PORT_EXPENSES'} onChange={e=>setEditMasterForm({...editMasterForm,category:e.target.value})} className="master-edit-input"><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="PORT_SERVICE">PORT SERVICE</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="AGENCY_FEE">AGENCY FEE</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Item Name</span><input required value={editMasterForm.name || ''} onChange={e=>setEditMasterForm({...editMasterForm,name:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Unit</span><select value={editMasterForm.unit || 'job'} onChange={e=>setEditMasterForm({...editMasterForm,unit:e.target.value})} className="master-edit-input"><option value="job">job</option><option value="hour">hour</option><option value="day">day</option><option value="qty">qty</option><option value="GRT">GRT</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Calculation Type</span><select value={editMasterForm.calculationType === 'RANGE' ? 'QTY_CARGO' : editMasterForm.calculationType || 'FIXED'} onChange={e=>setEditMasterForm({...editMasterForm,calculationType:e.target.value})} className="master-edit-input"><option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="QTY_RATE">Qty_rate</option><option value="PERCENTAGE">Percentage</option><option value="QTY_CARGO">QTY_CARGO</option></select></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Unit</span><select value={editMasterForm.unit || 'job'} onChange={e=>setEditMasterForm({...editMasterForm,unit:e.target.value})} className="master-edit-input"><option value="job">job</option><option value="hour">hour</option><option value="day">day</option><option value="qty">qty</option><option value="GRT">GRT</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Rate IDR</span><input type="text" inputMode="decimal" value={formatRateInput(editMasterForm.rateIDR ?? 0)} onChange={e=>setEditMasterForm({...editMasterForm,rateIDR:parseTariffNumber(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Rate USD</span><input type="text" inputMode="decimal" value={formatRateInput(editMasterForm.rateUSD ?? 0)} onChange={e=>setEditMasterForm({...editMasterForm,rateUSD:parseTariffNumber(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                </>
              )}

              {editingMaster.type === 'VENDOR_PARTNERS' && (
                <>
                  <label className="block"><span className="text-slate-500 font-semibold">Vendor Name</span><input required value={editMasterForm.vendorName || ''} onChange={e=>setEditMasterForm({...editMasterForm,vendorName:e.target.value})} className="master-edit-input" /></label>
                  <label className="block"><span className="text-slate-500 font-semibold">Bank Name</span><input value={editMasterForm.bankName || ''} onChange={e=>setEditMasterForm({...editMasterForm,bankName:e.target.value})} className="master-edit-input" /></label>
                  <label className="block"><span className="text-slate-500 font-semibold">Paid Name</span><input value={editMasterForm.paidName || ''} onChange={e=>setEditMasterForm({...editMasterForm,paidName:e.target.value})} className="master-edit-input" /></label>
                  <label className="block"><span className="text-slate-500 font-semibold">A/C Number</span><input value={editMasterForm.accountNumber || ''} onChange={e=>setEditMasterForm({...editMasterForm,accountNumber:e.target.value})} className="master-edit-input" /></label>
                </>
              )}

              {editingMaster.type === 'BANK_ACCOUNT' && (
                <>
                  <label className="block"><span className="text-slate-500 font-semibold">Bank Name</span><input required value={editMasterForm.bankName || ''} onChange={e=>setEditMasterForm({...editMasterForm,bankName:e.target.value})} className="master-edit-input" /></label>
                  <label className="block"><span className="text-slate-500 font-semibold">Branch</span><input value={editMasterForm.branch || ''} onChange={e=>setEditMasterForm({...editMasterForm,branch:e.target.value})} className="master-edit-input" /></label>
                  <label className="block"><span className="text-slate-500 font-semibold">A/C Name</span><input required value={editMasterForm.accountName || ''} onChange={e=>setEditMasterForm({...editMasterForm,accountName:e.target.value})} className="master-edit-input" /></label>
                  <label className="block"><span className="text-slate-500 font-semibold">A/C Number</span><input required value={editMasterForm.accountNumber || ''} onChange={e=>setEditMasterForm({...editMasterForm,accountNumber:e.target.value})} className="master-edit-input" /></label>
                </>
              )}

              {addFormError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{addFormError}</div>}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={closeMasterEditor} className="master-data-cancel px-4 py-2 rounded-lg font-semibold">Batal</button>
                <button type="submit" className="master-data-submit px-4 py-2 rounded-lg text-xs font-semibold">Simpan Perubahan</button>
              </div>
            </form>
        </section>
      )}

      {/* Add Item Modal */}
      {showAddModal && activeTab !== 'USERS' && (
        <section className="admin-add-modal rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-300 pb-2 mb-3">
              <h3 className="text-base font-bold text-slate-900">
                Tambah Master: {activeTab.replace('_', ' ')}
              </h3>
                  <button
                onClick={() => { resetNewUser(); setShowAddModal(false); }}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form noValidate onSubmit={handleSaveItem} className="space-y-4 text-xs text-slate-700">
              {activeTab === 'CUSTOMERS' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Kode Customer:</label>
                      <input
                        type="text"
                        required
                        value={newCustomer.code}
                        onChange={(e) => setNewCustomer({ ...newCustomer, code: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Tipe Customer:</label>
                      <select
                        value={newCustomer.type}
                        onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value as any })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        <option value="PRINCIPAL">PRINCIPAL</option>
                        <option value="CHARTERER">CHARTERER</option>
                        <option value="SHIPOWNER">SHIPOWNER</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Nama Perusahaan:</label>
                    <input
                      type="text"
                      required
                      value={newCustomer.companyName}
                      onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Contact Person:</label>
                      <input
                        type="text"
                        value={newCustomer.contactPerson}
                        onChange={(e) => setNewCustomer({ ...newCustomer, contactPerson: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Email:</label>
                      <input
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                  </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Country:</label>
                        <input value={newCustomer.country} onChange={(e) => setNewCustomer({ ...newCustomer, country: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Phone:</label>
                        <input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                      </div>
                    </div>
                    <label className="text-slate-400 block mb-1">Address:
                      <textarea value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                    </label>
                    <label className="text-slate-400 block mb-1">Credit Term (days):
                      <input type="number" min="0" value={newCustomer.creditTermDays} onChange={(e) => setNewCustomer({ ...newCustomer, creditTermDays: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                    </label>
                </>
              )}

              {activeTab === 'VESSELS' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Nama Kapal (Vessel Name):</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. MV OCEAN STAR"
                        value={newVessel.name}
                        onChange={(e) => setNewVessel({ ...newVessel, name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Tipe Kapal:</label>
                      <select
                        value={newVessel.vesselType}
                        onChange={(e) => setNewVessel({ ...newVessel, vesselType: e.target.value as any })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        <option value="BULK CARRIER">BULK CARRIER</option>
                        <option value="CONTAINER">CONTAINER</option>
                        <option value="OIL TANKER">OIL TANKER</option>
                        <option value="GENERAL CARGO">GENERAL CARGO</option>
                        <option value="TUG & BARGE">TUG & BARGE</option>
                        <option value="LNG CARRIER">LNG CARRIER</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">IMO Number:</label>
                      <input
                        type="text"
                        value={newVessel.imoNumber}
                        onChange={(e) => setNewVessel({ ...newVessel, imoNumber: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Call Sign:</label>
                      <input value={newVessel.callSign} onChange={(e) => setNewVessel({ ...newVessel, callSign: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Flag:</label>
                      <input value={newVessel.flag} onChange={(e) => setNewVessel({ ...newVessel, flag: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">GRT:</label>
                      <input
                        type="number"
                        value={newVessel.grt}
                        onChange={(e) => setNewVessel({ ...newVessel, grt: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">DWT:</label>
                      <input
                        type="number"
                        value={newVessel.dwt}
                        onChange={(e) => setNewVessel({ ...newVessel, dwt: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">LOA (meter) — manual:</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={newVessel.loa}
                        onChange={(e) => setNewVessel({ ...newVessel, loa: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                        placeholder="Contoh: 180.50"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Beam (meter):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newVessel.beam}
                        onChange={(e) => setNewVessel({ ...newVessel, beam: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">NRT:</label>
                      <input type="number" value={newVessel.nrt} onChange={(e) => setNewVessel({ ...newVessel, nrt: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Year Built:</label>
                      <input type="number" value={newVessel.yearBuilt} onChange={(e) => setNewVessel({ ...newVessel, yearBuilt: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono" />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'PORTS' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Kode Port (3 chars):</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. BTH"
                        value={newPort.code}
                        onChange={(e) => setNewPort({ ...newPort, code: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">UN/LOCODE:</label>
                      <input
                        type="text"
                        placeholder="e.g. IDBTH"
                        value={newPort.unlocode}
                        onChange={(e) => setNewPort({ ...newPort, unlocode: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Port:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Batu Ampar, Batam"
                      value={newPort.name}
                      onChange={(e) => setNewPort({ ...newPort, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Country:</label>
                      <input value={newPort.country} onChange={(e) => setNewPort({ ...newPort, country: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Channel Depth (m):</label>
                      <input type="number" step="0.01" value={newPort.channelDepthMeters} onChange={(e) => setNewPort({ ...newPort, channelDepthMeters: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Tide Restriction:</label>
                      <input value={newPort.tideRestriction} onChange={(e) => setNewPort({ ...newPort, tideRestriction: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Operating Hours:</label>
                      <input value={newPort.operatingHours} onChange={(e) => setNewPort({ ...newPort, operatingHours: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'ZONES' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Port:</label>
                      <select
                        value={newZone.portId}
                        onChange={(e) => setNewZone({ ...newZone, portId: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        {ports.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Tipe Zona:</label>
                      <select
                        value={newZone.type}
                        onChange={(e) => setNewZone({ ...newZone, type: e.target.value as any })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        <option value="BERTH">BERTH (Dermaga)</option>
                        <option value="ANCHORAGE">ANCHORAGE (Labuh)</option>
                        <option value="STS">STS (Ship to Ship)</option>
                        <option value="INNER_ROAD">INNER ROAD</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Nama Zona / Dermaga:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Berth 102 Container"
                      value={newZone.zoneName}
                      onChange={(e) => setNewZone({ ...newZone, zoneName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>
                </>
              )}

              {activeTab === 'FIX_TARIFF' && (
                <>
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                    Format angka: 1,500.50 (koma untuk ribuan, titik untuk desimal).
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Port:</label>
                      <select
                        value={newTariff.portId}
                        onChange={(e) => {
                          const nextPortId = e.target.value;
                          setNewTariff({ ...newTariff, portId: nextPortId, portName: ports.find((p) => p.id === nextPortId)?.name || '' });
                          applyTariffDefaultsFromMaster(newTariff.serviceName || '', nextPortId);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        {ports.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Category Cost:</label>
                      <select
                        value={newTariff.costCategory || 'PORT_EXPENSES'}
                        onChange={(e) => setNewTariff({ ...newTariff, costCategory: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        <option value="PORT_EXPENSES">PORT EXPENSES</option>
                        <option value="PORT_SERVICE">PORT SERVICE</option>
                        <option value="CLEARANCE">CLEARANCE IN/OUT</option>
                        <option value="GENERAL_EXPENSES">GENERAL EXPENSES</option>
                        <option value="CREW_EXPENSES">CREW EXPENSES</option>
                        <option value="OWNER_MATTER">OWNER MATTER</option>
                        <option value="AGENCY_FEE">AGENCY FEE</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">`0` pada Min atau Max berarti batas terbuka; `0/0` berarti tanpa batas GRT.</p>

                  <div>
                    <label className="text-slate-400 block mb-1">Tariff Type:</label>
                    <select
                      value={newTariff.tariffType === 'RANGE' ? 'QTY_CARGO' : newTariff.tariffType}
                      onChange={(e) => setNewTariff({ ...newTariff, tariffType: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    >
                      <option value="FIXED">Fixed</option>
                      <option value="VARIABLE">Variabel</option>
                      <option value="QTY_CARGO">QTY_CARGO</option>
                    </select>
                    <p className="mt-1 text-[10px] text-slate-400">FIXED = Tarif; VARIABLE = GRT x Tarif; QTY_CARGO = Quantity Cargo x Tarif.</p>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Item Service:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Harbour Pilotage Service"
                      value={newTariff.serviceName}
                      onChange={(e) => {
                        const nextServiceName = e.target.value;
                        setNewTariff({ ...newTariff, serviceName: nextServiceName });
                        applyTariffDefaultsFromMaster(nextServiceName, newTariff.portId);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">GRT Min:</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatRateInput(newTariff.grtMin)}
                        onChange={(e) => setNewTariff({ ...newTariff, grtMin: parseTariffNumber(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">GRT Max:</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatRateInput(newTariff.grtMax)}
                        onChange={(e) => setNewTariff({ ...newTariff, grtMax: parseTariffNumber(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">DWT:</label>
                    <input type="number" step="0.01" value={newTariff.dwt} onChange={(e) => setNewTariff({ ...newTariff, dwt: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">IDR:</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatRateInput(newTariff.rateIDR)}
                        onChange={(e) => setNewTariff({ ...newTariff, rateIDR: parseTariffNumber(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">USD:</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatRateInput(newTariff.rateUSD)}
                        onChange={(e) => setNewTariff({ ...newTariff, rateUSD: parseTariffNumber(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                  </div>

                </>
              )}

              {activeTab === 'EXPENSES_ITEM' && (
                <>
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                    Format angka: 1,500.50 (koma untuk ribuan, titik untuk desimal).
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Port:</label>
                      <select
                        value={newExpense.portId || ''}
                        onChange={(e) => setNewExpense({
                          ...newExpense,
                          portId: e.target.value,
                          portName: ports.find((p) => p.id === e.target.value)?.name || '',
                        })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        {ports.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Category:</label>
                      <select
                        value={newExpense.category}
                        onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value as any })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        <option value="PORT_EXPENSES">PORT EXPENSES</option>
                        <option value="PORT_SERVICE">PORT SERVICE</option>
                        <option value="CLEARANCE">CLEARANCE IN/OUT</option>
                        <option value="GENERAL_EXPENSES">GENERAL EXPENSES</option>
                        <option value="CREW_EXPENSES">CREW EXPENSES</option>
                        <option value="OWNER_MATTER">OWNER MATTER</option>
                        <option value="AGENCY_FEE">AGENCY FEE</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Calculation Type:</label>
                    <select value={newExpense.calculationType} onChange={(e) => setNewExpense({ ...newExpense, calculationType: e.target.value as any })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white mb-3">
                      <option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="QTY_RATE">Qty_rate</option><option value="PERCENTAGE">Percentage</option><option value="QTY_CARGO">QTY_CARGO</option>
                    </select>
                    <p className="mt-1 text-[10px] text-slate-400">QTY_CARGO dihitung dari Quantity Cargo x Tarif x QTY.</p>
                    <label className="text-slate-400 block mb-1">Item Name:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Tugboat 2x 3500 HP"
                      value={newExpense.name}
                      onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Unit:</label>
                      <select
                        value={newExpense.unit || 'job'}
                        onChange={(e) => setNewExpense({ ...newExpense, unit: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        <option value="job">job</option>
                        <option value="hour">hour</option>
                        <option value="day">day</option>
                        <option value="qty">qty</option>
                        <option value="GRT">GRT</option>
                      </select>
                    </div>
                    <div />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Rate IDR:</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatRateInput(newExpense.rateIDR)}
                        onChange={(e) => setNewExpense({ ...newExpense, rateIDR: parseTariffNumber(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Rate USD:</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatRateInput(newExpense.rateUSD)}
                        onChange={(e) => setNewExpense({ ...newExpense, rateUSD: parseTariffNumber(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'VENDOR_PARTNERS' && (
                <>
                  <div>
                    <label className="text-slate-400 block mb-1">Vendor Name:</label>
                    <input required value={newVendor.vendorName} onChange={(e) => setNewVendor({ ...newVendor, vendorName: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="e.g. PT Samudera Jaya" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Bank Name:</label>
                    <input value={newVendor.bankName} onChange={(e) => setNewVendor({ ...newVendor, bankName: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="e.g. Bank Mandiri" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Paid Name:</label>
                    <input value={newVendor.paidName} onChange={(e) => setNewVendor({ ...newVendor, paidName: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="Nama penerima pembayaran" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">A/C Number:</label>
                    <input value={newVendor.accountNumber} onChange={(e) => setNewVendor({ ...newVendor, accountNumber: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono" placeholder="Nomor rekening" />
                  </div>
                  {addFormError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{addFormError}</div>}
                </>
              )}

              {activeTab === 'BANK_ACCOUNT' && (
                <>
                  <div>
                    <label className="text-slate-400 block mb-1">Bank Name:</label>
                    <input required value={newBankAccount.bankName} onChange={(e) => setNewBankAccount({ ...newBankAccount, bankName: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="e.g. Bank Mandiri" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Branch:</label>
                    <input value={newBankAccount.branch || ''} onChange={(e) => setNewBankAccount({ ...newBankAccount, branch: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="Nama cabang bank" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">A/c Name:</label>
                    <input required value={newBankAccount.accountName} onChange={(e) => setNewBankAccount({ ...newBankAccount, accountName: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="Nama rekening" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">A/c Number:</label>
                    <input required value={newBankAccount.accountNumber} onChange={(e) => setNewBankAccount({ ...newBankAccount, accountNumber: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono" placeholder="Nomor rekening" />
                  </div>
                  {addFormError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{addFormError}</div>}
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddFormError(''); }}
                  className="master-data-cancel px-4 py-2 rounded-lg text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="master-data-submit px-4 py-2 rounded-lg text-xs font-semibold"
                >
                  Simpan ke Database
                </button>
              </div>
            </form>
        </section>
      )}
    </div>
  );
};
