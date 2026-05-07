/**
 * ui.js — Toast Notifications, Loading States, UI Helpers
 * Wrench 12 Dashboard
 */

'use strict';

/* ════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ════════════════════════════════════════════════ */

function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className  = `toast-msg toast-${type}`;
  t.textContent = msg; // textContent — آمن من XSS
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity    = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

function notifyError(title, err) {
  showToast(title + ' ' + formatError(err), 'error', 5000);
}

/* ════════════════════════════════════════════════
   BUTTON LOADING STATE
   ════════════════════════════════════════════════ */

function setBtnLoading(btnId, on) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('btn-loading', on);
  btn.disabled = on;
  if (!on) btn.style.color = '';
}

/* ════════════════════════════════════════════════
   LOGIN UI
   ════════════════════════════════════════════════ */

function showLoginError(err) {
  const b = document.getElementById('loginError');
  if (b) { b.style.display = 'block'; b.textContent = formatError(err); }
}

function clearLoginError() {
  const b = document.getElementById('loginError');
  if (b) { b.style.display = 'none'; b.textContent = ''; }
}

function setLoginLoading(on) {
  const b = document.getElementById('loginBtn');
  if (!b) return;
  b.classList.toggle('btn-loading', on);
  b.disabled = on;
  b.innerHTML = on
    ? '<span class="spinner-border spinner-border-sm ms-2"></span> جاري الدخول'
    : '<i class="bi bi-box-arrow-in-left ms-1"></i> دخول';
}

/* ════════════════════════════════════════════════
   STATUS HELPERS
   ════════════════════════════════════════════════ */

function statusText(s) {
  return {
    pending_system: 'بانتظار مبيعات النظام',
    matched:        'مطابق',
    difference:     'يوجد فرق',
    submitted:      'تم الإرسال',
    approved:       'معتمد',
    rejected:       'مرفوض',
    closed:         'مقفل',
    archived:       'مؤرشف',
  }[s] || 'بانتظار المراجعة';
}

function statusBadge(s) {
  const c = {
    pending_system: 'badge-soft-warning',
    matched:        'badge-soft-success',
    difference:     'badge-soft-danger',
    submitted:      'badge-soft-warning',
    approved:       'badge-soft-success',
    rejected:       'badge-soft-danger',
    closed:         'badge-soft-dark',
    archived:       'badge-soft-dark',
  }[s] || 'badge-soft-warning';
  return `<span class="badge ${c}">${esc(statusText(s))}</span>`;
}

/* ════════════════════════════════════════════════
   STAT CARD BUILDER
   ════════════════════════════════════════════════ */

function iconClass(title) {
  if (title.includes('دخل')    || title.includes('INCOME'))  return 'ui-income';
  if (title.includes('مصروف') || title.includes('EXPENSE')) return 'ui-expense';
  if (title.includes('تكلفة'))                               return 'ui-warn';
  if (title.includes('ربح')    || title.includes('صافي'))    return 'ui-profit';
  if (title.includes('فرق'))                                 return 'ui-danger';
  return 'ui-neutral';
}

function stat(title, value, icon, wide = false) {
  return `<div class="${wide ? 'col-lg-6' : 'col-md-6 col-xl-4'}">
    <div class="stat-card p-4">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div class="overflow-hidden">
          <div class="stat-title">${esc(title)}</div>
          <div class="stat-value mt-2">${esc(value)}</div>
        </div>
        <div class="stat-icon ${iconClass(title)}">
          <i class="bi ${esc(icon)}"></i>
        </div>
      </div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════
   CHART HELPERS
   ════════════════════════════════════════════════ */

/** تدمير Chart.js آمن قبل إعادة الرسم */
function destroyChart(key) {
  if (charts[key]) {
    try { charts[key].destroy(); } catch (e) { /* silent */ }
    charts[key] = null;
  }
}

/* ════════════════════════════════════════════════
   NAVIGATION
   ════════════════════════════════════════════════ */

function renderNav() {
  const items = [
    ['dashboard',          'bi-speedometer2',       'التحليل الشهري',     currentUser.role !== 'branch'],
    ['branchAnalytics',    'bi-bar-chart-line',      'تحليل الفروع',       canEnterSystem() || currentUser.role === 'auditor'],
    ['yearlyDashboard',    'bi-calendar3',           'التحليل السنوي',     canEnterSystem() || currentUser.role === 'auditor'],
    ['daily',              'bi-calendar-check',      'الإغلاق الفعلي',     currentUser.role !== 'auditor'],
    ['systemSales',        'bi-pc-display',          'مبيعات النظام',      canEnterSystem()],
    ['reports',            'bi-table',               'التقارير',           true],
    ['paymentMethodsAnalysis', 'bi-credit-card',    'تحليل طرق الدفع',    currentUser.role !== 'branch'],
    ['differences',        'bi-exclamation-triangle','سجل الفروقات',       currentUser.role !== 'branch'],
    ['expenses',           'bi-cash-stack',          'المصروفات والربح',   canEnterSystem()],
    ['incomeDistribution', 'bi-pie-chart',           'توزيع الدخل',        canEnterSystem()],
    ['settings',           'bi-sliders',             'الإعدادات',          canManage()],
    ['branches',           'bi-shop',                'الفروع',             canManage()],
    ['users',              'bi-people',              'المستخدمون',         canManage()],
    ['audit',              'bi-clock-history',       'سجل الحركة',         canManage()],
  ];
  const nav = document.getElementById('sideNav');
  nav.innerHTML = '';
  items.filter(i => i[3]).forEach((i, idx) => {
    const a = document.createElement('a');
    a.className = 'nav-link' + (idx === 0 ? ' active' : '');
    a.onclick   = () => showSection(i[0], a);
    a.innerHTML = `<i class="bi ${esc(i[1])} ms-2"></i>${esc(i[2])}`;
    nav.appendChild(a);
  });
}

function showSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById(id);
  if (!sec) return;
  sec.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  const sectionRenders = {
    dashboard:           () => { renderDashboard(); renderExecutiveDashboard(); },
    branchAnalytics:     renderBranchAnalytics,
    yearlyDashboard:     renderYearlyDashboard,
    reports:             renderDailyTable,
    paymentMethodsAnalysis: renderPaymentMethodsAnalysis,
    differences:         renderDifferencesPage,
    expenses:            renderProfitTable,
    systemSales:         renderSystemClosingOptions,
    incomeDistribution:  renderIncomeDistributionPage,
    settings:            renderSettings,
    audit:               renderAuditLogs,
  };
  sectionRenders[id]?.();
}

function renderAll() {
  renderSelects();
  renderBranches();
  renderUsers();
  renderSettings();
  buildPaymentInputs();
  renderDailyTable();
  renderDifferencesPage();
  renderProfitTable();
  renderDashboard();
  renderExecutiveDashboard();
  renderBranchAnalytics();
  renderYearlyDashboard();
  renderPaymentMethodsAnalysis();
  fillMainPaymentMethods();
  renderSystemClosingOptions();
  renderExpenseInputs();
  renderIncomeDistributionPage();
}

function renderSelects() {
  const branches   = visibleBranches();
  const allAllowed = ['manager','accountant','auditor'].includes(currentUser?.role) || currentUser?.branchId === 'all';

  ['dashboardBranch','yearlyBranch','dailyBranch','expenseBranch','incomeDistBranch','diffBranch','paymentAnalysisBranch','userBranch'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';

    if ((id === 'dashboardBranch' || id === 'yearlyBranch' || id === 'diffBranch' || id === 'paymentAnalysisBranch') && allAllowed)
      sel.innerHTML = '<option value="all">كل الفروع</option>';
    if (id === 'expenseBranch' && allAllowed)
      sel.innerHTML = '<option value="all">كل الفروع / مصروف عام</option>';
    if (id === 'userBranch')
      sel.innerHTML = '<option value="all">كل الفروع</option>';

    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value       = b.id;
      opt.textContent = b.name;
      sel.appendChild(opt);
    });
  });
}

/* ════════════════════════════════════════════════
   PAYMENT INPUTS BUILDER
   ════════════════════════════════════════════════ */

function buildPaymentInputs() {
  const selected = document.getElementById('dailyBranch')?.value || visibleBranches()[0]?.id;

  const buildContainer = (prefix, bid) => {
    const container = document.createElement('div');
    methodsForBranch(bid).forEach(m => {
      const row   = document.createElement('div'); row.className = 'row align-items-center mb-2';
      const label = document.createElement('label'); label.className = 'col-5 form-label mb-0'; label.textContent = m.label;
      const col   = document.createElement('div'); col.className = 'col-7';
      const input = document.createElement('input');
      input.type      = 'number'; input.value = '0'; input.min = '0'; input.max = '9999999';
      input.className = 'form-control'; input.id = `${prefix}_${m.id}`;
      input.addEventListener('input', updateLiveTotals);
      col.appendChild(input); row.appendChild(label); row.appendChild(col); container.appendChild(row);
    });
    const hr    = document.createElement('hr'); container.appendChild(hr);
    const total = document.createElement('div'); total.className = 'd-flex justify-content-between fw-bold';
    total.innerHTML = `<span>الإجمالي</span><span id="${prefix}_total">0.00</span>`;
    container.appendChild(total);
    return container;
  };

  const a = document.getElementById('actualInputs');
  const s = document.getElementById('systemInputs');
  if (a) { a.innerHTML = ''; a.appendChild(buildContainer('actual', selected)); }
  if (s) s.innerHTML = '<div class="alert alert-light border">اختر الإغلاق ليتم عرض طرق الدفع الخاصة بالفرع.</div>';
  updateLiveTotals();
}

function updateLiveTotals() {
  ['actual', 'system'].forEach(p => {
    const t = getPaymentMethods().reduce((s, m) => s + Number(document.getElementById(`${p}_${m.id}`)?.value || 0), 0);
    safeSetText(`${p}_total`, money(t));
  });
}

function fillMainPaymentMethods() {
  const bid = document.getElementById('dailyBranch')?.value;
  const sel = document.getElementById('dailyMainPayment');
  if (!sel) return;
  sel.innerHTML = '';
  methodsForBranch(bid).forEach(m => {
    const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.label; sel.appendChild(opt);
  });
  buildPaymentInputs();
}
