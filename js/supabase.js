/**
 * supabase.js — Supabase Auth, CRUD & File Upload
 * Wrench 12 Dashboard
 */

'use strict';

/* ════════════════════════════════════════════════
   ERROR LOGGING & HANDLING
   ════════════════════════════════════════════════ */

function logError(context, error, severity = 'warn') {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    context,
    severity,
    message: formatError(error),
    user: currentUser?.id || 'anonymous',
    url: window.location.href,
  };
  console[severity]('[Dashboard Error]', errorInfo);
  // يمكن إرسال إلى logging service هنا
}

async function safeSupabaseCall(operation, context) {
  try {
    if (!sb) throw new Error('Supabase client is not initialized');
    const result = await operation();
    return result;
  } catch (error) {
    logError(context, error, 'error');
    throw error;
  }
}

/* ════════════════════════════════════════════════
   CLIENT INIT
   ════════════════════════════════════════════════ */

function initSupabase() {
  try {
    if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storageKey:        SUPABASE_AUTH_STORAGE_KEY,
          persistSession:    true,
          autoRefreshToken:  true,
          detectSessionInUrl: false,
        },
      });
    }
  } catch (e) { console.warn('Supabase init failed', e); }
}

/* ════════════════════════════════════════════════
   AUTH HELPERS
   ════════════════════════════════════════════════ */

function clearBrokenSupabaseSession() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.includes('supabase') || k.includes('sb-') || k === SUPABASE_AUTH_STORAGE_KEY)
        localStorage.removeItem(k);
    });
  } catch (e) { console.warn('Could not clear auth storage', e); }
}

function isRefreshTokenError(err) {
  const msg = (err?.message || String(err || '')).toLowerCase();
  return msg.includes('refresh token') || msg.includes('invalid refresh') || msg.includes('refresh_token_not_found');
}

async function getProfile(userId) {
  if (!sb) throw new Error('Supabase client is not initialized');
  const { data, error } = await sb.from('profiles')
    .select('id,full_name,role,branch_id,can_access_all_branches')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data)  throw new Error('لا يوجد سجل لهذا المستخدم في جدول profiles.');
  return data;
}

/* ════════════════════════════════════════════════
   GENERIC SELECT
   ════════════════════════════════════════════════ */

async function safeSelect(table, selectText, options = {}) {
  let q = sb.from(table).select(selectText);
  if (options.eq)    options.eq.forEach(([c, v])    => q = q.eq(c, v));
  if (options.is)    options.is.forEach(([c, v])    => q = q.is(c, v));
  if (options.order) options.order.forEach(([c, o]) => q = q.order(c, o));
  if (options.limit) q = q.limit(options.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* ════════════════════════════════════════════════
   DATA LOADERS
   ════════════════════════════════════════════════ */

async function loadSupabaseReferenceData() {
  if (!sb) return;
  const d = getData();
  const [br, pm, ex, ac] = await Promise.all([
    sb.from('branches')       .select('id,name,city,is_active')  .eq('is_active', true).order('created_at', { ascending: true }),
    sb.from('payment_methods').select('id,label,is_active')       .eq('is_active', true).order('created_at', { ascending: true }),
    sb.from('expense_items')  .select('id,label,is_active')       .eq('is_active', true).order('created_at', { ascending: true }),
    sb.from('activities')     .select('id,label,is_active')       .eq('is_active', true).order('created_at', { ascending: true }),
  ]);
  if (br.error) throw br.error;
  d.branches = (br.data || []).map(b => ({ id: b.id, name: b.name, city: b.city || '' }));
  if ((pm.data || []).length) d.paymentMethods = pm.data.map(p => ({ id: p.id, label: p.label, branches: 'all' }));
  if ((ex.data || []).length) d.expenseItems   = ex.data.map(e => ({ id: e.id, label: e.label }));
  if ((ac.data || []).length) d.activities     = ac.data.map(a => ({ id: a.id, label: a.label }));
  setData(d);
}

function dbClosingToLocal(row) {
  const actual = {}, system = {};
  getPaymentMethods().forEach(m => { actual[m.id] = 0; system[m.id] = 0; });
  (row.daily_closing_payments || []).forEach(p => {
    actual[p.payment_method_id]  = Number(p.actual_amount || 0);
    system[p.payment_method_id]  = Number(p.system_amount || 0);
  });
  return {
    id:                  row.id,
    serial:              row.serial || '',
    date:                row.closing_date,
    branchId:            row.branch_id,
    mainPaymentMethodId: row.main_payment_method_id,
    carsCount:           Number(row.cars_count || 0),
    status:              row.status || 'pending_system',
    notes:               row.notes || '',
    reviewNote:          row.review_note || '',
    actual, system,
    createdBy:           row.created_by || '',
    createdAt:           row.created_at || '',
    editedAt:            row.edited_at  || '',
    attachmentUrl:       safeUrl(row.attachment_url  || ''),
    attachmentPath:      row.attachment_path || '',
  };
}

async function loadDailyClosingsFromSupabase() {
  if (!sb || !currentUser) return;
  const selectFull  = 'id,serial,closing_date,branch_id,main_payment_method_id,cars_count,status,notes,review_note,created_by,created_at,edited_at,attachment_url,attachment_path,daily_closing_payments(payment_method_id,actual_amount,system_amount)';
  const selectBasic = 'id,serial,closing_date,branch_id,main_payment_method_id,cars_count,status,notes,created_by,created_at,daily_closing_payments(payment_method_id,actual_amount,system_amount)';
  let data;
  try        { data = await safeSelect('daily_closings', selectFull,  { order: [['closing_date', { ascending: false }], ['created_at', { ascending: false }]] }); }
  catch (e)  { data = await safeSelect('daily_closings', selectBasic, { order: [['closing_date', { ascending: false }], ['created_at', { ascending: false }]] }); }
  const d = getData();
  d.dailyClosings = (data || []).map(dbClosingToLocal);
  setData(d);
}

async function loadMonthlyExpensesFromSupabase() {
  if (!sb || !currentUser) return;
  let data;
  try       { data = await safeSelect('monthly_expenses', 'id,expense_month,branch_id,expense_item_id,amount,created_by,created_at,attachment_url,attachment_path', { order: [['expense_month', { ascending: false }]] }); }
  catch (e) { data = await safeSelect('monthly_expenses', 'id,expense_month,branch_id,expense_item_id,amount,created_by,created_at', { order: [['expense_month', { ascending: false }]] }); }
  const g = {};
  (data || []).forEach(r => {
    const key = `${r.expense_month}__${r.branch_id || 'all'}`;
    if (!g[key]) g[key] = { id: key, month: r.expense_month, branchId: r.branch_id || 'all', items: {}, createdBy: r.created_by || '', attachmentUrl: safeUrl(r.attachment_url || ''), attachmentPath: r.attachment_path || '' };
    g[key].items[r.expense_item_id] = Number(r.amount || 0);
  });
  const d = getData(); d.monthlyExpenses = Object.values(g); setData(d);
}

async function loadIncomeDistributionsFromSupabase() {
  if (!sb || !currentUser) return;
  let data;
  try       { data = await safeSelect('income_distributions', 'id,distribution_month,branch_id,activity_id,income_amount,cost_amount,created_by,created_at,attachment_url,attachment_path', { order: [['distribution_month', { ascending: false }]] }); }
  catch (e) { data = await safeSelect('income_distributions', 'id,distribution_month,branch_id,activity_id,income_amount,cost_amount,created_by,created_at', { order: [['distribution_month', { ascending: false }]] }); }
  const g = {};
  (data || []).forEach(r => {
    const key = `${r.distribution_month}__${r.branch_id}`;
    if (!g[key]) g[key] = { id: key, month: r.distribution_month, branchId: r.branch_id, items: {}, createdBy: r.created_by || '', attachmentUrl: safeUrl(r.attachment_url || ''), attachmentPath: r.attachment_path || '' };
    g[key].items[r.activity_id] = { income: Number(r.income_amount || 0), cost: Number(r.cost_amount || 0) };
  });
  const d = getData(); d.incomeDistributions = Object.values(g); setData(d);
}

async function loadProfilesFromSupabase() {
  if (!sb || !currentUser || !canManage()) return;
  const { data, error } = await sb.from('profiles').select('id,full_name,role,branch_id,can_access_all_branches,created_at').order('created_at', { ascending: true });
  if (error) throw error;
  const d = getData();
  d.users = (data || []).map(u => ({ id: u.id, name: u.full_name, role: u.role, branchId: u.can_access_all_branches ? 'all' : u.branch_id, rawBranchId: u.branch_id, allBranches: !!u.can_access_all_branches }));
  setData(d);
}

/** تحميل كل البيانات بشكل متوازٍ مع caching */
async function loadAllSupabaseData() {
  try {
    // Check cache أولاً
    const cached = getCachedData();
    if (cached) {
      const d = getData();
      Object.assign(d, cached);
      setData(d);
      return;
    }

    const steps = [
      loadSupabaseReferenceData,
      loadDailyClosingsFromSupabase,
      loadMonthlyExpensesFromSupabase,
      loadIncomeDistributionsFromSupabase,
    ];
    if (canManage()) steps.push(loadProfilesFromSupabase);

    const results = await Promise.allSettled(steps.map(fn => fn()));

    const failed = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logError(`Load step ${i}`, r.reason, 'warn');
        failed.push(i);
      }
    });

    if (failed.length > 0) {
      showToast(`تحذير: فشل تحميل ${failed.length} عملية، سيتم المحاولة لاحقاً`, 'warning', 5000);
    }

    // Cache البيانات الناجحة
    const d = getData();
    setCacheData({
      branches: d.branches,
      users: d.users,
      paymentMethods: d.paymentMethods,
      expenseItems: d.expenseItems,
      activities: d.activities,
    });
  } catch (err) {
    logError('loadAllSupabaseData', err, 'error');
    showToast('خطأ في تحميل البيانات', 'error');
  }
}

/* ════════════════════════════════════════════════
   AUDIT LOG
   ════════════════════════════════════════════════ */

async function logAudit(action, entityType, entityId, oldData = null, newData = null, branchId = null) {
  try {
    if (!sb || !currentUser) return;
    const { error } = await sb.from('audit_logs').insert({
      user_id: currentUser.id, user_name: currentUser.name,
      action, entity_type: entityType, entity_id: String(entityId || ''),
      branch_id: branchId && isUuid(branchId) ? branchId : null,
      old_data: oldData, new_data: newData,
    });
    if (error) console.warn('Audit log failed:', error);
  } catch (e) { console.warn('Audit log exception:', e); }
}

async function loadAuditLogsFromSupabase() {
  if (!sb || !currentUser || !canManage()) return [];
  try {
    return await safeSelect('audit_logs', 'id,user_name,action,entity_type,entity_id,branch_id,old_data,new_data,created_at', { order: [['created_at', { ascending: false }]], limit: 200 });
  } catch (e) { console.warn('audit load failed', e); return []; }
}

/* ════════════════════════════════════════════════
   FILE UPLOAD
   ════════════════════════════════════════════════ */

async function uploadAttachment(file, folder) {
  if (!sb || !currentUser) throw new Error('لم يتم تسجيل الدخول');
  validateFile(file); // من security.js
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path     = `${folder}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeName}`;
  const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { path, url: safeUrl(data.publicUrl), name: file.name, type: file.type, size: file.size };
}

/* ════════════════════════════════════════════════
   DAILY CLOSING — DB OPERATIONS
   ════════════════════════════════════════════════ */

async function insertDailyClosingToSupabase(rec) {
  return safeSupabaseCall(async () => {
    const payload = {
      serial: rec.serial,
      closing_date: rec.date,
      branch_id: rec.branchId,
      main_payment_method_id: rec.mainPaymentMethodId || null,
      cars_count: rec.carsCount,
      status: 'pending_system',
      notes: rec.notes || '',
      created_by: currentUser.id,
      attachment_url: rec.attachmentUrl || null,
      attachment_path: rec.attachmentPath || null,
    };

    let closing = await sb.from('daily_closings').insert(payload).select('id').single();
    if (closing.error && String(closing.error.message || '').includes('attachment')) {
      delete payload.attachment_url;
      delete payload.attachment_path;
      closing = await sb.from('daily_closings').insert(payload).select('id').single();
    }
    if (closing.error) throw closing.error;

    const rows = methodsForBranch(rec.branchId).map(m => ({
      closing_id: closing.data.id,
      payment_method_id: m.id,
      actual_amount: Number(rec.actual?.[m.id] || 0),
      system_amount: 0,
    }));

    if (rows.length) {
      const pay = await sb.from('daily_closing_payments').insert(rows);
      if (pay.error) throw pay.error;
    }

    clearCache();
    return closing.data.id;
  }, 'insertDailyClosing');
}

async function updateSystemSalesInSupabase(closingId, systemPayments) {
  return safeSupabaseCall(async () => {
    for (const [pid, amt] of Object.entries(systemPayments || {})) {
      const up = await sb.from('daily_closing_payments').update({ system_amount: Number(amt || 0) }).eq('closing_id', closingId).eq('payment_method_id', pid);
      if (up.error) throw up.error;
    }

    const local = getData().dailyClosings.find(x => x.id === closingId);
    let status = 'pending_system';
    if (local) {
      local.system = systemPayments;
      updateClosingStatus(local);
      status = local.status;
    }

    const cl = await sb.from('daily_closings').update({ status }).eq('id', closingId);
    if (cl.error) throw cl.error;

    clearCache();
  }, 'updateSystemSales');
}

async function updateClosingStatusInSupabase(closingId, status, note = '') {
  return safeSupabaseCall(async () => {
    let payload = { status };
    if (note) payload.review_note = note;

    let res = await sb.from('daily_closings').update(payload).eq('id', closingId);
    if (res.error && String(res.error.message || '').includes('review_note')) {
      delete payload.review_note;
      res = await sb.from('daily_closings').update(payload).eq('id', closingId);
    }
    if (res.error) throw res.error;

    clearCache();
  }, 'updateClosingStatus');
}

async function deleteClosingFromSupabase(closingId) {
  return safeSupabaseCall(async () => {
    const { error } = await sb.from('daily_closings').delete().eq('id', closingId);
    if (error) throw error;
    clearCache();
  }, 'deleteClosing');
}

async function updateFullClosingInSupabase(rec) {
  return safeSupabaseCall(async () => {
    let payload = {
      closing_date: rec.date,
      main_payment_method_id: rec.mainPaymentMethodId || null,
      cars_count: Number(rec.carsCount || 0),
      status: rec.status,
      notes: rec.notes || '',
      review_note: rec.reviewNote || '',
    };

    let upd = await sb.from('daily_closings').update(payload).eq('id', rec.id);
    if (upd.error && String(upd.error.message || '').includes('review_note')) {
      delete payload.review_note;
      upd = await sb.from('daily_closings').update(payload).eq('id', rec.id);
    }
    if (upd.error) throw upd.error;

    for (const m of methodsForBranch(rec.branchId)) {
      const up = await sb.from('daily_closing_payments').upsert({
        closing_id: rec.id,
        payment_method_id: m.id,
        actual_amount: Number(rec.actual?.[m.id] || 0),
        system_amount: Number(rec.system?.[m.id] || 0),
      }, { onConflict: 'closing_id,payment_method_id' });
      if (up.error) throw up.error;
    }

    clearCache();
  }, 'updateFullClosing');
}

/* ════════════════════════════════════════════════
   EXPENSES — DB OPERATIONS
   ════════════════════════════════════════════════ */

async function saveMonthlyExpenseToSupabase(rec) {
  const branchId = rec.branchId === 'all' ? null : rec.branchId;
  if (branchId) { const del = await sb.from('monthly_expenses').delete().eq('expense_month', rec.month).eq('branch_id', branchId); if (del.error) throw del.error; }
  else          { const del = await sb.from('monthly_expenses').delete().eq('expense_month', rec.month).is('branch_id', null);      if (del.error) throw del.error; }
  let rows = Object.entries(rec.items || {}).map(([eid, amount]) => ({ expense_month: rec.month, branch_id: branchId, expense_item_id: eid, amount: Number(amount || 0), created_by: currentUser.id, attachment_url: rec.attachmentUrl || null, attachment_path: rec.attachmentPath || null }));
  let ins = await sb.from('monthly_expenses').insert(rows);
  if (ins.error && String(ins.error.message || '').includes('attachment')) {
    rows = rows.map(r => { delete r.attachment_url; delete r.attachment_path; return r; });
    ins  = await sb.from('monthly_expenses').insert(rows);
  }
  if (ins.error) throw ins.error;
}

async function deleteMonthlyExpenseFromSupabase(month, branchId) {
  const bid = branchId === 'all' ? null : branchId;
  const q   = sb.from('monthly_expenses').delete().eq('expense_month', month);
  const { error } = bid ? q.eq('branch_id', bid) : q.is('branch_id', null);
  if (error) throw error;
}

/* ════════════════════════════════════════════════
   INCOME DISTRIBUTION — DB OPERATIONS
   ════════════════════════════════════════════════ */

async function saveIncomeDistributionToSupabase(rec) {
  const del = await sb.from('income_distributions').delete().eq('distribution_month', rec.month).eq('branch_id', rec.branchId);
  if (del.error) throw del.error;
  let rows = Object.entries(rec.items || {}).map(([aid, val]) => ({ distribution_month: rec.month, branch_id: rec.branchId, activity_id: aid, income_amount: activityIncomeValue(val), cost_amount: activityCostValue(val), created_by: currentUser.id, attachment_url: rec.attachmentUrl || null, attachment_path: rec.attachmentPath || null }));
  let ins  = await sb.from('income_distributions').insert(rows);
  if (ins.error && String(ins.error.message || '').includes('attachment')) {
    rows = rows.map(r => { delete r.attachment_url; delete r.attachment_path; return r; });
    ins  = await sb.from('income_distributions').insert(rows);
  }
  if (ins.error) throw ins.error;
}

async function deleteIncomeDistributionFromSupabase(month, branchId) {
  const { error } = await sb.from('income_distributions').delete().eq('distribution_month', month).eq('branch_id', branchId);
  if (error) throw error;
}

/* ════════════════════════════════════════════════
   SETTINGS — DB OPERATIONS
   ════════════════════════════════════════════════ */

async function addBranchToSupabase(name, city)         { const {error} = await sb.from('branches').insert({name, city, is_active: true}); if (error) throw error; }
async function deleteBranchFromSupabase(id)            { const {error} = await sb.from('branches').update({is_active: false}).eq('id', id); if (error) throw error; }
async function addPaymentMethodToSupabase(label)       { const {error} = await sb.from('payment_methods').insert({label, is_active: true}); if (error) throw error; }
async function deletePaymentMethodFromSupabase(id)     { const {error} = await sb.from('payment_methods').update({is_active: false}).eq('id', id); if (error) throw error; }
async function addExpenseItemToSupabase(label)         { const {error} = await sb.from('expense_items').insert({label, is_active: true}); if (error) throw error; }
async function updateExpenseItemInSupabase(id, label)  { const {error} = await sb.from('expense_items').update({label}).eq('id', id); if (error) throw error; }
async function deleteExpenseItemFromSupabase(id)       { const {error} = await sb.from('expense_items').update({is_active: false}).eq('id', id); if (error) throw error; }
async function addActivityToSupabase(label)            { const {error} = await sb.from('activities').insert({label, is_active: true}); if (error) throw error; }
async function updateActivityInSupabase(id, label)     { const {error} = await sb.from('activities').update({label}).eq('id', id); if (error) throw error; }
async function deleteActivityFromSupabase(id)          { const {error} = await sb.from('activities').update({is_active: false}).eq('id', id); if (error) throw error; }
async function upsertProfileToSupabase(profile)        { const {error} = await sb.from('profiles').upsert({id: profile.id, full_name: profile.full_name, role: profile.role, branch_id: profile.branch_id, can_access_all_branches: profile.can_access_all_branches}, {onConflict: 'id'}); if (error) throw error; }
async function deleteProfileFromSupabase(id)           { const {error} = await sb.from('profiles').delete().eq('id', id); if (error) throw error; }
