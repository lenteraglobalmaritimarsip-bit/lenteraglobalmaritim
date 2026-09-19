import React, { useEffect, useState } from 'react';
// 1. IMPORT SUPABASE DI PALING ATAS
import { supabase } from '../../supabaseClient';
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
} from 'lucide-react';
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
      db.updateFixTariff(id, { ...editMasterForm, portName: port?.name || editMasterForm.portName || '' });
    }
    if (type === 'EXPENSES_ITEM') db.updateExpensesItem(id, editMasterForm);
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

  useEffect(() => {
    setActiveTab(initialTab);
    setSearchQuery('');
    setShowAddModal(false);
    closeMasterEditor();
    setEditingUser(null);
  }, [initialTab]);

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
    serviceCode: '',
    serviceName: '',
    calculationBasis: 'PER_GRT',
    tariffType: 'VARIABLE',
    currency: 'USD',
    rate: 0.05,
    minCharge: 500,
    description: '',
  });

  const [newExpense, setNewExpense] = useState<Partial<ExpensesItem>>({
    code: '',
    category: 'PORT_EXPENSES',
    name: '',
    unit: 'job',
    defaultCurrency: 'USD',
    standardCostBuy: 1000,
    standardCostSell: 1300,
    preferredVendor: '',
    calculationType: 'FIXED',
  });

  // 2. LOGIKA SINKRONISASI SAVE DENGAN CLOUD SUPABASE
  const handleSaveItem = (e: React.FormEvent) => {
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

        // 💡 INTEGRASI OTOMATIS KE SUPABASE CLOUD
        const empCode = 'EMP-' + Math.floor(1000 + Math.random() * 9000);
        supabase
          .from('app_users')
          .insert([
            {
              employee_code: newUser.username || empCode,
              name: newUser.name,
              email: newUser.email,
              username: newUser.username,
              password_hash: newUser.password || 'default_hash_123',
              role: newUser.role || 'SALES',
              department: newUser.department || 'Commercial',
              phone: newUser.phone || '',
              status: 'ACTIVE'
            }
          ])
          .then(({ error }) => {
            if (error) {
              alert("Gagal sinkronisasi ke Supabase Cloud: " + error.message);
            } else {
              alert("🎉 Sukses! Karyawan baru '" + newUser.name + "' telah terdaftar online di Supabase.");
            }
          });

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
        if (!newPort.name?.trim()) {
          setAddFormError('Nama pelabuhan wajib diisi sebelum menyimpan.');
          return;
        }
        db.addPort(newPort as Omit<Port, 'id'>);
      } else if (activeTab === 'ZONES') {
        if (!newZone.zoneName?.trim()) {
          setAddFormError('Nama zona wajib diisi sebelum menyimpan.');
          return;
        }
        const port = ports.find((p) => p.id === newZone.portId);
        db.addZone({ ...newZone, portName: port?.name || '' } as any);
      } else if (activeTab === 'FIX_TARIFF') {
        if (!newTariff.serviceName?.trim()) {
          setAddFormError('Nama layanan tarif wajib diisi sebelum menyimpan.');
          return;
        }
        const port = ports.find((p) => p.id === newTariff.portId);
        db.addFixTariff({ ...newTariff, portName: port?.name || '' } as any);
      } else if (activeTab === 'EXPENSES_ITEM') {
        if (!newExpense.name?.trim()) {
          setAddFormError('Nama item biaya wajib diisi sebelum menyimpan.');
          return;
        }
        db.addExpensesItem(newExpense as Omit<ExpensesItem, 'id'>);
      }

      setShowAddModal(false);
      onDataSaved?.(activeTab);
    } catch (err: any) {
      setAddFormError(err.message || 'Gagal menyimpan data master.');
    }
  };

  // 3. KODE VISUAL TAMPILAN DASHBOARD (UI/JSX) UTUH
  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100">
      <div className="flex justify-between items-center mb-6">
        <div>
