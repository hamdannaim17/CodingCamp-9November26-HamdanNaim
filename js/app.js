/* ============================================
   EXPENSE & BUDGET VISUALIZER — app.js
   ============================================ */

'use strict';

/* ── 1. Constants & State ── */

const STORAGE_KEY_TRANSACTIONS = 'ebv_transactions';
const STORAGE_KEY_THEME        = 'ebv_theme';
const STORAGE_KEY_CATEGORIES   = 'ebv_categories';
const STORAGE_KEY_LIMIT        = 'ebv_spending_limit';

// Colour palette for chart & category dots (cycles if more categories added)
const CATEGORY_COLORS = [
  '#6c63ff', '#f093fb', '#f5576c', '#4facfe',
  '#43e97b', '#fa709a', '#fee140', '#a18cd1',
  '#fda085', '#84fab0', '#8fd3f4', '#d4fc79',
];

let transactions    = [];
let customCategories = [];
let spendingChart   = null; // Chart.js instance

/* ── 2. DOM References ── */

const themeToggleBtn       = document.getElementById('theme-toggle-btn');
const totalBalanceEl       = document.getElementById('total-balance');
const transactionForm      = document.getElementById('transaction-form');
const itemNameInput        = document.getElementById('item-name');
const itemAmountInput      = document.getElementById('item-amount');
const itemCategorySelect   = document.getElementById('item-category');
const addCategoryBtn       = document.getElementById('add-category-btn');
const spendingChartCanvas  = document.getElementById('spending-chart');
const transactionList      = document.getElementById('transaction-list');
const sortSelect           = document.getElementById('sort-select');
const searchInput          = document.getElementById('search-input');
const spendingLimitInput   = document.getElementById('spending-limit');
const limitAlert           = document.getElementById('limit-alert');
const monthlyTotalEl       = document.getElementById('monthly-total');
const monthlyCountEl       = document.getElementById('monthly-count');
const categoryModal        = document.getElementById('category-modal');
const customCategoryInput  = document.getElementById('custom-category-input');
const saveCategoryBtn      = document.getElementById('save-category-btn');
const closeModalBtn        = document.getElementById('close-modal-btn');
const emptyState           = document.getElementById('empty-state');

/* ── 3. Helpers ── */

/**
 * Format a number as Indonesian Rupiah.
 * @param {number} amount
 * @returns {string}
 */
function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a Date object to a localised Indonesian string.
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Generate a simple unique id.
 * @returns {string}
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Map a category name to a consistent hex colour.
 * @param {string} category
 * @returns {string}
 */
function colorForCategory(category) {
  const allCats = getAllCategories();
  const idx = allCats.findIndex(c => c.toLowerCase() === category.toLowerCase());
  return CATEGORY_COLORS[idx >= 0 ? idx % CATEGORY_COLORS.length : 0];
}

/**
 * Returns the merged list of default + custom categories.
 * @returns {string[]}
 */
function getAllCategories() {
  const defaults = ['Food', 'Transport', 'Fun'];
  return [...new Set([...defaults, ...customCategories])];
}

/* ── 4. LocalStorage ── */

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(transactions));
}

function loadTransactions() {
  const raw = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
  transactions = raw ? JSON.parse(raw) : [];
}

function saveCategories() {
  localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(customCategories));
}

function loadCategories() {
  const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
  customCategories = raw ? JSON.parse(raw) : [];
}

function saveLimit() {
  localStorage.setItem(STORAGE_KEY_LIMIT, spendingLimitInput.value);
}

function loadLimit() {
  const val = localStorage.getItem(STORAGE_KEY_LIMIT);
  if (val) spendingLimitInput.value = val;
}

/* ── 5. Theme ── */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = themeToggleBtn.querySelector('i');
  if (theme === 'dark') {
    icon.className = 'fa-solid fa-sun';
  } else {
    icon.className = 'fa-solid fa-moon';
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem(STORAGE_KEY_THEME, theme);
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY_THEME) || 'light';
  applyTheme(saved);
}

themeToggleBtn.addEventListener('click', () => {
  const current = localStorage.getItem(STORAGE_KEY_THEME) || 'light';
  applyTheme(current === 'light' ? 'dark' : 'light');
  // Redraw chart so it picks up new colour mode text colours
  renderChart();
});

/* ── 6. Category Select Population ── */

function populateCategorySelect() {
  // Keep the disabled placeholder
  const placeholder = itemCategorySelect.querySelector('option[disabled]');
  itemCategorySelect.innerHTML = '';
  if (placeholder) itemCategorySelect.appendChild(placeholder);

  getAllCategories().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    itemCategorySelect.appendChild(opt);
  });
}

/* ── 7. Form Handling ── */

function validateForm() {
  let valid = true;

  // Name
  if (!itemNameInput.value.trim()) {
    itemNameInput.classList.add('error');
    valid = false;
  } else {
    itemNameInput.classList.remove('error');
  }

  // Amount
  const amount = parseFloat(itemAmountInput.value);
  if (!itemAmountInput.value || isNaN(amount) || amount <= 0) {
    itemAmountInput.classList.add('error');
    valid = false;
  } else {
    itemAmountInput.classList.remove('error');
  }

  // Category
  if (!itemCategorySelect.value) {
    itemCategorySelect.classList.add('error');
    valid = false;
  } else {
    itemCategorySelect.classList.remove('error');
  }

  return valid;
}

transactionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const transaction = {
    id:       generateId(),
    name:     itemNameInput.value.trim(),
    amount:   parseFloat(itemAmountInput.value),
    category: itemCategorySelect.value,
    date:     new Date().toISOString(),
  };

  transactions.unshift(transaction); // newest first
  saveTransactions();

  // Reset form
  transactionForm.reset();
  itemNameInput.classList.remove('error');
  itemAmountInput.classList.remove('error');
  itemCategorySelect.classList.remove('error');

  renderAll();
});

// Remove error styling on input
[itemNameInput, itemAmountInput].forEach(el => {
  el.addEventListener('input', () => el.classList.remove('error'));
});
itemCategorySelect.addEventListener('change', () => itemCategorySelect.classList.remove('error'));

/* ── 8. Delete Transaction ── */

function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions();
  renderAll();
}

/* ── 9. Spending Limit Alert ── */

function checkSpendingLimit() {
  const limit = parseFloat(spendingLimitInput.value);
  if (!limit || isNaN(limit) || limit <= 0) {
    limitAlert.classList.add('hidden');
    return;
  }
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  if (total >= limit) {
    limitAlert.classList.remove('hidden');
  } else {
    limitAlert.classList.add('hidden');
  }
}

spendingLimitInput.addEventListener('input', () => {
  saveLimit();
  checkSpendingLimit();
});

/* ── 10. Balance ── */

function updateBalance() {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  totalBalanceEl.textContent = formatRupiah(total);
}

/* ── 11. Monthly Summary ── */

function updateMonthlySummary() {
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const thisMonth = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const total = thisMonth.reduce((sum, t) => sum + t.amount, 0);
  monthlyTotalEl.textContent = formatRupiah(total);
  monthlyCountEl.textContent = thisMonth.length;
}

/* ── 12. Chart.js ── */

function buildChartData() {
  const totals = {};
  transactions.forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  const colors = labels.map(l => colorForCategory(l));

  return { labels, data, colors };
}

function renderChart() {
  const { labels, data, colors } = buildChartData();

  // Determine font colour based on current theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#a0aec0' : '#4a5568';

  if (spendingChart) {
    spendingChart.destroy();
  }

  if (data.length === 0) {
    // Clear canvas when no data
    const ctx = spendingChartCanvas.getContext('2d');
    ctx.clearRect(0, 0, spendingChartCanvas.width, spendingChartCanvas.height);
    return;
  }

  spendingChart = new Chart(spendingChartCanvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: isDark ? '#1e2130' : '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { family: 'Inter', size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const val   = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((val / total) * 100).toFixed(1);
              return ` ${formatRupiah(val)}  (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ── 13. Transaction List Rendering ── */

/**
 * Returns a filtered & sorted copy of transactions based on current UI state.
 */
function getFilteredSortedTransactions() {
  const query = searchInput.value.trim().toLowerCase();
  const sort  = sortSelect.value;

  let result = transactions.filter(t => {
    if (!query) return true;
    return (
      t.name.toLowerCase().includes(query) ||
      t.category.toLowerCase().includes(query)
    );
  });

  switch (sort) {
    case 'amount-desc':
      result.sort((a, b) => b.amount - a.amount);
      break;
    case 'amount-asc':
      result.sort((a, b) => a.amount - b.amount);
      break;
    case 'category':
      result.sort((a, b) => a.category.localeCompare(b.category));
      break;
    default:
      // Keep original insertion order (newest first from unshift)
      break;
  }

  return result;
}

function renderTransactionList() {
  const items = getFilteredSortedTransactions();

  transactionList.innerHTML = '';

  if (items.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  items.forEach(t => {
    const color = colorForCategory(t.category);

    const li = document.createElement('li');
    li.setAttribute('data-id', t.id);
    li.innerHTML = `
      <div class="transaction-info">
        <span class="category-dot" style="background:${color};"></span>
        <div class="transaction-details">
          <div class="transaction-name">${escapeHtml(t.name)}</div>
          <div class="transaction-meta">${escapeHtml(t.category)} &middot; ${formatDate(t.date)}</div>
        </div>
      </div>
      <span class="transaction-amount">${formatRupiah(t.amount)}</span>
      <button class="delete-btn" title="Hapus transaksi" aria-label="Hapus ${escapeHtml(t.name)}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    li.querySelector('.delete-btn').addEventListener('click', () => {
      deleteTransaction(t.id);
    });

    transactionList.appendChild(li);
  });
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── 14. Search & Sort Listeners ── */

searchInput.addEventListener('input', renderTransactionList);
sortSelect.addEventListener('change', renderTransactionList);

/* ── 15. Custom Category Modal ── */

function openModal() {
  categoryModal.classList.remove('hidden');
  customCategoryInput.value = '';
  customCategoryInput.focus();
}

function closeModal() {
  categoryModal.classList.add('hidden');
}

addCategoryBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);

// Close modal on backdrop click
categoryModal.addEventListener('click', (e) => {
  if (e.target === categoryModal) closeModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !categoryModal.classList.contains('hidden')) {
    closeModal();
  }
});

saveCategoryBtn.addEventListener('click', () => {
  const name = customCategoryInput.value.trim();

  if (!name) {
    customCategoryInput.focus();
    customCategoryInput.style.borderColor = 'var(--danger)';
    setTimeout(() => customCategoryInput.style.borderColor = '', 1200);
    return;
  }

  const existing = getAllCategories().map(c => c.toLowerCase());
  if (existing.includes(name.toLowerCase())) {
    alert(`Kategori "${name}" sudah ada.`);
    return;
  }

  // Capitalise first letter
  const formatted = name.charAt(0).toUpperCase() + name.slice(1);
  customCategories.push(formatted);
  saveCategories();
  populateCategorySelect();

  // Auto-select the new category
  itemCategorySelect.value = formatted;
  itemCategorySelect.classList.remove('error');

  closeModal();
});

// Allow Enter key inside modal input to trigger save
customCategoryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveCategoryBtn.click();
});

/* ── 16. Master Render ── */

function renderAll() {
  updateBalance();
  updateMonthlySummary();
  renderTransactionList();
  renderChart();
  checkSpendingLimit();
}

/* ── 17. Init ── */

(function init() {
  loadTransactions();
  loadCategories();
  loadLimit();
  initTheme();
  populateCategorySelect();
  renderAll();
})();
