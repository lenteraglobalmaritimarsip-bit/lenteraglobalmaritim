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
  CashBalanceAdjustment,
  PaymentVoucher,
  JobCall,
  Currency,
  UserRole,
  AuditLog,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_CUSTOMERS,
  INITIAL_VESSELS,
  INITIAL_PORTS,
  INITIAL_ZONES,
  INITIAL_FIX_TARIFFS,
  INITIAL_EXPENSES_ITEMS,
  INITIAL_JOB_CALLS,
} from './initialData';
import { apiAuth } from '../lib/api';
import { dataApi } from '../lib/dataApi';

import { todayISO } from '../utils/date';
import { convertPrincipalReceiptAmount, getPrincipalReceiptSummary, syncPrincipalInvoiceSettlement } from '../utils/principalInvoice';

export interface DatabaseState {
  users: User[];
  customers: Customer[];
  vessels: Vessel[];
  ports: Port[];
  zones: Zone[];
  fixTariffs: FixTariff[];
  expensesItems: ExpensesItem[];
  vendorPartners: VendorPartner[];
  bankAccounts: BankAccount[];
  cashBalanceAdjustments: CashBalanceAdjustment[];
  paymentVouchers: PaymentVoucher[];
  jobCalls: JobCall[];
  reservedJobIds?: string[];
  currentRole: UserRole;
  selectedJobId: string;
  auditLogs: AuditLog[];
}

const LOCAL_INITIAL_JOB_CALLS: JobCall[] = [];
const DEMO_JOB_IDS = new Set(['VC-2026-0095', 'VC-2026-0098', 'VC-2026-0099']);

const withoutRemovedJobCalls = (jobCalls: JobCall[]): JobCall[] =>
  jobCalls.filter((job) => !DEMO_JOB_IDS.has(job.jobId));

const toLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const migrateJobData = (jobCalls: JobCall[]): { jobCalls: JobCall[]; migrated: boolean } => {
  let migrated = false;
  const usedFdaNumbers = new Set(
    jobCalls
      .map((job) => job.fda?.fdaNo)
      .filter((number): number is string => !!number && /^\d+\/FDA-LGM-[A-Z0-9]+\/\d{2}\/\d{4}$/.test(number)),
  );
  const normalizedJobCalls = jobCalls.map((job) => {
    const inquiry = job.inquiry as (Omit<JobCall['inquiry'], 'quantityUnit'> & { quantity?: number; quantityUnit?: 'MT' | 'TON' | 'MATRIX_TON' }) | undefined;
    let normalizedJob = job;

    if (inquiry) {
      const hasLegacyQuantity = Object.prototype.hasOwnProperty.call(inquiry, 'quantity');
      const hasLegacyUnit = inquiry.quantityUnit === 'MATRIX_TON';
      if (hasLegacyQuantity || hasLegacyUnit) {
        const { quantity, ...currentInquiry } = inquiry;
        normalizedJob = {
          ...normalizedJob,
          inquiry: {
            ...currentInquiry,
            cargoQuantity: currentInquiry.cargoQuantity ?? quantity,
            quantityUnit: currentInquiry.quantityUnit === 'MATRIX_TON' ? 'MT' : currentInquiry.quantityUnit,
          },
        };
        migrated = true;
      }
    }

    const legacyFdaNumber = /^FDA-VC-(\d{4})-(\d{4})$/.exec(job.fda?.fdaNo || '');
    if (legacyFdaNumber) {
      const fdaDate = /^\d{4}-\d{2}-\d{2}$/.test(job.fda.date)
        ? job.fda.date
        : `${legacyFdaNumber[1]}-01-01`;
      const [year, month] = fdaDate.split('-');
      const branchCode = normalizeBranchCode(job.inquiry?.createdByBranch || 'JKT');
      let sequence = Number(legacyFdaNumber[2]);
      let fdaNo = `${String(sequence).padStart(4, '0')}/FDA-LGM-${branchCode}/${month}/${year}`;
      while (usedFdaNumbers.has(fdaNo)) {
        sequence += 1;
        fdaNo = `${String(sequence).padStart(4, '0')}/FDA-LGM-${branchCode}/${month}/${year}`;
      }
      usedFdaNumbers.add(fdaNo);
      normalizedJob = {
        ...normalizedJob,
        fda: { ...normalizedJob.fda, fdaNo },
      };
      migrated = true;
    }

    const settledJob = syncPrincipalInvoiceSettlement(normalizedJob);
    if (settledJob !== normalizedJob) migrated = true;
    return settledJob;
  });
  return { jobCalls: normalizedJobCalls, migrated };
};

const normalizeBranchName = (branch?: string): string => (branch || '').trim().toLowerCase();
const sameBranch = (left?: string, right?: string): boolean => normalizeBranchName(left) === normalizeBranchName(right);
const normalizeBranchCode = (branch: string): string => branch.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'JKT';
const nextFixTariffSequence = (tariffs: FixTariff[]): number => tariffs.reduce((highest, tariff) => {
  const match = /^TAR-(\d+)$/i.exec(tariff.id);
  return match ? Math.max(highest, Number(match[1])) : highest;
}, 0) + 1;

const nextFormNumber = (jobCalls: JobCall[], type: 'EPDA' | 'FDA', branch: string, date: string): string => {
  const [year, month] = date.split('-');
  const branchCode = normalizeBranchCode(branch);
  const documentType = type;
  const prefix = `${documentType}-LGM-${branchCode}`;
  const maxSequence = jobCalls.reduce((max, job) => {
    const number = type === 'EPDA' ? job.quotation?.epda?.quoteNo : job.fda?.fdaNo;
    const match = number?.match(/^(\d+)\/(EPDA|FDA)-LGM-([A-Z0-9]+)\/(\d{2})\/(\d{4})$/);
    if (!match || match[2] !== type || match[3] !== branchCode || match[5] !== year) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  return `${String(maxSequence + 1).padStart(4, '0')}/${prefix}/${month}/${year}`;
};

export const isJobClosed = (job?: Partial<JobCall> | null): boolean => {
  if (!job) return false;
  return !!(job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED');
};

export const getCurrentBranchName = (): string => {
  return db.getActorBranch();
};

class DatabaseService {
  private state: DatabaseState;
  private listeners: Array<(state: DatabaseState) => void> = [];
  private apiSaveQueue: Promise<void> = Promise.resolve();
  private apiSyncError: unknown = null;
  private apiRevision = '';
  private stateVersion = 0;
  private actor: { id?: string; name: string; role: UserRole; branch?: string } = { name: 'System', role: 'ADMIN' };

  constructor() {
    this.state = this.getDefaultState();
  }

  private getDefaultState(): DatabaseState {
    return {
      users: INITIAL_USERS,
      customers: INITIAL_CUSTOMERS,
      vessels: INITIAL_VESSELS,
      ports: INITIAL_PORTS,
      zones: INITIAL_ZONES,
      fixTariffs: INITIAL_FIX_TARIFFS,
      expensesItems: INITIAL_EXPENSES_ITEMS,
      vendorPartners: [],
      bankAccounts: [],
      cashBalanceAdjustments: [],
      paymentVouchers: [],
      jobCalls: withoutRemovedJobCalls(LOCAL_INITIAL_JOB_CALLS),
      currentRole: 'ADMIN',
      selectedJobId: LOCAL_INITIAL_JOB_CALLS[0]?.jobId || '',
      auditLogs: [],
    };
  }

  public async hydrate(): Promise<void> {
    if (!apiAuth.enabled) throw new Error('API XAMPP harus diaktifkan untuk memuat database.');
    const remote = await dataApi.load();
    this.apiRevision = remote.revision;
    if (!remote.initialized && this.actor.role === 'ADMIN') {
      const defaults = this.getDefaultState();
      this.state = {
        ...defaults,
        ...remote.state,
        users: remote.state.users,
        jobCalls: remote.state.jobCalls,
        auditLogs: remote.state.auditLogs,
        currentRole: this.actor.role,
      };
      this.apiRevision = await dataApi.save(this.state, this.apiRevision);
    } else {
      const migration = migrateJobData(remote.state.jobCalls);
      this.state = {
        ...remote.state,
        jobCalls: migration.jobCalls,
        currentRole: this.actor.role,
      };
      if (migration.migrated) {
        this.apiRevision = await dataApi.save(this.state, this.apiRevision);
      }
    }
    this.notify();
  }

  public async refreshRemote(): Promise<void> {
    if (!apiAuth.enabled) return;
    await this.apiSaveQueue;
    const version = this.stateVersion;
    const remote = await dataApi.load();
    if (version !== this.stateVersion) return;
    if (remote.revision === this.apiRevision) {
      if (JSON.stringify(remote.state.auditLogs) !== JSON.stringify(this.state.auditLogs)) {
        this.state = { ...this.state, auditLogs: remote.state.auditLogs };
        this.notify();
      }
      return;
    }
    const migration = migrateJobData(remote.state.jobCalls);
    this.state = {
      ...remote.state,
      jobCalls: migration.jobCalls,
      currentRole: this.actor.role,
    };
    this.apiRevision = remote.revision;
    if (migration.migrated) {
      this.apiRevision = await dataApi.save(this.state, this.apiRevision);
    }
    this.notify();
  }

  private audit(action: string, entity: string, description: string, entityId?: string): void {
    const entry: AuditLog = {
      id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      actorId: this.actor.id,
      actorName: this.actor.name,
      role: this.actor.role,
      action, entity, entityId, description,
    };
    const logs = [entry, ...this.state.auditLogs];
    const permanentJobNumberLogs = logs.filter((log) => log.entity === 'VESSEL_CALL' && log.action === 'DELETE');
    const recentLogs = logs
      .filter((log) => log.entity !== 'VESSEL_CALL' || log.action !== 'DELETE')
      .slice(0, Math.max(0, 1000 - permanentJobNumberLogs.length));
    this.state.auditLogs = [...permanentJobNumberLogs, ...recentLogs];
  }

  public setActor(actor: { id?: string; name: string; role: UserRole; branch?: string }): void {
    this.actor = actor;
  }

  public getActorBranch(): string {
    return this.actor.branch?.trim() || 'Head Office';
  }

  private assertUniquePortCode(code: string, excludedPortId?: string): string {
    const normalizedCode = code.trim().toUpperCase();
    if (this.state.ports.some((port) => port.id !== excludedPortId && port.code.trim().toUpperCase() === normalizedCode)) {
      throw new Error(`Kode Port / UN/LOCODE "${normalizedCode}" sudah terdaftar.`);
    }
    return normalizedCode;
  }

  private saveToStorage(notify = true): boolean {
    this.stateVersion += 1;
    if (!apiAuth.enabled) {
      this.apiSyncError = new Error('API XAMPP harus diaktifkan untuk menyimpan database.');
      if (notify) this.notify();
      return false;
    }
    const snapshot = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.apiSaveQueue = this.apiSaveQueue
      .then(async () => {
        if (!this.apiRevision) throw new Error('Revisi database XAMPP tidak tersedia.');
        this.apiRevision = await dataApi.save(snapshot, this.apiRevision);
        this.apiSyncError = null;
      })
      .catch((error: unknown) => {
        this.apiSyncError = error;
        window.dispatchEvent(new CustomEvent('lgm:api-save-error', {
          detail: error instanceof Error ? error.message : String(error),
        }));
      });
    if (notify) this.notify();
    return true;
  }

  private async persistMasterMutation(previousState: DatabaseState): Promise<void> {
    if (!this.saveToStorage(false)) {
      const error = this.apiSyncError instanceof Error
        ? this.apiSyncError
        : new Error(String(this.apiSyncError));
      this.state = previousState;
      this.notify();
      throw error;
    }
    await this.apiSaveQueue;
    if (this.apiSyncError) {
      const error = this.apiSyncError instanceof Error
        ? this.apiSyncError
        : new Error(String(this.apiSyncError));
      this.state = previousState;
      this.notify();
      throw error;
    }
    this.notify();
  }

  private async persistPaymentVoucherMutation(
    previousVouchers: PaymentVoucher[],
    previousAuditLogs: DatabaseState['auditLogs'],
  ): Promise<void> {
    if (!this.saveToStorage(false)) {
      this.state.paymentVouchers = previousVouchers;
      this.state.auditLogs = previousAuditLogs;
      this.notify();
      throw new Error('Perubahan voucher gagal disimpan ke database XAMPP.');
    }

    if (apiAuth.enabled) {
      await this.apiSaveQueue;
      if (this.apiSyncError) {
        const message = this.apiSyncError instanceof Error
          ? this.apiSyncError.message
          : String(this.apiSyncError);
        this.state.paymentVouchers = previousVouchers;
        this.state.auditLogs = previousAuditLogs;
        this.stateVersion += 1;
        this.notify();
        throw new Error(`Perubahan voucher gagal disimpan ke database: ${message}`);
      }
    }

    this.notify();
  }

  public subscribe(listener: (state: DatabaseState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Listener callback error:', err);
      }
    });
  }

  public async resetToInitial(): Promise<void> {
    const fresh = this.getDefaultState();
    this.state = fresh;
    await this.saveToStorage();
    this.notify();
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public getNextFDAFormNumber(branch: string, date: string): string {
    return nextFormNumber(this.state.jobCalls, 'FDA', branch, date);
  }

  public async setRole(role: UserRole): Promise<void> {
    this.state.currentRole = role;
    this.notify();
  }

  public async setSelectedJobId(jobId: string): Promise<void> {
    this.state.selectedJobId = jobId;
    this.notify();
  }

  public resetToSeeds(): void {
    const retainedAdjustments = this.state.cashBalanceAdjustments || [];
    const adjustmentAccountIds = new Set(retainedAdjustments.map((adjustment) => adjustment.bankAccountId));
    this.state = {
      users: INITIAL_USERS,
      customers: INITIAL_CUSTOMERS,
      vessels: INITIAL_VESSELS,
      ports: INITIAL_PORTS,
      zones: INITIAL_ZONES,
      fixTariffs: INITIAL_FIX_TARIFFS,
      expensesItems: INITIAL_EXPENSES_ITEMS,
      vendorPartners: [],
      bankAccounts: (this.state.bankAccounts || []).filter((account) => adjustmentAccountIds.has(account.id)),
      cashBalanceAdjustments: retainedAdjustments,
      paymentVouchers: [],
      jobCalls: withoutRemovedJobCalls(LOCAL_INITIAL_JOB_CALLS),
      currentRole: this.state.currentRole,
      selectedJobId: LOCAL_INITIAL_JOB_CALLS[0]?.jobId || '',
      auditLogs: [],
    };
    this.saveToStorage();
  }

  public async resetMasterDataKeepUsers(): Promise<void> {
    this.state = {
      ...this.state,
      customers: [],
      vessels: [],
      ports: [],
      zones: [],
      fixTariffs: [],
      expensesItems: [],
    };
    await this.saveToStorage();
  }

  public importDatabase(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.jobCalls) && Array.isArray(data.users)) {
        const migration = migrateJobData(data.jobCalls);
        this.state = {
          ...this.state,
          ...data,
          jobCalls: migration.jobCalls,
        };
        this.saveToStorage();
        return true;
      }
    } catch (err) {
      console.error('Failed to import database JSON:', err);
    }
    return false;
  }

  public exportDatabase(): string {
    return JSON.stringify(this.state, null, 2);
  }

  // --- Master Data CRUD ---

  // Users
  public async addUser(user: Omit<User, 'id'>): Promise<User> {
    const id = `USR-${String(this.state.users.length + 1).padStart(3, '0')}`;
    const newUser: User = { ...user, id };
    this.state.users = [...this.state.users, newUser];
    this.audit('CREATE', 'USER', `Created user ${newUser.name}`, newUser.id);
    await this.saveToStorage();
    return newUser;
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<void> {
    const currentUser = this.state.users.find((user) => user.id === id);
    this.state.users = this.state.users.map((u) =>
      u.id === id ? { ...u, ...updates } : u
    );
    const statusChanged = currentUser && updates.status && currentUser.status !== updates.status;
    const action = statusChanged ? (updates.status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE') : 'UPDATE';
    const description = statusChanged
      ? `Admin ${updates.status === 'ACTIVE' ? 'mengaktifkan' : 'menonaktifkan'} akun ${currentUser.name}.`
      : `Updated user ${id}`;
    this.audit(action, 'USER', description, id);
    await this.saveToStorage();
  }

  public async deleteUser(id: string): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.users = this.state.users.filter((u) => u.id !== id);
    this.audit('DELETE', 'USER', `Deleted user ${id}`, id);
    await this.persistMasterMutation(previousState);
  }

  // Customers
  public async addCustomer(customer: Omit<Customer, 'id'>): Promise<Customer> {
    const id = `CUST-${String(this.state.customers.length + 1).padStart(3, '0')}`;
    const newCust: Customer = { ...customer, id };
    this.state.customers = [...this.state.customers, newCust];
    this.audit('CREATE', 'CUSTOMER', `Created customer ${newCust.companyName}`, newCust.id);
    await this.saveToStorage();
    return newCust;
  }

  public async updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    this.state.customers = this.state.customers.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    await this.saveToStorage();
  }

  public async deleteCustomer(id: string): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.customers = this.state.customers.filter((c) => c.id !== id);
    await this.persistMasterMutation(previousState);
  }

  // Vessels
  public async addVessel(vessel: Omit<Vessel, 'id'>): Promise<Vessel> {
    const id = `VES-${String(this.state.vessels.length + 1).padStart(3, '0')}`;
    const newVessel: Vessel = { ...vessel, id };
    this.state.vessels = [...this.state.vessels, newVessel];
    this.audit('CREATE', 'VESSEL', `Created vessel ${newVessel.name}`, newVessel.id);
    await this.saveToStorage();
    return newVessel;
  }

  public async updateVessel(id: string, updates: Partial<Vessel>): Promise<void> {
    this.state.vessels = this.state.vessels.map((v) =>
      v.id === id ? { ...v, ...updates } : v
    );
    await this.saveToStorage();
  }

  public async deleteVessel(id: string): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.vessels = this.state.vessels.filter((v) => v.id !== id);
    await this.persistMasterMutation(previousState);
  }

  // Ports
  public async addPort(port: Omit<Port, 'id'>): Promise<Port> {
    const code = this.assertUniquePortCode(port.code);
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    const id = `PRT-${String(this.state.ports.length + 1).padStart(3, '0')}`;
    const newPort: Port = { ...port, code, id };
    this.state.ports = [...this.state.ports, newPort];
    this.audit('CREATE', 'PORT', `Created port ${newPort.name}`, newPort.id);
    await this.persistMasterMutation(previousState);
    return newPort;
  }

  public async updatePort(id: string, updates: Partial<Port>): Promise<void> {
    const currentPort = this.state.ports.find((port) => port.id === id);
    if (!currentPort) throw new Error('Port tidak ditemukan.');
    const code = this.assertUniquePortCode(updates.code ?? currentPort.code, id);
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.ports = this.state.ports.map((p) =>
      p.id === id ? { ...p, ...updates, code } : p
    );
    await this.persistMasterMutation(previousState);
  }

  public async deletePort(id: string): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.ports = this.state.ports.filter((p) => p.id !== id);
    this.state.zones = this.state.zones.filter((zone) => zone.portId !== id);
    this.state.fixTariffs = this.state.fixTariffs.filter((tariff) => tariff.portId !== id);
    this.state.expensesItems = this.state.expensesItems.map((item) =>
      item.portId === id ? { ...item, portId: '', portName: item.portName || previousState.ports.find((port) => port.id === id)?.name || '' } : item
    );
    await this.persistMasterMutation(previousState);
  }

  // Zones
  public addZone(zone: Omit<Zone, 'id'>): Zone {
    const id = `ZON-${String(this.state.zones.length + 1).padStart(3, '0')}`;
    const newZone: Zone = { ...zone, id };
    this.state.zones = [...this.state.zones, newZone];
    this.audit('CREATE', 'ZONE', `Created zone ${newZone.zoneName}`, newZone.id);
    this.saveToStorage();
    return newZone;
  }

  public updateZone(id: string, updates: Partial<Zone>): void {
    this.state.zones = this.state.zones.map((z) =>
      z.id === id ? { ...z, ...updates } : z
    );
    this.saveToStorage();
  }

  public async deleteZone(id: string): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.zones = this.state.zones.filter((z) => z.id !== id);
    await this.persistMasterMutation(previousState);
  }

  // Fix Tariff
  public async addFixTariff(tariff: Omit<FixTariff, 'id'>): Promise<FixTariff> {
    const usedIds = new Set(this.state.fixTariffs.map((item) => item.id));
    let sequence = nextFixTariffSequence(this.state.fixTariffs);
    let id = `TAR-${String(sequence).padStart(4, '0')}`;
    while (usedIds.has(id)) {
      sequence += 1;
      id = `TAR-${String(sequence).padStart(4, '0')}`;
    }
    const newTariff: FixTariff = { ...tariff, id };
    this.state.fixTariffs = [...this.state.fixTariffs, newTariff];
    this.audit('CREATE', 'FIX_TARIFF', `Created tariff ${newTariff.id}`, newTariff.id);
    await this.saveToStorage();
    return newTariff;
  }

  public async addFixTariffsBulk(tariffs: Array<Omit<FixTariff, 'id'>>): Promise<FixTariff[]> {
    if (!tariffs.length) return [];
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    const usedIds = new Set(this.state.fixTariffs.map((item) => item.id));
    let sequence = nextFixTariffSequence(this.state.fixTariffs);
    const newTariffs = tariffs.map((tariff) => {
      let id = `TAR-${String(sequence).padStart(4, '0')}`;
      while (usedIds.has(id)) {
        sequence += 1;
        id = `TAR-${String(sequence).padStart(4, '0')}`;
      }
      usedIds.add(id);
      sequence += 1;
      return { ...tariff, id };
    });
    this.state.fixTariffs = [...this.state.fixTariffs, ...newTariffs];
    this.audit('CREATE_BULK', 'FIX_TARIFF', `Imported ${newTariffs.length} tariffs`);
    await this.persistMasterMutation(previousState);
    return newTariffs;
  }

  public async updateFixTariff(id: string, updates: Partial<FixTariff>): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.fixTariffs = this.state.fixTariffs.map((t) =>
      t.id === id ? { ...t, ...updates } : t
    );
    await this.persistMasterMutation(previousState);
  }

  public async deleteFixTariff(id: string): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.fixTariffs = this.state.fixTariffs.filter((t) => t.id !== id);
    await this.persistMasterMutation(previousState);
  }

  // Expenses Items
  private createExpensesItems(items: Array<Omit<ExpensesItem, 'id'>>): ExpensesItem[] {
    const usedIdentifiers = new Set<string>();
    let nextSequence = 1;
    this.state.expensesItems.forEach((item) => {
      usedIdentifiers.add(item.id.toLowerCase());
      usedIdentifiers.add(item.code.trim().toLowerCase());
      const match = /^EXP-(\d+)$/i.exec(item.id);
      if (match) nextSequence = Math.max(nextSequence, Number(match[1]) + 1);
    });
    items.forEach((item) => {
      const code = item.code?.trim();
      if (code) usedIdentifiers.add(code.toLowerCase());
    });

    return items.map((item) => {
      let id = `EXP-${String(nextSequence).padStart(3, '0')}`;
      while (usedIdentifiers.has(id.toLowerCase())) {
        nextSequence += 1;
        id = `EXP-${String(nextSequence).padStart(3, '0')}`;
      }
      nextSequence += 1;
      usedIdentifiers.add(id.toLowerCase());
      const code = item.code?.trim() || id;
      usedIdentifiers.add(code.toLowerCase());
      return {
        ...item,
        id,
        code,
        portName: item.portName || this.state.ports.find((port) => port.id === item.portId)?.name || '',
      };
    });
  }

  public async addExpensesItem(item: Omit<ExpensesItem, 'id'>): Promise<ExpensesItem> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    const [newItem] = this.createExpensesItems([item]);
    this.state.expensesItems = [...this.state.expensesItems, newItem];
    this.audit('CREATE', 'EXPENSE_ITEM', `Created expense item ${newItem.name}`, newItem.id);
    await this.persistMasterMutation(previousState);
    return newItem;
  }

  public async addExpensesItemsBulk(items: Array<Omit<ExpensesItem, 'id'>>): Promise<ExpensesItem[]> {
    if (!items.length) return [];
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    const newItems = this.createExpensesItems(items);
    this.state.expensesItems = [...this.state.expensesItems, ...newItems];
    this.audit('CREATE_BULK', 'EXPENSE_ITEM', `Imported ${newItems.length} expense items`);
    await this.persistMasterMutation(previousState);
    return newItems;
  }

  public async updateExpensesItem(id: string, updates: Partial<ExpensesItem>): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.expensesItems = this.state.expensesItems.map((e) => {
      if (e.id !== id) return e;
      const resolvedPortId = updates.portId ?? e.portId;
      const resolvedPortName = updates.portName || e.portName || this.state.ports.find((p) => p.id === resolvedPortId)?.name || e.portName || '';
      return { ...e, ...updates, portId: resolvedPortId, portName: resolvedPortName };
    });
    await this.persistMasterMutation(previousState);
  }

  public async deleteExpensesItem(id: string): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.expensesItems = this.state.expensesItems.filter((e) => e.id !== id);
    await this.persistMasterMutation(previousState);
  }

  // Vendor Partners
  public async addVendorPartner(item: Omit<VendorPartner, 'id'>): Promise<VendorPartner> {
    const list = this.state.vendorPartners || [];
    const maxNumber = list.reduce((max, v) => Math.max(max, Number(v.id.replace(/\D/g, '')) || 0), 0);
    const newItem: VendorPartner = { ...item, id: `VND-${String(maxNumber + 1).padStart(3, '0')}` };
    this.state.vendorPartners = [...list, newItem];
    this.audit('CREATE', 'VENDOR_PARTNER', `Created vendor partner ${newItem.vendorName}`, newItem.id);
    await this.saveToStorage();
    return newItem;
  }

  public async updateVendorPartner(id: string, updates: Partial<VendorPartner>): Promise<void> {
    this.state.vendorPartners = (this.state.vendorPartners || []).map((v) => (v.id === id ? { ...v, ...updates, id } : v));
    this.audit('UPDATE', 'VENDOR_PARTNER', `Updated vendor partner ${updates.vendorName || id}`, id);
    await this.saveToStorage();
  }

  public async deleteVendorPartner(id: string): Promise<void> {
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.vendorPartners = (this.state.vendorPartners || []).filter((v) => v.id !== id);
    this.state.paymentVouchers = (this.state.paymentVouchers || []).map((voucher) =>
      voucher.vendorPartnerId === id ? { ...voucher, vendorPartnerId: '' } : voucher
    );
    this.audit('DELETE', 'VENDOR_PARTNER', `Deleted vendor partner ${id}`, id);
    await this.persistMasterMutation(previousState);
  }

  // Bank Accounts
  public async addBankAccount(item: Omit<BankAccount, 'id'>): Promise<BankAccount> {
    const list = this.state.bankAccounts || [];
    const maxNumber = list.reduce((max, v) => Math.max(max, Number(v.id.replace(/\D/g, '')) || 0), 0);
    const newItem: BankAccount = { ...item, id: `BANK-${String(maxNumber + 1).padStart(3, '0')}` };
    this.state.bankAccounts = [...list, newItem];
    this.audit('CREATE', 'BANK_ACCOUNT', `Created bank account ${newItem.bankName}`, newItem.id);
    await this.saveToStorage();
    return newItem;
  }

  public async updateBankAccount(id: string, updates: Partial<BankAccount>): Promise<void> {
    this.state.bankAccounts = (this.state.bankAccounts || []).map((account) => (account.id === id ? { ...account, ...updates, id } : account));
    this.audit('UPDATE', 'BANK_ACCOUNT', `Updated bank account ${updates.bankName || id}`, id);
    await this.saveToStorage();
  }

  public async deleteBankAccount(id: string): Promise<void> {
    if ((this.state.cashBalanceAdjustments || []).some((adjustment) => adjustment.bankAccountId === id)) {
      throw new Error('Rekening tidak dapat dihapus karena memiliki riwayat penyesuaian saldo kas.');
    }
    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    this.state.bankAccounts = (this.state.bankAccounts || []).filter((account) => account.id !== id);
    this.audit('DELETE', 'BANK_ACCOUNT', `Deleted bank account ${id}`, id);
    await this.persistMasterMutation(previousState);
  }

  public async addCashBalanceAdjustment(input: {
    bankAccountId: string;
    amount: number;
    effectiveDate: string;
    reason: string;
  }): Promise<void> {
    if (this.actor.role !== 'ADMIN') throw new Error('Hanya Admin yang dapat menambahkan penyesuaian saldo kas.');
    const account = (this.state.bankAccounts || []).find((item) => item.id === input.bankAccountId);
    if (!account) throw new Error('Rekening bank tidak ditemukan.');
    if (!account.currency) throw new Error('Currency rekening belum diatur pada Master Bank Account.');
    if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error('Nominal penyesuaian harus berupa angka selain nol.');
    const [year, month, day] = input.effectiveDate.split('-').map(Number);
    const effectiveDate = new Date(Date.UTC(year, month - 1, day));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)
      || effectiveDate.getUTCFullYear() !== year
      || effectiveDate.getUTCMonth() !== month - 1
      || effectiveDate.getUTCDate() !== day
      || input.effectiveDate < '2026-10-22') {
      throw new Error('Tanggal efektif harus pada atau setelah 22 Oktober 2026.');
    }
    const reason = input.reason.trim();
    if (!reason || reason.length > 2000) throw new Error('Alasan wajib diisi dan maksimal 2.000 karakter.');

    const previousState = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    const adjustment: CashBalanceAdjustment = {
      id: `CBA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bankAccountId: account.id,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      currency: account.currency,
      amount: input.amount,
      effectiveDate: input.effectiveDate,
      reason,
      createdBy: this.actor.name,
      createdAt: new Date().toISOString(),
    };
    this.state.cashBalanceAdjustments = [...(this.state.cashBalanceAdjustments || []), adjustment];
    this.audit(
      'CREATE',
      'CASH_BALANCE_ADJUSTMENT',
      `Added ${adjustment.amount} ${adjustment.currency} cash balance adjustment for ${account.accountNumber}, effective ${adjustment.effectiveDate}: ${reason}`,
      adjustment.id,
    );
    await this.persistMasterMutation(previousState);
  }

  // Payment Vouchers
  public getNextPaymentVoucherNumber(requestDate: string): string {
    const date = new Date(requestDate);
    const valid = Number.isNaN(date.getTime()) ? new Date() : date;
    const suffix = `${String(valid.getMonth() + 1).padStart(2, '0')}${String(valid.getFullYear()).slice(-2)}`;
    const yearSuffix = suffix.slice(-2);
    const maxSequence = (this.state.paymentVouchers || []).reduce((max, v) => {
      const match = /^OPS-(\d+)-(\d{2})(\d{2})$/.exec(v.requestNumber);
      return match && match[3] === yearSuffix ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `OPS-${String(maxSequence + 1).padStart(4, '0')}-${suffix}`;
  }

  public getNextFinanceVoucherNumber(paymentDate: string): string {
    const date = new Date(`${paymentDate}T00:00:00`);
    const valid = Number.isNaN(date.getTime()) ? new Date() : date;
    const suffix = `${String(valid.getMonth() + 1).padStart(2, '0')}${String(valid.getFullYear()).slice(-2)}`;
    const yearSuffix = suffix.slice(-2);
    const maxSequence = (this.state.paymentVouchers || []).reduce((max, voucher) => {
      const usedNumbers = [
        voucher.voucherNumber || '',
        ...(voucher.paymentHistory || []).map((payment) => payment.voucherNumber),
      ];
      return usedNumbers.reduce((voucherMax, number) => {
        const match = /^PVJKT-(\d+)-(\d{2})(\d{2})$/.exec(number);
        return match && match[3] === yearSuffix ? Math.max(voucherMax, Number(match[1])) : voucherMax;
      }, max);
    }, 0);
    return `PVJKT-${String(maxSequence + 1).padStart(4, '0')}-${suffix}`;
  }

  public getNextOperationalJobNumber(requestDate: string): string {
    const date = new Date(requestDate);
    const valid = Number.isNaN(date.getTime()) ? new Date() : date;
    const suffix = `${String(valid.getMonth() + 1).padStart(2, '0')}${String(valid.getFullYear()).slice(-2)}`;
    const yearSuffix = suffix.slice(-2);
    const maxSequence = (this.state.paymentVouchers || []).reduce((max, voucher) => {
      if (voucher.jobInfo !== 'OPERASIONAL') return max;
      return voucher.items.reduce((itemMax, item) => {
        const match = /^OPJ-(\d+)-(\d{2})(\d{2})$/.exec(item.jobNumber);
        return match && match[3] === yearSuffix ? Math.max(itemMax, Number(match[1])) : itemMax;
      }, max);
    }, 0);
    return `OPJ-${String(maxSequence + 1).padStart(4, '0')}-${suffix}`;
  }

  public async addPaymentVoucher(voucher: Omit<PaymentVoucher, 'id' | 'requestNumber' | 'createdAt'>): Promise<PaymentVoucher> {
    const previousVouchers = this.state.paymentVouchers;
    const previousAuditLogs = this.state.auditLogs;
    const requestNumber = this.getNextPaymentVoucherNumber(voucher.requestDate);
    const newVoucher: PaymentVoucher = { ...voucher, status: 'PENDING_MANAGER', id: `PV-${Date.now()}`, requestNumber, createdAt: new Date().toISOString() };
    this.state.paymentVouchers = [newVoucher, ...(this.state.paymentVouchers || [])];
    this.audit('CREATE', 'PAYMENT_VOUCHER', `Created payment voucher ${requestNumber}`, newVoucher.id);
    await this.persistPaymentVoucherMutation(previousVouchers, previousAuditLogs);
    return newVoucher;
  }

  public async updatePaymentVoucher(id: string, patch: Partial<Omit<PaymentVoucher, 'id' | 'requestNumber' | 'createdAt'>>): Promise<void> {
    const existing = (this.state.paymentVouchers || []).find((v) => v.id === id);
    if (!existing) throw new Error('Payment Voucher tidak ditemukan.');
    const previousVouchers = this.state.paymentVouchers;
    const previousAuditLogs = this.state.auditLogs;
    const resubmit = existing.status === 'REJECTED';
    this.state.paymentVouchers = this.state.paymentVouchers.map((v) => (v.id === id
      ? { ...v, ...patch, ...(resubmit ? { status: 'PENDING_MANAGER' as const, managerNote: '', reviewedBy: '', reviewedAt: '' } : {}) }
      : v));
    this.audit('UPDATE', 'PAYMENT_VOUCHER', `Updated payment voucher ${existing.requestNumber}`, id);
    await this.persistPaymentVoucherMutation(previousVouchers, previousAuditLogs);
  }

  public async reviewPaymentVoucher(id: string, decision: 'APPROVED' | 'REJECTED', reviewer: string, note = ''): Promise<void> {
    const existing = (this.state.paymentVouchers || []).find((v) => v.id === id);
    if (!existing) throw new Error('Payment Voucher tidak ditemukan.');
    if ((existing.status || 'PENDING_MANAGER') !== 'PENDING_MANAGER') throw new Error('Voucher ini tidak sedang menunggu persetujuan.');
    if (decision === 'REJECTED' && !note.trim()) throw new Error('Alasan penolakan wajib diisi.');
    const previousVouchers = this.state.paymentVouchers;
    const previousAuditLogs = this.state.auditLogs;
    this.state.paymentVouchers = this.state.paymentVouchers.map((v) => (v.id === id
      ? { ...v, status: decision, managerNote: note.trim(), reviewedBy: reviewer, reviewedAt: new Date().toISOString() }
      : v));
    this.audit(decision === 'APPROVED' ? 'APPROVE' : 'REJECT', 'PAYMENT_VOUCHER', `Payment voucher ${existing.requestNumber} ${decision}`, id);
    await this.persistPaymentVoucherMutation(previousVouchers, previousAuditLogs);
  }

  public async payPaymentVoucher(
    id: string,
    payer: string,
    paymentDate?: string,
    paymentDetails: { surcharge?: number; otherExpenses?: number; description?: string; totalAmount?: number; paidFromBankAccountId?: string; paymentProofDataUrl?: string } = {},
  ): Promise<void> {
    const existing = (this.state.paymentVouchers || []).find((v) => v.id === id);
    if (!existing) throw new Error('Payment Voucher tidak ditemukan.');
    if (existing.status === 'PAID') throw new Error('Voucher ini sudah dibayar sebelumnya.');
    if (existing.status !== 'APPROVED') {
      throw new Error(`Voucher belum berstatus Disetujui (status saat ini: ${existing.status || 'PENDING_MANAGER'}).`);
    }
    const paymentCurrency = existing.currency || 'IDR';
    const paidFromBankAccount = (this.state.bankAccounts || []).find(
      (account) => account.id === paymentDetails.paidFromBankAccountId,
    );
    if (!paidFromBankAccount) {
      throw new Error('Pilih rekening pembayaran sebelum memproses voucher.');
    }
    if (!paidFromBankAccount.currency) {
      throw new Error(`Mata uang rekening ${paidFromBankAccount.accountNumber} belum diatur pada Master Bank Account.`);
    }
    if (paidFromBankAccount.currency !== paymentCurrency) {
      throw new Error(`Mata uang rekening ${paidFromBankAccount.accountNumber} (${paidFromBankAccount.currency}) tidak sesuai dengan voucher ${paymentCurrency}.`);
    }
    const previousVouchers = this.state.paymentVouchers;
    const previousAuditLogs = this.state.auditLogs;
    const paidOn = paymentDate || todayISO();
    const paidAt = new Date(`${paidOn}T12:00:00`).toISOString();
    const voucherNumber = existing.voucherNumber || this.getNextFinanceVoucherNumber(paidOn);
    const surcharge = Number(paymentDetails.surcharge) || 0;
    const otherExpenses = Number(paymentDetails.otherExpenses) || 0;
    const totalAmount = Number(paymentDetails.totalAmount) || existing.totalPaidAmount + surcharge + otherExpenses;
    const description = paymentDetails.description || '';
    this.state.paymentVouchers = this.state.paymentVouchers.map((v) => (v.id === id
      ? {
          ...v,
          voucherNumber,
          status: 'PAID' as const,
          paidBy: payer,
          paidAt,
          paymentSurcharge: surcharge,
          paymentOtherExpenses: otherExpenses,
          paymentDescription: description,
          paymentTotalAmount: totalAmount,
          paidFromBankAccountId: paymentDetails.paidFromBankAccountId || existing.paidFromBankAccountId,
          ...(paymentDetails.paymentProofDataUrl ? { paymentProofDataUrl: paymentDetails.paymentProofDataUrl } : {}),
        }
      : v));
    this.audit(
      'PAY',
      'PAYMENT_VOUCHER',
      `Paid payment voucher ${existing.requestNumber}`,
      id,
    );
    await this.persistPaymentVoucherMutation(previousVouchers, previousAuditLogs);
  }

  // --- JOB / VESSEL CALL LIFECYCLE ---

  public getJob(jobId: string): JobCall | undefined {
    return this.state.jobCalls.find((j) => j.jobId === jobId);
  }

  public async clearAllJobs(): Promise<void> {
    this.state.jobCalls = [];
    this.state.selectedJobId = '';
    await this.saveToStorage();
  }

  public updateJob(jobId: string, updates: Partial<JobCall>, auditDescription?: string): boolean {
    const existingJob = this.getJob(jobId);
    if (existingJob?.voidedAt) return false;
    if (existingJob && this.actor.role === 'FDA' && existingJob.managerApproval?.status !== 'APPROVED') {
      return false;
    }
    if (
      existingJob &&
      this.actor.role === 'FDA' &&
      (existingJob.fda?.approvalStatus === 'SUBMITTED' || existingJob.fda?.fdaApproved)
    ) {
      return false;
    }
    if (
      existingJob &&
      this.actor.role === 'SALES' &&
      !sameBranch(existingJob.inquiry?.createdByBranch, this.actor.branch)
    ) {
      return false;
    }
    if (
      existingJob &&
      this.actor.role === 'SALES' &&
      updates.quotation &&
      (existingJob.managerApproval?.status === 'APPROVED' ||
        existingJob.quotation?.epda?.status === 'SUBMITTED' ||
        existingJob.quotation?.epda?.status === 'APPROVED')
    ) {
      return false;
    }
    const previousJobCalls = this.state.jobCalls;
    const previousAuditLogs = this.state.auditLogs;
    let jobUpdated = false;
    this.state.jobCalls = this.state.jobCalls.map((j) => {
      if (jobUpdated || j.jobId !== jobId) return j;
      jobUpdated = true;
      const updatedJob = {
        ...j,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return 'principalReceipts' in updates || 'principalInvoice' in updates || 'fda' in updates
        ? syncPrincipalInvoiceSettlement(updatedJob)
        : updatedJob;
    });
    if (!jobUpdated) return false;
    this.audit('UPDATE', 'VESSEL_CALL', auditDescription || `Updated vessel call ${jobId}`, jobId);
    if (!this.saveToStorage()) {
      this.state.jobCalls = previousJobCalls;
      this.state.auditLogs = previousAuditLogs;
      this.notify();
      return false;
    }
    return true;
  }

  public async updateJobAndPersist(
    jobId: string,
    updates: Partial<JobCall>,
    auditDescription?: string,
  ): Promise<{ saved: boolean; error?: string }> {
    const previousJob = this.getJob(jobId);
    const previousAuditLogs = this.state.auditLogs;
    if (!previousJob || !this.updateJob(jobId, updates, auditDescription)) return { saved: false };

    const updatedJob = this.getJob(jobId);
    const updatedAuditLogs = this.state.auditLogs;
    const save = this.apiSaveQueue;
    await save;
    if (!this.apiSyncError) return { saved: true };

    const error = this.apiSyncError instanceof Error
      ? this.apiSyncError.message
      : String(this.apiSyncError);
    if (updatedJob && this.getJob(jobId) === updatedJob) {
      this.state.jobCalls = this.state.jobCalls.map((job) => job === updatedJob ? previousJob : job);
    }
    if (this.state.auditLogs === updatedAuditLogs) this.state.auditLogs = previousAuditLogs;
    this.stateVersion += 1;
    this.notify();
    return { saved: false, error };
  }

  public async updateInquiryAndPersist(
    jobId: string,
    updates: Pick<JobCall, 'vesselId' | 'vesselName' | 'portId' | 'portName' | 'customerId' | 'customerName' | 'eta' | 'etd' | 'purposeOfCall' | 'inquiry'>,
  ): Promise<{ saved: boolean; error?: string }> {
    const job = this.getJob(jobId);
    if (!job || this.actor.role !== 'SALES' || !sameBranch(job.inquiry?.createdByBranch, this.actor.branch)) {
      return { saved: false };
    }
    if (
      job.managerApproval?.status === 'APPROVED' ||
      job.quotation?.epda?.status === 'SUBMITTED' ||
      job.quotation?.epda?.status === 'APPROVED' ||
      job.fda?.fdaApproved ||
      job.fda?.approvalStatus === 'SUBMITTED' ||
      job.fda?.approvalStatus === 'APPROVED' ||
      job.closing?.isClosed ||
      job.currentStage === 'CLOSED' ||
      job.status === 'CLOSED' ||
      job.voidedAt
    ) return { saved: false };

    const before = {
      vesselId: job.vesselId,
      portId: job.portId,
      customerId: job.customerId,
      eta: job.eta,
      etd: job.etd,
      purposeOfCall: job.purposeOfCall,
      inquiry: job.inquiry,
    };
    const after = {
      vesselId: updates.vesselId,
      portId: updates.portId,
      customerId: updates.customerId,
      eta: updates.eta,
      etd: updates.etd,
      purposeOfCall: updates.purposeOfCall,
      inquiry: updates.inquiry,
    };
    return this.updateJobAndPersist(
      jobId,
      updates,
      `Koreksi Inquiry ${jobId}. Sebelum: ${JSON.stringify(before)}. Sesudah: ${JSON.stringify(after)}`,
    );
  }

  public async deleteInquiryAndPersist(jobId: string): Promise<{ saved: boolean; error?: string }> {
    const job = this.getJob(jobId);
    if (
      !job ||
      this.actor.role !== 'SALES' ||
      !sameBranch(job.inquiry?.createdByBranch, this.actor.branch) ||
      job.voidedAt ||
      job.managerApproval?.status === 'APPROVED' ||
      job.quotation?.epda?.status === 'SUBMITTED' ||
      job.quotation?.epda?.status === 'APPROVED' ||
      job.fda?.fdaApproved ||
      job.fda?.approvalStatus === 'SUBMITTED' ||
      job.fda?.approvalStatus === 'APPROVED' ||
      job.closing?.isClosed ||
      job.currentStage === 'CLOSED' ||
      job.status === 'CLOSED'
    ) return { saved: false };

    const previousJobCalls = this.state.jobCalls;
    const previousReservedJobIds = this.state.reservedJobIds;
    const previousSelectedJobId = this.state.selectedJobId;
    const previousAuditLogs = this.state.auditLogs;
    const deletedJobIds = new Set(
      this.state.auditLogs
        .filter((log) => log.entity === 'VESSEL_CALL' && log.action === 'DELETE')
        .map((log) => log.entityId || ''),
    );
    deletedJobIds.add(jobId);
    this.state.jobCalls = previousJobCalls.filter((item) => item.jobId !== jobId);
    this.state.reservedJobIds = (previousReservedJobIds || []).filter((id) => !deletedJobIds.has(id));
    if (this.state.selectedJobId === jobId) {
      this.state.selectedJobId = this.state.jobCalls[0]?.jobId || '';
    }
    this.audit('DELETE', 'VESSEL_CALL', `Permanently deleted inquiry and vessel call ${jobId}`, jobId);
    if (!this.saveToStorage(false)) {
      this.state.jobCalls = previousJobCalls;
      this.state.reservedJobIds = previousReservedJobIds;
      this.state.selectedJobId = previousSelectedJobId;
      this.state.auditLogs = previousAuditLogs;
      this.notify();
      return { saved: false, error: 'Inquiry gagal dihapus dari database.' };
    }

    await this.apiSaveQueue;
    if (this.apiSyncError) {
      const error = this.apiSyncError instanceof Error
        ? this.apiSyncError.message
        : String(this.apiSyncError);
      this.state.jobCalls = previousJobCalls;
      this.state.reservedJobIds = previousReservedJobIds;
      this.state.selectedJobId = previousSelectedJobId;
      this.state.auditLogs = previousAuditLogs;
      this.stateVersion += 1;
      this.notify();
      return { saved: false, error };
    }

    this.notify();
    return { saved: true };
  }

  public async voidJobAndPersist(
    jobId: string,
    reason: string,
  ): Promise<{ saved: boolean; error?: string }> {
    const job = this.getJob(jobId);
    const normalizedReason = reason.trim();
    if (!job || !normalizedReason || this.actor.role !== 'SALES' || !sameBranch(job.inquiry?.createdByBranch, this.actor.branch)) {
      return { saved: false };
    }

    if (
      job.managerApproval?.status === 'APPROVED' ||
      job.quotation?.epda?.status === 'SUBMITTED' ||
      job.quotation?.epda?.status === 'APPROVED' ||
      job.fda?.fdaApproved ||
      job.fda?.approvalStatus === 'SUBMITTED' ||
      job.fda?.approvalStatus === 'APPROVED' ||
      job.closing?.isClosed ||
      job.currentStage === 'CLOSED' ||
      job.status === 'CLOSED' ||
      job.voidedAt
    ) return { saved: false };

    return this.updateJobAndPersist(jobId, {
      voidedAt: new Date().toISOString(),
      voidedBy: this.actor.name,
      voidReason: normalizedReason,
      currentStage: 'CLOSED',
      status: 'CLOSED',
    }, `VOID vessel call ${jobId}. Alasan: ${normalizedReason}`);
  }

  public async createJob(jobData: Partial<JobCall>): Promise<JobCall> {
    const year = new Date().getFullYear();
    const documentDate = toLocalDate(new Date());
    const actorBranch = this.actor.role === 'SALES'
      ? (this.actor.branch || 'Head Office')
      : (jobData.inquiry?.createdByBranch || getCurrentBranchName());
    const previousJobCalls = [...this.state.jobCalls];
    const previousSelectedJobId = this.state.selectedJobId;
    const previousAuditLogs = this.state.auditLogs;
    const deletedJobIds = new Set(
      this.state.auditLogs
        .filter((log) => log.entity === 'VESSEL_CALL' && log.action === 'DELETE')
        .map((log) => log.entityId || ''),
    );
    const activeJobIds = new Set(previousJobCalls.map((job) => job.jobId));
    const existingJobIds = new Set([
      ...activeJobIds,
      ...(this.state.reservedJobIds || []).filter((jobId) => !deletedJobIds.has(jobId)),
    ]);
    const yearPrefix = `VC-${year}-`;
    const maxSequence = [
      ...activeJobIds,
      ...(this.state.reservedJobIds || []).filter((jobId) => !deletedJobIds.has(jobId)),
    ].reduce((max, jobId) => {
      if (!jobId.startsWith(yearPrefix)) return max;
      const sequence = Number(jobId.slice(yearPrefix.length));
      return Number.isInteger(sequence) && sequence > max ? sequence : max;
    }, 0);
    let nextSeq = maxSequence + 1;
    let generatedJobId = `VC-${year}-${String(nextSeq).padStart(4, '0')}`;
    const reusableJobId = this.state.auditLogs
      .filter((log) =>
        log.entity === 'VESSEL_CALL' &&
        log.action === 'DELETE' &&
        !!log.entityId &&
        log.entityId.startsWith(yearPrefix) &&
        Number.isInteger(Number(log.entityId.slice(yearPrefix.length))) &&
        !activeJobIds.has(log.entityId),
      )
      .sort((first, second) => second.timestamp.localeCompare(first.timestamp))
      .find((log) => !existingJobIds.has(log.entityId || ''))?.entityId;
    if (reusableJobId) generatedJobId = reusableJobId;
    while (existingJobIds.has(generatedJobId)) {
      nextSeq += 1;
      generatedJobId = `VC-${year}-${String(nextSeq).padStart(4, '0')}`;
    }
    const requestedJobId = jobData.jobId?.trim();
    const newJobId = requestedJobId && !existingJobIds.has(requestedJobId) ? requestedJobId : generatedJobId;
    const documentSequence = reusableJobId
      ? Number(reusableJobId.slice(yearPrefix.length))
      : nextSeq;
    const documentNumberJobId = `VC-${year}-${String(documentSequence).padStart(4, '0')}`;
    const epdaNo = nextFormNumber(previousJobCalls, 'EPDA', actorBranch, documentDate);
    const fdaNo = nextFormNumber(previousJobCalls, 'FDA', actorBranch, documentDate);

    const newJob: JobCall = {
      jobId: newJobId,
      vesselId: jobData.vesselId || '',
      vesselName: jobData.vesselName || 'MV UNNAMED',
      portId: jobData.portId || '',
      portName: jobData.portName || '',
      customerId: jobData.customerId || '',
      customerName: jobData.customerName || '',
      currency: jobData.currency || 'USD',
      exchangeRateUSDToIDR: 15800,
      eta: jobData.eta ?? '',
      etd: jobData.etd ?? '',
      purposeOfCall: jobData.purposeOfCall || 'CARGO_DISCHARGE',
      currentStage: 'INQUIRY',
      status: 'INQUIRY',
      createdAt: new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(),
      updatedAt: new Date().toISOString(),

      inquiry: {
        ...(jobData.inquiry || {}),
        inquiryNo: `INQ-${year}-${String(documentSequence).padStart(4, '0')}`,
        date: jobData.inquiry?.date || documentDate,
        eta: jobData.inquiry?.eta ?? jobData.eta ?? '',
        etd: jobData.inquiry?.etd ?? jobData.etd ?? '',
        cargoDetails: jobData.inquiry?.cargoDetails || 'General Cargo Inspection / Port Call',
        estimatedDays: jobData.inquiry?.estimatedDays ?? 3,
        specialRequirements: jobData.inquiry?.specialRequirements ?? '',
        status: jobData.inquiry?.status || 'RECEIVED',
        createdBy: jobData.inquiry?.createdBy || 'Sarah Wijaya (SALES)',
        createdByBranch: actorBranch,
      },

      quotation: jobData.quotation || {
        epda: {
          quoteNo: epdaNo,
          date: documentDate,
          currency: 'USD',
          totalAmount: 0,
          status: 'DRAFT',
          items: [],
        },
        crewChange: {
          id: `CC-${generatedJobId}`,
          date: documentDate,
          signOnCount: 0,
          signOffCount: 0,
          logisticsCost: 0,
          immigrationVisaCost: 0,
          transportCost: 0,
          totalCostUSD: 0,
          totalCostIDR: 0,
          status: 'PLANNED',
          members: [],
        },
      },

      managerApproval: {
        status: 'PENDING',
      },

      operationalData: {
        statementOfFacts: [
          {
            id: `SOF-INIT-${documentNumberJobId}`,
            timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
            event: 'Job opened in MaritimPort system',
          },
        ],
      },

      fda: {
        fdaNo,
        date: documentDate,
        finalBilledToPrincipal: 0,
        fdaApproved: false,
      },

      ap: [],
      ar: [],

      principalInvoice: {
        invoiceNo: `INV-${generatedJobId}`,
        invoiceDate: todayISO(),
        dueDate: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
        totalAmountUSD: 0,
        totalAmountIDR: 0,
        advanceDeductedUSD: 0,
        advanceDeductedIDR: 0,
        balanceDueUSD: 0,
        balanceDueIDR: 0,
        status: 'DRAFT',
        pdfGenerated: false,
      },

      closing: { isClosed: false },
    };

    this.state.jobCalls = [newJob, ...previousJobCalls];
    this.state.selectedJobId = newJob.jobId;
    this.audit('CREATE', 'VESSEL_CALL', `Created vessel call ${newJob.jobId}`, newJob.jobId);
    if (!apiAuth.enabled) {
      this.state.jobCalls = previousJobCalls;
      this.state.selectedJobId = previousSelectedJobId;
      this.state.auditLogs = previousAuditLogs;
      throw new Error('API XAMPP harus diaktifkan untuk menyimpan nomor EPDA dan FDA.');
    }

    const snapshot = JSON.parse(JSON.stringify(this.state)) as DatabaseState;
    const saveOperation = this.apiSaveQueue.then(async () => {
      if (!this.apiRevision) throw new Error('Revisi database XAMPP tidak tersedia.');
      this.apiRevision = await dataApi.save(snapshot, this.apiRevision);
      this.apiSyncError = null;
    });
    this.apiSaveQueue = saveOperation.catch((error: unknown) => {
      this.apiSyncError = error;
      window.dispatchEvent(new CustomEvent('lgm:api-save-error', {
        detail: error instanceof Error ? error.message : String(error),
      }));
    });

    try {
      await saveOperation;
    } catch (error) {
      if (this.getJob(newJob.jobId) === newJob) {
        this.state.jobCalls = this.state.jobCalls.filter((job) => job !== newJob);
        this.state.selectedJobId = previousSelectedJobId;
        this.state.auditLogs = previousAuditLogs;
      }
      this.stateVersion += 1;
      this.notify();
      throw error instanceof Error ? error : new Error(String(error));
    }
    this.notify();
    return newJob;
  }

  // --- Workflow guards / transitions ---
  // One Job/Vessel Call ID owns the complete lifecycle. UI actions should use these guards
  // so a later department cannot bypass an earlier approval.
  public isCrewOnlyJob(jobId: string): boolean {
    const job = this.getJob(jobId);
    return Boolean(
      job
      && (job.purposeOfCall === 'CREW_CHANGE_ONLY' || job.purposeOfCall === 'CREW_PASSENGER_OPERATIONS')
      && (job.quotation?.epda?.items || []).length === 0
      && !(job.quotation?.epda?.totalAmount > 0)
    );
  }

  public canApproveJob(jobId: string): { ok: boolean; message?: string } {
    const job = this.getJob(jobId);
    if (!job) return { ok: false, message: 'Job/Vessel Call tidak ditemukan.' };
    if (job.managerApproval.status === 'APPROVED') return { ok: false, message: 'Job sudah disetujui Manager.' };
    if (!this.isCrewOnlyJob(jobId) && job.quotation.epda.status !== 'SUBMITTED') {
      return { ok: false, message: 'EPDA belum disubmit oleh Sales.' };
    }
    return { ok: true };
  }

  public canFinalizeFDA(jobId: string): { ok: boolean; message?: string } {
    const job = this.getJob(jobId);
    if (!job) return { ok: false, message: 'Job/Vessel Call tidak ditemukan.' };
    if (this.isCrewOnlyJob(jobId)) {
      return { ok: false, message: 'Job crew-only menggunakan FPDA; proses FDA tidak berlaku.' };
    }
    if (job.managerApproval.status !== 'APPROVED') return { ok: false, message: 'FDA belum dapat diproses. Manager Approval harus APPROVED.' };
    if (job.quotation.epda.status !== 'APPROVED') return { ok: false, message: 'EPDA harus APPROVED sebelum FDA.' };
    const approvedVoucherExists = (this.state.paymentVouchers || []).some((voucher) =>
      (voucher.status === 'APPROVED' || voucher.status === 'PAID')
      && voucher.items.some((item) => item.jobNumber.trim() === jobId)
    );
    if (!approvedVoucherExists) {
      return { ok: false, message: `Payment Voucher untuk Job ${jobId} harus dibuat dan disetujui Manager OPS sebelum FDA dikirim.` };
    }
    if (!(job.fda.finalBilledToPrincipal > 0) && !(job.quotation.epda.totalAmount > 0)) {
      return { ok: false, message: 'EPDA belum memiliki Amount untuk diproses menjadi FDA.' };
    }
    if (job.fda.approvalStatus === 'SUBMITTED') return { ok: false, message: 'FDA sedang menunggu approval Manager OPS.' };
    if (job.fda.fdaApproved || job.fda.approvalStatus === 'APPROVED') return { ok: false, message: 'FDA untuk Job ini sudah disetujui Manager.' };
    return { ok: true };
  }

  public canApproveFDA(jobId: string): { ok: boolean; message?: string } {
    const job = this.getJob(jobId);
    if (!job) return { ok: false, message: 'Job/Vessel Call tidak ditemukan.' };
    if (this.isCrewOnlyJob(jobId)) {
      return { ok: false, message: 'Job crew-only menggunakan FPDA; approval FDA tidak berlaku.' };
    }
    if (job.fda.approvalStatus !== 'SUBMITTED') return { ok: false, message: 'FDA belum dikirim oleh tim FDA.' };
    if (job.fda.fdaApproved) return { ok: false, message: 'FDA sudah disetujui Manager OPS.' };
    return { ok: true };
  }

  public canCloseJob(
    jobId: string,
    approvedFpda?: { total: number; currency: Currency; exchangeRate: number; pdaNo?: string },
  ): { ok: boolean; message?: string } {
    const job = this.getJob(jobId);
    if (!job) return { ok: false, message: 'Job/Vessel Call tidak ditemukan.' };
    const crewOnlyFpda = this.isCrewOnlyJob(jobId)
      && job.managerApproval?.status === 'APPROVED'
      && Boolean(approvedFpda?.pdaNo)
      && Number(approvedFpda?.total) > 0;
    if (!job.fda.fdaApproved && !crewOnlyFpda) {
      return { ok: false, message: 'Closing belum dapat dilakukan. FDA belum Approved atau FPDA crew-only belum approved.' };
    }
    if ((job.principalReceipts || []).some((receipt) => receipt.refundStatus === 'PENDING')) {
      return { ok: false, message: 'Closing belum dapat dilakukan. Refund lebih bayar masih menunggu transfer.' };
    }
    if (job.principalInvoice?.status !== 'SETTLED') {
      return { ok: false, message: 'Closing belum dapat dilakukan. Tandai pembayaran PAID di AR setelah saldo lunas.' };
    }
    const invoiceCurrency = crewOnlyFpda
      ? approvedFpda.currency
      : job.fda.currency || job.currency || 'IDR';
    const exchangeRate = crewOnlyFpda
      ? approvedFpda.exchangeRate || job.exchangeRateUSDToIDR || 15800
      : job.fda.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    const rawInvoiceTotal = crewOnlyFpda
      ? approvedFpda.total
      : job.fda.finalBilledToPrincipal
        || job.principalInvoice?.totalAmountUSD
        || job.quotation?.epda?.totalAmount
        || 0;
    const invoicePrecision = invoiceCurrency === 'IDR' ? 1 : 100;
    const invoiceTotal = Math.round((rawInvoiceTotal + Number.EPSILON) * invoicePrecision) / invoicePrecision;
    const rawReceivedTotal = (job.principalReceipts || []).reduce((sum, receipt) => {
      const receiptCurrency = receipt.currency || job.currency || 'IDR';
      const received = convertPrincipalReceiptAmount(
        job,
        receipt.amount || 0,
        receiptCurrency,
        invoiceCurrency,
        receipt.exchangeRateUSDToIDR,
      );
      const refund = receipt.refundStatus === 'PAID'
        ? convertPrincipalReceiptAmount(
            job,
            receipt.refundAmount || 0,
            receiptCurrency,
            invoiceCurrency,
            receipt.refundExchangeRateUSDToIDR || receipt.exchangeRateUSDToIDR,
          )
        : 0;
      return sum + received - refund;
    }, 0);
    const receivedTotal = Math.round((rawReceivedTotal + Number.EPSILON) * invoicePrecision) / invoicePrecision;
    const outstanding = Math.max(0, invoiceTotal - receivedTotal);
    const floatingPointTolerance = Number.EPSILON * Math.max(1, Math.abs(invoiceTotal), Math.abs(receivedTotal)) * 4;
    if (outstanding > floatingPointTolerance) {
      return { ok: false, message: `Closing belum dapat dilakukan. Sisa tagihan AR ${invoiceCurrency} ${outstanding.toLocaleString('en-US')} belum lunas.` };
    }
    return { ok: true };
  }

  public closeJobWhenPrincipalCollected(
    jobId: string,
    closerName: string,
    approvedFpda?: { total: number; currency: Currency; exchangeRate: number; pdaNo?: string },
  ): boolean {
    const job = this.getJob(jobId);
    const guard = this.canCloseJob(jobId, approvedFpda);
    if (!job || !guard.ok || job.closing.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED') return false;
    return this.recordJobClosure(
      jobId,
      closerName,
      this.isCrewOnlyJob(jobId) && approvedFpda
        ? `Approved FPDA ${approvedFpda.pdaNo || ''} and principal payment fully received.`
        : 'FDA approved and principal payment fully received.',
    );
  }

  // Manager Approval Action
  public approveJobQuote(jobId: string, approverName: string, notes?: string): boolean {
    const job = this.getJob(jobId);
    const guard = this.canApproveJob(jobId);
    if (!job || !guard.ok) return false;
    const crewOnly = this.isCrewOnlyJob(jobId);

    this.audit('APPROVE', 'MANAGER_APPROVAL', `Approved quotation for ${jobId}`, jobId);
    this.updateJob(jobId, {
      status: 'APPROVED',
      currentStage: 'OPERATIONAL',
      quotation: {
        ...job.quotation,
        epda: crewOnly ? job.quotation.epda : { ...job.quotation.epda, status: 'APPROVED' },
      },
      managerApproval: {
        status: 'APPROVED',
        approvedBy: approverName,
        approvedAt: new Date().toISOString(),
        notes: notes || 'Approved by Operations Manager.',
      },
    });
    return true;
  }

  public rejectJobQuote(jobId: string, approverName: string, notes?: string): boolean {
    const job = this.getJob(jobId);
    if (!job) return false;
    this.audit('REJECT', 'MANAGER_APPROVAL', `Rejected quotation for ${jobId}`, jobId);
    this.updateJob(jobId, {
      status: 'INQUIRY',
      currentStage: 'QUOTATION',
      quotation: {
        ...job.quotation,
        epda: { ...job.quotation.epda, status: 'DRAFT' },
      },
      managerApproval: {
        status: 'REJECTED',
        approvedBy: approverName,
        approvedAt: new Date().toISOString(),
        notes: notes || 'Rejected: Please review the EPDA Amount.',
      },
    });
    return true;
  }

  public submitFDAForManager(jobId: string, updates: Pick<JobCall, 'fda' | 'ap' | 'ar' | 'principalInvoice'>, submitterName: string): boolean {
    const guard = this.canFinalizeFDA(jobId);
    if (!guard.ok) return false;

    this.updateJob(jobId, {
      ...updates,
      fda: {
        ...updates.fda,
        fdaApproved: false,
        approvalStatus: 'SUBMITTED',
        submittedBy: submitterName,
        submittedAt: new Date().toISOString(),
        approvedBy: undefined,
        approvedAt: undefined,
      },
      currentStage: 'FDA',
      status: 'IN_PROGRESS',
    });
    this.audit('SUBMIT', 'FDA_APPROVAL', `Submitted FDA for Manager approval: ${jobId}`, jobId);
    return true;
  }

  public approveFDA(jobId: string, approverName: string, notes?: string): boolean {
    const job = this.getJob(jobId);
    const guard = this.canApproveFDA(jobId);
    if (!job || !guard.ok) return false;

    this.updateJob(jobId, {
      fda: {
        ...job.fda,
        fdaApproved: true,
        advancePaymentAtApproval: getPrincipalReceiptSummary(
          job,
          job.fda?.currency || job.quotation?.epda?.currency || job.currency || 'IDR',
        ).advanceReceived,
        approvalStatus: 'APPROVED',
        approvedBy: approverName,
        approvedAt: new Date().toISOString(),
        notes: notes || 'FDA disetujui Manager OPS dan diteruskan ke Finance.',
      },
      currentStage: 'AP_AR',
      status: 'IN_PROGRESS',
    });
    this.audit('APPROVE', 'FDA_APPROVAL', `Approved FDA for ${jobId}`, jobId);
    return true;
  }

  public rejectFDA(jobId: string, reviewerName: string, notes?: string): boolean {
    const job = this.getJob(jobId);
    const guard = this.canApproveFDA(jobId);
    if (!job || !guard.ok) return false;

    this.updateJob(jobId, {
      fda: {
        ...job.fda,
        fdaApproved: false,
        approvalStatus: 'REJECTED',
        approvedBy: reviewerName,
        approvedAt: new Date().toISOString(),
        notes: notes || 'FDA dikembalikan untuk revisi oleh Manager OPS.',
      },
      currentStage: 'FDA',
      status: 'IN_PROGRESS',
    });
    this.audit('REJECT', 'FDA_APPROVAL', `Rejected FDA for ${jobId}`, jobId);
    return true;
  }

  // Close Job Action — only after FDA and AR/Invoice are complete.
  public closeJob(
    jobId: string,
    closerName: string,
    auditNotes?: string,
    approvedFpda?: { total: number; currency: Currency; exchangeRate: number; pdaNo?: string },
  ): boolean {
    const job = this.getJob(jobId);
    const guard = this.canCloseJob(jobId, approvedFpda);
    if (!job || !guard.ok) return false;

    return this.recordJobClosure(jobId, closerName, auditNotes || 'FDA reconciliation and principal invoice settled in full.');
  }

  private recordJobClosure(jobId: string, closerName: string, auditNotes: string): boolean {
    const job = this.getJob(jobId);
    if (!job || job.closing.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED') return false;

    const previousAuditLogs = this.state.auditLogs;
    this.audit('CLOSE', 'VESSEL_CALL', `Closed vessel call ${jobId}`, jobId);
    const saved = this.updateJob(jobId, {
      currentStage: 'CLOSED',
      status: 'CLOSED',
      closing: {
        isClosed: true,
        closedAt: new Date().toISOString(),
        closedBy: closerName,
        postVoyageRemarks: auditNotes,
      },
    });
    if (!saved) {
      this.state.auditLogs = previousAuditLogs;
      this.notify();
      return false;
    }
    return true;
  }
}

export const db = new DatabaseService();
