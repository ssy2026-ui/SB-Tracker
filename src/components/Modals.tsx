import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import {
  BudgetCategory,
  CURRENCIES,
  CurrencyCode,
  ExpenseTransaction,
  formatIsoDate,
  fromCents,
  toCents,
} from '../shared/finance';

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
      <div className="pw-surface rounded-2xl max-w-md w-full p-6 shadow-xl">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="pw-btn-secondary rounded-xl px-4 py-2 text-sm font-medium min-h-[42px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-sm font-semibold min-h-[42px] disabled:opacity-60"
            style={{
              backgroundColor: danger ? 'var(--status-bad)' : 'var(--accent)',
              color: '#FFFFFF',
            }}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExpenseModal({
  open,
  currency,
  categories,
  initialTx,
  defaultCategoryId,
  onClose,
  onSaved,
}: {
  open: boolean;
  currency: CurrencyCode;
  categories: BudgetCategory[];
  initialTx?: ExpenseTransaction | null;
  defaultCategoryId?: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string>('uncategorized');
  const [description, setDescription] = useState('');
  const [txDate, setTxDate] = useState(formatIsoDate(new Date()));
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRequestId(crypto.randomUUID());
    if (initialTx) {
      setAmount(String(fromCents(initialTx.amountCents)));
      setCategoryId(initialTx.categoryId || 'uncategorized');
      setDescription(initialTx.description);
      setTxDate(initialTx.txDate);
    } else {
      setAmount('');
      setCategoryId(defaultCategoryId || categories[0]?.id || 'uncategorized');
      setDescription('');
      setTxDate(formatIsoDate(new Date()));
    }
  }, [open, initialTx, defaultCategoryId, categories]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const val = Number(amount);
    if (!Number.isFinite(val) || val <= 0) {
      setError('Please enter a valid expense amount greater than zero.');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a brief description (for example, "Lunch" or "Bus fare").');
      return;
    }

    setSaving(true);
    try {
      const cat = categoryId === 'uncategorized' ? null : categoryId;
      if (initialTx) {
        await api.updateTransaction(initialTx.id, {
          amountCents: toCents(val),
          categoryId: cat,
          description: description.trim(),
          txDate,
        });
        onSaved('Expense updated.');
      } else {
        await api.addTransaction({
          amountCents: toCents(val),
          categoryId: cat,
          description: description.trim(),
          txDate,
          clientRequestId: requestId,
        });
        onSaved('Expense saved and category balance updated.');
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save expense.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
      <div className="pw-surface rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold">
            {initialTx ? 'Edit Expense' : 'Record New Expense'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg hover:bg-[var(--bg-surface-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tx-amount" className="block text-sm font-medium mb-1">
              Amount ({CURRENCIES[currency].symbol})
            </label>
            <input
              id="tx-amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="pw-input font-num w-full rounded-xl px-3.5 py-2.5 text-base font-semibold min-h-[44px]"
            />
          </div>

          <div>
            <label htmlFor="tx-category" className="block text-sm font-medium mb-1">
              Budget Category
            </label>
            <select
              id="tx-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
              <option value="uncategorized">🧾 Uncategorized</option>
            </select>
          </div>

          <div>
            <label htmlFor="tx-desc" className="block text-sm font-medium mb-1">
              Description
            </label>
            <input
              id="tx-desc"
              type="text"
              maxLength={140}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Groceries, Jeepney fare, Electricity bill"
              className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
            />
          </div>

          <div>
            <label htmlFor="tx-date" className="block text-sm font-medium mb-1">
              Date
            </label>
            <input
              id="tx-date"
              type="date"
              required
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl px-3.5 py-2.5 text-sm font-medium"
              style={{ backgroundColor: 'var(--status-bad-bg)', color: 'var(--status-bad)' }}
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="pw-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-60"
            >
              {saving ? 'Saving...' : initialTx ? 'Save Changes' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
