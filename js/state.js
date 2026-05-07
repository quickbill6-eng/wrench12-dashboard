/**
 * state.js — App State, localStorage & Default Data
 * Wrench 12 Dashboard
 */

'use strict';

/* ════════════════════════════════════════════════
   CONSTANTS
   ════════════════════════════════════════════════ */

const STORAGE_KEY            = 'salesDashDataCleanV12';
const SUPABASE_URL           = 'https://znshtwmymsnbimafukbk.supabase.co';
const SUPABASE_ANON_KEY      = 'sb_publishable_fOE0dy_O7aJlF5uOXJlsyg_NfXfMFPZ';
const SUPABASE_AUTH_STORAGE_KEY = 'wrench12-dashboard-auth-v4';
const STORAGE_BUCKET         = 'wrench12-files';

/* ── Runtime state ── */
let sb          = null;   // Supabase client
let charts      = {};     // Chart.js instances
let currentUser = null;   // { id, name, role, branchId }

/* ── Caching & Pagination ── */
let dataCache   = { timestamp: 0, data: null };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const PAGINATION_SIZE = 50;
let paginationState = {}; // { [section]: { page, total, offset } }

/* ════════════════════════════════════════════════
   DEFAULT DATA SCHEMAS
   ════════════════════════════════════════════════ */

const defaultPaymentMethods = [
  { id: 'cash',     label: 'نقد',    branches: 'all' },
  { id: 'mada',     label: 'شبكة',   branches: 'all' },
  { id: 'transfer', label: 'تحويل',  branches: 'all' },
  { id: 'credit',   label: 'آجل',    branches: 'all' },
  { id: 'tabby',    label: 'Tabby',  branches: 'all' },
  { id: 'tamara',   label: 'Tamara', branches: 'all' },
];

const defaultExpenseItems = [
  { id: 'salaries',   label: 'رواتب' },
  { id: 'rent',       label: 'إيجار' },
  { id: 'utilities',  label: 'كهرباء وماء' },
  { id: 'other',      label: 'مصروفات أخرى' },
];

const defaultActivities = [
  { id: 'oil',       label: 'زيوت' },
  { id: 'tires',     label: 'إطارات' },
  { id: 'batteries', label: 'بطاريات' },
  { id: 'mechanic',  label: 'ميكانيكا' },
  { id: 'puncture',  label: 'بنشر' },
  { id: 'wash',      label: 'مغسلة سيارات' },
];

const roleNames = {
  manager:    'مدير',
  branch:     'مسؤول فرع',
  accountant: 'محاسب',
  auditor:    'مراجع',
};

const defaultData = {
  branches:            [],
  users:               [],
  paymentMethods:      defaultPaymentMethods,
  expenseItems:        defaultExpenseItems,
  activities:          defaultActivities,
  dailyClosings:       [],
  monthlyExpenses:     [],
  incomeDistributions: [],
};

/* ════════════════════════════════════════════════
   LOCAL STORAGE HELPERS
   ════════════════════════════════════════════════ */

function getData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || JSON.stringify(defaultData));
  } catch (e) {
    return clone(defaultData);
  }
}

function setData(d) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

function normalizeData() {
  const d = getData();
  ['branches','users','dailyClosings','monthlyExpenses','incomeDistributions']
    .forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  if (!Array.isArray(d.paymentMethods)  || !d.paymentMethods.length)  d.paymentMethods  = clone(defaultPaymentMethods);
  if (!Array.isArray(d.expenseItems)    || !d.expenseItems.length)    d.expenseItems    = clone(defaultExpenseItems);
  if (!Array.isArray(d.activities)      || !d.activities.length)      d.activities      = clone(defaultActivities);
  setData(d);
}

/* ════════════════════════════════════════════════
   ROLE HELPERS
   ════════════════════════════════════════════════ */

function canEnterSystem() { return ['manager', 'accountant'].includes(currentUser?.role); }
function canManage()       { return currentUser?.role === 'manager'; }

function visibleBranches() {
  const d = getData();
  if (!currentUser) return d.branches;
  return currentUser.branchId === 'all' || ['manager', 'accountant', 'auditor'].includes(currentUser.role)
    ? d.branches
    : d.branches.filter(b => b.id === currentUser.branchId);
}

/* ════════════════════════════════════════════════
   DATA ACCESSORS
   ════════════════════════════════════════════════ */

function getPaymentMethods() { return getData().paymentMethods || defaultPaymentMethods; }
function getExpenseItems()    { return getData().expenseItems   || defaultExpenseItems;   }
function getActivities()      { return getData().activities     || defaultActivities;     }

function branchName(id) {
  if (id === 'all') return 'كل الفروع / مصروف عام';
  const b = getData().branches.find(x => x.id === id);
  return b ? b.name : 'غير محدد';
}

function methodsForBranch(id) {
  return getPaymentMethods().filter(m =>
    m.branches === 'all' || (Array.isArray(m.branches) && m.branches.includes(id))
  );
}

function emptyPayments() {
  const o = {};
  getPaymentMethods().forEach(m => o[m.id] = 0);
  return o;
}

/* ════════════════════════════════════════════════
   FINANCE CALCULATORS
   ════════════════════════════════════════════════ */

function sumPayments(o) {
  return getPaymentMethods().reduce((s, m) => s + Number(o?.[m.id] || 0), 0);
}

function expenseTotal(e) {
  return Object.values(e?.items || {}).reduce((s, v) => s + Number(v || 0), 0);
}

function activityIncomeValue(v) {
  return typeof v === 'object' && v !== null ? Number(v.income || 0) : Number(v || 0);
}

function activityCostValue(v) {
  return typeof v === 'object' && v !== null ? Number(v.cost || 0) : 0;
}

function distributionIncomeTotal(d) {
  return Object.values(d?.items || {}).reduce((s, v) => s + activityIncomeValue(v), 0);
}

function distributionCostTotal(d) {
  return Object.values(d?.items || {}).reduce((s, v) => s + activityCostValue(v), 0);
}

function updateClosingStatus(r) {
  if (['approved','closed','archived','rejected','submitted'].includes(r.status)) return;
  const sys  = sumPayments(r.system);
  const diff = sumPayments(r.actual) - sys;
  r.status = sys === 0 ? 'pending_system' : diff === 0 ? 'matched' : 'difference';
}

/* ════════════════════════════════════════════════
   GENERAL UTILITIES
   ════════════════════════════════════════════════ */

function uid()       { return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function today()     { return new Date().toISOString().slice(0, 10); }
function thisMonth() { return new Date().toISOString().slice(0, 7); }
function clone(o)    { return JSON.parse(JSON.stringify(o)); }

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(v || ''));
}

function enNum(n)           { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function money(n, d = 2)    { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function moneyCompact(n)    { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

function formatError(err) {
  if (!err) return 'خطأ غير معروف';
  if (typeof err === 'string') return err;
  const p = [];
  if (err.message) p.push(err.message);
  if (err.details) p.push(err.details);
  if (err.hint)    p.push(err.hint);
  if (err.code)    p.push('code: ' + err.code);
  return p.length ? p.join(' | ') : String(err);
}

function getYearMonths(y) {
  return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
}

/* Monthly data helpers */
function getMonthlyRecords(month, b = 'all') {
  let rows = getData().dailyClosings.filter(r =>
    r.date?.startsWith(month) && visibleBranches().some(x => x.id === r.branchId)
  );
  if (b !== 'all') rows = rows.filter(r => r.branchId === b);
  return rows;
}

function getMonthlyExpenses(month, b = 'all') {
  return getData().monthlyExpenses.filter(e =>
    e.month === month &&
    (b === 'all'
      ? e.branchId === 'all' || visibleBranches().some(x => x.id === e.branchId)
      : e.branchId === b)
  );
}

function getDistributions(month, b = 'all') {
  return getData().incomeDistributions.filter(d =>
    d.month === month &&
    (b === 'all' || d.branchId === b) &&
    visibleBranches().some(x => x.id === d.branchId)
  );
}

function costOfSales(month, b = 'all') {
  return getDistributions(month, b).reduce((s, d) => s + distributionCostTotal(d), 0);
}

function monthlyIncomeForBranch(bid, month) {
  return getData().dailyClosings
    .filter(r => r.branchId === bid && r.date?.startsWith(month))
    .reduce((s, r) => s + sumPayments(r.actual), 0);
}

function yearlyMonthStats(y, b = 'all') {
  return getYearMonths(y).map(m => {
    const rows     = getMonthlyRecords(m, b);
    const exps     = getMonthlyExpenses(m, b);
    const income   = rows.reduce((s, r) => s + sumPayments(r.actual), 0);
    const cost     = costOfSales(m, b);
    const expenses = exps.reduce((s, e) => s + expenseTotal(e), 0);
    const profit   = income - cost - expenses;
    return { month: m, income, cost, expenses, profit, margin: income ? profit / income * 100 : 0 };
  });
}

function differenceRecords(m, b = 'all') {
  return getData().dailyClosings
    .filter(r => {
      const a = sumPayments(r.actual), s = sumPayments(r.system), d = a - s;
      return s !== 0 && d !== 0 &&
        (!m || r.date?.startsWith(m)) &&
        (b === 'all' || r.branchId === b) &&
        visibleBranches().some(x => x.id === r.branchId);
    })
    .map(r => ({
      ...r,
      actualTotal:  sumPayments(r.actual),
      systemTotal:  sumPayments(r.system),
      difference:   sumPayments(r.actual) - sumPayments(r.system),
    }));
}

function getPaymentMethodsAnalysis(fromDate, toDate, branchId = 'all') {
  const closings = getData().dailyClosings.filter(r => {
    const inDateRange = r.date >= fromDate && r.date <= toDate;
    const inBranch = branchId === 'all' || r.branchId === branchId;
    const isVisible = visibleBranches().some(x => x.id === r.branchId);
    return inDateRange && inBranch && isVisible;
  });

  const methodTotals = {};
  const methodCounts = {};

  getPaymentMethods().forEach(m => {
    methodTotals[m.id] = 0;
    methodCounts[m.id] = 0;
  });

  closings.forEach(r => {
    Object.entries(r.actual || {}).forEach(([methodId, amount]) => {
      methodTotals[methodId] = (methodTotals[methodId] || 0) + Number(amount || 0);
      methodCounts[methodId] = (methodCounts[methodId] || 0) + (amount > 0 ? 1 : 0);
    });
  });

  const total = Object.values(methodTotals).reduce((s, v) => s + v, 0);

  return getPaymentMethods().map(m => ({
    id: m.id,
    label: m.label,
    total: methodTotals[m.id],
    count: methodCounts[m.id],
    percentage: total ? (methodTotals[m.id] / total) * 100 : 0,
    average: methodCounts[m.id] ? methodTotals[m.id] / methodCounts[m.id] : 0,
  })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
}

function collectPayments(prefix) {
  const o = {};
  getPaymentMethods().forEach(m => o[m.id] = Number(document.getElementById(`${prefix}_${m.id}`)?.value || 0));
  return o;
}

function collectActivityDistribution() {
  const items = {};
  getActivities().forEach(a => {
    items[a.id] = {
      income: Number(document.getElementById(`act_income_${a.id}`)?.value || 0),
      cost:   Number(document.getElementById(`act_cost_${a.id}`)?.value   || 0),
    };
  });
  return items;
}

/* ════════════════════════════════════════════════
   CACHING SYSTEM
   ════════════════════════════════════════════════ */

function getCachedData() {
  const now = Date.now();
  if (dataCache.timestamp && (now - dataCache.timestamp) < CACHE_TTL && dataCache.data) {
    return dataCache.data;
  }
  return null;
}

function setCacheData(data) {
  dataCache = { timestamp: Date.now(), data: clone(data) };
}

function clearCache() {
  dataCache = { timestamp: 0, data: null };
}

/* ════════════════════════════════════════════════
   PAGINATION HELPERS
   ════════════════════════════════════════════════ */

function initPagination(section, total) {
  paginationState[section] = { page: 1, total, offset: 0 };
}

function getPaginationData(section, items) {
  if (!items || items.length <= PAGINATION_SIZE) return items;
  const state = paginationState[section] || { page: 1, total: Math.ceil(items.length / PAGINATION_SIZE), offset: 0 };
  paginationState[section] = state;
  const start = (state.page - 1) * PAGINATION_SIZE;
  return items.slice(start, start + PAGINATION_SIZE);
}

function nextPage(section) {
  const state = paginationState[section];
  if (state && state.page < state.total) {
    state.page++;
    return true;
  }
  return false;
}

function prevPage(section) {
  const state = paginationState[section];
  if (state && state.page > 1) {
    state.page--;
    return true;
  }
  return false;
}

function goToPage(section, page) {
  const state = paginationState[section];
  if (state && page >= 1 && page <= state.total) {
    state.page = page;
    return true;
  }
  return false;
}
