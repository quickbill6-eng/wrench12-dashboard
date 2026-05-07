/**
 * security.js — XSS Protection, Validation & File Safety
 * Wrench 12 Dashboard
 */

'use strict';

/* ════════════════════════════════════════════════
   XSS PROTECTION
   ════════════════════════════════════════════════ */

/**
 * تعقيم النصوص قبل الإدراج في innerHTML
 * يجب استخدامها على أي قيمة تأتي من المستخدم أو قاعدة البيانات
 */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * إدراج نص آمن كـ textContent بدون HTML
 */
function safeSetText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val ?? '');
}

/**
 * تحقق من صحة URL المرفقات — يقبل https فقط
 */
function safeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return (u.protocol === 'https:') ? url : '';
  } catch { return ''; }
}

/* ════════════════════════════════════════════════
   FORM VALIDATION
   ════════════════════════════════════════════════ */

function setFieldError(fieldId, msg) {
  const el    = document.getElementById(fieldId);
  const errEl = document.getElementById(fieldId + 'Error');
  if (el)    el.classList.add('is-invalid');
  if (errEl) errEl.textContent = msg;
}

function clearValidation(fields) {
  fields.forEach(f => {
    const el    = document.getElementById(f);
    const errEl = document.getElementById(f + 'Error');
    if (el)    el.classList.remove('is-invalid');
    if (errEl) errEl.textContent = '';
  });
}

/** تحقق من صحة بيانات الإغلاق اليومي */
function validateDaily() {
  clearValidation(['dailyDate', 'dailyBranch', 'carsCount']);
  let valid = true;

  const date = document.getElementById('dailyDate')?.value;
  if (!date) {
    setFieldError('dailyDate', 'التاريخ مطلوب');
    valid = false;
  } else if (date > today()) {
    setFieldError('dailyDate', 'لا يمكن إدخال تاريخ مستقبلي');
    valid = false;
  }

  const bid = document.getElementById('dailyBranch')?.value;
  if (!bid) {
    setFieldError('dailyBranch', 'اختر الفرع');
    valid = false;
  }

  const cars = Number(document.getElementById('carsCount')?.value ?? 0);
  if (cars < 0 || cars > 9999 || !Number.isInteger(cars)) {
    setFieldError('carsCount', 'عدد السيارات يجب أن يكون بين 0 و 9999');
    valid = false;
  }

  const payments = getPaymentMethods();
  for (const m of payments) {
    const val = Number(document.getElementById(`actual_${m.id}`)?.value ?? 0);
    if (val < 0) {
      showToast(`القيمة السالبة غير مسموحة: ${esc(m.label)}`, 'error');
      valid = false;
      break;
    }
    if (val > 9_999_999) {
      showToast(`القيمة كبيرة جداً: ${esc(m.label)}`, 'error');
      valid = false;
      break;
    }
  }

  return valid;
}

/** تحقق من بيانات المصروفات */
function validateExpenses() {
  const month = document.getElementById('expenseMonth')?.value;
  const bid   = document.getElementById('expenseBranch')?.value;
  if (!month) { showToast('اختر الشهر', 'error'); return false; }
  if (!bid)   { showToast('اختر الفرع', 'error'); return false; }
  for (const i of getExpenseItems()) {
    const val = Number(document.getElementById(`exp_${i.id}`)?.value ?? 0);
    if (val < 0)          { showToast(`قيمة سالبة في: ${esc(i.label)}`, 'error');    return false; }
    if (val > 99_999_999) { showToast(`قيمة كبيرة جداً في: ${esc(i.label)}`, 'error'); return false; }
  }
  return true;
}

/** تحقق من بيانات توزيع الدخل */
function validateIncomeDistribution() {
  const month = document.getElementById('incomeDistMonth')?.value;
  const bid   = document.getElementById('incomeDistBranch')?.value;
  if (!month || !bid) { showToast('اختر الشهر والفرع', 'error'); return false; }
  return true;
}

/* ════════════════════════════════════════════════
   FILE UPLOAD SECURITY
   ════════════════════════════════════════════════ */

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function validateFile(file) {
  if (!file) return null;
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('نوع الملف غير مسموح به. المسموح: صور، PDF، Excel');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('حجم الملف يتجاوز الحد المسموح (10MB)');
  }
  return true;
}
