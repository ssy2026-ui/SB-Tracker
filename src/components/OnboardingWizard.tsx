import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  CalendarClock,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import {
  BudgetFrequency,
  CURRENCIES,
  CurrencyCode,
  toCents,
  UserProfile,
} from '../shared/finance';
import financeIllustration from '../assets/images/sb_tracker_finance_illustration_1795609688165.jpg';

export function OnboardingWizard({
  user,
  onCompleted,
}: {
  user: UserProfile;
  onCompleted: (updated: UserProfile) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [currency, setCurrency] = useState<CurrencyCode>(user.currency || 'PHP');
  const [budgetFrequency, setBudgetFrequency] = useState<BudgetFrequency>(
    user.budgetFrequency || 'monthly'
  );
  const [periodStartDay, setPeriodStartDay] = useState<number>(user.periodStartDay || 1);
  const [incomeInput, setIncomeInput] = useState<string>('5000');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  function validateStep2(): boolean {
    const val = Number(incomeInput);
    if (!Number.isFinite(val) || val < 0) {
      setError('Please enter a valid allowance or income amount (0 or more).');
      return false;
    }
    setError(null);
    return true;
  }

  async function handleFinish() {
    if (!validateStep2()) return;
    const incomeVal = Number(incomeInput);

    setSaving(true);
    try {
      const res = await api.completeOnboarding({
        userType: user.userType || 'student',
        currency,
        budgetFrequency,
        periodStartDay,
        incomeCents: toCents(incomeVal),
        templateId: 'simple-starter',
        initialGoal: null,
      });
      onCompleted(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save setup. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pw-canvas py-10 px-4 flex flex-col justify-center">
      <div className="max-w-2xl w-full mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Step {step} of 2 · S&amp;B Tracker
              </p>
              <h1 className="font-display text-xl sm:text-2xl font-bold mt-0.5">
                {step === 1 ? 'Welcome to S&B Tracker!' : 'Income, currency & schedule'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {[1, 2].map((n) => (
              <span
                key={n}
                className="h-2 rounded-full transition-all"
                style={{
                  width: n === step ? '28px' : '10px',
                  backgroundColor: n <= step ? 'var(--accent)' : 'var(--border-subtle)',
                }}
              />
            ))}
          </div>
        </div>

        <div className="pw-surface rounded-2xl p-6 sm:p-8 shadow-sm">
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                <div className="sm:col-span-7 space-y-2">
                  <p className="font-display text-lg sm:text-xl font-bold">
                    Your bills and savings, organized in one place.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    S&amp;B Tracker helps you prepare for upcoming bills, organize your savings, and monitor your financial progress.
                  </p>
                </div>
                <div className="sm:col-span-5">
                  {!imgError ? (
                    <div
                      className="rounded-xl overflow-hidden border h-32"
                      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-muted)' }}
                    >
                      <img
                        src={financeIllustration}
                        alt="Wallet, coins, bill receipt, and savings goal progress illustration"
                        onError={() => setImgError(true)}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="rounded-xl p-4 border text-center"
                      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--accent-soft)' }}
                    >
                      <PiggyBank className="w-8 h-8 mx-auto" style={{ color: 'var(--accent)' }} />
                      <p className="text-xs font-semibold mt-1.5" style={{ color: 'var(--accent)' }}>
                        Track Your Bills. Build Your Savings.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    num: '1. Bills & Spend',
                    desc: 'Schedule monthly bills, monitor due dates, and record actual expenses cleanly.',
                    icon: CalendarClock,
                  },
                  {
                    num: '2. Daily Bill Funding',
                    desc: 'See the exact daily and weekly amounts needed to cover your monthly bills.',
                    icon: Calculator,
                  },
                  {
                    num: '3. Savings Goals',
                    desc: 'Create personalized savings targets, log manual deposits, and track milestones.',
                    icon: PiggyBank,
                  },
                ].map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <div
                      key={feat.num}
                      className="rounded-xl p-4 border space-y-2"
                      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-muted)' }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <h2 className="font-display text-sm font-bold">{feat.num}</h2>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {feat.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="pw-btn-primary rounded-xl px-6 py-2.5 text-sm font-semibold flex items-center gap-2 min-h-[44px] whitespace-nowrap"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold">Income, currency &amp; schedule</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Tell us how often you budget and how much money is available for each period.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ob-currency" className="block text-sm font-medium mb-1.5">
                    Preferred Currency
                  </label>
                  <select
                    id="ob-currency"
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
                  <label htmlFor="ob-frequency" className="block text-sm font-medium mb-1.5">
                    Budgeting Frequency
                  </label>
                  <select
                    id="ob-frequency"
                    value={budgetFrequency}
                    onChange={(e) => setBudgetFrequency(e.target.value as BudgetFrequency)}
                    className="pw-input w-full rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="twice_monthly">Twice a month (1st &amp; 16th)</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              {budgetFrequency === 'monthly' && (
                <div>
                  <label htmlFor="ob-start-day" className="block text-sm font-medium mb-1.5">
                    Day of month your budget begins
                  </label>
                  <input
                    id="ob-start-day"
                    type="number"
                    min={1}
                    max={28}
                    value={periodStartDay}
                    onChange={(e) =>
                      setPeriodStartDay(Math.max(1, Math.min(28, Number(e.target.value) || 1)))
                    }
                    className="pw-input w-full sm:w-44 rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Pick 1 for calendar months, or match your payday (1–28).
                  </p>
                </div>
              )}

              {budgetFrequency === 'weekly' && (
                <div>
                  <label htmlFor="ob-week-day" className="block text-sm font-medium mb-1.5">
                    First day of your budget week
                  </label>
                  <select
                    id="ob-week-day"
                    value={periodStartDay % 7}
                    onChange={(e) => setPeriodStartDay(Number(e.target.value))}
                    className="pw-input w-full sm:w-56 rounded-xl px-3.5 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value={1}>Monday</option>
                    <option value={0}>Sunday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="ob-income" className="block text-sm font-medium mb-1.5">
                  Available {budgetFrequency.replace('_', ' ')} allowance or income ({CURRENCIES[currency].symbol})
                </label>
                <input
                  id="ob-income"
                  type="number"
                  min={0}
                  step="0.01"
                  value={incomeInput}
                  onChange={(e) => setIncomeInput(e.target.value)}
                  className="pw-input font-num w-full rounded-xl px-3.5 py-2.5 text-base font-semibold min-h-[44px]"
                />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  You can update this anytime in Settings when your allowance or income changes.
                </p>
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

              <div className="flex items-center justify-between pt-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={saving}
                  className="pw-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-2 min-h-[44px] whitespace-nowrap"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={saving}
                  className="pw-btn-primary rounded-xl px-6 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-60 whitespace-nowrap"
                >
                  {saving ? 'Saving setup...' : 'Finish Setup & Open Dashboard'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
