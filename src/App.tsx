import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  LayoutDashboard,
  PiggyBank,
  Plus,
  Receipt,
  Settings,
  Wallet,
} from 'lucide-react';
import { api, ApiError, WorkspaceState } from './lib/api';
import {
  ExpenseTransaction,
  ThemeId,
  UserProfile,
} from './shared/finance';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingWizard } from './components/OnboardingWizard';
import { DashboardView, NavTab } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { SavingsView } from './components/SavingsView';
import { SettingsView } from './components/SettingsView';
import { ExpenseModal } from './components/Modals';

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
  { id: 'transactions', label: 'Bills & Spend', mobileLabel: 'Bills', icon: Receipt },
  { id: 'savings', label: 'Savings', mobileLabel: 'Savings', icon: PiggyBank },
  { id: 'settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [authUser, setAuthUser] = useState<UserProfile | null>(null);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  // Modals & notifications
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<ExpenseTransaction | null>(null);
  const [defaultCatId, setDefaultCatId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);
  const notifiedBrowserIdsRef = useRef<Set<string>>(new Set());

  const applyTheme = useCallback((theme: ThemeId) => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  const showToast = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError });
    window.setTimeout(() => {
      setToast((cur) => (cur?.msg === msg ? null : cur));
    }, 3600);
  }, []);

  const loadWorkspace = useCallback(
    async (periodKey?: string, isInitialBoot = false) => {
      try {
        const ws = await api.getState(periodKey);
        setState(ws);
        setAuthUser(ws.user);
        applyTheme(ws.user.theme);
        if (
          ws.user.browserNotificationsEnabled &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          for (const n of ws.notifications) {
            if (!n.isRead && !notifiedBrowserIdsRef.current.has(n.id)) {
              notifiedBrowserIdsRef.current.add(n.id);
              try {
                new Notification(n.title, { body: n.message });
              } catch {
                // ignore browser notification errors in restricted frames
              }
            }
          }
        }
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setState(null);
          setAuthUser(null);
          if (!isInitialBoot) {
            showToast('Session could not be verified. Please sign in again.', true);
          }
        } else {
          showToast(err instanceof ApiError ? err.message : 'Unable to load workspace.', true);
        }
        return false;
      }
    },
    [applyTheme, showToast]
  );

  useEffect(() => {
    (async () => {
      await loadWorkspace(undefined, true);
      setBooting(false);
    })();
  }, [loadWorkspace]);

  async function handleAuthenticated(user: UserProfile) {
    applyTheme(user.theme);
    const ok = await loadWorkspace();
    if (ok) {
      setActiveTab('dashboard');
    }
  }

  async function handleOnboardingComplete(user: UserProfile) {
    setAuthUser(user);
    applyTheme(user.theme);
    await loadWorkspace();
    setActiveTab('dashboard');
    showToast('Welcome to S&B Tracker!');
  }

  async function handleSelectPeriod(periodKey: string) {
    setSelectedPeriodKey(periodKey);
    await loadWorkspace(periodKey);
  }

  async function handleMarkAllRead() {
    try {
      await api.markNotificationsRead();
      await loadWorkspace(selectedPeriodKey);
    } catch {
      // ignore
    }
  }

  const toastBanner = toast ? (
    <div
      role="status"
      className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg max-w-sm"
      style={{
        backgroundColor: toast.isError ? 'var(--status-bad)' : 'var(--accent)',
        color: toast.isError ? '#FFFFFF' : 'var(--accent-fg)',
      }}
    >
      {toast.msg}
    </div>
  ) : null;

  if (booting) {
    return (
      <div className="min-h-screen pw-canvas flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div
            className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center animate-pulse"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Wallet className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            Loading S&amp;B Tracker...
          </p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <>
        <AuthScreen onAuthenticated={handleAuthenticated} />
        {toastBanner}
      </>
    );
  }

  if (!authUser.onboardingCompleted) {
    return (
      <>
        <OnboardingWizard user={authUser} onCompleted={handleOnboardingComplete} />
        {toastBanner}
      </>
    );
  }

  if (!state) {
    return null;
  }

  const unreadCount = state.notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen pw-canvas flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 pw-sidebar border-r z-30">
        <div className="px-6 py-5 flex items-center gap-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Wallet className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-display text-lg font-bold tracking-tight block leading-none">
              S&amp;B Tracker
            </span>
            <span className="text-[10px] font-medium block mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
              Savings &amp; Bills Tracker
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                  active ? 'pw-nav-active font-semibold' : 'hover:bg-[var(--bg-surface-muted)]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => {
              setEditingTx(null);
              setDefaultCatId(null);
              setExpenseModalOpen(true);
            }}
            className="pw-btn-primary w-full rounded-xl py-2.5 px-3 text-sm font-semibold flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
          <div className="px-1">
            <p className="text-xs font-semibold truncate">{state.user.name}</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
              {state.user.email}
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header
          className="sticky top-0 z-20 pw-sidebar border-b px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 lg:hidden">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <Wallet className="w-4 h-4" />
              </div>
              <span className="font-display font-bold text-base">S&amp;B Tracker</span>
            </div>
            <span className="hidden lg:inline text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <select
              aria-label="Active budgeting period"
              value={state.selectedPeriod.periodKey}
              onChange={(e) => handleSelectPeriod(e.target.value)}
              className="pw-input rounded-xl px-3 py-1.5 text-xs font-medium min-h-[38px] max-w-[190px]"
            >
              {state.historicalPeriods.map((hp) => (
                <option key={hp.periodKey} value={hp.periodKey}>
                  {hp.label}
                </option>
              ))}
            </select>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
                className="pw-btn-secondary relative rounded-xl p-2 min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ backgroundColor: 'var(--status-bad)', color: '#FFFFFF' }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 pw-surface rounded-2xl p-4 shadow-xl z-40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-display text-sm font-bold">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-xs font-semibold hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {state.notifications.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                      No alerts yet.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {state.notifications.slice(0, 8).map((n) => (
                        <div
                          key={n.id}
                          className="p-2.5 rounded-xl text-xs border"
                          style={{
                            borderColor: 'var(--border-subtle)',
                            backgroundColor: n.isRead ? 'transparent' : 'var(--bg-surface-muted)',
                          }}
                        >
                          <p className="font-semibold">{n.title}</p>
                          <p className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {n.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Demo Mode Banner (explicitly labels demonstration data) */}
        {state.user.isDemo && (
          <div
            className="px-4 sm:px-6 lg:px-8 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-2 border-b"
            style={{
              backgroundColor: 'var(--accent-soft)',
              color: 'var(--accent-soft-text)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span>
              Viewing Sample Demonstration Data — You can test every feature freely or log out in Settings to create your own personal account.
            </span>
            <button
              type="button"
              onClick={async () => {
                await api.logout();
                setState(null);
                setAuthUser(null);
                applyTheme('sage-green');
              }}
              className="font-semibold underline whitespace-nowrap"
            >
              Exit Demo
            </button>
          </div>
        )}

        {/* Historical Period Banner */}
        {!state.isViewingCurrentPeriod && (
          <div
            className="px-4 sm:px-6 lg:px-8 py-2.5 text-xs font-medium flex items-center justify-between gap-2 border-b"
            style={{
              backgroundColor: 'var(--status-warn-bg)',
              color: 'var(--status-warn)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span>Reviewing previous budgeting period: {state.selectedPeriod.label}</span>
            <button
              type="button"
              onClick={() => handleSelectPeriod(state.currentPeriod.periodKey)}
              className="font-semibold underline whitespace-nowrap"
            >
              Return to Current Period
            </button>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-6xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              state={state}
              onNavigate={setActiveTab}
              onOpenAddExpense={(catId) => {
                setEditingTx(null);
                setDefaultCatId(catId || null);
                setExpenseModalOpen(true);
              }}
              onMarkAllRead={handleMarkAllRead}
              onReload={async () => { await loadWorkspace(selectedPeriodKey); }}
              onNotify={showToast}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsView
              state={state}
              onOpenAddExpense={() => {
                setEditingTx(null);
                setDefaultCatId(null);
                setExpenseModalOpen(true);
              }}
              onOpenEditExpense={(tx) => {
                setEditingTx(tx);
                setExpenseModalOpen(true);
              }}
              onSelectPeriod={handleSelectPeriod}
              onReload={async () => { await loadWorkspace(selectedPeriodKey); }}
              onNotify={showToast}
            />
          )}

          {activeTab === 'savings' && (
            <SavingsView
              state={state}
              onReload={async () => { await loadWorkspace(selectedPeriodKey); }}
              onNotify={showToast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              state={state}
              onReload={async () => { await loadWorkspace(selectedPeriodKey); }}
              onThemePreview={applyTheme}
              onLoggedOut={() => {
                setState(null);
                setAuthUser(null);
                applyTheme('sage-green');
              }}
              onNotify={showToast}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 pw-sidebar border-t grid grid-cols-4 h-16"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors"
              style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-full px-1">{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      <ExpenseModal
        open={expenseModalOpen}
        currency={state.user.currency}
        categories={state.categories}
        initialTx={editingTx}
        defaultCategoryId={defaultCatId}
        onClose={() => setExpenseModalOpen(false)}
        onSaved={async (msg) => {
          await loadWorkspace(selectedPeriodKey);
          showToast(msg);
        }}
      />

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg max-w-sm"
          style={{
            backgroundColor: toast.isError ? 'var(--status-bad)' : 'var(--accent)',
            color: toast.isError ? '#FFFFFF' : 'var(--accent-fg)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
