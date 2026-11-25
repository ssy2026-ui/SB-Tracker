import { GoogleGenAI, Type } from '@google/genai';
import {
  allocateIncomeCents,
  BudgetCategory,
  BudgetFrequency,
  calculateSavingsPlan,
  CURRENCIES,
  CurrencyCode,
  ExpectedBill,
  formatIsoDate,
  formatMoney,
  roundPercentage,
  SavingsGoal,
  scaleMonthlyCentsToPeriod,
  UserType,
} from '../src/shared/finance.ts';

export interface AiBudgetInput {
  userType: UserType;
  currency: CurrencyCode;
  budgetFrequency: BudgetFrequency;
  incomeCents: number;
  categories: BudgetCategory[];
  goals: SavingsGoal[];
  expectedBills?: ExpectedBill[];
  estimatedExpenses?: string;
  financialObligations?: string;
  followUpAnswers?: string;
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

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    throw new AiServiceUnavailableError(
      'The AI budgeting service is not configured yet. Please adjust your budget manually or configure GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class AiServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiServiceUnavailableError';
  }
}

export async function generateAiBudgetSuggestion(
  input: AiBudgetInput
): Promise<AiBudgetSuggestionResult> {
  if (input.categories.length === 0) {
    throw new Error('Add at least one budget category before requesting an AI suggestion.');
  }
  if (input.incomeCents <= 0) {
    throw new Error('Enter a positive income or allowance amount before requesting an AI suggestion.');
  }

  const ai = getAiClient();
  const currencyCfg = CURRENCIES[input.currency] || CURRENCIES.PHP;
  const incomeMajor = input.incomeCents / 100;

  const todayStr = formatIsoDate(new Date());
  const unpaidBills = (input.expectedBills || []).filter((b) => !b.isPaid);
  const totalUnpaidBillsCents = unpaidBills.reduce((s, b) => s + b.amountCents, 0);

  const activeGoals = input.goals.filter((g) => g.status !== 'paused');
  const goalSummary = activeGoals.map((g) => {
    const plan = calculateSavingsPlan(g, todayStr);
    const periodPlannedCents = scaleMonthlyCentsToPeriod(plan.plannedMonthlyCents, input.budgetFrequency);
    return {
      name: g.name,
      remainingAmount: Math.max(0, (g.targetCents - g.currentCents) / 100),
      durationMonths: plan.effectiveDurationMonths,
      requiredMonthlyAmount: plan.requiredMonthlyCents / 100,
      plannedMonthlyAmount: plan.plannedMonthlyCents / 100,
      plannedContributionThisPeriod: periodPlannedCents / 100,
      estimatedCompletionDate: plan.estimatedCompletionDate,
    };
  });
  const totalPeriodSavingsPlanCents = activeGoals.reduce((s, g) => {
    const plan = calculateSavingsPlan(g, todayStr);
    return s + scaleMonthlyCentsToPeriod(plan.plannedMonthlyCents, input.budgetFrequency);
  }, 0);

  const billsSummary = unpaidBills.map((b) => ({
    name: b.name,
    category: b.categoryName,
    amount: b.amountCents / 100,
    dueDate: b.dueDate,
    frequency: b.frequency,
  }));

  const categorySummary = input.categories.map((c) => ({
    categoryId: c.id,
    name: c.name,
    description: c.description || '',
    isEssential: c.isEssential,
    currentPercentage: c.percentage,
  }));

  const prompt = `Analyze this user's financial profile and recommend a tailored percentage allocation across their exact budget categories.

User Profile:
- User Type: ${input.userType}
- Currency: ${currencyCfg.code} (${currencyCfg.symbol})
- Budgeting Frequency: ${input.budgetFrequency.replace('_', ' ')}
- Available Income for this period: ${currencyCfg.symbol}${incomeMajor}

User's Categories (you MUST return an entry for EVERY categoryId listed here, and NO extra categories):
${JSON.stringify(categorySummary, null, 2)}

Upcoming / Unpaid Expected Bills (${currencyCfg.symbol}${(totalUnpaidBillsCents / 100).toFixed(2)} total):
${billsSummary.length > 0 ? JSON.stringify(billsSummary, null, 2) : 'None recorded'}

Active Savings Goals & Planned Contributions (${currencyCfg.symbol}${(totalPeriodSavingsPlanCents / 100).toFixed(2)} planned per ${input.budgetFrequency.replace('_', ' ')} period):
${goalSummary.length > 0 ? JSON.stringify(goalSummary, null, 2) : 'None active'}

Estimated Fixed Expenses provided by user:
${input.estimatedExpenses?.trim() ? input.estimatedExpenses.trim() : 'Not provided'}

Existing Financial Obligations provided by user:
${input.financialObligations?.trim() ? input.financialObligations.trim() : 'Not provided'}

Answers to previous follow-up questions:
${input.followUpAnswers?.trim() ? input.followUpAnswers.trim() : 'None'}

Instructions:
1. Recommend a non-negative percentage for every categoryId above so that ALL recommendedPercentage values sum to EXACTLY 100.
2. Cover existing expected bills and essential living/school/business expenses FIRST before recommending savings contributions.
3. Base allocations thoughtfully on essential vs. non-essential priority, the user's type (${input.userType}), budgeting frequency (${input.budgetFrequency}), upcoming bills, active savings goals' planned contributions, and any estimated expenses or obligations provided.
4. For each category, provide a concise, beginner-friendly 1-2 sentence explanation (reason), a sufficiencyStatus ('sufficient', 'tight', or 'insufficient'), and an optional warningNote if that amount might fall short of expected bills, obligations, or savings targets.
5. Check whether expected bills + essential expenses + planned savings contributions exceed the available income of ${currencyCfg.symbol}${incomeMajor}; clearly explain any shortfall or needed adjustments in insufficientWarnings.
6. If important context is missing (such as whether housing/utilities are shared, daily commute cost, or debt due dates), include 1-3 short, practical followUpQuestions so the user can refine the suggestion.`;

  let rawText = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a careful, practical personal budgeting assistant. Always return valid JSON matching the schema. Percentages must be non-negative numbers summing to 100 across the exact provided categoryIds. Never invent categories or omit categories.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallSummary: {
              type: Type.STRING,
              description: 'A brief 2-3 sentence friendly overview of the recommended budget plan.',
            },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  categoryId: { type: Type.STRING },
                  recommendedPercentage: { type: Type.NUMBER },
                  reason: { type: Type.STRING },
                  sufficiencyStatus: {
                    type: Type.STRING,
                    description: "One of 'sufficient', 'tight', or 'insufficient'.",
                  },
                  warningNote: {
                    type: Type.STRING,
                    description: 'Optional short warning if allocation may be insufficient, or empty string.',
                  },
                },
                required: ['categoryId', 'recommendedPercentage', 'reason', 'sufficiencyStatus'],
              },
            },
            insufficientWarnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            followUpQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['overallSummary', 'suggestions', 'insufficientWarnings', 'followUpQuestions'],
        },
      },
    });
    rawText = (response.text ?? '').trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Gemini API error:', message);
    throw new AiServiceUnavailableError(
      'The AI budgeting service could not be reached right now. You can continue editing your budget manually or try again shortly.'
    );
  }

  let parsed: {
    overallSummary?: string;
    suggestions?: Array<{
      categoryId?: string;
      recommendedPercentage?: number;
      reason?: string;
      sufficiencyStatus?: string;
      warningNote?: string;
    }>;
    insufficientWarnings?: string[];
    followUpQuestions?: string[];
  };

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new AiServiceUnavailableError(
      'Received an unreadable response from the AI assistant. Please try regenerating or adjust your budget manually.'
    );
  }

  // Controlled server-side validation & normalization:
  // 1. Ensure every existing user category is mapped cleanly with non-negative percentages.
  const rawMap = new Map<
    string,
    { pct: number; reason: string; status: 'sufficient' | 'tight' | 'insufficient'; warning: string | null }
  >();

  for (const s of parsed.suggestions || []) {
    if (!s.categoryId) continue;
    const catExists = input.categories.some((c) => c.id === s.categoryId);
    if (!catExists) continue;
    const pct = Number.isFinite(Number(s.recommendedPercentage))
      ? Math.max(0, Number(s.recommendedPercentage))
      : 0;
    const status =
      s.sufficiencyStatus === 'insufficient' || s.sufficiencyStatus === 'tight'
        ? s.sufficiencyStatus
        : 'sufficient';
    rawMap.set(s.categoryId, {
      pct,
      reason: (s.reason || 'Allocated based on category priority and income.').trim(),
      status,
      warning: s.warningNote && s.warningNote.trim() ? s.warningNote.trim() : null,
    });
  }

  // Fill any omitted categories with their current percentage or equal share
  const missingCats = input.categories.filter((c) => !rawMap.has(c.id));
  for (const mc of missingCats) {
    rawMap.set(mc.id, {
      pct: Math.max(0, mc.percentage),
      reason: 'Preserved allocation so no category is left unfunded.',
      status: 'tight',
      warning: null,
    });
  }

  // Normalize all percentages so total equals EXACTLY 100.00%
  const rawTotal = Array.from(rawMap.values()).reduce((sum, v) => sum + v.pct, 0);
  const normalizedPcts = new Map<string, number>();

  if (rawTotal <= 0) {
    const base = Math.floor((10000 / input.categories.length)) / 100;
    let running = 0;
    input.categories.forEach((c, idx) => {
      if (idx === input.categories.length - 1) {
        normalizedPcts.set(c.id, roundPercentage(100 - running));
      } else {
        normalizedPcts.set(c.id, base);
        running = roundPercentage(running + base);
      }
    });
  } else {
    // Normalize to 100 using integer basis points (0.01% units = 10,000 total)
    const bpsItems = input.categories.map((c, idx) => {
      const raw = (rawMap.get(c.id)!.pct / rawTotal) * 10000;
      const base = Math.floor(raw);
      return { id: c.id, idx, base, rem: raw - base };
    });
    let remBps = 10000 - bpsItems.reduce((s, i) => s + i.base, 0);
    const sorted = [...bpsItems].sort((a, b) => (b.rem !== a.rem ? b.rem - a.rem : a.idx - b.idx));
    for (const item of sorted) {
      if (remBps <= 0) break;
      item.base += 1;
      remBps -= 1;
    }
    for (const item of bpsItems) {
      normalizedPcts.set(item.id, item.base / 100);
    }
  }

  const alloc = allocateIncomeCents(
    input.incomeCents,
    input.categories.map((c) => ({
      id: c.id,
      percentage: normalizedPcts.get(c.id) ?? 0,
      sortOrder: c.sortOrder,
    }))
  );

  const suggestions: AiSuggestedCategory[] = input.categories.map((c) => {
    const meta = rawMap.get(c.id)!;
    return {
      categoryId: c.id,
      categoryName: c.name,
      icon: c.icon,
      color: c.color,
      isEssential: c.isEssential,
      recommendedPercentage: normalizedPcts.get(c.id) ?? 0,
      recommendedCents: alloc.allocations[c.id] ?? 0,
      reason: meta.reason,
      sufficiencyStatus: meta.status,
      warningNote: meta.warning,
    };
  });

  const warnings = (parsed.insufficientWarnings || []).filter((w) => w && w.trim());
  if (totalPeriodSavingsPlanCents > input.incomeCents) {
    warnings.unshift(
      `Your active savings goal contributions (${formatMoney(totalPeriodSavingsPlanCents, input.currency)} per ${input.budgetFrequency.replace('_', ' ')}) exceed your available income of ${formatMoney(input.incomeCents, input.currency)}. Consider extending a goal duration or pausing a goal.`
    );
  } else if (totalUnpaidBillsCents + totalPeriodSavingsPlanCents > input.incomeCents) {
    warnings.unshift(
      `Your unpaid expected bills (${formatMoney(totalUnpaidBillsCents, input.currency)}) plus planned savings goal contributions (${formatMoney(totalPeriodSavingsPlanCents, input.currency)}) exceed your available income of ${formatMoney(input.incomeCents, input.currency)}.`
    );
  }

  return {
    suggestions,
    totalPercentage: alloc.totalPercentage,
    totalRecommendedCents: alloc.totalAllocatedCents,
    overallSummary:
      (parsed.overallSummary || '').trim() ||
      'Here is a balanced budget recommendation tailored to your income, expected bills, and savings goals.',
    insufficientWarnings: warnings,
    followUpQuestions: (parsed.followUpQuestions || []).filter((q) => q && q.trim()).slice(0, 3),
    roundingAdjusted: alloc.roundingAdjusted,
  };
}
