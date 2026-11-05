export type UserRole = 'ADMIN' | 'SALES' | 'MANAGER_OPS' | 'FDA' | 'FINANCE' | 'ACCOUNTING' | 'DIRECTOR';

export type Currency = 'USD' | 'IDR';

export interface Branch {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId?: string;
  actorName: string;
  role?: UserRole;
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
  branchId?: string;
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
  serviceName: string;
  grtMin?: number;
  grtMax?: number;
  dwt?: number;
  calculationBasis: 'PER_GRT' | 'PER_DAY' | 'LUMP_SUM' | 'PER_HOUR' | 'PER_MOVE';
  tariffType?: 'FIXED' | 'VARIABLE' | 'QTY_CARGO';
  rateIDR?: number;
  rateUSD?: number;
  remarks?: string;
}

export interface VendorPartner {
  id: string;
  vendorName: string;
  picName: string;
  address: string;
  phone: string;
  bankName: string;
  paidName: string;
  accountNumber: string;
}

export interface BankAccount {
  id: string;
  coaId?: string;
  bankName: string;
  branch?: string;
  branchName?: string;
  branchId?: string;
  accountName: string;
  accountNumber: string;
  currency?: Currency;
}

export interface ChartOfAccount {
  id: string;
  code: string;
  accountDesc: string;
  accountGroup: string;
  isActive: boolean;
}

export interface FinanceJournalLine {
  id: string;
  coaId: string;
  memo: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
}

export type AccountingSourceType = 'PAYABLE' | 'RECEIVABLE' | 'HISTORICAL';
export type AccountingJournalStatus = 'PENDING' | 'DRAFT' | 'POSTED';

export interface AccountingPayableSourceItem {
  itemService: string;
  jobNumber: string;
  documentType: string;
  documentNumber: string;
  customerName: string;
  amount: number;
  vatAmount: number;
  total: number;
  pphRate?: number;
  pph23Amount: number;
  paidAmount: number;
  currency: Currency;
}

export interface AccountingSourceDetails {
  items?: AccountingPayableSourceItem[];
  surcharge?: number;
  otherExpenses?: number;
  paymentDescription?: string;
  paymentTotal?: number;
  remittanceBankName?: string;
  remittanceAccountName?: string;
  remittanceAccountNumber?: string;
  destinationAccountName?: string;
  beneficiaryAccountName?: string;
  beneficiaryBankName?: string;
  beneficiaryAccountNumber?: string;
  currency?: Currency;
  subjectData?: 'OPERATIONAL' | 'PRINCIPAL';
  jobId?: string;
  paymentType?: string;
  invoiceType?: string;
  invoiceNo?: string;
  principalName?: string;
  vesselName?: string;
  pph23AmountIDR?: number;
  idrAmount?: number;
  usdAmount?: number;
  exchangeRateUSDToIDR?: number;
  remark?: string;
}

export interface AccountingInboxItem {
  sourceType: AccountingSourceType;
  sourceKey: string;
  sourceId: string;
  branchId: string;
  branchName: string;
  date: string;
  arApNumber: string;
  referenceNo: string;
  requestNo: string;
  counterparty: string;
  description: string;
  bankName: string;
  accountNumber: string;
  bankCoaId?: string;
  currency: Currency;
  amount: number;
  exchangeRate: number;
  amountIdr: number;
  sourceDetails?: AccountingSourceDetails;
  accountingStatus: AccountingJournalStatus;
  journalId?: string | null;
  journalNumber?: string | null;
  journalDate?: string | null;
  journalDescription?: string | null;
  journalLines: FinanceJournalLine[];
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  postedBy?: string | null;
  postedAt?: string | null;
}

export interface AccountingAsset {
  id: string;
  assetCode: string;
  assetName: string;
  category: string | null;
  acquisitionDate: string | null;
  acquisitionCost: number;
  usefulLifeMonths: number;
  residualValue: number;
  location: string | null;
  branchId: string;
  branchName: string;
  status: 'Aktif' | 'Dijual' | 'Dihapuskan';
  coaAssetId: string | null;
  coaDepreciationId: string | null;
  monthlyDepreciation: number;
}

export interface AccountingPostedJournalRow {
  journalId: string;
  journalLineId: string;
  coaId: string;
  branchCode?: string;
  branchName?: string;
  journalNumber: string;
  journalDate: string;
  arApNumber: string;
  appliedDate: string;
  shipment: string;
  customer: string;
  jobVessel: string;
  refNoFda: string;
  bl: string;
  currency: string;
  exchangeRate: number;
  item: string;
  vendor: string;
  description: string;
  coa: string;
  accountName: string;
  direction: 'D' | 'K';
  amount: number;
}

export interface AccountingFinancialReportLine {
  code: string;
  accountName: string;
  accountGroup: string;
  amount: number;
}

export interface AccountingReportBranch {
  id: string;
  code: string;
  name: string;
}

export interface AccountingBalanceSheetResponse {
  report: AccountingBalanceSheetReport;
  branches: AccountingReportBranch[];
}

export interface AccountingProfitLossResponse {
  report: AccountingProfitLossReport;
  branches: AccountingReportBranch[];
}

export interface AccountingMonthlyProfitLossResponse {
  reports: AccountingProfitLossReport[];
  branches: AccountingReportBranch[];
}

export interface AccountingBalanceSheetReport {
  asOf: string;
  assets: AccountingFinancialReportLine[];
  liabilities: AccountingFinancialReportLine[];
  equity: AccountingFinancialReportLine[];
  currentEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  difference: number;
}

export interface AccountingProfitLossReport {
  startDate: string;
  endDate: string;
  revenue: AccountingFinancialReportLine[];
  expenses: AccountingFinancialReportLine[];
  otherIncome: AccountingFinancialReportLine[];
  otherExpenses: AccountingFinancialReportLine[];
  totalRevenue: number;
  totalExpenses: number;
  totalOtherIncome: number;
  totalOtherExpenses: number;
  netIncome: number;
}

export interface CashBalanceAdjustment {
  id: string;
  bankAccountId: string;
  branchName?: string;
  branchId?: string;
  bankName: string;
  accountNumber: string;
  currency: Currency;
  amount: number;
  effectiveDate: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export type NewsContentType = 'TEXT' | 'IMAGE' | 'LINK';

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  contentType: NewsContentType;
  targetUrl: string | null;
  imageMime: string | null;
  imageDataBase64: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentVoucherItem {
  id: string;
  jobNumber: string;
  documentType?: 'FDA' | 'FPDA';
  documentNumber?: string;
  customerName: string;
  itemService: string;
  category?: string;
  tariffType?: 'FIXED' | 'VARIABLE' | 'QTY_CARGO';
  price?: number;
  quantity?: number;
  unit?: string;
  remarks?: string;
  coaId?: string;
  amount: number;
  vatApplied: boolean;
  vatAmount: number;
  total: number;
  pph23Applied: boolean;
  pphRate?: number;
  pph23Amount: number;
  paidAmount: number;
}

export type PaymentVoucherStatus = 'PENDING_MANAGER' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface PaymentVoucherPaymentRecord {
  voucherNumber: string;
  journalNumber?: string;
  paidBy: string;
  paidAt: string;
  paidFromBankAccountId?: string;
  bankName: string;
  accountNumber: string;
  paymentSurcharge?: number;
  paymentSurchargeCoaId?: string;
  paymentOtherExpenses?: number;
  paymentOtherExpensesCoaId?: string;
  paymentDescription?: string;
  paymentTotalAmount?: number;
  paymentProofDataUrl?: string;
  paymentJournalLines?: FinanceJournalLine[];
}

export interface PaymentVoucher {
  id: string;
  branchName?: string;
  branchId?: string;
  voucherNumber?: string;
  journalNumber?: string;
  requestNumber: string;
  requestDate: string;
  currency?: Currency;
  exchangeRateUSDToIDR?: number;
  exchangeRateDate?: string;
  paidFromBankAccountId?: string;
  requestedPaymentDate: string;
  jobInfo: 'OPERASIONAL' | 'JOB_VESSEL';
  requestBy: string;
  requestByUserId?: string;
  vendorPartnerId: string;
  vendorName: string;
  paidTo: string;
  bankName: string;
  accountNumber: string;
  items: PaymentVoucherItem[];
  totalPaidAmount: number;
  status?: PaymentVoucherStatus;
  approvalTargetRole?: Extract<UserRole, 'MANAGER_OPS' | 'DIRECTOR'>;
  approvalTargetUserId?: string;
  approvalTargetName?: string;
  managerNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  paidBy?: string;
  paidAt?: string;
  paymentSurcharge?: number;
  paymentSurchargeCoaId?: string;
  paymentOtherExpenses?: number;
  paymentOtherExpensesCoaId?: string;
  paymentDescription?: string;
  paymentTotalAmount?: number;
  paymentProofDataUrl?: string;
  paymentJournalLines?: FinanceJournalLine[];
  paymentHistory?: PaymentVoucherPaymentRecord[];
  createdAt: string;
}

export interface ExpensesItem {
  id: string;
  portId?: string;
  portName?: string;
  code: string;
  category:
    | 'PORT_SERVICE'
    | 'PORT_EXPENSES'
    | 'CLEARANCE'
    | 'GENERAL_EXPENSES'
    | 'CREW_EXPENSES'
    | 'OWNER_MATTER'
    | 'AGENCY_FEE';
  name: string;
  rateIDR?: number;
  rateUSD?: number;
  calculationType?: 'FIXED' | 'VARIABLE' | 'QTY_CARGO';
  remarks?: string;
}

export interface DisbursementItem {
  id: string;
  expenseItemId: string;
  name: string;
  category: string;
  basis: string;
  quantity: number;
  amount: number;
  currency: Currency;
  tariffType?: 'FIXED' | 'VARIABLE' | 'QTY_CARGO';
  calculationBasis?: 'PER_GRT' | 'PER_DAY' | 'LUMP_SUM' | 'PER_HOUR' | 'PER_MOVE';
  tariffRate?: number;
  remarks?: string;
  vatApplied?: boolean;
  pph23Applied?: boolean;
}

export interface FdaItem {
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
  tariffType?: 'FIXED' | 'VARIABLE' | 'QTY_CARGO';
  estimatedAmount: number;
  calculationBasis?: 'PER_GRT' | 'PER_DAY' | 'LUMP_SUM' | 'PER_HOUR' | 'PER_MOVE';
  tariffRate?: number;
  tariffDescription?: string;
  varianceAmount: number;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'APPROVED_BY_FDA';
  attachmentName?: string;
  attachmentDataUrl?: string;
  remarks?: string;
  vatApplied?: boolean;
  pph23Applied?: boolean;
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
  exchangeRateUSDToIDR?: number;
  refundAmount?: number;
  refundExchangeRateUSDToIDR?: number;
  refundDate?: string;
  refundBankReference?: string;
  refundStatus?: 'NONE' | 'PENDING' | 'PAID';
  paymentType: 'ADVANCE_PAYMENT' | 'INVOICE';
  invoiceType?: 'FDA' | 'FPDA';
  bankRemark: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
}

export type ReceivableInvoiceType = 'FDA' | 'FPDA';
export type ReceivableSubjectData = 'OPERATIONAL' | 'PRINCIPAL';
export type ReceivablePaymentType = 'ADVANCE_PAYMENT' | 'INVOICE';

export interface ReceivableInvoiceOption {
  jobId: string;
  invoiceType: ReceivableInvoiceType;
  invoiceNo: string;
  principalName: string;
  vesselName: string;
  currency: Currency;
  exchangeRate: number;
  fdaApproved?: boolean;
}

export interface AccountsReceivableEntry {
  id: string;
  receiptNumber?: string;
  journalNumber?: string;
  branchName?: string;
  branchId?: string;
  subjectData: ReceivableSubjectData;
  jobId: string | null;
  invoiceType: ReceivableInvoiceType | null;
  paymentType: ReceivablePaymentType | null;
  invoiceAllocationStatus: 'AUTO' | 'MANUAL_REQUIRED' | 'APPLIED' | null;
  invoiceNo: string | null;
  incomeDate: string;
  principalName: string | null;
  vesselName: string | null;
  pph23AmountIDR: number;
  coaId?: string;
  journalLines?: FinanceJournalLine[];
  remark: string;
  bankAccountId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  idrAmount: number;
  usdAmount: number;
  exchangeRateUSDToIDR: number;
  attachmentName: string;
  createdBy: string;
  createdAt: string;
}

export interface FdaReceivableEntry {
  id: string;
  jobId: string;
  invoiceType: ReceivableInvoiceType;
  paymentType: ReceivablePaymentType;
  invoiceNo: string;
  incomeDate: string;
  principalName: string;
  vesselName: string;
  remark: string;
  bankName: string;
  idrAmount: number;
  usdAmount: number;
  exchangeRateUSDToIDR: number;
  createdBy: string;
  createdAt: string;
}

export type PurposeOfCall =
  | 'CARGO_DISCHARGE'
  | 'CARGO_LOADING'
  | 'CARGO_OPERATIONS'
  | 'SHIP_SERVICES_SUPPLIES'
  | 'CREW_PASSENGER_OPERATIONS'
  | 'TECHNICAL_EMERGENCY'
  | 'PORT_SERVICE'
  | 'HUSBANDRY_SERVICES'
  | 'VESSEL_SUPPLIES'
  | 'MAINTENANCE_WASTE_MANAGEMENT'
  | 'ADMINISTRATIVE_SERVICES'
  | 'BUNKERING'
  | 'CREW_CHANGE_ONLY'
  | 'REPAIR_MAINTENANCE';

export const PURPOSE_OF_CALL_LABELS: Record<PurposeOfCall, string> = {
  CARGO_DISCHARGE: 'Bongkar Muatan (Discharge)',
  CARGO_LOADING: 'Muat Kargo (Loading)',
  CARGO_OPERATIONS: 'Cargo Operations',
  SHIP_SERVICES_SUPPLIES: 'Ship Services & Supplies',
  CREW_PASSENGER_OPERATIONS: 'Crew & Passenger Operations',
  TECHNICAL_EMERGENCY: 'Technical & Emergency',
  PORT_SERVICE: 'Port service',
  HUSBANDRY_SERVICES: 'Husbandry Services',
  VESSEL_SUPPLIES: 'Vessel Supplies',
  MAINTENANCE_WASTE_MANAGEMENT: 'Maintenance & Waste Management',
  ADMINISTRATIVE_SERVICES: 'Administrative Services',
  BUNKERING: 'Bunkering BBM / Air Tawar',
  CREW_CHANGE_ONLY: 'Crew Change Only',
  REPAIR_MAINTENANCE: 'Perbaikan / Docking',
};

export const PURPOSE_OF_CALL_OPTIONS = Object.entries(PURPOSE_OF_CALL_LABELS)
  .filter(([value]) => value !== 'CREW_CHANGE_ONLY')
  .map(([value, label]) => ({ value: value as PurposeOfCall, label }));

export const formatPurposeOfCall = (value?: string) => value
  ? PURPOSE_OF_CALL_LABELS[value as PurposeOfCall] || value.replace(/_/g, ' ')
  : '-';

export interface JobCall {
  jobId: string; // e.g. "VC-JKT-2026-0001"
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
  purposeOfCall: PurposeOfCall;
  currentStage: JobStage;
  status: 'INQUIRY' | 'QUOTED' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
  
  // 1. Inquiry
  inquiry: {
    inquiryNo: string;
    date: string;
    eta?: string;
    etd?: string;
    etaRemarks?: string;
    etdRemarks?: string;
    cargoQuantity?: number;
    quantityUnit?: 'MT' | 'TON';
    cargoDetails: string;
    estimatedDays: number;
    specialRequirements: string;
    status: 'RECEIVED' | 'EVALUATED' | 'CONVERTED';
    createdBy: string;
    createdByName?: string;
    createdByUserId?: string;
    createdByBranch?: string;
    createdByBranchId?: string;
  };

  // 2. Quotation
  quotation: {
    epda: {
      quoteNo: string;
      date: string;
      eta?: string;
      etd?: string;
      etaRemarks?: string;
      etdRemarks?: string;
      currency: Currency;
      exchangeRateUSDToIDR?: number;
      pph23Applied?: boolean;
      globalVatApplied?: boolean;
      discountAmount?: number;
      items: DisbursementItem[];
      totalAmount: number;
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
  };

  // 4. Operational Data
  operationalData: {
    ata?: string; // Actual Time of Arrival
    atb?: string; // Actual Time of Berthing
    atd?: string; // Actual Time of Departure
    berthZoneName?: string;
    statementOfFacts: StatementOfFactItem[];
  };

  fdaItems?: FdaItem[];

  // 5. FDA (Final Disbursement Account)
  fda: {
    fdaNo: string;
    date: string;
    eta?: string;
    etd?: string;
    etaRemarks?: string;
    etdRemarks?: string;
    currency?: Currency;
    exchangeRateUSDToIDR?: number;
    pph23Applied?: boolean;
    globalVatApplied?: boolean;
    discountAmount?: number;
    finalBilledToPrincipal: number;
    fdaApproved: boolean;
    advancePaymentAtApproval?: number;
    approvalStatus?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
    submittedBy?: string;
    submittedAt?: string;
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
    postVoyageRemarks?: string;
  };

  createdAt: string;
  updatedAt: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

export type ActiveTab =
  | 'DASHBOARD'
  | 'NEWS'
  | 'ACCOUNTING_DASHBOARD'
  | 'ACCOUNTING_WORKSPACE'
  | 'ACCOUNTING_ASSETS'
  | 'ACCOUNTING_POSTED_JOURNAL_REPORT'
  | 'ACCOUNTING_FINANCE_HISTORY'
  | 'ACCOUNTING_BALANCE_SHEET'
  | 'ACCOUNTING_PROFIT_LOSS'
  | 'ACCOUNTING_PROFIT_DETAIL'
  | 'DIRECTOR_DASHBOARD'
  | 'DIRECTOR_ASSETS'
  | 'DIRECTOR_BALANCE_SHEET'
  | 'DIRECTOR_PROFIT_LOSS'
  | 'DIRECTOR_PROFIT_DETAIL'
  | 'DIRECTOR_VOUCHER_APPROVAL'
  | 'DIRECTOR_JOB_INVOICE_MONITORING'
  | 'DIRECTOR_VESSEL_CALLS'
  | 'DIRECTOR_ACTIVITY_LOG'
  | 'USERS'
  | 'CUSTOMERS'
  | 'VESSELS'
  | 'PORTS'
  | 'ZONES'
  | 'FIX_TARIFF'
  | 'EXPENSES_ITEM'
  | 'VENDOR_PARTNERS'
  | 'BANK_ACCOUNT'
  | 'CHART_OF_ACCOUNTS'
  | 'CASH_BALANCE_ADJUSTMENTS'
  | 'INQUIRIES'
  | 'QUOTES_EPDA'
  | 'QUOTES_EPDA_DETAIL'
  | 'PDA_CREW_DETAIL'
  | 'FDA_INQUIRIES'
  | 'FDA_QUOTES_EPDA'
  | 'FDA_AMOUNT'
  | 'FDA_PDA_DETAIL'
  | 'FDA_CREATE_VOUCHER'
  | 'FDA_PAYMENT_HISTORY'
  | 'FDA_EDIT_VOUCHER'
  | 'MANAGER_VOUCHER_APPROVAL'
  | 'MANAGEMENT_VESSEL'
  | 'MANAGER_JOB_INVOICE_MONITORING'
  | 'JOBS_ENTRY'
  | 'ACTIVE_VESSEL_CALLS'
  | 'FDA_JOB_ID'
  | 'QUOTES_VIEW'
  | 'APPROVAL'
  | 'CREW_CHANGE'
  | 'FINANCE_DASHBOARD'
  | 'FINANCE_CASH_BALANCE'
  | 'FINANCE_RECAP'
  | 'JOB_INVOICE_OPEN'
  | 'AP'
  | 'FINANCE_ACCOUNTS_PAYABLE'
  | 'FINANCE_ACCOUNTS_PAYABLE_INPUT'
  | 'FINANCE_ACCOUNTS_PAYABLE_HISTORY'
  | 'FINANCE_CREATE_VOUCHER'
  | 'FINANCE_EDIT_VOUCHER'
  | 'FINANCE_PAYMENT_HISTORY'
  | 'FINANCE_HISTORY_REPORT'
  | 'FINANCE_RECEIVABLE_INPUT'
  | 'FINANCE_RECEIVABLE_HISTORY'
  | 'AR'
  | 'PRINCIPAL_INVOICE'
  | 'CLOSING';

export interface DatabaseState {
  branches: Branch[];
  users: User[];
  customers: Customer[];
  vessels: Vessel[];
  ports: Port[];
  zones: Zone[];
  fixTariffs: FixTariff[];
  expensesItems: ExpensesItem[];
  vendorPartners: VendorPartner[];
  bankAccounts: BankAccount[];
  chartOfAccounts: ChartOfAccount[];
  cashBalanceAdjustments: CashBalanceAdjustment[];
  paymentVouchers: PaymentVoucher[];
  jobCalls: JobCall[];
  currentRole: UserRole;
  selectedJobId: string;
  auditLogs: AuditLog[];
}
