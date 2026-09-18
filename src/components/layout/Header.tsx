import React, { useEffect, useRef, useState } from 'react';
import {
  Bell, Layers, Search, ShieldCheck,
  Briefcase, FileCheck2, DollarSign, UserCircle2
} from 'lucide-react';
import { UserRole, JobCall, ActiveTab } from '../../types';
import { AuthAccount, initials } from '../../auth';
import { LogOut } from 'lucide-react';

interface HeaderProps {
  currentRole: UserRole;
  onProfile: () => void;
  onChangePassword: (oldPassword: string, newPassword: string) => void;
  selectedJobId: string;
  onJobSelect: (jobId: string) => void;
  jobCalls: JobCall[];
  currentUser: AuthAccount;
  onLogout: () => void;
  onNavigate: (tab: ActiveTab) => void;
}

type HeaderNotification = {
  id: string;
  title: string;
  message: string;
  jobId?: string;
  tab?: ActiveTab;
  kind: 'APPROVAL' | 'INFO' | 'WARNING';
};

export const Header: React.FC<HeaderProps> = ({
  currentRole, onProfile, onChangePassword, selectedJobId, onJobSelect,
  jobCalls, currentUser, onLogout, onNavigate
}) => {
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`lgm_notification_reads_${currentUser.id}`) || '[]'); } catch { return []; }
  });

  const roleMeta: Record<UserRole, { label: string; desc: string; icon: any }> = {
    ADMIN: { label:'ADMIN', desc:'Master Data & System', icon:ShieldCheck },
    SALES: { label:'SALES', desc:'Inquiry, Quotes & Jobs', icon:Briefcase },
    MANAGER_OPS: { label:'MANAGER OPS', desc:'Approval & Operations', icon:Layers },
    FDA: { label:'FDA', desc:'Actual Cost & Disbursement', icon:FileCheck2 },
    FINANCE: { label:'FINANCE', desc:'Invoice, AP/AR & Closing', icon:DollarSign },
  };
  const RoleIcon = roleMeta[currentRole].icon;

  useEffect(() => {
    const closeHeaderMenus = (event: MouseEvent) => {
      if (headerActionsRef.current && !headerActionsRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
        setShowNotifications(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowRoleDropdown(false);
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', closeHeaderMenus);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeHeaderMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const notifications: HeaderNotification[] = (() => {
    const items: HeaderNotification[] = [];
    const push = (n: HeaderNotification) => { if (!items.some(x => x.id === n.id)) items.push(n); };

    jobCalls.forEach((job) => {
      const epdaSubmitted = job.quotation?.epda?.status === 'SUBMITTED';
      const approval = job.managerApproval?.status;

      if (currentRole === 'MANAGER_OPS' && approval !== 'APPROVED' && epdaSubmitted) {
        push({ id:`approval-${job.jobId}`, title:'Approval menunggu tindakan', message:`${job.jobId} · ${job.vesselName} siap diperiksa dan disetujui setelah EPDA disubmit.`, jobId:job.jobId, tab:'APPROVAL', kind:'APPROVAL' });
      }

      if (currentRole === 'SALES' && approval === 'REJECTED') {
        push({ id:`rejected-${job.jobId}`, title:'EPDA/PDA dikembalikan', message:`${job.jobId} · ${job.vesselName} memerlukan revisi sebelum diajukan kembali.`, jobId:job.jobId, tab:'QUOTES_EPDA', kind:'WARNING' });
      }

      if (currentRole === 'FDA' && approval === 'APPROVED' && !job.fda?.fdaApproved) {
        const pendingActual = (job.actualCosts || []).filter(x => x.status !== 'APPROVED_BY_FDA').length;
        const hasActualCost = (job.actualCosts || []).length > 0;
        push({
          id:`fda-${job.jobId}-${pendingActual}`,
          title: !hasActualCost ? 'Actual Cost perlu diinput' : pendingActual ? 'FDA perlu verifikasi biaya' : 'FDA siap difinalisasi',
          message: !hasActualCost
            ? `${job.jobId} · ${job.vesselName} sudah Approved. Lengkapi Actual Cost terlebih dahulu.`
            : pendingActual
              ? `${job.jobId} memiliki ${pendingActual} actual cost yang belum diverifikasi.`
              : `${job.jobId} · ${job.vesselName} memiliki biaya yang sudah diverifikasi dan siap difinalisasi FDA.`,
          jobId:job.jobId,
          tab: !hasActualCost || pendingActual ? 'ACTUAL_COST' : 'FDA_JOB_ID',
          kind: !hasActualCost || pendingActual ? 'WARNING' : 'INFO'
        });
      }

      if (currentRole === 'FINANCE' && job.fda?.fdaApproved) {
        if (job.principalInvoice?.status === 'DRAFT') {
          push({ id:`invoice-${job.jobId}`, title:'FDA Approved · Invoice siap dibuat', message:`${job.jobId} · ${job.vesselName} sudah FDA Approved. Lanjutkan invoice principal.`, jobId:job.jobId, tab:'PRINCIPAL_INVOICE', kind:'INFO' });
        }
        const unpaid = (job.ap || []).filter(x => x.status !== 'PAID').length;
        const unreceived = (job.ar || []).filter(x => x.status !== 'RECEIVED').length;
        if (unpaid || unreceived) {
          push({ id:`finance-${job.jobId}-${unpaid}-${unreceived}`, title:'Finance outstanding', message:`${job.jobId}: ${unpaid} AP belum lunas, ${unreceived} AR belum diterima.`, jobId:job.jobId, tab: unpaid ? 'AP' : 'AR', kind:'INFO' });
        }
        const readyForClosing = job.principalInvoice?.status === 'SETTLED'
          && !!job.ap?.length && job.ap.every(item => item.status === 'PAID')
          && !!job.ar?.length && job.ar.every(item => item.status === 'RECEIVED')
          && !job.closing?.isClosed;
        if (readyForClosing) {
          push({ id:`closing-${job.jobId}`, title:'Job siap ditutup', message:`${job.jobId} · ${job.vesselName} sudah memenuhi syarat closing.`, jobId:job.jobId, tab:'CLOSING', kind:'INFO' });
        }
      }
    });

    if (currentRole === 'ADMIN') {
      const latest = jobCalls.slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
      if (latest) push({ id:`info-${latest.jobId}-${latest.updatedAt}`, title:'Aktivitas job terbaru', message:`${latest.jobId} · ${latest.vesselName} terakhir diperbarui.`, jobId:latest.jobId, tab:'ACTIVE_VESSEL_CALLS', kind:'INFO' });
    }

    return items.slice(0, 12);
  })();

  const visibleNotifications = notifications.filter(n => !readNotificationIds.includes(n.id));
  const unreadCount = visibleNotifications.length;
  const persistReads = (ids: string[]) => {
    const next = Array.from(new Set(ids));
    setReadNotificationIds(next);
    try { localStorage.setItem(`lgm_notification_reads_${currentUser.id}`, JSON.stringify(next)); } catch {}
  };
  const handleNotificationOpen = (n: HeaderNotification) => {
    persistReads(Array.from(new Set([...readNotificationIds, n.id])));
    if (n.jobId) onJobSelect(n.jobId);
    if (n.tab) onNavigate(n.tab);
    setShowNotifications(false);
  };
  const markAllRead = () => persistReads(Array.from(new Set([...readNotificationIds, ...notifications.map(n => n.id)])));

  return (
    <header className="maritim-header">
      <div className="maritim-header-inner">
        <div className="maritim-brand">
          <div className="maritim-logo"><img src="/lgm-logo.png" alt="LGM" /></div>
          <div>
            <div className="maritim-brand-name">LGM Keagenan</div>
            <div className="maritim-brand-sub">SHIPPING AGENCY WORKSPACE</div>
          </div>
        </div>

        <div className="maritim-header-actions" ref={headerActionsRef}>
          {currentRole === 'ADMIN' && <button className="maritim-icon-btn" title="Search"><Search size={17}/></button>}
          <button className={`maritim-icon-btn maritim-notification-btn ${unreadCount ? 'has-alert' : ''}`} title="Notifications" onClick={() => setShowNotifications(v => !v)} aria-label={`Notifications ${unreadCount ? `(${unreadCount} unread)` : ''}`}>
            <Bell size={17}/>
            {unreadCount > 0 && <span className="maritim-notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="maritim-notification-menu">
              <div className="maritim-notification-head">
                <div><b>Notifikasi</b><small>{unreadCount ? `${unreadCount} belum dibaca` : 'Tidak ada notifikasi baru'}</small></div>
                {!!notifications.length && <button onClick={markAllRead}>Tandai semua dibaca</button>}
              </div>
              <div className="maritim-notification-list">
                {visibleNotifications.map(n => (
                  <button key={n.id} className="maritim-notification-item unread" onClick={() => handleNotificationOpen(n)}>
                    <span className={`maritim-notification-dot ${n.kind.toLowerCase()}`}/>
                    <span className="maritim-notification-copy"><b>{n.title}</b><small>{n.message}</small></span>
                    <span className="maritim-notification-new">BARU</span>
                  </button>
                ))}
                {!visibleNotifications.length && <div className="maritim-notification-empty">Belum ada info atau approval yang memerlukan perhatian.</div>}
              </div>
            </div>
          )}

          <div className="maritim-user">
            <div className="maritim-user-avatar">{initials(currentUser.name)}</div>
            <div>
              <div className="maritim-user-name">{currentUser.name}</div>
              <div className="maritim-user-role">{roleMeta[currentRole].desc}</div>
            </div>
            <button
              onClick={() => setShowRoleDropdown(v => !v)}
              style={{border:0,background:'transparent',color:'#fff',display:'flex',alignItems:'center',gap:4,padding:3,cursor:'pointer'}}
              title="Buka menu pengguna"
            >
              <span className="maritim-role-pill">{roleMeta[currentRole].label}</span>
            </button>
          </div>

          {showRoleDropdown && (
            <div className="maritim-user-menu">
              <div className="maritim-user-menu-head">
                <div className="maritim-user-menu-avatar">{initials(currentUser.name)}</div>
                <div><b>{currentUser.name}</b><small>{currentUser.email}</small></div>
              </div>

              <button className="maritim-user-menu-item" onClick={() => {setShowRoleDropdown(false); onProfile();}}><UserCircle2 size={16}/><span><b>Profil</b><small>Lihat profil pengguna aktif</small></span></button>
              <button className="maritim-user-menu-item" onClick={() => {setShowRoleDropdown(false);setShowPasswordForm(true);setPasswordError('');}}><ShieldCheck size={16}/><span><b>Ubah Password</b><small>Perbarui password akun</small></span></button>
              <div className="maritim-user-menu-divider"/>
              <button className="maritim-user-menu-logout" onClick={() => {setShowRoleDropdown(false); setShowLogoutConfirm(true);}}><LogOut size={16}/> Logout / Sign out</button>
            </div>
          )}
          {showLogoutConfirm && (
            <div className="maritim-modal-overlay" onMouseDown={(e)=>{if(e.target===e.currentTarget)setShowLogoutConfirm(false)}}>
              <div className="maritim-small-modal">
                <div className="maritim-modal-head"><div><b>Konfirmasi Logout</b><small>{currentUser.name}</small></div><button onClick={()=>setShowLogoutConfirm(false)}>×</button></div>
                <div className="maritim-modal-body">
                  <p className="text-sm text-slate-600">Apakah Anda yakin ingin keluar dari portal dan mengakhiri sesi aktif?</p>
                </div>
                <div className="maritim-modal-actions">
                  <button onClick={()=>setShowLogoutConfirm(false)}>Batal</button>
                  <button className="primary" onClick={() => { setShowLogoutConfirm(false); onLogout(); }}>Keluar</button>
                </div>
              </div>
            </div>
          )}
          {showPasswordForm && (
            <div className="maritim-modal-overlay" onMouseDown={(e)=>{if(e.target===e.currentTarget)setShowPasswordForm(false)}}>
              <div className="maritim-small-modal">
                <div className="maritim-modal-head"><div><b>Ubah Password</b><small>{currentUser.username} · {currentUser.name}</small></div><button onClick={()=>setShowPasswordForm(false)}>×</button></div>
                <div className="maritim-modal-body">
                  <label>Password Lama<input type="password" value={oldPassword} onChange={e=>setOldPassword(e.target.value)} /></label>
                  <label>Password Baru<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} /></label>
                  <label>Konfirmasi Password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} /></label>
                  {passwordError && <div className="maritim-form-error">{passwordError}</div>}
                </div>
                <div className="maritim-modal-actions"><button onClick={()=>setShowPasswordForm(false)}>Batal</button><button className="primary" onClick={()=>{if(oldPassword!==currentUser.password){setPasswordError('Password lama tidak sesuai.');return;}if(newPassword.length<6){setPasswordError('Password baru minimal 6 karakter.');return;}if(newPassword!==confirmPassword){setPasswordError('Konfirmasi password tidak sama.');return;}onChangePassword(oldPassword,newPassword);setOldPassword('');setNewPassword('');setConfirmPassword('');setShowPasswordForm(false);}}>Simpan Password</button></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
