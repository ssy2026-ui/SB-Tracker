import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit3,
  PauseCircle,
  PiggyBank,
  PlayCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError, WorkspaceState } from '../lib/api';
import {
  addDaysToIso,
  calculateSavingsPlan,
  CURRENCIES,
  formatIsoDate,
  formatMoney,
  fromCents,
  SavingsGoal,
  toCents,
} from '../shared/finance';
import { ConfirmModal } from './Modals';

function formatDurationEstimate(days: number): string {
  if (days <= 0) return 'Goal reached';
  const dayUnit = days === 1 ? 'day' : 'days';
  if (days < 30) return `${days} ${dayUnit}`;
  const months = Math.round((days / 30) * 10) / 10;
  const monthUnit = months === 1 ? 'month' : 'months';
  return `${days} ${dayUnit} (~${months} ${monthUnit})`;
}

export function SavingsGoalsTracker({
  state,
  onReload,
  onNotify,
  title = 'Personalized Savings Goals Tracker',
  subtitle = 'Create your own savings targets, set your daily deposit amount, and record manual deposits separately from expenses.',
}: {
  state: WorkspaceState;
  onReload: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
  title?: string;
  subtitle?: string;
}) {
  const { user, savingsGoals, savingsEntries } = state;
  const hide = user.privacyHideBalances;
  const currencyCfg = CURRENCIES[user.currency];
  const todayStr = formatIsoDate(new Date());

  // Create / Edit Goal modal
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDaily, setGoalDaily] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  // Deposit / Withdrawal modal
  const [entryModal, setEntryModal] = useState<{
    goal: SavingsGoal;
    type: 'deposit' | 'withdrawal';
  } | null>(null);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [entryDate, setEntryDate] = useState(todayStr);
  const [entryReqId, setEntryReqId] = useState(() => crypto.randomUUID());
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  // Delete goal confirm
  const [deleteTarget, setDeleteTarget] = useState<SavingsGoal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState(false);

  function openCreateGoal() {
    setEditingGoal(null);
    setGoalName('');
    setGoalTarget('');
    setGoalDaily('');
    setGoalError(null);
    setGoalModalOpen(true);
  }

  function openEditGoal(g: SavingsGoal) {
    const plan = calculateSavingsPlan(g, todayStr);
    const existingDailyCents = g.plannedDailyCents ?? plan.plannedDailyCents;
    setEditingGoal(g);
    setGoalName(g.name);
    setGoalTarget(String(fromCents(g.targetCents)));
    setGoalDaily(existingDailyCents > 0 ? String(fromCents(existingDailyCents)) : '');
    setGoalError(null);
    setGoalModalOpen(true);
  }

  async function handleSaveGoal(e: React.FormEvent) {
    e.preventDefault();
    setGoalError(null);
    const tVal = Number(goalTarget);
    const dVal = Number(goalDaily);
    if (!goalName.trim()) {
      setGoalError('Please enter a savings goal name.');
      return;
    }
    if (!Number.isFinite(tVal) || tVal <= 0) {
      setGoalError('Target amount must be greater than zero.');
      return;
    }
    if (!Number.isFinite(dVal) || dVal <= 0) {
      setGoalError('Daily contribution must be greater than zero.');
      return;
    }

    const targetCents = toCents(tVal);
    const dailyCents = toCents(dVal);
    const monthlyCents = dailyCents * 30;
    const remainingCents = Math.max(0, targetCents - (editingGoal?.currentCents || 0));
    const estDays = remainingCents > 0 ? Math.max(1, Math.ceil(remainingCents / dailyCents)) : 0;
    const estDate = remainingCents > 0 ? addDaysToIso(todayStr, estDays) : todayStr;
    const estMonths = Math.max(1, Math.round(estDays / 30));

    setSavingGoal(true);
    try {
      if (editingGoal) {
        await api.updateGoal(editingGoal.id, {
          name: goalName.trim(),
          targetCents,
          targetDate: estDate,
          durationMonths: estMonths,
          plannedDailyCents: dailyCents,
          plannedMonthlyCents: monthlyCents,
        });
        onNotify('Savings goal updated.');
      } else {
        await api.createGoal({
          name: goalName.trim(),
          icon: '🎯',
          targetCents,
          targetDate: estDate,
          durationMonths: estMonths,
          plannedDailyCents: dailyCents,
          plannedMonthlyCents: monthlyCents,
          status: 'active',
        });
        onNotify('Savings goal created.');
      }
      await onReload();
      setGoalModalOpen(false);
    } catch (err) {
      setGoalError(err instanceof ApiError ? err.message : 'Unable to save goal.');
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleTogglePause(goal: SavingsGoal) {
    setTogglingStatusId(goal.id);
    const nextStatus = goal.status === 'paused' ? 'active' : 'paused';
    try {
      await api.updateGoal(goal.id, { status: nextStatus });
      await onReload();
      onNotify(
        nextStatus === 'paused' ? `"${goal.name}" paused.` : `"${goal.name}" resumed.`
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to update goal status.', true);
    } finally {
      setTogglingStatusId(null);
    }
  }

  function openEntry(goal: SavingsGoal, type: 'deposit' | 'withdrawal') {
    setEntryModal({ goal, type });
    setEntryAmount('');
    setEntryNote('');
    setEntryDate(todayStr);
    setEntryReqId(crypto.randomUUID());
    setEntryError(null);
  }

  async function handleSaveEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!entryModal) return;
    setEntryError(null);
    const val = Number(entryAmount);
    if (!Number.isFinite(val) || val <= 0) {
      setEntryError('Please enter an amount greater than zero.');
      return;
    }
    const cents = toCents(val);
    if (entryModal.type === 'withdrawal' && cents > entryModal.goal.currentCents) {
      setEntryError(
        `You can withdraw at most ${formatMoney(entryModal.goal.currentCents, user.currency)}.`
      );
      return;
    }
    setSavingEntry(true);
    try {
      await api.recordSavingsEntry(entryModal.goal.id, {
        type: entryModal.type,
        amountCents: cents,
        note: entryNote.trim(),
        entryDate,
        clientRequestId: entryReqId,
      });
      await onReload();
      setEntryModal(null);
      onNotify(
        entryModal.type === 'deposit'
          ? `Deposited ${formatMoney(cents, user.currency)} into ${entryModal.goal.name} (not counted as an expense).`
          : `Withdrew ${formatMoney(cents, user.currency)} from ${entryModal.goal.name}.`
      );
    } catch (err) {
      setEntryError(err instanceof ApiError ? err.message : 'Unable to record savings entry.');
    } finally {
      setSavingEntry(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    setDeletingEntryId(entryId);
    try {
      await api.deleteSavingsEntry(entryId);
      await onReload();
      onNotify('Savings entry removed and goal balance updated.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to remove entry.', true);
    } finally {
      setDeletingEntryId(null);
    }
  }

  async function handleDeleteGoal() {
    if (!deleteTarget) return;
    setDeletingGoal(true);
    try {
      await api.deleteGoal(deleteTarget.id);
      await onReload();
      setDeleteTarget(null);
      onNotify('Savings goal deleted.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to delete goal.', true);
    } finally {
      setDeletingGoal(false);
    }
  }

  // Live modal completion estimate
  const previewTargetCents = toCents(Number(goalTarget) || 0);
  const previewDailyCents = toCents(Number(goalDaily) || 0);
  const previewRemainingCents = Math.max(0, previewTargetCents - (editingGoal?.currentCents || 0));
  const previewDays =
    previewTargetCents > 0 && previewDailyCents > 0
      ? previewRemainingCents > 0
        ? Math.max(1, Math.ceil(previewRemainingCents / previewDailyCents))
        : 0
      : null;
  const previewCompletionDate =
    previewDays !== null ? addDaysToIso(todayStr, previewDays) : null;

  return (
    <section className="pw-surface rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateGoal}
          className="pw-btn-primary rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold flex items-center gap-1.5 min-h-[40px] whitespace-nowrap self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Savings Goal</span>
        </button>
      </div>

      {savingsGoals.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-8 text-center space-y-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-surface-muted)', color: 'var(--accent)' }}
          >
            <PiggyBank className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold">No savings goals yet</p>
          <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
            Add your own custom goal such as buying a motorcycle, phone, laptop, or emergency fund. Enter your target amount and daily contribution to track progress automatically.
          </p>
          <button
            type="button"
            onClick={openCreateGoal}
            className="pw-btn-primary rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Create Your First Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {savingsGoals.map((goal) => {
            const isPaused = goal.status === 'paused';
            const plan = calculateSavingsPlan(goal, todayStr);
            const pct = plan.pctCompleted;
            const isCompleted = plan.remainingCents === 0 && goal.targetCents > 0;
            const goalEntries = savingsEntries.filter((e) => e.goalId === goal.id);
            const depositOnlyCount = goalEntries.filter((e) => e.type === 'deposit').length;
            const historyExpanded = Boolean(expandedHistoryIds[goal.id]);

            return (
              <div
                key={goal.id}
                className={`rounded-xl border p-4 sm:p-5 flex flex-col justify-between gap-4 ${
                  isPaused ? 'opacity-80' : ''
                }`}
                style={{
                  borderColor: 'var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold truncate">{goal.name}</h3>
                      <p className="text-xs font-num mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Target: {formatMoney(goal.targetCents, user.currency, hide)}
                        {plan.plannedDailyCents > 0
                          ? ` · ${formatMoney(plan.plannedDailyCents, user.currency, hide)}/day`
                          : ''}
                        {isPaused ? ' · Paused' : isCompleted ? ' · Completed' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={togglingStatusId === goal.id}
                        onClick={() => handleTogglePause(goal)}
                        title={isPaused ? 'Resume goal' : 'Pause goal'}
                        aria-label={isPaused ? `Resume ${goal.name}` : `Pause ${goal.name}`}
                        className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
                        style={{ color: isPaused ? 'var(--status-ok)' : 'var(--status-warn)' }}
                      >
                        {isPaused ? (
                          <PlayCircle className="w-4 h-4" />
                        ) : (
                          <PauseCircle className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditGoal(goal)}
                        aria-label={`Edit ${goal.name}`}
                        className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(goal)}
                        aria-label={`Delete ${goal.name}`}
                        className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
                        style={{ color: 'var(--status-bad)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Saved / Remaining / Estimate Summary */}
                  <div
                    className="grid grid-cols-3 gap-3 py-3 border-y"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Total Saved
                      </p>
                      <p
                        className="font-num text-sm font-bold mt-0.5"
                        style={{ color: 'var(--status-ok)' }}
                      >
                        {formatMoney(goal.currentCents, user.currency, hide)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Remaining
                      </p>
                      <p className="font-num text-sm font-bold mt-0.5">
                        {formatMoney(plan.remainingCents, user.currency, hide)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Est. Time Left
                      </p>
                      <p className="font-num text-sm font-bold mt-0.5">
                        {isCompleted
                          ? 'Done'
                          : plan.estimatedDaysNeeded !== null
                            ? `${plan.estimatedDaysNeeded}d`
                            : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar & Estimated Completion Date */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-num font-semibold" style={{ color: isCompleted ? 'var(--status-ok)' : 'var(--text-primary)' }}>
                        {pct}% completed
                      </span>
                      <span className="font-num flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Calendar className="w-3 h-3 shrink-0" />
                        {isCompleted
                          ? 'Target reached'
                          : plan.estimatedCompletionDate && plan.estimatedDaysNeeded !== null
                            ? `Est. ${plan.estimatedCompletionDate} (${formatDurationEstimate(plan.estimatedDaysNeeded)})`
                            : 'Set daily deposit to estimate'}
                      </span>
                    </div>
                    <div
                      className="h-2.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--bg-surface-muted)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isPaused ? 'var(--text-muted)' : 'var(--status-ok)',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions + Deposit History */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPaused}
                      onClick={() => openEntry(goal, 'deposit')}
                      className="pw-btn-primary flex-1 rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[40px] whitespace-nowrap disabled:opacity-50"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Add Deposit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEntry(goal, 'withdrawal')}
                      disabled={goal.currentCents <= 0}
                      className="pw-btn-secondary flex-1 rounded-xl py-2 px-3 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 min-h-[40px] whitespace-nowrap disabled:opacity-50"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Withdraw</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedHistoryIds((prev) => ({ ...prev, [goal.id]: !prev[goal.id] }))
                    }
                    className="w-full flex items-center justify-between text-xs font-semibold pt-1 hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    <span>
                      Deposit History ({depositOnlyCount} deposit{depositOnlyCount === 1 ? '' : 's'})
                    </span>
                    {historyExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {historyExpanded && (
                    <div
                      className="pt-2 border-t space-y-1.5 max-h-48 overflow-y-auto"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      {goalEntries.length === 0 ? (
                        <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                          No deposits recorded for {goal.name} yet.
                        </p>
                      ) : (
                        goalEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between gap-2 text-xs py-1"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {entry.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                                {entry.note ? ` · ${entry.note}` : ''}
                              </p>
                              <p className="font-num" style={{ color: 'var(--text-muted)' }}>
                                {entry.entryDate}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className="font-num font-semibold"
                                style={{
                                  color:
                                    entry.type === 'deposit'
                                      ? 'var(--status-ok)'
                                      : 'var(--status-warn)',
                                }}
                              >
                                {entry.type === 'deposit' ? '+' : '-'}
                                {formatMoney(entry.amountCents, user.currency, hide)}
                              </span>
                              <button
                                type="button"
                                disabled={deletingEntryId === entry.id}
                                onClick={() => handleDeleteEntry(entry.id)}
                                aria-label="Remove savings entry"
                                className="p-1 rounded hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Goal Modal */}
      {goalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="pw-surface rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">
                {editingGoal ? 'Edit Savings Goal' : 'Create Savings Goal'}
              </h3>
              <button
                type="button"
                onClick={() => setGoalModalOpen(false)}
                aria-label="Close goal modal"
                className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label htmlFor="sgt-name" className="block text-sm font-medium mb-1">
                  Goal Name
                </label>
                <input
                  id="sgt-name"
                  type="text"
                  required
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="e.g. Buy a Motorcycle, New Phone, Laptop, Emergency Fund"
                  className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sgt-target" className="block text-sm font-medium mb-1">
                    Target Amount ({currencyCfg.symbol})
                  </label>
                  <input
                    id="sgt-target"
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    className="pw-input font-num w-full rounded-xl px-3.5 py-2.5 text-base font-semibold min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="sgt-daily" className="block text-sm font-medium mb-1">
                    Daily Deposit You Can Afford ({currencyCfg.symbol})
                  </label>
                  <input
                    id="sgt-daily"
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={goalDaily}
                    onChange={(e) => setGoalDaily(e.target.value)}
                    className="pw-input font-num w-full rounded-xl px-3.5 py-2.5 text-base font-semibold min-h-[44px]"
                  />
                </div>
              </div>

              {previewDays !== null && (
                <div
                  className="p-3.5 rounded-xl border text-xs space-y-1"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface-muted)',
                  }}
                >
                  <p style={{ color: 'var(--text-secondary)' }}>
                    {editingGoal && editingGoal.currentCents > 0
                      ? 'Remaining estimated time: '
                      : 'Estimated completion: '}
                    <span className="font-num font-bold" style={{ color: 'var(--accent)' }}>
                      {formatDurationEstimate(previewDays)}
                    </span>
                  </p>
                  {previewCompletionDate && previewDays > 0 && (
                    <p style={{ color: 'var(--text-muted)' }}>
                      Estimated completion date:{' '}
                      <span className="font-num font-semibold">{previewCompletionDate}</span>
                      {' · '}
                      Monthly pace:{' '}
                      <span className="font-num font-semibold">
                        {formatMoney(previewDailyCents * 30, user.currency)}/mo
                      </span>
                    </p>
                  )}
                </div>
              )}

              {goalError && (
                <div
                  role="alert"
                  className="rounded-xl px-3.5 py-2.5 text-sm font-medium"
                  style={{ backgroundColor: 'var(--status-bad-bg)', color: 'var(--status-bad)' }}
                >
                  {goalError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setGoalModalOpen(false)}
                  className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingGoal}
                  className="pw-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px]"
                >
                  {savingGoal ? 'Saving...' : editingGoal ? 'Save Changes' : 'Create Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Deposit / Withdrawal Modal */}
      {entryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="pw-surface rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">
                {entryModal.type === 'deposit' ? 'Add Deposit' : 'Withdraw'} · {entryModal.goal.name}
              </h3>
              <button
                type="button"
                onClick={() => setEntryModal(null)}
                aria-label="Close deposit modal"
                className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {entryModal.type === 'deposit'
                ? 'Only manually recorded deposits count toward your savings progress. Deposits are never counted as expenses.'
                : 'Withdrawals reduce your saved balance in this goal without creating an expense.'}
            </p>
            <form onSubmit={handleSaveEntry} className="space-y-4">
              <div>
                <label htmlFor="sgt-entry-amount" className="block text-sm font-medium mb-1">
                  Amount ({currencyCfg.symbol})
                </label>
                <input
                  id="sgt-entry-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  autoFocus
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  placeholder={
                    entryModal.type === 'deposit' && entryModal.goal.plannedDailyCents
                      ? String(fromCents(entryModal.goal.plannedDailyCents))
                      : '0.00'
                  }
                  className="pw-input font-num w-full rounded-xl px-3.5 py-2.5 text-base font-semibold min-h-[44px]"
                />
                {entryModal.type === 'withdrawal' && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Available in goal: {formatMoney(entryModal.goal.currentCents, user.currency)}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="sgt-entry-date" className="block text-sm font-medium mb-1">
                  Date
                </label>
                <input
                  id="sgt-entry-date"
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="sgt-entry-note" className="block text-sm font-medium mb-1">
                  Note (Optional)
                </label>
                <input
                  id="sgt-entry-note"
                  type="text"
                  maxLength={120}
                  value={entryNote}
                  onChange={(e) => setEntryNote(e.target.value)}
                  placeholder="e.g. Daily savings deposit"
                  className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              {entryError && (
                <div
                  role="alert"
                  className="rounded-xl px-3.5 py-2.5 text-sm font-medium"
                  style={{ backgroundColor: 'var(--status-bad-bg)', color: 'var(--status-bad)' }}
                >
                  {entryError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEntryModal(null)}
                  className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEntry}
                  className="pw-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px]"
                >
                  {savingEntry
                    ? 'Saving...'
                    : entryModal.type === 'deposit'
                      ? 'Save Deposit'
                      : 'Confirm Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Savings Goal?"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? All deposit history for this goal will also be removed.`
            : ''
        }
        confirmLabel="Delete Goal"
        danger
        loading={deletingGoal}
        onConfirm={handleDeleteGoal}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
