export type ThemeId =
  | 'burgundy'
  | 'royal-blue'
  | 'lavender'
  | 'khaki'
  | 'sage-green'
  | 'rose-pink'
  | 'midnight-navy'
  | 'teal'
  | 'classic-light'
  | 'dark-mode';

export type UserType = 'student' | 'employee' | 'entrepreneur';

export type BudgetFrequency = 'daily' | 'weekly' | 'twice_monthly' | 'monthly' | 'yearly';

export type BillFrequency = 'one_time' | 'weekly' | 'monthly' | 'yearly';

export type SavingsGoalStatus = 'active' | 'paused';

export type CurrencyCode = 'PHP' | 'USD' | 'EUR' | 'SGD' | 'JPY' | 'GBP' | 'AUD' | 'CAD';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  decimals: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  PHP: { code: 'PHP', symbol: '₱', name: 'Philippine Peso', decimals: 2 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
};

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  isDark: boolean;
  preview: {
    canvas: string;
    surface: string;
    accent: string;
    text: string;
    muted: string;
  };
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'burgundy',
    name: 'Burgundy',
    description: 'Deep burgundy accents on soft rose-stone neutral surfaces.',
    isDark: false,
    preview: { canvas: '#F3E8EC', surface: '#FFFFFF', accent: '#881337', text: '#231017', muted: '#6E4F5A' },
  },
  {
    id: 'royal-blue',
    name: 'Royal Blue',
    description: 'Clean white and sky-blue surfaces with crisp royal blue.',
    isDark: false,
    preview: { canvas: '#E8EFFD', surface: '#FFFFFF', accent: '#1D4ED8', text: '#0F172A', muted: '#4C5E7B' },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft lavender backdrop with muted plum accents.',
    isDark: false,
    preview: { canvas: '#EDE8F7', surface: '#FFFFFF', accent: '#6D4C9B', text: '#1E162B', muted: '#605378' },
  },
  {
    id: 'khaki',
    name: 'Khaki',
    description: 'Warm cream and earthy khaki neutral tones.',
    isDark: false,
    preview: { canvas: '#EFEBD8', surface: '#FCFBF7', accent: '#6B5E38', text: '#232018', muted: '#655D4C' },
  },
  {
    id: 'sage-green',
    name: 'Forest Green',
    description: 'Forest green accents on crisp white and light gray surfaces.',
    isDark: false,
    preview: { canvas: '#F4F6F5', surface: '#FFFFFF', accent: '#1B5E3F', text: '#111827', muted: '#5A6570' },
  },
  {
    id: 'rose-pink',
    name: 'Rose Pink',
    description: 'Warm white surfaces paired with soft dusty rose.',
    isDark: false,
    preview: { canvas: '#F7E7EC', surface: '#FFFDFE', accent: '#A63A5B', text: '#26141A', muted: '#6E515B' },
  },
  {
    id: 'midnight-navy',
    name: 'Midnight Navy',
    description: 'Deep navy surfaces with high-contrast ice blue accents.',
    isDark: true,
    preview: { canvas: '#0A1324', surface: '#13213D', accent: '#60A5FA', text: '#F1F5F9', muted: '#94A3B8' },
  },
  {
    id: 'teal',
    name: 'Teal',
    description: 'Modern clean teal on mineral aqua-tinted surfaces.',
    isDark: false,
    preview: { canvas: '#E3F1F1', surface: '#FFFFFF', accent: '#0F766E', text: '#0F2223', muted: '#486465' },
  },
  {
    id: 'classic-light',
    name: 'Classic Light',
    description: 'Minimalist white and cool gray with charcoal contrast.',
    isDark: false,
    preview: { canvas: '#F1F5F9', surface: '#FFFFFF', accent: '#1E293B', text: '#0F172A', muted: '#64748B' },
  },
  {
    id: 'dark-mode',
    name: 'Dark Mode',
    description: 'Charcoal dark backgrounds with crisp readable text.',
    isDark: true,
    preview: { canvas: '#0E1116', surface: '#161B22', accent: '#34D399', text: '#F3F4F6', muted: '#9CA3AF' },
  },
];

export const CATEGORY_COLORS = [
  '#2563EB',
  '#0D9488',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#16A34A',
  '#DC2626',
  '#0284C7',
  '#9333EA',
  '#CA8A04',
];

export const CATEGORY_ICONS = [
  '🍽️', '🚌', '📚', '💰', '🛍️', '🏠', '⚡', '📱', '🏥', '🎯', '💼', '📦', '☕', '🎮', '✈️', '🧾',
];

export interface BudgetTemplateCategory {
  name: string;
  icon: string;
  description: string;
  percentage: number;
  isEssential: boolean;
  color: string;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  audience: UserType | 'all';
  description: string;
  categories: BudgetTemplateCategory[];
}

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: 'student-essentials',
    name: 'Student Essentials',
    audience: 'student',
    description: 'Balanced for daily or weekly allowances with meals, commute, school supplies, and savings.',
    categories: [
      { name: 'Food', icon: '🍽️', description: 'Meals, snacks, and campus dining', percentage: 35, isEssential: true, color: '#0D9488' },
      { name: 'Transportation', icon: '🚌', description: 'Jeepney, bus, train, or fuel', percentage: 20, isEssential: true, color: '#2563EB' },
      { name: 'School Expenses', icon: '📚', description: 'Printing, supplies, and project materials', percentage: 15, isEssential: true, color: '#D97706' },
      { name: 'Savings', icon: '💰', description: 'Emergency buffer and future goals', percentage: 20, isEssential: true, color: '#16A34A' },
      { name: 'Personal Needs', icon: '🛍️', description: 'Load, toiletries, and small treats', percentage: 10, isEssential: false, color: '#7C3AED' },
    ],
  },
  {
    id: 'employee-50-30-20',
    name: 'Employee Balanced',
    audience: 'employee',
    description: 'Covers housing, utilities, groceries, commute, savings, and personal spending.',
    categories: [
      { name: 'Bills & Housing', icon: '🏠', description: 'Rent, electricity, water, and internet', percentage: 30, isEssential: true, color: '#2563EB' },
      { name: 'Food & Groceries', icon: '🍽️', description: 'Home groceries and workday meals', percentage: 20, isEssential: true, color: '#0D9488' },
      { name: 'Transportation', icon: '🚌', description: 'Daily commute and travel costs', percentage: 15, isEssential: true, color: '#D97706' },
      { name: 'Savings & Debt', icon: '💰', description: 'Savings goals and debt repayment', percentage: 20, isEssential: true, color: '#16A34A' },
      { name: 'Personal & Leisure', icon: '☕', description: 'Health, clothing, and recreation', percentage: 15, isEssential: false, color: '#7C3AED' },
    ],
  },
  {
    id: 'entrepreneur-cashflow',
    name: 'Entrepreneur Cashflow',
    audience: 'entrepreneur',
    description: 'Separates business operations and inventory from personal living and emergency reserves.',
    categories: [
      { name: 'Operational Costs', icon: '💼', description: 'Utilities, software, and marketing', percentage: 30, isEssential: true, color: '#2563EB' },
      { name: 'Inventory & Supplies', icon: '📦', description: 'Stock replenishment and packaging', percentage: 25, isEssential: true, color: '#D97706' },
      { name: 'Personal Living', icon: '🍽️', description: 'Owner food, transport, and personal bills', percentage: 20, isEssential: true, color: '#0D9488' },
      { name: 'Emergency Reserve', icon: '🛡️', description: 'Buffer for slow weeks and taxes', percentage: 15, isEssential: true, color: '#DC2626' },
      { name: 'Growth & Savings', icon: '💰', description: 'Long-term savings and reinvestment', percentage: 10, isEssential: true, color: '#16A34A' },
    ],
  },
  {
    id: 'simple-starter',
    name: 'Simple 4-Bucket Starter',
    audience: 'all',
    description: 'Easy four-part setup for anyone starting their first budget.',
    categories: [
      { name: 'Food & Daily Needs', icon: '🍽️', description: 'Everyday meals and necessities', percentage: 40, isEssential: true, color: '#0D9488' },
      { name: 'Bills & Commute', icon: '🧾', description: 'Fixed bills and transportation', percentage: 25, isEssential: true, color: '#2563EB' },
      { name: 'Savings', icon: '💰', description: 'Pay yourself first', percentage: 20, isEssential: true, color: '#16A34A' },
      { name: 'Flexible Spending', icon: '🎯', description: 'Personal wants and miscellaneous', percentage: 15, isEssential: false, color: '#7C3AED' },
    ],
  },
];

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  userType: UserType;
  currency: CurrencyCode;
  budgetFrequency: BudgetFrequency;
  periodStartDay: number;
  periodStartDate: string | null;
  incomeCents: number;
  theme: ThemeId;
  onboardingCompleted: boolean;
  isDemo: boolean;
  privacyHideBalances: boolean;
  notifBillReminders: boolean;
  notifDailySavingsReminder: boolean;
  notifMissedSavingsAlert: boolean;
  notifSavingsMilestone: boolean;
  browserNotificationsEnabled: boolean;
  createdAt: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  percentage: number;
  allocatedCents: number;
  manualAmountCents: number | null;
  isEssential: boolean;
  color: string;
  sortOrder: number;
}

export interface ExpenseTransaction {
  id: string;
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amountCents: number;
  description: string;
  txDate: string;
  periodKey: string;
  createdAt: string;
}

export interface CategoryDeposit {
  id: string;
  categoryId: string | null;
  categoryName: string;
  amountCents: number;
  note: string;
  depositDate: string;
  periodKey: string;
  createdAt: string;
}

export interface ExpectedBill {
  id: string;
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  name: string;
  amountCents: number;
  dueDate: string;
  frequency: BillFrequency;
  isPaid: boolean;
  paidTransactionId: string | null;
  paidAt: string | null;
  notes: string;
  createdAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
  currentCents: number;
  targetDate: string | null;
  durationMonths: number | null;
  plannedDailyCents: number | null;
  plannedMonthlyCents: number | null;
  status: SavingsGoalStatus;
  createdAt: string;
}

export interface SavingsEntry {
  id: string;
  goalId: string;
  goalName: string;
  type: 'deposit' | 'withdrawal';
  amountCents: number;
  note: string;
  entryDate: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type:
    | 'bill_upcoming'
    | 'bill_due_today'
    | 'bill_overdue'
    | 'savings_daily_reminder'
    | 'savings_missed_deposit'
    | 'savings_milestone'
    | 'bill_reminder';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PeriodInfo {
  periodKey: string;
  label: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  nextPeriodStart: string;
}

export interface HistoricalPeriodSummary {
  periodKey: string;
  label: string;
  frequency: BudgetFrequency;
  startDate: string;
  endDate: string;
  incomeCents: number;
  spentCents: number;
  transactionCount: number;
}

export function roundPercentage(val: number): number {
  return Math.round((Number.isFinite(val) ? val : 0) * 100) / 100;
}

export function toCents(majorAmount: number): number {
  if (!Number.isFinite(majorAmount) || majorAmount < 0) return 0;
  return Math.round(majorAmount * 100);
}

export function fromCents(cents: number): number {
  return (Number.isFinite(cents) ? cents : 0) / 100;
}

export function formatMoney(cents: number, currency: CurrencyCode = 'PHP', hide = false): string {
  const cfg = CURRENCIES[currency] || CURRENCIES.PHP;
  if (hide) return `${cfg.symbol}••••`;
  const value = cents / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: cfg.decimals === 0 ? 0 : (cents % 100 === 0 ? 0 : 2),
    maximumFractionDigits: cfg.decimals,
  }).format(Math.abs(value));
  return `${cents < 0 ? '-' : ''}${cfg.symbol}${formatted}`;
}

export function formatMoneyExact(cents: number, currency: CurrencyCode = 'PHP', hide = false): string {
  const cfg = CURRENCIES[currency] || CURRENCIES.PHP;
  if (hide) return `${cfg.symbol}••••`;
  const value = cents / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  }).format(Math.abs(value));
  return `${cents < 0 ? '-' : ''}${cfg.symbol}${formatted}`;
}

/**
 * Allocates incomeCents across categories.
 * - Categories with a manualAmountCents keep their exact manually entered amount
 *   (never overwritten) and derive their percentage from incomeCents.
 * - Percentage-based categories compute their amount from incomeCents * percentage / 100,
 *   using Hamilton / Largest Remainder centavo reconciliation when all categories are
 *   percentage-based and total 100%.
 */
export function allocateIncomeCents(
  incomeCents: number,
  categories: Array<{
    id: string;
    percentage: number;
    manualAmountCents?: number | null;
    sortOrder?: number;
  }>
): {
  allocations: Record<string, number>;
  percentages: Record<string, number>;
  totalPercentage: number;
  totalAllocatedCents: number;
  remainingBudgetCents: number;
  unallocatedCents: number;
  overAllocatedCents: number;
  roundingAdjusted: boolean;
} {
  const safeIncome = Math.max(0, Math.round(incomeCents));
  const allocations: Record<string, number> = {};
  const percentages: Record<string, number> = {};

  if (categories.length === 0) {
    return {
      allocations,
      percentages,
      totalPercentage: 0,
      totalAllocatedCents: 0,
      remainingBudgetCents: safeIncome,
      unallocatedCents: safeIncome,
      overAllocatedCents: 0,
      roundingAdjusted: false,
    };
  }

  const hasAnyManual = categories.some(
    (c) => c.manualAmountCents !== null && c.manualAmountCents !== undefined
  );

  // Compute effective percentages & check if pure 100% percentage split applies
  if (!hasAnyManual) {
    const totalPct = roundPercentage(
      categories.reduce((s, c) => s + Math.max(0, c.percentage), 0)
    );
    if (safeIncome === 0) {
      for (const c of categories) {
        allocations[c.id] = 0;
        percentages[c.id] = roundPercentage(Math.max(0, c.percentage));
      }
      return {
        allocations,
        percentages,
        totalPercentage: totalPct,
        totalAllocatedCents: 0,
        remainingBudgetCents: 0,
        unallocatedCents: 0,
        overAllocatedCents: 0,
        roundingAdjusted: false,
      };
    }

    if (Math.abs(totalPct - 100) < 0.01) {
      const items = categories.map((c, idx) => {
        const pct = Math.max(0, c.percentage);
        const exact = (safeIncome * pct) / 100;
        const base = Math.floor(exact);
        return {
          id: c.id,
          pct: roundPercentage(pct),
          sortOrder: c.sortOrder ?? idx,
          base,
          remainder: exact - base,
        };
      });

      let leftover = Math.max(0, safeIncome - items.reduce((s, i) => s + i.base, 0));
      const byRemainder = [...items].sort((a, b) => {
        if (Math.abs(b.remainder - a.remainder) > 1e-9) return b.remainder - a.remainder;
        return a.sortOrder - b.sortOrder;
      });
      let adjusted = false;
      for (const item of byRemainder) {
        if (leftover <= 0) break;
        item.base += 1;
        leftover -= 1;
        adjusted = true;
      }

      for (const item of items) {
        allocations[item.id] = item.base;
        percentages[item.id] = item.pct;
      }
      const totalAllocatedCents = items.reduce((s, i) => s + i.base, 0);
      return {
        allocations,
        percentages,
        totalPercentage: totalPct,
        totalAllocatedCents,
        remainingBudgetCents: safeIncome - totalAllocatedCents,
        unallocatedCents: Math.max(0, safeIncome - totalAllocatedCents),
        overAllocatedCents: Math.max(0, totalAllocatedCents - safeIncome),
        roundingAdjusted: adjusted,
      };
    }
  }

  // Mixed or custom allocations: preserve every manualAmountCents verbatim
  let totalAllocatedCents = 0;
  let totalPct = 0;

  for (const c of categories) {
    if (c.manualAmountCents !== null && c.manualAmountCents !== undefined) {
      const amt = Math.max(0, Math.round(c.manualAmountCents));
      const pct = safeIncome > 0 ? roundPercentage((amt / safeIncome) * 100) : 0;
      allocations[c.id] = amt;
      percentages[c.id] = pct;
      totalAllocatedCents += amt;
      totalPct = roundPercentage(totalPct + pct);
    } else {
      const pct = roundPercentage(Math.max(0, c.percentage));
      const amt = Math.round((safeIncome * pct) / 100);
      allocations[c.id] = amt;
      percentages[c.id] = pct;
      totalAllocatedCents += amt;
      totalPct = roundPercentage(totalPct + pct);
    }
  }

  return {
    allocations,
    percentages,
    totalPercentage: totalPct,
    totalAllocatedCents,
    remainingBudgetCents: safeIncome - totalAllocatedCents,
    unallocatedCents: Math.max(0, safeIncome - totalAllocatedCents),
    overAllocatedCents: Math.max(0, totalAllocatedCents - safeIncome),
    roundingAdjusted: false,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

function formatShortDate(dateStr: string): string {
  const d = parseIsoDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthDay(dateStr: string): string {
  const d = parseIsoDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getPeriodInfo(
  frequency: BudgetFrequency,
  referenceDateStr: string,
  periodStartDay = 1,
  _periodAnchorDate?: string | null
): PeriodInfo {
  const ref = parseIsoDate(referenceDateStr);
  const y = ref.getFullYear();
  const m = ref.getMonth(); // 0-indexed
  const day = ref.getDate();

  if (frequency === 'daily') {
    const start = formatIsoDate(ref);
    const next = new Date(ref);
    next.setDate(next.getDate() + 1);
    return {
      periodKey: `D:${start}`,
      label: formatShortDate(start),
      startDate: start,
      endDate: start,
      daysRemaining: 0,
      nextPeriodStart: formatIsoDate(next),
    };
  }

  if (frequency === 'weekly') {
    // periodStartDay: 0 (Sun) .. 6 (Sat)
    const startWeekday = ((periodStartDay % 7) + 7) % 7;
    const diff = (ref.getDay() - startWeekday + 7) % 7;
    const startObj = new Date(ref);
    startObj.setDate(ref.getDate() - diff);
    const endObj = new Date(startObj);
    endObj.setDate(startObj.getDate() + 6);
    const nextObj = new Date(endObj);
    nextObj.setDate(endObj.getDate() + 1);
    const startDate = formatIsoDate(startObj);
    const endDate = formatIsoDate(endObj);
    const daysRemaining = Math.max(0, Math.round((endObj.getTime() - ref.getTime()) / 86400000));
    return {
      periodKey: `W:${startDate}`,
      label: `${formatMonthDay(startDate)} – ${formatShortDate(endDate)}`,
      startDate,
      endDate,
      daysRemaining,
      nextPeriodStart: formatIsoDate(nextObj),
    };
  }

  if (frequency === 'twice_monthly') {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    if (day <= 15) {
      const startDate = `${y}-${pad2(m + 1)}-01`;
      const endDate = `${y}-${pad2(m + 1)}-15`;
      const nextPeriodStart = `${y}-${pad2(m + 1)}-16`;
      return {
        periodKey: `B:${y}-${pad2(m + 1)}-H1`,
        label: `${formatMonthDay(startDate)} – ${formatShortDate(endDate)}`,
        startDate,
        endDate,
        daysRemaining: Math.max(0, 15 - day),
        nextPeriodStart,
      };
    } else {
      const startDate = `${y}-${pad2(m + 1)}-16`;
      const endDate = `${y}-${pad2(m + 1)}-${pad2(daysInMonth)}`;
      const nextMonth = new Date(y, m + 1, 1, 12);
      return {
        periodKey: `B:${y}-${pad2(m + 1)}-H2`,
        label: `${formatMonthDay(startDate)} – ${formatShortDate(endDate)}`,
        startDate,
        endDate,
        daysRemaining: Math.max(0, daysInMonth - day),
        nextPeriodStart: formatIsoDate(nextMonth),
      };
    }
  }

  if (frequency === 'yearly') {
    const startDate = `${y}-01-01`;
    const endDate = `${y}-12-31`;
    const endObj = new Date(y, 11, 31, 12);
    const daysRemaining = Math.max(0, Math.round((endObj.getTime() - ref.getTime()) / 86400000));
    return {
      periodKey: `Y:${y}`,
      label: `Year ${y}`,
      startDate,
      endDate,
      daysRemaining,
      nextPeriodStart: `${y + 1}-01-01`,
    };
  }

  // Monthly starting on periodStartDay (1..28)
  const anchorDay = Math.min(28, Math.max(1, Math.round(periodStartDay || 1)));
  let startObj: Date;
  if (day >= anchorDay) {
    startObj = new Date(y, m, anchorDay, 12);
  } else {
    startObj = new Date(y, m - 1, anchorDay, 12);
  }
  const nextObj = new Date(startObj.getFullYear(), startObj.getMonth() + 1, anchorDay, 12);
  const endObj = new Date(nextObj);
  endObj.setDate(nextObj.getDate() - 1);

  const startDate = formatIsoDate(startObj);
  const endDate = formatIsoDate(endObj);
  const daysRemaining = Math.max(0, Math.round((endObj.getTime() - ref.getTime()) / 86400000));
  return {
    periodKey: `M:${startDate}`,
    label:
      anchorDay === 1
        ? startObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : `${formatMonthDay(startDate)} – ${formatShortDate(endDate)}`,
    startDate,
    endDate,
    daysRemaining,
    nextPeriodStart: formatIsoDate(nextObj),
  };
}

export function addDaysToIso(isoDateStr: string, days: number): string {
  const d = parseIsoDate(isoDateStr);
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  return formatIsoDate(d);
}

export function shiftDaysIso(isoDateStr: string, deltaDays: number): string {
  const d = parseIsoDate(isoDateStr);
  d.setDate(d.getDate() + Math.round(deltaDays));
  return formatIsoDate(d);
}

export function addMonthsToIso(isoDateStr: string, months: number): string {
  const d = parseIsoDate(isoDateStr);
  d.setMonth(d.getMonth() + Math.max(0, Math.round(months)));
  return formatIsoDate(d);
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const a = parseIsoDate(fromIso).getTime();
  const b = parseIsoDate(toIso).getTime();
  return Math.round((b - a) / 86400000);
}

export function scaleMonthlyCentsToPeriod(monthlyCents: number, frequency: BudgetFrequency): number {
  const safe = Math.max(0, Math.round(monthlyCents));
  if (frequency === 'daily') return Math.round(safe / 30);
  if (frequency === 'weekly') return Math.round((safe * 7) / 30);
  if (frequency === 'twice_monthly') return Math.round(safe / 2);
  if (frequency === 'yearly') return safe * 12;
  return safe;
}

export function getNextBillDueDate(currentDueDate: string, frequency: BillFrequency): string {
  if (frequency === 'weekly') return addDaysToIso(currentDueDate, 7);
  if (frequency === 'yearly') return addMonthsToIso(currentDueDate, 12);
  if (frequency === 'monthly') return addMonthsToIso(currentDueDate, 1);
  return currentDueDate;
}

export interface SavingsPlanMetrics {
  remainingCents: number;
  pctCompleted: number;
  effectiveDurationMonths: number | null;
  requiredMonthlyCents: number;
  requiredDailyCents: number;
  plannedMonthlyCents: number;
  plannedDailyCents: number;
  estimatedDaysNeeded: number | null;
  estimatedMonthsNeeded: number | null;
  estimatedCompletionDate: string | null;
}

export function calculateSavingsPlan(
  goal: {
    targetCents: number;
    currentCents: number;
    durationMonths?: number | null;
    plannedDailyCents?: number | null;
    plannedMonthlyCents?: number | null;
    targetDate?: string | null;
  },
  referenceDateStr: string = formatIsoDate(new Date())
): SavingsPlanMetrics {
  const target = Math.max(0, Math.round(goal.targetCents));
  const current = Math.max(0, Math.round(goal.currentCents));
  const remainingCents = Math.max(0, target - current);
  const pctCompleted = target > 0 ? Math.min(100, roundPercentage((current / target) * 100)) : 0;

  let effectiveDurationMonths: number | null =
    goal.durationMonths && goal.durationMonths > 0 ? Math.round(goal.durationMonths) : null;

  if (!effectiveDurationMonths && goal.targetDate) {
    const daysLeft = Math.max(1, diffDaysIso(referenceDateStr, goal.targetDate));
    effectiveDurationMonths = Math.max(1, Math.round(daysLeft / 30));
  }

  let requiredMonthlyCents = 0;
  let requiredDailyCents = 0;

  if (remainingCents > 0) {
    if (goal.durationMonths && goal.durationMonths > 0) {
      requiredMonthlyCents = Math.ceil(remainingCents / goal.durationMonths);
      requiredDailyCents = Math.ceil(remainingCents / (goal.durationMonths * 30));
    } else if (goal.targetDate) {
      const daysLeft = Math.max(1, diffDaysIso(referenceDateStr, goal.targetDate));
      requiredDailyCents = Math.ceil(remainingCents / daysLeft);
      requiredMonthlyCents = Math.ceil(remainingCents / Math.max(1 / 30, daysLeft / 30));
    }
  }

  const hasExplicitDaily =
    goal.plannedDailyCents !== null &&
    goal.plannedDailyCents !== undefined &&
    goal.plannedDailyCents > 0;
  const hasExplicitMonthly =
    goal.plannedMonthlyCents !== null &&
    goal.plannedMonthlyCents !== undefined &&
    goal.plannedMonthlyCents > 0;

  const plannedDailyCents = hasExplicitDaily
    ? Math.round(goal.plannedDailyCents!)
    : hasExplicitMonthly
      ? Math.ceil(goal.plannedMonthlyCents! / 30)
      : requiredDailyCents;

  const plannedMonthlyCents = hasExplicitMonthly
    ? Math.round(goal.plannedMonthlyCents!)
    : hasExplicitDaily
      ? plannedDailyCents * 30
      : requiredMonthlyCents;

  let estimatedDaysNeeded: number | null = null;
  let estimatedMonthsNeeded: number | null = null;
  let estimatedCompletionDate: string | null = null;

  if (remainingCents === 0 && target > 0) {
    estimatedDaysNeeded = 0;
    estimatedMonthsNeeded = 0;
    estimatedCompletionDate = referenceDateStr;
  } else if (plannedDailyCents > 0) {
    estimatedDaysNeeded = Math.max(1, Math.ceil(remainingCents / plannedDailyCents));
    estimatedMonthsNeeded = Math.round((estimatedDaysNeeded / 30) * 10) / 10;
    estimatedCompletionDate = addDaysToIso(referenceDateStr, estimatedDaysNeeded);
  } else if (plannedMonthlyCents > 0) {
    estimatedDaysNeeded = Math.max(1, Math.ceil((remainingCents / plannedMonthlyCents) * 30));
    estimatedMonthsNeeded = Math.round((remainingCents / plannedMonthlyCents) * 10) / 10;
    estimatedCompletionDate = addDaysToIso(referenceDateStr, estimatedDaysNeeded);
  }

  return {
    remainingCents,
    pctCompleted,
    effectiveDurationMonths,
    requiredMonthlyCents,
    requiredDailyCents,
    plannedMonthlyCents,
    plannedDailyCents,
    estimatedDaysNeeded,
    estimatedMonthsNeeded,
    estimatedCompletionDate,
  };
}

export interface BillFundingMetrics {
  monthlyBillsCount: number;
  monthlyBillsTotalCents: number;
  dailyTargetCents: number;
  weeklyTargetCents: number;
  unpaidBillsCount: number;
  unpaidBillsTotalCents: number;
}

export function calculateBillFundingMetrics(expectedBills: ExpectedBill[]): BillFundingMetrics {
  const unpaidMonthlyNames = new Set(
    expectedBills
      .filter((b) => b.frequency === 'monthly' && !b.isPaid)
      .map((b) => b.name.trim().toLowerCase())
  );

  const seenPaidMonthlyNames = new Set<string>();
  let monthlyBillsCount = 0;
  let monthlyBillsTotalCents = 0;

  for (const b of expectedBills) {
    if (b.frequency !== 'monthly') continue;
    const normName = b.name.trim().toLowerCase();
    if (!b.isPaid) {
      monthlyBillsCount += 1;
      monthlyBillsTotalCents += b.amountCents;
    } else if (!unpaidMonthlyNames.has(normName) && !seenPaidMonthlyNames.has(normName)) {
      seenPaidMonthlyNames.add(normName);
      monthlyBillsCount += 1;
      monthlyBillsTotalCents += b.amountCents;
    }
  }

  const dailyTargetCents = Math.round(monthlyBillsTotalCents / 30);
  const weeklyTargetCents = dailyTargetCents * 7;
  const unpaid = expectedBills.filter((b) => !b.isPaid);

  return {
    monthlyBillsCount,
    monthlyBillsTotalCents,
    dailyTargetCents,
    weeklyTargetCents,
    unpaidBillsCount: unpaid.length,
    unpaidBillsTotalCents: unpaid.reduce((s, b) => s + b.amountCents, 0),
  };
}

