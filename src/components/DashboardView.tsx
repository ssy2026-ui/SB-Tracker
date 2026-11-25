import React, { useState } from 'react';
import {
  ArrowRight,
  Calculator,
  CalendarClock,
  HelpCircle,
  PiggyBank,
  Plus,
  TrendingDown,
  Wallet,
  X,
} from 'lucide-react';
import { WorkspaceState } from '../lib/api';
import {
  diffDaysIso,
  formatIsoDate,
  formatMoney,
} from '../shared/finance';
import { SavingsGoalsTracker } from './SavingsGoalsTracker';

export type NavTab = 'dashboard' | 'transactions' | 'savings' | 'settings';

export function DashboardView({
  state,
  onNavigate,
  onOpenAddExpense,
  onMarkAllRead,
  onReload,
  onNotify,
}: {
  state: WorkspaceState;
  onNavigate: (tab: NavTab) => void;
  onOpenAddExpense: (categoryId?: string) => void;
  onMarkAllRead: () => void;
  onReload: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const {
    user,
    periodTransactions,
    expectedBills,
    savingsGoals,
    notifications,
    selectedPeriod,
  } = state;
  const [guideOpen, setGuideOpen] = useState(false);
  const hide = user.privacyHideBalances;
  const todayStr = formatIsoDate(new Date());

  let totalExpensesCents = 0;
  for (const tx of periodTransactions) {
    totalExpensesCents += tx.amountCents;
  }

  const unpaidBills = expectedBills.filter((b) => !b.isPaid);
  const totalUnpaidBillsCents = unpaidBills.reduce((s, b) => s + b.amountCents, 0);
  const remainingBudgetCents = user.incomeCents - totalExpensesCents;
  const remainingAfterBillsCents = remainingBudgetCents - totalUnpaidBillsCents;
  const activeGoals = savingsGoals.filter((g) => g.status !== 'paused');
  const totalSavingsCents = activeGoals.reduce((s, g) => s + g.currentCents, 0);
  const unreadAlerts = notifications.filter((n) => !n.isRead);

  return (
    <div className="space-y-6">
      {/* Top Action Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {selectedPeriod.label} · {user.budgetFrequency.replace('_', ' ')} budget
            {state.isViewingCurrentPeriod && user.budgetFrequency !== 'daily'
              ? ` · ${selectedPeriod.daysRemaining} day${selectedPeriod.daysRemaining === 1 ? '' : 's'} left`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="pw-btn-secondary rounded-xl px-3.5 py-2.5 text-sm font-medium flex items-center gap-2 min-h-[44px] whitespace-nowrap"
          >
            <HelpCircle className="w-4 h-4" />
            <span>How S&amp;B Tracker Works</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenAddExpense()}
            className="pw-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 min-h-[44px] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="pw-surface rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Available Income
            </span>
            <Wallet className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <p className="font-num text-xl sm:text-2xl font-bold mt-2">
            {formatMoney(user.incomeCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1 capitalize" style={{ color: 'var(--text-muted)' }}>
            {user.budgetFrequency.replace('_', ' ')} period
          </p>
        </div>

        <div className="pw-surface rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Total Expenses
            </span>
            <TrendingDown className="w-4 h-4" style={{ color: 'var(--status-warn)' }} />
          </div>
          <p className="font-num text-xl sm:text-2xl font-bold mt-2">
            {formatMoney(totalExpensesCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1 font-num" style={{ color: 'var(--text-muted)' }}>
            {unpaidBills.length > 0
              ? `Unpaid bills: ${formatMoney(totalUnpaidBillsCents, user.currency, hide)}`
              : `${periodTransactions.length} transaction${periodTransactions.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="pw-surface rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Remaining Balance
            </span>
          </div>
          <p
            className="font-num text-xl sm:text-2xl font-bold mt-2"
            style={{ color: remainingBudgetCents < 0 ? 'var(--status-bad)' : 'var(--status-ok)' }}
          >
            {formatMoney(remainingBudgetCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1 font-num" style={{ color: 'var(--text-muted)' }}>
            {unpaidBills.length > 0
              ? `After bills: ${formatMoney(remainingAfterBillsCents, user.currency, hide)}`
              : remainingBudgetCents < 0
                ? 'Over period income'
                : 'Safe to spend'}
          </p>
        </div>

        <div className="pw-surface rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Total Savings
            </span>
            <PiggyBank className="w-4 h-4" style={{ color: 'var(--status-ok)' }} />
          </div>
          <p className="font-num text-xl sm:text-2xl font-bold mt-2">
            {formatMoney(totalSavingsCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Across {activeGoals.length} active goal{activeGoals.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Alerts & Upcoming Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="pw-surface rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-bold">Bill &amp; Savings Alerts</h2>
            {unreadAlerts.length > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>
              No active bill or savings alerts right now.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {notifications.slice(0, 4).map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-xl text-sm border"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: n.isRead ? 'transparent' : 'var(--bg-surface-muted)',
                  }}
                >
                  <p className="font-semibold text-xs">{n.title}</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {n.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pw-surface rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="font-display text-base font-bold">Upcoming Bills</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="text-xs font-semibold hover:underline whitespace-nowrap"
              style={{ color: 'var(--accent)' }}
            >
              Manage bills
            </button>
          </div>

          {unpaidBills.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No upcoming unpaid bills scheduled.
            </p>
          ) : (
            <div className="space-y-2">
              {unpaidBills.slice(0, 3).map((bill) => {
                const days = diffDaysIso(todayStr, bill.dueDate);
                const overdue = days < 0;
                const soon = days >= 0 && days <= 7;
                return (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between gap-2 text-xs py-1.5 border-b last:border-b-0"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{bill.name}</p>
                      <p
                        className="font-num"
                        style={{
                          color: overdue
                            ? 'var(--status-bad)'
                            : soon
                              ? 'var(--status-warn)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {overdue
                          ? `Overdue (${bill.dueDate})`
                          : days === 0
                            ? 'Due today'
                            : `Due ${bill.dueDate}`}
                      </p>
                    </div>
                    <span className="font-num font-bold shrink-0">
                      {formatMoney(bill.amountCents, user.currency, hide)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Personalized Savings Goals Tracker */}
      <SavingsGoalsTracker state={state} onReload={onReload} onNotify={onNotify} />

      {/* Recent Transactions */}
      <div className="pw-surface rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold">Recent Transactions</h2>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="text-xs font-semibold flex items-center gap-1 hover:underline whitespace-nowrap"
            style={{ color: 'var(--accent)' }}
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {periodTransactions.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No expenses recorded in this period yet.
            </p>
            <button
              type="button"
              onClick={() => onOpenAddExpense()}
              className="pw-btn-primary rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Add First Expense
            </button>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {periodTransactions.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                className="py-3 flex items-center justify-between gap-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg shrink-0">{tx.categoryIcon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-xs font-num" style={{ color: 'var(--text-muted)' }}>
                      {tx.categoryName} · {tx.txDate}
                    </p>
                  </div>
                </div>
                <span className="font-num text-sm font-semibold shrink-0">
                  -{formatMoney(tx.amountCents, user.currency, hide)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optional How S&B Tracker Works Guide Modal */}
      {guideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sb-guide-title"
        >
          <div className="pw-surface rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="sb-guide-title" className="font-display text-lg font-bold">
                  How S&amp;B Tracker Works
                </h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Track Your Bills. Build Your Savings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Close guide"
                className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                {
                  title: '1. Add and Schedule Bills',
                  desc: 'Open Bills & Spend to add recurring or one-time bills with due dates. Bills stay separate from actual expenses until you mark them paid.',
                  icon: CalendarClock,
                },
                {
                  title: '2. Calculate Daily Bill Funding',
                  desc: 'Your Daily Funding Target divides total scheduled monthly bills by 30 days (and multiplies by 7 for your weekly target) so you know what to set aside daily.',
                  icon: Calculator,
                },
                {
                  title: '3. Create Savings Goals',
                  desc: 'Add personal goals in the Savings Goals Tracker with a target amount and the daily deposit you can afford to see your estimated completion date.',
                  icon: PiggyBank,
                },
                {
                  title: '4. Record Deposits & Monitor Progress',
                  desc: 'Log deposits manually whenever you save. Only recorded deposits update your saved total, remaining balance, and completion progress.',
                  icon: Wallet,
                },
              ].map((stepItem) => {
                const StepIcon = stepItem.icon;
                return (
                  <div
                    key={stepItem.title}
                    className="flex items-start gap-3 p-3.5 rounded-xl border"
                    style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-muted)' }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <StepIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{stepItem.title}</p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {stepItem.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setGuideOpen(false);
                  onNavigate('transactions');
                }}
                className="pw-btn-secondary rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap"
              >
                Go to Bills &amp; Spend
              </button>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="pw-btn-primary rounded-xl px-5 py-2.5 text-xs font-semibold whitespace-nowrap"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
