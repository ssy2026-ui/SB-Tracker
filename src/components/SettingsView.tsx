import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  Download,
  EyeOff,
  Lock,
  LogOut,
  Palette,
  Shield,
  Trash2,
  User,
} from 'lucide-react';
import { api, ApiError, WorkspaceState } from '../lib/api';
import {
  BudgetFrequency,
  CURRENCIES,
  CurrencyCode,
  formatIsoDate,
  fromCents,
  THEMES,
  ThemeId,
  toCents,
  UserType,
} from '../shared/finance';

export function SettingsView({
  state,
  onReload,
  onThemePreview,
  onLoggedOut,
  onNotify,
}: {
  state: WorkspaceState;
  onReload: () => Promise<void>;
  onThemePreview: (theme: ThemeId) => void;
  onLoggedOut: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const { user } = state;

  // Theme selection & preview
  const [previewTheme, setPreviewTheme] = useState<ThemeId>(user.theme);
  const [savingTheme, setSavingTheme] = useState(false);
  const themeRequestSeqRef = useRef(0);

  // Profile, Income & Currency
  const [name, setName] = useState(user.name);
  const [userType, setUserType] = useState<UserType>(user.userType);
  const [currency, setCurrency] = useState<CurrencyCode>(user.currency);
  const [budgetFrequency, setBudgetFrequency] = useState<BudgetFrequency>(user.budgetFrequency);
  const [incomeInput, setIncomeInput] = useState(String(fromCents(user.incomeCents)));
  const [savingProfile, setSavingProfile] = useState(false);

  // Privacy & Notifications
  const [hideBalances, setHideBalances] = useState(user.privacyHideBalances);
  const [notifBillReminders, setNotifBillReminders] = useState(user.notifBillReminders);
  const [notifDailySavings, setNotifDailySavings] = useState(user.notifDailySavingsReminder);
  const [notifMissedSavings, setNotifMissedSavings] = useState(user.notifMissedSavingsAlert);
  const [notifMilestone, setNotifMilestone] = useState(user.notifSavingsMilestone);
  const [browserNotifs, setBrowserNotifs] = useState(user.browserNotificationsEnabled);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (!savingTheme) {
      setPreviewTheme(user.theme);
    }
  }, [user.theme, savingTheme]);

  useEffect(() => {
    setName(user.name);
    setUserType(user.userType);
    setCurrency(user.currency);
    setBudgetFrequency(user.budgetFrequency);
    setIncomeInput(String(fromCents(user.incomeCents)));
    setHideBalances(user.privacyHideBalances);
    setNotifBillReminders(user.notifBillReminders);
    setNotifDailySavings(user.notifDailySavingsReminder);
    setNotifMissedSavings(user.notifMissedSavingsAlert);
    setNotifMilestone(user.notifSavingsMilestone);
    setBrowserNotifs(user.browserNotificationsEnabled);
  }, [
    user.id,
    user.name,
    user.userType,
    user.currency,
    user.budgetFrequency,
    user.incomeCents,
    user.privacyHideBalances,
    user.notifBillReminders,
    user.notifDailySavingsReminder,
    user.notifMissedSavingsAlert,
    user.notifSavingsMilestone,
    user.browserNotificationsEnabled,
  ]);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // Account deletion
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const selectedThemeMeta = THEMES.find((t) => t.id === previewTheme) || THEMES[0];

  async function handleSelectTheme(id: ThemeId) {
    const reqId = ++themeRequestSeqRef.current;
    setPreviewTheme(id);
    onThemePreview(id);
    setSavingTheme(true);
    try {
      await api.updateProfile({ theme: id });
      if (themeRequestSeqRef.current !== reqId) return;
      await onReload();
      if (themeRequestSeqRef.current === reqId) {
        onThemePreview(id);
        onNotify(`Theme updated to ${THEMES.find((t) => t.id === id)?.name}.`);
      }
    } catch (err) {
      if (themeRequestSeqRef.current === reqId) {
        onThemePreview(user.theme);
        setPreviewTheme(user.theme);
        onNotify(err instanceof ApiError ? err.message : 'Unable to save theme.', true);
      }
    } finally {
      if (themeRequestSeqRef.current === reqId) {
        setSavingTheme(false);
      }
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      onNotify('Please enter a name with at least 2 characters.', true);
      return;
    }
    const parsedIncome = Number(incomeInput);
    if (!Number.isFinite(parsedIncome) || parsedIncome < 0) {
      onNotify('Please enter a valid non-negative income or allowance.', true);
      return;
    }
    setSavingProfile(true);
    try {
      await api.updateProfile({ name: name.trim(), userType, currency, theme: previewTheme });
      await api.saveBudget({
        incomeCents: toCents(parsedIncome),
        budgetFrequency,
      });
      await onReload();
      onNotify('Profile, income, and currency settings saved.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to update profile.', true);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleToggleBrowserNotifications(enabled: boolean) {
    if (enabled && typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          onNotify('Browser notifications permission was not granted.', true);
          setBrowserNotifs(false);
          return;
        }
      } else if (Notification.permission === 'denied') {
        onNotify('Browser notifications are blocked in your browser settings.', true);
        setBrowserNotifs(false);
        return;
      }
    }
    setBrowserNotifs(enabled);
  }

  async function handleSavePreferences() {
    setSavingPrefs(true);
    try {
      await api.updateProfile({
        theme: previewTheme,
        privacyHideBalances: hideBalances,
        notifBillReminders,
        notifDailySavingsReminder: notifDailySavings,
        notifMissedSavingsAlert: notifMissedSavings,
        notifSavingsMilestone: notifMilestone,
        browserNotificationsEnabled: browserNotifs,
      });
      await onReload();
      onNotify('Notification and privacy preferences saved.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to save preferences.', true);
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      onNotify('New password must be at least 8 characters long.', true);
      return;
    }
    if (newPassword !== confirmPassword) {
      onNotify('New passwords do not match.', true);
      return;
    }
    setSavingPass(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onNotify('Password updated securely.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to change password.', true);
    } finally {
      setSavingPass(false);
    }
  }

  async function handleExportJson() {
    try {
      const data = await api.exportAllJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sb-tracker-backup-${formatIsoDate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('Full financial backup exported.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to export data.', true);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
      onLoggedOut();
    } catch {
      onLoggedOut();
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirmText !== 'DELETE') {
      onNotify('Please type DELETE to confirm account removal.', true);
      return;
    }
    setDeletingAccount(true);
    try {
      await api.deleteAccount({ password: deletePassword });
      onLoggedOut();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to delete account.', true);
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          Settings & Personalization
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Customize your app theme, profile, currency, budgeting schedule, notifications, and account security.
        </p>
      </div>

      {/* A. CUSTOMIZABLE APP THEMES WITH LIVE PREVIEW */}
      <section className="pw-surface rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="font-display text-lg font-bold">App Theme & Color Palette</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Click any theme below to apply it across the app and save it to your account.
              </p>
            </div>
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {savingTheme ? 'Saving...' : `Active: ${selectedThemeMeta.name}`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {THEMES.map((theme) => {
            const isSelected = previewTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleSelectTheme(theme.id)}
                className="p-3 rounded-xl border text-left transition-all"
                style={{
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
                  backgroundColor: isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)',
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className="w-5 h-5 rounded-md border"
                    style={{ backgroundColor: theme.preview.canvas, borderColor: '#cbd5e1' }}
                  />
                  <span
                    className="w-5 h-5 rounded-md border"
                    style={{ backgroundColor: theme.preview.surface, borderColor: '#cbd5e1' }}
                  />
                  <span
                    className="w-5 h-5 rounded-md"
                    style={{ backgroundColor: theme.preview.accent }}
                  />
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold truncate">{theme.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Theme Preview Box */}
        <div
          className="rounded-xl p-4 sm:p-5 border transition-colors"
          style={{
            backgroundColor: selectedThemeMeta.preview.canvas,
            borderColor: selectedThemeMeta.preview.muted + '40',
            color: selectedThemeMeta.preview.text,
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold" style={{ color: selectedThemeMeta.preview.muted }}>
                Active Theme · {selectedThemeMeta.name}
              </p>
              <p className="font-display text-base font-bold">
                {selectedThemeMeta.description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div
                className="rounded-lg px-3.5 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: selectedThemeMeta.preview.surface,
                  color: selectedThemeMeta.preview.text,
                  border: `1px solid ${selectedThemeMeta.preview.muted}40`,
                }}
              >
                Sample Card: ₱1,750
              </div>
              {previewTheme !== 'sage-green' && (
                <button
                  type="button"
                  onClick={() => handleSelectTheme('sage-green')}
                  disabled={savingTheme}
                  className="pw-btn-secondary rounded-lg px-3.5 py-2 text-xs font-medium disabled:opacity-60"
                >
                  Reset to Default
                </button>
              )}
              <span
                className="rounded-lg px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
                style={{
                  backgroundColor: selectedThemeMeta.preview.accent,
                  color: selectedThemeMeta.isDark ? '#071426' : '#FFFFFF',
                }}
              >
                <Check className="w-3.5 h-3.5" />
                {savingTheme ? 'Saving...' : 'Active & Saved'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* B. PROFILE, INCOME & CURRENCY */}
      <section className="pw-surface rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <User className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="font-display text-lg font-bold">Profile, Income & Currency</h2>
        </div>

        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="set-name" className="block text-sm font-medium mb-1">
              Display Name
            </label>
            <input
              id="set-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
            />
          </div>

          <div>
            <label htmlFor="set-type" className="block text-sm font-medium mb-1">
              User Profile Type
            </label>
            <select
              id="set-type"
              value={userType}
              onChange={(e) => setUserType(e.target.value as UserType)}
              className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
            >
              <option value="student">Student</option>
              <option value="employee">Employee</option>
              <option value="entrepreneur">Entrepreneur</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-currency" className="block text-sm font-medium mb-1">
              Preferred Currency
            </label>
            <select
              id="set-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
            >
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol}) — {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="set-frequency" className="block text-sm font-medium mb-1">
              Budgeting Frequency
            </label>
            <select
              id="set-frequency"
              value={budgetFrequency}
              onChange={(e) => setBudgetFrequency(e.target.value as BudgetFrequency)}
              className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="twice_monthly">Twice a month</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="set-income" className="block text-sm font-medium mb-1">
              Available {budgetFrequency.replace('_', ' ')} Income / Allowance ({CURRENCIES[currency].symbol})
            </label>
            <input
              id="set-income"
              type="number"
              min="0"
              step="0.01"
              required
              value={incomeInput}
              onChange={(e) => setIncomeInput(e.target.value)}
              className="pw-input font-num w-full rounded-xl px-3.5 py-2.5 text-sm font-semibold min-h-[44px]"
            />
          </div>

          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="pw-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px]"
            >
              {savingProfile ? 'Saving...' : 'Save Profile & Income'}
            </button>
          </div>
        </form>
      </section>

      {/* C. NOTIFICATIONS & PRIVACY */}
      <section className="pw-surface rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <Bell className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <div>
            <h2 className="font-display text-lg font-bold">Notifications &amp; Privacy</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              S&amp;B Tracker only sends bill and savings alerts you turn on.
            </p>
          </div>
        </div>

        {/* Account Privacy Information */}
        <div
          className="rounded-xl p-4 border text-xs space-y-1"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-muted)' }}
        >
          <p className="font-semibold text-sm">Account Privacy Information</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Signed in as <span className="font-semibold">{user.email}</span>. Your bills, expenses, and savings goals stay private to your account.
          </p>
        </div>

        {/* Bill Reminders */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Bill Reminders
          </p>
          <label className="flex items-start justify-between gap-4 py-1.5 cursor-pointer">
            <div>
              <span className="text-sm font-medium block">
                Upcoming, due today, and overdue bill reminders
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Notifies you 3 days before, 1 day before, on the due date, and if overdue until marked paid.
              </span>
            </div>
            <input
              type="checkbox"
              checked={notifBillReminders}
              onChange={(e) => setNotifBillReminders(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[var(--accent)] shrink-0"
            />
          </label>
        </div>

        {/* Savings Deposit Reminders */}
        <div className="space-y-2.5 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Savings Deposit Reminders
          </p>
          {[
            {
              label: 'Daily savings deposit reminder',
              desc: "Reminds you of each active goal's planned daily deposit if not yet recorded today.",
              checked: notifDailySavings,
              onChange: setNotifDailySavings,
            },
            {
              label: 'Missed savings deposit alert',
              desc: 'Notifies you once if yesterday’s planned daily deposit was not recorded (never changes balances automatically).',
              checked: notifMissedSavings,
              onChange: setNotifMissedSavings,
            },
            {
              label: 'Savings goal milestone alerts (25%, 50%, 75%, 100%)',
              desc: 'Celebrates progress milestones as your recorded savings deposits grow.',
              checked: notifMilestone,
              onChange: setNotifMilestone,
            },
          ].map((item) => (
            <label key={item.label} className="flex items-start justify-between gap-4 py-1.5 cursor-pointer">
              <div>
                <span className="text-sm font-medium block">{item.label}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {item.desc}
                </span>
              </div>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => item.onChange(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[var(--accent)] shrink-0"
              />
            </label>
          ))}
        </div>

        {/* Notification Permissions & Financial Data Privacy */}
        <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Notification Permissions &amp; Financial Data Privacy
          </p>

          <label className="flex items-start justify-between gap-4 py-1.5 cursor-pointer">
            <div>
              <span className="text-sm font-medium block">Browser notification alerts</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {typeof Notification === 'undefined'
                  ? 'Browser notifications are not supported in this browser.'
                  : Notification.permission === 'granted'
                    ? 'Browser permission granted. Receive alerts on this device when enabled.'
                    : Notification.permission === 'denied'
                      ? 'Blocked in browser settings. Allow notifications for this site to enable.'
                      : 'Requires explicit browser permission when turned on.'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={browserNotifs}
              onChange={(e) => handleToggleBrowserNotifications(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[var(--accent)] shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-4 py-1.5 cursor-pointer">
            <div className="flex items-start gap-2">
              <EyeOff className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div>
                <span className="text-sm font-medium block">Financial data privacy: Hide monetary balances</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Masks amounts on screen when browsing in public.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={hideBalances}
              onChange={(e) => setHideBalances(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[var(--accent)] shrink-0"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSavePreferences}
            disabled={savingPrefs}
            className="pw-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px] whitespace-nowrap"
          >
            {savingPrefs ? 'Saving...' : 'Save Notification & Privacy Settings'}
          </button>
        </div>
      </section>

      {/* D. PASSWORD & SECURITY */}
      {!user.isDemo && (
        <section className="pw-surface rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h2 className="font-display text-lg font-bold">Password & Account Security</h2>
          </div>

          <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="pw-cur" className="block text-sm font-medium mb-1">
                Current Password
              </label>
              <input
                id="pw-cur"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="pw-new" className="block text-sm font-medium mb-1">
                New Password
              </label>
              <input
                id="pw-new"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="pw-conf" className="block text-sm font-medium mb-1">
                Confirm New Password
              </label>
              <input
                id="pw-conf"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={savingPass}
                className="pw-btn-secondary rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px]"
              >
                {savingPass ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* E. DATA EXPORT, LOGOUT & ACCOUNT DELETION */}
      <section className="pw-surface rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="font-display text-lg font-bold">Data Export & Account Actions</h2>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Export Financial Data</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Download a JSON copy of your bills, expenses, savings goals, and periods.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportJson}
            className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>Export Full Backup</span>
          </button>
        </div>

        <div className="pt-4 border-t flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <p className="text-sm font-semibold">Sign Out</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Signed in as {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 min-h-[44px]"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>

        <div className="pt-4 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--status-bad)' }}>
                Delete Account
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Permanently removes your profile, categories, transactions, and savings goals.
              </p>
            </div>
            {!deleteOpen && (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 min-h-[44px] border"
                style={{ borderColor: 'var(--status-bad)', color: 'var(--status-bad)' }}
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Account</span>
              </button>
            )}
          </div>

          {deleteOpen && (
            <form
              onSubmit={handleDeleteAccount}
              className="p-4 rounded-xl space-y-3"
              style={{ backgroundColor: 'var(--status-bad-bg)' }}
            >
              <p className="text-xs font-semibold" style={{ color: 'var(--status-bad)' }}>
                This action cannot be undone. Type DELETE below to confirm.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder='Type "DELETE"'
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="pw-input rounded-xl px-3.5 py-2 text-sm min-h-[42px]"
                />
                {!user.isDemo && (
                  <input
                    type="password"
                    required
                    placeholder="Enter your password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="pw-input rounded-xl px-3.5 py-2 text-sm min-h-[42px]"
                  />
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirmText('');
                    setDeletePassword('');
                  }}
                  className="pw-btn-secondary rounded-xl px-4 py-2 text-xs font-medium min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deletingAccount}
                  className="rounded-xl px-4 py-2 text-xs font-semibold min-h-[40px]"
                  style={{ backgroundColor: 'var(--status-bad)', color: '#FFFFFF' }}
                >
                  {deletingAccount ? 'Deleting...' : 'Permanently Delete Account'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
