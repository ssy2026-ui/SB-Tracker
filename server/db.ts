import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  addDaysToIso,
  allocateIncomeCents,
  AppNotification,
  BillFrequency,
  BUDGET_TEMPLATES,
  BudgetCategory,
  BudgetFrequency,
  CATEGORY_COLORS,
  CategoryDeposit,
  CurrencyCode,
  diffDaysIso,
  ExpectedBill,
  ExpenseTransaction,
  formatIsoDate,
  formatMoney,
  getPeriodInfo,
  HistoricalPeriodSummary,
  roundPercentage,
  SavingsEntry,
  SavingsGoal,
  SavingsGoalStatus,
  shiftDaysIso,
  ThemeId,
  UserProfile,
  UserType,
} from '../src/shared/finance.ts';

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/pesowise.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    user_type TEXT NOT NULL DEFAULT 'student',
    currency TEXT NOT NULL DEFAULT 'PHP',
    budget_frequency TEXT NOT NULL DEFAULT 'monthly',
    period_start_day INTEGER NOT NULL DEFAULT 1,
    period_start_date TEXT,
    income_cents INTEGER NOT NULL DEFAULT 0,
    theme TEXT NOT NULL DEFAULT 'sage-green',
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    privacy_hide_balances INTEGER NOT NULL DEFAULT 0,
    notif_approaching_limit INTEGER NOT NULL DEFAULT 1,
    notif_exceeded_budget INTEGER NOT NULL DEFAULT 1,
    notif_savings_milestone INTEGER NOT NULL DEFAULT 1,
    notif_schedule_reminder INTEGER NOT NULL DEFAULT 1,
    notif_inactivity_reminder INTEGER NOT NULL DEFAULT 0,
    notif_bill_reminders INTEGER NOT NULL DEFAULT 1,
    notif_daily_savings INTEGER NOT NULL DEFAULT 1,
    notif_missed_savings INTEGER NOT NULL DEFAULT 1,
    inactivity_days INTEGER NOT NULL DEFAULT 3,
    browser_notifications_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🧾',
    description TEXT NOT NULL DEFAULT '',
    percentage REAL NOT NULL DEFAULT 0,
    is_essential INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL DEFAULT '#2563EB',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    category_name_snapshot TEXT NOT NULL,
    category_icon_snapshot TEXT NOT NULL DEFAULT '🧾',
    category_color_snapshot TEXT NOT NULL DEFAULT '#64748B',
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    description TEXT NOT NULL,
    tx_date TEXT NOT NULL,
    period_key TEXT NOT NULL,
    client_request_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_user_req
    ON transactions(user_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🎯',
    target_cents INTEGER NOT NULL CHECK(target_cents > 0),
    current_cents INTEGER NOT NULL DEFAULT 0 CHECK(current_cents >= 0),
    target_date TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS savings_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal')),
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    note TEXT NOT NULL DEFAULT '',
    entry_date TEXT NOT NULL,
    client_request_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_savings_user_req
    ON savings_entries(user_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS budget_periods (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,
    label TEXT NOT NULL,
    frequency TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    income_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, period_key)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_key TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, related_key)
  );

  CREATE TABLE IF NOT EXISTS category_deposits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    category_name_snapshot TEXT NOT NULL DEFAULT '',
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    note TEXT NOT NULL DEFAULT '',
    deposit_date TEXT NOT NULL,
    period_key TEXT NOT NULL,
    client_request_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_deposits_user_req
    ON category_deposits(user_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS expected_bills (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    category_name_snapshot TEXT NOT NULL DEFAULT 'Bills',
    category_icon_snapshot TEXT NOT NULL DEFAULT '🧾',
    category_color_snapshot TEXT NOT NULL DEFAULT '#2563EB',
    name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    due_date TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    is_paid INTEGER NOT NULL DEFAULT 0,
    paid_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    paid_at TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_expected_bills_user_due
    ON expected_bills(user_id, is_paid, due_date);
`);

const catCols = db.prepare("PRAGMA table_info('categories')").all() as Array<{ name: string }>;
if (!catCols.some((c) => c.name === 'manual_amount_cents')) {
  db.exec('ALTER TABLE categories ADD COLUMN manual_amount_cents INTEGER DEFAULT NULL;');
}

const goalCols = db.prepare("PRAGMA table_info('savings_goals')").all() as Array<{ name: string }>;
if (!goalCols.some((c) => c.name === 'duration_months')) {
  db.exec('ALTER TABLE savings_goals ADD COLUMN duration_months INTEGER DEFAULT NULL;');
}
if (!goalCols.some((c) => c.name === 'planned_daily_cents')) {
  db.exec('ALTER TABLE savings_goals ADD COLUMN planned_daily_cents INTEGER DEFAULT NULL;');
}
if (!goalCols.some((c) => c.name === 'planned_monthly_cents')) {
  db.exec('ALTER TABLE savings_goals ADD COLUMN planned_monthly_cents INTEGER DEFAULT NULL;');
}
if (!goalCols.some((c) => c.name === 'status')) {
  db.exec("ALTER TABLE savings_goals ADD COLUMN status TEXT NOT NULL DEFAULT 'active';");
}

const userCols = db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>;
if (!userCols.some((c) => c.name === 'notif_bill_reminders')) {
  db.exec('ALTER TABLE users ADD COLUMN notif_bill_reminders INTEGER NOT NULL DEFAULT 1;');
  db.exec('UPDATE users SET notif_bill_reminders = COALESCE(notif_schedule_reminder, 1);');
}
if (!userCols.some((c) => c.name === 'notif_daily_savings')) {
  db.exec('ALTER TABLE users ADD COLUMN notif_daily_savings INTEGER NOT NULL DEFAULT 1;');
}
if (!userCols.some((c) => c.name === 'notif_missed_savings')) {
  db.exec('ALTER TABLE users ADD COLUMN notif_missed_savings INTEGER NOT NULL DEFAULT 1;');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(keyHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash, userId, expires.toISOString(), now.toISOString());
  return rawToken;
}

export function deleteSession(rawToken: string): void {
  const tokenHash = hashToken(rawToken);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

function mapUserRow(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    userType: row.user_type as UserType,
    currency: row.currency as CurrencyCode,
    budgetFrequency: row.budget_frequency as BudgetFrequency,
    periodStartDay: Number(row.period_start_day ?? 1),
    periodStartDate: row.period_start_date ? String(row.period_start_date) : null,
    incomeCents: Number(row.income_cents ?? 0),
    theme: row.theme as ThemeId,
    onboardingCompleted: Boolean(row.onboarding_completed),
    isDemo: Boolean(row.is_demo),
    privacyHideBalances: Boolean(row.privacy_hide_balances),
    notifBillReminders: Boolean(row.notif_bill_reminders ?? 1),
    notifDailySavingsReminder: Boolean(row.notif_daily_savings ?? 1),
    notifMissedSavingsAlert: Boolean(row.notif_missed_savings ?? 1),
    notifSavingsMilestone: Boolean(row.notif_savings_milestone ?? 1),
    browserNotificationsEnabled: Boolean(row.browser_notifications_enabled),
    createdAt: String(row.created_at),
  };
}

export function getUserBySessionToken(rawToken: string): UserProfile | null {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const session = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as
    | Record<string, unknown>
    | undefined;
  return userRow ? mapUserRow(userRow) : null;
}

export function getUserById(userId: string): UserProfile | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUserRow(row) : null;
}

export function getUserByEmail(email: string): (UserProfile & { passwordHash: string }) | null {
  const row = db
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
    .get(email.trim()) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...mapUserRow(row),
    passwordHash: String(row.password_hash),
  };
}

export function createUser(params: {
  email: string;
  password: string;
  name: string;
  isDemo?: boolean;
}): UserProfile {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(params.password);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, params.email.trim().toLowerCase(), passwordHash, params.name.trim(), params.isDemo ? 1 : 0, now);
  return getUserById(id)!;
}

export function getCategoriesForUser(userId: string, incomeCents: number): {
  categories: BudgetCategory[];
  totalPercentage: number;
  totalAllocatedCents: number;
  remainingBudgetCents: number;
  unallocatedCents: number;
  overAllocatedCents: number;
  roundingAdjusted: boolean;
} {
  const rows = db
    .prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(userId) as Array<Record<string, unknown>>;

  const allocResult = allocateIncomeCents(
    incomeCents,
    rows.map((r) => ({
      id: String(r.id),
      percentage: Number(r.percentage),
      manualAmountCents:
        r.manual_amount_cents !== null && r.manual_amount_cents !== undefined
          ? Number(r.manual_amount_cents)
          : null,
      sortOrder: Number(r.sort_order),
    }))
  );

  const categories: BudgetCategory[] = rows.map((r) => {
    const id = String(r.id);
    const manualAmountCents =
      r.manual_amount_cents !== null && r.manual_amount_cents !== undefined
        ? Number(r.manual_amount_cents)
        : null;
    return {
      id,
      name: String(r.name),
      icon: String(r.icon),
      description: String(r.description || ''),
      percentage: allocResult.percentages[id] ?? roundPercentage(Number(r.percentage)),
      allocatedCents: allocResult.allocations[id] ?? 0,
      manualAmountCents,
      isEssential: Boolean(r.is_essential),
      color: String(r.color || '#2563EB'),
      sortOrder: Number(r.sort_order ?? 0),
    };
  });

  return {
    categories,
    totalPercentage: allocResult.totalPercentage,
    totalAllocatedCents: allocResult.totalAllocatedCents,
    remainingBudgetCents: allocResult.remainingBudgetCents,
    unallocatedCents: allocResult.unallocatedCents,
    overAllocatedCents: allocResult.overAllocatedCents,
    roundingAdjusted: allocResult.roundingAdjusted,
  };
}

export function replaceCategoriesForUser(
  userId: string,
  items: Array<{
    id?: string;
    name: string;
    icon: string;
    description?: string;
    percentage: number;
    manualAmountCents?: number | null;
    isEssential: boolean;
    color?: string;
  }>,
  incomeCents = 0
): void {
  const existingRows = db
    .prepare('SELECT id FROM categories WHERE user_id = ?')
    .all(userId) as Array<{ id: string }>;
  const existingIds = new Set(existingRows.map((r) => r.id));
  const incomingIds = new Set(items.filter((i) => i.id && existingIds.has(i.id)).map((i) => i.id!));

  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    // Unlink transactions for removed categories while preserving their snapshot names
    for (const oldId of existingIds) {
      if (!incomingIds.has(oldId)) {
        db.prepare('UPDATE transactions SET category_id = NULL WHERE user_id = ? AND category_id = ?').run(
          userId,
          oldId
        );
        db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(oldId, userId);
      }
    }

    items.forEach((item, idx) => {
      const hasManual =
        item.manualAmountCents !== null &&
        item.manualAmountCents !== undefined &&
        Number.isFinite(Number(item.manualAmountCents));
      const manualAmt = hasManual ? Math.max(0, Math.round(Number(item.manualAmountCents))) : null;
      const computedPct =
        manualAmt !== null
          ? incomeCents > 0
            ? roundPercentage((manualAmt / incomeCents) * 100)
            : 0
          : roundPercentage(Math.max(0, item.percentage));
      const color = item.color || CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
      if (item.id && existingIds.has(item.id)) {
        db.prepare(
          `UPDATE categories
           SET name = ?, icon = ?, description = ?, percentage = ?, manual_amount_cents = ?, is_essential = ?, color = ?, sort_order = ?
           WHERE id = ? AND user_id = ?`
        ).run(
          item.name.trim(),
          item.icon || '🧾',
          (item.description || '').trim(),
          computedPct,
          manualAmt,
          item.isEssential ? 1 : 0,
          color,
          idx,
          item.id,
          userId
        );
        // Sync current category label snapshot for existing transactions & bills linked to this category
        db.prepare(
          `UPDATE transactions
           SET category_name_snapshot = ?, category_icon_snapshot = ?, category_color_snapshot = ?
           WHERE user_id = ? AND category_id = ?`
        ).run(item.name.trim(), item.icon || '🧾', color, userId, item.id);
        db.prepare(
          `UPDATE expected_bills
           SET category_name_snapshot = ?, category_icon_snapshot = ?, category_color_snapshot = ?
           WHERE user_id = ? AND category_id = ?`
        ).run(item.name.trim(), item.icon || '🧾', color, userId, item.id);
      } else {
        const newId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO categories (id, user_id, name, icon, description, percentage, manual_amount_cents, is_essential, color, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newId,
          userId,
          item.name.trim(),
          item.icon || '🧾',
          (item.description || '').trim(),
          computedPct,
          manualAmt,
          item.isEssential ? 1 : 0,
          color,
          idx,
          now
        );
      }
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function applyTemplateForUser(userId: string, templateId: string): boolean {
  const tpl = BUDGET_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return false;
  replaceCategoriesForUser(
    userId,
    tpl.categories.map((c) => ({
      name: c.name,
      icon: c.icon,
      description: c.description,
      percentage: c.percentage,
      isEssential: c.isEssential,
      color: c.color,
    }))
  );
  return true;
}

export function ensurePeriodSnapshot(user: UserProfile, referenceDateStr: string): void {
  const info = getPeriodInfo(
    user.budgetFrequency,
    referenceDateStr,
    user.periodStartDay,
    user.periodStartDate
  );
  const existing = db
    .prepare('SELECT id FROM budget_periods WHERE user_id = ? AND period_key = ?')
    .get(user.id, info.periodKey) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE budget_periods SET label = ?, frequency = ?, start_date = ?, end_date = ?, income_cents = ?
       WHERE id = ? AND user_id = ?`
    ).run(info.label, user.budgetFrequency, info.startDate, info.endDate, user.incomeCents, existing.id, user.id);
  } else {
    db.prepare(
      `INSERT INTO budget_periods (id, user_id, period_key, label, frequency, start_date, end_date, income_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      user.id,
      info.periodKey,
      info.label,
      user.budgetFrequency,
      info.startDate,
      info.endDate,
      user.incomeCents,
      new Date().toISOString()
    );
  }
}

export function getTransactionsForUser(
  userId: string,
  filters?: { startDate?: string; endDate?: string; categoryId?: string }
): ExpenseTransaction[] {
  let sql = `SELECT * FROM transactions WHERE user_id = ?`;
  const params: Array<string | number> = [userId];

  if (filters?.startDate) {
    sql += ' AND tx_date >= ?';
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    sql += ' AND tx_date <= ?';
    params.push(filters.endDate);
  }
  if (filters?.categoryId && filters.categoryId !== 'all') {
    if (filters.categoryId === 'uncategorized') {
      sql += ' AND category_id IS NULL';
    } else {
      sql += ' AND category_id = ?';
      params.push(filters.categoryId);
    }
  }
  sql += ' ORDER BY tx_date DESC, created_at DESC';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    categoryId: r.category_id ? String(r.category_id) : null,
    categoryName: String(r.category_name_snapshot),
    categoryIcon: String(r.category_icon_snapshot || '🧾'),
    categoryColor: String(r.category_color_snapshot || '#64748B'),
    amountCents: Number(r.amount_cents),
    description: String(r.description),
    txDate: String(r.tx_date),
    periodKey: String(r.period_key),
    createdAt: String(r.created_at),
  }));
}

export function getCategoryDepositsForUser(
  userId: string,
  filters?: { startDate?: string; endDate?: string; categoryId?: string }
): CategoryDeposit[] {
  let sql = `SELECT * FROM category_deposits WHERE user_id = ?`;
  const params: Array<string | number> = [userId];

  if (filters?.startDate) {
    sql += ' AND deposit_date >= ?';
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    sql += ' AND deposit_date <= ?';
    params.push(filters.endDate);
  }
  if (filters?.categoryId) {
    sql += ' AND category_id = ?';
    params.push(filters.categoryId);
  }
  sql += ' ORDER BY deposit_date DESC, created_at DESC';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    categoryId: r.category_id ? String(r.category_id) : null,
    categoryName: String(r.category_name_snapshot || ''),
    amountCents: Number(r.amount_cents),
    note: String(r.note || ''),
    depositDate: String(r.deposit_date),
    periodKey: String(r.period_key),
    createdAt: String(r.created_at),
  }));
}

export function getExpectedBillsForUser(userId: string): ExpectedBill[] {
  const rows = db
    .prepare(
      `SELECT * FROM expected_bills
       WHERE user_id = ?
       ORDER BY is_paid ASC, due_date ASC, created_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    categoryId: r.category_id ? String(r.category_id) : null,
    categoryName: String(r.category_name_snapshot || 'Bills'),
    categoryIcon: String(r.category_icon_snapshot || '🧾'),
    categoryColor: String(r.category_color_snapshot || '#2563EB'),
    name: String(r.name),
    amountCents: Number(r.amount_cents),
    dueDate: String(r.due_date),
    frequency: (r.frequency as BillFrequency) || 'monthly',
    isPaid: Boolean(r.is_paid),
    paidTransactionId: r.paid_transaction_id ? String(r.paid_transaction_id) : null,
    paidAt: r.paid_at ? String(r.paid_at) : null,
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
  }));
}

export function getSavingsGoalsForUser(userId: string): {
  goals: SavingsGoal[];
  entries: SavingsEntry[];
} {
  const goalRows = db
    .prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId) as Array<Record<string, unknown>>;

  const goals: SavingsGoal[] = goalRows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    icon: String(r.icon || '🎯'),
    targetCents: Number(r.target_cents),
    currentCents: Number(r.current_cents),
    targetDate: r.target_date ? String(r.target_date) : null,
    durationMonths:
      r.duration_months !== null && r.duration_months !== undefined
        ? Number(r.duration_months)
        : null,
    plannedDailyCents:
      r.planned_daily_cents !== null && r.planned_daily_cents !== undefined
        ? Number(r.planned_daily_cents)
        : null,
    plannedMonthlyCents:
      r.planned_monthly_cents !== null && r.planned_monthly_cents !== undefined
        ? Number(r.planned_monthly_cents)
        : null,
    status: (r.status === 'paused' ? 'paused' : 'active') as SavingsGoalStatus,
    createdAt: String(r.created_at),
  }));

  const entryRows = db
    .prepare(
      `SELECT e.*, g.name as goal_name
       FROM savings_entries e
       JOIN savings_goals g ON g.id = e.goal_id
       WHERE e.user_id = ?
       ORDER BY e.entry_date DESC, e.created_at DESC
       LIMIT 200`
    )
    .all(userId) as Array<Record<string, unknown>>;

  const entries: SavingsEntry[] = entryRows.map((r) => ({
    id: String(r.id),
    goalId: String(r.goal_id),
    goalName: String(r.goal_name),
    type: r.type as 'deposit' | 'withdrawal',
    amountCents: Number(r.amount_cents),
    note: String(r.note || ''),
    entryDate: String(r.entry_date),
    createdAt: String(r.created_at),
  }));

  return { goals, entries };
}

export function getHistoricalPeriodsForUser(user: UserProfile, todayStr: string): HistoricalPeriodSummary[] {
  const currentPeriod = getPeriodInfo(
    user.budgetFrequency,
    todayStr,
    user.periodStartDay,
    user.periodStartDate
  );

  // Build list of periods from budget_periods plus any period windows containing user transactions
  const txRows = db
    .prepare('SELECT tx_date, amount_cents FROM transactions WHERE user_id = ?')
    .all(user.id) as Array<{ tx_date: string; amount_cents: number }>;

  const storedPeriods = db
    .prepare('SELECT * FROM budget_periods WHERE user_id = ? ORDER BY start_date DESC')
    .all(user.id) as Array<Record<string, unknown>>;

  const periodMap = new Map<
    string,
    {
      periodKey: string;
      label: string;
      frequency: BudgetFrequency;
      startDate: string;
      endDate: string;
      incomeCents: number;
    }
  >();

  periodMap.set(currentPeriod.periodKey, {
    periodKey: currentPeriod.periodKey,
    label: currentPeriod.label,
    frequency: user.budgetFrequency,
    startDate: currentPeriod.startDate,
    endDate: currentPeriod.endDate,
    incomeCents: user.incomeCents,
  });

  for (const sp of storedPeriods) {
    const key = String(sp.period_key);
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        periodKey: key,
        label: String(sp.label),
        frequency: sp.frequency as BudgetFrequency,
        startDate: String(sp.start_date),
        endDate: String(sp.end_date),
        incomeCents: Number(sp.income_cents),
      });
    }
  }

  for (const tx of txRows) {
    const info = getPeriodInfo(
      user.budgetFrequency,
      tx.tx_date,
      user.periodStartDay,
      user.periodStartDate
    );
    if (!periodMap.has(info.periodKey)) {
      periodMap.set(info.periodKey, {
        periodKey: info.periodKey,
        label: info.label,
        frequency: user.budgetFrequency,
        startDate: info.startDate,
        endDate: info.endDate,
        incomeCents: user.incomeCents,
      });
    }
  }

  const summaries: HistoricalPeriodSummary[] = [];
  for (const p of periodMap.values()) {
    const matching = txRows.filter((t) => t.tx_date >= p.startDate && t.tx_date <= p.endDate);
    summaries.push({
      ...p,
      spentCents: matching.reduce((s, t) => s + t.amount_cents, 0),
      transactionCount: matching.length,
    });
  }

  summaries.sort((a, b) => b.startDate.localeCompare(a.startDate));
  return summaries;
}

function insertNotificationIfAllowed(
  userId: string,
  allowed: boolean,
  type: AppNotification['type'],
  title: string,
  message: string,
  relatedKey: string
): void {
  if (!allowed) return;
  db.prepare(
    `INSERT OR IGNORE INTO notifications (id, user_id, type, title, message, related_key, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(crypto.randomUUID(), userId, type, title, message, relatedKey, new Date().toISOString());
}

export function evaluateUserAlerts(user: UserProfile, todayStr: string): void {
  // Remove obsolete notification categories from earlier budgeting versions
  db.prepare(
    `DELETE FROM notifications
     WHERE user_id = ?
       AND type IN ('approaching_limit', 'exceeded_budget', 'schedule_reminder', 'inactivity_reminder')`
  ).run(user.id);

  // A. Bill Reminders (3 days before, 1 day before, due today, overdue; stop once marked paid)
  const bills = getExpectedBillsForUser(user.id);
  for (const bill of bills) {
    if (bill.isPaid) {
      db.prepare('DELETE FROM notifications WHERE user_id = ? AND related_key LIKE ?').run(
        user.id,
        `bill:%:${bill.id}:%`
      );
      continue;
    }

    if (!user.notifBillReminders) continue;

    const daysUntil = diffDaysIso(todayStr, bill.dueDate);
    const amountLabel = formatMoney(bill.amountCents, user.currency);

    if (daysUntil < 0) {
      const overdueDays = Math.abs(daysUntil);
      insertNotificationIfAllowed(
        user.id,
        true,
        'bill_overdue',
        `Overdue Bill: ${bill.name}`,
        `Your ${bill.name} of ${amountLabel} was due on ${bill.dueDate} (${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue).`,
        `bill:overdue:${bill.id}:${bill.dueDate}`
      );
    } else if (daysUntil === 0) {
      insertNotificationIfAllowed(
        user.id,
        true,
        'bill_due_today',
        `Bill Due Today: ${bill.name}`,
        `Your ${bill.name} of ${amountLabel} is due today (${bill.dueDate}).`,
        `bill:due0:${bill.id}:${bill.dueDate}`
      );
    } else if (daysUntil === 1) {
      insertNotificationIfAllowed(
        user.id,
        true,
        'bill_upcoming',
        `Bill Due Tomorrow: ${bill.name}`,
        `Your ${bill.name} of ${amountLabel} is due tomorrow (${bill.dueDate}).`,
        `bill:due1:${bill.id}:${bill.dueDate}`
      );
    } else if (daysUntil === 3) {
      insertNotificationIfAllowed(
        user.id,
        true,
        'bill_upcoming',
        `Upcoming Bill: ${bill.name}`,
        `Your ${bill.name} of ${amountLabel} is due in 3 days (${bill.dueDate}).`,
        `bill:due3:${bill.id}:${bill.dueDate}`
      );
    }
  }

  // B. Savings Deposit Reminders (daily planned deposit & yesterday missed deposit; never auto-adds money)
  const { goals } = getSavingsGoalsForUser(user.id);
  const yesterdayStr = shiftDaysIso(todayStr, -1);

  for (const goal of goals) {
    if (goal.status === 'paused' || goal.currentCents >= goal.targetCents) {
      continue;
    }
    const plannedDaily = goal.plannedDailyCents ?? 0;
    if (plannedDaily <= 0) continue;

    const dailyAmountLabel = formatMoney(plannedDaily, user.currency);

    const depositedToday = db
      .prepare(
        `SELECT 1 FROM savings_entries
         WHERE user_id = ? AND goal_id = ? AND type = 'deposit' AND entry_date = ?
         LIMIT 1`
      )
      .get(user.id, goal.id, todayStr);

    if (depositedToday) {
      db.prepare('DELETE FROM notifications WHERE user_id = ? AND related_key = ?').run(
        user.id,
        `savings:daily:${goal.id}:${todayStr}`
      );
    } else if (user.notifDailySavingsReminder) {
      insertNotificationIfAllowed(
        user.id,
        true,
        'savings_daily_reminder',
        `Daily Savings Reminder: ${goal.name}`,
        `Set aside your planned daily deposit of ${dailyAmountLabel} toward "${goal.name}".`,
        `savings:daily:${goal.id}:${todayStr}`
      );
    }

    const goalCreatedDate = goal.createdAt.slice(0, 10);
    if (goalCreatedDate <= yesterdayStr) {
      const depositedYesterday = db
        .prepare(
          `SELECT 1 FROM savings_entries
           WHERE user_id = ? AND goal_id = ? AND type = 'deposit' AND entry_date = ?
           LIMIT 1`
        )
        .get(user.id, goal.id, yesterdayStr);

      if (!depositedYesterday && user.notifMissedSavingsAlert) {
        insertNotificationIfAllowed(
          user.id,
          true,
          'savings_missed_deposit',
          `Missed Savings Deposit: ${goal.name}`,
          `You missed yesterday's planned deposit of ${dailyAmountLabel} for "${goal.name}" (${yesterdayStr}). Record a manual deposit when ready — your savings balance is never changed automatically.`,
          `savings:missed:${goal.id}:${yesterdayStr}`
        );
      }
    }
  }
}

export function evaluateSavingsMilestoneAlert(
  user: UserProfile,
  goal: SavingsGoal,
  previousCents: number
): void {
  if (!user.notifSavingsMilestone || goal.targetCents <= 0) return;
  const prevPct = (previousCents / goal.targetCents) * 100;
  const newPct = (goal.currentCents / goal.targetCents) * 100;
  const milestones = [25, 50, 75, 100];
  for (const m of milestones) {
    if (prevPct < m && newPct >= m) {
      const title =
        m === 100
          ? `Goal reached: ${goal.name}!`
          : `${goal.name} reached ${m}%`;
      const msg =
        m === 100
          ? `Congratulations! You saved ${formatMoney(goal.currentCents, user.currency)} and completed your "${goal.name}" goal.`
          : `Nice progress — you have saved ${formatMoney(goal.currentCents, user.currency)} of ${formatMoney(goal.targetCents, user.currency)} (${m}%).`;
      insertNotificationIfAllowed(
        user.id,
        true,
        'savings_milestone',
        title,
        msg,
        `milestone:${goal.id}:${m}`
      );
    }
  }
}

export function getNotificationsForUser(userId: string): AppNotification[] {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(userId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    type: r.type as AppNotification['type'],
    title: String(r.title),
    message: String(r.message),
    isRead: Boolean(r.is_read),
    createdAt: String(r.created_at),
  }));
}

export function createDemoAccount(): { user: UserProfile; token: string } {
  const shortId = crypto.randomBytes(4).toString('hex');
  const email = `demo-${shortId}@sample.sbtracker.local`;
  const user = createUser({
    email,
    password: crypto.randomBytes(16).toString('hex'),
    name: 'Alex Santos (Demo)',
    isDemo: true,
  });

  db.prepare(
    `UPDATE users SET user_type = 'student', currency = 'PHP', budget_frequency = 'monthly',
     period_start_day = 1, income_cents = 500000, theme = 'sage-green', onboarding_completed = 1
     WHERE id = ?`
  ).run(user.id);

  const updatedUser = getUserById(user.id)!;
  applyTemplateForUser(updatedUser.id, 'student-essentials');
  const { categories } = getCategoriesForUser(updatedUser.id, updatedUser.incomeCents);

  const today = new Date();
  const todayStr = formatIsoDate(today);
  const currentPeriod = getPeriodInfo('monthly', todayStr, 1);

  const catByName = (part: string) =>
    categories.find((c) => c.name.toLowerCase().includes(part)) || categories[0];

  const daysAgoStr = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    const iso = formatIsoDate(d);
    return iso >= currentPeriod.startDate ? iso : currentPeriod.startDate;
  };

  const sampleTxs = [
    { cat: catByName('food'), amount: 18500, desc: 'Campus lunch & bottled water (Sample)', date: daysAgoStr(0) },
    { cat: catByName('transport'), amount: 9000, desc: 'Jeepney & LRT fare (Sample)', date: daysAgoStr(1) },
    { cat: catByName('school'), amount: 24000, desc: 'Lab workbook printing (Sample)', date: daysAgoStr(2) },
    { cat: catByName('food'), amount: 32000, desc: 'Weekly groceries & snacks (Sample)', date: daysAgoStr(4) },
    { cat: catByName('personal'), amount: 15000, desc: 'Mobile data promo (Sample)', date: daysAgoStr(5) },
  ];

  const nowIso = new Date().toISOString();
  for (const tx of sampleTxs) {
    db.prepare(
      `INSERT INTO transactions (id, user_id, category_id, category_name_snapshot, category_icon_snapshot, category_color_snapshot, amount_cents, description, tx_date, period_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      updatedUser.id,
      tx.cat.id,
      tx.cat.name,
      tx.cat.icon,
      tx.cat.color,
      tx.amount,
      tx.desc,
      tx.date,
      currentPeriod.periodKey,
      nowIso
    );
  }

  // Previous month sample period for historical review
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 12, 12);
  const prevPeriod = getPeriodInfo('monthly', formatIsoDate(prevMonthDate), 1);
  db.prepare(
    `INSERT OR IGNORE INTO budget_periods (id, user_id, period_key, label, frequency, start_date, end_date, income_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    updatedUser.id,
    prevPeriod.periodKey,
    prevPeriod.label,
    'monthly',
    prevPeriod.startDate,
    prevPeriod.endDate,
    450000,
    nowIso
  );

  const prevFood = catByName('food');
  db.prepare(
    `INSERT INTO transactions (id, user_id, category_id, category_name_snapshot, category_icon_snapshot, category_color_snapshot, amount_cents, description, tx_date, period_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    updatedUser.id,
    prevFood.id,
    prevFood.name,
    prevFood.icon,
    prevFood.color,
    142000,
    'Previous month meals total (Sample)',
    formatIsoDate(prevMonthDate),
    prevPeriod.periodKey,
    nowIso
  );

  // Sample savings goals with saving duration & planned monthly contributions
  const goal1Id = crypto.randomUUID();
  const goal2Id = crypto.randomUUID();
  const goal1TargetDate = addDaysToIso(todayStr, 180);
  const goal2TargetDate = addDaysToIso(todayStr, 360);
  db.prepare(
    `INSERT INTO savings_goals (id, user_id, name, icon, target_cents, current_cents, target_date, duration_months, planned_daily_cents, planned_monthly_cents, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
  ).run(goal1Id, updatedUser.id, 'Emergency Fund (Sample)', '🛡️', 1000000, 450000, goal1TargetDate, 6, 3200, 96000, nowIso);

  db.prepare(
    `INSERT INTO savings_goals (id, user_id, name, icon, target_cents, current_cents, target_date, duration_months, planned_daily_cents, planned_monthly_cents, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
  ).run(goal2Id, updatedUser.id, 'New Laptop (Sample)', '💻', 2500000, 625000, goal2TargetDate, 12, 5500, 165000, nowIso);

  db.prepare(
    `INSERT INTO savings_entries (id, user_id, goal_id, type, amount_cents, note, entry_date, created_at)
     VALUES (?, ?, ?, 'deposit', 450000, 'Initial sample deposit', ?, ?)`
  ).run(crypto.randomUUID(), updatedUser.id, goal1Id, daysAgoStr(3), nowIso);

  db.prepare(
    `INSERT INTO savings_entries (id, user_id, goal_id, type, amount_cents, note, entry_date, created_at)
     VALUES (?, ?, ?, 'deposit', 625000, 'Allowance savings transfer (Sample)', ?, ?)`
  ).run(crypto.randomUUID(), updatedUser.id, goal2Id, daysAgoStr(2), nowIso);

  // Sample expected bills & scheduled payments (unpaid upcoming + paid example)
  const personalCat = catByName('personal');
  const schoolCat = catByName('school');
  db.prepare(
    `INSERT INTO expected_bills (id, user_id, category_id, category_name_snapshot, category_icon_snapshot, category_color_snapshot, name, amount_cents, due_date, frequency, is_paid, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    crypto.randomUUID(),
    updatedUser.id,
    personalCat.id,
    personalCat.name,
    personalCat.icon,
    personalCat.color,
    'Mobile Data & WiFi Share (Sample)',
    39900,
    addDaysToIso(todayStr, 3),
    'monthly',
    'Monthly prepaid fiber/data split',
    nowIso
  );
  db.prepare(
    `INSERT INTO expected_bills (id, user_id, category_id, category_name_snapshot, category_icon_snapshot, category_color_snapshot, name, amount_cents, due_date, frequency, is_paid, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    crypto.randomUUID(),
    updatedUser.id,
    schoolCat.id,
    schoolCat.name,
    schoolCat.icon,
    schoolCat.color,
    'Department Printing Fee (Sample)',
    25000,
    addDaysToIso(todayStr, 10),
    'one_time',
    'Research bindery and handouts',
    nowIso
  );

  const sampleDeposits = [
    { cat: catByName('food'), amount: 100000, note: 'Weekly meal envelope (Sample)', date: daysAgoStr(3) },
    { cat: catByName('transport'), amount: 50000, note: 'Commute coins & beep card (Sample)', date: daysAgoStr(2) },
    { cat: catByName('savings'), amount: 80000, note: 'Alkansiya cash drop (Sample)', date: daysAgoStr(1) },
  ];
  for (const dep of sampleDeposits) {
    db.prepare(
      `INSERT INTO category_deposits (id, user_id, category_id, category_name_snapshot, amount_cents, note, deposit_date, period_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      updatedUser.id,
      dep.cat.id,
      dep.cat.name,
      dep.amount,
      dep.note,
      dep.date,
      currentPeriod.periodKey,
      nowIso
    );
  }

  ensurePeriodSnapshot(updatedUser, todayStr);
  evaluateUserAlerts(updatedUser, todayStr);

  const token = createSession(updatedUser.id);
  return { user: updatedUser, token };
}
