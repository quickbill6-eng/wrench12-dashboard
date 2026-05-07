/**
 * app.js — Application Logic, Auth, CRUD Actions, Dashboard Renders
 * Wrench 12 Dashboard
 */

'use strict';

/* ════════════════════════════════════════════════
   INIT & AUTH
   ════════════════════════════════════════════════ */

async function init() {
  normalizeData();
  initSupabase();

  ['dailyDate','dashboardMonth','expenseMonth','incomeDistMonth','diffMonth','branchAnalyticsMonth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id === 'dailyDate' ? today() : thisMonth();
  });

  // Set date range for payment analysis (last 30 days)
  const toDate = document.getElementById('paymentAnalysisToDate');
  const fromDate = document.getElementById('paymentAnalysisFromDate');
  if (toDate && fromDate) {
    toDate.value = today();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    fromDate.value = thirtyDaysAgo.toISOString().slice(0, 10);
  }

  const yy = document.getElementById('yearlyYear');
  if (yy) yy.value = new Date().getFullYear();

  buildPaymentInputs();
  if (!sb) return;

  try {
    const session = await sb.auth.getSession();
    if (session.error) throw session.error;
    if (session.data?.session?.user) {
      const profile = await getProfile(session.data.session.user.id);
      currentUser = { id: profile.id, name: profile.full_name, role: profile.role, branchId: profile.can_access_all_branches ? 'all' : profile.branch_id };
      await loadAllSupabaseData();
      openApp();
    }
  } catch (err) {
    console.warn('Session check failed:', formatError(err));
    if (isRefreshTokenError(err)) {
      clearBrokenSupabaseSession();
      showLoginError('انتهت الجلسة السابقة. تم تنظيفها، سجّل الدخول مرة أخرى.');
    }
  }
}

function openApp() {
  document.getElementById('loginScreen').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
  safeSetText('currentUserName', currentUser.name);
  safeSetText('currentUserRole', roleNames[currentUser.role] || currentUser.role);
  renderNav();
  renderAll();
  showSection(currentUser.role === 'branch' ? 'daily' : 'dashboard');
}

async function login() {
  clearLoginError();
  let valid = true;
  const email    = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  const emailErr = document.getElementById('emailError');
  const passErr  = document.getElementById('passwordError');
  if (emailErr) emailErr.textContent = '';
  if (passErr)  passErr.textContent  = '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (emailErr) { emailErr.textContent = 'أدخل بريدًا إلكترونيًا صحيحًا'; document.getElementById('loginEmail')?.classList.add('is-invalid'); }
    valid = false;
  }
  if (!password || password.length < 6) {
    if (passErr) { passErr.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'; document.getElementById('loginPassword')?.classList.add('is-invalid'); }
    valid = false;
  }
  if (!valid) return;

  setLoginLoading(true);
  try {
    if (!sb) throw new Error('مكتبة Supabase لم تعمل. تأكد من اتصال الإنترنت.');
    const auth = await sb.auth.signInWithPassword({ email, password });
    if (auth.error) throw auth.error;
    if (!auth.data?.user) throw new Error('لم يرجع Supabase بيانات المستخدم');
    const profile = await getProfile(auth.data.user.id);
    currentUser = { id: profile.id, name: profile.full_name, role: profile.role, branchId: profile.can_access_all_branches ? 'all' : profile.branch_id };
    await loadAllSupabaseData();
    openApp();
  } catch (err) {
    console.error('Login failed:', err);
    if (isRefreshTokenError(err)) { clearBrokenSupabaseSession(); showLoginError('جلسة قديمة تالفة — أعد المحاولة.'); }
    else showLoginError(err);
  } finally {
    setLoginLoading(false);
  }
}

async function logout() {
  try { clearBrokenSupabaseSession(); if (sb) await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
  currentUser = null;
  document.getElementById('app').classList.add('d-none');
  document.getElementById('loginScreen').classList.remove('d-none');
}

/* ════════════════════════════════════════════════
   DAILY CLOSING ACTIONS
   ════════════════════════════════════════════════ */

async function saveDaily() {
  if (!validateDaily()) return;
  setBtnLoading('saveDailyBtn', true);
  const bid = document.getElementById('dailyBranch').value;
  const rec = {
    id:                 uid(),
    serial:             'DCR-' + new Date().getFullYear() + '-' + String(getData().dailyClosings.length + 1).padStart(4, '0'),
    status:             'pending_system',
    date:               document.getElementById('dailyDate').value,
    branchId:           bid,
    mainPaymentMethodId:document.getElementById('dailyMainPayment').value,
    carsCount:          Number(document.getElementById('carsCount').value || 0),
    actual:             collectPayments('actual'),
    system:             emptyPayments(),
    notes:              document.getElementById('dailyNotes').value.slice(0, 500),
    createdBy:          currentUser.name,
    createdAt:          new Date().toLocaleString('en-US'),
  };
  try {
    const f = document.getElementById('dailyAttachment')?.files?.[0];
    if (sb && f) { const att = await uploadAttachment(f, 'closings'); rec.attachmentUrl = att.url; rec.attachmentPath = att.path; }
    if (sb && currentUser) {
      const newId = await insertDailyClosingToSupabase(rec);
      await logAudit('create', 'daily_closing', newId, null, rec, bid);
      await loadDailyClosingsFromSupabase();
    } else {
      const d = getData(); d.dailyClosings.push(rec); setData(d);
    }
    showToast('تم حفظ الإغلاق الفعلي بنجاح', 'success');
    renderAll();
  } catch (err) { notifyError('تعذر حفظ الإغلاق:', err); }
  finally { setBtnLoading('saveDailyBtn', false); }
}

async function saveSystemSales() {
  const id  = document.getElementById('systemClosingSelect').value;
  const d   = getData();
  const r   = d.dailyClosings.find(x => x.id === id);
  if (!r) return;
  const old           = JSON.parse(JSON.stringify(r));
  const systemPayments = collectPayments('system');
  setBtnLoading('saveSystemBtn', true);
  try {
    if (sb && currentUser) {
      await updateSystemSalesInSupabase(id, systemPayments);
      await logAudit('update_system_sales', 'daily_closing', id, old, { system: systemPayments }, r.branchId);
      await loadDailyClosingsFromSupabase();
    } else { r.system = systemPayments; updateClosingStatus(r); setData(d); }
    showToast('تم حفظ مبيعات النظام بنجاح', 'success');
    renderAll();
  } catch (err) { notifyError('تعذر حفظ مبيعات النظام:', err); }
  finally { setBtnLoading('saveSystemBtn', false); }
}

async function submitClosing(id)  { await _changeStatus(id, 'submitted',  '',     'تم إرسال الإغلاق للمراجعة'); }
async function approveClosing(id) { await _changeStatus(id, 'approved',   '',     'تم اعتماد الإغلاق'); }
async function closeClosing(id)   { await _changeStatus(id, 'closed',     '',     'تم إقفال الإغلاق'); }
async function archiveClosing(id) { await _changeStatus(id, 'archived',   '',     'تمت أرشفة الإغلاق'); }

async function rejectClosing(id) {
  const note = prompt('سبب الرفض أو الملاحظة') || '';
  try {
    const r = getData().dailyClosings.find(x => x.id === id);
    if (!r) return;
    r.status = 'rejected'; r.reviewNote = note;
    if (sb && currentUser) {
      await updateClosingStatusInSupabase(id, 'rejected', note);
      await logAudit('reject', 'daily_closing', id, null, { status: 'rejected', note }, r.branchId);
      await loadDailyClosingsFromSupabase();
    }
    renderAll(); showToast('تم رفض الإغلاق', 'info');
  } catch (err) { notifyError('تعذر رفض الإغلاق:', err); }
}

async function _changeStatus(id, status, note, msg) {
  try {
    const r = getData().dailyClosings.find(x => x.id === id);
    if (sb && currentUser) {
      await updateClosingStatusInSupabase(id, status, note);
      await logAudit(status, 'daily_closing', id, r, { status }, r?.branchId);
      await loadDailyClosingsFromSupabase();
    } else if (r) { r.status = status; setData(getData()); }
    renderAll(); showToast(msg, 'success');
  } catch (err) { notifyError(`تعذر تغيير حالة الإغلاق:`, err); }
}

async function deleteClosing(id) {
  if (!confirm('حذف الإغلاق؟')) return;
  try {
    const r = getData().dailyClosings.find(x => x.id === id);
    if (sb && currentUser) {
      await deleteClosingFromSupabase(id);
      await logAudit('delete', 'daily_closing', id, r, null, r?.branchId);
      await loadDailyClosingsFromSupabase();
    } else { const d = getData(); d.dailyClosings = d.dailyClosings.filter(x => x.id !== id); setData(d); }
    renderAll(); showToast('تم حذف الإغلاق', 'success');
  } catch (err) { notifyError('تعذر حذف الإغلاق:', err); }
}

function openSystemSalesFor(id) {
  showSection('systemSales');
  renderSystemClosingOptions();
  const sel = document.getElementById('systemClosingSelect');
  if (sel) { sel.value = id; loadSystemClosing(); }
}

/* ════════════════════════════════════════════════
   EXPENSES
   ════════════════════════════════════════════════ */

async function saveMonthlyExpense() {
  if (!validateExpenses()) return;
  setBtnLoading('saveExpenseBtn', true);
  const items = {};
  getExpenseItems().forEach(i => items[i.id] = Number(document.getElementById(`exp_${i.id}`)?.value || 0));
  const rec = { id: uid(), month: document.getElementById('expenseMonth').value, branchId: document.getElementById('expenseBranch').value, items, createdBy: currentUser.name };
  try {
    const f = document.getElementById('expenseAttachment')?.files?.[0];
    if (sb && f) { const att = await uploadAttachment(f, 'expenses'); rec.attachmentUrl = att.url; rec.attachmentPath = att.path; }
    if (sb && currentUser) {
      const old = getData().monthlyExpenses.find(e => e.month === rec.month && e.branchId === rec.branchId) || null;
      await saveMonthlyExpenseToSupabase(rec);
      await logAudit(old ? 'update' : 'create', 'monthly_expense', `${rec.month}-${rec.branchId}`, old, rec, rec.branchId === 'all' ? null : rec.branchId);
      await loadMonthlyExpensesFromSupabase();
    } else {
      const d = getData(); d.monthlyExpenses = d.monthlyExpenses.filter(e => !(e.month === rec.month && e.branchId === rec.branchId)); d.monthlyExpenses.push(rec); setData(d);
    }
    showToast('تم حفظ المصروفات الشهرية بنجاح', 'success'); renderAll();
  } catch (err) { notifyError('تعذر حفظ المصروفات:', err); }
  finally { setBtnLoading('saveExpenseBtn', false); }
}

async function deleteMonthlyExpense(month, branchId) {
  if (!confirm('حذف مصروفات هذا الشهر؟')) return;
  try {
    if (sb && currentUser) {
      const old = getData().monthlyExpenses.find(e => e.month === month && e.branchId === branchId) || null;
      await deleteMonthlyExpenseFromSupabase(month, branchId);
      await logAudit('delete', 'monthly_expense', `${month}-${branchId}`, old, null, branchId === 'all' ? null : branchId);
      await loadMonthlyExpensesFromSupabase();
    } else { const d = getData(); d.monthlyExpenses = d.monthlyExpenses.filter(e => !(e.month === month && e.branchId === branchId)); setData(d); }
    renderAll(); showToast('تم حذف المصروفات', 'success');
  } catch (err) { notifyError('تعذر حذف المصروفات:', err); }
}

/* ════════════════════════════════════════════════
   INCOME DISTRIBUTION
   ════════════════════════════════════════════════ */

async function saveIncomeDistribution() {
  if (!validateIncomeDistribution()) return;
  setBtnLoading('saveDistBtn', true);
  const month = document.getElementById('incomeDistMonth').value;
  const bid   = document.getElementById('incomeDistBranch').value;
  const rec   = { id: uid(), month, branchId: bid, items: collectActivityDistribution(), createdBy: currentUser.name };
  try {
    const f = document.getElementById('incomeDistAttachment')?.files?.[0];
    if (sb && f) { const att = await uploadAttachment(f, 'income-distributions'); rec.attachmentUrl = att.url; rec.attachmentPath = att.path; }
    if (sb && currentUser) {
      const old = getData().incomeDistributions.find(x => x.month === month && x.branchId === bid) || null;
      await saveIncomeDistributionToSupabase(rec);
      await logAudit(old ? 'update' : 'create', 'income_distribution', `${month}-${bid}`, old, rec, bid);
      await loadIncomeDistributionsFromSupabase();
    } else {
      const d = getData(); d.incomeDistributions = d.incomeDistributions.filter(x => !(x.month === month && x.branchId === bid)); d.incomeDistributions.push(rec); setData(d);
    }
    showToast('تم حفظ توزيع الدخل بنجاح', 'success'); renderAll();
  } catch (err) { notifyError('تعذر حفظ توزيع الدخل:', err); }
  finally { setBtnLoading('saveDistBtn', false); }
}

async function deleteIncomeDistribution(month, branchId) {
  if (!confirm('حذف توزيع الأنشطة لهذا الشهر؟')) return;
  try {
    if (sb && currentUser) {
      const old = getData().incomeDistributions.find(d => d.month === month && d.branchId === branchId) || null;
      await deleteIncomeDistributionFromSupabase(month, branchId);
      await logAudit('delete', 'income_distribution', `${month}-${branchId}`, old, null, branchId);
      await loadIncomeDistributionsFromSupabase();
    } else { const data = getData(); data.incomeDistributions = data.incomeDistributions.filter(d => !(d.month === month && d.branchId === branchId)); setData(data); }
    renderAll(); showToast('تم حذف توزيع الأنشطة', 'success');
  } catch (err) { notifyError('تعذر حذف توزيع الأنشطة:', err); }
}

/* ════════════════════════════════════════════════
   SETTINGS CRUD
   ════════════════════════════════════════════════ */

async function addPaymentMethod()  { const name=document.getElementById('paymentMethodName').value.trim().slice(0,60); if(!name)return; try{if(sb&&currentUser){await addPaymentMethodToSupabase(name);await loadSupabaseReferenceData();}else{const d=getData();d.paymentMethods.push({id:'pm_'+uid(),label:name,branches:'all'});setData(d);}document.getElementById('paymentMethodName').value='';renderAll();showToast('تم حفظ طريقة الدفع','success');}catch(err){notifyError('',err);} }
async function deletePaymentMethod(id){ if(!confirm('حذف؟'))return; try{if(sb&&currentUser){await deletePaymentMethodFromSupabase(id);await loadSupabaseReferenceData();}else{const d=getData();d.paymentMethods=d.paymentMethods.filter(m=>m.id!==id);setData(d);}renderAll();}catch(err){notifyError('',err);} }
async function addExpenseItem()    { const name=document.getElementById('expenseItemName').value.trim().slice(0,60); if(!name)return; try{if(sb&&currentUser){await addExpenseItemToSupabase(name);await loadSupabaseReferenceData();}else{const d=getData();d.expenseItems.push({id:'exp_'+uid(),label:name});setData(d);}document.getElementById('expenseItemName').value='';renderAll();showToast('تم حفظ بند المصروف','success');}catch(err){notifyError('',err);} }
async function updateExpenseItem(id){ const val=document.getElementById(`expense_label_${id}`)?.value.trim().slice(0,60); if(!val)return; try{if(sb&&currentUser){await updateExpenseItemInSupabase(id,val);await loadSupabaseReferenceData();}else{const d=getData(),item=d.expenseItems.find(i=>i.id===id);if(item)item.label=val;setData(d);}renderAll();}catch(err){notifyError('',err);} }
async function deleteExpenseItem(id){ if(!confirm('حذف؟'))return; try{if(sb&&currentUser){await deleteExpenseItemFromSupabase(id);await loadSupabaseReferenceData();}else{const d=getData();d.expenseItems=d.expenseItems.filter(i=>i.id!==id);setData(d);}renderAll();}catch(err){notifyError('',err);} }
async function addActivity()       { const name=document.getElementById('activityName').value.trim().slice(0,60); if(!name)return; try{if(sb&&currentUser){await addActivityToSupabase(name);await loadSupabaseReferenceData();}else{const d=getData();d.activities.push({id:'act_'+uid(),label:name});setData(d);}document.getElementById('activityName').value='';renderAll();showToast('تم حفظ النشاط','success');}catch(err){notifyError('',err);} }
async function updateActivity(id)  { const val=document.getElementById(`activity_label_${id}`)?.value.trim().slice(0,60); if(!val)return; try{if(sb&&currentUser){await updateActivityInSupabase(id,val);await loadSupabaseReferenceData();}else{const d=getData(),a=d.activities.find(x=>x.id===id);if(a)a.label=val;setData(d);}renderAll();}catch(err){notifyError('',err);} }
async function deleteActivity(id)  { if(!confirm('حذف؟'))return; try{if(sb&&currentUser){await deleteActivityFromSupabase(id);await loadSupabaseReferenceData();}else{const d=getData();d.activities=d.activities.filter(a=>a.id!==id);setData(d);}renderAll();}catch(err){notifyError('',err);} }
async function addBranch()         { const name=document.getElementById('branchName').value.trim().slice(0,80),city=document.getElementById('branchCity').value.trim().slice(0,60); if(!name)return; try{if(sb&&currentUser){await addBranchToSupabase(name,city);await loadSupabaseReferenceData();}else{const d=getData();d.branches.push({id:uid(),name,city});setData(d);}document.getElementById('branchName').value='';document.getElementById('branchCity').value='';renderAll();showToast('تم حفظ الفرع','success');}catch(err){notifyError('',err);} }
async function deleteBranch(id)    { if(!confirm('حذف الفرع؟'))return; try{if(sb&&currentUser){await deleteBranchFromSupabase(id);await loadSupabaseReferenceData();}else{const d=getData();d.branches=d.branches.filter(b=>b.id!==id);setData(d);}renderAll();}catch(err){notifyError('',err);} }

async function saveUserProfile() {
  const id        = document.getElementById('profileUserId')?.value.trim();
  const full_name = document.getElementById('userName')?.value.trim().slice(0, 80);
  const role      = document.getElementById('userRole')?.value;
  const selBranch = document.getElementById('userBranch')?.value;
  const canAll    = document.getElementById('userAllBranches')?.checked || ['manager','accountant','auditor'].includes(role);
  if (!id || !full_name || !role) { showToast('أدخل User UID والاسم والصلاحية', 'error'); return; }
  if (!isUuid(id)) { showToast('User UID غير صحيح', 'error'); return; }
  const branch_id = canAll ? null : selBranch;
  if (!canAll && !isUuid(branch_id)) { showToast('اختر فرعًا صحيحًا', 'error'); return; }
  try {
    if (sb && currentUser) { await upsertProfileToSupabase({ id, full_name, role, branch_id, can_access_all_branches: canAll }); await loadProfilesFromSupabase(); }
    else {
      const d = getData(); d.users = d.users || [];
      const ex = d.users.find(u => u.id === id);
      if (ex) { ex.name=full_name; ex.role=role; ex.branchId=canAll?'all':branch_id; ex.allBranches=canAll; }
      else d.users.push({ id, name:full_name, role, branchId:canAll?'all':branch_id, allBranches:canAll });
      setData(d);
    }
    renderUsers(); showToast('تم حفظ صلاحية المستخدم', 'success');
  } catch (err) { notifyError('تعذر حفظ المستخدم:', err); }
}

async function deleteUser(id) {
  if (!confirm('حذف صلاحية المستخدم؟')) return;
  try {
    if (sb && currentUser) { await deleteProfileFromSupabase(id); await loadProfilesFromSupabase(); }
    else { const d = getData(); d.users = (d.users||[]).filter(u => u.id !== id); setData(d); }
    renderUsers();
  } catch (err) { notifyError('تعذر حذف المستخدم:', err); }
}
