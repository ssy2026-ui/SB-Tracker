import {
  AppNotification,
  BillFrequency,
  BudgetCategory,
  BudgetFrequency,
  CategoryDeposit,
  CurrencyCode,
  ExpectedBill,
  ExpenseTransaction,
  HistoricalPeriodSummary,
  PeriodInfo,
  SavingsEntry,
  SavingsGoal,
  SavingsGoalStatus,
  ThemeId,
  UserProfile,
  UserType,
} from '../shared/finance';

export interface WorkspaceState {
  user: UserProfile;
  currentPeriod: PeriodInfo;
  selectedPeriod: PeriodInfo;
  isViewingCurrentPeriod: boolean;
  categories: BudgetCategory[];
  totalPercentage: number;
  totalAllocatedCents: number;
  remainingBudgetCents: number;
  unallocatedCents: number;
  overAllocatedCents: number;
  roundingAdjusted: boolean;
  periodTransactions: ExpenseTransaction[];
  allTransactions: ExpenseTransaction[];
  periodCategoryDeposits: CategoryDeposit[];
  allCategoryDeposits: CategoryDeposit[];
  expectedBills: ExpectedBill[];
  historicalPeriods: HistoricalPeriodSummary[];
  savingsGoals: SavingsGoal[];
  savingsEntries: SavingsEntry[];
  notifications: AppNotification[];
}

export interface AiSuggestedCategory {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  isEssential: boolean;
  recommendedPercentage: number;
  recommendedCents: number;
  reason: string;
  sufficiencyStatus: 'sufficient' | 'tight' | 'insufficient';
  warningNote: string | null;
}

export interface AiBudgetSuggestionResult {
  suggestions: AiSuggestedCategory[];
  totalPercentage: number;
  totalRecommendedCents: number;
  overallSummary: string;
  insufficientWarnings: string[];
  followUpQuestions: string[];
  roundingAdjusted: boolean;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let inMemoryToken: string | null = null;

export function clearInMemoryAuthToken(): void {
  inMemoryToken = null;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (inMemoryToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${inMemoryToken}`;
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    if (res.status === 401) {
      inMemoryToken = null;
    }
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.',
      res.status,
      typeof data.code === 'string' ? data.code : undefined
    );
  }
  return data as T;
}

export const api = {
  register: async (payload: { email: string; password: string; name: string }) => {
    const res = await request<{ user: UserProfile; token?: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) inMemoryToken = res.token;
    return res;
  },

  login: async (payload: { email: string; password: string }) => {
    const res = await request<{ user: UserProfile; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) inMemoryToken = res.token;
    return res;
  },

  startDemo: async () => {
    const res = await request<{ user: UserProfile; token?: string }>('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (res.token) inMemoryToken = res.token;
    return res;
  },

  logout: async () => {
    try {
      return await request<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } finally {
      inMemoryToken = null;
    }
  },

  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  getState: (periodKey?: string) =>
    request<WorkspaceState>(
      periodKey ? `/api/state?periodKey=${encodeURIComponent(periodKey)}` : '/api/state'
    ),

  completeOnboarding: (payload: {
    userType: UserType;
    currency: CurrencyCode;
    budgetFrequency: BudgetFrequency;
    periodStartDay: number;
    incomeCents: number;
    templateId: string;
    initialGoal?: {
      name: string;
      icon: string;
      targetCents: number;
      targetDate: string | null;
      plannedDailyCents?: number | null;
    } | null;
  }) =>
    request<{ user: UserProfile }>('/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProfile: (payload: Partial<{
    name: string;
    userType: UserType;
    currency: CurrencyCode;
    theme: ThemeId;
    privacyHideBalances: boolean;
    notifBillReminders: boolean;
    notifDailySavingsReminder: boolean;
    notifMissedSavingsAlert: boolean;
    notifSavingsMilestone: boolean;
    browserNotificationsEnabled: boolean;
  }>) =>
    request<{ user: UserProfile }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteAccount: async (payload: { password?: string }) => {
    try {
      return await request<{ ok: boolean }>('/api/account', {
        method: 'DELETE',
        body: JSON.stringify(payload),
      });
    } finally {
      inMemoryToken = null;
    }
  },

  saveBudget: (payload: {
    incomeCents?: number;
    budgetFrequency?: BudgetFrequency;
    periodStartDay?: number;
    categories?: Array<{
      id?: string;
      name: string;
      icon: string;
      description?: string;
      percentage: number;
      manualAmountCents?: number | null;
      isEssential: boolean;
      color?: string;
    }>;
  }) =>
    request<{
      user: UserProfile;
      categories: BudgetCategory[];
      totalPercentage: number;
      totalAllocatedCents: number;
      remainingBudgetCents: number;
      unallocatedCents: number;
      overAllocatedCents: number;
      roundingAdjusted: boolean;
    }>('/api/budget', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  applyTemplate: (templateId: string) =>
    request<{ categories: BudgetCategory[] }>('/api/budget/apply-template', {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    }),

  createCategory: (payload: {
    name: string;
    icon: string;
    description: string;
    percentage: number;
    manualAmountCents?: number | null;
    isEssential: boolean;
    color: string;
  }) =>
    request<{ categories: BudgetCategory[] }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCategory: (
    id: string,
    payload: Partial<{
      name: string;
      icon: string;
      description: string;
      percentage: number;
      manualAmountCents: number | null;
      isEssential: boolean;
      color: string;
    }>
  ) =>
    request<{ categories: BudgetCategory[] }>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteCategory: (id: string, reassignTo = 'preserve') =>
    request<{ categories: BudgetCategory[] }>(
      `/api/categories/${encodeURIComponent(id)}?reassignTo=${encodeURIComponent(reassignTo)}`,
      { method: 'DELETE' }
    ),

  addTransaction: (payload: {
    amountCents: number;
    categoryId: string | null;
    description: string;
    txDate: string;
    clientRequestId: string;
  }) =>
    request<{ id: string; duplicate?: boolean }>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTransaction: (
    id: string,
    payload: {
      amountCents: number;
      categoryId: string | null;
      description: string;
      txDate: string;
    }
  ) =>
    request<{ ok: boolean }>(`/api/transactions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteTransaction: (id: string) =>
    request<{ ok: boolean }>(`/api/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  addCategoryDeposit: (
    categoryId: string,
    payload: {
      amountCents: number;
      note: string;
      depositDate: string;
      clientRequestId: string;
    }
  ) =>
    request<{ id: string; duplicate?: boolean }>(
      `/api/categories/${encodeURIComponent(categoryId)}/deposits`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  deleteCategoryDeposit: (depositId: string) =>
    request<{ ok: boolean }>(`/api/category-deposits/${encodeURIComponent(depositId)}`, {
      method: 'DELETE',
    }),

  createBill: (payload: {
    name: string;
    amountCents: number;
    dueDate: string;
    frequency: BillFrequency;
    categoryId: string | null;
    notes: string;
  }) =>
    request<{ id: string }>('/api/bills', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBill: (
    id: string,
    payload: Partial<{
      name: string;
      amountCents: number;
      dueDate: string;
      frequency: BillFrequency;
      categoryId: string | null;
      notes: string;
    }>
  ) =>
    request<{ ok: boolean }>(`/api/bills/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  markBillPaid: (
    id: string,
    payload: {
      isPaid?: boolean;
      recordAsExpense?: boolean;
      paidDate?: string;
      createNextOccurrence?: boolean;
    } = {}
  ) =>
    request<{ isPaid: boolean; createdTransactionId: string | null; nextBillId: string | null }>(
      `/api/bills/${encodeURIComponent(id)}/mark-paid`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  deleteBill: (id: string) =>
    request<{ ok: boolean }>(`/api/bills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createGoal: (payload: {
    name: string;
    icon: string;
    targetCents: number;
    targetDate: string | null;
    durationMonths?: number | null;
    plannedDailyCents?: number | null;
    plannedMonthlyCents?: number | null;
    status?: SavingsGoalStatus;
  }) =>
    request<{ id: string }>('/api/savings/goals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateGoal: (
    id: string,
    payload: Partial<{
      name: string;
      icon: string;
      targetCents: number;
      targetDate: string | null;
      durationMonths: number | null;
      plannedDailyCents: number | null;
      plannedMonthlyCents: number | null;
      status: SavingsGoalStatus;
    }>
  ) =>
    request<{ ok: boolean }>(`/api/savings/goals/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteGoal: (id: string) =>
    request<{ ok: boolean }>(`/api/savings/goals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  recordSavingsEntry: (
    goalId: string,
    payload: {
      type: 'deposit' | 'withdrawal';
      amountCents: number;
      note: string;
      entryDate: string;
      clientRequestId: string;
    }
  ) =>
    request<{ currentCents: number }>(
      `/api/savings/goals/${encodeURIComponent(goalId)}/entries`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  deleteSavingsEntry: (entryId: string) =>
    request<{ ok: boolean; currentCents: number }>(
      `/api/savings/entries/${encodeURIComponent(entryId)}`,
      { method: 'DELETE' }
    ),

  suggestBudget: (payload: {
    estimatedExpenses?: string;
    financialObligations?: string;
    followUpAnswers?: string;
    incomeCentsOverride?: number;
  }) =>
    request<AiBudgetSuggestionResult>('/api/ai/suggest-budget', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  markNotificationsRead: (notificationId?: string) =>
    request<{ notifications: AppNotification[] }>('/api/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify({ notificationId }),
    }),

  exportAllJson: () => request<Record<string, unknown>>('/api/export'),
};
