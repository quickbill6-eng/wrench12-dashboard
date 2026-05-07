/**
 * render.js — All UI Rendering Functions
 * Wrench 12 Dashboard
 */

'use strict';

/* ════════════════════════════════════════════════
   DAILY TABLE
   ════════════════════════════════════════════════ */

function renderDailyTable() {
  const tb = document.getElementById('dailyTable');
  if (!tb) return;
  tb.innerHTML = '';
  const filter = document.getElementById('statusFilter')?.value || 'all';
  let rows = getData().dailyClosings.filter(r => visibleBranches().some(b => b.id === r.branchId));
  rows.forEach(updateClosingStatus);
  if (filter !== 'all') rows = rows.filter(r => r.status === filter);
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" class="text-center text-muted">لا توجد إغلاقات</td></tr>'; return; }

  rows.slice().reverse().forEach(r => {
    const a = sumPayments(r.actual), s = sumPayments(r.system), diff = a - s;
    const tr = document.createElement('tr');

    // خلايا النصوص الآمنة
    [r.date, branchName(r.branchId), money(a), s === 0 ? '-' : money(s), s === 0 ? '-' : money(diff)].forEach((val, i) => {
      const td = document.createElement('td');
      if (i === 4 && s !== 0) td.className = 'fw-bold ' + (diff < 0 ? 'text-danger' : 'text-success');
      td.textContent = val;
      tr.appendChild(td);
    });

    // حالة
    const statusTd = document.createElement('td');
    statusTd.innerHTML = statusBadge(r.status); // statusBadge تستخدم esc()
    tr.appendChild(statusTd);

    // ملاحظة مراجعة
    const reviewTd = document.createElement('td');
    if (r.reviewNote) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline-dark';
      btn.textContent = 'عرض';
      btn.onclick = () => showToast(r.reviewNote, 'info', 6000);
      reviewTd.appendChild(btn);
    } else { reviewTd.textContent = '-'; }
    tr.appendChild(reviewTd);

    // إجراءات
    const actionTd = document.createElement('td');
    const wrap = document.createElement('div'); wrap.className = 'actions-wrap';
    const actions = [];
    if (canEnterSystem()) actions.push(['btn-primary',         'إدخال النظام', () => openSystemSalesFor(r.id)]);
    if (canManage()) {
      actions.push(
        ['btn-outline-warning',   'إرسال',  () => submitClosing(r.id)],
        ['btn-outline-success',   'اعتماد', () => approveClosing(r.id)],
        ['btn-outline-danger',    'رفض',    () => rejectClosing(r.id)],
        ['btn-outline-dark',      'إقفال',  () => closeClosing(r.id)],
        ['btn-outline-secondary', 'أرشفة',  () => archiveClosing(r.id)],
        ['btn-outline-secondary', 'تعديل',  () => openEditClosingPanel(r.id)],
        ['btn-outline-danger',    'حذف',    () => deleteClosing(r.id)],
      );
    }
    actions.push(['btn-outline-primary', 'PDF', () => showReport(r.id)]);
    actions.forEach(([cls, label, fn]) => {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${cls}`; btn.textContent = label; btn.onclick = fn;
      wrap.appendChild(btn);
    });
    actionTd.appendChild(wrap); tr.appendChild(actionTd); tb.appendChild(tr);
  });
}

/* ════════════════════════════════════════════════
   SYSTEM CLOSING
   ════════════════════════════════════════════════ */

function renderSystemClosingOptions() {
  const sel = document.getElementById('systemClosingSelect');
  if (!sel) return;
  sel.innerHTML = '';
  const rows = getData().dailyClosings.filter(r => visibleBranches().some(b => b.id === r.branchId));
  if (!rows.length) { sel.innerHTML = '<option value="">لا توجد إغلاقات</option>'; return; }
  rows.slice().reverse().forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = `${branchName(r.branchId)} - ${r.date} - ${statusText(r.status)}`;
    sel.appendChild(opt);
  });
  loadSystemClosing();
}

function loadSystemClosing() {
  const id = document.getElementById('systemClosingSelect')?.value;
  const r  = getData().dailyClosings.find(x => x.id === id);
  if (!r) return;
  document.getElementById('systemBranchName').value  = branchName(r.branchId);
  document.getElementById('systemClosingDate').value = r.date;
  const box = document.getElementById('systemInputs');
  box.innerHTML = '';
  methodsForBranch(r.branchId).forEach(m => {
    const row = document.createElement('div'); row.className = 'row align-items-center mb-2';
    const lbl = document.createElement('label'); lbl.className = 'col-5 form-label mb-0'; lbl.textContent = m.label;
    const col = document.createElement('div');   col.className = 'col-7';
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.max = '9999999';
    inp.value = r.system?.[m.id] || 0; inp.className = 'form-control'; inp.id = `system_${m.id}`;
    inp.addEventListener('input', updateLiveTotals);
    col.appendChild(inp); row.appendChild(lbl); row.appendChild(col); box.appendChild(row);
  });
  const hr = document.createElement('hr'); box.appendChild(hr);
  const total = document.createElement('div'); total.className = 'd-flex justify-content-between fw-bold';
  total.innerHTML = '<span>الإجمالي</span><span id="system_total">0.00</span>';
  box.appendChild(total); updateLiveTotals();
}

/* ════════════════════════════════════════════════
   EDIT CLOSING PANEL
   ════════════════════════════════════════════════ */

function openEditClosingPanel(id) {
  const p = document.getElementById('editClosingPanel');
  const r = getData().dailyClosings.find(x => x.id === id);
  if (!p || !r) return;
  p.classList.remove('d-none'); p.innerHTML = '';

  const header = document.createElement('div'); header.className = 'd-flex justify-content-between mb-3';
  header.innerHTML = `<div><h5 class="fw-bold mb-1">تعديل الإغلاق</h5><div class="text-muted small">${esc(branchName(r.branchId))} - ${esc(r.date)}</div></div>`;
  const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn btn-outline-secondary'; cancelBtn.textContent = 'إلغاء'; cancelBtn.onclick = closeEditClosingPanel;
  header.appendChild(cancelBtn); p.appendChild(header);

  const fields = document.createElement('div'); fields.className = 'row g-3 mb-3';
  fields.innerHTML = `
    <div class="col-md-3"><label class="form-label">التاريخ</label><input type="date" id="editClosingDate" class="form-control" value="${esc(r.date||'')}"></div>
    <div class="col-md-3"><label class="form-label">عدد السيارات</label><input type="number" id="editCarsCount" class="form-control" value="${Number(r.carsCount||0)}" min="0" max="9999"></div>
    <div class="col-md-6"><label class="form-label">ملاحظات</label><input id="editClosingNotes" class="form-control" maxlength="500" value="${esc(r.notes||'')}"></div>`;
  p.appendChild(fields);

  const cols = document.createElement('div'); cols.className = 'row g-3';
  ['actual', 'system'].forEach(prefix => {
    const col = document.createElement('div'); col.className = 'col-xl-6';
    const box = document.createElement('div'); box.className = 'border rounded p-3';
    const title = document.createElement('h6'); title.className = 'fw-bold';
    title.textContent = prefix === 'actual' ? 'الإيراد الفعلي' : 'مبيعات النظام';
    box.appendChild(title);
    methodsForBranch(r.branchId).forEach(m => {
      const row  = document.createElement('div'); row.className = 'row align-items-center mb-2';
      const lbl  = document.createElement('label'); lbl.className = 'col-5'; lbl.textContent = m.label;
      const col2 = document.createElement('div'); col2.className = 'col-7';
      const inp  = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = '9999999';
      inp.className = `form-control edit-${prefix}`; inp.dataset.method = m.id;
      inp.value = Number(r[prefix]?.[m.id] || 0);
      inp.addEventListener('input', updateEditClosingTotals);
      col2.appendChild(inp); row.appendChild(lbl); row.appendChild(col2); box.appendChild(row);
    });
    col.appendChild(box); cols.appendChild(col);
  });
  p.appendChild(cols);

  const diffAlert = document.createElement('div'); diffAlert.className = 'alert alert-light border mt-3 d-flex justify-content-between';
  diffAlert.innerHTML = '<span>الفرق بعد التعديل</span><b id="editDiffTotal">0.00</b>';
  p.appendChild(diffAlert);

  const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-success mt-2'; saveBtn.textContent = 'حفظ التعديل'; saveBtn.onclick = () => saveEditClosing(id);
  p.appendChild(saveBtn);

  updateEditClosingTotals();
  p.scrollIntoView({ behavior: 'smooth' });
}

function updateEditClosingTotals() {
  const a   = [...document.querySelectorAll('.edit-actual')].reduce((s, i) => s + Number(i.value || 0), 0);
  const sys = [...document.querySelectorAll('.edit-system')].reduce((s, i) => s + Number(i.value || 0), 0);
  const el  = document.getElementById('editDiffTotal');
  if (el) { el.textContent = money(a - sys); el.className = a - sys < 0 ? 'text-danger' : 'text-success'; }
}

async function saveEditClosing(id) {
  const d = getData(), r = d.dailyClosings.find(x => x.id === id);
  if (!r) return;
  r.actual = r.actual || {}; r.system = r.system || {};
  document.querySelectorAll('.edit-actual').forEach(i => r.actual[i.dataset.method] = Number(i.value || 0));
  document.querySelectorAll('.edit-system').forEach(i => r.system[i.dataset.method] = Number(i.value || 0));
  r.date     = document.getElementById('editClosingDate')?.value || r.date;
  r.carsCount= Number(document.getElementById('editCarsCount')?.value || 0);
  r.notes    = (document.getElementById('editClosingNotes')?.value || '').slice(0, 500);
  updateClosingStatus(r);
  try {
    if (sb && currentUser) { await updateFullClosingInSupabase(r); await logAudit('update', 'daily_closing', id, null, r, r.branchId); await loadDailyClosingsFromSupabase(); }
    else { setData(d); }
    closeEditClosingPanel(); renderAll(); showToast('تم حفظ تعديل الإغلاق', 'success');
  } catch (err) { notifyError('تعذر حفظ تعديل الإغلاق:', err); }
}

function closeEditClosingPanel() {
  const p = document.getElementById('editClosingPanel');
  if (p) { p.classList.add('d-none'); p.innerHTML = ''; }
}

/* ════════════════════════════════════════════════
   DASHBOARD CHARTS & STATS
   ════════════════════════════════════════════════ */

function renderExecutiveDashboard() {
  try {
    const data = getData(), closings = data.dailyClosings || [], expenses = data.monthlyExpenses || [];
    const totalRevenue  = closings.reduce((s, r) => s + sumPayments(r.actual), 0);
    const totalCars     = closings.reduce((s, r) => s + Number(r.carsCount || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + expenseTotal(e), 0);
    const netProfit     = totalRevenue - totalExpenses;

    safeSetText('kpiTotalRevenue', money(totalRevenue));
    safeSetText('kpiNetProfit',    money(netProfit));
    safeSetText('kpiCarsCount',    enNum(totalCars));

    const branchStats = {};
    visibleBranches().forEach(b => branchStats[b.id] = { name: b.name, total: 0 });
    closings.forEach(r => { if (branchStats[r.branchId]) branchStats[r.branchId].total += sumPayments(r.actual); });
    const ranked = Object.values(branchStats).sort((a, b) => b.total - a.total);
    safeSetText('kpiBestBranch', ranked[0]?.name || '-');

    // Ranking container
    const rc = document.getElementById('branchesRankingContainer');
    if (rc) {
      rc.innerHTML = '';
      if (ranked.length) {
        ranked.forEach((b, i) => {
          const div = document.createElement('div'); div.className = 'ranking-item mb-3';
          const pct = ranked[0]?.total ? ((b.total / ranked[0].total) * 100) : 0;
          div.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-1"><div class="fw-bold">#${i+1} ${esc(b.name)}</div><div class="text-primary fw-bold">${money(b.total)}</div></div><div class="progress executive-progress"><div class="progress-bar" style="width:${pct}%"></div></div>`;
          rc.appendChild(div);
        });
      } else { rc.innerHTML = '<div class="text-muted text-center py-5">لا توجد بيانات فروع</div>'; }
    }

    // Alerts
    const alerts = [];
    closings.forEach(r => {
      const diff = Math.abs(sumPayments(r.actual) - sumPayments(r.system));
      if (sumPayments(r.system) > 0 && diff > 100) alerts.push({ type: 'danger',  text: `يوجد فرق مرتفع في فرع ${branchName(r.branchId)} بقيمة ${money(diff)}` });
      if (r.status === 'rejected')                   alerts.push({ type: 'warning', text: `إغلاق مرفوض بانتظار المعالجة في ${branchName(r.branchId)}` });
    });
    const ac = document.getElementById('executiveAlertsContainer');
    if (ac) {
      ac.innerHTML = '';
      if (alerts.length) {
        alerts.forEach(a => { const el = document.createElement('div'); el.className = `alert alert-${a.type} py-2 mb-2`; el.textContent = a.text; ac.appendChild(el); });
      } else { ac.innerHTML = '<div class="text-muted text-center py-5">لا توجد تنبيهات حرجة</div>'; }
    }

    renderExecutiveCharts(ranked);
  } catch (e) { console.warn('Executive dashboard render failed', e); }
}

function renderExecutiveCharts(ranked) {
  if (typeof Chart === 'undefined') return;
  const ex = document.getElementById('executiveRevenueChart');
  if (ex) {
    destroyChart('executiveRevenue');
    charts.executiveRevenue = new Chart(ex, { type: 'bar', data: { labels: ranked.map(x => x.name), datasets: [{ label: 'الإيرادات', data: ranked.map(x => x.total) }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
  }
  const pm = document.getElementById('paymentMethodsChart');
  if (pm) {
    const totals = getPaymentMethods().map(m => ({ name: m.label, total: getData().dailyClosings.reduce((s, r) => s + Number(r.actual?.[m.id] || 0), 0) })).filter(x => x.total > 0);
    destroyChart('paymentMethods');
    charts.paymentMethods = new Chart(pm, { type: 'doughnut', data: { labels: totals.map(x => x.name), datasets: [{ data: totals.map(x => x.total) }] }, options: { responsive: true } });
  }
}

function renderDashboard() {
  const m = document.getElementById('dashboardMonth')?.value || thisMonth();
  const b = document.getElementById('dashboardBranch')?.value || 'all';
  const rows = getMonthlyRecords(m, b), exps = getMonthlyExpenses(m, b);
  const income   = rows.reduce((s, r) => s + sumPayments(r.actual), 0);
  const cost     = costOfSales(m, b);
  const gross    = income - cost;
  const expenses = exps.reduce((s, e) => s + expenseTotal(e), 0);
  const profit   = gross - expenses;
  const margin   = income ? profit / income * 100 : 0;
  const cars     = rows.reduce((s, r) => s + Number(r.carsCount || 0), 0);
  const avg      = cars ? income / cars : 0;

  document.getElementById('statsCards').innerHTML =
    stat('TOTAL INCOME',   moneyCompact(income),    'bi-wallet2') +
    stat('تكلفة المبيعات', moneyCompact(cost),      'bi-box') +
    stat('الربح الإجمالي', moneyCompact(gross),     'bi-graph-up') +
    stat('TOTAL EXPENSES', moneyCompact(expenses),  'bi-cash-stack') +
    stat('صافي الربح',     moneyCompact(profit),    'bi-graph-up-arrow') +
    stat('متوسط السيارة',  moneyCompact(avg),       'bi-car-front');

  safeSetText('savingsRateBox', margin.toFixed(2) + '%');
  renderIncomeExpenseChart(income, cost, expenses, profit);
  renderIncomeSummaryTable(rows, income);
  renderExpenseSummaryTable(exps, expenses);
  renderExecutiveDashboard();
}

function renderIncomeExpenseChart(income, cost, expenses, profit) {
  const c = document.getElementById('incomeExpenseChart');
  if (!c || typeof Chart === 'undefined') return;
  destroyChart('incomeExpense');
  charts.incomeExpense = new Chart(c, { type: 'bar', data: { labels: ['الدخل','تكلفة المبيعات','المصروفات','الصافي'], datasets: [{ label: 'المبلغ', data: [income, cost, expenses, profit] }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
}

function _buildSummaryTable(tbId, rows) {
  const tb = document.getElementById(tbId);
  if (!tb) return;
  tb.innerHTML = '';
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="3" class="text-center text-muted">لا توجد بيانات</td></tr>'; return; }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  rows.forEach(r => {
    const tr = document.createElement('tr');
    [r.name, money(r.amount), (total ? (r.amount / total * 100).toFixed(0) : 0) + '%'].forEach(v => {
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

function activityRows(month, b = 'all') {
  const ds = getDistributions(month, b);
  return getActivities().map(a => ({ name: a.label, amount: ds.reduce((s, d) => s + activityIncomeValue(d.items?.[a.id]), 0) })).filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount);
}

function renderIncomeSummaryTable(rows, total) {
  const m  = document.getElementById('dashboardMonth')?.value || thisMonth();
  const b  = document.getElementById('dashboardBranch')?.value || 'all';
  let ar   = activityRows(m, b);
  if (!ar.length) ar = visibleBranches().map(x => ({ name: x.name, amount: rows.filter(r => r.branchId === x.id).reduce((s, r) => s + sumPayments(r.actual), 0) })).filter(x => x.amount > 0);
  _buildSummaryTable('incomeSummaryTable', ar);
}

function renderExpenseSummaryTable(exps) {
  const rows = getExpenseItems().map(i => ({ name: i.label, amount: exps.reduce((s, e) => s + Number(e.items?.[i.id] || 0), 0) })).filter(x => x.amount > 0);
  _buildSummaryTable('expenseSummaryTable', rows);
}

/* ════════════════════════════════════════════════
   BRANCH ANALYTICS
   ════════════════════════════════════════════════ */

function renderBranchAnalytics() {
  const month = document.getElementById('branchAnalyticsMonth')?.value || thisMonth();
  const stats = visibleBranches().map(b => {
    const rows     = getMonthlyRecords(month, b.id);
    const income   = rows.reduce((s, r) => s + sumPayments(r.actual), 0);
    const cost     = costOfSales(month, b.id);
    const expenses = getMonthlyExpenses(month, b.id).reduce((s, e) => s + expenseTotal(e), 0);
    const profit   = income - cost - expenses;
    const cars     = rows.reduce((s, r) => s + Number(r.carsCount || 0), 0);
    return { id: b.id, name: b.name, income, cost, expenses, profit, cars, avg: cars ? income / cars : 0, margin: income ? profit / income * 100 : 0 };
  }).sort((a, b) => b.income - a.income);

  const totalIncome  = stats.reduce((s, b) => s + b.income, 0);
  const totalProfit  = stats.reduce((s, b) => s + b.profit, 0);
  const totalCars    = stats.reduce((s, b) => s + b.cars,   0);
  document.getElementById('branchAnalyticsCards').innerHTML =
    stat('إجمالي الإيرادات', moneyCompact(totalIncome),  'bi-wallet2') +
    stat('إجمالي الأرباح',   moneyCompact(totalProfit),  'bi-graph-up-arrow') +
    stat('عدد السيارات',     enNum(totalCars),           'bi-car-front') +
    stat('أفضل فرع',         stats[0]?.name || '-',      'bi-trophy');

  const table = document.getElementById('branchAnalyticsTable');
  table.innerHTML = '';
  if (!stats.length) { table.innerHTML = '<tr><td colspan="8" class="text-center text-muted">لا توجد بيانات</td></tr>'; }
  else stats.forEach(b => {
    const tr = document.createElement('tr');
    [b.name, money(b.income), money(b.cost), money(b.expenses), money(b.profit), enNum(b.cars), money(b.avg), b.margin.toFixed(1)+'%'].forEach((v, i) => {
      const td = document.createElement('td');
      if (i === 0) td.className = 'fw-bold';
      if (i === 4) td.className = 'fw-bold ' + (b.profit < 0 ? 'text-danger' : 'text-success');
      td.textContent = v; tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  const rank = document.getElementById('branchRankingAnalytics');
  rank.innerHTML = '';
  if (!stats.length) { rank.innerHTML = '<div class="text-center text-muted py-5">لا توجد بيانات</div>'; }
  else stats.forEach((b, i) => {
    const div = document.createElement('div'); div.className = 'ranking-item mb-3';
    const pct = stats[0]?.income ? ((b.income / stats[0].income) * 100) : 0;
    div.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-1"><div class="fw-bold">#${i+1} ${esc(b.name)}</div><div class="text-primary fw-bold">${moneyCompact(b.income)}</div></div><div class="progress executive-progress"><div class="progress-bar" style="width:${pct}%"></div></div>`;
    rank.appendChild(div);
  });

  const chart = document.getElementById('branchAnalyticsChart');
  if (chart && typeof Chart !== 'undefined') {
    destroyChart('branchAnalytics');
    charts.branchAnalytics = new Chart(chart, { type: 'bar', data: { labels: stats.map(b => b.name), datasets: [{ label: 'الإيرادات', data: stats.map(b => b.income) }, { label: 'صافي الربح', data: stats.map(b => b.profit) }] }, options: { responsive: true, plugins: { legend: { position: 'bottom' } } } });
  }
}

/* ════════════════════════════════════════════════
   YEARLY DASHBOARD
   ════════════════════════════════════════════════ */

function renderYearlyDashboard() {
  const y      = document.getElementById('yearlyYear')?.value || new Date().getFullYear();
  const b      = document.getElementById('yearlyBranch')?.value || 'all';
  const months = yearlyMonthStats(y, b);
  const income   = months.reduce((s, m) => s + m.income, 0);
  const cost     = months.reduce((s, m) => s + m.cost, 0);
  const expenses = months.reduce((s, m) => s + m.expenses, 0);
  const profit   = income - cost - expenses;
  const margin   = income ? profit / income * 100 : 0;

  document.getElementById('yearlyStatsCards').innerHTML =
    stat('دخل السنة',    moneyCompact(income),            'bi-wallet2') +
    stat('تكلفة المبيعات', moneyCompact(cost),            'bi-box') +
    stat('مصروفات السنة', moneyCompact(expenses),         'bi-cash-stack') +
    stat('صافي السنة',   moneyCompact(profit),            'bi-graph-up-arrow') +
    stat('هامش الربح',   margin.toFixed(2) + '%',         'bi-percent');

  const tbody = document.getElementById('yearlyTable');
  tbody.innerHTML = '';
  months.forEach(m => {
    const tr = document.createElement('tr');
    [m.month, money(m.income), money(m.cost), money(m.expenses), money(m.profit), m.margin.toFixed(2)+'%'].forEach((v, i) => {
      const td = document.createElement('td');
      if (i === 4) td.className = 'fw-bold ' + (m.profit < 0 ? 'text-danger' : 'text-success');
      td.textContent = v; tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/* ════════════════════════════════════════════════
   PAYMENT METHODS ANALYSIS
   ════════════════════════════════════════════════ */

function renderPaymentMethodsAnalysis() {
  const fromDate = document.getElementById('paymentAnalysisFromDate')?.value;
  const toDate   = document.getElementById('paymentAnalysisToDate')?.value;
  const branchId = document.getElementById('paymentAnalysisBranch')?.value || 'all';

  if (!fromDate || !toDate) return;
  if (fromDate > toDate) { showToast('تاريخ البداية يجب أن يكون قبل تاريخ النهاية', 'error'); return; }

  const data = getPaymentMethodsAnalysis(fromDate, toDate, branchId);
  const total = data.reduce((s, m) => s + m.total, 0);

  // Stat cards
  const topMethod = data[0];
  document.getElementById('paymentAnalysisStats').innerHTML =
    stat('إجمالي الإيرادات', moneyCompact(total), 'bi-wallet2') +
    stat('عدد طرق الدفع المستخدمة', enNum(data.length), 'bi-credit-card') +
    stat('أعلى طريقة', topMethod ? topMethod.label : '-', 'bi-award') +
    stat('إجمالي العمليات', enNum(data.reduce((s, m) => s + m.count, 0)), 'bi-list-check');

  // Chart
  const chartEl = document.getElementById('paymentMethodsAnalysisChart');
  if (chartEl && typeof Chart !== 'undefined') {
    destroyChart('paymentMethodsAnalysis');
    const chartData = data.map(m => ({ name: m.label, value: m.total }));
    charts.paymentMethodsAnalysis = new Chart(chartEl, {
      type: 'doughnut',
      data: {
        labels: chartData.map(x => x.name),
        datasets: [{
          data: chartData.map(x => x.value),
          backgroundColor: ['#ff7a1a', '#0078b8', '#16a34a', '#7c3aed', '#f59e0b', '#dc2626'],
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // Top methods ranking
  const rankEl = document.getElementById('topPaymentMethodsContainer');
  if (rankEl) {
    rankEl.innerHTML = '';
    if (!data.length) {
      rankEl.innerHTML = '<div class="text-center text-muted py-5">لا توجد بيانات</div>';
    } else {
      data.slice(0, 5).forEach((m, i) => {
        const div = document.createElement('div');
        div.className = 'ranking-item mb-3';
        const pct = total ? (m.total / total) * 100 : 0;
        div.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-1"><div class="fw-bold">#${i+1} ${esc(m.label)}</div><div class="text-primary fw-bold">${money(m.total)}</div></div><div class="progress executive-progress"><div class="progress-bar" style="width:${pct}%"></div></div>`;
        rankEl.appendChild(div);
      });
    }
  }

  // Table
  const tb = document.getElementById('paymentMethodsAnalysisTable');
  if (tb) {
    tb.innerHTML = '';
    if (!data.length) {
      tb.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا توجد بيانات</td></tr>';
    } else {
      data.forEach(m => {
        const tr = document.createElement('tr');
        const pctStr = m.percentage.toFixed(1);
        [esc(m.label), money(m.total), pctStr + '%', enNum(m.count), money(m.average)].forEach((v, i) => {
          const td = document.createElement('td');
          if (i === 1) td.className = 'fw-bold text-primary';
          td.textContent = v;
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
    }
  }
}

/* ════════════════════════════════════════════════
   RENDER SELECTS FOR PAYMENT ANALYSIS
   ════════════════════════════════════════════════ */

function renderPaymentAnalysisSelects() {
  const branches = visibleBranches();
  const sel = document.getElementById('paymentAnalysisBranch');
  if (!sel) return;
  sel.innerHTML = '<option value="all">كل الفروع</option>';
  branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
}


function renderDifferencesPage() {
  const m    = document.getElementById('diffMonth')?.value  || thisMonth();
  const b    = document.getElementById('diffBranch')?.value || 'all';
  const rows = differenceRecords(m, b);
  const pos  = rows.filter(r => r.difference > 0).reduce((s, r) => s + r.difference, 0);
  const neg  = Math.abs(rows.filter(r => r.difference < 0).reduce((s, r) => s + r.difference, 0));
  const net  = pos - neg;

  document.getElementById('differenceStats').innerHTML =
    stat('إجمالي الزيادة', moneyCompact(pos), 'bi-arrow-up-circle',   true) +
    stat('إجمالي النقص',   moneyCompact(neg), 'bi-arrow-down-circle', true) +
    stat('صافي الفروقات',  moneyCompact(net), 'bi-calculator',        true);

  const tb = document.getElementById('differencesTable');
  tb.innerHTML = '';
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="text-center text-muted">لا توجد فروقات</td></tr>'; return; }
  rows.slice().reverse().forEach(r => {
    const tr = document.createElement('tr');
    [r.date, branchName(r.branchId), money(r.actualTotal), money(r.systemTotal), money(r.difference), r.difference > 0 ? 'زيادة' : 'نقص'].forEach((v, i) => {
      const td = document.createElement('td');
      if (i === 4) td.className = 'fw-bold ' + (r.difference < 0 ? 'text-danger' : 'text-success');
      td.textContent = v; tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

/* ════════════════════════════════════════════════
   EXPENSES PAGE
   ════════════════════════════════════════════════ */

function renderExpenseInputs() {
  const box = document.getElementById('monthlyExpenseInputs');
  if (!box) return;
  box.innerHTML = '';
  getExpenseItems().forEach(i => {
    const div = document.createElement('div'); div.className = 'mb-2';
    const lbl = document.createElement('label'); lbl.className = 'form-label'; lbl.textContent = i.label;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.id = `exp_${i.id}`; inp.className = 'form-control'; inp.value = '0'; inp.min = '0'; inp.max = '99999999';
    div.appendChild(lbl); div.appendChild(inp); box.appendChild(div);
  });
}

function renderProfitTable() {
  const tb = document.getElementById('profitTable');
  if (!tb) return;
  tb.innerHTML = '';
  getData().monthlyExpenses
    .filter(e => e.branchId === 'all' || visibleBranches().some(b => b.id === e.branchId))
    .forEach(e => {
      const global   = e.branchId === 'all';
      const sales    = global ? 0 : monthlyIncomeForBranch(e.branchId, e.month);
      const expenses = expenseTotal(e);
      const cost     = global ? 0 : costOfSales(e.month, e.branchId);
      const profit   = sales - cost - expenses;
      const tr       = document.createElement('tr');

      [e.month, branchName(e.branchId), global?'-':money(sales), money(expenses), global?'-':money(profit)].forEach((v, i) => {
        const td = document.createElement('td');
        if (i === 4 && !global) td.className = profit < 0 ? 'text-danger fw-bold' : 'text-success fw-bold';
        td.textContent = v; tr.appendChild(td);
      });

      const attTd = document.createElement('td');
      if (e.attachmentUrl) {
        const a = document.createElement('a'); a.className = 'btn btn-sm btn-outline-primary'; a.href = e.attachmentUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'عرض'; attTd.appendChild(a);
      } else { attTd.textContent = '-'; }
      tr.appendChild(attTd);

      const actTd  = document.createElement('td');
      const eBtn   = document.createElement('button'); eBtn.className  = 'btn btn-sm btn-outline-primary me-1'; eBtn.textContent = 'تعديل'; eBtn.onclick  = () => editMonthlyExpense(e.month, e.branchId);
      const dBtn   = document.createElement('button'); dBtn.className  = 'btn btn-sm btn-outline-danger';       dBtn.textContent = 'حذف';   dBtn.onclick  = () => deleteMonthlyExpense(e.month, e.branchId);
      actTd.appendChild(eBtn); actTd.appendChild(dBtn); tr.appendChild(actTd); tb.appendChild(tr);
    });
}

function editMonthlyExpense(month, branchId) {
  const e = getData().monthlyExpenses.find(x => x.month === month && x.branchId === branchId);
  if (!e) return;
  document.getElementById('expenseMonth').value  = e.month;
  document.getElementById('expenseBranch').value = e.branchId;
  renderExpenseInputs();
  getExpenseItems().forEach(i => { const el = document.getElementById(`exp_${i.id}`); if (el) el.value = Number(e.items?.[i.id] || 0); });
  showSection('expenses');
}

/* ════════════════════════════════════════════════
   INCOME DISTRIBUTION PAGE
   ════════════════════════════════════════════════ */

function renderIncomeDistributionPage() {
  const month    = document.getElementById('incomeDistMonth')?.value  || thisMonth();
  const bid      = document.getElementById('incomeDistBranch')?.value || visibleBranches()[0]?.id;
  const existing = getData().incomeDistributions.find(d => d.month === month && d.branchId === bid);
  const box      = document.getElementById('incomeActivityInputs');
  safeSetText('incomeDistClosingTotal', money(monthlyIncomeForBranch(bid, month)));
  if (!box) return;
  box.innerHTML = '';
  getActivities().forEach(a => {
    const val = existing?.items?.[a.id] || { income: 0, cost: 0 };
    const div = document.createElement('div'); div.className = 'mb-3 p-2 border rounded';
    const lbl = document.createElement('label'); lbl.className = 'form-label fw-bold'; lbl.textContent = a.label;
    const row = document.createElement('div'); row.className = 'row g-2';
    [['income', activityIncomeValue(val), 'الدخل'], ['cost', activityCostValue(val), 'التكلفة']].forEach(([type, val2, labelText]) => {
      const col  = document.createElement('div'); col.className = 'col-6';
      const sm   = document.createElement('small'); sm.textContent = labelText;
      const inp  = document.createElement('input');
      inp.type = 'number'; inp.className = 'form-control'; inp.min = '0'; inp.max = '99999999';
      inp.id = `act_${type}_${a.id}`; inp.value = val2;
      inp.addEventListener('input', updateIncomeDistributionCheck);
      col.appendChild(sm); col.appendChild(inp); row.appendChild(col);
    });
    div.appendChild(lbl); div.appendChild(row); box.appendChild(div);
  });
  updateIncomeDistributionCheck();
  renderIncomeDistributionTable();
}

function updateIncomeDistributionCheck() {
  const month = document.getElementById('incomeDistMonth')?.value || thisMonth();
  const bid   = document.getElementById('incomeDistBranch')?.value;
  const box   = document.getElementById('incomeDistCheckBox');
  if (!box || !bid) return;
  const dist   = { items: collectActivityDistribution() };
  const income = distributionIncomeTotal(dist), cost = distributionCostTotal(dist);
  const diff   = income - monthlyIncomeForBranch(bid, month);
  box.className   = Math.abs(diff) < 0.01 ? 'alert alert-success mt-3' : 'alert alert-warning mt-3';
  box.textContent = `إجمالي التوزيع ${money(income)} | التكلفة ${money(cost)} | الفرق ${money(diff)}`;
}

function renderIncomeDistributionTable() {
  const tb   = document.getElementById('incomeDistributionTable');
  if (!tb) return;
  tb.innerHTML = '';
  const rows = getData().incomeDistributions.filter(d => visibleBranches().some(b => b.id === d.branchId));
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="text-center text-muted">لا توجد بيانات</td></tr>'; return; }
  rows.slice().reverse().forEach(d => {
    const inc = distributionIncomeTotal(d), cost = distributionCostTotal(d), gross = inc - cost;
    const tr  = document.createElement('tr');
    [d.month, branchName(d.branchId), money(inc), money(cost), money(gross)].forEach(v => {
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });
    const attTd = document.createElement('td');
    if (d.attachmentUrl) {
      const a = document.createElement('a'); a.className = 'btn btn-sm btn-outline-primary'; a.href = d.attachmentUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'عرض'; attTd.appendChild(a);
    } else { attTd.textContent = '-'; }
    tr.appendChild(attTd);
    const actTd = document.createElement('td');
    const eBtn  = document.createElement('button'); eBtn.className = 'btn btn-sm btn-outline-primary me-1'; eBtn.textContent = 'تعديل'; eBtn.onclick = () => editIncomeDistribution(d.month, d.branchId);
    const dBtn  = document.createElement('button'); dBtn.className = 'btn btn-sm btn-outline-danger';       dBtn.textContent = 'حذف';   dBtn.onclick = () => deleteIncomeDistribution(d.month, d.branchId);
    actTd.appendChild(eBtn); actTd.appendChild(dBtn); tr.appendChild(actTd); tb.appendChild(tr);
  });
}

function editIncomeDistribution(month, branchId) {
  const d = getData().incomeDistributions.find(x => x.month === month && x.branchId === branchId);
  if (!d) return;
  document.getElementById('incomeDistMonth').value  = d.month;
  document.getElementById('incomeDistBranch').value = d.branchId;
  renderIncomeDistributionPage();
  getActivities().forEach(a => {
    const val  = d.items?.[a.id] || { income: 0, cost: 0 };
    const inc  = document.getElementById(`act_income_${a.id}`);
    const cost = document.getElementById(`act_cost_${a.id}`);
    if (inc)  inc.value  = activityIncomeValue(val);
    if (cost) cost.value = activityCostValue(val);
  });
  updateIncomeDistributionCheck();
  showSection('incomeDistribution');
}

/* ════════════════════════════════════════════════
   SETTINGS
   ════════════════════════════════════════════════ */

function renderSettings() {
  const pm  = document.getElementById('paymentMethodsTable');
  const exp = document.getElementById('expenseItemsTable');
  const act = document.getElementById('activitiesTable');

  if (pm) {
    pm.innerHTML = '';
    getPaymentMethods().forEach(m => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'); td1.textContent = m.label;
      const td2 = document.createElement('td');
      const btn = document.createElement('button'); btn.className = 'btn btn-sm btn-outline-danger'; btn.textContent = 'حذف'; btn.onclick = () => deletePaymentMethod(m.id);
      td2.appendChild(btn); tr.appendChild(td1); tr.appendChild(td2); pm.appendChild(tr);
    });
  }

  const buildItemsTable = (container, items, updateFn, deleteFn, prefix) => {
    if (!container) return;
    container.innerHTML = '';
    items.forEach(i => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const inp = document.createElement('input'); inp.className = 'form-control form-control-sm'; inp.id = `${prefix}_label_${i.id}`; inp.value = i.label; inp.maxLength = 60;
      td1.appendChild(inp);
      const td2   = document.createElement('td');
      const eBtn  = document.createElement('button'); eBtn.className = 'btn btn-sm btn-outline-primary me-1'; eBtn.textContent = 'تعديل'; eBtn.onclick = () => updateFn(i.id);
      const dBtn  = document.createElement('button'); dBtn.className = 'btn btn-sm btn-outline-danger';       dBtn.textContent = 'حذف';   dBtn.onclick = () => deleteFn(i.id);
      td2.appendChild(eBtn); td2.appendChild(dBtn); tr.appendChild(td1); tr.appendChild(td2); container.appendChild(tr);
    });
  };

  buildItemsTable(exp, getExpenseItems(), updateExpenseItem, deleteExpenseItem, 'expense');
  buildItemsTable(act, getActivities(),   updateActivity,    deleteActivity,    'activity');
}

/* ════════════════════════════════════════════════
   BRANCHES & USERS
   ════════════════════════════════════════════════ */

function renderBranches() {
  const tb = document.getElementById('branchesTable');
  if (!tb) return;
  tb.innerHTML = '';
  getData().branches.forEach(b => {
    const tr = document.createElement('tr');
    [b.name, b.city || '-'].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    const td  = document.createElement('td');
    const btn = document.createElement('button'); btn.className = 'btn btn-sm btn-outline-danger'; btn.textContent = 'حذف'; btn.onclick = () => deleteBranch(b.id);
    td.appendChild(btn); tr.appendChild(td); tb.appendChild(tr);
  });
}

function editUserProfile(id) {
  const u = (getData().users || []).find(x => x.id === id);
  if (!u) return;
  document.getElementById('profileUserId').value    = u.id;
  document.getElementById('userName').value         = u.name;
  document.getElementById('userRole').value         = u.role;
  document.getElementById('userBranch').value       = u.rawBranchId || u.branchId || 'all';
  document.getElementById('userAllBranches').checked = !!u.allBranches || u.branchId === 'all';
}

function renderUsers() {
  const tb = document.getElementById('usersTable');
  if (!tb) return;
  tb.innerHTML = '';
  const users = getData().users || [];
  if (!users.length) { tb.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا يوجد مستخدمون</td></tr>'; return; }
  users.forEach(u => {
    const tr = document.createElement('tr');
    [u.name, roleNames[u.role]||u.role, u.allBranches||u.branchId==='all'?'كل الفروع':branchName(u.rawBranchId||u.branchId), u.allBranches||u.branchId==='all'?'نعم':'لا'].forEach(v => {
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });
    const td   = document.createElement('td');
    const eBtn = document.createElement('button'); eBtn.className = 'btn btn-sm btn-outline-primary me-1'; eBtn.textContent = 'تعديل'; eBtn.onclick = () => editUserProfile(u.id);
    const dBtn = document.createElement('button'); dBtn.className = 'btn btn-sm btn-outline-danger';       dBtn.textContent = 'حذف';   dBtn.onclick = () => deleteUser(u.id);
    td.appendChild(eBtn); td.appendChild(dBtn); tr.appendChild(td); tb.appendChild(tr);
  });
}

/* ════════════════════════════════════════════════
   AUDIT LOGS
   ════════════════════════════════════════════════ */

async function renderAuditLogs() {
  const tb = document.getElementById('auditTable');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="6" class="text-center"><div class="section-loading"><div class="spinner-border" role="status"></div> جاري التحميل...</div></td></tr>';
  try {
    const rows = await loadAuditLogsFromSupabase();
    tb.innerHTML = '';
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="text-center text-muted">لا توجد عمليات مسجلة</td></tr>'; return; }
    rows.forEach(r => {
      const tr = document.createElement('tr');
      [new Date(r.created_at).toLocaleString('en-US'), r.user_name || '-'].forEach(v => {
        const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
      });
      const actionTd = document.createElement('td'); actionTd.innerHTML = `<span class="badge badge-soft-dark">${esc(r.action)}</span>`; tr.appendChild(actionTd);
      [r.entity_type, r.branch_id ? branchName(r.branch_id) : '-'].forEach(v => {
        const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
      });
      const detailTd  = document.createElement('td');
      const details   = document.createElement('details');
      const summary   = document.createElement('summary'); summary.className = 'btn btn-sm btn-outline-secondary'; summary.textContent = 'عرض';
      const pre       = document.createElement('pre');
      pre.className   = 'small bg-light p-2 mt-2 rounded'; pre.style.cssText = 'direction:ltr;text-align:left;white-space:pre-wrap';
      pre.textContent = JSON.stringify({ old: r.old_data, new: r.new_data }, null, 2);
      details.appendChild(summary); details.appendChild(pre); detailTd.appendChild(details); tr.appendChild(detailTd); tb.appendChild(tr);
    });
  } catch (err) {
    tb.innerHTML = '';
    const tr = document.createElement('tr'); const td = document.createElement('td');
    td.colSpan = 6; td.className = 'text-danger text-center'; td.textContent = formatError(err);
    tr.appendChild(td); tb.appendChild(tr);
  }
}

/* ════════════════════════════════════════════════
   PDF & REPORTS
   ════════════════════════════════════════════════ */

function showReport(id)       { const r = getData().dailyClosings.find(x => x.id === id); renderReport(r); showSection('pdf'); }
function previewCurrentReport() {
  const t = { serial: 'معاينة', date: document.getElementById('dailyDate').value, branchId: document.getElementById('dailyBranch').value, carsCount: Number(document.getElementById('carsCount').value||0), actual: collectPayments('actual'), system: emptyPayments(), notes: document.getElementById('dailyNotes').value, createdBy: currentUser.name };
  renderReport(t); showSection('pdf');
}

function renderReport(r) {
  if (!r) return;
  const a = sumPayments(r.actual), s = sumPayments(r.system), diff = a - s;
  const container = document.getElementById('pdfReport');
  container.innerHTML = '';

  const header = document.createElement('div'); header.className = 'd-flex justify-content-between align-items-center mb-3';
  header.innerHTML = `<div><h2 class="fw-bold">تقرير الإغلاق اليومي</h2><div class="text-muted">${esc(r.serial||'')}</div></div><img src="logo.png" style="width:120px;height:70px;object-fit:contain">`;
  container.appendChild(header);

  const infoRow = document.createElement('div'); infoRow.className = 'row g-3 mb-3';
  infoRow.innerHTML = `<div class="col-6"><div class="report-box"><b>الفرع:</b> ${esc(branchName(r.branchId))}<br><b>التاريخ:</b> ${esc(r.date)}</div></div><div class="col-6"><div class="report-box"><b>المسؤول:</b> ${esc(r.createdBy||'-')}<br><b>عدد السيارات:</b> ${Number(r.carsCount||0)}</div></div>`;
  container.appendChild(infoRow);

  const table = document.createElement('table'); table.className = 'table table-bordered';
  table.innerHTML = '<thead><tr><th>طريقة الدفع</th><th>الفعلي</th><th>النظام</th><th>الفرق</th></tr></thead>';
  const tbody = document.createElement('tbody');
  getPaymentMethods().forEach(m => {
    const tr = document.createElement('tr');
    [m.label, money(r.actual?.[m.id]), s ? money(r.system?.[m.id]) : '-', s ? money(Number(r.actual?.[m.id]||0)-Number(r.system?.[m.id]||0)) : '-'].forEach(v => {
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); container.appendChild(table);

  const totals = document.createElement('div'); totals.className = 'row g-3 mt-2';
  totals.innerHTML = `<div class="col-4"><div class="report-box"><div class="text-muted">إجمالي الفعلي</div><h4>${money(a)}</h4></div></div><div class="col-4"><div class="report-box"><div class="text-muted">إجمالي النظام</div><h4>${s ? money(s) : 'بانتظار الإدخال'}</h4></div></div><div class="col-4"><div class="report-box"><div class="text-muted">الفرق</div><h4>${s ? money(diff) : '-'}</h4></div></div>`;
  container.appendChild(totals);
}

function downloadPDF()       { html2pdf().set({ margin: 0, filename: 'wrench12-report.pdf', html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } }).from(document.getElementById('pdfReport')).save(); }
function shareWhatsApp()     { const text = 'تقرير Wrench 12\n\n' + document.getElementById('pdfReport').innerText.slice(0, 1500); window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }

function buildMonthlyReportHTML() {
  const m=document.getElementById('dashboardMonth').value, b=document.getElementById('dashboardBranch').value;
  const rows=getMonthlyRecords(m,b), exps=getMonthlyExpenses(m,b);
  const income=rows.reduce((s,r)=>s+sumPayments(r.actual),0), cost=costOfSales(m,b), expenses=exps.reduce((s,e)=>s+expenseTotal(e),0), profit=income-cost-expenses, margin=income?profit/income*100:0;
  return `<div class="report-cover"><div><h1 class="fw-bold mb-3">التقرير المالي الشهري</h1><div class="fs-5">${esc(m)} | ${b==='all'?'كل الفروع':esc(branchName(b))}</div></div><img src="logo.png"></div>
    <div class="row g-3 mb-4"><div class="col-3"><div class="report-kpi"><div class="title">الدخل</div><div class="value">${moneyCompact(income)}</div></div></div><div class="col-3"><div class="report-kpi"><div class="title">التكلفة</div><div class="value">${moneyCompact(cost)}</div></div></div><div class="col-3"><div class="report-kpi"><div class="title">المصروفات</div><div class="value">${moneyCompact(expenses)}</div></div></div><div class="col-3"><div class="report-kpi"><div class="title">الصافي</div><div class="value">${moneyCompact(profit)}</div></div></div></div>
    <div class="report-chart-box"><h5 class="fw-bold">ملخص التحليل</h5><table class="table table-bordered"><tr><th>الدخل</th><td>${money(income)}</td></tr><tr><th>التكلفة</th><td>${money(cost)}</td></tr><tr><th>المصروفات</th><td>${money(expenses)}</td></tr><tr><th>صافي الربح</th><td>${money(profit)}</td></tr><tr><th>هامش الربح</th><td>${margin.toFixed(2)}%</td></tr></table></div>`;
}

function buildYearlyReportHTML() {
  const y=document.getElementById('yearlyYear').value, b=document.getElementById('yearlyBranch').value, months=yearlyMonthStats(y,b);
  const income=months.reduce((s,m)=>s+m.income,0), cost=months.reduce((s,m)=>s+m.cost,0), expenses=months.reduce((s,m)=>s+m.expenses,0), profit=income-cost-expenses;
  return `<div class="report-cover"><div><h1 class="fw-bold mb-3">التقرير المالي السنوي</h1><div class="fs-5">${esc(String(y))} | ${b==='all'?'كل الفروع':esc(branchName(b))}</div></div><img src="logo.png"></div>
    <div class="row g-3 mb-4"><div class="col-3"><div class="report-kpi"><div class="title">الدخل</div><div class="value">${moneyCompact(income)}</div></div></div><div class="col-3"><div class="report-kpi"><div class="title">التكلفة</div><div class="value">${moneyCompact(cost)}</div></div></div><div class="col-3"><div class="report-kpi"><div class="title">المصروفات</div><div class="value">${moneyCompact(expenses)}</div></div></div><div class="col-3"><div class="report-kpi"><div class="title">الصافي</div><div class="value">${moneyCompact(profit)}</div></div></div></div>
    <table class="table table-bordered"><thead><tr><th>الشهر</th><th>الدخل</th><th>الصافي</th><th>الهامش</th></tr></thead><tbody>${months.map(m=>`<tr><td>${esc(m.month)}</td><td>${money(m.income)}</td><td>${money(m.profit)}</td><td>${m.margin.toFixed(1)}%</td></tr>`).join('')}</tbody></table>`;
}

function generateMonthlyPDF()   { document.getElementById('pdfReport').innerHTML = buildMonthlyReportHTML(); showSection('pdf'); setTimeout(downloadPDF, 400); }
function generateYearlyPDF()    { document.getElementById('pdfReport').innerHTML = buildYearlyReportHTML();  showSection('pdf'); setTimeout(downloadPDF, 400); }
function shareMonthlyWhatsApp() { document.getElementById('pdfReport').innerHTML = buildMonthlyReportHTML(); showSection('pdf'); setTimeout(shareWhatsApp, 300); }
