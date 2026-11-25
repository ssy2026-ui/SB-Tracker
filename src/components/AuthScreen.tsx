import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Calculator,
  Eye,
  EyeOff,
  PiggyBank,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { UserProfile } from '../shared/finance';
import financeIllustration from '../assets/images/sb_tracker_finance_illustration_1795609688165.jpg';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: UserProfile) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setForgotMessage(null);

    if (mode === 'forgot') {
      if (!email.trim()) {
        setError('Please enter your email address.');
        return;
      }
      setLoading(true);
      try {
        const res = await api.forgotPassword(email.trim());
        setForgotMessage(res.message);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to process request.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError('Please fill in your email and password.');
      return;
    }
    if (mode === 'register') {
      if (name.trim().length < 2) {
        setError('Please enter your name (at least 2 characters).');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    }
    setLoading(true);
    try {
      const res =
        mode === 'register'
          ? await api.register({ email: email.trim(), password, name: name.trim() })
          : await api.login({ email: email.trim(), password });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError(null);
    setForgotMessage(null);
    setDemoLoading(true);
    try {
      const res = await api.startDemo();
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to start demo session.');
    } finally {
      setDemoLoading(false);
    }
  }

  const features = [
    {
      title: 'Bills & Spend',
      desc: 'Organize monthly bills, monitor due dates, and track scheduled payments.',
      icon: CalendarClock,
    },
    {
      title: 'Daily Bill Funding',
      desc: 'Know exactly how much you need to set aside daily to cover your monthly bills.',
      icon: Calculator,
    },
    {
      title: 'Savings Goals',
      desc: 'Create personal savings targets, record deposits, and monitor your progress toward achieving your goals.',
      icon: PiggyBank,
    },
  ];

  return (
    <div className="min-h-screen pw-canvas flex flex-col justify-center px-4 sm:px-6 py-8 sm:py-12">
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* LEFT SECTION — INTRODUCTION */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-display text-xl font-bold tracking-tight">S&amp;B Tracker</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Savings and Bills Tracker
                  </span>
                </div>
                <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                  Track Your Bills. Build Your Savings.
                </p>
              </div>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-balance">
              Take control of your bills and savings, one day at a time.
            </h1>
            <p
              className="mt-4 text-base leading-relaxed max-w-2xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Stay prepared for upcoming bills, plan your daily savings, and track your progress toward your financial goals. Make every peso count with a clearer financial plan.
            </p>
          </div>

          {/* Three Feature Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="pw-surface rounded-2xl p-4 flex flex-col gap-2.5"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-sm font-bold">{feat.title}</h2>
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {feat.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subtle Financial Illustration */}
          <div className="pw-surface rounded-2xl overflow-hidden">
            {!imgError ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 items-center">
                <div className="sm:col-span-5 h-44 sm:h-40 overflow-hidden bg-[var(--bg-surface-muted)]">
                  <img
                    src={financeIllustration}
                    alt="Wallet, coins, bill checklist, and upward savings progress illustration"
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="sm:col-span-7 p-4 sm:p-5 space-y-2">
                  <p className="font-display text-sm font-bold">
                    Daily clarity for bills and savings
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Separate scheduled bills from manual savings deposits so you always know what you need to set aside each day and how close you are to your targets.
                  </p>
                  <div className="flex items-center gap-2 text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                    <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                    <span>Your financial data stays private to your account.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    <PiggyBank className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold">
                      Track Your Bills. Build Your Savings.
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Your financial data stays private to your account.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SECTION — LOGIN AND REGISTRATION */}
        <div className="lg:col-span-5">
          <div className="pw-surface rounded-2xl p-6 sm:p-8 shadow-sm">
            {mode !== 'forgot' ? (
              <div
                className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-6"
                style={{ backgroundColor: 'var(--bg-surface-muted)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setForgotMessage(null);
                  }}
                  className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                    mode === 'login' ? 'pw-surface shadow-sm' : ''
                  }`}
                  style={{
                    color: mode === 'login' ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setForgotMessage(null);
                  }}
                  className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                    mode === 'register' ? 'pw-surface shadow-sm' : ''
                  }`}
                  style={{
                    color: mode === 'register' ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  Create Account
                </button>
              </div>
            ) : (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setForgotMessage(null);
                  }}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  ← Back to Sign In
                </button>
                <h2 className="font-display text-lg font-bold mt-2">Reset Password</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Enter your account email address to check recovery options.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label htmlFor="auth-name" className="block text-sm font-medium mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maria Dela Cruz"
                    className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium mb-1.5">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="auth-password" className="block text-sm font-medium">
                      Password
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setError(null);
                          setForgotMessage(null);
                        }}
                        className="text-xs font-semibold hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                      className="pw-input w-full rounded-xl pl-3.5 pr-11 py-2.5 text-sm min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl px-3.5 py-2.5 text-sm font-medium"
                  style={{ backgroundColor: 'var(--status-bad-bg)', color: 'var(--status-bad)' }}
                >
                  {error}
                </div>
              )}

              {forgotMessage && (
                <div
                  role="status"
                  className="rounded-xl px-3.5 py-2.5 text-xs font-medium leading-relaxed"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-soft-text)' }}
                >
                  {forgotMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || demoLoading}
                className="pw-btn-primary w-full rounded-xl py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-60 whitespace-nowrap"
              >
                <span>
                  {loading
                    ? mode === 'register'
                      ? 'Creating account...'
                      : mode === 'forgot'
                        ? 'Checking...'
                        : 'Signing in...'
                    : mode === 'register'
                      ? 'Create Account'
                      : mode === 'forgot'
                        ? 'Check Recovery Options'
                        : 'Sign In'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs text-center mb-3" style={{ color: 'var(--text-muted)' }}>
                Want to explore first? Try a temporary demo account with sample bills and savings goals.
              </p>
              <button
                type="button"
                onClick={handleDemo}
                disabled={loading || demoLoading}
                className="pw-btn-secondary w-full rounded-xl py-2.5 px-4 text-sm font-medium min-h-[44px] disabled:opacity-60 whitespace-nowrap"
              >
                {demoLoading ? 'Preparing demo account...' : 'Try Demo Account'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
