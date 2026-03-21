// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconEl = document.createElement('span');
  iconEl.className = 'toast-icon';
  iconEl.textContent = icons[type] || '💬';

  const msgEl = document.createElement('span');
  msgEl.className = 'toast-msg';
  msgEl.textContent = message;

  toast.appendChild(iconEl);
  toast.appendChild(msgEl);
  container.appendChild(toast);

  const remove = () => {
    toast.classList.add('toast-hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  const timer = setTimeout(remove, duration);
  toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

// ============================================================
//  AUTH
// ============================================================
const ALLOWED_USERS = ['rim.saray', 'kab.sreyrath'];
const SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx6QNoURQ4n8DPtKlmS1HCArFUEi-izFtRKPNpG_WAlOQZOoDxQEIIk_uZM1hPcDX7k_Q/exec';
let sheetsWebAppUrl = localStorage.getItem('sheets_web_app_url') || SHEETS_WEB_APP_URL;

function getCurrentUser() {
  return localStorage.getItem('current_user') || '';
}

window.loginAs = async function(username) {
  if (!ALLOWED_USERS.includes(username)) return;
  localStorage.setItem('current_user', username);
  showApp(username);
  // Auto-load latest data from Google Sheets for cross-device sync
  try {
    const url = SHEETS_WEB_APP_URL + '?action=load';
    const resp = await fetch(url);
    const result = await resp.json();
    if (result.status === 'ok') {
      transactions = result.transactions || [];
      budgetTargets = result.budgetTargets || {};
      saveAndRender();
    }
  } catch (_) {
    // No network or sheets not configured – use local data
    saveAndRender();
  }
};

window.logout = function() {
  localStorage.removeItem('current_user');
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
};

function showApp(username) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = '';
  const badge = document.getElementById('user-badge');
  if (badge) badge.textContent = '👤 ' + username;
}

// Check login state on load
(function initAuth() {
  const user = getCurrentUser();
  if (user && ALLOWED_USERS.includes(user)) {
    showApp(user);
  }
  // If not logged in, login screen is already visible (display:flex via CSS default)
})();

// ============================================================
//  STATE
// ============================================================
let transactions   = JSON.parse(localStorage.getItem('family_transactions')) || [];
let budgetTargets  = JSON.parse(localStorage.getItem('family_budget_targets')) || {};
let selectedType   = 'expense';
let selectedMember = 'husband';
let filterView     = 'all'; // 'all' | 'husband' | 'wife'
let filterMonth    = '';    // '' = all, or 'M/YYYY'

const EXPENSE_CATEGORIES = [
  'អាហារ + កាហ្វេ', 'ការធ្វើដំណើរ', 'ចំណាយផ្ទះ',
  'សុខភាព', 'ការសិក្សា', 'ចំណាយផ្សេង', 'ធរនាគារ',
];

// ============================================================
//  DOM
// ============================================================
const balanceEl      = document.getElementById('balance');
const balanceLabelEl = document.getElementById('balance-label');
const totalIncomeEl  = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const listEl         = document.getElementById('transaction-list');
const form           = document.getElementById('transaction-form');
const descInput      = document.getElementById('desc');
const amountInput    = document.getElementById('amount');
const categoryInput  = document.getElementById('category');

// ============================================================
//  MODAL
// ============================================================
window.openModal = function() {
  document.getElementById('modal').classList.add('open');
  document.getElementById('modal-overlay').classList.add('open');
  updateModalBalance();
  // Pre-fill date with today
  const txnDateEl = document.getElementById('txn-date');
  if (txnDateEl && !txnDateEl.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    txnDateEl.value = `${y}-${m}-${d}`;
  }
  setTimeout(() => document.getElementById('desc').focus(), 350);
};

window.closeModal = function() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modal-overlay').classList.remove('open');
};

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeModal();
    closeReport();
  }
});

function updateModalBalance() {
  const filtered = filterView === 'all'
    ? transactions
    : transactions.filter(t => t.member === filterView);
  const balance = sumBy(filtered, 'income') - sumBy(filtered, 'expense');
  const el = document.getElementById('modal-balance-val');
  if (el) {
    el.textContent = '$' + balance.toFixed(2);
    el.style.color = balance >= 0 ? '#27ae60' : '#e74c3c';
  }
}

// ============================================================
//  MONTH FILTER HELPERS
// ============================================================
function getMonthKey(dateStr) {
  const parts = dateStr.split('/'); // D/M/YYYY
  return parts[1] + '/' + parts[2]; // M/YYYY
}

function getMonthLabel(monthKey) {
  const [m, y] = monthKey.split('/');
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  try {
    return d.toLocaleDateString('km-KH', { month: 'long', year: 'numeric' });
  } catch (e) {
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}

function populateMonthFilter() {
  const sel = document.getElementById('month-filter');
  if (!sel) return;

  const months = new Set();
  transactions.forEach(t => { if (t.date) months.add(getMonthKey(t.date)); });

  // Always include the current month
  const now = new Date();
  months.add((now.getMonth() + 1) + '/' + now.getFullYear());

  // Sort newest-first
  const sorted = [...months].sort((a, b) => {
    const [am, ay] = a.split('/').map(Number);
    const [bm, by] = b.split('/').map(Number);
    return (by * 12 + bm) - (ay * 12 + am);
  });

  sel.innerHTML = '<option value="">📅 ទាំងអស់</option>';
  sorted.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = getMonthLabel(key);
    if (key === filterMonth) opt.selected = true;
    sel.appendChild(opt);
  });
}

window.applyMonthFilter = function(month) {
  filterMonth = month;
  renderList();
  renderBudgets();
};

// ============================================================
//  SELECT TYPE (ចំណូល / ចំណាយ)
// ============================================================
window.selectType = function(type) {
  selectedType = type;
  document.getElementById('btn-income') .classList.toggle('active', type === 'income');
  document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
};

// ============================================================
//  SELECT MEMBER INPUT (ប្ដី / ប្រពន្ធ)
// ============================================================
window.selectMemberInput = function(member) {
  selectedMember = member;
  document.getElementById('btn-husband').classList.toggle('active', member === 'husband');
  document.getElementById('btn-wife')   .classList.toggle('active', member === 'wife');
};

// ============================================================
//  FILTER VIEW (Tab)
// ============================================================
window.filterMember = function(view) {
  filterView = view;
  document.getElementById('tab-all')    .classList.toggle('active', view === 'all');
  document.getElementById('tab-husband').classList.toggle('active', view === 'husband');
  document.getElementById('tab-wife')   .classList.toggle('active', view === 'wife');

  const labels = { all: 'សមតុល្យសរុប', husband: 'សមតុល្យប្ដី 👨', wife: 'សមតុល្យប្រពន្ធ 👩' };
  balanceLabelEl.textContent = labels[view];

  saveAndRender();
};

// ============================================================
//  HELPERS
// ============================================================
const categoryIcons = {
  'ប្រាក់ខែ':         '💼', 'អាជីវកម្ម':      '🏪',
  'ចំណូលផ្សេង':      '📦', 'ការធ្វើដំណើរ':   '✈️',
  'ចំណាយផ្ទះ':       '🏠', 'សុខភាព':         '🏥',
  'ការសិក្សា':       '📚', 'ចំណាយផ្សេង':     '🛒',
  'អាហារ + កាហ្វេ':  '☕', 'ធរនាគារ':        '🏦',
};

function fmt(n) { return '$' + Math.abs(n).toFixed(2); }

// Convert HTML date input value (YYYY-MM-DD) to app format (D/M/YYYY)
function dateFromInput(value) {
  const [year, month, day] = value.split('-');
  return `${parseInt(day)}/${parseInt(month)}/${year}`;
}

function sumBy(list, type) {
  return list.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
}

// ============================================================
//  UPDATE SUMMARY
// ============================================================
function updateSummary() {
  const filtered = filterView === 'all'
    ? transactions
    : transactions.filter(t => t.member === filterView);

  const income  = sumBy(filtered, 'income');
  const expense = sumBy(filtered, 'expense');
  const balance = income - expense;

  balanceEl.textContent      = '$' + balance.toFixed(2);
  balanceEl.style.color      = balance >= 0 ? '#fff' : '#ff6348';
  totalIncomeEl.textContent  = fmt(income);
  totalExpenseEl.textContent = fmt(expense);

  updateCompare();
  updateVsBar();
}

// ============================================================
//  COMPARE TABLE  (ប្ដី vs ប្រពន្ធ)
// ============================================================
function updateCompare() {
  const h = transactions.filter(t => t.member === 'husband');
  const w = transactions.filter(t => t.member === 'wife');

  const hInc = sumBy(h, 'income');
  const hExp = sumBy(h, 'expense');
  const wInc = sumBy(w, 'income');
  const wExp = sumBy(w, 'expense');
  const hNet = hInc - hExp;
  const wNet = wInc - wExp;

  document.getElementById('cmp-h-income') .textContent = fmt(hInc);
  document.getElementById('cmp-h-expense').textContent = fmt(hExp);
  document.getElementById('cmp-w-income') .textContent = fmt(wInc);
  document.getElementById('cmp-w-expense').textContent = fmt(wExp);

  const hNetEl = document.getElementById('cmp-h-net');
  const wNetEl = document.getElementById('cmp-w-net');
  hNetEl.textContent = (hNet >= 0 ? '+' : '-') + fmt(hNet);
  wNetEl.textContent = (wNet >= 0 ? '+' : '-') + fmt(wNet);
  hNetEl.className = hNet >= 0 ? 'plus' : 'minus';
  wNetEl.className = wNet >= 0 ? 'plus' : 'minus';
}

// ============================================================
//  VS PROGRESS BAR
// ============================================================
function updateVsBar() {
  const hExp = sumBy(transactions.filter(t => t.member === 'husband'), 'expense');
  const wExp = sumBy(transactions.filter(t => t.member === 'wife'),    'expense');
  const total = hExp + wExp;

  const hPct = total === 0 ? 50 : Math.round((hExp / total) * 100);
  const wPct = 100 - hPct;

  document.getElementById('vs-husband-bar').style.width = hPct + '%';
  document.getElementById('vs-wife-bar')   .style.width = wPct + '%';
  document.getElementById('vs-husband-pct').textContent = hPct + '%';
  document.getElementById('vs-wife-pct')   .textContent = wPct + '%';
}

// ============================================================
//  RENDER LIST
// ============================================================
function renderTransactionItem(t) {
  const realIdx = transactions.indexOf(t);
  const icon    = categoryIcons[t.category] || (t.type === 'income' ? '📈' : '📉');
  const badge   = t.member === 'husband'
    ? '<span class="badge badge-husband">👨 ប្ដី</span>'
    : '<span class="badge badge-wife">👩 ប្រពន្ធ</span>';

  const li = document.createElement('li');
  li.innerHTML = `
    <span class="tx-icon">${icon}</span>
    <div class="tx-info">
      <div class="tx-desc">${t.desc}</div>
      <div class="tx-meta">
        ${badge}
        <span>${t.category}</span>
        <span>${t.date}</span>
      </div>
    </div>
    <span class="tx-amount ${t.type === 'income' ? 'plus' : 'minus'}">
      ${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}
    </span>
    <button class="tx-remove" onclick="removeTransaction(${realIdx})">×</button>
  `;
  return li;
}

function renderList() {
  listEl.innerHTML = '';

  let filtered = filterView === 'all'
    ? [...transactions].reverse()
    : [...transactions].filter(t => t.member === filterView).reverse();

  // Apply monthly filter
  if (filterMonth) {
    filtered = filtered.filter(t => t.date && getMonthKey(t.date) === filterMonth);

    if (filtered.length === 0) {
      listEl.innerHTML = '<li><p class="empty-msg">មិនទាន់មានធាតុណាមួយ</p></li>';
      return;
    }

    filtered.forEach(t => listEl.appendChild(renderTransactionItem(t)));
  } else {
    // No month filter: show only the last 10 transactions
    const totalCount = filtered.length;
    filtered = filtered.slice(0, 10);

    if (filtered.length === 0) {
      listEl.innerHTML = '<li><p class="empty-msg">មិនទាន់មានធាតុណាមួយ</p></li>';
      return;
    }

    filtered.forEach(t => listEl.appendChild(renderTransactionItem(t)));

    if (totalCount > 10) {
      const note = document.createElement('li');
      note.innerHTML = `<p class="empty-msg tx-more-note">📅 មាន ${totalCount} ធាតុ · ជ្រើសរើសខែដើម្បីមើលទាំងអស់</p>`;
      listEl.appendChild(note);
    }
  }
}

// ============================================================
//  BUDGET TARGETS
// ============================================================
function getCurrentMonthKey() {
  const now = new Date();
  return (now.getMonth() + 1) + '/' + now.getFullYear();
}

function renderBudgets() {
  const budgetList = document.getElementById('budget-list');
  if (!budgetList) return;

  // Use selected month filter, or current month if none selected
  const monthKey = filterMonth || getCurrentMonthKey();
  const monthLabel = getMonthLabel(monthKey);

  // Update heading to reflect the displayed month
  const budgetHeading = document.querySelector('.budget-card h2');
  if (budgetHeading) {
    budgetHeading.textContent = `🎯 គោលដៅចំណាយ (${monthLabel})`;
  }

  budgetList.innerHTML = '';

  EXPENSE_CATEGORIES.forEach(cat => {
    const target = budgetTargets[cat];
    const hasTarget = target !== undefined && target > 0;

    const spent = transactions
      .filter(t => t.type === 'expense' && t.category === cat &&
                   t.date && getMonthKey(t.date) === monthKey)
      .reduce((s, t) => s + t.amount, 0);

    const icon      = categoryIcons[cat] || '📉';
    const remaining = hasTarget ? target - spent : null;
    const isOver    = remaining !== null && remaining < 0;
    const pct       = hasTarget ? Math.min(100, (spent / target) * 100) : 0;

    const li = document.createElement('li');
    li.className = 'budget-item';
    li.innerHTML = `
      <div class="budget-row">
        <span class="budget-icon">${icon}</span>
        <div class="budget-info">
          <span class="budget-cat">${cat}</span>
          <div class="budget-nums">
            <label class="budget-target-label">🎯
              <input type="number" class="budget-target-input"
                     value="${hasTarget ? target : ''}"
                     placeholder="—"
                     min="0" step="0.01"
                     data-cat="${cat}">
            </label>
            <span class="budget-spent-val">📉 ${fmt(spent)}</span>
            ${hasTarget ? `<span class="budget-remaining-val ${isOver ? 'minus' : 'plus'}">
              ${isOver ? '⚠️' : '✅'} ${isOver ? '-' : ''}${fmt(Math.abs(remaining))} នៅសល់
            </span>` : ''}
          </div>
          ${hasTarget ? `
            <div class="budget-bar-wrap">
              <div class="budget-bar">
                <div class="budget-bar-fill ${isOver ? 'budget-bar-over' : ''}"
                     style="width:${pct}%"></div>
              </div>
              <span class="budget-pct">${Math.round(pct)}%</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    budgetList.appendChild(li);
  });

  // ---- Income vs Total Targets Summary ----
  const totalTarget = Object.values(budgetTargets).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const summaryEl = document.getElementById('budget-summary');
  if (summaryEl) {
    if (totalTarget > 0) {
      const monthIncome = transactions
        .filter(t => t.type === 'income' && t.date && getMonthKey(t.date) === monthKey)
        .reduce((s, t) => s + t.amount, 0);
      const diff   = monthIncome - totalTarget;
      const isOver = diff < 0;
      summaryEl.innerHTML = `
        <div class="budget-summary-row">
          <span>🎯 គោលដៅចំណាយសរុប</span>
          <span class="minus">${fmt(totalTarget)}</span>
        </div>
        <div class="budget-summary-row">
          <span>📈 ចំណូលប្រចាំខែ</span>
          <span class="plus">${fmt(monthIncome)}</span>
        </div>
        <div class="budget-summary-divider"></div>
        <div class="budget-summary-result ${isOver ? 'budget-summary-over' : 'budget-summary-ok'}">
          <span>${isOver ? '⚠️ គោលដៅលើសចំណូល!' : '✅ គោលដៅស្ថិតក្នុងថវិកា'}</span>
          <span>${isOver ? '-' : '+'}${fmt(Math.abs(diff))}</span>
        </div>
      `;
      summaryEl.style.display = '';
    } else {
      summaryEl.style.display = 'none';
    }
  }
}

// ============================================================
//  REMOVE / CLEAR
// ============================================================
window.removeTransaction = function(idx) {
  if (confirm('តើអ្នកប្រាកដថាចង់លុបធាតុនេះ?')) {
    transactions.splice(idx, 1);
    saveAndRender();
  }
};

window.clearAll = function() {
  const target = filterView === 'all'     ? 'ប្រវត្តិទាំងអស់' :
                 filterView === 'husband' ? 'ប្រវត្តិប្ដី'     : 'ប្រវត្តិប្រពន្ធ';
  if (confirm(`លុប${target}?`)) {
    if (filterView === 'all') {
      transactions = [];
    } else {
      transactions = transactions.filter(t => t.member !== filterView);
    }
    saveAndRender();
  }
};

// ============================================================
//  FORM SUBMIT
// ============================================================
form.addEventListener('submit', function(e) {
  e.preventDefault();

  const desc     = descInput.value.trim();
  const amount   = parseFloat(amountInput.value);
  const category = categoryInput.value;

  if (!desc || isNaN(amount) || amount <= 0) return;

  // Use date input value; fall back to today if empty
  let date;
  const txnDateEl = document.getElementById('txn-date');
  if (txnDateEl && txnDateEl.value) {
    date = dateFromInput(txnDateEl.value);
  } else {
    const now = new Date();
    date = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
  }

  transactions.push({
    desc,
    amount,
    type:   selectedType,
    member: selectedMember,
    category,
    date,
  });

  saveAndRender();
  syncToSheetsQuiet();
  showToast('រក្សាទុកបានជោគជ័យ', 'success');
  form.reset();
  // Clear date field so next modal open defaults to today
  if (txnDateEl) txnDateEl.value = '';
  selectType('expense');
  selectMemberInput('husband');
  closeModal();
});

// ============================================================
//  SAVE & RENDER
// ============================================================
function saveAndRender() {
  localStorage.setItem('family_transactions', JSON.stringify(transactions));
  updateSummary();
  populateMonthFilter();
  renderList();
  renderBudgets();
}

// ============================================================
//  INIT
// ============================================================
// Wire budget target input changes via event delegation (set up once)
document.getElementById('budget-list').addEventListener('change', function(e) {
  const input = e.target.closest('.budget-target-input');
  if (!input) return;
  const cat = input.dataset.cat;
  const val = parseFloat(input.value);
  if (!isNaN(val) && val > 0) {
    budgetTargets[cat] = val;
  } else {
    delete budgetTargets[cat];
  }
  localStorage.setItem('family_budget_targets', JSON.stringify(budgetTargets));
  renderBudgets();
});

saveAndRender();

// ============================================================
//  MONTHLY REPORT
// ============================================================
window.showMonthlyReport = function() {
  const reportMonthKey = filterMonth || getCurrentMonthKey();
  const monthLabel = getMonthLabel(reportMonthKey);

  const monthTx = transactions.filter(t => t.date && getMonthKey(t.date) === reportMonthKey);
  const income  = sumBy(monthTx, 'income');
  const expense = sumBy(monthTx, 'expense');
  const balance = income - expense;

  // Find over-budget categories
  const overBudgetItems = [];
  EXPENSE_CATEGORIES.forEach(cat => {
    const target = budgetTargets[cat];
    if (!target || target <= 0) return;
    const spent = monthTx
      .filter(t => t.type === 'expense' && t.category === cat)
      .reduce((s, t) => s + t.amount, 0);
    if (spent > target) {
      overBudgetItems.push({ cat, target, spent, over: spent - target });
    }
  });

  const overHTML = overBudgetItems.length === 0
    ? '<p class="report-ok">✅ គ្មានប្រភេទណាមួយលើសថវិកា</p>'
    : overBudgetItems.map(item => `
        <div class="report-over-item">
          <span class="report-over-cat">${categoryIcons[item.cat] || '📉'} ${item.cat}</span>
          <div class="report-over-detail">
            <span>🎯 ${fmt(item.target)} → 📉 ${fmt(item.spent)}</span>
            <span class="minus report-over-amount">⚠️ +${fmt(item.over)} លើស</span>
          </div>
        </div>
      `).join('');

  const content = document.getElementById('report-content');
  if (content) {
    content.innerHTML = `
      <div class="report-month-label">${monthLabel}</div>
      <div class="report-summary-block">
        <div class="report-row">
          <span>📈 ចំណូលសរុប</span>
          <span class="plus">${fmt(income)}</span>
        </div>
        <div class="report-row">
          <span>📉 ចំណាយសរុប</span>
          <span class="minus">${fmt(expense)}</span>
        </div>
        <div class="report-divider"></div>
        <div class="report-balance-row ${balance >= 0 ? 'report-balance-ok' : 'report-balance-over'}">
          <span>${balance >= 0 ? '✅ សមតុល្យនៅសល់' : '⚠️ សមតុល្យខ្វះ'}</span>
          <span>${balance >= 0 ? '+' : '-'}${fmt(Math.abs(balance))}</span>
        </div>
      </div>
      <h3 class="report-section-title">🔴 ប្រភេទចំណាយដែលលើសថវិកា</h3>
      <div class="report-over-list">${overHTML}</div>
    `;
  }

  document.getElementById('report-modal').classList.add('open');
  document.getElementById('report-overlay').classList.add('open');
};

window.closeReport = function() {
  document.getElementById('report-modal').classList.remove('open');
  document.getElementById('report-overlay').classList.remove('open');
};

// ============================================================
//  GOOGLE SHEETS SYNC
// ============================================================
async function syncToSheets() {
  if (!sheetsWebAppUrl) {
    showToast('សូមកំណត់ Google Sheets URL ក្នុង ⚙️ ការកំណត់ជាមុន', 'warning');
    return;
  }
  const btn = document.getElementById('btn-sync-sheets');
  if (btn) { btn.textContent = '⏳ Syncing...'; btn.disabled = true; }

  try {
    const payload = {
      action: 'sync',
      transactions: transactions,
      budgetTargets: budgetTargets,
    };
    const resp = await fetch(sheetsWebAppUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (result.status === 'ok') {
      showToast('បានធ្វើសមកាលកម្មជាមួយ Google Sheets ជោគជ័យ!', 'success');
    } else {
      showToast('❌ មានបញ្ហាក្នុងការធ្វើសមកាលកម្ម: ' + (result.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('❌ មិនអាចភ្ជាប់ Web App បាន។ សូមពិនិត្យ URL របស់អ្នក', 'error');
  } finally {
    if (btn) { btn.textContent = '📤 Sync to Sheets'; btn.disabled = false; }
  }
}
window.syncToSheets = syncToSheets;

async function syncToSheetsQuiet() {
  try {
    const payload = {
      action: 'sync',
      transactions: transactions,
      budgetTargets: budgetTargets,
    };
    await fetch(sheetsWebAppUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Background sync to Google Sheets failed:', err);
  }
}
window.syncToSheetsQuiet = syncToSheetsQuiet;

async function loadFromSheets() {
  if (!sheetsWebAppUrl) {
    showToast('សូមកំណត់ Google Sheets URL ក្នុង ⚙️ ការកំណត់ជាមុន', 'warning');
    return;
  }
  const btn = document.getElementById('btn-load-sheets');
  if (btn) { btn.textContent = '⏳ Loading...'; btn.disabled = true; }

  try {
    const url = sheetsWebAppUrl + '?action=load';
    const resp = await fetch(url);
    const result = await resp.json();
    if (result.status === 'ok') {
      transactions = result.transactions || [];
      budgetTargets = result.budgetTargets || {};
      saveAndRender();
      showToast('ទិន្នន័យត្រូវបានផ្ទុកពី Google Sheets ជោគជ័យ!', 'success');
    } else {
      showToast('❌ មានបញ្ហាក្នុងការផ្ទុក: ' + (result.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('❌ មិនអាចភ្ជាប់ Web App បាន។ សូមពិនិត្យ URL របស់អ្នក', 'error');
  } finally {
    if (btn) { btn.textContent = '📥 Load from Sheets'; btn.disabled = false; }
  }
}
window.loadFromSheets = loadFromSheets;

window.fabRefresh = async function() {
  const btn = document.getElementById('btn-fab-refresh');
  if (btn) btn.classList.add('spinning');
  try {
    await loadFromSheets();
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
};

window.saveSheetUrl = function() {
  const input = document.getElementById('sheets-url-input');
  if (input) {
    sheetsWebAppUrl = input.value.trim();
    localStorage.setItem('sheets_web_app_url', sheetsWebAppUrl);
    showToast(sheetsWebAppUrl ? '✅ URL បានរក្សាទុក!' : '🗑️ URL ត្រូវបានលុប!', sheetsWebAppUrl ? 'success' : 'info');
  }
};

window.toggleSettings = function() {
  const panel = document.getElementById('settings-panel');
  if (panel) panel.classList.toggle('open');
};

// Populate saved URL into settings input on load
const _urlInput = document.getElementById('sheets-url-input');
if (_urlInput && sheetsWebAppUrl) _urlInput.value = sheetsWebAppUrl;
