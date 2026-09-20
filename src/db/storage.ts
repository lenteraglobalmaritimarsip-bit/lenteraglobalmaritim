import {
  User,
  Customer,
  Vessel,
  Port,
  Zone,
  FixTariff,
  ExpensesItem,
  JobCall,
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
import { supabase, isSupabaseConfigured } from '@/supabaseClient';

export interface DatabaseState {
  users: User[];
  customers: Customer[];
  vessels: Vessel[];
  ports: Port[];
  zones: Zone[];
  fixTariffs: FixTariff[];
  expensesItems: ExpensesItem[];
  jobCalls: JobCall[];
  currentRole: UserRole;
  selectedJobId: string;
  auditLogs: AuditLog[];
}

const REMOVED_JOB_CALL_IDS = new Set(['VC-2026-0098', 'VC-2026-0099', 'VC-2026-0095']);
const LOCAL_DATABASE_KEY = 'lgm_database_state';

const withoutRemovedJobCalls = (jobCalls: JobCall[]): JobCall[] =>
  jobCalls.filter((job) => !REMOVED_JOB_CALL_IDS.has(job.jobId));

const syncActualFDAInvoice = (job: JobCall): JobCall => {
  const actualTotal = (job.actualCosts || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  if (!actualTotal || !job.fda?.fdaApproved) return job;

  const currency = job.fda.currency || job.actualCosts?.[0]?.currency || job.currency;
  const exchangeRate = job.exchangeRateUSDToIDR || 15800;
  const totalBilledUSD = currency === 'USD' ? actualTotal : actualTotal / exchangeRate;
  const totalBilledIDR = currency === 'IDR' ? actualTotal : actualTotal * exchangeRate;

  return {
    ...job,
    fda: { ...job.fda, currency, finalBilledToPrincipal: actualTotal },
    principalInvoice: {
      ...job.principalInvoice,
      totalAmountUSD: totalBilledUSD,
      totalAmountIDR: totalBilledIDR,
      balanceDueUSD: Math.max(0, totalBilledUSD - (job.principalInvoice?.totalAmountUSD || 0) + (job.principalInvoice?.balanceDueUSD || 0)),
      balanceDueIDR: Math.max(0, totalBilledIDR - (job.principalInvoice?.totalAmountIDR || 0) + (job.principalInvoice?.balanceDueIDR || 0)),
    },
    ar: job.ar?.length
      ? job.ar.map((item, index) => index === 0 ? { ...item, requestedAmount: actualTotal, currency } : item)
      : job.ar,
  };
};

export const normalizeBranchCode = (branch?: string): string => {
  const raw = (branch || 'Head Office').trim();
  if (!raw) return 'HO';

  const upper = raw.toUpperCase();
  if (/^[A-Z0-9]{2,4}$/.test(upper)) {
    return upper.slice(0, 3);
  }

  const parts = upper
    .replace(/[^A-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const initials = parts.map((part) => part[0] || '').join('').slice(0, 3);
  return initials ? initials.padEnd(3, 'X') : 'HO';
};

export const getCurrentBranchName = (): string => {
  return db.getActorBranch();
};

export const getCurrentBranchCode = (): string => {
  return normalizeBranchCode(getCurrentBranchName());
};

export const buildBranchAwareEPDANumber = (jobId: string, branch?: string, referenceDate = new Date()): string => {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const registrationNumber = (jobId || 'VC-0000').match(/(\d{4})$/)?.[1] || '0000';
  const branchCode = normalizeBranchCode(branch || getCurrentBranchName());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${registrationNumber}/EPDA-LGM-${branchCode}/${month}/${year}`;
};

export const formatEPDAQuoteNoForDisplay = (quoteNo?: string, jobId?: string, branch?: string, referenceDate = new Date()): string => {
  const raw = (quoteNo || '').trim();
  if (/^\d{4}\/EPDA-LGM-[A-Z0-9]{2,3}\/\d{2}\/\d{4}$/.test(raw)) {
    return raw;
  }

  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  const fromLegacy = raw.match(/EPDA[-_](?:\d{4})[-_](\d{4})/i)?.[1];
  const fromJobId = (jobId || 'VC-0000').match(/(\d{4})$/)?.[1] || '0000';
  const registrationNumber = fromLegacy || fromJobId || '0000';

  const branchCode = normalizeBranchCode(branch || getCurrentBranchName());
  return `${registrationNumber}/EPDA-LGM-${branchCode}/${month}/${year}`;
};

export const buildBranchAwareFDANumber = (jobId: string, branch?: string, referenceDate = new Date()): string => {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const registrationNumber = (jobId || 'VC-0000').match(/(\d{4})$/)?.[1] || '0000';
  const branchCode = normalizeBranchCode(branch || getCurrentBranchName());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${registrationNumber}/FDA-LGM-${branchCode}/${month}/${year}`;
};

export const buildBranchAwareInvoiceNumber = (jobId: string, branch?: string, referenceDate = new Date()): string => {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const registrationNumber = (jobId || 'VC-0000').match(/(\d{4})$/)?.[1] || '0000';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const branchCode = normalizeBranchCode(branch || getCurrentBranchName());
  return `INV-MP-${registrationNumber}/FDA-LGM-${branchCode}/${month}/${year}`;
};

class DatabaseService {
  private state: DatabaseState;
  private listeners: Array<(state: DatabaseState) => void> = [];
  private actor: { id?: string; name: string; role: UserRole; branch?: string } = { name: 'System', role: 'ADMIN' };

  constructor() {
    this.state = this.loadLocalState();
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
      jobCalls: withoutRemovedJobCalls(INITIAL_JOB_CALLS),
      currentRole: 'ADMIN',
      selectedJobId: INITIAL_JOB_CALLS[0]?.jobId || '',
      auditLogs: [],
    };
  }

  private loadLocalState(): DatabaseState {
    const defaults = this.getDefaultState();
    if (typeof localStorage === 'undefined') return defaults;

    try {
      const stored = JSON.parse(localStorage.getItem(LOCAL_DATABASE_KEY) || 'null') as Partial<DatabaseState> | null;
      if (!stored || typeof stored !== 'object') return defaults;
      return {
        ...defaults,
        ...stored,
        users: Array.isArray(stored.users) ? stored.users : defaults.users,
        customers: Array.isArray(stored.customers) ? stored.customers : defaults.customers,
        vessels: Array.isArray(stored.vessels) ? stored.vessels : defaults.vessels,
        ports: Array.isArray(stored.ports) ? stored.ports : defaults.ports,
        zones: Array.isArray(stored.zones) ? stored.zones : defaults.zones,
        fixTariffs: Array.isArray(stored.fixTariffs) ? stored.fixTariffs : defaults.fixTariffs,
        expensesItems: Array.isArray(stored.expensesItems) ? stored.expensesItems : defaults.expensesItems,
        jobCalls: Array.isArray(stored.jobCalls) ? withoutRemovedJobCalls(stored.jobCalls) : defaults.jobCalls,
        auditLogs: Array.isArray(stored.auditLogs) ? stored.auditLogs : defaults.auditLogs,
      };
    } catch {
      return defaults;
    }
  }

  public async hydrate(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      this.state = this.loadLocalState();
      this.notify();
      return;
    }

    const [users, customers, vessels, ports, zones, fixTariffs, expensesItems, jobCalls, auditLogs] = await Promise.all([
      this.loadTable<User>('app_users', INITIAL_USERS, (row) => ({
        ...row,
        id: row.employee_code || row.id,
        branch: row.branch || row.branch_name || 'Head Office',
      })),
      this.loadTable<Customer>('customers', INITIAL_CUSTOMERS, (row) => ({
        ...row,
        companyName: row.company_name || row.companyName,
        creditTermDays: row.credit_term_days ?? row.creditTermDays,
      })),
      this.loadTable<Vessel>('vessels', INITIAL_VESSELS, (row) => ({
        ...row,
        imoNumber: row.imo_number || row.imoNumber,
        callSign: row.call_sign || row.callSign,
        vesselType: row.vessel_type || row.vesselType,
        yearBuilt: row.year_built ?? row.yearBuilt,
      })),
      this.loadTable<Port>('ports', INITIAL_PORTS, (row) => ({
        ...row,
        unlocode: row.unlocode,
        channelDepthMeters: row.channel_depth_m ?? row.channelDepthMeters,
        tideRestriction: row.tide_restriction || row.tideRestriction,
        operatingHours: row.operating_hours || row.operatingHours,
      })),
      this.loadTable<Zone>('zones', INITIAL_ZONES, (row) => ({
        ...row,
        zoneCode: row.zone_code || row.zoneCode,
        zoneName: row.zone_name || row.zoneName,
        type: row.zone_type || row.type,
        maxDraftMeters: row.max_draft_m ?? row.maxDraftMeters,
      })),
      this.loadTable<FixTariff>('fix_tariffs', INITIAL_FIX_TARIFFS, (row) => ({
        ...row,
        serviceCode: row.service_code || row.serviceCode,
        serviceName: row.service_name || row.serviceName,
        calculationBasis: row.calculation_basis || row.calculationBasis,
        minCharge: row.min_charge ?? row.minCharge,
      })),
      this.loadTable<ExpensesItem>('expense_items', INITIAL_EXPENSES_ITEMS, (row) => ({
        ...row,
        defaultCurrency: row.default_currency || row.defaultCurrency,
        standardCostBuy: row.standard_cost_buy ?? row.standardCostBuy,
        standardCostSell: row.standard_cost_sell ?? row.standardCostSell,
        preferredVendor: row.preferred_vendor || row.preferredVendor,
      })),
      this.loadTable<JobCall>('vessel_calls', INITIAL_JOB_CALLS, (row) => ({
        ...row,
        jobId: row.job_id || row.jobId,
        exchangeRateUSDToIDR: row.exchange_rate_usd_idr ?? row.exchangeRateUSDToIDR,
        currentStage: row.current_stage || row.currentStage,
        createdAt: row.created_at || row.createdAt,
        updatedAt: row.updated_at || row.updatedAt,
      })),
      this.loadTable<AuditLog>('audit_logs', [], (row) => ({
        ...row,
        timestamp: row.created_at || row.timestamp,
        actorId: row.user_id || row.actorId,
        entity: row.entity_type || row.entity,
        entityId: row.entity_id || row.entityId,
      })),
    ]);

    this.state = {
      ...this.state,
      users,
      customers,
      vessels,
      ports,
      zones,
      fixTariffs,
      expensesItems,
      jobCalls: withoutRemovedJobCalls(jobCalls).map(syncActualFDAInvoice),
      auditLogs,
      selectedJobId: jobCalls[0]?.jobId || this.state.selectedJobId,
    };
    this.notify();
  }

  private async loadTable<T>(table: string, seeds: T[], mapRow: (row: any) => T): Promise<T[]> {
    if (!isSupabaseConfigured || !supabase) {
      return seeds;
    }

    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    if (data && data.length > 0) return data.map(mapRow);

    if (!seeds.length) return [];
    const { data: inserted, error: insertError } = await supabase
      .from(table)
      .insert(seeds.map((seed) => this.toSupabaseRow(table, seed)))
      .select('*');
    if (insertError) throw insertError;
    return (inserted || seeds).map(mapRow);
  }

  private toSupabaseRow(table: string, value: any): Record<string, unknown> {
    switch (table) {
      case 'app_users':
        return { employee_code: value.id, name: value.name, email: value.email, username: value.username || value.email, password_hash: value.password || '', role: value.role, department: value.department, phone: value.phone, status: value.status || 'ACTIVE' };
      case 'customers':
        return { code: value.code, company_name: value.companyName, country: value.country, type: value.type, contact_person: value.contactPerson, email: value.email, phone: value.phone, address: value.address, credit_term_days: value.creditTermDays };
      case 'vessels':
        return { name: value.name, imo_number: value.imoNumber || null, call_sign: value.callSign, flag: value.flag, vessel_type: value.vesselType, grt: value.grt, nrt: value.nrt, dwt: value.dwt, loa: value.loa, beam: value.beam, year_built: value.yearBuilt };
      case 'ports':
        return { code: value.code, name: value.name, country: value.country, unlocode: value.unlocode, channel_depth_m: value.channelDepthMeters, tide_restriction: value.tideRestriction, operating_hours: value.operatingHours };
      case 'zones':
        return { zone_code: value.zoneCode, zone_name: value.zoneName, zone_type: value.type, max_draft_m: value.maxDraftMeters, description: value.description };
      case 'fix_tariffs':
        return { service_code: value.serviceCode, service_name: value.serviceName, calculation_basis: value.calculationBasis, currency: value.currency, rate: value.rate, min_charge: value.minCharge, description: value.description };
      case 'expense_items':
        return { code: value.code, category: value.category, name: value.name, unit: value.unit, default_currency: value.defaultCurrency, standard_cost_buy: value.standardCostBuy, standard_cost_sell: value.standardCostSell, preferred_vendor: value.preferredVendor };
      case 'vessel_calls':
        return { job_id: value.jobId, eta: value.eta, etd: value.etd, purpose_of_call: value.purposeOfCall, currency: value.currency, exchange_rate_usd_idr: value.exchangeRateUSDToIDR, current_stage: value.currentStage, status: value.status };
      case 'audit_logs':
        return { action: value.action, entity_type: value.entity, entity_id: value.entityId, metadata: { description: value.description, actor_name: value.actorName, role: value.role }, created_at: value.timestamp };
      default:
        return value;
    }
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
    this.state.auditLogs = [entry, ...this.state.auditLogs].slice(0, 500);
  }

  public setActor(actor: { id?: string; name: string; role: UserRole; branch?: string }): void {
    this.actor = actor;
  }

  public getActorBranch(): string {
    return this.actor.branch?.trim() || 'Head Office';
  }

  private async saveToSupabase(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      this.notify();
      return;
    }

    const results = await Promise.all([
      supabase.from('app_users').upsert(this.state.users.map((user) => ({ employee_code: user.id, name: user.name, email: user.email, username: user.username || user.email, password_hash: user.password || '', role: user.role, department: user.department, branch: user.branch, phone: user.phone, status: user.status })), { onConflict: 'employee_code' }),
      supabase.from('customers').upsert(this.state.customers.map((customer) => ({ code: customer.code, company_name: customer.companyName, country: customer.country, type: customer.type, contact_person: customer.contactPerson, email: customer.email, phone: customer.phone, address: customer.address, credit_term_days: customer.creditTermDays })), { onConflict: 'code' }),
      supabase.from('vessels').upsert(this.state.vessels.map((vessel) => ({ name: vessel.name, imo_number: vessel.imoNumber || null, call_sign: vessel.callSign, flag: vessel.flag, vessel_type: vessel.vesselType, grt: vessel.grt, nrt: vessel.nrt, dwt: vessel.dwt, loa: vessel.loa, beam: vessel.beam, year_built: vessel.yearBuilt })), { onConflict: 'imo_number' }),
      supabase.from('ports').upsert(this.state.ports.map((port) => ({ code: port.code, name: port.name, country: port.country, unlocode: port.unlocode, channel_depth_m: port.channelDepthMeters, tide_restriction: port.tideRestriction, operating_hours: port.operatingHours })), { onConflict: 'code' }),
      this.saveRowsWithoutConflict('zones', 'zone_code', this.state.zones.map((zone) => ({ zone_code: zone.zoneCode, zone_name: zone.zoneName, zone_type: zone.type, max_draft_m: zone.maxDraftMeters, description: zone.description }))),
      this.saveRowsWithoutConflict('fix_tariffs', 'service_code', this.state.fixTariffs.map((tariff) => ({ service_code: tariff.serviceCode, service_name: tariff.serviceName, calculation_basis: tariff.calculationBasis, currency: tariff.currency, rate: tariff.rate, min_charge: tariff.minCharge, description: tariff.description }))),
      supabase.from('expense_items').upsert(this.state.expensesItems.map((item) => ({ code: item.code, category: item.category, name: item.name, unit: item.unit, default_currency: item.defaultCurrency, standard_cost_buy: item.standardCostBuy, standard_cost_sell: item.standardCostSell, preferred_vendor: item.preferredVendor })), { onConflict: 'code' }),
      this.saveRowsWithoutConflict('vessel_calls', 'job_id', this.state.jobCalls.map((job) => ({ job_id: job.jobId, eta: job.eta, etd: job.etd, purpose_of_call: job.purposeOfCall, currency: job.currency, exchange_rate_usd_idr: job.exchangeRateUSDToIDR, current_stage: job.currentStage, status: job.status }))),
    ]);
    const failed = results.find((result) => result && 'error' in result && result.error);
    if (failed && 'error' in failed && failed.error) throw failed.error;
    this.notify();
  }

  private async saveRowsWithoutConflict(table: string, key: string, rows: Record<string, unknown>[]): Promise<void> {
    for (const row of rows) {
      const keyValue = row[key];
      if (!keyValue) {
        const { error } = await supabase.from(table).insert(row);
        if (error) throw error;
        continue;
      }

      const { data: existing, error: lookupError } = await supabase
        .from(table)
        .select('id')
        .eq(key, keyValue)
        .limit(1);
      if (lookupError) throw lookupError;

      if (existing?.[0]?.id) {
        const { error } = await supabase.from(table).update(row).eq('id', existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(row);
        if (error) throw error;
      }
    }
  }

  private async saveToStorage(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      try {
        localStorage.setItem(LOCAL_DATABASE_KEY, JSON.stringify(this.state));
      } catch (error) {
        console.error('Failed to save local database:', error);
      }
      this.notify();
      return;
    }

    await this.saveToSupabase();
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
    await this.saveToSupabase();
    this.notify();
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public async setRole(role: UserRole): Promise<void> {
    this.state.currentRole = role;
    await this.saveToSupabase();
  }

  public async setSelectedJobId(jobId: string): Promise<void> {
    this.state.selectedJobId = jobId;
    await this.saveToSupabase();
  }

  public resetToSeeds(): void {
    this.state = {
      users: INITIAL_USERS,
      customers: INITIAL_CUSTOMERS,
      vessels: INITIAL_VESSELS,
      ports: INITIAL_PORTS,
      zones: INITIAL_ZONES,
      fixTariffs: INITIAL_FIX_TARIFFS,
      expensesItems: INITIAL_EXPENSES_ITEMS,
      jobCalls: withoutRemovedJobCalls(INITIAL_JOB_CALLS),
      currentRole: this.state.currentRole,
      selectedJobId: INITIAL_JOB_CALLS[0]?.jobId || '',
      auditLogs: [],
    };
    this.saveToStorage();
  }

  public importDatabase(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.jobCalls) && Array.isArray(data.users)) {
        this.state = {
          ...this.state,
          ...data,
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
  public addUser(user: Omit<User, 'id'>): User {
    const id = `USR-${String(this.state.users.length + 1).padStart(3, '0')}`;
    const newUser: User = { ...user, id };
    this.state.users = [...this.state.users, newUser];
    this.audit('CREATE', 'USER', `Created user ${newUser.name}`, newUser.id);
    this.saveToStorage();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): void {
    this.state.users = this.state.users.map((u) =>
      u.id === id ? { ...u, ...updates } : u
    );
    this.audit('UPDATE', 'USER', `Updated user ${id}`, id);
    this.saveToStorage();
  }

  public deleteUser(id: string): void {
    this.state.users = this.state.users.filter((u) => u.id !== id);
    this.audit('DELETE', 'USER', `Deleted user ${id}`, id);
    this.saveToStorage();
  }

  // Customers
  public addCustomer(customer: Omit<Customer, 'id'>): Customer {
    const id = `CUST-${String(this.state.customers.length + 1).padStart(3, '0')}`;
    const newCust: Customer = { ...customer, id };
    this.state.customers = [...this.state.customers, newCust];
    this.audit('CREATE', 'CUSTOMER', `Created customer ${newCust.companyName}`, newCust.id);
    this.saveToStorage();
    return newCust;
  }

  public updateCustomer(id: string, updates: Partial<Customer>): void {
    this.state.customers = this.state.customers.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    this.saveToStorage();
  }

  public deleteCustomer(id: string): void {
    this.state.customers = this.state.customers.filter((c) => c.id !== id);
    this.saveToStorage();
  }

  // Vessels
  public addVessel(vessel: Omit<Vessel, 'id'>): Vessel {
    const id = `VES-${String(this.state.vessels.length + 1).padStart(3, '0')}`;
    const newVessel: Vessel = { ...vessel, id };
    this.state.vessels = [...this.state.vessels, newVessel];
    this.audit('CREATE', 'VESSEL', `Created vessel ${newVessel.name}`, newVessel.id);
    this.saveToStorage();
    return newVessel;
  }

  public updateVessel(id: string, updates: Partial<Vessel>): void {
    this.state.vessels = this.state.vessels.map((v) =>
      v.id === id ? { ...v, ...updates } : v
    );
    this.saveToStorage();
  }

  public deleteVessel(id: string): void {
    this.state.vessels = this.state.vessels.filter((v) => v.id !== id);
    this.saveToStorage();
  }

  // Ports
  public addPort(port: Omit<Port, 'id'>): Port {
    const id = `PRT-${String(this.state.ports.length + 1).padStart(3, '0')}`;
    const newPort: Port = { ...port, id };
    this.state.ports = [...this.state.ports, newPort];
    this.audit('CREATE', 'PORT', `Created port ${newPort.name}`, newPort.id);
    this.saveToStorage();
    return newPort;
  }

  public updatePort(id: string, updates: Partial<Port>): void {
    this.state.ports = this.state.ports.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    );
    this.saveToStorage();
  }

  public deletePort(id: string): void {
    this.state.ports = this.state.ports.filter((p) => p.id !== id);
    this.saveToStorage();
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

  public deleteZone(id: string): void {
    this.state.zones = this.state.zones.filter((z) => z.id !== id);
    this.saveToStorage();
  }

  // Fix Tariff
  public addFixTariff(tariff: Omit<FixTariff, 'id'>): FixTariff {
    const id = `TAR-${String(this.state.fixTariffs.length + 1).padStart(3, '0')}`;
    const newTariff: FixTariff = { ...tariff, id };
    this.state.fixTariffs = [...this.state.fixTariffs, newTariff];
    this.audit('CREATE', 'FIX_TARIFF', `Created tariff ${newTariff.id}`, newTariff.id);
    this.saveToStorage();
    return newTariff;
  }

  public updateFixTariff(id: string, updates: Partial<FixTariff>): void {
    this.state.fixTariffs = this.state.fixTariffs.map((t) =>
      t.id === id ? { ...t, ...updates } : t
    );
    this.saveToStorage();
  }

  public deleteFixTariff(id: string): void {
    this.state.fixTariffs = this.state.fixTariffs.filter((t) => t.id !== id);
    this.saveToStorage();
  }

  // Expenses Items
  public addExpensesItem(item: Omit<ExpensesItem, 'id'>): ExpensesItem {
    const id = `EXP-${String(this.state.expensesItems.length + 1).padStart(3, '0')}`;
    const newItem: ExpensesItem = { ...item, id };
    this.state.expensesItems = [...this.state.expensesItems, newItem];
    this.audit('CREATE', 'EXPENSE_ITEM', `Created expense item ${newItem.name}`, newItem.id);
    this.saveToStorage();
    return newItem;
  }

  public updateExpensesItem(id: string, updates: Partial<ExpensesItem>): void {
    this.state.expensesItems = this.state.expensesItems.map((e) =>
      e.id === id ? { ...e, ...updates } : e
    );
    this.saveToStorage();
  }

  public deleteExpensesItem(id: string): void {
    this.state.expensesItems = this.state.expensesItems.filter((e) => e.id !== id);
    this.saveToStorage();
  }

  // --- JOB / VESSEL CALL LIFECYCLE ---

  public getJob(jobId: string): JobCall | undefined {
    return this.state.jobCalls.find((j) => j.jobId === jobId);
  }

  public updateJob(jobId: string, updates: Partial<JobCall>): void {
    const existingJob = this.getJob(jobId);
    if (
      existingJob &&
      this.actor.role === 'SALES' &&
      normalizeBranchCode(existingJob.inquiry?.createdByBranch || existingJob.inquiry?.createdByBranchCode) !== normalizeBranchCode(this.actor.branch)
    ) {
      return;
    }
    this.state.jobCalls = this.state.jobCalls.map((j) =>
      j.jobId === jobId
        ? {
            ...j,
            ...updates,
            updatedAt: new Date().toISOString(),
          }
        : j
    );
    this.audit('UPDATE', 'VESSEL_CALL', `Updated vessel call ${jobId}`, jobId);
    this.saveToStorage();
  }

  public createJob(jobData: Partial<JobCall>): JobCall {
    const nextSeq = this.state.jobCalls.length + 1;
    const year = new Date().getFullYear();
    const generatedJobId = `VC-${year}-${String(nextSeq).padStart(4, '0')}`;
    const documentSequence = this.state.jobCalls.length + 1;
    const documentNumberJobId = `VC-${year}-${String(documentSequence).padStart(4, '0')}`;
    const actorBranch = this.actor.role === 'SALES'
      ? (this.actor.branch || 'Head Office')
      : (jobData.inquiry?.createdByBranch || getCurrentBranchName());
    const actorBranchCode = normalizeBranchCode(actorBranch);

    const newJob: JobCall = {
      jobId: jobData.jobId || generatedJobId,
      vesselId: jobData.vesselId || '',
      vesselName: jobData.vesselName || 'MV UNNAMED',
      portId: jobData.portId || '',
      portName: jobData.portName || '',
      customerId: jobData.customerId || '',
      customerName: jobData.customerName || '',
      currency: jobData.currency || 'USD',
      exchangeRateUSDToIDR: 15800,
      eta: jobData.eta || new Date().toISOString().slice(0, 16),
      etd: jobData.etd || new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 16),
      purposeOfCall: jobData.purposeOfCall || 'CARGO_DISCHARGE',
      currentStage: 'INQUIRY',
      status: 'INQUIRY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      inquiry: {
        ...(jobData.inquiry || {}),
        inquiryNo: `INQ-${year}-${String(documentSequence).padStart(4, '0')}`,
        date: jobData.inquiry?.date || new Date().toISOString().slice(0, 10),
        cargoDetails: jobData.inquiry?.cargoDetails || 'General Cargo Inspection / Port Call',
        estimatedDays: jobData.inquiry?.estimatedDays || 3,
        specialRequirements: jobData.inquiry?.specialRequirements || 'Standard agency services requested',
        status: jobData.inquiry?.status || 'RECEIVED',
        createdBy: jobData.inquiry?.createdBy || 'Sarah Wijaya (SALES)',
        createdByBranch: actorBranch,
        createdByBranchCode: actorBranchCode,
      },

      quotation: jobData.quotation || {
        epda: {
          quoteNo: buildBranchAwareEPDANumber(documentNumberJobId, getCurrentBranchName(), new Date()),
          date: new Date().toISOString().slice(0, 10),
          currency: 'USD',
          totalBuyRate: 0,
          totalSellRate: 0,
          marginAmount: 0,
          marginPercentage: 0,
          status: 'DRAFT',
          items: [],
        },
        pda: {
          quoteNo: `PDA-${generatedJobId}`,
          date: new Date().toISOString().slice(0, 10),
          currency: 'USD',
          totalBuyRate: 0,
          totalSellRate: 0,
          marginAmount: 0,
          marginPercentage: 0,
          status: 'DRAFT',
          items: [],
        },
        crewChange: {
          id: `CC-${generatedJobId}`,
          date: new Date().toISOString().slice(0, 10),
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
        allowedMarginTolerancePct: 5.0,
      },

      operationalData: {
        statementOfFacts: [
          {
            id: 'SOF-INIT',
            timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
            event: 'Job opened in MaritimPort system',
          },
        ],
      },

      actualCosts: [],

      fda: {
        fdaNo: buildBranchAwareFDANumber(documentNumberJobId, getCurrentBranchCode(), new Date()),
        date: new Date().toISOString().slice(0, 10),
        totalEstimatedBuy: 0,
        totalEstimatedSell: 0,
        totalActualCost: 0,
        finalBilledToPrincipal: 0,
        varianceAmount: 0,
        variancePercentage: 0,
        fdaApproved: false,
      },

      ap: [],
      ar: [],

      principalInvoice: {
        invoiceNo: buildBranchAwareInvoiceNumber(generatedJobId, getCurrentBranchCode(), new Date()),
        invoiceDate: new Date().toISOString().slice(0, 10),
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

      closing: {
        isClosed: false,
        finalGrossMarginUSD: 0,
        finalGrossMarginIDR: 0,
      },
    };

    this.state.jobCalls.unshift(newJob);
    this.state.selectedJobId = newJob.jobId;
    this.audit('CREATE', 'VESSEL_CALL', `Created vessel call ${newJob.jobId}`, newJob.jobId);
    this.saveToStorage();
    return newJob;
  }

  // --- Workflow guards / transitions ---
  // One Job/Vessel Call ID owns the complete lifecycle. UI actions should use these guards
  // so a later department cannot bypass an earlier approval.
  public canApproveJob(jobId: string): { ok: boolean; message?: string } {
    const job = this.getJob(jobId);
    if (!job) return { ok: false, message: 'Job/Vessel Call tidak ditemukan.' };
    if (job.managerApproval.status === 'APPROVED') return { ok: false, message: 'Job sudah disetujui Manager.' };
    if (job.quotation.epda.status !== 'SUBMITTED') return { ok: false, message: 'EPDA belum disubmit oleh Sales.' };
    return { ok: true };
  }

  public canFinalizeFDA(jobId: string): { ok: boolean; message?: string } {
    const job = this.getJob(jobId);
    if (!job) return { ok: false, message: 'Job/Vessel Call tidak ditemukan.' };
    if (job.managerApproval.status !== 'APPROVED') return { ok: false, message: 'FDA belum dapat diproses. Manager Approval harus APPROVED.' };
    if (job.quotation.epda.status !== 'APPROVED') return { ok: false, message: 'EPDA harus APPROVED sebelum FDA.' };
    if (!job.actualCosts.length) return { ok: false, message: 'Belum ada Actual Cost. FDA belum dapat difinalisasi.' };
    if (job.fda.fdaApproved) return { ok: false, message: 'FDA untuk Job ini sudah difinalisasi.' };
    return { ok: true };
  }

  public canCloseJob(jobId: string): { ok: boolean; message?: string } {
    const job = this.getJob(jobId);
    if (!job) return { ok: false, message: 'Job/Vessel Call tidak ditemukan.' };
    if (!job.fda.fdaApproved) return { ok: false, message: 'Closing belum dapat dilakukan. FDA belum Approved.' };
    if (!job.ap.length || !job.ap.every(x => x.status === 'PAID')) return { ok: false, message: 'Closing belum dapat dilakukan. AP Vendor harus PAID seluruhnya.' };
    if (!job.ar.length || !job.ar.every(x => x.status === 'RECEIVED')) return { ok: false, message: 'Closing belum dapat dilakukan. AR Principal harus RECEIVED.' };
    if (job.principalInvoice.status !== 'SETTLED') return { ok: false, message: 'Closing belum dapat dilakukan. Principal Invoice harus SETTLED.' };
    return { ok: true };
  }

  public returnJobToFDA(jobId: string, reason: string, actorName: string): boolean {
    const job = this.getJob(jobId);
    if (!job || job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED') return false;

    this.audit('RETURN_TO_FDA', 'VESSEL_CALL', `Returned ${jobId} to FDA for correction: ${reason}`, jobId);
    this.updateJob(jobId, {
      currentStage: 'FDA',
      status: 'IN_PROGRESS',
      fda: {
        ...job.fda,
        fdaApproved: false,
        approvedBy: undefined,
        approvedAt: undefined,
        notes: `Dikembalikan oleh ${actorName}: ${reason}`,
      },
      principalInvoice: {
        ...job.principalInvoice,
        status: 'DRAFT',
      },
    });
    return true;
  }

  public closeJobWhenPrincipalCollected(jobId: string, closerName: string): boolean {
    const job = this.getJob(jobId);
    if (!job || !job.fda.fdaApproved || job.closing.isClosed) return false;

    const billed = job.ar.reduce((sum, item) => sum + (item.requestedAmount || 0), 0);
    const advance = (job.principalReceipts || [])
      .filter((receipt) => receipt.paymentType === 'ADVANCE_PAYMENT')
      .reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
    const received = job.ar.reduce((sum, item) => sum + (item.receivedAmount || 0), 0)
      + (job.principalReceipts || [])
        .filter((receipt) => receipt.paymentType !== 'ADVANCE_PAYMENT')
        .reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
    if (Math.max(0, billed - advance - received) > 0) return false;

    const actualCostTotal = job.actualCosts.reduce((sum, item) => sum + item.amount, 0);
    const invoiceTotal = job.principalInvoice.totalAmountUSD || job.quotation.pda.totalSellRate;
    const grossMarginUSD = invoiceTotal - actualCostTotal;
    const grossMarginIDR = grossMarginUSD * (job.exchangeRateUSDToIDR || 15800);

    this.audit('CLOSE', 'VESSEL_CALL', `Closed vessel call ${jobId} after principal collection`, jobId);
    this.updateJob(jobId, {
      currentStage: 'CLOSED',
      status: 'CLOSED',
      closing: {
        isClosed: true,
        closedAt: new Date().toISOString(),
        closedBy: closerName,
        finalGrossMarginUSD: grossMarginUSD,
        finalGrossMarginIDR: grossMarginIDR,
        postVoyageRemarks: 'Principal invoice collected in full.',
      },
    });
    return true;
  }

  // Manager Approval Action
  public approveJobQuote(jobId: string, approverName: string, notes?: string): boolean {
    const job = this.getJob(jobId);
    const guard = this.canApproveJob(jobId);
    if (!job || !guard.ok) return false;

    this.audit('APPROVE', 'MANAGER_APPROVAL', `Approved quotation for ${jobId}`, jobId);
    this.updateJob(jobId, {
      status: 'APPROVED',
      currentStage: 'OPERATIONAL',
      quotation: {
        ...job.quotation,
        epda: { ...job.quotation.epda, status: 'APPROVED' },
        pda: { ...job.quotation.pda, status: 'APPROVED' },
      },
      managerApproval: {
        status: 'APPROVED',
        approvedBy: approverName,
        approvedAt: new Date().toISOString(),
        notes: notes || 'Approved by Operations Manager with authorized rate margin.',
        allowedMarginTolerancePct: job.managerApproval.allowedMarginTolerancePct,
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
        pda: { ...job.quotation.pda, status: 'DRAFT' },
      },
      managerApproval: {
        status: 'REJECTED',
        approvedBy: approverName,
        approvedAt: new Date().toISOString(),
        notes: notes || 'Rejected: Please review buy rates and improve margin.',
        allowedMarginTolerancePct: job.managerApproval.allowedMarginTolerancePct,
      },
    });
    return true;
  }

  // Close Job Action — only after FDA + AP + AR/Invoice are complete.
  public closeJob(jobId: string, closerName: string, auditNotes?: string): boolean {
    const job = this.getJob(jobId);
    const guard = this.canCloseJob(jobId);
    if (!job || !guard.ok) return false;

    const actualCostTotal = job.actualCosts.reduce((sum, item) => sum + item.amount, 0);
    const invoiceTotal = job.principalInvoice.totalAmountUSD || job.quotation.pda.totalSellRate;
    const grossMarginUSD = invoiceTotal - actualCostTotal;
    const grossMarginIDR = grossMarginUSD * (job.exchangeRateUSDToIDR || 15800);

    this.audit('CLOSE', 'VESSEL_CALL', `Closed vessel call ${jobId}`, jobId);
    this.updateJob(jobId, {
      currentStage: 'CLOSED',
      status: 'CLOSED',
      closing: {
        isClosed: true,
        closedAt: new Date().toISOString(),
        closedBy: closerName,
        finalGrossMarginUSD: grossMarginUSD,
        finalGrossMarginIDR: grossMarginIDR,
        postVoyageRemarks: auditNotes || 'All disbursements, FDA reconciliation, and AR/AP settled in full.',
      },
    });
    return true;
  }
}

export const db = new DatabaseService();
