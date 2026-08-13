// Base API URL for local execution (handles file:// protocol gracefully)
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

// Global App State
const state = {
  activeTab: 'overview',
  activeSubTab: 'customer-detail',
  filters: {
    startDate: '',
    endDate: '',
    city: '',
    customer: '',
    gender: '',
    category: '',
    product: '',
    status: ''
  },
  filtersMetadata: {},
  kpis: {},
  revenueTrend: {},
  runningRevenue: [],
  categoryAnalysis: [],
  productAnalysis: {
    productsList: [],
    top10ByUnits: [],
    top10ByRevenue: [],
    worstSelling: [],
    mostExpensiveProduct: null
  },
  geographicAnalysis: [],
  customerAnalysis: {
    customersList: [],
    topCustomers: [],
    genderRevenue: {},
    cohortSizes: {},
    anchorDate: ''
  },
  retentionAnalysis: {
    monthlyActive: [],
    cohortMatrix: []
  },
  churnAnalysis: {
    anchorDate: '',
    buyingCohortSize: 0,
    totalCustomers: 0,
    inactiveCount: 0,
    churnRiskCount: 0,
    neverPurchasedCount: 0,
    activeChurnRatePct: 0,
    neverPurchasedRatePct: 0,
    inactiveList: [],
    churnRiskList: [],
    neverPurchasedList: []
  },
  rfmAnalysis: {
    customers: [],
    summary: []
  },
  productAffinity: [],
  orderFrequency: {
    gapsDistribution: [],
    averageGapDays: 0,
    totalGapsCount: 0
  },
  ordersList: [],
  
  // Table state (Pagination, search, sorting)
  tables: {
    products: { page: 1, limit: 10, search: '', sortBy: 'total_recognized_revenue', sortOrder: 'desc' },
    customersDetail: { page: 1, limit: 10, search: '', sortBy: 'recognized_spend', sortOrder: 'desc' },
    ordersDetail: { page: 1, limit: 10, search: '', sortBy: 'order_date', sortOrder: 'desc' }
  },

  // Chart instances to prevent canvas memory leaks
  charts: {}
};

// Formatter Helpers
const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
};

const formatNumber = (val) => {
  return new Intl.NumberFormat('en-IN').format(val);
};

const formatPercent = (val) => {
  return (val || 0).toFixed(2) + '%';
};

// Color palettes matching design guidelines (Deep Blue primary, slate, sparse orange accents)
const chartColors = {
  primary: '#1e40af',       // Deep Blue
  primaryLight: '#3b82f6',  // Light Blue
  accent: '#d97706',        // Amber/Orange
  success: '#10b981',       // Emerald
  warning: '#f59e0b',       // Yellow
  error: '#ef4444',         // Red
  slate: '#64748b',         // Slate 500
  darkSlate: '#334155',     // Slate 700
  lightSlate: '#cbd5e1',    // Slate 300
  cohorts: [
    '#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff'
  ],
  segments: {
    'Champions': '#166534',          // Dark green
    'Loyal Customers': '#22c55e',    // Green
    'New Customers': '#3b82f6',      // Blue
    'Potential Loyalists': '#60a5fa',// Light blue
    'About to Sleep': '#ca8a04',     // Gold
    'At Risk': '#ea580c',            // Dark orange
    'Hibernating': '#b91c1c'          // Dark red
  }
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize icons
  lucide.createIcons();

  // Show loading indicator
  showGlobalLoading(true);

  try {
    // 1. Fetch metadata to populate filters
    await fetchFiltersMetadata();
    setupFiltersUI();
    
    // 2. Fetch all database summaries initially
    await refreshAllData();
    
    // 3. Render dashboard layout and listeners
    setupTabListeners();
    setupFilterListeners();
    setupTableControls();
    
    // 4. Render active tab
    renderActiveTab();
    
    // Hide error banner if successful
    document.getElementById('api-error-banner').classList.add('hidden');
  } catch (err) {
    console.error('Initialization failed:', err);
    // Show error banner
    document.getElementById('api-error-banner').classList.remove('hidden');
    alert('Failed to connect to the analytics database. Check server logs.');
  } finally {
    showGlobalLoading(false);
  }
});

// UI Overlay for Loading
function showGlobalLoading(show) {
  let loader = document.getElementById('global-loader');
  if (!loader && show) {
    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.className = 'loading-overlay';
    loader.style.position = 'fixed';
    loader.style.zIndex = '9999';
    loader.style.background = 'rgba(255,255,255,0.85)';
    loader.innerHTML = '<div class="spinner"></div><div style="margin-left: 15px; font-weight: 600;">Processing Live SQL Queries...</div>';
    document.body.appendChild(loader);
  } else if (loader && !show) {
    loader.remove();
  }
}

// Fetch filter dropdown options from Express DB wrapper
async function fetchFiltersMetadata() {
  const res = await fetch(`${API_BASE}/api/filters-data`);
  state.filtersMetadata = await res.json();
}

// Populate Filter elements
function setupFiltersUI() {
  const meta = state.filtersMetadata;
  
  // Set Date bounds
  if (meta.dateRange) {
    const startInput = document.getElementById('filter-start-date');
    const endInput = document.getElementById('filter-end-date');
    startInput.min = meta.dateRange.min_date;
    startInput.max = meta.dateRange.max_date;
    endInput.min = meta.dateRange.min_date;
    endInput.max = meta.dateRange.max_date;
    
    // Set default value as full range
    startInput.value = meta.dateRange.min_date;
    endInput.value = meta.dateRange.max_date;
    state.filters.startDate = meta.dateRange.min_date;
    state.filters.endDate = meta.dateRange.max_date;
  }

  // Populate Selects
  populateSelect('filter-city', meta.cities);
  populateSelect('filter-category', meta.categories);
  populateSelect('filter-status', meta.statuses);

  // Populate Product select
  const productSelect = document.getElementById('filter-product');
  meta.products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.product_id;
    opt.textContent = `${p.product_name} (${p.category})`;
    productSelect.appendChild(opt);
  });

  // Populate Customer select
  const customerSelect = document.getElementById('filter-customer');
  meta.customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.customer_id;
    opt.textContent = `${c.customer_name} (${c.city})`;
    customerSelect.appendChild(opt);
  });
}

function populateSelect(elementId, items) {
  const select = document.getElementById(elementId);
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    select.appendChild(opt);
  });
}

// Fetch all database endpoints applying current filters
async function refreshAllData() {
  showGlobalLoading(true);
  const qStr = new URLSearchParams(state.filters).toString();
  
  try {
    const [
      kpis,
      rev,
      run,
      cat,
      prod,
      geo,
      cust,
      ret,
      churn,
      rfm,
      aff,
      freq,
      orders
    ] = await Promise.all([
      fetch(`${API_BASE}/api/kpis?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/revenue-trend?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/running-revenue?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/category-analysis?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/product-analysis?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/geographic-analysis?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/customer-analysis?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/retention-analysis?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/churn-analysis?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/rfm-analysis?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/product-affinity?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/order-frequency?${qStr}`).then(r => r.json()),
      fetch(`${API_BASE}/api/orders-list?${qStr}`).then(r => r.json())
    ]);

    state.kpis = kpis;
    state.revenueTrend = rev;
    state.runningRevenue = run;
    state.categoryAnalysis = cat;
    state.productAnalysis = prod;
    state.geographicAnalysis = geo;
    state.customerAnalysis = cust;
    state.retentionAnalysis = ret;
    state.churnAnalysis = churn;
    state.rfmAnalysis = rfm;
    state.productAffinity = aff;
    state.orderFrequency = freq;
    state.ordersList = orders;

    // Reset tables back to page 1 on refresh
    state.tables.products.page = 1;
    state.tables.customersDetail.page = 1;
    state.tables.ordersDetail.page = 1;

    renderKPIs();
    renderActiveFilterChips();
    // Hide error banner if successful
    document.getElementById('api-error-banner').classList.add('hidden');
  } catch (err) {
    console.error('Failed to reload dashboard:', err);
    // Show error banner on failure
    document.getElementById('api-error-banner').classList.remove('hidden');
  } finally {
    showGlobalLoading(false);
  }
}

// Render dynamic filter indicators (chips)
function renderActiveFilterChips() {
  const container = document.getElementById('active-filters-container');
  // clear chips
  container.querySelectorAll('.filter-chip').forEach(c => c.remove());
  
  const activeFilters = [];
  const meta = state.filtersMetadata;

  if (state.filters.startDate && meta.dateRange && state.filters.startDate !== meta.dateRange.min_date) {
    activeFilters.push({ key: 'startDate', label: `Start: ${state.filters.startDate}` });
  }
  if (state.filters.endDate && meta.dateRange && state.filters.endDate !== meta.dateRange.max_date) {
    activeFilters.push({ key: 'endDate', label: `End: ${state.filters.endDate}` });
  }
  if (state.filters.city) {
    activeFilters.push({ key: 'city', label: `City: ${state.filters.city}` });
  }
  if (state.filters.customer) {
    const name = meta.customers.find(c => c.customer_id == state.filters.customer)?.customer_name || 'Selected Customer';
    activeFilters.push({ key: 'customer', label: `Customer: ${name}` });
  }
  if (state.filters.gender) {
    activeFilters.push({ key: 'gender', label: `Gender: ${state.filters.gender}` });
  }
  if (state.filters.category) {
    activeFilters.push({ key: 'category', label: `Category: ${state.filters.category}` });
  }
  if (state.filters.product) {
    const name = meta.products.find(p => p.product_id == state.filters.product)?.product_name || 'Selected Product';
    activeFilters.push({ key: 'product', label: `Product: ${name}` });
  }
  if (state.filters.status) {
    activeFilters.push({ key: 'status', label: `Status: ${state.filters.status}` });
  }

  const noFiltersLabel = container.querySelector('.no-active-filters');
  if (activeFilters.length === 0) {
    if (noFiltersLabel) noFiltersLabel.style.display = 'inline';
  } else {
    if (noFiltersLabel) noFiltersLabel.style.display = 'none';
    activeFilters.forEach(f => {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.innerHTML = `
        <span>${f.label}</span>
        <button data-key="${f.key}">&times;</button>
      `;
      chip.querySelector('button').addEventListener('click', (e) => {
        const key = e.target.getAttribute('data-key');
        removeFilter(key);
      });
      container.appendChild(chip);
    });
  }
}

function removeFilter(key) {
  if (key === 'startDate' || key === 'endDate') {
    const meta = state.filtersMetadata;
    if (meta.dateRange) {
      document.getElementById('filter-start-date').value = meta.dateRange.min_date;
      document.getElementById('filter-end-date').value = meta.dateRange.max_date;
      state.filters.startDate = meta.dateRange.min_date;
      state.filters.endDate = meta.dateRange.max_date;
    }
  } else {
    document.getElementById(`filter-${key}`).value = '';
    state.filters[key] = '';
  }
  refreshAllData().then(() => renderActiveTab());
}

// Render KPI Cards
function renderKPIs() {
  const kpis = state.kpis;
  document.getElementById('kpi-recognized-revenue').textContent = formatCurrency(kpis.recognizedRevenue);
  document.getElementById('kpi-gbv').textContent = formatCurrency(kpis.grossBookingValue);
  document.getElementById('kpi-net-pipeline').textContent = formatCurrency(kpis.netPipelineValue);
  document.getElementById('kpi-aov').textContent = formatCurrency(kpis.averageOrderValue);
  
  // Secondary Cards
  document.getElementById('kpi-total-orders').textContent = formatNumber(kpis.totalOrders);
  document.getElementById('kpi-delivered-orders').textContent = formatNumber(kpis.deliveredOrders);
  document.getElementById('kpi-cancelled-orders').textContent = formatNumber(kpis.cancelledOrders);
  document.getElementById('kpi-cancellation-rate').textContent = formatPercent(kpis.cancellationRate);
  document.getElementById('kpi-units-sold').textContent = formatNumber(kpis.totalUnitsSold);
  document.getElementById('kpi-customers-cohort').textContent = formatNumber(kpis.totalCustomersCohort);
  document.getElementById('kpi-repeat-rate').textContent = formatPercent(kpis.repeatPurchaseRate);
  document.getElementById('kpi-clv').textContent = formatCurrency(kpis.clvHistorical);
}

// Navigation Tab Configuration
function setupTabListeners() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tabName = btn.getAttribute('data-tab');
      state.activeTab = tabName;
      
      // Hide all sheets
      document.querySelectorAll('.dashboard-sheet').forEach(sheet => sheet.classList.remove('active'));
      // Show active sheet
      document.getElementById(`sheet-${tabName}`).classList.add('active');
      
      renderActiveTab();
    });
  });

  // Secondary KPIs toggle
  const toggleBtn = document.getElementById('kpis-toggle-btn');
  const container = document.getElementById('secondary-kpis-container');
  toggleBtn.addEventListener('click', () => {
    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
      container.classList.remove('hidden');
      toggleBtn.querySelector('span').textContent = 'Hide Secondary Operations KPIs';
      toggleBtn.querySelector('i').setAttribute('data-lucide', 'chevron-up');
    } else {
      container.classList.add('hidden');
      toggleBtn.querySelector('span').textContent = 'Show Secondary Operations KPIs';
      toggleBtn.querySelector('i').setAttribute('data-lucide', 'chevron-down');
    }
    lucide.createIcons();
  });

  // Table Subtabs
  const subTabBtns = document.querySelectorAll('.sub-tab-btn');
  subTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      subTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const subtab = btn.getAttribute('data-subtab');
      state.activeSubTab = subtab;
      
      document.querySelectorAll('.sub-table-container').forEach(c => c.classList.remove('active'));
      document.getElementById(subtab).classList.add('active');
      
      renderActiveTab();
    });
  });
}

// Filters Listener
function setupFilterListeners() {
  const inputs = ['filter-start-date', 'filter-end-date', 'filter-city', 'filter-customer', 'filter-gender', 'filter-category', 'filter-product', 'filter-status'];
  
  inputs.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('change', (e) => {
      const filterKey = id.replace('filter-', '').replace('-date', 'Date');
      state.filters[filterKey] = e.target.value;
      refreshAllData().then(() => renderActiveTab());
    });
  });

  // Clear Filters
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    const meta = state.filtersMetadata;
    
    // reset form fields
    document.getElementById('filter-city').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-gender').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-product').value = '';
    document.getElementById('filter-status').value = '';
    
    state.filters.city = '';
    state.filters.customer = '';
    state.filters.gender = '';
    state.filters.category = '';
    state.filters.product = '';
    state.filters.status = '';

    if (meta.dateRange) {
      document.getElementById('filter-start-date').value = meta.dateRange.min_date;
      document.getElementById('filter-end-date').value = meta.dateRange.max_date;
      state.filters.startDate = meta.dateRange.min_date;
      state.filters.endDate = meta.dateRange.max_date;
    }
    
    refreshAllData().then(() => renderActiveTab());
  });

  // Export CSV
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    exportToCSV();
  });
}

// Render the elements corresponding to the Active Tab
function renderActiveTab() {
  switch (state.activeTab) {
    case 'overview':
      renderOverviewTab();
      break;
    case 'products':
      renderProductsTab();
      break;
    case 'customers':
      renderCustomersTab();
      break;
    case 'retention':
      renderRetentionTab();
      break;
    case 'rfm':
      renderRfmTab();
      break;
    case 'tables':
      renderDetailedTablesTab();
      break;
  }
}

/* ============================================================================
   1. OVERVIEW & SALES TAB RENDERERS
   ============================================================================ */
let activeTrendMetric = 'revenue';
let activeTrendInterval = 'monthly';

function renderOverviewTab() {
  setupTrendToggles();
  renderSalesTrendChart();
  renderCityRevenueChart();
  renderCumulativeRevenueChart();
  renderGeoLeaders();
}

function setupTrendToggles() {
  const metrics = ['revenue', 'orders', 'units'];
  metrics.forEach(m => {
    const btn = document.getElementById(`trend-metric-${m}`);
    btn.onclick = () => {
      metrics.forEach(x => document.getElementById(`trend-metric-${x}`).classList.remove('active'));
      btn.classList.add('active');
      activeTrendMetric = m;
      renderSalesTrendChart();
    };
  });

  const intervals = ['monthly', 'daily'];
  intervals.forEach(i => {
    const btn = document.getElementById(`trend-interval-${i}`);
    btn.onclick = () => {
      intervals.forEach(x => document.getElementById(`trend-interval-${x}`).classList.remove('active'));
      btn.classList.add('active');
      activeTrendInterval = i;
      renderSalesTrendChart();
    };
  });
}

function renderSalesTrendChart() {
  const ctx = document.getElementById('chart-sales-trend').getContext('2d');
  
  if (state.charts.salesTrend) state.charts.salesTrend.destroy();

  const dataSet = activeTrendInterval === 'monthly' ? state.revenueTrend.monthly : state.revenueTrend.daily;
  
  if (!dataSet || dataSet.length === 0) {
    renderEmptyChart('chart-sales-trend');
    return;
  }

  const labels = dataSet.map(row => activeTrendInterval === 'monthly' ? row.month : row.date);
  
  let labelText = '';
  let chartData = [];
  let yFormat = (v) => v;

  if (activeTrendMetric === 'revenue') {
    labelText = 'Recognized Revenue';
    chartData = dataSet.map(row => row.recognized_revenue);
    yFormat = formatCurrency;
  } else if (activeTrendMetric === 'orders') {
    labelText = 'Delivered Orders';
    chartData = dataSet.map(row => activeTrendInterval === 'monthly' ? row.delivered_orders : row.total_orders);
    yFormat = formatNumber;
  } else {
    labelText = 'Physical Units Sold';
    chartData = dataSet.map(row => activeTrendInterval === 'monthly' ? row.total_units : row.total_units);
    yFormat = formatNumber;
  }

  state.charts.salesTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: labelText,
        data: chartData,
        borderColor: chartColors.primary,
        backgroundColor: 'rgba(30, 64, 175, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.15,
        pointBackgroundColor: chartColors.primary
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              label += yFormat(context.parsed.y);
              
              // Include extra context on hover
              const row = dataSet[context.dataIndex];
              if (row) {
                const aovVal = row.aov ? `AOV: ${formatCurrency(row.aov)}` : '';
                const momGrowthVal = row.momGrowth !== undefined && row.momGrowth !== null ? `MoM: ${row.momGrowth.toFixed(1)}%` : '';
                return [label, aovVal, momGrowthVal].filter(Boolean);
              }
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: { callback: (val) => activeTrendMetric === 'revenue' ? formatCurrency(val) : formatNumber(val) },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderCityRevenueChart() {
  const ctx = document.getElementById('chart-city-revenue').getContext('2d');
  if (state.charts.cityRevenue) state.charts.cityRevenue.destroy();

  const data = state.geographicAnalysis.slice(0, 10);
  
  if (data.length === 0) {
    renderEmptyChart('chart-city-revenue');
    return;
  }

  state.charts.cityRevenue = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(r => r.city),
      datasets: [{
        label: 'Recognized Revenue',
        data: data.map(r => r.recognized_revenue),
        backgroundColor: chartColors.primaryLight,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `Revenue: ${formatCurrency(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: { ticks: { callback: (val) => formatCurrency(val) }, grid: { color: 'rgba(0,0,0,0.05)' } },
        y: { grid: { display: false } }
      }
    }
  });
}

function renderCumulativeRevenueChart() {
  const ctx = document.getElementById('chart-cumulative-revenue').getContext('2d');
  if (state.charts.cumulativeRevenue) state.charts.cumulativeRevenue.destroy();

  const data = state.runningRevenue;
  
  if (data.length === 0) {
    renderEmptyChart('chart-cumulative-revenue');
    return;
  }

  state.charts.cumulativeRevenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(r => r.date),
      datasets: [{
        label: 'Cumulative Recognized Revenue',
        data: data.map(r => r.running_revenue),
        borderColor: chartColors.accent,
        backgroundColor: 'rgba(217, 119, 6, 0.05)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `Accumulated Sales: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        y: { ticks: { callback: (val) => formatCurrency(val) }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderGeoLeaders() {
  const container = document.getElementById('geo-leaders-container');
  container.innerHTML = '';

  const data = state.geographicAnalysis;
  if (data.length === 0) {
    container.innerHTML = '<div class="no-data">No sales data for geographic leaders.</div>';
    return;
  }

  // Display top 3 cities
  const leaders = data.slice(0, 3);
  leaders.forEach((l, idx) => {
    const item = document.createElement('div');
    item.className = 'geo-leader-item';
    item.innerHTML = `
      <div class="leader-rank-badge">${idx + 1}</div>
      <div class="leader-info">
        <div class="leader-name">${l.city}</div>
        <div class="leader-sub">${formatNumber(l.total_customers)} customer profiles • ${formatNumber(l.total_orders)} orders</div>
      </div>
      <div class="leader-value primary-val">${formatCurrency(l.recognized_revenue)}</div>
    `;
    container.appendChild(item);
  });
}

/* ============================================================================
   2. PRODUCTS & CATEGORIES TAB RENDERERS
   ============================================================================ */
function renderProductsTab() {
  renderCategoryRevenueChart();
  renderCategoryUnitsChart();
  renderProductPerformanceTable();
  renderProductExtremes();
}

function renderCategoryRevenueChart() {
  const ctx = document.getElementById('chart-category-revenue').getContext('2d');
  if (state.charts.categoryRevenue) state.charts.categoryRevenue.destroy();

  const data = state.categoryAnalysis;
  if (data.length === 0) {
    renderEmptyChart('chart-category-revenue');
    return;
  }

  state.charts.categoryRevenue = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(r => r.category),
      datasets: [{
        data: data.map(r => r.recognized_revenue),
        backgroundColor: chartColors.cohorts,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const label = ctx.label || '';
              const value = ctx.parsed;
              const total = ctx.dataset.data.reduce((sum, v) => sum + v, 0);
              const percentage = (value * 100 / total).toFixed(1) + '%';
              return `${label}: ${formatCurrency(value)} (${percentage})`;
            }
          }
        }
      }
    }
  });
}

function renderCategoryUnitsChart() {
  const ctx = document.getElementById('chart-category-units').getContext('2d');
  if (state.charts.categoryUnits) state.charts.categoryUnits.destroy();

  const data = state.categoryAnalysis;
  if (data.length === 0) {
    renderEmptyChart('chart-category-units');
    return;
  }

  state.charts.categoryUnits = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(r => r.category),
      datasets: [{
        label: 'Units Sold',
        data: data.map(r => r.total_units_sold),
        backgroundColor: chartColors.slate,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `Units Sold: ${formatNumber(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        y: { ticks: { callback: (val) => formatNumber(val) }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderProductPerformanceTable() {
  const tbody = document.getElementById('table-products-body');
  tbody.innerHTML = '';

  const tableState = state.tables.products;
  let data = state.productAnalysis.productsList;

  // Apply Search
  if (tableState.search) {
    const sTerm = tableState.search.toLowerCase();
    data = data.filter(p => 
      p.product_name.toLowerCase().includes(sTerm) || 
      p.category.toLowerCase().includes(sTerm)
    );
  }

  // Apply Sorting
  data.sort((a, b) => {
    let valA = a[tableState.sortBy];
    let valB = b[tableState.sortBy];

    // handles string fields
    if (typeof valA === 'string') {
      return tableState.sortOrder === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    
    // numeric fields
    return tableState.sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  // Calculate Pagination
  const totalCount = data.length;
  const totalPages = Math.ceil(totalCount / tableState.limit) || 1;
  if (tableState.page > totalPages) tableState.page = totalPages;

  const startIndex = (tableState.page - 1) * tableState.limit;
  const pageData = data.slice(startIndex, startIndex + tableState.limit);

  // Render Rows
  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No products match search criteria.</td></tr>';
  } else {
    pageData.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${p.product_name}</td>
        <td><span class="badge badge-info">${p.category}</span></td>
        <td class="numeric">${formatNumber(p.total_units_sold)}</td>
        <td class="numeric">${formatNumber(p.total_orders_count)}</td>
        <td class="numeric" style="font-weight:600;">${formatCurrency(p.total_recognized_revenue)}</td>
        <td class="numeric">${formatPercent(p.revenueContributionPct)}</td>
        <td class="numeric" style="color:var(--text-muted);">#${p.revenueRank}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Render Footer controls
  document.getElementById('product-table-summary').textContent = `Showing ${Math.min(startIndex + 1, totalCount)} to ${Math.min(startIndex + tableState.limit, totalCount)} of ${totalCount} products`;
  renderPaginationButtons('product-table-pagination', tableState, totalPages, renderProductPerformanceTable);
}

function renderProductExtremes() {
  // Top selling list
  const topContainer = document.getElementById('top-products-container');
  topContainer.innerHTML = '';
  
  const top10 = state.productAnalysis.top10ByRevenue;
  if (top10.length === 0) {
    topContainer.innerHTML = '<div class="no-data">No sales transactions available.</div>';
  } else {
    top10.slice(0, 5).forEach((p, idx) => {
      const div = document.createElement('div');
      div.className = 'rank-item';
      div.innerHTML = `
        <div class="leader-rank-badge">${idx + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${p.product_name}</div>
          <div class="rank-sub">${p.category} • ${formatNumber(p.total_units_sold)} units sold</div>
        </div>
        <div class="rank-value text-primary">${formatCurrency(p.total_recognized_revenue)}</div>
      `;
      topContainer.appendChild(div);
    });
  }

  // Worst selling list
  const worstContainer = document.getElementById('worst-products-container');
  worstContainer.innerHTML = '';
  
  const worst = state.productAnalysis.worstSelling;
  if (worst.length === 0) {
    worstContainer.innerHTML = '<div class="no-data">No sales transactions available.</div>';
  } else {
    worst.slice(0, 5).forEach((p, idx) => {
      const div = document.createElement('div');
      div.className = 'rank-item';
      div.innerHTML = `
        <div class="leader-rank-badge">${idx + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${p.product_name}</div>
          <div class="rank-sub">${p.category} • ${formatNumber(p.total_units_sold)} units sold</div>
        </div>
        <div class="rank-value">${formatCurrency(p.total_recognized_revenue)}</div>
      `;
      worstContainer.appendChild(div);
    });
  }
}

/* ============================================================================
   3. CUSTOMERS TAB RENDERERS
   ============================================================================ */
function renderCustomersTab() {
  renderCustomerCohortsChart();
  renderGenderRevenueChart();
  renderTopCustomersTable();
}

function renderCustomerCohortsChart() {
  const ctx = document.getElementById('chart-customer-cohorts').getContext('2d');
  if (state.charts.customerCohorts) state.charts.customerCohorts.destroy();

  const data = state.customerAnalysis.cohortSizes;
  const labels = Object.keys(data);
  const values = Object.values(data);

  if (values.every(v => v === 0)) {
    renderEmptyChart('chart-customer-cohorts');
    return;
  }

  state.charts.customerCohorts = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          '#64748b', // Never-Purchased: slate
          '#e2e8f0', // No qualifying: light gray
          '#60a5fa', // One-Time: light blue
          '#1e40af'  // Repeat: deep blue
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `Count: ${ctx.parsed} customers`
          }
        }
      }
    }
  });

  // Render explanatory cohort guidelines
  const descGrid = document.getElementById('cohort-descriptions-grid');
  descGrid.innerHTML = `
    <div class="cohort-legend-item">
      <strong>Never-Purchased</strong>
      <span>Registered customer, placed 0 orders total (${data['Never-Purchased'] || 0} profiles).</span>
    </div>
    <div class="cohort-legend-item">
      <strong>No Qualifying Purchase</strong>
      <span>Placed orders, but 0 are Delivered (${data['No Qualifying Purchase'] || 0} profiles).</span>
    </div>
    <div class="cohort-legend-item">
      <strong>One-Time Buyer</strong>
      <span>Exactly 1 order is Delivered (${data['One-Time Buyer'] || 0} profiles).</span>
    </div>
    <div class="cohort-legend-item">
      <strong>Repeat Purchaser</strong>
      <span>Multiple (>= 2) orders are Delivered (${data['Repeat Purchaser'] || 0} profiles).</span>
    </div>
  `;
}

function renderGenderRevenueChart() {
  const ctx = document.getElementById('chart-gender-revenue').getContext('2d');
  if (state.charts.genderRevenue) state.charts.genderRevenue.destroy();

  const data = state.customerAnalysis.genderRevenue;
  const labels = Object.keys(data);
  const values = Object.values(data);

  if (values.length === 0 || values.every(v => v === 0)) {
    renderEmptyChart('chart-gender-revenue');
    return;
  }

  state.charts.genderRevenue = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#3b82f6', '#ec4899'], // Blue, Pink
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const value = ctx.parsed;
              const total = ctx.dataset.data.reduce((sum, v) => sum + v, 0);
              return `${ctx.label}: ${formatCurrency(value)} (${(value*100/total).toFixed(1)}%)`;
            }
          }
        }
      }
    }
  });
}

function renderTopCustomersTable() {
  const tbody = document.getElementById('table-top-customers-body');
  tbody.innerHTML = '';

  const data = state.customerAnalysis.topCustomers;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="no-data">No customer data matches the filters.</td></tr>';
    return;
  }

  data.slice(0, 10).forEach(c => {
    const tr = document.createElement('tr');
    const maxOrderVal = c.highestOrder ? formatCurrency(c.highestOrder.order_total) : 'N/A';
    
    tr.innerHTML = `
      <td style="font-weight:600;">${c.customer_name}</td>
      <td>${c.city}</td>
      <td>${c.gender}</td>
      <td class="numeric">${formatNumber(c.total_orders)}</td>
      <td class="numeric">${formatNumber(c.delivered_orders)}</td>
      <td class="numeric" style="font-weight:600; color:var(--primary);">${formatCurrency(c.recognized_spend)}</td>
      <td class="numeric">${formatCurrency(c.aov)}</td>
      <td class="numeric" style="font-style:italic;">${maxOrderVal}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ============================================================================
   4. RETENTION & CHURN TAB RENDERERS
   ============================================================================ */
function renderRetentionTab() {
  renderMAUTrendChart();
  renderAcquisitionChart();
  renderCohortRetentionMatrix();
  renderRiskLists();
}

function renderMAUTrendChart() {
  const ctx = document.getElementById('chart-mau-trend').getContext('2d');
  if (state.charts.mau) state.charts.mau.destroy();

  const data = state.retentionAnalysis.monthlyActive;
  if (data.length === 0) {
    renderEmptyChart('chart-mau-trend');
    return;
  }

  state.charts.mau = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(r => r.month),
      datasets: [{
        label: 'Monthly Active Customers (All orders)',
        data: data.map(r => r.active_customers),
        backgroundColor: 'rgba(30, 64, 175, 0.4)',
        borderColor: chartColors.primary,
        borderWidth: 1,
        borderRadius: 4
      }, {
        label: 'Unique Delivering Customers',
        data: data.map(r => r.active_delivered_customers),
        backgroundColor: chartColors.primary,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} customers`
          }
        }
      },
      scales: {
        y: { ticks: { callback: (val) => formatNumber(val) }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderAcquisitionChart() {
  const ctx = document.getElementById('chart-acquisition-trend').getContext('2d');
  if (state.charts.acquisition) state.charts.acquisition.destroy();

  // Load acquisition data
  const signupsRes = state.customerAnalysis.customersList; // list of customers, has signup_date
  // We can group signups and first purchases by month on the frontend or backend.
  // We already have /api/acquisition endpoint data in state.customerAnalysis / state.retentionAnalysis if fetched.
  // Wait, let's fetch signup trend from our state or call /api/acquisition endpoint
  // Let's call /api/acquisition dynamically if not loaded, or load in refreshAllData.
  // Oh, wait! In refreshAllData, I made a call to `/api/acquisition` but wait...
  // Let me look at refreshAllData, I did not call `/api/acquisition`!
  // Wait, in my `refreshAllData` call, I ran:
  // fetch(`/api/customer-analysis?${qStr}`).then(r => r.json()),
  // fetch(`/api/retention-analysis?${qStr}`).then(r => r.json()),
  // let's see. In server.js we added app.get('/api/acquisition'). So let's make sure we query `/api/acquisition` too.
  // Let's see if we did. In refreshAllData: I did not call `/api/acquisition`.
  // Wait! I can fetch the acquisition data directly inside renderAcquisitionChart if it's missing, or modify refreshAllData.
  // Let's write a simple fetch directly inside renderAcquisitionChart to fetch it! It's very simple.
  
  const qStr = new URLSearchParams(state.filters).toString();
  fetch(`${API_BASE}/api/acquisition?${qStr}`)
    .then(r => r.json())
    .then(data => {
      if (data.signups.length === 0 && data.firstPurchases.length === 0) {
        renderEmptyChart('chart-acquisition-trend');
        return;
      }

      // Merge months
      const allMonthsSet = new Set([
        ...data.signups.map(s => s.month),
        ...data.firstPurchases.map(p => p.month)
      ]);
      const months = Array.from(allMonthsSet).sort();

      const signupMap = data.signups.reduce((acc, r) => { acc[r.month] = r.new_signups; return acc; }, {});
      const purchaseMap = data.firstPurchases.reduce((acc, r) => { acc[r.month] = r.first_time_buyers; return acc; }, {});

      state.charts.acquisition = new Chart(ctx, {
        type: 'line',
        data: {
          labels: months,
          datasets: [{
            label: 'New Account Signups',
            data: months.map(m => signupMap[m] || 0),
            borderColor: chartColors.slate,
            borderWidth: 2,
            tension: 0.1,
            fill: false
          }, {
            label: 'First Transactions (Delivered)',
            data: months.map(m => purchaseMap[m] || 0),
            borderColor: chartColors.primary,
            borderWidth: 2,
            tension: 0.1,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { ticks: { callback: (val) => formatNumber(val) }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });
    });
}

function renderCohortRetentionMatrix() {
  const tbody = document.getElementById('table-cohort-retention-body');
  tbody.innerHTML = '';

  const matrix = state.retentionAnalysis.cohortMatrix;
  if (!matrix || matrix.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">No cohort data available under filters.</td></tr>';
    return;
  }

  matrix.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${row.cohortMonth}</td>
      <td style="background-color:#f1f5f9;">${formatNumber(row.cohortSize)}</td>
    `;
    
    row.retention.forEach((count, idx) => {
      // Show retention percentage
      const pct = row.cohortSize > 0 ? (count * 100.0 / row.cohortSize) : 0;
      
      const cell = document.createElement('td');
      cell.className = 'retention-cell';
      cell.textContent = count > 0 ? `${pct.toFixed(1)}%` : '0.0%';
      
      // Heatmap styling based on retention rate
      const alpha = Math.min(pct / 100, 0.8).toFixed(2);
      cell.style.backgroundColor = `rgba(30, 64, 175, ${alpha})`;
      cell.style.color = pct > 45 ? '#ffffff' : '#0f172a';
      tr.appendChild(cell);
    });

    tbody.appendChild(tr);
  });
}

function renderRiskLists() {
  // Churn-risk list (Inactive > 120 Days)
  const churnBody = document.getElementById('list-churn-risk-body');
  churnBody.innerHTML = '';
  const churnData = state.churnAnalysis.churnRiskList;
  if (churnData.length === 0) {
    churnBody.innerHTML = '<tr><td colspan="3" class="no-data">0 customers at churn risk.</td></tr>';
  } else {
    churnData.slice(0, 10).forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600; color:var(--orange-accent);">${c.customer_name}</td>
        <td>${c.city}</td>
        <td class="numeric" style="font-weight:700;">${formatNumber(c.daysInactive)} days</td>
      `;
      churnBody.appendChild(tr);
    });
  }

  // Inactive list (Inactive > 90 Days)
  const inactiveBody = document.getElementById('list-inactive-body');
  inactiveBody.innerHTML = '';
  const inactiveData = state.churnAnalysis.inactiveList;
  if (inactiveData.length === 0) {
    inactiveBody.innerHTML = '<tr><td colspan="3" class="no-data">0 inactive customers.</td></tr>';
  } else {
    inactiveData.slice(0, 10).forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${c.customer_name}</td>
        <td>${c.city}</td>
        <td class="numeric">${formatNumber(c.daysInactive)} days</td>
      `;
      inactiveBody.appendChild(tr);
    });
  }
}

/* ============================================================================
   5. RFM & AFFINITY TAB RENDERERS
   ============================================================================ */
function renderRfmTab() {
  renderRFMScatterChart();
  renderRFMSegmentsChart();
  renderRFMSummaryTable();
  renderProductAffinityTable();
  renderOrderGapChart();
}

function renderRFMScatterChart() {
  const ctx = document.getElementById('chart-rfm-scatter').getContext('2d');
  if (state.charts.rfmScatter) state.charts.rfmScatter.destroy();

  const data = state.rfmAnalysis.customers;
  if (data.length === 0) {
    renderEmptyChart('chart-rfm-scatter');
    return;
  }

  // Group dataset by segment
  const datasetsMap = {};
  data.forEach(c => {
    const seg = c.customer_segment;
    if (!datasetsMap[seg]) {
      datasetsMap[seg] = {
        label: seg,
        data: [],
        backgroundColor: chartColors.segments[seg] || '#64748b',
        pointRadius: 6,
        pointHoverRadius: 8
      };
    }
    // X = Recency (days since order), Y = Monetary (recognized spend)
    datasetsMap[seg].data.push({
      x: c.recency,
      y: c.monetary,
      r: Math.max(3, Math.min(c.frequency * 2, 15)), // bubble size represents order count
      customerName: c.customer_name,
      frequency: c.frequency,
      rfmCode: c.rfm_code
    });
  });

  state.charts.rfmScatter = new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: Object.values(datasetsMap)
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            title: function(tooltipItems) {
              return tooltipItems[0].raw.customerName;
            },
            label: function(ctx) {
              const d = ctx.raw;
              return [
                `Segment: ${ctx.dataset.label}`,
                `Recency (Days Inactive): ${d.x.toFixed(0)} days`,
                `Monetary (CLV): ${formatCurrency(d.y)}`,
                `Frequency (Delivered Orders): ${d.frequency}`,
                `RFM Code: ${d.rfmCode}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Recency (Days Since Last Delivered Order)' },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        y: {
          title: { display: true, text: 'Monetary Value (INR Recognized spend)' },
          ticks: { callback: (val) => formatCurrency(val) },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    }
  });
}

function renderRFMSegmentsChart() {
  const ctx = document.getElementById('chart-rfm-segments').getContext('2d');
  if (state.charts.rfmSegments) state.charts.rfmSegments.destroy();

  const data = state.rfmAnalysis.summary;
  if (data.length === 0) {
    renderEmptyChart('chart-rfm-segments');
    return;
  }

  // Filter segments with size > 0
  const activeSegs = data.filter(s => s.size > 0).sort((a,b) => b.size - a.size);

  state.charts.rfmSegments = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: activeSegs.map(s => s.segment),
      datasets: [{
        label: 'Customers count',
        data: activeSegs.map(s => s.size),
        backgroundColor: activeSegs.map(s => chartColors.segments[s.segment] || '#64748b'),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.05)' } },
        y: { grid: { display: false } }
      }
    }
  });
}

function renderRFMSummaryTable() {
  const tbody = document.getElementById('table-rfm-summary-body');
  tbody.innerHTML = '';

  const summary = state.rfmAnalysis.summary;
  const totalCustomers = summary.reduce((sum, r) => sum + r.size, 0);

  if (totalCustomers === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No active RFM purchasers.</td></tr>';
    return;
  }

  summary.forEach(s => {
    const tr = document.createElement('tr');
    const pct = totalCustomers > 0 ? (s.size * 100 / totalCustomers) : 0;
    
    tr.innerHTML = `
      <td style="font-weight:700;"><span style="display:inline-block; width:10px; height:10px; background-color:${chartColors.segments[s.segment]}; border-radius:50%; margin-right:8px;"></span>${s.segment}</td>
      <td class="numeric" style="font-weight:600;">${s.size}</td>
      <td class="numeric">${formatPercent(pct)}</td>
      <td class="numeric">${s.size > 0 ? formatNumber(s.avgRecency) + ' d' : '-'}</td>
      <td class="numeric">${s.size > 0 ? formatNumber(s.avgFrequency) + ' orders' : '-'}</td>
      <td class="numeric">${s.size > 0 ? formatCurrency(s.avgMonetary) : '-'}</td>
      <td class="numeric" style="font-weight:600; color:var(--primary);">${formatCurrency(s.totalMonetary)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderProductAffinityTable() {
  const tbody = document.getElementById('table-affinity-body');
  tbody.innerHTML = '';

  const data = state.productAffinity;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="no-data">No co-purchase pairings found under filters.</td></tr>';
    return;
  }

  data.slice(0, 10).forEach(pair => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${pair.product_a} <span class="badge badge-info" style="font-size:0.65rem;">${pair.category_a}</span></td>
      <td style="font-weight:600;">${pair.product_b} <span class="badge badge-info" style="font-size:0.65rem;">${pair.category_b}</span></td>
      <td class="numeric" style="font-weight:700; color:var(--primary);">${formatNumber(pair.shared_orders)} orders</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderOrderGapChart() {
  const ctx = document.getElementById('chart-order-gap').getContext('2d');
  if (state.charts.orderGap) state.charts.orderGap.destroy();

  const data = state.orderFrequency.gapsDistribution;
  
  if (data.length === 0) {
    renderEmptyChart('chart-order-gap');
    document.getElementById('order-cycle-stats').innerHTML = '';
    return;
  }

  // Display summary stats
  document.getElementById('order-cycle-stats').innerHTML = `
    <div class="cycle-stat-item">
      <strong>${state.orderFrequency.averageGapDays.toFixed(2)} days</strong>
      <span>Average Order Cycle (Gap)</span>
    </div>
    <div class="cycle-stat-item">
      <strong>${state.orderFrequency.totalGapsCount} repeat gaps</strong>
      <span>Total observed repeat cycles</span>
    </div>
  `;

  // Draw chart of gap intervals
  // Group gaps into buckets: 1-7 days, 8-14 days, 15-21 days, 22-30 days, 31-60 days, 60+ days
  const buckets = {
    '1-5 Days': 0,
    '6-10 Days': 0,
    '11-15 Days': 0,
    '16-20 Days': 0,
    '21-30 Days': 0,
    '31-50 Days': 0,
    '50+ Days': 0
  };

  data.forEach(row => {
    const gap = row.days_gap;
    if (gap <= 5) buckets['1-5 Days'] += row.order_count;
    else if (gap <= 10) buckets['6-10 Days'] += row.order_count;
    else if (gap <= 15) buckets['11-15 Days'] += row.order_count;
    else if (gap <= 20) buckets['16-20 Days'] += row.order_count;
    else if (gap <= 30) buckets['21-30 Days'] += row.order_count;
    else if (gap <= 50) buckets['31-50 Days'] += row.order_count;
    else buckets['50+ Days'] += row.order_count;
  });

  state.charts.orderGap = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        label: 'Gap Frequency (Orders Count)',
        data: Object.values(buckets),
        backgroundColor: chartColors.primary,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { callback: (val) => formatNumber(val) }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

/* ============================================================================
   6. DETAILED DATA TABLES TAB RENDERERS
   ============================================================================ */
function renderDetailedTablesTab() {
  if (state.activeSubTab === 'customer-detail') {
    renderCustomerDetailMasterTable();
  } else {
    renderOrderDetailMasterTable();
  }
}

function renderCustomerDetailMasterTable() {
  const tbody = document.getElementById('table-customer-detail-body');
  tbody.innerHTML = '';

  const tableState = state.tables.customersDetail;
  let data = state.customerAnalysis.customersList;

  // Apply Search
  if (tableState.search) {
    const sTerm = tableState.search.toLowerCase();
    data = data.filter(c => 
      c.customer_name.toLowerCase().includes(sTerm) || 
      c.city.toLowerCase().includes(sTerm) || 
      c.purchasingCohort.toLowerCase().includes(sTerm) ||
      String(c.customer_id).includes(sTerm)
    );
  }

  // Apply Sorting
  data.sort((a, b) => {
    let valA = a[tableState.sortBy];
    let valB = b[tableState.sortBy];

    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (typeof valA === 'string') {
      return tableState.sortOrder === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    
    return tableState.sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const totalCount = data.length;
  const totalPages = Math.ceil(totalCount / tableState.limit) || 1;
  if (tableState.page > totalPages) tableState.page = totalPages;

  const startIndex = (tableState.page - 1) * tableState.limit;
  const pageData = data.slice(startIndex, startIndex + tableState.limit);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="no-data">No customers found.</td></tr>';
  } else {
    pageData.forEach(c => {
      const lastOrder = c.last_qualifying_order || 'N/A';
      const daysSince = c.daysSinceLastOrder !== null ? formatNumber(c.daysSinceLastOrder) + ' d' : '-';
      
      let badgeClass = 'badge-success';
      if (c.purchasingCohort === 'Never-Purchased') badgeClass = 'badge-danger';
      else if (c.purchasingCohort === 'No Qualifying Purchase') badgeClass = 'badge-warning';
      else if (c.purchasingCohort === 'One-Time Buyer') badgeClass = 'badge-info';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600; color:var(--text-muted);">#${c.customer_id}</td>
        <td style="font-weight:700;">${c.customer_name}</td>
        <td>${c.city}</td>
        <td>${c.gender}</td>
        <td class="numeric">${formatNumber(c.total_orders)}</td>
        <td class="numeric">${formatNumber(c.delivered_orders)}</td>
        <td class="numeric" style="font-weight:700;">${formatCurrency(c.recognized_spend)}</td>
        <td class="numeric">${formatCurrency(c.aov)}</td>
        <td>${lastOrder}</td>
        <td class="numeric">${daysSince}</td>
        <td><span class="badge ${badgeClass}">${c.purchasingCohort}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('customer-detail-summary').textContent = `Showing ${Math.min(startIndex + 1, totalCount)} to ${Math.min(startIndex + tableState.limit, totalCount)} of ${totalCount} customers`;
  renderPaginationButtons('customer-detail-pagination', tableState, totalPages, renderCustomerDetailMasterTable);
}

function renderOrderDetailMasterTable() {
  const tbody = document.getElementById('table-order-detail-body');
  tbody.innerHTML = '';

  const tableState = state.tables.ordersDetail;
  let data = state.ordersList;

  // Apply Search
  if (tableState.search) {
    const sTerm = tableState.search.toLowerCase();
    data = data.filter(o => 
      o.customer_name.toLowerCase().includes(sTerm) || 
      o.customer_city.toLowerCase().includes(sTerm) || 
      o.order_status.toLowerCase().includes(sTerm) ||
      String(o.order_id).includes(sTerm)
    );
  }

  // Apply Sorting
  data.sort((a, b) => {
    let valA = a[tableState.sortBy];
    let valB = b[tableState.sortBy];

    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (typeof valA === 'string') {
      return tableState.sortOrder === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    
    return tableState.sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const totalCount = data.length;
  const totalPages = Math.ceil(totalCount / tableState.limit) || 1;
  if (tableState.page > totalPages) tableState.page = totalPages;

  const startIndex = (tableState.page - 1) * tableState.limit;
  const pageData = data.slice(startIndex, startIndex + tableState.limit);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="no-data">No transactions match the criteria.</td></tr>';
  } else {
    pageData.forEach(o => {
      let badgeClass = 'badge-success';
      if (o.order_status === 'Cancelled') badgeClass = 'badge-danger';
      else if (o.order_status === 'Pending') badgeClass = 'badge-warning';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:var(--text-muted);">#${o.order_id}</td>
        <td>${o.order_date}</td>
        <td style="font-weight:600;">${o.customer_name}</td>
        <td>${o.customer_city}</td>
        <td><span class="badge ${badgeClass}">${o.order_status}</span></td>
        <td class="numeric">${formatNumber(o.unique_item_count)}</td>
        <td class="numeric">${formatNumber(o.total_quantity)}</td>
        <td class="numeric">${formatCurrency(o.gross_booking_value)}</td>
        <td class="numeric" style="font-weight:700;">${formatCurrency(o.recognized_revenue)}</td>
        <td class="numeric">${formatCurrency(o.net_pipeline_value)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('order-detail-summary').textContent = `Showing ${Math.min(startIndex + 1, totalCount)} to ${Math.min(startIndex + tableState.limit, totalCount)} of ${totalCount} transactions`;
  renderPaginationButtons('order-detail-pagination', tableState, totalPages, renderOrderDetailMasterTable);
}

// Helpers for Tables: Sort & Pagination setup
function setupTableControls() {
  // 1. PRODUCTS TABLE
  document.getElementById('product-table-search').addEventListener('input', (e) => {
    state.tables.products.search = e.target.value;
    state.tables.products.page = 1;
    renderProductPerformanceTable();
  });
  setupTableSortHeaders('table-products', state.tables.products, renderProductPerformanceTable);

  // 2. CUSTOMERS DETAIL MASTER
  document.getElementById('customer-detail-search').addEventListener('input', (e) => {
    state.tables.customersDetail.search = e.target.value;
    state.tables.customersDetail.page = 1;
    renderCustomerDetailMasterTable();
  });
  setupTableSortHeaders('table-customer-detail', state.tables.customersDetail, renderCustomerDetailMasterTable);

  // 3. ORDERS DETAIL MASTER
  document.getElementById('order-detail-search').addEventListener('input', (e) => {
    state.tables.ordersDetail.search = e.target.value;
    state.tables.ordersDetail.page = 1;
    renderOrderDetailMasterTable();
  });
  setupTableSortHeaders('table-order-detail', state.tables.ordersDetail, renderOrderDetailMasterTable);
}

function setupTableSortHeaders(tableId, tableState, renderFn) {
  const headers = document.querySelectorAll(`#${tableId} th.sortable`);
  headers.forEach(h => {
    h.addEventListener('click', () => {
      const sortBy = h.getAttribute('data-sort');
      
      // Update sorting icon
      headers.forEach(el => {
        el.querySelector('.sort-icon').className = 'sort-icon';
      });

      if (tableState.sortBy === sortBy) {
        tableState.sortOrder = tableState.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        tableState.sortBy = sortBy;
        tableState.sortOrder = 'desc';
      }

      h.querySelector('.sort-icon').className = `sort-icon lucide-${tableState.sortOrder === 'asc' ? 'chevron-up' : 'chevron-down'}`;
      // Recreate icons since we inject icons dynamically
      h.innerHTML = h.innerHTML; // redraw to clear old icon tags
      h.querySelector('.sort-icon').innerHTML = ''; // reset container
      
      // Re-apply click listener (innerHTML redraw requires this)
      setupTableSortHeaders(tableId, tableState, renderFn);

      tableState.page = 1;
      renderFn();
    });
  });
}

function renderPaginationButtons(containerId, tableState, totalPages, renderFn) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (totalPages <= 1) return;

  // Previous Button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.innerHTML = '&laquo;';
  prevBtn.disabled = tableState.page === 1;
  prevBtn.onclick = () => {
    if (tableState.page > 1) {
      tableState.page--;
      renderFn();
    }
  };
  container.appendChild(prevBtn);

  // Visible pages range (max 5 pages shown)
  const maxButtons = 5;
  let startPage = Math.max(1, tableState.page - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    const btn = document.createElement('button');
    btn.className = `pagination-btn ${p === tableState.page ? 'active' : ''}`;
    btn.textContent = p;
    btn.onclick = () => {
      tableState.page = p;
      renderFn();
    };
    container.appendChild(btn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.innerHTML = '&raquo;';
  nextBtn.disabled = tableState.page === totalPages;
  nextBtn.onclick = () => {
    if (tableState.page < totalPages) {
      tableState.page++;
      renderFn();
    }
  };
  container.appendChild(nextBtn);
}

// Render empty states for charts that hold zero matching records
function renderEmptyChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Render message in center
  ctx.fillStyle = '#64748b';
  ctx.font = '14px -apple-system, BlinkMacSystemFont';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No data matching active filters.', canvas.width / 2, canvas.height / 2);
}

// Generic CSV Export function for current lists
function exportToCSV() {
  let headers = [];
  let rows = [];
  let filename = 'ecommerce_export.csv';

  if (state.activeTab === 'overview') {
    filename = 'overview_monthly_sales.csv';
    headers = ['Month', 'Total Orders', 'Delivered Orders', 'Recognized Revenue', 'Gross Value'];
    rows = state.revenueTrend.monthly.map(r => [r.month, r.total_orders, r.delivered_orders, r.recognized_revenue, r.gross_booking_value]);
  } else if (state.activeTab === 'products') {
    filename = 'products_performance.csv';
    headers = ['Product Name', 'Category', 'Catalog Price', 'Units Sold', 'Orders Count', 'Recognized Revenue', 'Contribution %'];
    rows = state.productAnalysis.productsList.map(p => [p.product_name, p.category, p.catalog_unit_price, p.total_units_sold, p.total_orders_count, p.total_recognized_revenue, p.revenueContributionPct]);
  } else if (state.activeTab === 'customers') {
    filename = 'top_customers.csv';
    headers = ['Customer Name', 'City', 'Gender', 'Orders placed', 'Delivered Orders', 'Spend (INR)', 'AOV (INR)'];
    rows = state.customerAnalysis.topCustomers.map(c => [c.customer_name, c.city, c.gender, c.total_orders, c.delivered_orders, c.recognized_spend, c.aov]);
  } else if (state.activeTab === 'retention') {
    filename = 'retention_mau.csv';
    headers = ['Month', 'Monthly Active Customers', 'Unique Delivering Customers'];
    rows = state.retentionAnalysis.monthlyActive.map(r => [r.month, r.active_customers, r.active_delivered_customers]);
  } else if (state.activeTab === 'rfm') {
    filename = 'rfm_segment_summary.csv';
    headers = ['Segment Name', 'Size', 'Recency Avg (d)', 'Frequency Avg (orders)', 'Monetary Avg (CLV)'];
    rows = state.rfmAnalysis.summary.map(s => [s.segment, s.size, s.avgRecency, s.avgFrequency, s.avgMonetary]);
  } else {
    filename = 'orders_detail_register.csv';
    headers = ['Order ID', 'Order Date', 'Customer', 'City', 'Status', 'Unique Items', 'Quantity', 'Gross Value', 'Recognized revenue'];
    rows = state.ordersList.map(o => [o.order_id, o.order_date, o.customer_name, o.customer_city, o.order_status, o.unique_item_count, o.total_quantity, o.gross_booking_value, o.recognized_revenue]);
  }

  // Generate CSV text
  let csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
