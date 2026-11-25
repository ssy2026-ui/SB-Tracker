import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import {
  applyTemplateForUser,
  createDemoAccount,
  createSession,
  createUser,
  db,
  deleteSession,
  ensurePeriodSnapshot,
  evaluateSavingsMilestoneAlert,
  evaluateUserAlerts,
  getCategoriesForUser,
  getCategoryDepositsForUser,
  getExpectedBillsForUser,
  getHistoricalPeriodsForUser,
  getNotificationsForUser,
  getSavingsGoalsForUser,
  getTransactionsForUser,
  getUserByEmail,
  getUserById,
  getUserBySessionToken,
  hashPassword,
  replaceCategoriesForUser,
  verifyPassword,
} from './server/db.ts';
import { AiServiceUnavailableError, generateAiBudgetSuggestion } from './server/ai.ts';
import {
  BillFrequency,
  BUDGET_TEMPLATES,
  BudgetFrequency,
  CATEGORY_COLORS,
  CURRENCIES,
  CurrencyCode,
  formatIsoDate,
  getNextBillDueDate,
  getPeriodInfo,
  roundPercentage,
  SavingsGoalStatus,
  shiftDaysIso,
  THEMES,
  ThemeId,
  UserProfile,
  UserType,
} from './src/shared/finance.ts';

const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE_NAME = 'pw_session';

interface AuthedRequest extends Request {
  user?: UserProfile;
  sessionToken?: string;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  return req.secure || proto === 'https' || origin.startsWith('https://') || !isLocal;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${30 * 24 * 60 * 60}`,
  ];
  if (isHttps) {
    attrs.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);
  const attrs = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'Max-Age=0'];
  if (isHttps) {
    attrs.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const hasHeader = req.headers['x-requested-with'] === 'XMLHttpRequest';
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  let sameOrigin = false;
  if (origin && host) {
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
  }
  if (!hasHeader && !sameOrigin) {
    res.status(403).json({ error: 'Request verification failed. Please refresh and try again.' });
    return;
  }
  next();
}

function extractSessionToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || '';
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const rawToken = extractSessionToken(req);
  if (!rawToken) {
    res.status(401).json({ error: 'Please sign in to access your budget.' });
    return;
  }
  const user = getUserBySessionToken(rawToken);
  if (!user) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return;
  }
  req.user = user;
  req.sessionToken = rawToken;
  next();
}

const VALID_THEMES = new Set<string>(THEMES.map((t) => t.id));
const VALID_CURRENCIES = new Set<string>(Object.keys(CURRENCIES));
const VALID_FREQUENCIES = new Set<string>(['daily', 'weekly', 'twice_monthly', 'monthly', 'yearly']);
const VALID_BILL_FREQUENCIES = new Set<string>(['one_time', 'weekly', 'monthly', 'yearly']);
const VALID_USER_TYPES = new Set<string>(['student', 'employee', 'entrepreneur']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', verifyCsrf);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // --- AUTH ROUTES ---
  app.post('/api/auth/register', (req, res) => {
    const { email, password, name } = req.body || {};
    if (typeof email !== 'string' || !isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      res.status(400).json({ error: 'Please enter your name (2–80 characters).' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }
    if (getUserByEmail(email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    const user = createUser({ email, password, name });
    const token = createSession(user.id);
    setSessionCookie(req, res, token);
    res.status(201).json({ user, token });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      res.status(400).json({ error: 'Please enter both your email and password.' });
      return;
    }
    const existing = getUserByEmail(email);
    if (!existing || !verifyPassword(password, existing.passwordHash)) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }
    const token = createSession(existing.id);
    setSessionCookie(req, res, token);
    const { passwordHash: _pw, ...user } = existing;
    res.json({ user, token });
  });

  app.post('/api/auth/demo', (req, res) => {
    const { user, token } = createDemoAccount();
    setSessionCookie(req, res, token);
    res.status(201).json({ user, token });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    const rawToken = extractSessionToken(req);
    if (rawToken) {
      deleteSession(rawToken);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    res.json({
      ok: true,
      message:
        'Automated password reset emails are not enabled on this server. If you are already signed in, you can change your password anytime under Settings > Password & Account Security.',
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  // --- FULL STATE HYDRATION ---
  app.get('/api/state', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const todayStr = formatIsoDate(new Date());
    ensurePeriodSnapshot(user, todayStr);
    evaluateUserAlerts(user, todayStr);

    const currentPeriod = getPeriodInfo(
      user.budgetFrequency,
      todayStr,
      user.periodStartDay,
      user.periodStartDate
    );

    const historicalPeriods = getHistoricalPeriodsForUser(user, todayStr);
    const requestedPeriodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : '';
    const selectedSummary =
      historicalPeriods.find((p) => p.periodKey === requestedPeriodKey) || null;

    const activePeriod = selectedSummary
      ? {
          periodKey: selectedSummary.periodKey,
          label: selectedSummary.label,
          startDate: selectedSummary.startDate,
          endDate: selectedSummary.endDate,
          daysRemaining:
            selectedSummary.periodKey === currentPeriod.periodKey ? currentPeriod.daysRemaining : 0,
          nextPeriodStart: currentPeriod.nextPeriodStart,
        }
      : currentPeriod;

    const periodIncomeCents = selectedSummary ? selectedSummary.incomeCents : user.incomeCents;
    const catBundle = getCategoriesForUser(user.id, periodIncomeCents);
    const periodTransactions = getTransactionsForUser(user.id, {
      startDate: activePeriod.startDate,
      endDate: activePeriod.endDate,
    });
    const allTransactions = getTransactionsForUser(user.id);
    const periodCategoryDeposits = getCategoryDepositsForUser(user.id, {
      startDate: activePeriod.startDate,
      endDate: activePeriod.endDate,
    });
    const allCategoryDeposits = getCategoryDepositsForUser(user.id);
    const expectedBills = getExpectedBillsForUser(user.id);
    const { goals, entries } = getSavingsGoalsForUser(user.id);
    const notifications = getNotificationsForUser(user.id);

    res.json({
      user,
      currentPeriod,
      selectedPeriod: activePeriod,
      isViewingCurrentPeriod: activePeriod.periodKey === currentPeriod.periodKey,
      categories: catBundle.categories,
      totalPercentage: catBundle.totalPercentage,
      totalAllocatedCents: catBundle.totalAllocatedCents,
      remainingBudgetCents: catBundle.remainingBudgetCents,
      unallocatedCents: catBundle.unallocatedCents,
      overAllocatedCents: catBundle.overAllocatedCents,
      roundingAdjusted: catBundle.roundingAdjusted,
      periodTransactions,
      allTransactions,
      periodCategoryDeposits,
      allCategoryDeposits,
      expectedBills,
      historicalPeriods,
      savingsGoals: goals,
      savingsEntries: entries,
      notifications,
    });
  });

  // --- ONBOARDING ---
  app.post('/api/onboarding', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const {
      userType,
      currency,
      budgetFrequency,
      periodStartDay,
      incomeCents,
      templateId,
      initialGoal,
    } = req.body || {};

    if (!VALID_USER_TYPES.has(userType)) {
      res.status(400).json({ error: 'Please select whether you are a student, employee, or entrepreneur.' });
      return;
    }
    if (!VALID_CURRENCIES.has(currency)) {
      res.status(400).json({ error: 'Please select a valid currency.' });
      return;
    }
    if (!VALID_FREQUENCIES.has(budgetFrequency)) {
      res.status(400).json({ error: 'Please select a valid budgeting frequency.' });
      return;
    }
    const parsedIncome = Math.round(Number(incomeCents));
    if (!Number.isFinite(parsedIncome) || parsedIncome < 0) {
      res.status(400).json({ error: 'Please enter a valid non-negative income or allowance.' });
      return;
    }
    const startDay = Math.max(0, Math.min(28, Math.round(Number(periodStartDay ?? 1))));

    db.prepare(
      `UPDATE users
       SET user_type = ?, currency = ?, budget_frequency = ?, period_start_day = ?,
           income_cents = ?, onboarding_completed = 1
       WHERE id = ?`
    ).run(userType, currency, budgetFrequency, startDay, parsedIncome, user.id);

    if (typeof templateId === 'string' && templateId) {
      applyTemplateForUser(user.id, templateId);
    } else {
      const existingCats = getCategoriesForUser(user.id, parsedIncome);
      if (existingCats.categories.length === 0) {
        const defaultTpl =
          BUDGET_TEMPLATES.find((t) => t.audience === userType) || BUDGET_TEMPLATES[0];
        applyTemplateForUser(user.id, defaultTpl.id);
      }
    }

    if (
      initialGoal &&
      typeof initialGoal.name === 'string' &&
      initialGoal.name.trim() &&
      Number(initialGoal.targetCents) > 0
    ) {
      const initDaily =
        initialGoal.plannedDailyCents !== null &&
        initialGoal.plannedDailyCents !== undefined &&
        Number(initialGoal.plannedDailyCents) > 0
          ? Math.round(Number(initialGoal.plannedDailyCents))
          : null;
      const initMonthly = initDaily ? initDaily * 30 : null;
      db.prepare(
        `INSERT INTO savings_goals (id, user_id, name, icon, target_cents, current_cents, target_date, planned_daily_cents, planned_monthly_cents, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        user.id,
        initialGoal.name.trim().slice(0, 80),
        typeof initialGoal.icon === 'string' && initialGoal.icon ? initialGoal.icon : '🎯',
        Math.round(Number(initialGoal.targetCents)),
        typeof initialGoal.targetDate === 'string' && ISO_DATE_RE.test(initialGoal.targetDate)
          ? initialGoal.targetDate
          : null,
        initDaily,
        initMonthly,
        new Date().toISOString()
      );
    }

    const updated = getUserById(user.id)!;
    ensurePeriodSnapshot(updated, formatIsoDate(new Date()));
    res.json({ user: updated });
  });

  // --- PROFILE & SETTINGS ---
  app.put('/api/profile', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const body = req.body || {};

    const name =
      typeof body.name === 'string' && body.name.trim().length >= 2
        ? body.name.trim().slice(0, 80)
        : user.name;
    const userType: UserType = VALID_USER_TYPES.has(body.userType) ? body.userType : user.userType;
    const currency: CurrencyCode = VALID_CURRENCIES.has(body.currency) ? body.currency : user.currency;
    const theme: ThemeId = VALID_THEMES.has(body.theme) ? body.theme : user.theme;
    const privacyHideBalances =
      typeof body.privacyHideBalances === 'boolean'
        ? body.privacyHideBalances
        : user.privacyHideBalances;
    const notifBillReminders =
      typeof body.notifBillReminders === 'boolean'
        ? body.notifBillReminders
        : user.notifBillReminders;
    const notifDailySavingsReminder =
      typeof body.notifDailySavingsReminder === 'boolean'
        ? body.notifDailySavingsReminder
        : user.notifDailySavingsReminder;
    const notifMissedSavingsAlert =
      typeof body.notifMissedSavingsAlert === 'boolean'
        ? body.notifMissedSavingsAlert
        : user.notifMissedSavingsAlert;
    const notifSavingsMilestone =
      typeof body.notifSavingsMilestone === 'boolean'
        ? body.notifSavingsMilestone
        : user.notifSavingsMilestone;
    const browserNotificationsEnabled =
      typeof body.browserNotificationsEnabled === 'boolean'
        ? body.browserNotificationsEnabled
        : user.browserNotificationsEnabled;

    db.prepare(
      `UPDATE users SET
        name = ?, user_type = ?, currency = ?, theme = ?,
        privacy_hide_balances = ?, notif_bill_reminders = ?, notif_daily_savings = ?,
        notif_missed_savings = ?, notif_savings_milestone = ?, browser_notifications_enabled = ?
       WHERE id = ?`
    ).run(
      name,
      userType,
      currency,
      theme,
      privacyHideBalances ? 1 : 0,
      notifBillReminders ? 1 : 0,
      notifDailySavingsReminder ? 1 : 0,
      notifMissedSavingsAlert ? 1 : 0,
      notifSavingsMilestone ? 1 : 0,
      browserNotificationsEnabled ? 1 : 0,
      user.id
    );

    const updatedUser = getUserById(user.id)!;
    if (!notifBillReminders) {
      db.prepare(
        "DELETE FROM notifications WHERE user_id = ? AND type IN ('bill_upcoming', 'bill_due_today', 'bill_overdue', 'bill_reminder')"
      ).run(user.id);
    }
    if (!notifDailySavingsReminder) {
      db.prepare("DELETE FROM notifications WHERE user_id = ? AND type = 'savings_daily_reminder'").run(user.id);
    }
    if (!notifMissedSavingsAlert) {
      db.prepare("DELETE FROM notifications WHERE user_id = ? AND type = 'savings_missed_deposit'").run(user.id);
    }
    evaluateUserAlerts(updatedUser, formatIsoDate(new Date()));
    res.json({ user: updatedUser });
  });

  app.put('/api/auth/password', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    if (user.isDemo) {
      res.status(400).json({ error: 'Password cannot be changed on a sample demo account.' });
      return;
    }
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'Please fill in both your current and new password.' });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }
    const full = getUserByEmail(user.email);
    if (!full || !verifyPassword(currentPassword, full.passwordHash)) {
      res.status(401).json({ error: 'Your current password is incorrect.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(newPassword),
      user.id
    );
    res.json({ ok: true });
  });

  app.delete('/api/account', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { password } = req.body || {};
    if (!user.isDemo) {
      if (typeof password !== 'string' || !password) {
        res.status(400).json({ error: 'Please enter your password to confirm account deletion.' });
        return;
      }
      const full = getUserByEmail(user.email);
      if (!full || !verifyPassword(password, full.passwordHash)) {
        res.status(401).json({ error: 'Incorrect password. Account was not deleted.' });
        return;
      }
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // --- BUDGET ALLOCATION & SCHEDULE ---
  app.put('/api/budget', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { incomeCents, budgetFrequency, periodStartDay, categories } = req.body || {};

    const nextIncome =
      incomeCents !== undefined ? Math.round(Number(incomeCents)) : user.incomeCents;
    if (!Number.isFinite(nextIncome) || nextIncome < 0) {
      res.status(400).json({ error: 'Income or allowance must be zero or a positive amount.' });
      return;
    }

    const nextFreq: BudgetFrequency =
      budgetFrequency && VALID_FREQUENCIES.has(budgetFrequency)
        ? budgetFrequency
        : user.budgetFrequency;
    const nextStartDay =
      periodStartDay !== undefined
        ? Math.max(0, Math.min(28, Math.round(Number(periodStartDay))))
        : user.periodStartDay;

    if (Array.isArray(categories)) {
      for (const c of categories) {
        if (typeof c.name !== 'string' || !c.name.trim()) {
          res.status(400).json({ error: 'Every category must have a name.' });
          return;
        }
        if (c.manualAmountCents !== null && c.manualAmountCents !== undefined) {
          const amt = Number(c.manualAmountCents);
          if (!Number.isFinite(amt) || amt < 0) {
            res.status(400).json({ error: `Invalid amount for "${c.name}". Amount cannot be negative.` });
            return;
          }
        } else {
          const pct = Number(c.percentage);
          if (!Number.isFinite(pct) || pct < 0) {
            res.status(400).json({ error: `Invalid percentage for "${c.name}". Must be zero or greater.` });
            return;
          }
        }
      }
      replaceCategoriesForUser(user.id, categories, nextIncome);
    }

    db.prepare(
      'UPDATE users SET income_cents = ?, budget_frequency = ?, period_start_day = ? WHERE id = ?'
    ).run(nextIncome, nextFreq, nextStartDay, user.id);

    const updated = getUserById(user.id)!;
    const todayStr = formatIsoDate(new Date());
    ensurePeriodSnapshot(updated, todayStr);
    evaluateUserAlerts(updated, todayStr);

    const bundle = getCategoriesForUser(updated.id, updated.incomeCents);
    res.json({ user: updated, ...bundle });
  });

  app.post('/api/budget/apply-template', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { templateId } = req.body || {};
    if (!applyTemplateForUser(user.id, String(templateId || ''))) {
      res.status(400).json({ error: 'Selected budget template was not found.' });
      return;
    }
    const bundle = getCategoriesForUser(user.id, user.incomeCents);
    res.json(bundle);
  });

  // --- CUSTOM CATEGORIES ---
  app.post('/api/categories', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { name, icon, description, percentage, manualAmountCents, isEssential, color } =
      req.body || {};
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
      res.status(400).json({ error: 'Please enter a category name (1–50 characters).' });
      return;
    }

    let manualAmt: number | null = null;
    let pct = 0;
    if (manualAmountCents !== null && manualAmountCents !== undefined) {
      const parsedAmt = Math.round(Number(manualAmountCents));
      if (!Number.isFinite(parsedAmt) || parsedAmt < 0) {
        res.status(400).json({ error: 'Allocated amount must be zero or greater.' });
        return;
      }
      manualAmt = parsedAmt;
      pct = user.incomeCents > 0 ? roundPercentage((manualAmt / user.incomeCents) * 100) : 0;
    } else {
      pct = roundPercentage(Number(percentage ?? 0));
      if (!Number.isFinite(pct) || pct < 0) {
        res.status(400).json({ error: 'Category percentage must be zero or greater.' });
        return;
      }
    }

    const current = getCategoriesForUser(user.id, user.incomeCents);
    const newId = crypto.randomUUID();
    const chosenColor =
      typeof color === 'string' && color.startsWith('#')
        ? color
        : CATEGORY_COLORS[current.categories.length % CATEGORY_COLORS.length];

    db.prepare(
      `INSERT INTO categories (id, user_id, name, icon, description, percentage, manual_amount_cents, is_essential, color, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId,
      user.id,
      name.trim(),
      typeof icon === 'string' && icon ? icon : '🧾',
      typeof description === 'string' ? description.trim().slice(0, 140) : '',
      pct,
      manualAmt,
      isEssential === false ? 0 : 1,
      chosenColor,
      current.categories.length,
      new Date().toISOString()
    );

    res.status(201).json(getCategoriesForUser(user.id, user.incomeCents));
  });

  app.put('/api/categories/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const catId = String(req.params.id);
    const existing = db
      .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
      .get(catId, user.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }

    const { name, icon, description, percentage, manualAmountCents, isEssential, color } =
      req.body || {};
    const nextName =
      typeof name === 'string' && name.trim().length > 0
        ? name.trim().slice(0, 50)
        : String(existing.name);
    const nextIcon = typeof icon === 'string' && icon ? icon : String(existing.icon);
    const nextDesc =
      typeof description === 'string' ? description.trim().slice(0, 140) : String(existing.description || '');

    let nextManualAmt: number | null =
      existing.manual_amount_cents !== null && existing.manual_amount_cents !== undefined
        ? Number(existing.manual_amount_cents)
        : null;
    let nextPct =
      percentage !== undefined ? roundPercentage(Number(percentage)) : Number(existing.percentage);

    if (manualAmountCents !== undefined) {
      if (manualAmountCents === null) {
        nextManualAmt = null;
      } else {
        const parsedAmt = Math.round(Number(manualAmountCents));
        if (!Number.isFinite(parsedAmt) || parsedAmt < 0) {
          res.status(400).json({ error: 'Allocated amount must be zero or greater.' });
          return;
        }
        nextManualAmt = parsedAmt;
        nextPct = user.incomeCents > 0 ? roundPercentage((parsedAmt / user.incomeCents) * 100) : 0;
      }
    }

    if (!Number.isFinite(nextPct) || nextPct < 0) {
      res.status(400).json({ error: 'Percentage must be zero or greater.' });
      return;
    }

    const nextEssential =
      typeof isEssential === 'boolean' ? (isEssential ? 1 : 0) : Number(existing.is_essential);
    const nextColor =
      typeof color === 'string' && color.startsWith('#') ? color : String(existing.color);

    db.prepare(
      `UPDATE categories SET name = ?, icon = ?, description = ?, percentage = ?, manual_amount_cents = ?, is_essential = ?, color = ?
       WHERE id = ? AND user_id = ?`
    ).run(nextName, nextIcon, nextDesc, nextPct, nextManualAmt, nextEssential, nextColor, catId, user.id);

    db.prepare(
      `UPDATE transactions
       SET category_name_snapshot = ?, category_icon_snapshot = ?, category_color_snapshot = ?
       WHERE user_id = ? AND category_id = ?`
    ).run(nextName, nextIcon, nextColor, user.id, catId);

    db.prepare(
      `UPDATE expected_bills
       SET category_name_snapshot = ?, category_icon_snapshot = ?, category_color_snapshot = ?
       WHERE user_id = ? AND category_id = ?`
    ).run(nextName, nextIcon, nextColor, user.id, catId);

    res.json(getCategoriesForUser(user.id, user.incomeCents));
  });

  app.delete('/api/categories/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const catId = String(req.params.id);
    const existing = db
      .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
      .get(catId, user.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }

    const reassignTo = typeof req.query.reassignTo === 'string' ? req.query.reassignTo : 'preserve';
    const txCountRow = db
      .prepare('SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ? AND category_id = ?')
      .get(user.id, catId) as { cnt: number };

    db.exec('BEGIN');
    try {
      if (txCountRow.cnt > 0) {
        if (reassignTo && reassignTo !== 'preserve' && reassignTo !== catId) {
          const targetCat = db
            .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
            .get(reassignTo, user.id) as Record<string, unknown> | undefined;
          if (!targetCat) {
            db.exec('ROLLBACK');
            res.status(400).json({ error: 'Selected replacement category was not found.' });
            return;
          }
          db.prepare(
            `UPDATE transactions
             SET category_id = ?, category_name_snapshot = ?, category_icon_snapshot = ?, category_color_snapshot = ?
             WHERE user_id = ? AND category_id = ?`
          ).run(
            String(targetCat.id),
            String(targetCat.name),
            String(targetCat.icon),
            String(targetCat.color),
            user.id,
            catId
          );
          db.prepare(
            `UPDATE category_deposits
             SET category_id = ?, category_name_snapshot = ?
             WHERE user_id = ? AND category_id = ?`
          ).run(String(targetCat.id), String(targetCat.name), user.id, catId);
          db.prepare(
            `UPDATE expected_bills
             SET category_id = ?, category_name_snapshot = ?, category_icon_snapshot = ?, category_color_snapshot = ?
             WHERE user_id = ? AND category_id = ?`
          ).run(
            String(targetCat.id),
            String(targetCat.name),
            String(targetCat.icon),
            String(targetCat.color),
            user.id,
            catId
          );
        } else {
          // Preserve historical records as archived/uncategorized without ever deleting them
          db.prepare(
            `UPDATE transactions
             SET category_id = NULL, category_name_snapshot = ?
             WHERE user_id = ? AND category_id = ?`
          ).run(`${String(existing.name)} (Archived)`, user.id, catId);
          db.prepare(
            `UPDATE category_deposits
             SET category_id = NULL, category_name_snapshot = ?
             WHERE user_id = ? AND category_id = ?`
          ).run(`${String(existing.name)} (Archived)`, user.id, catId);
          db.prepare(
            `UPDATE expected_bills
             SET category_id = NULL, category_name_snapshot = ?
             WHERE user_id = ? AND category_id = ?`
          ).run(`${String(existing.name)} (Archived)`, user.id, catId);
        }
      } else {
        db.prepare(
          `UPDATE expected_bills
           SET category_id = NULL, category_name_snapshot = ?
           WHERE user_id = ? AND category_id = ?`
        ).run(`${String(existing.name)} (Archived)`, user.id, catId);
      }
      db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(catId, user.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json(getCategoriesForUser(user.id, user.incomeCents));
  });

  // --- CATEGORY COMPARTMENT / ALKANSIYA DEPOSITS (NOT EXPENSES) ---
  app.post('/api/categories/:id/deposits', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const catId = String(req.params.id);
    const cat = db
      .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
      .get(catId, user.id) as Record<string, unknown> | undefined;
    if (!cat) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }

    const { amountCents, note, depositDate, clientRequestId } = req.body || {};
    const parsedAmount = Math.round(Number(amountCents));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Please enter a deposit amount greater than zero.' });
      return;
    }

    const cleanDate =
      typeof depositDate === 'string' && ISO_DATE_RE.test(depositDate)
        ? depositDate
        : formatIsoDate(new Date());

    if (typeof clientRequestId === 'string' && clientRequestId.trim()) {
      const dup = db
        .prepare('SELECT id FROM category_deposits WHERE user_id = ? AND client_request_id = ?')
        .get(user.id, clientRequestId.trim()) as { id: string } | undefined;
      if (dup) {
        res.status(200).json({ duplicate: true, id: dup.id });
        return;
      }
    }

    const periodInfo = getPeriodInfo(
      user.budgetFrequency,
      cleanDate,
      user.periodStartDay,
      user.periodStartDate
    );
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO category_deposits
       (id, user_id, category_id, category_name_snapshot, amount_cents, note, deposit_date, period_key, client_request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      String(cat.id),
      String(cat.name),
      parsedAmount,
      typeof note === 'string' ? note.trim().slice(0, 140) : '',
      cleanDate,
      periodInfo.periodKey,
      typeof clientRequestId === 'string' && clientRequestId.trim() ? clientRequestId.trim() : null,
      new Date().toISOString()
    );

    res.status(201).json({ id });
  });

  app.delete('/api/category-deposits/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const depositId = String(req.params.id);
    const info = db
      .prepare('DELETE FROM category_deposits WHERE id = ? AND user_id = ?')
      .run(depositId, user.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Deposit record not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // --- TRANSACTIONS ---
  app.post('/api/transactions', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { amountCents, categoryId, description, txDate, clientRequestId } = req.body || {};

    const parsedAmount = Math.round(Number(amountCents));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Please enter an expense amount greater than zero.' });
      return;
    }
    if (typeof description !== 'string' || description.trim().length < 1 || description.trim().length > 140) {
      res.status(400).json({ error: 'Please enter a short description for this expense.' });
      return;
    }
    const cleanDate =
      typeof txDate === 'string' && ISO_DATE_RE.test(txDate) ? txDate : formatIsoDate(new Date());

    if (typeof clientRequestId === 'string' && clientRequestId.trim()) {
      const dup = db
        .prepare('SELECT id FROM transactions WHERE user_id = ? AND client_request_id = ?')
        .get(user.id, clientRequestId.trim()) as { id: string } | undefined;
      if (dup) {
        res.status(200).json({ duplicate: true, id: dup.id });
        return;
      }
    }

    let catId: string | null = null;
    let catName = 'Uncategorized';
    let catIcon = '🧾';
    let catColor = '#64748B';

    if (typeof categoryId === 'string' && categoryId && categoryId !== 'uncategorized') {
      const cat = db
        .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
        .get(categoryId, user.id) as Record<string, unknown> | undefined;
      if (!cat) {
        res.status(400).json({ error: 'Selected category was not found.' });
        return;
      }
      catId = String(cat.id);
      catName = String(cat.name);
      catIcon = String(cat.icon);
      catColor = String(cat.color);
    }

    const periodInfo = getPeriodInfo(
      user.budgetFrequency,
      cleanDate,
      user.periodStartDay,
      user.periodStartDate
    );
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO transactions
       (id, user_id, category_id, category_name_snapshot, category_icon_snapshot, category_color_snapshot,
        amount_cents, description, tx_date, period_key, client_request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      catId,
      catName,
      catIcon,
      catColor,
      parsedAmount,
      description.trim(),
      cleanDate,
      periodInfo.periodKey,
      typeof clientRequestId === 'string' && clientRequestId.trim() ? clientRequestId.trim() : null,
      new Date().toISOString()
    );

    evaluateUserAlerts(user, formatIsoDate(new Date()));
    res.status(201).json({ id });
  });

  app.put('/api/transactions/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const txId = String(req.params.id);
    const existing = db
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(txId, user.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }

    const { amountCents, categoryId, description, txDate } = req.body || {};
    const parsedAmount =
      amountCents !== undefined ? Math.round(Number(amountCents)) : Number(existing.amount_cents);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }
    const nextDesc =
      typeof description === 'string' && description.trim()
        ? description.trim().slice(0, 140)
        : String(existing.description);
    const nextDate =
      typeof txDate === 'string' && ISO_DATE_RE.test(txDate) ? txDate : String(existing.tx_date);

    let catId: string | null = existing.category_id ? String(existing.category_id) : null;
    let catName = String(existing.category_name_snapshot);
    let catIcon = String(existing.category_icon_snapshot);
    let catColor = String(existing.category_color_snapshot);

    if (categoryId !== undefined) {
      if (!categoryId || categoryId === 'uncategorized') {
        catId = null;
        catName = 'Uncategorized';
        catIcon = '🧾';
        catColor = '#64748B';
      } else {
        const cat = db
          .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
          .get(String(categoryId), user.id) as Record<string, unknown> | undefined;
        if (!cat) {
          res.status(400).json({ error: 'Selected category was not found.' });
          return;
        }
        catId = String(cat.id);
        catName = String(cat.name);
        catIcon = String(cat.icon);
        catColor = String(cat.color);
      }
    }

    const periodInfo = getPeriodInfo(
      user.budgetFrequency,
      nextDate,
      user.periodStartDay,
      user.periodStartDate
    );

    db.prepare(
      `UPDATE transactions
       SET category_id = ?, category_name_snapshot = ?, category_icon_snapshot = ?,
           category_color_snapshot = ?, amount_cents = ?, description = ?, tx_date = ?, period_key = ?
       WHERE id = ? AND user_id = ?`
    ).run(catId, catName, catIcon, catColor, parsedAmount, nextDesc, nextDate, periodInfo.periodKey, txId, user.id);

    evaluateUserAlerts(user, formatIsoDate(new Date()));
    res.json({ ok: true });
  });

  app.delete('/api/transactions/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const txId = String(req.params.id);
    const info = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(txId, user.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // --- EXPECTED BILLS & SCHEDULED PAYMENTS ---
  app.post('/api/bills', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { name, amountCents, dueDate, frequency, categoryId, notes } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
      res.status(400).json({ error: 'Please enter a bill or scheduled payment name.' });
      return;
    }
    const parsedAmount = Math.round(Number(amountCents));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Bill amount must be greater than zero.' });
      return;
    }
    if (typeof dueDate !== 'string' || !ISO_DATE_RE.test(dueDate)) {
      res.status(400).json({ error: 'Please select a valid due date.' });
      return;
    }
    const billFreq: BillFrequency = VALID_BILL_FREQUENCIES.has(frequency) ? frequency : 'monthly';

    let catId: string | null = null;
    let catName = 'Bills';
    let catIcon = '🧾';
    let catColor = '#2563EB';
    if (typeof categoryId === 'string' && categoryId && categoryId !== 'uncategorized') {
      const cat = db
        .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
        .get(categoryId, user.id) as Record<string, unknown> | undefined;
      if (!cat) {
        res.status(400).json({ error: 'Selected category was not found.' });
        return;
      }
      catId = String(cat.id);
      catName = String(cat.name);
      catIcon = String(cat.icon);
      catColor = String(cat.color);
    }

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO expected_bills
       (id, user_id, category_id, category_name_snapshot, category_icon_snapshot, category_color_snapshot,
        name, amount_cents, due_date, frequency, is_paid, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      id,
      user.id,
      catId,
      catName,
      catIcon,
      catColor,
      name.trim(),
      parsedAmount,
      dueDate,
      billFreq,
      typeof notes === 'string' ? notes.trim().slice(0, 160) : '',
      new Date().toISOString()
    );

    evaluateUserAlerts(user, formatIsoDate(new Date()));
    res.status(201).json({ id });
  });

  app.put('/api/bills/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const billId = String(req.params.id);
    const existing = db
      .prepare('SELECT * FROM expected_bills WHERE id = ? AND user_id = ?')
      .get(billId, user.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Expected bill not found.' });
      return;
    }

    const { name, amountCents, dueDate, frequency, categoryId, notes } = req.body || {};
    const nextName =
      typeof name === 'string' && name.trim().length > 0
        ? name.trim().slice(0, 100)
        : String(existing.name);
    const nextAmount =
      amountCents !== undefined ? Math.round(Number(amountCents)) : Number(existing.amount_cents);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      res.status(400).json({ error: 'Bill amount must be greater than zero.' });
      return;
    }
    const nextDue =
      typeof dueDate === 'string' && ISO_DATE_RE.test(dueDate) ? dueDate : String(existing.due_date);
    const nextFreq: BillFrequency = VALID_BILL_FREQUENCIES.has(frequency)
      ? frequency
      : (existing.frequency as BillFrequency) || 'monthly';
    const nextNotes =
      typeof notes === 'string' ? notes.trim().slice(0, 160) : String(existing.notes || '');

    let catId: string | null = existing.category_id ? String(existing.category_id) : null;
    let catName = String(existing.category_name_snapshot || 'Bills');
    let catIcon = String(existing.category_icon_snapshot || '🧾');
    let catColor = String(existing.category_color_snapshot || '#2563EB');

    if (categoryId !== undefined) {
      if (!categoryId || categoryId === 'uncategorized') {
        catId = null;
        catName = 'Bills';
        catIcon = '🧾';
        catColor = '#2563EB';
      } else {
        const cat = db
          .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
          .get(String(categoryId), user.id) as Record<string, unknown> | undefined;
        if (!cat) {
          res.status(400).json({ error: 'Selected category was not found.' });
          return;
        }
        catId = String(cat.id);
        catName = String(cat.name);
        catIcon = String(cat.icon);
        catColor = String(cat.color);
      }
    }

    db.prepare(
      `UPDATE expected_bills
       SET category_id = ?, category_name_snapshot = ?, category_icon_snapshot = ?, category_color_snapshot = ?,
           name = ?, amount_cents = ?, due_date = ?, frequency = ?, notes = ?
       WHERE id = ? AND user_id = ?`
    ).run(catId, catName, catIcon, catColor, nextName, nextAmount, nextDue, nextFreq, nextNotes, billId, user.id);

    db.prepare('DELETE FROM notifications WHERE user_id = ? AND related_key LIKE ?').run(
      user.id,
      `bill:%:${billId}:%`
    );
    evaluateUserAlerts(user, formatIsoDate(new Date()));
    res.json({ ok: true });
  });

  app.post('/api/bills/:id/mark-paid', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const billId = String(req.params.id);
    const bill = db
      .prepare('SELECT * FROM expected_bills WHERE id = ? AND user_id = ?')
      .get(billId, user.id) as Record<string, unknown> | undefined;
    if (!bill) {
      res.status(404).json({ error: 'Expected bill not found.' });
      return;
    }

    const { isPaid = true, recordAsExpense = true, paidDate, createNextOccurrence = false } =
      req.body || {};

    if (isPaid === false) {
      db.prepare('UPDATE expected_bills SET is_paid = 0, paid_at = NULL WHERE id = ? AND user_id = ?').run(
        billId,
        user.id
      );
      evaluateUserAlerts(user, formatIsoDate(new Date()));
      res.json({ isPaid: false, createdTransactionId: null, nextBillId: null });
      return;
    }

    const cleanDate =
      typeof paidDate === 'string' && ISO_DATE_RE.test(paidDate)
        ? paidDate
        : formatIsoDate(new Date());
    const nowIso = new Date().toISOString();

    let createdTxId: string | null = bill.paid_transaction_id ? String(bill.paid_transaction_id) : null;
    let nextBillId: string | null = null;

    db.exec('BEGIN');
    try {
      if (recordAsExpense && !createdTxId) {
        const periodInfo = getPeriodInfo(
          user.budgetFrequency,
          cleanDate,
          user.periodStartDay,
          user.periodStartDate
        );
        createdTxId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO transactions
           (id, user_id, category_id, category_name_snapshot, category_icon_snapshot, category_color_snapshot,
            amount_cents, description, tx_date, period_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          createdTxId,
          user.id,
          bill.category_id ? String(bill.category_id) : null,
          String(bill.category_name_snapshot || 'Bills'),
          String(bill.category_icon_snapshot || '🧾'),
          String(bill.category_color_snapshot || '#2563EB'),
          Number(bill.amount_cents),
          `${String(bill.name)} (Bill Payment)`,
          cleanDate,
          periodInfo.periodKey,
          nowIso
        );
      }

      db.prepare(
        `UPDATE expected_bills
         SET is_paid = 1, paid_transaction_id = COALESCE(paid_transaction_id, ?), paid_at = COALESCE(paid_at, ?)
         WHERE id = ? AND user_id = ?`
      ).run(createdTxId, cleanDate, billId, user.id);

      const freq = String(bill.frequency || 'one_time') as BillFrequency;
      if (createNextOccurrence && freq !== 'one_time' && !Boolean(bill.is_paid)) {
        const nextDue = getNextBillDueDate(String(bill.due_date), freq);
        nextBillId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO expected_bills
           (id, user_id, category_id, category_name_snapshot, category_icon_snapshot, category_color_snapshot,
            name, amount_cents, due_date, frequency, is_paid, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
        ).run(
          nextBillId,
          user.id,
          bill.category_id ? String(bill.category_id) : null,
          String(bill.category_name_snapshot || 'Bills'),
          String(bill.category_icon_snapshot || '🧾'),
          String(bill.category_color_snapshot || '#2563EB'),
          String(bill.name),
          Number(bill.amount_cents),
          nextDue,
          freq,
          String(bill.notes || ''),
          nowIso
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    db.prepare('DELETE FROM notifications WHERE user_id = ? AND related_key LIKE ?').run(
      user.id,
      `bill:%:${billId}:%`
    );
    evaluateUserAlerts(user, formatIsoDate(new Date()));
    res.json({ isPaid: true, createdTransactionId: createdTxId, nextBillId });
  });

  app.delete('/api/bills/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const billId = String(req.params.id);
    const info = db.prepare('DELETE FROM expected_bills WHERE id = ? AND user_id = ?').run(billId, user.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Expected bill not found.' });
      return;
    }
    db.prepare('DELETE FROM notifications WHERE user_id = ? AND related_key LIKE ?').run(
      user.id,
      `bill:%:${billId}:%`
    );
    res.json({ ok: true });
  });

  // --- SAVINGS GOALS ---
  app.post('/api/savings/goals', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const {
      name,
      icon,
      targetCents,
      targetDate,
      durationMonths,
      plannedDailyCents,
      plannedMonthlyCents,
      status,
    } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Please enter a savings goal name.' });
      return;
    }
    const parsedTarget = Math.round(Number(targetCents));
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      res.status(400).json({ error: 'Target amount must be greater than zero.' });
      return;
    }
    const parsedDuration =
      durationMonths !== null && durationMonths !== undefined && Number(durationMonths) > 0
        ? Math.min(600, Math.max(1, Math.round(Number(durationMonths))))
        : null;
    const parsedDaily =
      plannedDailyCents !== null &&
      plannedDailyCents !== undefined &&
      Number.isFinite(Number(plannedDailyCents)) &&
      Number(plannedDailyCents) > 0
        ? Math.round(Number(plannedDailyCents))
        : null;
    const parsedPlanned =
      plannedMonthlyCents !== null &&
      plannedMonthlyCents !== undefined &&
      Number.isFinite(Number(plannedMonthlyCents)) &&
      Number(plannedMonthlyCents) >= 0
        ? Math.round(Number(plannedMonthlyCents))
        : parsedDaily !== null
          ? parsedDaily * 30
          : null;
    const goalStatus: SavingsGoalStatus = status === 'paused' ? 'paused' : 'active';

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO savings_goals
       (id, user_id, name, icon, target_cents, current_cents, target_date, duration_months, planned_daily_cents, planned_monthly_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      name.trim().slice(0, 80),
      typeof icon === 'string' && icon ? icon : '🎯',
      parsedTarget,
      typeof targetDate === 'string' && ISO_DATE_RE.test(targetDate) ? targetDate : null,
      parsedDuration,
      parsedDaily,
      parsedPlanned,
      goalStatus,
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  app.put('/api/savings/goals/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const goalId = String(req.params.id);
    const existing = db
      .prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?')
      .get(goalId, user.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Savings goal not found.' });
      return;
    }

    const {
      name,
      icon,
      targetCents,
      targetDate,
      durationMonths,
      plannedDailyCents,
      plannedMonthlyCents,
      status,
    } = req.body || {};
    const nextName =
      typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : String(existing.name);
    const nextIcon = typeof icon === 'string' && icon ? icon : String(existing.icon);
    const nextTarget =
      targetCents !== undefined ? Math.round(Number(targetCents)) : Number(existing.target_cents);
    if (!Number.isFinite(nextTarget) || nextTarget <= 0) {
      res.status(400).json({ error: 'Target amount must be greater than zero.' });
      return;
    }
    const nextDate =
      targetDate === null
        ? null
        : typeof targetDate === 'string' && ISO_DATE_RE.test(targetDate)
          ? targetDate
          : existing.target_date
            ? String(existing.target_date)
            : null;

    let nextDuration: number | null =
      existing.duration_months !== null && existing.duration_months !== undefined
        ? Number(existing.duration_months)
        : null;
    if (durationMonths !== undefined) {
      nextDuration =
        durationMonths === null || Number(durationMonths) <= 0
          ? null
          : Math.min(600, Math.max(1, Math.round(Number(durationMonths))));
    }

    let nextDaily: number | null =
      existing.planned_daily_cents !== null && existing.planned_daily_cents !== undefined
        ? Number(existing.planned_daily_cents)
        : null;
    if (plannedDailyCents !== undefined) {
      if (plannedDailyCents === null) {
        nextDaily = null;
      } else {
        const d = Math.round(Number(plannedDailyCents));
        if (!Number.isFinite(d) || d < 0) {
          res.status(400).json({ error: 'Daily contribution cannot be negative.' });
          return;
        }
        nextDaily = d > 0 ? d : null;
      }
    }

    let nextPlanned: number | null =
      existing.planned_monthly_cents !== null && existing.planned_monthly_cents !== undefined
        ? Number(existing.planned_monthly_cents)
        : null;
    if (plannedMonthlyCents !== undefined) {
      if (plannedMonthlyCents === null) {
        nextPlanned = null;
      } else {
        const p = Math.round(Number(plannedMonthlyCents));
        if (!Number.isFinite(p) || p < 0) {
          res.status(400).json({ error: 'Planned monthly contribution cannot be negative.' });
          return;
        }
        nextPlanned = p;
      }
    } else if (plannedDailyCents !== undefined) {
      nextPlanned = nextDaily !== null ? nextDaily * 30 : null;
    }

    const nextStatus: SavingsGoalStatus =
      status === 'paused' || status === 'active'
        ? status
        : existing.status === 'paused'
          ? 'paused'
          : 'active';

    db.prepare(
      `UPDATE savings_goals
       SET name = ?, icon = ?, target_cents = ?, target_date = ?,
           duration_months = ?, planned_daily_cents = ?, planned_monthly_cents = ?, status = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      nextName,
      nextIcon,
      nextTarget,
      nextDate,
      nextDuration,
      nextDaily,
      nextPlanned,
      nextStatus,
      goalId,
      user.id
    );

    res.json({ ok: true });
  });

  app.delete('/api/savings/goals/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const goalId = String(req.params.id);
    const info = db
      .prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?')
      .run(goalId, user.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Savings goal not found.' });
      return;
    }
    db.prepare(
      'DELETE FROM notifications WHERE user_id = ? AND (related_key LIKE ? OR related_key LIKE ?)'
    ).run(user.id, `savings:%:${goalId}:%`, `milestone:${goalId}:%`);
    res.json({ ok: true });
  });

  app.post('/api/savings/goals/:id/entries', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const goalId = String(req.params.id);
    const goalRow = db
      .prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?')
      .get(goalId, user.id) as Record<string, unknown> | undefined;
    if (!goalRow) {
      res.status(404).json({ error: 'Savings goal not found.' });
      return;
    }

    const { type, amountCents, note, entryDate, clientRequestId } = req.body || {};
    if (type !== 'deposit' && type !== 'withdrawal') {
      res.status(400).json({ error: 'Entry type must be deposit or withdrawal.' });
      return;
    }
    const parsedAmount = Math.round(Number(amountCents));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }

    if (typeof clientRequestId === 'string' && clientRequestId.trim()) {
      const dup = db
        .prepare('SELECT id FROM savings_entries WHERE user_id = ? AND client_request_id = ?')
        .get(user.id, clientRequestId.trim()) as { id: string } | undefined;
      if (dup) {
        res.status(200).json({ duplicate: true, id: dup.id });
        return;
      }
    }

    const prevCents = Number(goalRow.current_cents);
    if (type === 'withdrawal' && parsedAmount > prevCents) {
      res.status(400).json({ error: 'Cannot withdraw more than the current saved amount in this goal.' });
      return;
    }
    const nextCents = type === 'deposit' ? prevCents + parsedAmount : prevCents - parsedAmount;
    const cleanDate =
      typeof entryDate === 'string' && ISO_DATE_RE.test(entryDate)
        ? entryDate
        : formatIsoDate(new Date());

    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO savings_entries (id, user_id, goal_id, type, amount_cents, note, entry_date, client_request_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        user.id,
        goalId,
        type,
        parsedAmount,
        typeof note === 'string' ? note.trim().slice(0, 120) : '',
        cleanDate,
        typeof clientRequestId === 'string' && clientRequestId.trim() ? clientRequestId.trim() : null,
        new Date().toISOString()
      );
      db.prepare('UPDATE savings_goals SET current_cents = ? WHERE id = ? AND user_id = ?').run(
        nextCents,
        goalId,
        user.id
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    if (type === 'deposit') {
      db.prepare('DELETE FROM notifications WHERE user_id = ? AND related_key IN (?, ?)').run(
        user.id,
        `savings:daily:${goalId}:${cleanDate}`,
        `savings:missed:${goalId}:${cleanDate}`
      );
      evaluateSavingsMilestoneAlert(
        user,
        {
          id: goalId,
          name: String(goalRow.name),
          icon: String(goalRow.icon),
          targetCents: Number(goalRow.target_cents),
          currentCents: nextCents,
          targetDate: goalRow.target_date ? String(goalRow.target_date) : null,
          durationMonths:
            goalRow.duration_months !== null && goalRow.duration_months !== undefined
              ? Number(goalRow.duration_months)
              : null,
          plannedDailyCents:
            goalRow.planned_daily_cents !== null && goalRow.planned_daily_cents !== undefined
              ? Number(goalRow.planned_daily_cents)
              : null,
          plannedMonthlyCents:
            goalRow.planned_monthly_cents !== null && goalRow.planned_monthly_cents !== undefined
              ? Number(goalRow.planned_monthly_cents)
              : null,
          status: (goalRow.status === 'paused' ? 'paused' : 'active') as SavingsGoalStatus,
          createdAt: String(goalRow.created_at),
        },
        prevCents
      );
    }

    const todayStr = formatIsoDate(new Date());
    if (cleanDate === todayStr || cleanDate === shiftDaysIso(todayStr, -1)) {
      evaluateUserAlerts(user, todayStr);
    }

    res.status(201).json({ currentCents: nextCents });
  });

  app.delete('/api/savings/entries/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const entryId = String(req.params.id);
    const entry = db
      .prepare('SELECT * FROM savings_entries WHERE id = ? AND user_id = ?')
      .get(entryId, user.id) as Record<string, unknown> | undefined;
    if (!entry) {
      res.status(404).json({ error: 'Savings entry not found.' });
      return;
    }

    const goal = db
      .prepare('SELECT current_cents FROM savings_goals WHERE id = ? AND user_id = ?')
      .get(String(entry.goal_id), user.id) as { current_cents: number } | undefined;
    if (!goal) {
      res.status(404).json({ error: 'Associated savings goal not found.' });
      return;
    }

    const amount = Number(entry.amount_cents);
    const nextCents =
      entry.type === 'deposit'
        ? Math.max(0, goal.current_cents - amount)
        : goal.current_cents + amount;

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM savings_entries WHERE id = ? AND user_id = ?').run(entryId, user.id);
      db.prepare('UPDATE savings_goals SET current_cents = ? WHERE id = ? AND user_id = ?').run(
        nextCents,
        String(entry.goal_id),
        user.id
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true, currentCents: nextCents });
  });

  // --- AI SUGGEST BUDGET ---
  app.post('/api/ai/suggest-budget', requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user!;
    const { estimatedExpenses, financialObligations, followUpAnswers, incomeCentsOverride } =
      req.body || {};

    const effectiveIncome =
      incomeCentsOverride !== undefined && Number(incomeCentsOverride) > 0
        ? Math.round(Number(incomeCentsOverride))
        : user.incomeCents;

    const { categories } = getCategoriesForUser(user.id, effectiveIncome);
    const { goals } = getSavingsGoalsForUser(user.id);
    const expectedBills = getExpectedBillsForUser(user.id);

    try {
      const suggestion = await generateAiBudgetSuggestion({
        userType: user.userType,
        currency: user.currency,
        budgetFrequency: user.budgetFrequency,
        incomeCents: effectiveIncome,
        categories,
        goals,
        expectedBills,
        estimatedExpenses: typeof estimatedExpenses === 'string' ? estimatedExpenses : undefined,
        financialObligations:
          typeof financialObligations === 'string' ? financialObligations : undefined,
        followUpAnswers: typeof followUpAnswers === 'string' ? followUpAnswers : undefined,
      });
      res.json(suggestion);
    } catch (err: unknown) {
      if (err instanceof AiServiceUnavailableError) {
        res.status(503).json({ error: err.message, code: 'AI_UNAVAILABLE' });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unable to generate AI budget suggestion.';
      res.status(400).json({ error: message });
    }
  });

  // --- NOTIFICATIONS ---
  app.post('/api/notifications/mark-read', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { notificationId } = req.body || {};
    if (typeof notificationId === 'string' && notificationId) {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
        notificationId,
        user.id
      );
    } else {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(user.id);
    }
    res.json({ notifications: getNotificationsForUser(user.id) });
  });

  // --- EXPORT DATA ---
  app.get('/api/export', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { categories } = getCategoriesForUser(user.id, user.incomeCents);
    const transactions = getTransactionsForUser(user.id);
    const categoryDeposits = getCategoryDepositsForUser(user.id);
    const expectedBills = getExpectedBillsForUser(user.id);
    const { goals, entries } = getSavingsGoalsForUser(user.id);
    const historicalPeriods = getHistoricalPeriodsForUser(user, formatIsoDate(new Date()));
    res.json({
      exportedAt: new Date().toISOString(),
      profile: {
        name: user.name,
        email: user.email,
        userType: user.userType,
        currency: user.currency,
        budgetFrequency: user.budgetFrequency,
        incomeCents: user.incomeCents,
        theme: user.theme,
      },
      categories,
      transactions,
      categoryDeposits,
      expectedBills,
      savingsGoals: goals,
      savingsEntries: entries,
      periods: historicalPeriods,
    });
  });

  // --- VITE DEV / STATIC PROD ---
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`S&B Tracker server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
