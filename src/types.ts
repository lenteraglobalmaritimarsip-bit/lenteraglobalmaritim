export type UserRole = 'ADMIN' | 'SALES' | 'MANAGER_OPS' | 'FDA' | 'FINANCE';

export type Currency = 'USD' | 'IDR';

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId?: string;
  actorName: string;
  role: UserRole;
  action: string;
  entity: string;
  entityId?: string;
  description: string;
}

export type JobStage =
  | 'INQUIRY'
  | 'QUOTATION'
  | 'MANAGER_APPROVAL'
  | 'OPERATIONAL'
  | 'ACTUAL_COST'
  | 'FDA'
  | 'AP_AR'
  | 'PRINCIPAL_INVOICE'
  | 'CLOSED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  branch: string;
  avatar?: string;
  status: 'ACTIVE' | 'INACTIVE';
  phone?: string;
  username?: string;
  password?: string;
  position?: string;
}

export interface Customer {
  id: string;
  code: string;
  companyName: string;
  country: string;
  type: 'PRINCIPAL' | 'CHARTERER' | 'SHIPOWNER';
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  creditTermDays: number;
}

export interface Vessel {
  id: string;
  name: string;
  imoNumber: string;
  callSign: string;
  flag: string;
  vesselType: 'BULK CARRIER' | 'CONTAINER' | 'OIL TANKER' | 'GENERAL CARGO' | 'TUG & BARGE' | 'LNG CARRIER';
  grt: number;
  nrt: number;
  dwt: number;
  loa: number;
  beam: number;
  yearBuilt: number;
}

export interface Port {
  id: string;
  code: string;
  name: string;
  country: string;
  unlocode: string;
  channelDepthMeters: number;
  tideRestriction: string;
  operatingHours: string;
}

export interface Zone {
  id: string;
  portId: string;
  portName: string;
  zoneCode: string;
  zoneName: string;
  type: 'BERTH' | 'ANCHORAGE' | 'STS' | 'INNER_ROAD' | 'OUTER_ROAD';
  maxDraftMeters: number;
  description: string;
}

export interface FixTariff {
  id: string;
  portId: string;
  portName: string;
  costCategory?: string;
  serviceCode: string;
  serviceName: string;
  calculationBasis: 'PER_GRT' | 'PER_DAY' | 'LUMP_SUM' | 'PER_HOUR' | 'PER_MOVE';
  /** PDF master-data field: Fixed / Variabel / Range. Optional for legacy records. */
  tariffType?: 'FIXED' | 'VARIABLE' | 'RANGE';
  currency: Currency;
  rate: number;
  minCharge: number;
  description: string;
}

export interface ExpensesItem {
  id: string;
  portId?: string;
  portName?: string;
  code: string;
  category:
    | 'PORT_EXPENSES'
    | 'CLEARANCE'
    | 'GENERAL_EXPENSES'
    | 'CREW_EXPENSES'
    | 'OWNER_MATTER'
    | 'AGENCY_FEE'
    | 'TAX_CONTINGENCY'
    | 'PORT_DUES'
    | 'PILOTAGE_TOWAGE'
    | 'BERTHING'
    | 'CREW_CHANGE'
    | 'IMMIGRATION_CUSTOMS'
    | 'LOGISTICS_SUPPLIES'
    | 'SUNDRY';
  name: string;
  unit?: string;
  defaultCurrency: Currency;
  standardCostBuy: number;
  standardCostSell: number;
  preferredVendor?: string;
  /** PDF master-data field: Fixed / Variabel / Qty_rate / Percentage / Range. Optional for legacy records. */
  calculationType?: 'FIXED' | 'VARIABLE' | 'QTY_RATE' | 'PERCENTAGE' | 'RANGE';
}

export interface DisbursementItem {
  id: string;
  expenseItemId: string;
  name: string;
  category: string;
  basis: string;
  quantity: number;
  unitBuyRate: number;
  unitSellRate: number;
  totalBuyRate: number;
  totalSellRate: number;
  currency: Currency;
  remarks?: string;
}

export interface CrewMember {
  id: string;
  name: string;
  passportNumber: string;
  seamanBook: string;
  rank: string;
  nationality: string;
  type: 'SIGN_ON' | 'SIGN_OFF';
  flightDetails?: string;
  hotelBooked?: boolean;
  transitCostUSD: number;
  immigrationStatus: 'PENDING' | 'CLEARED' | 'REJECTED';
}

export interface StatementOfFactItem {
  id: string;
  timestamp: string;
  event: string;
  remarks?: string;
}

export interface ActualCostItem {
  id: string;
  jobId: string;
  itemCode: string;
  description: string;
  category: string;
  vendorName: string;
  invoiceOrVoucherNo: string;
  date: string;
  quantity?: number;
  amount: number;
  currency: Currency;
  pdaAmountEstimated: number;
  varianceAmount: number; // actual - estimated
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'APPROVED_BY_FDA';
  attachmentName?: string;
  remarks?: string;
}

export interface APItem {
  id: string;
  jobId: string;
  voucherNo: string;
  vendorName: string;
  description: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  currency: Currency;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  paymentRef?: string;
  paidDate?: string;
}

export interface ARItem {
  id: string;
  jobId: string;
  referenceNo: string;
  principalName: string;
  description: string;
  requestedAmount: number;
  receivedAmount: number;
  currency: Currency;
  receivedDate?: string;
  bankAccount?: string;
  status: 'AWAITING_REMITTANCE' | 'RECEIVED' | 'OVERDUE';
}

export interface PrincipalReceipt {
  id: string;
  jobId: string;
  receivedDate: string;
  amount: number;
  currency: Currency;
  paymentType: 'ADVANCE_PAYMENT' | 'INVOICE';
  bankRemark: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
}

export interface JobCall {
  jobId: string; // e.g. "VC-2026-0098"
  vesselId: string;
  vesselName: string;
  portId: string;
  portName: string;
  customerId: string;
  customerName: string;
  currency: Currency;
  exchangeRateUSDToIDR: number; // e.g. 15800
  eta: string;
  etd: string;
  purposeOfCall: 'CARGO_DISCHARGE' | 'CARGO_LOADING' | 'BUNKERING' | 'CREW_CHANGE_ONLY' | 'REPAIR_MAINTENANCE';
  currentStage: JobStage;
  status: 'INQUIRY' | 'QUOTED' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
  
  // 1. Inquiry
  inquiry: {
    inquiryNo: string;
    date: string;
    etaRemarks?: string;
    etdRemarks?: string;
    quantity?: number;
    quantityUnit?: 'MATRIX_TON' | 'TON';
    cargoDetails: string;
    estimatedDays: number;
    specialRequirements: string;
    status: 'RECEIVED' | 'EVALUATED' | 'CONVERTED';
    createdBy: string;
    createdByName?: string;
    createdByUserId?: string;
    createdByBranch?: string;
    createdByBranchCode?: string;
  };

  // 2. Quotation
  quotation: {
    epda: {
      quoteNo: string;
      date: string;
      currency: Currency;
      items: DisbursementItem[];
      totalBuyRate: number;
      totalSellRate: number;
      marginAmount: number;
      marginPercentage: number;
      status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
    };
    pda: {
      quoteNo: string;
      date: string;
      currency: Currency;
      items: DisbursementItem[];
      totalBuyRate: number;
      totalSellRate: number;
      marginAmount: number;
      marginPercentage: number;
      status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
    };
    crewChange: {
      id: string;
      date: string;
      signOnCount: number;
      signOffCount: number;
      members: CrewMember[];
      logisticsCost: number;
      immigrationVisaCost: number;
      transportCost: number;
      totalCostUSD: number;
      totalCostIDR: number;
      status: 'PLANNED' | 'IN_TRANSIT' | 'COMPLETED';
    };
  };

  // 3. Manager Approval
  managerApproval: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    approvedBy?: string;
    approvedAt?: string;
    notes?: string;
    allowedMarginTolerancePct: number;
  };

  // 4. Operational Data
  operationalData: {
    ata?: string; // Actual Time of Arrival
    atb?: string; // Actual Time of Berthing
    atd?: string; // Actual Time of Departure
    pilotOnBoardTime?: string;
    pilotOffTime?: string;
    berthZoneName?: string;
    cargoQuantityMetricTons?: number;
    cargoCommodity?: string;
    harborMasterClearanceNo?: string;
    statementOfFacts: StatementOfFactItem[];
  };

  // 5. Actual Cost
  actualCosts: ActualCostItem[];

  // 6. FDA (Final Disbursement Account)
  fda: {
    fdaNo: string;
    date: string;
    currency?: Currency;
    totalEstimatedBuy: number;
    totalEstimatedSell: number;
    totalActualCost: number;
    finalBilledToPrincipal: number;
    varianceAmount: number;
    variancePercentage: number;
    fdaApproved: boolean;
    approvedBy?: string;
    approvedAt?: string;
    notes?: string;
    pdfFileName?: string;
    pdfDataUrl?: string;
  };

  // 7. AP (Accounts Payable)
  ap: APItem[];

  // 8. AR (Accounts Receivable)
  ar: ARItem[];
  principalReceipts?: PrincipalReceipt[];

  // 9. Principal Invoice
  principalInvoice: {
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    totalAmountUSD: number;
    totalAmountIDR: number;
    advanceDeductedUSD: number;
    advanceDeductedIDR: number;
    balanceDueUSD: number;
    balanceDueIDR: number;
    status: 'DRAFT' | 'ISSUED' | 'SETTLED';
    pdfGenerated: boolean;
  };

  // 10. Closing
  closing: {
    isClosed: boolean;
    closedAt?: string;
    closedBy?: string;
    finalGrossMarginUSD: number;
    finalGrossMarginIDR: number;
    postVoyageRemarks?: string;
  };

  createdAt: string;
  updatedAt: string;
}

export type ActiveTab =
  | 'DASHBOARD'
  | 'USERS'
  | 'CUSTOMERS'
  | 'VESSELS'
  | 'PORTS'
  | 'ZONES'
  | 'FIX_TARIFF'
  | 'EXPENSES_ITEM'
  | 'INQUIRIES'
  | 'QUOTES_EPDA'
  | 'QUOTES_EPDA_DETAIL'
  | 'QUOTES_PDA'
  | 'FDA_INQUIRIES'
  | 'FDA_QUOTES_EPDA'
  | 'FDA_QUOTES_PDA'
  | 'JOBS_ENTRY'
  | 'ACTIVE_VESSEL_CALLS'
  | 'FDA_JOB_ID'
  | 'QUOTES_VIEW'
  | 'APPROVAL'
  | 'ACTUAL_COST'
  | 'CREW_CHANGE'
  | 'FINANCE_DASHBOARD'
  | 'JOB_INVOICE_OPEN'
  | 'AP'
  | 'AR'
  | 'PRINCIPAL_INVOICE'
  | 'CLOSING';

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
