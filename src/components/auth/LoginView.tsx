import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { AuthAccount, authenticate } from '../../auth';

interface LoginViewProps { onLogin: (account: AuthAccount, rememberMe?: boolean) => void; }

const DEMO_LOGIN_PRESETS = [
  { label: 'Admin', username: 'admin', password: 'admin123' },
  { label: 'Sales', username: 'sales', password: 'sales123' },
  { label: 'Manager', username: 'manager', password: 'manager123' },
  { label: 'FDA', username: 'fda', password: 'fda123' },
  { label: 'Finance', username: 'finance', password: 'finance123' },
];

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);


  const today = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    window.setTimeout(async () => {
      try {
        const account = authenticate(username, password);
        if (!account) {
          setError('Username atau password tidak valid.');
          setLoading(false);
          return;
        }
        onLogin(account, rememberMe);
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
          <p>
            Being a quality , Profesional and trusted company that as the first 
            Choice by qualified customers
          </p>

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
            <span className="lgm-demo-mode">Mode Lokal</span>
          </div>

          <div className="lgm-demo-quicklist" aria-label="Local login presets">
              {DEMO_LOGIN_PRESETS.map((preset) => (
                <button
                  key={preset.username}
                  type="button"
                  className="lgm-demo-preset"
                  onClick={() => {
                    setUsername(preset.username);
                    setPassword(preset.password);
                    setError('');
                  }}
                >
                  {preset.label}
                </button>
              ))}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <label className="lgm-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Ingat saya</span>
              </label>
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

