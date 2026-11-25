import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError, WorkspaceState } from '../lib/api';
import {
  BillFrequency,
  calculateBillFundingMetrics,
  CURRENCIES,
  diffDaysIso,
  ExpectedBill,
  ExpenseTransaction,
  formatIsoDate,
  formatMoney,
  fromCents,
  toCents,
} from '../shared/finance';
import { ConfirmModal } from './Modals';

const BILL_FREQ_LABELS: Record<BillFrequency, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export function TransactionsView({
  state,
  onOpenAddExpense,
  onOpenEditExpense,
  onSelectPeriod,
  onReload,
  onNotify,
}: {
  state: WorkspaceState;
  onOpenAddExpense: () => void;
  onOpenEditExpense: (tx: ExpenseTransaction) => void;
  onSelectPeriod: (periodKey: string) => void;
  onReload: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const { user, categories, allTransactions, periodTransactions, expectedBills, historicalPeriods } =
    state;
  const hide = user.privacyHideBalances;
  const currencyCfg = CURRENCIES[user.currency];
  const todayStr = formatIsoDate(new Date());

  const [sectionTab, setSectionTab] = useState<'bills' | 'expenses'>('bills');
  const [viewScope, setViewScope] = useState<'period' | 'all'>('period');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteTx, setDeleteTx] = useState<ExpenseTransaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expected Bill modal state
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<ExpectedBill | null>(null);
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDate, setBillDueDate] = useState(todayStr);
  const [billFrequency, setBillFrequency] = useState<BillFrequency>('monthly');
  const [billCategoryId, setBillCategoryId] = useState<string>('uncategorized');
  const [billNotes, setBillNotes] = useState('');
  const [savingBill, setSavingBill] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  // Mark Paid modal state
  const [payModalBill, setPayModalBill] = useState<ExpectedBill | null>(null);
  const [payAsExpense, setPayAsExpense] = useState(true);
  const [payCreateNext, setPayCreateNext] = useState(true);
  const [payDate, setPayDate] = useState(todayStr);
  const [payingBill, setPayingBill] = useState(false);

  // Delete bill confirm
  const [deleteBillTarget, setDeleteBillTarget] = useState<ExpectedBill | null>(null);
  const [deletingBill, setDeletingBill] = useState(false);
  const [billFilter, setBillFilter] = useState<'all' | 'unpaid' | 'paid'>('all');

  const sourceList = viewScope === 'period' ? periodTransactions : allTransactions;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sourceList.filter((tx) => {
      if (
        q &&
        !tx.description.toLowerCase().includes(q) &&
        !tx.categoryName.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'uncategorized' && tx.categoryId !== null) return false;
        if (categoryFilter !== 'uncategorized' && tx.categoryId !== categoryFilter) return false;
      }
      return true;
    });
  }, [sourceList, search, categoryFilter]);

  const billMetrics = useMemo(
    () => calculateBillFundingMetrics(expectedBills),
    [expectedBills]
  );

  const periodActualSpentCents = periodTransactions.reduce((s, t) => s + t.amountCents, 0);
  const remainingAfterExpensesCents = user.incomeCents - periodActualSpentCents;
  const remainingAfterBillsCents =
    remainingAfterExpensesCents - billMetrics.unpaidBillsTotalCents;

  const dueSoonOrOverdueCount = expectedBills.filter(
    (b) => !b.isPaid && diffDaysIso(todayStr, b.dueDate) <= 7
  ).length;

  const visibleBills = useMemo(() => {
    if (billFilter === 'unpaid') return expectedBills.filter((b) => !b.isPaid);
    if (billFilter === 'paid') return expectedBills.filter((b) => b.isPaid);
    return expectedBills;
  }, [expectedBills, billFilter]);

  function openAddBill() {
    setEditingBill(null);
    setBillName('');
    setBillAmount('');
    setBillDueDate(todayStr);
    setBillFrequency('monthly');
    setBillCategoryId(categories[0]?.id || 'uncategorized');
    setBillNotes('');
    setBillError(null);
    setBillModalOpen(true);
  }

  function openEditBill(bill: ExpectedBill) {
    setEditingBill(bill);
    setBillName(bill.name);
    setBillAmount(String(fromCents(bill.amountCents)));
    setBillDueDate(bill.dueDate);
    setBillFrequency(bill.frequency);
    setBillCategoryId(bill.categoryId || 'uncategorized');
    setBillNotes(bill.notes);
    setBillError(null);
    setBillModalOpen(true);
  }

  async function handleSaveBill(e: React.FormEvent) {
    e.preventDefault();
    setBillError(null);
    const val = Number(billAmount);
    if (!billName.trim()) {
      setBillError('Please enter a bill or scheduled payment name.');
      return;
    }
    if (!Number.isFinite(val) || val <= 0) {
      setBillError('Bill amount must be greater than zero.');
      return;
    }
    setSavingBill(true);
    try {
      const cat = billCategoryId === 'uncategorized' ? null : billCategoryId;
      if (editingBill) {
        await api.updateBill(editingBill.id, {
          name: billName.trim(),
          amountCents: toCents(val),
          dueDate: billDueDate,
          frequency: billFrequency,
          categoryId: cat,
          notes: billNotes.trim(),
        });
        onNotify('Scheduled bill updated.');
      } else {
        await api.createBill({
          name: billName.trim(),
          amountCents: toCents(val),
          dueDate: billDueDate,
          frequency: billFrequency,
          categoryId: cat,
          notes: billNotes.trim(),
        });
        onNotify('Bill scheduled.');
      }
      await onReload();
      setBillModalOpen(false);
    } catch (err) {
      setBillError(err instanceof ApiError ? err.message : 'Unable to save scheduled bill.');
    } finally {
      setSavingBill(false);
    }
  }

  function openPayModal(bill: ExpectedBill) {
    setPayModalBill(bill);
    setPayAsExpense(!bill.paidTransactionId);
    setPayCreateNext(bill.frequency !== 'one_time');
    setPayDate(todayStr);
  }

  async function handleConfirmMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!payModalBill) return;
    setPayingBill(true);
    try {
      await api.markBillPaid(payModalBill.id, {
        isPaid: true,
        recordAsExpense: payAsExpense,
        paidDate: payDate,
        createNextOccurrence: payModalBill.frequency !== 'one_time' && payCreateNext,
      });
      await onReload();
      onNotify(
        payAsExpense
          ? `"${payModalBill.name}" marked paid and logged as an actual expense.`
          : `"${payModalBill.name}" marked as paid.`
      );
      setPayModalBill(null);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to mark bill as paid.', true);
    } finally {
      setPayingBill(false);
    }
  }

  async function handleUnmarkPaid(bill: ExpectedBill) {
    try {
      await api.markBillPaid(bill.id, { isPaid: false });
      await onReload();
      onNotify(`"${bill.name}" moved back to unpaid bills.`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to update bill status.', true);
    }
  }

  async function handleConfirmDeleteBill() {
    if (!deleteBillTarget) return;
    setDeletingBill(true);
    try {
      await api.deleteBill(deleteBillTarget.id);
      await onReload();
      setDeleteBillTarget(null);
      onNotify('Scheduled bill removed.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to delete bill.', true);
    } finally {
      setDeletingBill(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTx) return;
    setDeleting(true);
    try {
      await api.deleteTransaction(deleteTx.id);
      await onReload();
      setDeleteTx(null);
      onNotify('Expense deleted.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to delete expense.', true);
    } finally {
      setDeleting(false);
    }
  }

  function handleExportCsv() {
    const headers = ['Date', 'Category', 'Description', `Amount (${user.currency})`, 'Period'];
    const rows = filtered.map((t) => [
      t.txDate,
      `"${t.categoryName.replace(/"/g, '""')}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      fromCents(t.amountCents).toFixed(2),
      t.periodKey,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sb-tracker-expenses-${formatIsoDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Expense report exported as CSV.');
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Bills & Spend
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Plan daily bill funding, manage scheduled bills, and record actual expenses separately.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openAddBill}
            className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 min-h-[44px] whitespace-nowrap"
          >
            <CalendarClock className="w-4 h-4" />
            <span>Schedule Bill</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddExpense}
            className="pw-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 min-h-[44px] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Daily Bill Funding Goal (Hero Calculator near top) */}
      <section className="pw-surface rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold">Daily Bill Funding Goal</h2>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Recommended amount to earn or set aside daily to prepare for your scheduled monthly bills.
            </p>
          </div>
          <span className="font-num text-xs font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>
            {billMetrics.monthlyBillsCount} monthly bill{billMetrics.monthlyBillsCount === 1 ? '' : 's'} scheduled
          </span>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Monthly Bills
            </p>
            <p className="font-num text-2xl font-bold mt-1">
              {formatMoney(billMetrics.monthlyBillsTotalCents, user.currency, hide)}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Total scheduled monthly bills
            </p>
          </div>

          <div
            className="sm:border-l sm:pl-5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Daily Funding Target
            </p>
            <p
              className="font-num text-2xl sm:text-3xl font-bold mt-1"
              style={{ color: 'var(--accent)' }}
            >
              {formatMoney(billMetrics.dailyTargetCents, user.currency, hide)}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Monthly bills ÷ 30 days
            </p>
          </div>

          <div
            className="sm:border-l sm:pl-5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Weekly Funding Target
            </p>
            <p className="font-num text-2xl font-bold mt-1">
              {formatMoney(billMetrics.weeklyTargetCents, user.currency, hide)}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Daily target × 7 days
            </p>
          </div>
        </div>
      </section>

      {/* Essential Budget & Bills Strip (3 clean metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="pw-surface rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Total Unpaid Bills
          </p>
          <p
            className="font-num text-xl font-bold mt-1.5"
            style={{ color: billMetrics.unpaidBillsTotalCents > 0 ? 'var(--status-warn)' : 'var(--text-primary)' }}
          >
            {formatMoney(billMetrics.unpaidBillsTotalCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1 font-num" style={{ color: 'var(--text-muted)' }}>
            {billMetrics.unpaidBillsCount} unpaid
            {dueSoonOrOverdueCount > 0 ? ` · ${dueSoonOrOverdueCount} due soon or overdue` : ''}
          </p>
        </div>

        <div className="pw-surface rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Actual Expenses (Period)
          </p>
          <p className="font-num text-xl font-bold mt-1.5">
            {formatMoney(periodActualSpentCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {periodTransactions.length} recorded expense{periodTransactions.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="pw-surface rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Remaining Budget
          </p>
          <p
            className="font-num text-xl font-bold mt-1.5"
            style={{ color: remainingAfterExpensesCents < 0 ? 'var(--status-bad)' : 'var(--status-ok)' }}
          >
            {formatMoney(remainingAfterExpensesCents, user.currency, hide)}
          </p>
          <p className="text-xs mt-1 font-num" style={{ color: 'var(--text-muted)' }}>
            {billMetrics.unpaidBillsTotalCents > 0
              ? `After unpaid bills: ${formatMoney(remainingAfterBillsCents, user.currency, hide)}`
              : 'Income minus actual expenses'}
          </p>
        </div>
      </div>

      {/* Section Switcher: Scheduled Bills vs Actual Expenses */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex p-1 rounded-xl border"
          style={{ backgroundColor: 'var(--bg-surface-muted)', borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => setSectionTab('bills')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              sectionTab === 'bills' ? 'pw-surface shadow-sm' : ''
            }`}
          >
            Scheduled Bills ({billMetrics.unpaidBillsCount} unpaid / {expectedBills.length})
          </button>
          <button
            type="button"
            onClick={() => setSectionTab('expenses')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              sectionTab === 'expenses' ? 'pw-surface shadow-sm' : ''
            }`}
          >
            Actual Expenses ({sourceList.length})
          </button>
        </div>

        {sectionTab === 'expenses' && (
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="pw-btn-secondary rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-2 min-h-[38px] disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        )}
      </div>

      {sectionTab === 'bills' ? (
        <div className="pw-surface rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Scheduled Bills</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Bills stay separate from actual expenses until you mark them as paid.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Filter scheduled bills"
                value={billFilter}
                onChange={(e) => setBillFilter(e.target.value as 'all' | 'unpaid' | 'paid')}
                className="pw-input rounded-xl px-3 py-2 text-xs font-medium min-h-[38px]"
              >
                <option value="all">All Bills ({expectedBills.length})</option>
                <option value="unpaid">Unpaid ({billMetrics.unpaidBillsCount})</option>
                <option value="paid">Paid ({expectedBills.length - billMetrics.unpaidBillsCount})</option>
              </select>
              <button
                type="button"
                onClick={openAddBill}
                className="pw-btn-primary rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 min-h-[38px] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Bill</span>
              </button>
            </div>
          </div>

          {visibleBills.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm font-medium">No scheduled bills in this view yet.</p>
              <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
                Add monthly bills like rent, electricity, water, or internet to automatically calculate your daily and weekly funding targets.
              </p>
              <button
                type="button"
                onClick={openAddBill}
                className="pw-btn-primary rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Schedule Your First Bill
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="text-xs font-semibold border-b"
                    style={{
                      backgroundColor: 'var(--bg-surface-muted)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <th className="py-3 px-4">Bill</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Due Date & Status</th>
                    <th className="py-3 px-4">Frequency</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {visibleBills.map((bill) => {
                    const daysLeft = diffDaysIso(todayStr, bill.dueDate);
                    const isOverdue = !bill.isPaid && daysLeft < 0;
                    const isDueSoon = !bill.isPaid && daysLeft >= 0 && daysLeft <= 7;
                    const statusColor = bill.isPaid
                      ? 'var(--status-ok)'
                      : isOverdue
                        ? 'var(--status-bad)'
                        : isDueSoon
                          ? 'var(--status-warn)'
                          : 'var(--text-muted)';
                    const statusLabel = bill.isPaid
                      ? `Paid${bill.paidAt ? ` on ${bill.paidAt}` : ''}`
                      : isOverdue
                        ? `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}`
                        : daysLeft === 0
                          ? 'Due today'
                          : daysLeft === 1
                            ? 'Due tomorrow'
                            : `Due in ${daysLeft} days`;

                    return (
                      <tr
                        key={bill.id}
                        className="hover:bg-[var(--bg-surface-muted)] transition-colors"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <td className="py-3 px-4">
                          <p className={`text-sm font-medium ${bill.isPaid ? 'line-through opacity-60' : ''}`}>
                            {bill.name}
                          </p>
                          {bill.notes && (
                            <p className="text-xs truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>
                              {bill.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {bill.categoryIcon} {bill.categoryName}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-num text-xs font-semibold">{bill.dueDate}</p>
                          <p className="text-xs font-medium flex items-center gap-1 mt-0.5 whitespace-nowrap" style={{ color: statusColor }}>
                            {bill.isPaid ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{statusLabel}</span>
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {BILL_FREQ_LABELS[bill.frequency]}
                        </td>
                        <td className="py-3 px-4 font-num text-sm font-semibold text-right whitespace-nowrap">
                          {formatMoney(bill.amountCents, user.currency, hide)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {!bill.isPaid ? (
                              <button
                                type="button"
                                onClick={() => openPayModal(bill)}
                                className="pw-btn-primary rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap"
                              >
                                Mark Paid
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUnmarkPaid(bill)}
                                title="Move back to unpaid"
                                className="pw-btn-secondary rounded-lg px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Unpaid</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditBill(bill)}
                              aria-label={`Edit ${bill.name}`}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-canvas)]"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteBillTarget(bill)}
                              aria-label={`Delete ${bill.name}`}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-canvas)]"
                              style={{ color: 'var(--status-bad)' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Streamlined Expense Filters */}
          <div className="pw-surface rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="inline-flex p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-muted)' }}
              >
                <button
                  type="button"
                  onClick={() => setViewScope('period')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    viewScope === 'period' ? 'pw-surface shadow-sm' : ''
                  }`}
                >
                  Selected Period
                </button>
                <button
                  type="button"
                  onClick={() => setViewScope('all')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    viewScope === 'all' ? 'pw-surface shadow-sm' : ''
                  }`}
                >
                  All History
                </button>
              </div>

              {viewScope === 'period' && historicalPeriods.length > 0 && (
                <select
                  aria-label="Select budgeting period"
                  value={state.selectedPeriod.periodKey}
                  onChange={(e) => onSelectPeriod(e.target.value)}
                  className="pw-input rounded-xl px-3 py-2 text-xs font-medium min-h-[38px]"
                >
                  {historicalPeriods.map((hp) => (
                    <option key={hp.periodKey} value={hp.periodKey}>
                      {hp.label} {hp.periodKey === state.currentPeriod.periodKey ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 lg:max-w-md">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search expenses..."
                  className="pw-input w-full rounded-xl pl-9 pr-3 py-2 text-sm min-h-[40px]"
                />
              </div>

              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="pw-input rounded-xl px-3 py-2 text-sm min-h-[40px]"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
                <option value="uncategorized">🧾 Uncategorized</option>
              </select>
            </div>
          </div>

          {/* Clean Expenses Table */}
          <div className="pw-surface rounded-2xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm font-medium">No actual expenses recorded in this view.</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Record an actual expense or mark a scheduled bill as paid. Unpaid scheduled bills are never counted as expenses.
                </p>
                <button
                  type="button"
                  onClick={onOpenAddExpense}
                  className="pw-btn-primary rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  + Add Expense
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr
                      className="text-xs font-semibold border-b"
                      style={{
                        backgroundColor: 'var(--bg-surface-muted)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {filtered.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-[var(--bg-surface-muted)] transition-colors"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <td className="py-3 px-4 text-sm font-medium">{tx.description}</td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {tx.categoryIcon} {tx.categoryName}
                        </td>
                        <td className="py-3 px-4 font-num text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {tx.txDate}
                        </td>
                        <td className="py-3 px-4 font-num text-sm font-semibold text-right whitespace-nowrap">
                          -{formatMoney(tx.amountCents, user.currency, hide)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenEditExpense(tx)}
                              aria-label={`Edit ${tx.description}`}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-canvas)]"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTx(tx)}
                              aria-label={`Delete ${tx.description}`}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-canvas)]"
                              style={{ color: 'var(--status-bad)' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Scheduled Bill Modal */}
      {billModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="pw-surface rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">
                {editingBill ? 'Edit Scheduled Bill' : 'Schedule Bill'}
              </h3>
              <button
                type="button"
                onClick={() => setBillModalOpen(false)}
                aria-label="Close bill modal"
                className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveBill} className="space-y-4">
              <div>
                <label htmlFor="bill-name" className="block text-sm font-medium mb-1">
                  Bill Name
                </label>
                <input
                  id="bill-name"
                  type="text"
                  required
                  maxLength={100}
                  value={billName}
                  onChange={(e) => setBillName(e.target.value)}
                  placeholder="e.g. Rent, Electricity, Internet, Tuition"
                  className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bill-amt" className="block text-sm font-medium mb-1">
                    Amount ({currencyCfg.symbol})
                  </label>
                  <input
                    id="bill-amt"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="pw-input font-num w-full rounded-xl px-3.5 py-2.5 text-sm font-semibold min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="bill-due" className="block text-sm font-medium mb-1">
                    Due Date
                  </label>
                  <input
                    id="bill-due"
                    type="date"
                    required
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bill-freq" className="block text-sm font-medium mb-1">
                    Payment Frequency
                  </label>
                  <select
                    id="bill-freq"
                    value={billFrequency}
                    onChange={(e) => setBillFrequency(e.target.value as BillFrequency)}
                    className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="yearly">Yearly</option>
                    <option value="one_time">One-time</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bill-cat" className="block text-sm font-medium mb-1">
                    Category
                  </label>
                  <select
                    id="bill-cat"
                    value={billCategoryId}
                    onChange={(e) => setBillCategoryId(e.target.value)}
                    className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                    <option value="uncategorized">🧾 Bills / General</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="bill-notes" className="block text-sm font-medium mb-1">
                  Notes (Optional)
                </label>
                <input
                  id="bill-notes"
                  type="text"
                  maxLength={160}
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="Account reference or reminder note"
                  className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              {billError && (
                <div
                  role="alert"
                  className="rounded-xl px-3.5 py-2.5 text-sm font-medium"
                  style={{ backgroundColor: 'var(--status-bad-bg)', color: 'var(--status-bad)' }}
                >
                  {billError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBillModalOpen(false)}
                  className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBill}
                  className="pw-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px]"
                >
                  {savingBill ? 'Saving...' : editingBill ? 'Save Changes' : 'Schedule Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Bill Paid Modal */}
      {payModalBill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="pw-surface rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-bold">Mark Bill as Paid</h3>
              <button
                type="button"
                onClick={() => setPayModalBill(null)}
                aria-label="Close mark paid modal"
                className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              {payModalBill.name} ·{' '}
              <span className="font-num font-bold">
                {formatMoney(payModalBill.amountCents, user.currency, hide)}
              </span>
            </p>
            <form onSubmit={handleConfirmMarkPaid} className="space-y-4">
              <div>
                <label htmlFor="pay-date" className="block text-sm font-medium mb-1">
                  Payment Date
                </label>
                <input
                  id="pay-date"
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={payAsExpense}
                  disabled={Boolean(payModalBill.paidTransactionId)}
                  onChange={(e) => setPayAsExpense(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-[var(--accent)]"
                />
                <span>
                  {payModalBill.paidTransactionId
                    ? 'Expense already recorded for this bill payment'
                    : 'Also record this payment in Actual Expenses'}
                </span>
              </label>

              {payModalBill.frequency !== 'one_time' && (
                <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payCreateNext}
                    onChange={(e) => setPayCreateNext(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-[var(--accent)]"
                  />
                  <span>
                    Schedule next {BILL_FREQ_LABELS[payModalBill.frequency].toLowerCase()} occurrence automatically
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalBill(null)}
                  className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={payingBill}
                  className="pw-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px]"
                >
                  {payingBill ? 'Saving...' : 'Confirm Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTx)}
        title="Delete Expense?"
        message={
          deleteTx
            ? `Remove "${deleteTx.description}" (${formatMoney(deleteTx.amountCents, user.currency, hide)})? Your remaining budget will update immediately.`
            : ''
        }
        confirmLabel="Delete Expense"
        danger
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTx(null)}
      />

      <ConfirmModal
        open={Boolean(deleteBillTarget)}
        title="Delete Scheduled Bill?"
        message={
          deleteBillTarget
            ? `Remove "${deleteBillTarget.name}" (${formatMoney(deleteBillTarget.amountCents, user.currency, hide)}) from your scheduled bills?`
            : ''
        }
        confirmLabel="Delete Bill"
        danger
        loading={deletingBill}
        onConfirm={handleConfirmDeleteBill}
        onCancel={() => setDeleteBillTarget(null)}
      />
    </div>
  );
}
