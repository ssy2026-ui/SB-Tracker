import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { WorkspaceState } from '../lib/api';
import {
  calculateSavingsPlan,
  formatIsoDate,
  formatMoney,
  scaleMonthlyCentsToPeriod,
} from '../shared/finance';
import { SavingsGoalsTracker } from './SavingsGoalsTracker';

export function SavingsView({
  state,
  onReload,
  onNotify,
}: {
  state: WorkspaceState;
  onReload: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const { user, savingsGoals, savingsEntries } = state;
  const hide = user.privacyHideBalances;
  const todayStr = formatIsoDate(new Date());

  const activeGoals = savingsGoals.filter((g) => g.status !== 'paused');
  const totalSavedCents = savingsGoals.reduce((s, g) => s + g.currentCents, 0);
  const totalActiveTargetCents = activeGoals.reduce((s, g) => s + g.targetCents, 0);
  const totalActiveSavedCents = activeGoals.reduce((s, g) => s + g.currentCents, 0);

  const totalPlannedDailyCents = activeGoals.reduce((s, g) => {
    if (g.currentCents >= g.targetCents) return s;
    const plan = calculateSavingsPlan(g, todayStr);
    return s + plan.plannedDailyCents;
  }, 0);
  const totalPlannedMonthlyCents = totalPlannedDailyCents * 30;
  const totalPlannedInUserPeriodCents = scaleMonthlyCentsToPeriod(
    totalPlannedMonthlyCents,
    user.budgetFrequency
  );
  const exceedsBudget =
    user.incomeCents > 0 && totalPlannedInUserPeriodCents > user.incomeCents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          Savings Goals
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Set personalized savings targets, choose how much you can deposit daily, and track every manual deposit separately from expenses.
        </p>
      </div>

      {/* Warning if planned active savings contributions exceed available income */}
      {exceedsBudget && (
        <div
          role="alert"
          className="rounded-2xl p-4 border flex items-start gap-3"
          style={{
            backgroundColor: 'var(--status-warn-bg)',
            borderColor: 'var(--status-warn)',
            color: 'var(--status-warn)',
          }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">
              Planned active savings contributions ({formatMoney(totalPlannedInUserPeriodCents, user.currency, hide)} per{' '}
              {user.budgetFrequency.replace('_', ' ')}) exceed your available income of{' '}
              {formatMoney(user.incomeCents, user.currency, hide)}.
            </p>
            <p className="text-xs mt-0.5 opacity-90">
              Consider lowering a goal's daily deposit amount or pausing a lower-priority goal.
            </p>
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="pw-surface rounded-2xl p-5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Total Actual Saved
          </p>
          <p className="font-num text-2xl font-bold mt-1.5" style={{ color: 'var(--status-ok)' }}>
            {formatMoney(totalSavedCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            From manual deposits only
          </p>
        </div>
        <div className="pw-surface rounded-2xl p-5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Active Goals Target
          </p>
          <p className="font-num text-2xl font-bold mt-1.5">
            {formatMoney(totalActiveTargetCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {activeGoals.length} active · {savingsGoals.length - activeGoals.length} paused
          </p>
        </div>
        <div className="pw-surface rounded-2xl p-5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Daily Contribution Target
          </p>
          <p
            className="font-num text-2xl font-bold mt-1.5"
            style={{ color: exceedsBudget ? 'var(--status-warn)' : 'var(--text-primary)' }}
          >
            {formatMoney(totalPlannedDailyCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1 font-num" style={{ color: 'var(--text-muted)' }}>
            {formatMoney(totalPlannedMonthlyCents, user.currency, hide)} / month
          </p>
        </div>
        <div className="pw-surface rounded-2xl p-5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Active Progress
          </p>
          <p className="font-num text-2xl font-bold mt-1.5">
            {totalActiveTargetCents > 0
              ? `${Math.min(100, Math.round((totalActiveSavedCents / totalActiveTargetCents) * 100))}%`
              : '0%'}
          </p>
          <p className="text-xs mt-1 font-num" style={{ color: 'var(--text-muted)' }}>
            {formatMoney(Math.max(0, totalActiveTargetCents - totalActiveSavedCents), user.currency, hide)} remaining
          </p>
        </div>
      </div>

      <SavingsGoalsTracker
        state={state}
        onReload={onReload}
        onNotify={onNotify}
        title="Your Savings Goals"
        subtitle="Each goal tracks its own target, daily deposit pace, remaining balance, estimated completion date, and deposit history."
      />

      {savingsEntries.length > 0 && (
        <div className="pw-surface rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-bold">Recent Savings Activity</h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Kept separate from expenses
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {savingsEntries.slice(0, 12).map((e) => (
              <div
                key={e.id}
                className="py-3 flex items-center justify-between gap-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <p className="text-sm font-medium">
                    {e.goalName} · {e.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                  </p>
                  <p className="text-xs font-num" style={{ color: 'var(--text-muted)' }}>
                    {e.entryDate}
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                <span
                  className="font-num text-sm font-semibold"
                  style={{ color: e.type === 'deposit' ? 'var(--status-ok)' : 'var(--status-warn)' }}
                >
                  {e.type === 'deposit' ? '+' : '-'}
                  {formatMoney(e.amountCents, user.currency, hide)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
