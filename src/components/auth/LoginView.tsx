import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { AuthAccount } from '../../auth';
import { apiAuth } from '../../lib/api';
import { formatDateLong } from '../../utils/date';

interface LoginViewProps { onLogin: (account: AuthAccount) => void; }

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const today = formatDateLong();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    window.setTimeout(async () => {
      try {
        if (!apiAuth.enabled) throw new Error('Mode API XAMPP belum diaktifkan.');
        const account = await apiAuth.login(username, password);
        if (!account) {
          setError('Username atau password tidak valid.');
          setLoading(false);
          return;
        }
        onLogin(account);
      } catch (loginError) {
        setError(loginError instanceof Error ? loginError.message : 'Login gagal.');
        setLoading(false);
      }
    }, 280);
  };

  return (
    <div className="lgm-login-shell">
      <div className="lgm-login-backdrop" />
      <div className="lgm-login-overlay" />

      <header className="lgm-login-topbar">
        <div className="lgm-login-brand">
          <span className="lgm-login-logo">
            <img src="/lenteraglobalmaritim/lgm-logo.png" alt="PT Lentera Global Maritim" />
          </span>
          <span className="lgm-login-brand-text">
            <b>SYSTEM MANAGEMENT AGENCY SHIPPING</b>
            <small>PT LENTERA GLOBAL MARITIM</small>
          </span>
        </div>
        <span className="lgm-secure-badge">
          <span className="lgm-live-dot" />
          SYSTEM ONLINE
        </span>
      </header>

      <main className="lgm-login-body">
        <section className="lgm-login-copy">
          <h1>Integrated Maritime.<br /><em>Controlled Vessel Workflow.</em></h1>
          <div className="lgm-login-principles">
            <section className="lgm-login-principle">
              <h2>VISION</h2>
              <p>Being a quality , Profesional and trusted company that as the first Choice by qualified customers</p>
            </section>
            <section className="lgm-login-principle">
              <h2>MISSION</h2>
              <p>Our Priority is always providing satisfaction our stakeholder. Therefore we will always focus to become a reliable partner in cooperation and business, to give security, trust worthy,profesional, as well as expertise in it's field</p>
            </section>
          </div>

          <div className="lgm-login-date">
            <div className="lgm-calendar-icon">▣</div>
            <div>
              <small>TODAY</small>
              <strong>{today}</strong>
            </div>
          </div>
        </section>

        <section className="lgm-login-card">


          <div className="lgm-login-card-head">
            <div>
              <h2>Login ke Portal</h2>
              <p>Silakan masuk menggunakan akun sesuai role pekerjaan Anda.</p>
            </div>
            <span className="lgm-demo-mode">Mode Database</span>
          </div>

          <form onSubmit={submit}>
            <label className="lgm-field">
              <span className="lgm-field-icon"><UserRound size={18} /></span>
              <input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username atau email"
                aria-label="Username atau email"
              />
            </label>

            <label className="lgm-field">
              <span className="lgm-field-icon"><LockKeyhole size={18} /></span>
              <div className="lgm-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Password"
                  aria-label="Password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <div className="lgm-login-options">
              <button type="button" className="lgm-forgot" onClick={() => setError('Silakan hubungi administrator untuk reset password.')}>
                Lupa password?
              </button>
            </div>

            {error && <div className="lgm-login-error">{error}</div>}
            <button className="lgm-login-submit" disabled={loading}>
              {loading ? 'Memverifikasi...' : 'Login ke Portal'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="lgm-login-footer">
            © 2026 PT. Lentera Global Maritim. All rights reserved.
          </div>
        </section>
      </main>
    </div>
  );
};

