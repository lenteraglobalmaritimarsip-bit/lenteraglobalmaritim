import React, { useState, useEffect } from 'react';
import { db, normalizeBranchCode } from './db/storage';
import { DatabaseState, UserRole, ActiveTab, JobCall } from './types';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ActiveVesselCallsView } from './components/vessel/ActiveVesselCallsView';
import { AdminMasterDataView } from './components/admin/AdminMasterDataView';
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { SalesDashboardView } from './components/sales/SalesDashboardView';
import { InquiriesView } from './components/sales/InquiriesView';
import { QuotesListView } from './components/sales/QuotesListView';
import { QuotesEPDAView } from './components/sales/QuotesEPDAView';
import { QuotesPDAView } from './components/sales/QuotesPDAView';
import { JobsEntryView } from './components/sales/JobsEntryView';
import { ManagerOpsView } from './components/manager/ManagerOpsView';
import { FDAView } from './components/fda/FDAView';
import { FinanceView } from './components/finance/FinanceView';
import { AuthAccount, DEMO_ACCOUNTS, getStoredAccounts, saveStoredAccount } from './auth';
import { LoginView } from './components/auth/LoginView';

const syncCurrentUserFromMaster = (account: AuthAccount | null): AuthAccount | null => {
  if (!account) return null;

  const storedAccounts = getStoredAccounts();
  const latestFromStorage = storedAccounts.find((item) => item.id === account.id || item.username === account.username) || account;
  const dbUser = db.getState().users.find((user) => user.id === account.id || user.username === account.username || user.name === account.name);

  if (!dbUser && !latestFromStorage) return account;

  const merged: AuthAccount = {
    ...account,
    ...latestFromStorage,
    ...(dbUser || {}),
    username: (dbUser?.username || latestFromStorage.username || account.username),
    password: (dbUser?.password || latestFromStorage.password || account.password),
    branch: (dbUser?.branch || latestFromStorage.branch || account.branch || 'Head Office'),
    role: (dbUser?.role || latestFromStorage.role || account.role || 'ADMIN'),
    department: (dbUser?.department || latestFromStorage.department || account.department),
    position: (dbUser?.position || latestFromStorage.position || account.position),
    status: (dbUser?.status || latestFromStorage.status || account.status),
  };

  return merged;
};

const clearStoredAuthSession = (userId?: string) => {
  try {
    localStorage.removeItem('lgm_active_user');
    if (userId) {
      localStorage.removeItem(`lgm_notification_reads_${userId}`);
    }
  } catch {}
};

const getDefaultTabForRole = (role: UserRole): ActiveTab => {
  switch (role) {
    case 'FINANCE':
      return 'FINANCE_DASHBOARD';
    case 'ADMIN':
    case 'SALES':
    case 'MANAGER_OPS':
    case 'FDA':
    default:
      return 'DASHBOARD';
  }
};

const ACTIVE_TAB_STORAGE_KEY = 'lgm_active_tab';

export default function App() {
  const [data, setData] = useState<DatabaseState>(db.getState());
  const [currentRole, setCurrentRole] = useState<UserRole>('ADMIN');
  const [currentUser, setCurrentUser] = useState<AuthAccount | null>(() => {
    try {
      const raw = localStorage.getItem('lgm_active_user');
      if (!raw) return null;
      const account = JSON.parse(raw) as AuthAccount;
      const validUsers = getStoredAccounts().map((u) => u.id);
      if (!account?.id || !validUsers.includes(account.id)) {
        clearStoredAuthSession();
        return null;
      }
      const synced = syncCurrentUserFromMaster(account);
      if (synced) setCurrentRole(synced.role);
      return synced;
    } catch {
      clearStoredAuthSession();
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const storedTab = sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) as ActiveTab | null;
      if (storedTab) return storedTab;
      const raw = localStorage.getItem('lgm_active_user');
      if (!raw) return 'DASHBOARD';
      const account = JSON.parse(raw) as AuthAccount;
      const validUsers = getStoredAccounts().map((u) => u.id);
      if (!account?.id || !validUsers.includes(account.id)) return 'DASHBOARD';
      return getDefaultTabForRole((account.role || 'ADMIN') as UserRole);
    } catch {
      return 'DASHBOARD';
    }
  });
  const [selectedJobId, setSelectedJobId] = useState<string>(
    data.jobCalls[0]?.jobId || ''
  );
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [loginToast, setLoginToast] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab); } catch {}
  }, [activeTab]);

  useEffect(() => { const fn = () => setShowProfileModal(true); window.addEventListener('lgm:open-profile', fn); return () => window.removeEventListener('lgm:open-profile', fn); }, []);

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

  const handleLogin = (account: AuthAccount, rememberMe = true) => {
    const freshAccount = syncCurrentUserFromMaster(account);
    if (!freshAccount) return;
    if (currentUser && currentUser.id !== freshAccount.id) {
      clearStoredAuthSession(currentUser.id);
    }
    setCurrentUser(freshAccount);
    setCurrentRole(freshAccount.role);
    try {
      if (rememberMe) {
        localStorage.setItem('lgm_active_user', JSON.stringify(freshAccount));
      } else {
        localStorage.removeItem('lgm_active_user');
      }
    } catch {}
    db.setActor({ id: freshAccount.id, name: freshAccount.name, role: freshAccount.role, branch: freshAccount.branch });
    db.setRole(freshAccount.role);
    setLoginToast(`Selamat datang, ${freshAccount.name.split(' ')[0]}!`);
    setTimeout(() => setLoginToast(null), 2600);
    setActiveTab(getDefaultTabForRole(freshAccount.role));
  };

  const handleProfile = () => {
    window.dispatchEvent(new CustomEvent('lgm:open-profile'));
  };

  const handleChangePassword = (_oldPassword: string, newPassword: string) => {
    if (!currentUser) return;
    const updated = { ...currentUser, password: newPassword };
    saveStoredAccount(updated);
    db.updateUser(currentUser.id, { password: newPassword });
    setCurrentUser(updated);
    setCurrentRole(updated.role);
    try { localStorage.setItem('lgm_active_user', JSON.stringify(updated)); } catch {}
    window.alert('Password berhasil diperbarui.');
  };

  const handleLogout = () => {
    const userId = currentUser?.id;
    setCurrentUser(null);
    setLoginToast(null);
    clearStoredAuthSession(userId);
  };

  // Subscribe to reactive database changes
  useEffect(() => {
    if (currentUser) db.setActor({ id: currentUser.id, name: currentUser.name, role: currentUser.role, branch: currentUser.branch });
    const unsubscribe = db.subscribe((newState) => {
      setData({ ...newState });
    });
    return () => unsubscribe();
  }, []);

  // When changing role, adapt active tab to sensible default for that role
  const handleRoleChange = (newRole: UserRole) => {
    setCurrentRole(newRole);
    const matchingFromStorage = getStoredAccounts().find((u) => u.role === newRole) || DEMO_ACCOUNTS.find((u) => u.role === newRole);
    if (matchingFromStorage) {
      const refreshed = syncCurrentUserFromMaster(matchingFromStorage);
      setCurrentUser(refreshed);
      try { localStorage.setItem('lgm_active_user', JSON.stringify(refreshed)); } catch {}
      db.setActor({ id: refreshed.id, name: refreshed.name, role: refreshed.role, branch: refreshed.branch });
    }
    setActiveTab(getDefaultTabForRole(newRole));
  };

  const branchVisibleJobCalls = currentUser && currentUser.role === 'SALES'
    ? data.jobCalls.filter((job) => {
        const jobBranch = job.inquiry?.createdByBranch
          || job.inquiry?.createdByBranchCode
          || job.inquiry?.createdBy
          || currentUser.branch
          || 'Head Office';

        return normalizeBranchCode(jobBranch) === normalizeBranchCode(currentUser.branch || 'Head Office');
      })
    : data.jobCalls;

  const currentJob: JobCall =
    branchVisibleJobCalls.find((j) => j.jobId === selectedJobId) ||
    branchVisibleJobCalls[0] ||
    ({} as JobCall);

  if (!currentUser) return <LoginView onLogin={handleLogin} />;

  return (
    <div className="maritim-app flex flex-col font-sans">
      {loginToast && (
        <div className="fixed right-5 top-5 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-lg shadow-emerald-900/10">
          {loginToast}
        </div>
      )}

      {saveToast && (
        <div className="fixed right-5 top-20 z-50 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-lg shadow-blue-900/10">
          {saveToast}
        </div>
      )}

      {/* Top Main Navigation Header */}
      <Header
        currentRole={currentRole}
        selectedJobId={selectedJobId}
        onJobSelect={setSelectedJobId}
        jobCalls={branchVisibleJobCalls}
        currentUser={currentUser}
        onLogout={handleLogout}
        onProfile={handleProfile}
        onChangePassword={handleChangePassword}
        onNavigate={setActiveTab}
      />

      {/* Main Workspace Layout */}
      <div className="maritim-layout">
        {/* Role-adaptive Sidebar */}
        <Sidebar
          currentRole={currentRole}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          selectedJobId={selectedJobId}
        />

        {/* Content Area */}
        <main className="maritim-main">
          <div className="maritim-content">
            {/* 1. ADMIN DASHBOARD */}
            {currentRole === 'ADMIN' && activeTab === 'DASHBOARD' && (
              <AdminDashboardView data={data} onNavigate={setActiveTab} />
            )}

            {/* 1. ADMIN MASTER DATA VIEWS */}
            {currentRole === 'ADMIN' && (activeTab === 'USERS' ||
              activeTab === 'CUSTOMERS' ||
              activeTab === 'VESSELS' ||
              activeTab === 'PORTS' ||
              activeTab === 'FIX_TARIFF' ||
              activeTab === 'EXPENSES_ITEM') && (
              <AdminMasterDataView
                initialTab={activeTab}
                users={data.users}
                customers={data.customers}
                vessels={data.vessels}
                ports={data.ports}
                zones={data.zones}
                fixTariffs={data.fixTariffs}
                expensesItems={data.expensesItems}
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
                  });
                  notifySaved(activeTab);
                }}
              />
            )}

            {/* 2. SALES / OPERATOR VIEWS */}
            {currentRole === 'SALES' && activeTab === 'DASHBOARD' && (
              <SalesDashboardView
                jobCalls={branchVisibleJobCalls}
                onNavigate={setActiveTab}
                onSelectJob={setSelectedJobId}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'INQUIRIES' && (
              <InquiriesView
                jobCalls={branchVisibleJobCalls}
                vessels={data.vessels}
                ports={data.ports}
                customers={data.customers}
                currentUser={currentUser}
                onSelectJob={setSelectedJobId}
                onNavigateToQuotes={() => setActiveTab('QUOTES_EPDA_DETAIL')}
                onDataSaved={notifySaved}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'QUOTES_EPDA' && (
              <QuotesListView
                jobCalls={branchVisibleJobCalls}
                vessels={data.vessels}
                onSelectJob={setSelectedJobId}
                onOpenEPDA={() => setActiveTab('QUOTES_EPDA_DETAIL')}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'QUOTES_EPDA_DETAIL' && (
              <QuotesEPDAView
                job={currentJob}
                vessels={data.vessels}
                onSelectJob={setSelectedJobId}
                allJobs={branchVisibleJobCalls}
                users={data.users}
                onDataSaved={notifySaved}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'QUOTES_PDA' && (
              <QuotesPDAView
                job={currentJob}
                expensesItems={data.expensesItems}
                onSelectJob={setSelectedJobId}
                onDataSaved={notifySaved}
              />
            )}

            {currentRole === 'SALES' && activeTab === 'JOBS_ENTRY' && (
              <JobsEntryView
                jobCalls={branchVisibleJobCalls}
                onSelectJob={setSelectedJobId}
                onNavigate={setActiveTab}
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_INQUIRIES' && (
              <InquiriesView
                jobCalls={branchVisibleJobCalls}
                vessels={data.vessels}
                ports={data.ports}
                customers={data.customers}
                currentUser={currentUser}
                onSelectJob={setSelectedJobId}
                onNavigateToQuotes={() => setActiveTab('ACTUAL_COST')}
                onDataSaved={notifySaved}
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_QUOTES_EPDA' && (
              <QuotesListView
                jobCalls={branchVisibleJobCalls}
                vessels={data.vessels}
                onSelectJob={setSelectedJobId}
                onOpenEPDA={() => setActiveTab('ACTUAL_COST')}
                title="Created FDA"
                description="Pembuatan Final Disbursement Account."
                moduleLabel="FDA Operator"
                actionLabel="Buat FDA"
              />
            )}

            {currentRole === 'FDA' && activeTab === 'FDA_QUOTES_PDA' && (
              <QuotesPDAView
                job={currentJob}
                expensesItems={data.expensesItems}
                onSelectJob={setSelectedJobId}
                onDataSaved={notifySaved}
              />
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
                  jobCalls={branchVisibleJobCalls}
                  users={data.users}
                  onSelectJob={setSelectedJobId}
                  onNavigate={setActiveTab}
                />
              )}

            {/* 4. FDA VIEWS */}
            {currentRole === 'FDA' &&
              (activeTab === 'DASHBOARD' ||
                activeTab === 'FDA_JOB_ID' ||
                activeTab === 'ACTUAL_COST' ||
                activeTab === 'CREW_CHANGE' ||
                activeTab === 'QUOTES_VIEW' ||
                activeTab === 'APPROVAL') && (
                <FDAView
                  initialTab={
                    activeTab === 'DASHBOARD'
                      ? 'DASHBOARD'
                      : activeTab === 'FDA_JOB_ID'
                      ? 'JOB_ID'
                      : activeTab === 'ACTUAL_COST' || activeTab === 'CREW_CHANGE'
                      ? 'ACTUAL_COST'
                      : activeTab === 'QUOTES_VIEW'
                      ? 'QUOTES_VIEW'
                      : 'APPROVAL'
                  }
                  jobCalls={data.jobCalls}
                  vessels={data.vessels}
                  activeJob={currentJob}
                  onSelectJob={setSelectedJobId}
                  onNavigate={setActiveTab}
                />
              )}

            {/* 5. FINANCE VIEWS */}
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
                jobCalls={data.jobCalls}
                vessels={data.vessels}
                activeJob={currentJob}
                onSelectJob={setSelectedJobId}
                onNavigate={setActiveTab}
              />
            )}

            {/* 6. ACTIVE VESSEL CALLS */}
            {activeTab === 'ACTIVE_VESSEL_CALLS' && (
              <ActiveVesselCallsView
                jobCalls={branchVisibleJobCalls}
                vessels={data.vessels}
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
