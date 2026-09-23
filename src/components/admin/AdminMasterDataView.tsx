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
  UserRole,
  ActiveTab,
} from '../../types';
import { db } from '../../db/storage';
import { saveStoredAccount } from '../../auth';

interface AdminMasterDataViewProps {
  initialTab?: 'USERS' | 'CUSTOMERS' | 'VESSELS' | 'PORTS' | 'ZONES' | 'FIX_TARIFF' | 'EXPENSES_ITEM';
  users: User[];
  customers: Customer[];
  vessels: Vessel[];
  ports: Port[];
  zones: Zone[];
  fixTariffs: FixTariff[];
  expensesItems: ExpensesItem[];
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
  onDataSaved,
}) => {
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
    { type: 'CUSTOMERS' | 'VESSELS' | 'PORTS' | 'FIX_TARIFF' | 'EXPENSES_ITEM'; id: string } | null
  >(null);
  const [editMasterForm, setEditMasterForm] = useState<any>({});

  const openMasterEditor = (
    type: 'CUSTOMERS' | 'VESSELS' | 'PORTS' | 'FIX_TARIFF' | 'EXPENSES_ITEM',
    item: Customer | Vessel | Port | FixTariff | ExpensesItem
  ) => {
    setEditingMaster({ type, id: item.id });
    setEditMasterForm({ ...item });
  };

  const closeMasterEditor = () => {
    setEditingMaster(null);
    setEditMasterForm({});
  };

  const saveMasterEditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaster) return;
    const { type, id } = editingMaster;
    if (type === 'CUSTOMERS') db.updateCustomer(id, editMasterForm);
    if (type === 'VESSELS') db.updateVessel(id, editMasterForm);
    if (type === 'PORTS') db.updatePort(id, editMasterForm);
    if (type === 'FIX_TARIFF') {
      const port = ports.find((p) => p.id === editMasterForm.portId);
      const rateIDR = Number(editMasterForm.rateIDR) || 0;
      const rateUSD = Number(editMasterForm.rateUSD) || 0;
      db.updateFixTariff(id, {
        ...editMasterForm,
        portName: port?.name || editMasterForm.portName || '',
        rateIDR,
        rateUSD,
        rate: rateUSD || rateIDR || Number(editMasterForm.rate) || 0,
        currency: rateUSD ? 'USD' : 'IDR',
      });
    }
    if (type === 'EXPENSES_ITEM') {
      const rateIDR = Number(editMasterForm.rateIDR) || 0;
      const rateUSD = Number(editMasterForm.rateUSD) || 0;
      const selectedRate = rateUSD || rateIDR || Number(editMasterForm.standardCostSell) || Number(editMasterForm.standardCostBuy) || 0;
      db.updateExpensesItem(id, {
        ...editMasterForm,
        rateIDR,
        rateUSD,
        defaultCurrency: rateUSD ? 'USD' : 'IDR',
        standardCostBuy: selectedRate,
        standardCostSell: selectedRate,
      });
    }
    closeMasterEditor();
    onDataSaved?.(activeTab);
  };

  const openUserEditor = (user: User) => {
    setEditingUser(user);
    setUserEditError('');
    setEditUserForm({ ...user, newPassword: '' });
  };

  const saveUserEditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editUserForm.username || !editUserForm.name || !editUserForm.email || !editUserForm.position) {
      setUserEditError('User, nama, jabatan, dan email wajib diisi.');
      return;
    }
    if (editUserForm.newPassword && editUserForm.newPassword.length < 6) {
      setUserEditError('Password baru minimal 6 karakter.');
      return;
    }
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
    db.updateUser(editingUser.id, updates);
    const updated = { ...editingUser, ...updates } as User;
    saveStoredAccount({ ...updated, username: updated.username || editingUser.username || '', password: updated.password || editingUser.password || '' });
    setEditingUser(null);
    setEditUserForm({});
    onDataSaved?.(activeTab);
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
    role: 'SALES',
    department: 'Commercial',
    branch: 'Head Office',
    status: 'ACTIVE',
    phone: '',
    username: '',
    password: '',
    position: '',
  });

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
      currency: match.defaultCurrency || current.currency || 'USD',
      rate: Number(match.standardCostSell || match.standardCostBuy || current.rate || 0),
      minCharge: Number(match.standardCostBuy || match.standardCostSell || current.minCharge || 0),
      calculationBasis: match.calculationType === 'QTY_RATE'
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

  const uploadNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const uploadGRTRange = (row: Record<string, unknown>) => {
    const minimum = uploadNumber(readUploadValue(row, 'grtMin', 'grt_min', 'grtFrom', 'grt_from'));
    const maximum = uploadNumber(readUploadValue(row, 'grtMax', 'grt_max', 'grtTo', 'grt_to'));
    const raw = String(readUploadValue(row, 'grt', 'GRT')).trim();
    const parts = raw.split(/\s*(?:-|–|to)\s*/i).filter(Boolean);
    const legacyMinimum = parts.length > 1 ? uploadNumber(parts[0]) : uploadNumber(raw);
    const legacyMaximum = parts.length > 1 ? uploadNumber(parts[1]) : uploadNumber(raw);
    return { grtMin: minimum || legacyMinimum, grtMax: maximum || legacyMaximum };
  };

  const normalizeExpenseCategory = (value: unknown) => {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    return normalized === 'CLEARANCE_IN/OUT' || normalized === 'CLEARANCE_IN_OUT'
      ? 'CLEARANCE'
      : normalized;
  };

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
    const categories = ['PORT_EXPENSES', 'CLEARANCE', 'GENERAL_EXPENSES', 'CREW_EXPENSES', 'OWNER_MATTER', 'AGENCY_FEE'];
    const currencies = ['USD', 'IDR'];
    const expenseCalculationTypes = ['FIXED', 'VARIABLE', 'QTY_RATE', 'PERCENTAGE', 'RANGE'];
    const tariffTypes = ['FIXED', 'VARIABLE', 'RANGE'];
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
          costCategory: listRange(3, categories),
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

  const handleMasterDataUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || (activeTab !== 'FIX_TARIFF' && activeTab !== 'EXPENSES_ITEM')) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      let imported = 0;
      let duplicates = 0;
      let invalid = 0;
      const importedTariffs: FixTariff[] = [];
      const importedExpenses: ExpensesItem[] = [];

      rows.forEach((row, index) => {
        const portId = String(readUploadValue(row, 'portId', 'port_id')).trim();
        const portInput = String(readUploadValue(row, 'portName', 'port', 'port_name')).trim();
        const selectedPort = ports.find((port) => port.id.toLowerCase() === portInput.toLowerCase() || port.name.toLowerCase() === portInput.toLowerCase());
        const portName = selectedPort?.name || portInput;
        const currency = String(readUploadValue(row, 'currency', 'defaultCurrency', 'default_currency')).trim().toUpperCase();
        const category = normalizeExpenseCategory(readUploadValue(row, 'category', 'costCategory', 'categoryCost', 'cost_category', 'category_cost')) || 'PORT_EXPENSES';

        if (activeTab === 'FIX_TARIFF') {
          const serviceName = String(readUploadValue(row, 'serviceName', 'service_name', 'itemService', 'item_service')).trim();
          const rateIDR = uploadNumber(readUploadValue(row, 'rateIDR', 'rate_idr', 'idr'));
          const rateUSD = uploadNumber(readUploadValue(row, 'rateUSD', 'rate_usd', 'usd'));
          const resolvedCurrency = rateUSD > 0 ? 'USD' : rateIDR > 0 ? 'IDR' : currency;
          const resolvedRate = rateUSD > 0 ? rateUSD : rateIDR > 0 ? rateIDR : uploadNumber(readUploadValue(row, 'rate'));
          const grtRange = uploadGRTRange(row);
          if (!serviceName || !['USD', 'IDR'].includes(resolvedCurrency) || resolvedRate < 0) {
            invalid += 1;
            return;
          }
          const duplicate = [...fixTariffs, ...importedTariffs].some((tariff) =>
            tariff.serviceName.trim().toLowerCase() === serviceName.toLowerCase()
            && sameUploadPort(portId, portName, tariff.portId, tariff.portName)
            && (tariff.costCategory || 'PORT_EXPENSES').toUpperCase() === category
            && tariff.currency === resolvedCurrency
          );
          if (duplicate) {
            duplicates += 1;
            return;
          }
          const tariff: FixTariff = {
            id: '',
            portId: selectedPort?.id || portId,
            portName,
            costCategory: category,
            serviceCode: String(readUploadValue(row, 'serviceCode', 'service_code')).trim(),
            serviceName,
            grt: grtRange.grtMin === grtRange.grtMax ? grtRange.grtMin : undefined,
            grtMin: grtRange.grtMin,
            grtMax: grtRange.grtMax,
            dwt: uploadNumber(readUploadValue(row, 'dwt', 'DWT')),
            calculationBasis: String(readUploadValue(row, 'calculationBasis', 'calculation_basis', 'basis')).trim().toUpperCase() as FixTariff['calculationBasis'] || 'LUMP_SUM',
            tariffType: String(readUploadValue(row, 'tariffType', 'tariff_type', 'type')).trim().toUpperCase() as FixTariff['tariffType'] || 'FIXED',
            currency: resolvedCurrency as FixTariff['currency'],
            rate: resolvedRate,
            rateIDR,
            rateUSD,
            minCharge: uploadNumber(readUploadValue(row, 'minCharge', 'min_charge')),
            description: String(readUploadValue(row, 'description')).trim(),
          };
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
          invalid += 1;
          return;
        }
        const duplicate = [...expensesItems, ...importedExpenses].some((expense) =>
          expense.name.trim().toLowerCase() === name.toLowerCase()
          && sameUploadPort(portId, portName, expense.portId, expense.portName)
          && expense.category.toUpperCase() === category
          && expense.defaultCurrency === resolvedExpenseCurrency
        );
        if (duplicate) {
          duplicates += 1;
          return;
        }
        const expense: ExpensesItem = {
          id: '',
          portId: selectedPort?.id || portId,
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
          calculationType: String(readUploadValue(row, 'calculationType', 'calculation_type', 'type')).trim().toUpperCase() as ExpensesItem['calculationType'] || 'FIXED',
        };
        importedExpenses.push(expense);
        db.addExpensesItem(expense);
        imported += 1;
      });

      if (activeTab === 'FIX_TARIFF' && importedTariffs.length) {
        await db.addFixTariffsBulk(importedTariffs.map(({ id: _id, ...tariff }) => tariff));
      }

      setUploadMessage(`Upload selesai: ${imported} tersimpan, ${duplicates} duplikat dilewati, ${invalid} baris tidak valid.`);
      onDataSaved?.(activeTab);
    } catch {
      setUploadMessage('File gagal dibaca. Gunakan file Excel/CSV dengan header yang sesuai.');
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddFormError('');
    try {
      if (activeTab === 'USERS') {
        if (!newUser.name?.trim() || !newUser.email?.trim() || !newUser.username?.trim() || !newUser.password || !newUser.position?.trim()) {
          setAddFormError('Lengkapi User, Password, Nama, Jabatan, dan Email sebelum menyimpan.');
          return;
        }
        const created = db.addUser(newUser as Omit<User, 'id'>);
        saveStoredAccount({ ...created, username: newUser.username!, password: newUser.password! });
      } else if (activeTab === 'CUSTOMERS') {
        if (!newCustomer.companyName?.trim()) {
          setAddFormError('Nama perusahaan wajib diisi sebelum menyimpan.');
          return;
        }
        db.addCustomer(newCustomer as Omit<Customer, 'id'>);
      } else if (activeTab === 'VESSELS') {
        if (!newVessel.name?.trim()) {
          setAddFormError('Nama kapal wajib diisi sebelum menyimpan.');
          return;
        }
        db.addVessel(newVessel as Omit<Vessel, 'id'>);
      } else if (activeTab === 'PORTS') {
        if (!newPort.code?.trim() || !newPort.name?.trim()) {
          setAddFormError('Kode dan nama pelabuhan wajib diisi sebelum menyimpan.');
          return;
        }
        db.addPort(newPort as Omit<Port, 'id'>);
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
        const port = ports.find((p) => p.id === newTariff.portId);
        const rateIDR = Number(newTariff.rateIDR) || 0;
        const rateUSD = Number(newTariff.rateUSD) || 0;
        db.addFixTariff({
          ...newTariff,
          portName: port?.name || '',
          rateIDR,
          rateUSD,
          rate: rateUSD || rateIDR || 0,
          currency: rateUSD ? 'USD' : 'IDR',
        } as Omit<FixTariff, 'id'>);
      } else if (activeTab === 'EXPENSES_ITEM') {
        if (!newExpense.name?.trim()) {
          setAddFormError('Nama item wajib diisi sebelum menyimpan.');
          return;
        }
        const port = ports.find((p) => p.id === newExpense.portId);
        const rateIDR = Number(newExpense.rateIDR) || 0;
        const rateUSD = Number(newExpense.rateUSD) || 0;
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
    onDataSaved?.(activeTab);
  };

  const formatCostCategory = (category?: string) => ({
    PORT_EXPENSES: 'PORT EXPENSES',
    CLEARANCE: 'CLEARANCE IN/OUT',
    GENERAL_EXPENSES: 'GENERAL EXPENSES',
    CREW_EXPENSES: 'CREW EXPENSES',
    OWNER_MATTER: 'OWNER MATTER',
    AGENCY_FEE: 'AGENCY FEE',
  } as Record<string, string>)[category || ''] || category || '-';

  const formatExpenseCategory = (category?: string) => ({
    PORT_EXPENSES: 'PORT EXPENSES',
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

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {(activeTab === 'FIX_TARIFF' || activeTab === 'EXPENSES_ITEM') && (
              <>
                <input ref={uploadInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleMasterDataUpload} className="hidden" />
                <button
                  type="button"
                  onClick={downloadMasterDataTemplate}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Excel</span>
                </button>
              </>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-300"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Data {activeTab.replace('_', ' ')}</span>
            </button>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200" />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
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
      </div>

      {uploadMessage && (activeTab === 'FIX_TARIFF' || activeTab === 'EXPENSES_ITEM') && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          {uploadMessage}
        </div>
      )}

      {/* Tables for each Tab */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
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
                    <td className="p-3.5"><button onClick={()=>db.updateUser(u.id,{status:u.status==='ACTIVE'?'INACTIVE':'ACTIVE'})} className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${u.status==='ACTIVE'?'bg-emerald-50 text-emerald-600 hover:bg-emerald-100':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{u.status}</button></td>
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
                        {v.grt.toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-600">
                        {v.dwt.toLocaleString()}
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
                  <th className="p-3.5 text-right">GRT</th>
                  <th className="p-3.5 text-right">DWT</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5 text-right">IDR</th>
                  <th className="p-3.5 text-right">USD</th>
                  <th className="p-3.5 text-right">Action</th>
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
                      <td className="p-3.5 text-right font-mono text-slate-600">{t.grtMin || t.grtMax || t.grt ? `${(t.grtMin ?? t.grt ?? 0).toLocaleString()} - ${(t.grtMax ?? t.grt ?? 0).toLocaleString()}` : '-'}</td>
                      <td className="p-3.5 text-right font-mono text-slate-600">{t.dwt ? t.dwt.toLocaleString() : '-'}</td>
                      <td className="p-3.5"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-600">{t.tariffType || (t.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE')}</span></td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{(t.rateIDR ?? (t.currency === 'IDR' ? t.rate : 0)) ? (t.rateIDR ?? t.rate).toLocaleString() : '-'}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{(t.rateUSD ?? (t.currency === 'USD' ? t.rate : 0)) ? (t.rateUSD ?? t.rate).toLocaleString() : '-'}</td>
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
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{(e.rateIDR ?? (e.defaultCurrency === 'IDR' ? e.standardCostSell : 0)) ? (e.rateIDR ?? e.standardCostSell).toLocaleString('en-US') : '-'}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{(e.rateUSD ?? (e.defaultCurrency === 'USD' ? e.standardCostSell : 0)) ? (e.rateUSD ?? e.standardCostSell).toLocaleString('en-US') : '-'}</td>
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
      </div>

      {/* Generic Master Data Edit Modal */}
      {editingMaster && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) closeMasterEditor(); }}>
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600">Master Data</div>
                <h3 className="text-lg font-black text-slate-900">
                  Edit {editingMaster.type === 'CUSTOMERS' ? 'Customer' : editingMaster.type === 'VESSELS' ? 'Vessel' : editingMaster.type === 'PORTS' ? 'Port' : editingMaster.type === 'FIX_TARIFF' ? 'Fix Tariff' : 'Expense Item'}
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
                    <label className="block"><span className="text-slate-500 font-semibold">Category Cost</span><select value={editMasterForm.costCategory || 'PORT_EXPENSES'} onChange={e=>setEditMasterForm({...editMasterForm,costCategory:e.target.value})} className="master-edit-input"><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="AGENCY_FEE">AGENCY FEE</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Type</span><select value={editMasterForm.tariffType || 'VARIABLE'} onChange={e=>setEditMasterForm({...editMasterForm,tariffType:e.target.value})} className="master-edit-input"><option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="RANGE">Range</option></select></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Item Service</span><input required value={editMasterForm.serviceName || ''} onChange={e=>setEditMasterForm({...editMasterForm,serviceName:e.target.value})} className="master-edit-input" /></label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">GRT Minimum</span><input type="number" step="0.01" value={editMasterForm.grtMin ?? editMasterForm.grt ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,grtMin:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">GRT Maximum</span><input type="number" step="0.01" value={editMasterForm.grtMax ?? editMasterForm.grt ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,grtMax:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">DWT</span><input type="number" step="0.01" value={editMasterForm.dwt ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,dwt:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Minimum Charge</span><input type="number" value={editMasterForm.minCharge ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,minCharge:Number(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">IDR</span><input type="number" step="0.0001" value={editMasterForm.rateIDR ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,rateIDR:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">USD</span><input type="number" step="0.0001" value={editMasterForm.rateUSD ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,rateUSD:Number(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                </>
              )}

              {editingMaster.type === 'EXPENSES_ITEM' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Port</span><select value={editMasterForm.portId || ''} onChange={e=>setEditMasterForm({...editMasterForm,portId:e.target.value,portName: ports.find((p) => p.id === e.target.value)?.name || ''})} className="master-edit-input">{ports.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Category</span><select required value={editMasterForm.category || 'PORT_EXPENSES'} onChange={e=>setEditMasterForm({...editMasterForm,category:e.target.value})} className="master-edit-input"><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="AGENCY_FEE">AGENCY FEE</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Item Name</span><input required value={editMasterForm.name || ''} onChange={e=>setEditMasterForm({...editMasterForm,name:e.target.value})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Unit</span><select value={editMasterForm.unit || 'job'} onChange={e=>setEditMasterForm({...editMasterForm,unit:e.target.value})} className="master-edit-input"><option value="job">job</option><option value="hour">hour</option><option value="day">day</option><option value="qty">qty</option><option value="GRT">GRT</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Calculation Type</span><select value={editMasterForm.calculationType || 'FIXED'} onChange={e=>setEditMasterForm({...editMasterForm,calculationType:e.target.value})} className="master-edit-input"><option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="QTY_RATE">Qty_rate</option><option value="PERCENTAGE">Percentage</option><option value="RANGE">Range</option></select></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Unit</span><select value={editMasterForm.unit || 'job'} onChange={e=>setEditMasterForm({...editMasterForm,unit:e.target.value})} className="master-edit-input"><option value="job">job</option><option value="hour">hour</option><option value="day">day</option><option value="qty">qty</option><option value="GRT">GRT</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-slate-500 font-semibold">Rate IDR</span><input type="number" step="0.0001" value={editMasterForm.rateIDR ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,rateIDR:Number(e.target.value)})} className="master-edit-input" /></label>
                    <label className="block"><span className="text-slate-500 font-semibold">Rate USD</span><input type="number" step="0.0001" value={editMasterForm.rateUSD ?? 0} onChange={e=>setEditMasterForm({...editMasterForm,rateUSD:Number(e.target.value)})} className="master-edit-input" /></label>
                  </div>
                </>
              )}

              {addFormError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{addFormError}</div>}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={closeMasterEditor} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold">Batal</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}>
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5">
              <div><div className="text-[10px] font-bold uppercase tracking-widest text-violet-600">User Management</div><h3 className="text-lg font-black text-slate-900">Edit Data User</h3><p className="text-xs text-slate-500">Perubahan disimpan ke database browser dan akun login.</p></div>
              <button type="button" onClick={() => setEditingUser(null)} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={saveUserEditor} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-slate-500 font-semibold">User / Username</span><input value={editUserForm.username || ''} onChange={e => setEditUserForm({...editUserForm, username:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800" /></label>
                <label className="block"><span className="text-slate-500 font-semibold">Nama Pemegang User</span><input value={editUserForm.name || ''} onChange={e => setEditUserForm({...editUserForm, name:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-slate-500 font-semibold">Role</span><select value={editUserForm.role || 'SALES'} onChange={e => setEditUserForm({...editUserForm, role:e.target.value as UserRole})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800"><option value="ADMIN">ADMIN</option><option value="SALES">SALES</option><option value="MANAGER_OPS">MANAGER_OPS</option><option value="FDA">FDA</option><option value="FINANCE">FINANCE</option></select></label>
                <label className="block"><span className="text-slate-500 font-semibold">Jabatan</span><input value={editUserForm.position || ''} onChange={e => setEditUserForm({...editUserForm, position:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-slate-500 font-semibold">Email</span><input type="email" value={editUserForm.email || ''} onChange={e => setEditUserForm({...editUserForm, email:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800" /></label>
                <label className="block"><span className="text-slate-500 font-semibold">Status</span><select value={editUserForm.status || 'ACTIVE'} onChange={e => setEditUserForm({...editUserForm, status:e.target.value as User['status']})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-slate-500 font-semibold">Departemen</span><input value={editUserForm.department || ''} onChange={e => setEditUserForm({...editUserForm, department:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800" /></label>
                <label className="block md:col-span-2"><span className="text-slate-500 font-semibold">Branch</span><input required value={editUserForm.branch || ''} onChange={e => setEditUserForm({...editUserForm, branch:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-slate-500 font-semibold">Phone</span><input value={editUserForm.phone || ''} onChange={e => setEditUserForm({...editUserForm, phone:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800" /></label>
                <label className="block"><span className="text-slate-500 font-semibold">Password Baru</span><input type="password" placeholder="Kosongkan jika tidak diubah" value={editUserForm.newPassword || ''} onChange={e => setEditUserForm({...editUserForm, newPassword:e.target.value})} className="mt-1 w-full border border-slate-200 rounded-lg p-2.5 text-slate-800" /></label>
              </div>
              {userEditError && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-600 px-3 py-2">{userEditError}</div>}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200"><button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600">Batal</button><button type="submit" className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold">Simpan Perubahan</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="admin-add-modal bg-slate-50 border border-slate-300 rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-300 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Tambah Master: {activeTab.replace('_', ' ')}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-500 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form noValidate onSubmit={handleSaveItem} className="space-y-3.5 text-xs text-slate-700">
              {activeTab === 'USERS' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-slate-400 block mb-1">User / Username:</label><input required value={newUser.username} onChange={e=>setNewUser({...newUser,username:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="contoh: budi.admin" /></div>
                    <div><label className="text-slate-400 block mb-1">Password:</label><input required type="password" value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="minimal 6 karakter" /></div>
                  </div>
                  <div><label className="text-slate-400 block mb-1">Nama Pemegang User:</label><input required value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-slate-400 block mb-1">Role:</label><select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value as UserRole})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"><option value="ADMIN">ADMIN</option><option value="SALES">SALES</option><option value="MANAGER_OPS">MANAGER_OPS</option><option value="FDA">FDA</option><option value="FINANCE">FINANCE</option></select></div>
                    <div><label className="text-slate-400 block mb-1">Jabatan:</label><input required value={newUser.position} onChange={e=>setNewUser({...newUser,position:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-slate-400 block mb-1">Email:</label><input required type="email" value={newUser.email} onChange={e=>setNewUser({...newUser,email:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" /></div>
                    <div><label className="text-slate-400 block mb-1">Status:</label><select value={newUser.status} onChange={e=>setNewUser({...newUser,status:e.target.value as any})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="md:col-span-2"><label className="text-slate-400 block mb-1">Branch:</label><input required value={newUser.branch || ''} onChange={e=>setNewUser({...newUser,branch:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" placeholder="contoh: JKT, Head Office, Surabaya" /></div>
                    <div><label className="text-slate-400 block mb-1">Departemen:</label><input required value={newUser.department} onChange={e=>setNewUser({...newUser,department:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" /></div>
                    <div><label className="text-slate-400 block mb-1">Phone:</label><input value={newUser.phone} onChange={e=>setNewUser({...newUser,phone:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white" /></div>
                  </div>
                </>
              )}

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
                        <option value="CLEARANCE">CLEARANCE IN/OUT</option>
                        <option value="GENERAL_EXPENSES">GENERAL EXPENSES</option>
                        <option value="CREW_EXPENSES">CREW EXPENSES</option>
                        <option value="OWNER_MATTER">OWNER MATTER</option>
                        <option value="AGENCY_FEE">AGENCY FEE</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Type:</label>
                    <select
                      value={newTariff.tariffType}
                      onChange={(e) => setNewTariff({ ...newTariff, tariffType: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    >
                      <option value="FIXED">Fixed</option>
                      <option value="VARIABLE">Variabel</option>
                      <option value="RANGE">Range</option>
                    </select>
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
                      <label className="text-slate-400 block mb-1">GRT:</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newTariff.grtMin}
                        onChange={(e) => setNewTariff({ ...newTariff, grtMin: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">GRT Maximum:</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newTariff.grtMax}
                        onChange={(e) => setNewTariff({ ...newTariff, grtMax: Number(e.target.value) })}
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
                        type="number"
                        step="0.0001"
                        value={newTariff.rateIDR}
                        onChange={(e) => setNewTariff({ ...newTariff, rateIDR: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">USD:</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={newTariff.rateUSD}
                        onChange={(e) => setNewTariff({ ...newTariff, rateUSD: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Minimum Charge:</label>
                    <input
                      type="number"
                      value={newTariff.minCharge}
                      onChange={(e) => setNewTariff({ ...newTariff, minCharge: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>
                </>
              )}

              {activeTab === 'EXPENSES_ITEM' && (
                <>
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
                      <option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="QTY_RATE">Qty_rate</option><option value="PERCENTAGE">Percentage</option><option value="RANGE">Range</option>
                    </select>
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
                        type="number"
                        step="0.0001"
                        value={newExpense.rateIDR}
                        onChange={(e) => setNewExpense({ ...newExpense, rateIDR: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Rate USD:</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={newExpense.rateUSD}
                        onChange={(e) => setNewExpense({ ...newExpense, rateUSD: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-600 text-xs font-semibold"
                >
                  Simpan ke Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
