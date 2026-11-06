import React, { useState, useEffect } from 'react';
import { db } from './db/storage';
import { DatabaseState, UserRole, ActiveTab, JobCall, PaymentVoucher, User } from './types';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ActiveVesselCallsView } from './components/vessel/ActiveVesselCallsView';
import { AdminMasterDataView } from './components/admin/AdminMasterDataView';
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { AdminNewsView } from './components/admin/AdminNewsView';
import { SalesDashboardView } from './components/sales/SalesDashboardView';
import { InquiriesView } from './components/sales/InquiriesView';
import { QuotesListView } from './components/sales/QuotesListView';
import { QuotesEPDAView } from './components/sales/QuotesEPDAView';
import { CrewPDAView } from './components/sales/CrewPDAView';
import { JobsEntryView } from './components/sales/JobsEntryView';
import { ManagerOpsView } from './components/manager/ManagerOpsView';
import { ManagementVesselView } from './components/manager/ManagementVesselView';
import { JobInvoiceMonitoringView } from './components/manager/JobInvoiceMonitoringView';
import { FDAView } from './components/fda/FDAView';
import { PaymentVoucherView } from './components/fda/PaymentVoucherView';
import { VoucherApprovalView } from './components/manager/VoucherApprovalView';
import { VoucherHistoryView } from './components/fda/VoucherHistoryView';
import { EditVoucherView } from './components/fda/EditVoucherView';
import { FinanceView } from './components/finance/FinanceView';
import { AccountsReceivableView } from './components/finance/AccountsReceivableView';
import { AccountsPayableView } from './components/finance/AccountsPayableView';
import { FinancialHistoryView } from './components/finance/FinancialHistoryView';
import { FinanceRecapView } from './components/finance/FinanceRecapView';
import { CashBalanceView } from './components/finance/CashBalanceView';
import { AccountingWorkspace } from './components/accounting/AccountingWorkspace';
import { AccountingAssetsView } from './components/accounting/AccountingAssetsView';
import { AccountingPostedJournalReport } from './components/accounting/AccountingPostedJournalReport';
import { AccountingFinanceHistory } from './components/accounting/AccountingFinanceHistory';
import { AccountingBalanceSheetView, AccountingProfitDetailView, AccountingProfitLossView } from './components/accounting/AccountingFinancialReports';
import { AccountingDashboard } from './components/accounting/AccountingDashboard';
import { DirectorActivityLogView } from './components/director/DirectorActivityLogView';
import { HrWorkspaceView } from './components/hr/HrWorkspaceView';
import { AuthAccount } from './auth';
import { LoginView } from './components/auth/LoginView';
import { apiAuth } from './lib/api';
import { getBranchByValue } from './branches';

const syncCurrentUserFromMaster = (account: AuthAccount | null): AuthAccount | null => {
  if (!account) return null;
  if (apiAuth.enabled) return {
    ...account,
    branch: account.branch || '',
    branchId: account.branchId || getBranchByValue(account.branch)?.id,
  };

  const dbUser = db.getState().users.find((user) => user.id === account.id || user.username === account.username || user.name === account.name);

  if (!dbUser) return account;

  const merged: AuthAccount = {
    ...account,
    ...(dbUser || {}),
    username: dbUser.username || account.username,
    branch: dbUser.branch || account.branch || 'Head Office',
    branchId: dbUser.branchId || getBranchByValue(dbUser.branch || account.branch)?.id,
    role: dbUser.role || account.role || 'ADMIN',
    department: dbUser.department || account.department,
    position: dbUser.position || account.position,
    status: dbUser.status || account.status,
  };

  return merged;
};

const getDefaultTabForRole = (role: UserRole): ActiveTab => {
  switch (role) {
    case 'FINANCE':
      return 'FINANCE_DASHBOARD';
    case 'ACCOUNTING':
      return 'ACCOUNTING_DASHBOARD';
    case 'DIRECTOR':
      return 'DIRECTOR_DASHBOARD';
    case 'HR_ADMINISTRASI':
      return 'HR_WORKSPACE';
    case 'PEKERJA':
      return 'WORKER_WORKSPACE';
    case 'ADMIN':
    case 'SALES':
    case 'MANAGER_OPS':
    case 'FDA':
    default:
      return 'DASHBOARD';
  }
};

let resetJobsPromise: Promise<void> | null = null;

const branchKey = (branch?: string) => (branch || '').trim().toLocaleLowerCase();

export default function App() {
  const [data, setData] = useState<DatabaseState>(db.getState());
  const [currentRole, setCurrentRole] = useState<UserRole>('ADMIN');
  const [authReady, setAuthReady] = useState(!apiAuth.enabled);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthAccount | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD');
  const [viewSessionKey, setViewSessionKey] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string>(
    data.jobCalls[0]?.jobId || ''
  );
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loginToast, setLoginToast] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => { const fn = () => setShowProfileModal(true); window.addEventListener('lgm:open-profile', fn); return () => window.removeEventListener('lgm:open-profile', fn); }, []);

  useEffect(() => {
    const closeMobileNav = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', closeMobileNav);
    return () => document.removeEventListener('keydown', closeMobileNav);
  }, []);

  useEffect(() => {
    if (!databaseReady || !loginToast) return;
    const timeout = window.setTimeout(() => setLoginToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [databaseReady, loginToast]);

  useEffect(() => {
    const stopEnterNavigation = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = !!target && (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      );
      const isEnter = event.key === 'Enter' || event.key === 'NumpadEnter';

      if (isEnter && isEditable) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('keydown', stopEnterNavigation, true);
    document.addEventListener('keypress', stopEnterNavigation, true);
    return () => {
      document.removeEventListener('keydown', stopEnterNavigation, true);
      document.removeEventListener('keypress', stopEnterNavigation, true);
    };
  }, []);

  const notifySaved = (returnToTab?: ActiveTab) => {
    if (returnToTab) setActiveTab(returnToTab);
    setSaveToast('Perubahan data berhasil disimpan');
    window.setTimeout(() => setSaveToast(null), 2600);
  };

  const handleLogin = (account: AuthAccount) => {
    const freshAccount = syncCurrentUserFromMaster(account);
    if (!freshAccount) return;
    setCurrentUser(freshAccount);
    setCurrentRole(freshAccount.role);
    setViewSessionKey((key) => key + 1);
    db.setActor({ id: freshAccount.id, name: freshAccount.name, role: freshAccount.role, branch: freshAccount.branch, branchId: freshAccount.branchId });
    db.setRole(freshAccount.role);
    setLoginToast(`Selamat datang, ${freshAccount.name}!`);
    setActiveTab(getDefaultTabForRole(freshAccount.role));
  };

  const handleProfile = () => {
    window.dispatchEvent(new CustomEvent('lgm:open-profile'));
  };

  const handleChangePassword = async (oldPassword: string, newPassword: string) => {
    if (!currentUser) return;
    await apiAuth.changePassword(oldPassword, newPassword);
  };

  const handleLogout = async () => {
    if (apiAuth.enabled) {
      try {
        await apiAuth.logout();
      } catch (error) {
        console.error('API logout failed:', error);
      }
    }
    setCurrentUser(null);
    setLoginToast(null);
  };

  useEffect(() => {
    if (!apiAuth.enabled) return;
    let cancelled = false;
    void apiAuth.me()
      .then((account) => {
        if (cancelled) return;
        if (account) {
          const freshAccount = syncCurrentUserFromMaster(account);
          setCurrentUser(freshAccount);
          setCurrentRole(freshAccount.role);
          db.setActor({ id: freshAccount.id, name: freshAccount.name, role: freshAccount.role, branch: freshAccount.branch, branchId: freshAccount.branchId });
          setActiveTab(getDefaultTabForRole(freshAccount.role));
        }
      })
      .catch((error) => console.error('API session restore failed:', error))
      .finally(() => { if (!cancelled) setAuthReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!apiAuth.enabled || !currentUser) return;
    if (currentUser.role === 'HR_ADMINISTRASI' || currentUser.role === 'PEKERJA') return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void db.refreshRemote().catch((error) => console.error('API refresh failed:', error));
    };
    const intervalId = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(intervalId);
  }, [currentUser]);

  useEffect(() => {
    const handleApiSaveError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setSaveToast(`Database gagal menyimpan perubahan: ${message}`);
      window.setTimeout(() => setSaveToast(null), 15000);
    };
    window.addEventListener('lgm:api-save-error', handleApiSaveError);
    return () => window.removeEventListener('lgm:api-save-error', handleApiSaveError);
  }, []);

  // Subscribe to reactive database changes
  useEffect(() => {
    if (apiAuth.enabled && !currentUser) {
      setDatabaseReady(false);
      return;
    }
    setDatabaseReady(false);
    setDatabaseError(null);
    if (currentUser) db.setActor({ id: currentUser.id, name: currentUser.name, role: currentUser.role, branch: currentUser.branch, branchId: currentUser.branchId });
    let unsubscribe = () => {};
    if (currentUser?.role === 'HR_ADMINISTRASI' || currentUser?.role === 'PEKERJA') {
      setSelectedJobId('');
      setData({
        branches: [],
        users: [],
        customers: [],
        vessels: [],
        ports: [],
        zones: [],
        fixTariffs: [],
        expensesItems: [],
        vendorPartners: [],
        bankAccounts: [],
        chartOfAccounts: [],
        cashBalanceAdjustments: [],
        paymentVouchers: [],
        jobCalls: [],
        currentRole: currentUser.role,
        selectedJobId: '',
        auditLogs: [],
      });
      setDatabaseReady(true);
      setDatabaseError(null);
      return () => unsubscribe();
    }
    void (async () => {
      try {
        const resetJobs = new URLSearchParams(window.location.search).get('resetJobs') === '1';
        if (resetJobs && currentUser?.role === 'ADMIN' && !resetJobsPromise) {
          window.history.replaceState({}, document.title, window.location.pathname);
          resetJobsPromise = (async () => {
            await db.hydrate();
            await db.clearAllJobs();
          })();
        }
        await resetJobsPromise;
        await db.hydrate();
        setData({ ...db.getState() });
        setDatabaseReady(true);
        setDatabaseError(null);
      } catch (error) {
        console.error('Local database hydrate failed:', error);
        setDatabaseReady(false);
        if (apiAuth.enabled) {
          const message = error instanceof Error ? error.message : 'Database initialization failed';
          setDatabaseError(message);
          setSaveToast(`Database gagal memuat/menyimpan data: ${message}`);
          window.setTimeout(() => setSaveToast(null), 10000);
        }
      }
    })();
    unsubscribe = db.subscribe((newState) => {
      setData({ ...newState });
    });
    return () => unsubscribe();
  }, [currentUser]);

  // When changing role, adapt active tab to sensible default for that role
  const handleRoleChange = (newRole: UserRole) => {
    setCurrentRole(newRole);
    const matchingUser = db.getState().users.find((user) => user.role === newRole);
    if (matchingUser) {
      const refreshed = syncCurrentUserFromMaster({ ...matchingUser, username: matchingUser.username || '' });
      setCurrentUser(refreshed);
      if (refreshed) db.setActor({ id: refreshed.id, name: refreshed.name, role: refreshed.role, branch: refreshed.branch, branchId: refreshed.branchId });
    }
    setActiveTab(getDefaultTabForRole(newRole));
  };

  const currentBranchKey = branchKey(currentUser?.branch);
  const jobBranch = (job: JobCall) => job.inquiry?.createdByBranch
    || data.users.find((user) => user.id === job.inquiry?.createdByUserId)?.branch
    || '';
  const currentBranchId = currentUser?.branchId || data.branches.find((branch) => branchKey(branch.code) === currentBranchKey)?.id;
  const branchJobCalls = data.jobCalls.filter((job) =>
    currentBranchId && job.inquiry?.createdByBranchId
      ? job.inquiry.createdByBranchId === currentBranchId
      : branchKey(jobBranch(job)) === currentBranchKey,
  );
  const roleVisibleJobCalls = currentUser?.role === 'SALES'
    ? branchJobCalls
    : currentUser?.role === 'FDA'
      ? branchJobCalls.filter((job) => job.managerApproval?.status === 'APPROVED')
      : currentUser?.role === 'MANAGER_OPS' || currentUser?.role === 'FINANCE'
        ? branchJobCalls
        : data.jobCalls;
  const branchPaymentVouchers = (data.paymentVouchers || []).filter((voucher) => {
    const voucherBranch = voucher.branchName || data.users.find((user) => user.id === voucher.requestByUserId)?.branch;
    return currentBranchId && voucher.branchId
      ? voucher.branchId === currentBranchId
      : branchKey(voucherBranch) === currentBranchKey;
  });
  const financeVoucherApprovers = data.users.filter((user: User) =>
    user.status === 'ACTIVE' && (
      user.role === 'DIRECTOR' ||
      (user.role === 'MANAGER_OPS' && (
        currentBranchId && user.branchId
          ? user.branchId === currentBranchId
          : branchKey(user.branch) === currentBranchKey
      ))
    ),
  );
  const branchBankAccounts = (data.bankAccounts || []).filter((account) =>
    currentBranchId && account.branchId
      ? account.branchId === currentBranchId
      : branchKey(account.branchName) === currentBranchKey,
  );

  const currentJob: JobCall =
    roleVisibleJobCalls.find((j) => j.jobId === selectedJobId) ||
    roleVisibleJobCalls[0] ||
    ({} as JobCall);
  const currentUserPaymentVouchers = (data.paymentVouchers || []).filter((voucher: PaymentVoucher) =>
    voucher.requestByUserId
      ? voucher.requestByUserId === currentUser?.id
      : voucher.requestBy.trim().toLocaleLowerCase() === currentUser?.name.trim().toLocaleLowerCase(),
  );

  if (!authReady) return <div className="lgm-splash"><div className="lgm-splash-inner"><div className="lgm-spinner" /><span>Memeriksa sesi...</span></div></div>;
  if (!currentUser) return <LoginView onLogin={handleLogin} />;
  if (!databaseReady) return <div className="lgm-splash"><div className="lgm-splash-inner">{!databaseError && <div className="lgm-spinner" />}{databaseError ? <div role="alert" className="lgm-splash-error">Database XAMPP gagal dimuat: {databaseError}</div> : <span>Memuat database XAMPP...</span>}</div></div>;

  return (
    <div className="maritim-app flex flex-col font-sans">
      {loginToast && (
        <div role="status" className="fixed right-5 top-5 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-lg shadow-emerald-900/10">
          {loginToast}
        </div>
      )}

      {saveToast && (
        <div role="status" className="fixed right-5 top-20 z-50 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-lg shadow-blue-900/10">
          {saveToast}
        </div>
      )}

      {/* Top Main Navigation Header */}
      <Header
        currentRole={currentRole}
        selectedJobId={currentRole === 'FDA' ? currentJob.jobId || '' : selectedJobId}
        onJobSelect={setSelectedJobId}
        jobCalls={roleVisibleJobCalls}
        paymentVouchers={data.paymentVouchers || []}
        currentUser={currentUser}
        onLogout={handleLogout}
        onProfile={handleProfile}
        onChangePassword={handleChangePassword}
        onNavigate={setActiveTab}
        onMenuToggle={() => setMobileNavOpen((isOpen) => !isOpen)}
      />

      {/* Main Workspace Layout */}
      <div className="maritim-layout">
        {/* Role-adaptive Sidebar */}
        {mobileNavOpen && (
          <button
            type="button"
            className="maritim-mobile-nav-overlay"
            aria-label="Tutup menu navigasi"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <Sidebar
          currentRole={currentRole}
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setMobileNavOpen(false);
          }}
          selectedJobId={selectedJobId}
          mobileOpen={mobileNavOpen}
        />

        {/* Content Area */}
        <main className="maritim-main">
          <div
            className={`maritim-content${currentRole === 'MANAGER_OPS' || currentRole === 'DIRECTOR' ? ' manager-director-workspace' : ''}${currentRole === 'FINANCE' ? ' finance-workspace' : ''}${currentRole === 'FDA' ? ' fda-workspace' : ''}${currentRole === 'HR_ADMINISTRASI' ? ' hr-workspace' : ''}${currentRole === 'PEKERJA' ? ' worker-workspace' : ''}`}
            key={viewSessionKey}
          >
            {/* 1. ADMIN DASHBOARD */}
            {(currentRole === 'HR_ADMINISTRASI' && ['HR_WORKSPACE', 'HR_ATTENDANCE', 'HR_LEAVE_APPROVAL'].includes(activeTab)
              || currentRole === 'PEKERJA' && ['WORKER_WORKSPACE', 'WORKER_ATTENDANCE', 'WORKER_LEAVE_REQUEST', 'WORKER_DOWNLOAD_PAYSLIP', 'WORKER_DOWNLOAD_ATTENDANCE'].includes(activeTab)) && (
              <HrWorkspaceView
                currentUser={currentUser}
                initialPanel={activeTab === 'HR_ATTENDANCE' ? 'attendance' : activeTab === 'HR_LEAVE_APPROVAL' ? 'leave-approval' : activeTab === 'WORKER_ATTENDANCE' ? 'worker-attendance' : activeTab === 'WORKER_LEAVE_REQUEST' ? 'worker-leave' : activeTab === 'WORKER_DOWNLOAD_PAYSLIP' ? 'worker-download-payslip' : activeTab === 'WORKER_DOWNLOAD_ATTENDANCE' ? 'worker-download-attendance' : currentRole === 'PEKERJA' ? 'worker-profile' : 'employees'}
              />
            )}

            {currentRole === 'ADMIN' && activeTab === 'DASHBOARD' && (
              <AdminDashboardView data={data} onNavigate={setActiveTab} />
            )}

            {currentRole === 'ADMIN' && activeTab === 'NEWS' && (
              <AdminNewsView onSaved={() => notifySaved('NEWS')} />
            )}

            {/* 1. ADMIN MASTER DATA VIEWS */}
            {currentRole === 'ADMIN' && (activeTab === 'USERS' ||
              activeTab === 'CUSTOMERS' ||
              activeTab === 'VESSELS' ||
              activeTab === 'PORTS' ||
              activeTab === 'FIX_TARIFF' ||
              activeTab === 'EXPENSES_ITEM' ||
              activeTab === 'VENDOR_PARTNERS' ||
              activeTab === 'BANK_ACCOUNT' ||
              activeTab === 'CHART_OF_ACCOUNTS' ||
              activeTab === 'CASH_BALANCE_ADJUSTMENTS') && (
              <AdminMasterDataView
                initialTab={activeTab}
                branches={data.branches}
                users={data.users}
                customers={data.customers}
                vessels={data.vessels}
                ports={data.ports}
                zones={data.zones}
                fixTariffs={data.fixTariffs}
                expensesItems={data.expensesItems}
                vendorPartners={data.vendorPartners || []}
                bankAccounts={data.bankAccounts || []}
                cashBalanceAdjustments={data.cashBalanceAdjustments || []}
                onDataSaved={() => {
                  const latest = db.getState();
                  setData({
                    ...latest,
                    users: [...latest.users],
                    customers: [...latest.customers],
                    vessels: [...latest.vessels],
                    ports: [...latest.ports],
                    zones: [...latest.zones],
                    fixTariffs: [...latest.fixTariffs],
                    expensesItems: [...latest.expensesItems],
                    vendorPartners: [...(latest.vendorPartners || [])],
                    bankAccounts: [...(latest.bankAccounts || [])],
                    cashBalanceAdjustments: [...(latest.cashBalanceAdjustments || [])],
                  });
                  notifySaved(activeTab);
                }}
              />
            )}

            {/* 2. SALES / OPERATOR VIEWS */}
            {currentRole === 'SALES' && activeTab === 'DASHBOARD' && (
              <SalesDashboardView
                jobCalls={roleVisibleJobCalls}
                onNavigate={setActiveTab}
                onSelectJob={setSelectedJobId}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'INQUIRIES' && (
              <InquiriesView
                jobCalls={roleVisibleJobCalls}
                vessels={data.vessels}
                ports={data.ports}
                customers={data.customers}
                users={data.users}
                currentUser={currentUser}
                onSelectJob={setSelectedJobId}
                onNavigateToQuotes={() => setActiveTab('QUOTES_EPDA_DETAIL')}
                onOpenPDA={() => setActiveTab('PDA_CREW_DETAIL')}
                onDataSaved={notifySaved}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'QUOTES_EPDA' && (
              <QuotesListView
                jobCalls={roleVisibleJobCalls}
                vessels={data.vessels}
                onSelectJob={setSelectedJobId}
                onOpenEPDA={() => setActiveTab('QUOTES_EPDA_DETAIL')}
                onOpenPDA={() => setActiveTab('PDA_CREW_DETAIL')}
                enablePagination
                showStatusColumn
                showEtdColumn
                showPdaButton
                pdaReferenceSource="EPDA"
              />
            )}

            {currentRole === 'SALES' && activeTab === 'QUOTES_EPDA_DETAIL' && (
              <QuotesEPDAView
                job={currentJob}
                vessels={data.vessels}
                onSelectJob={setSelectedJobId}
                allJobs={roleVisibleJobCalls}
                users={data.users}
                customers={data.customers}
                fixTariffs={data.fixTariffs}
                expensesItems={data.expensesItems}
                onDataSaved={notifySaved}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'PDA_CREW_DETAIL' && (
              <CrewPDAView
                job={currentJob}
                vessels={data.vessels}
                users={data.users}
                customers={data.customers}
                onBack={() => setActiveTab('QUOTES_EPDA')}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'JOBS_ENTRY' && (
              <JobsEntryView
                jobCalls={roleVisibleJobCalls}
                onSelectJob={setSelectedJobId}
                onNavigate={setActiveTab}
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_INQUIRIES' && (
              <InquiriesView
                jobCalls={roleVisibleJobCalls}
                vessels={data.vessels}
                ports={data.ports}
                customers={data.customers}
                users={data.users}
                currentUser={currentUser}
                onSelectJob={setSelectedJobId}
                onNavigateToQuotes={() => setActiveTab('FDA_AMOUNT')}
                onOpenFPDA={() => setActiveTab('FDA_PDA_DETAIL')}
                onDataSaved={notifySaved}
                showFdaStatusColumn
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_QUOTES_EPDA' && (
              <QuotesListView
                jobCalls={roleVisibleJobCalls}
                vessels={data.vessels}
                onSelectJob={setSelectedJobId}
                onOpenEPDA={() => setActiveTab('FDA_AMOUNT')}
                onOpenPDA={() => setActiveTab('FDA_PDA_DETAIL')}
                title="Created FDA"
                description="Pembuatan Final Disbursement Account."
                moduleLabel="FDA Operator"
                actionLabel="Buat FDA"
                enablePagination
                showStatusColumn
                statusColumnType="fda"
                showPdaButton
                pdaActionLabel="Buat FPDA"
                pdaReferenceSource="FDA"
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_PDA_DETAIL' && roleVisibleJobCalls.length > 0 && (
              <CrewPDAView
                job={currentJob}
                vessels={data.vessels}
                users={data.users}
                customers={data.customers}
                pdaType="FDA"
                onBack={() => setActiveTab('FDA_QUOTES_EPDA')}
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_CREATE_VOUCHER' && (
              <PaymentVoucherView
                jobCalls={roleVisibleJobCalls}
                vendorPartners={data.vendorPartners || []}
                requestBy={currentUser?.name || ''}
                requestByUserId={currentUser?.id}
                jobVesselOnly
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_EDIT_VOUCHER' && (
              <EditVoucherView
                jobCalls={roleVisibleJobCalls}
                vendorPartners={data.vendorPartners || []}
                paymentVouchers={currentUserPaymentVouchers}
                requestBy={currentUser?.name || ''}
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_PAYMENT_HISTORY' && (
              <VoucherHistoryView paymentVouchers={currentUserPaymentVouchers} />
            )}

            {currentRole === 'MANAGER_OPS' && activeTab === 'MANAGER_VOUCHER_APPROVAL' && (
              <VoucherApprovalView
                paymentVouchers={branchPaymentVouchers}
                reviewer={currentUser?.name || ''}
                reviewerUserId={currentUser?.id || ''}
                reviewerRole="MANAGER_OPS"
              />
            )}

            {currentRole === 'MANAGER_OPS' && activeTab === 'MANAGEMENT_VESSEL' && (
              <ManagementVesselView
                jobCalls={data.jobCalls}
                users={data.users}
                paymentVouchers={data.paymentVouchers || []}
              />
            )}

            {currentRole === 'MANAGER_OPS' && activeTab === 'MANAGER_JOB_INVOICE_MONITORING' && (
              <JobInvoiceMonitoringView jobCalls={data.jobCalls} audience="MANAGER_OPS" />
            )}

            {/* 3. MANAGER OPS VIEWS */}
            {currentRole === 'MANAGER_OPS' &&
              (activeTab === 'DASHBOARD' ||
                activeTab === 'QUOTES_VIEW' ||
                activeTab === 'APPROVAL') && (
                <ManagerOpsView
                  initialTab={
                    activeTab === 'DASHBOARD'
                      ? 'DASHBOARD'
                      : activeTab === 'QUOTES_VIEW'
                      ? 'QUOTES_VIEW'
                      : 'APPROVAL'
                  }
                  jobCalls={roleVisibleJobCalls}
                  approverName={currentUser.name}
                  vessels={data.vessels}
                  users={data.users}
                  customers={data.customers}
                  fixTariffs={data.fixTariffs}
                  expensesItems={data.expensesItems}
                  onSelectJob={setSelectedJobId}
                  onNavigate={setActiveTab}
                />
              )}

            {/* 4. FDA VIEWS */}
            {currentRole === 'FDA' && roleVisibleJobCalls.length > 0 &&
              (activeTab === 'DASHBOARD' ||
                activeTab === 'FDA_JOB_ID' ||
                activeTab === 'FDA_AMOUNT' ||
                activeTab === 'CREW_CHANGE' ||
                activeTab === 'QUOTES_VIEW' ||
                activeTab === 'APPROVAL') && (
                <FDAView
                  initialTab={
                    activeTab === 'DASHBOARD'
                      ? 'DASHBOARD'
                      : activeTab === 'FDA_JOB_ID'
                      ? 'JOB_ID'
                      : activeTab === 'FDA_AMOUNT'
                      ? 'FDA_AMOUNT'
                      : activeTab === 'CREW_CHANGE'
                      ? 'CREW_CHANGE'
                      : activeTab === 'QUOTES_VIEW'
                      ? 'QUOTES_VIEW'
                      : 'APPROVAL'
                  }
                  jobCalls={roleVisibleJobCalls}
                  vessels={data.vessels}
                  users={data.users}
                  customers={data.customers}
                  activeJob={currentJob}
                  activeUserBranch={currentUser?.branch}
                  onSelectJob={setSelectedJobId}
                  fixTariffs={data.fixTariffs}
                  expensesItems={data.expensesItems}
                  onNavigate={setActiveTab}
                />
              )}

            {currentRole === 'FDA' && roleVisibleJobCalls.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
                Belum ada Job/Vessel Call yang disetujui Manager Ops. Job akan muncul di menu FDA setelah approval.
              </div>
            )}

            {currentRole === 'ACCOUNTING' && (
              <div className="accounting-role-content">
                {activeTab === 'ACCOUNTING_DASHBOARD' && <AccountingDashboard onNavigate={setActiveTab} />}
                {activeTab === 'ACCOUNTING_WORKSPACE' && <AccountingWorkspace />}
                {activeTab === 'ACCOUNTING_ASSETS' && <AccountingAssetsView />}
                {activeTab === 'ACCOUNTING_POSTED_JOURNAL_REPORT' && <AccountingPostedJournalReport />}
                {activeTab === 'ACCOUNTING_FINANCE_HISTORY' && (
                  <AccountingFinanceHistory
                    branches={data.branches.filter((branch) => branch.isActive)}
                    jobCalls={data.jobCalls}
                    paymentVouchers={data.paymentVouchers || []}
                    bankAccounts={data.bankAccounts || []}
                  />
                )}
                {activeTab === 'ACCOUNTING_BALANCE_SHEET' && <AccountingBalanceSheetView />}
                {activeTab === 'ACCOUNTING_PROFIT_LOSS' && <AccountingProfitLossView />}
                {activeTab === 'ACCOUNTING_PROFIT_DETAIL' && <AccountingProfitDetailView />}
              </div>
            )}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_DASHBOARD' && (
              <AccountingDashboard audience="DIRECTOR" onNavigate={(tab) => {
                const directorTabs: Partial<Record<ActiveTab, ActiveTab>> = {
                  ACCOUNTING_PROFIT_LOSS: 'DIRECTOR_PROFIT_LOSS',
                  ACCOUNTING_BALANCE_SHEET: 'DIRECTOR_BALANCE_SHEET',
                  ACCOUNTING_ASSETS: 'DIRECTOR_ASSETS',
                };
                setActiveTab(directorTabs[tab] || 'DIRECTOR_DASHBOARD');
              }} />
            )}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_ASSETS' && (
              <AccountingAssetsView readOnly />
            )}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_BALANCE_SHEET' && <AccountingBalanceSheetView />}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_PROFIT_LOSS' && <AccountingProfitLossView />}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_PROFIT_DETAIL' && <AccountingProfitDetailView />}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_VOUCHER_APPROVAL' && (
              <VoucherApprovalView
                paymentVouchers={data.paymentVouchers || []}
                reviewer={currentUser?.name || ''}
                reviewerUserId={currentUser?.id || ''}
                reviewerRole="DIRECTOR"
              />
            )}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_JOB_INVOICE_MONITORING' && (
              <JobInvoiceMonitoringView jobCalls={data.jobCalls} audience="DIRECTOR" />
            )}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_VESSEL_CALLS' && (
              <ActiveVesselCallsView
                key={viewSessionKey}
                jobCalls={data.jobCalls}
                vessels={data.vessels}
                users={data.users}
                customers={data.customers}
                onSelectJob={setSelectedJobId}
              />
            )}

            {currentRole === 'DIRECTOR' && activeTab === 'DIRECTOR_ACTIVITY_LOG' && (
              <DirectorActivityLogView auditLogs={data.auditLogs} users={data.users} />
            )}

            {/* 5. FINANCE VIEWS */}
            {currentRole === 'FINANCE' && (activeTab === 'FINANCE_ACCOUNTS_PAYABLE' || activeTab === 'FINANCE_ACCOUNTS_PAYABLE_INPUT') && (
              <AccountsPayableView
                mode="INPUT"
                paymentVouchers={branchPaymentVouchers}
                payer={currentUser?.name || ''}
                bankAccounts={branchBankAccounts}
                jobCalls={roleVisibleJobCalls}
              />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_ACCOUNTS_PAYABLE_HISTORY' && (
              <AccountsPayableView
                mode="HISTORY"
                paymentVouchers={branchPaymentVouchers}
                payer={currentUser?.name || ''}
                bankAccounts={branchBankAccounts}
                jobCalls={roleVisibleJobCalls}
              />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_CREATE_VOUCHER' && (
              <PaymentVoucherView
                jobCalls={roleVisibleJobCalls}
                vendorPartners={data.vendorPartners || []}
                requestBy={currentUser?.name || ''}
                requestByUserId={currentUser?.id}
                approverUsers={financeVoucherApprovers}
                onDataSaved={() => notifySaved('FINANCE_CREATE_VOUCHER')}
                operationalOnly
              />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_EDIT_VOUCHER' && (
              <EditVoucherView
                jobCalls={roleVisibleJobCalls}
                vendorPartners={data.vendorPartners || []}
                paymentVouchers={currentUserPaymentVouchers}
                requestBy={currentUser?.name || ''}
              />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_PAYMENT_HISTORY' && (
              <VoucherHistoryView paymentVouchers={currentUserPaymentVouchers} />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_RECAP' && (
              <FinanceRecapView
                paymentVouchers={branchPaymentVouchers}
                jobCalls={roleVisibleJobCalls}
                bankAccounts={branchBankAccounts}
                branchName={currentUser.branch}
              />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_CASH_BALANCE' && (
              <CashBalanceView
                bankAccounts={branchBankAccounts}
                paymentVouchers={branchPaymentVouchers}
                cashBalanceAdjustments={data.cashBalanceAdjustments || []}
                branchName={currentUser.branch}
              />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_HISTORY_REPORT' && (
              <FinancialHistoryView paymentVouchers={branchPaymentVouchers} jobCalls={roleVisibleJobCalls} bankAccounts={branchBankAccounts} />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_RECEIVABLE_INPUT' && (
              <AccountsReceivableView mode="INPUT" />
            )}

            {currentRole === 'FINANCE' && activeTab === 'FINANCE_RECEIVABLE_HISTORY' && (
              <AccountsReceivableView mode="HISTORY" />
            )}

            {currentRole === 'FINANCE' && (activeTab === 'FINANCE_DASHBOARD' ||
              activeTab === 'JOB_INVOICE_OPEN' ||
              activeTab === 'AP' ||
              activeTab === 'AR' ||
              activeTab === 'PRINCIPAL_INVOICE' ||
              activeTab === 'CLOSING') && (
              <FinanceView
                initialTab={
                  activeTab === 'FINANCE_DASHBOARD'
                    ? 'DASHBOARD'
                    : activeTab === 'JOB_INVOICE_OPEN'
                    ? 'JOB_INVOICE_OPEN'
                    : activeTab === 'PRINCIPAL_INVOICE'
                    ? 'INVOICES'
                    : activeTab === 'AP'
                    ? 'AP'
                    : activeTab === 'AR'
                    ? 'AR'
                    : 'REPORTS'
                }
                jobCalls={roleVisibleJobCalls}
                vessels={data.vessels}
                fixTariffs={data.fixTariffs}
                expensesItems={data.expensesItems}
                bankAccounts={branchBankAccounts}
                activeJob={currentJob}
                onSelectJob={setSelectedJobId}
                onNavigate={setActiveTab}
              />
            )}

            {/* 6. ACTIVE VESSEL CALLS */}
            {activeTab === 'ACTIVE_VESSEL_CALLS' && (
              <ActiveVesselCallsView
                key={viewSessionKey}
                jobCalls={currentRole === 'FDA' ? data.jobCalls : roleVisibleJobCalls}
                vessels={data.vessels}
                users={data.users}
                customers={data.customers}
                onSelectJob={setSelectedJobId}
                onOpenJob={(jobId) => { setSelectedJobId(jobId); }}
              />
            )}

          </div>
        </main>
      </div>

      {showProfileModal && currentUser && (
        <div className="maritim-modal-overlay" onMouseDown={(e)=>{if(e.target===e.currentTarget)setShowProfileModal(false)}}>
          <div className="maritim-small-modal">
            <div className="maritim-modal-head"><div><b>Profil Pengguna</b><small>Data user aktif pada portal</small></div><button onClick={()=>setShowProfileModal(false)}>×</button></div>
            <div className="maritim-modal-body">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-400 block mb-1">User</span><b>{currentUser.username}</b></div>
                <div><span className="text-slate-400 block mb-1">Nama Pemegang User</span><b>{currentUser.name}</b></div>
                <div><span className="text-slate-400 block mb-1">Role</span><b>{currentUser.role}</b></div>
                <div><span className="text-slate-400 block mb-1">Jabatan</span><b>{currentUser.position || currentUser.department || '-'}</b></div>
                <div className="col-span-2"><span className="text-slate-400 block mb-1">Email</span><b>{currentUser.email}</b></div>
                <div><span className="text-slate-400 block mb-1">Status</span><b className="text-emerald-600">{currentUser.status}</b></div>
              </div>
            </div>
            <div className="maritim-modal-actions"><button onClick={()=>setShowProfileModal(false)}>Tutup</button></div>
          </div>
        </div>
      )}

    </div>
  );
}
