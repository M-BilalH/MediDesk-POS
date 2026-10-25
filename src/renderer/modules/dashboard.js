/**
 * MediDesk POS - Executive Dashboard Module
 * Renders KPI cards, revenue trend chart, payment distribution,
 * top demanding products, and supply restock schedule.
 * All data fetched via named IPC handlers (no raw SQL).
 */

function setupDashboardEvents() {
  const refreshBtn = document.getElementById('btnRefreshDashboard');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', renderDashboard);
  }
}

async function renderDashboard() {
  const refreshBtn = document.getElementById('btnRefreshDashboard');
  if (refreshBtn) refreshBtn.textContent = '⏳ Loading...';

  try {
    // Fetch all dashboard data in parallel
    const [statsRes, trendRes, payDistRes, topProdRes, supplyRes] = await Promise.all([
      window.api.getDashboardStats(),
      window.api.getDashboardTrend(),
      window.api.getPaymentDistribution
        ? window.api.getPaymentDistribution()
        : window.api.getDashboardPaymentDist(),
      window.api.getTopProducts
        ? window.api.getTopProducts()
        : window.api.getDashboardTopProducts(),
      window.api.getSupplySchedule
        ? window.api.getSupplySchedule()
        : window.api.getDashboardSupplySchedule()
    ]);

    // --- KPI Cards ---
    if (statsRes.success && statsRes.data) {
      const s = statsRes.data;
      const totalSalesEl = document.getElementById('dashTotalSales');
      const totalInvoicesEl = document.getElementById('dashTotalInvoices');
      const todaySalesEl = document.getElementById('dashTodaySales');
      const todayInvoicesEl = document.getElementById('dashTodayInvoices');
      const debtEl = document.getElementById('dashCustomerDebt');
      const riskEl = document.getElementById('dashRiskAlerts');

      if (totalSalesEl) totalSalesEl.textContent = formatCurrency(s.totalRevenue || 0);
      if (totalInvoicesEl) totalInvoicesEl.textContent = `${s.totalInvoices || 0} Completed Invoices`;
      if (todaySalesEl) todaySalesEl.textContent = formatCurrency(s.todayRevenue || 0);
      if (todayInvoicesEl) todayInvoicesEl.textContent = `${s.todayInvoices || 0} Sales Today`;
      if (debtEl) debtEl.textContent = formatCurrency(s.totalDebt || 0);
      if (riskEl) riskEl.textContent = s.riskCount || 0;
    }

    // --- Revenue Trend Bar Chart ---
    if (trendRes.success && trendRes.data) {
      renderSalesTrendChart(trendRes.data);
    }

    // --- Payment Distribution ---
    if (payDistRes && payDistRes.success && payDistRes.data) {
      renderPaymentDistribution(payDistRes.data);
    }

    // --- Top Demanding Products ---
    if (topProdRes && topProdRes.success && topProdRes.data) {
      renderTopDemandingProducts(topProdRes.data);
    }

    // --- Supply Restock Schedule ---
    if (supplyRes && supplyRes.success && supplyRes.data) {
      renderSupplySchedule(supplyRes.data);
    }

  } catch (err) {
    console.error('Dashboard render error:', err);
  } finally {
    if (refreshBtn) refreshBtn.textContent = '🔄 Refresh Data';
  }
}

function renderSalesTrendChart(trendData) {
  const container = document.getElementById('chartSalesTrendContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!trendData || trendData.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:var(--text-muted); width:100%; align-self:center;">No sales data yet</div>';
    return;
  }

  // Sort ascending so oldest day is on the left
  const sorted = [...trendData].sort((a, b) => (a.day > b.day ? 1 : -1));
  const maxTotal = Math.max(...sorted.map(d => d.total || 0), 1);

  sorted.forEach(day => {
    const total = day.total || 0;
    const heightPct = Math.max(5, Math.round((total / maxTotal) * 100));
    const label = day.day ? day.day.slice(5) : '??'; // MM-DD

    const col = document.createElement('div');
    col.style.cssText = 'flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; justify-content:flex-end;';

    const bar = document.createElement('div');
    bar.style.cssText = `
      width:80%; height:${heightPct}%; min-height:4px;
      background:linear-gradient(180deg, var(--primary), var(--accent));
      border-radius:4px 4px 0 0;
      position:relative; cursor:default;
      transition:opacity 0.2s;
    `;
    bar.title = `${label}: ${formatCurrency(total)}`;
    bar.addEventListener('mouseenter', () => bar.style.opacity = '0.8');
    bar.addEventListener('mouseleave', () => bar.style.opacity = '1');

    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size:0.65rem; color:var(--text-muted); white-space:nowrap;';
    labelEl.textContent = label;

    col.appendChild(bar);
    col.appendChild(labelEl);
    container.appendChild(col);
  });
}

function renderPaymentDistribution(payData) {
  const container = document.getElementById('chartPaymentDistribution');
  if (!container) return;
  container.innerHTML = '';

  if (!payData || payData.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:var(--text-muted);">No payment data yet</div>';
    return;
  }

  const grandTotal = payData.reduce((sum, p) => sum + (p.total || 0), 0) || 1;
  const colors = {
    'CASH': 'var(--accent)',
    'CARD': 'var(--primary)',
    'MOBILE WALLET': 'var(--warning)',
    'CREDIT': 'var(--danger)'
  };

  payData.forEach(p => {
    const pct = Math.round(((p.total || 0) / grandTotal) * 100);
    const color = colors[p.payment_method] || 'var(--text-muted)';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; flex-direction:column; gap:4px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; font-size:0.8rem;';
    header.innerHTML = `<span style="font-weight:600;">${escapeHtml(p.payment_method)}</span><span style="color:${color}; font-weight:700;">${pct}% — ${formatCurrency(p.total || 0)}</span>`;

    const barTrack = document.createElement('div');
    barTrack.style.cssText = 'height:8px; background:var(--border-color); border-radius:4px; overflow:hidden;';

    const barFill = document.createElement('div');
    barFill.style.cssText = `height:100%; width:${pct}%; background:${color}; border-radius:4px; transition:width 0.6s ease;`;

    barTrack.appendChild(barFill);
    row.appendChild(header);
    row.appendChild(barTrack);
    container.appendChild(row);
  });
}

function renderTopDemandingProducts(topData) {
  const tbody = document.getElementById('dashTopDemandingBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!topData || topData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No sales data yet</td></tr>';
    return;
  }

  topData.slice(0, 10).forEach((p, idx) => {
    const tr = document.createElement('tr');
    const rankColors = ['🥇', '🥈', '🥉'];
    const rank = rankColors[idx] || `#${idx + 1}`;
    tr.innerHTML = `
      <td style="font-weight:700;">${rank}</td>
      <td><strong>${escapeHtml(p.product_title || p.title || 'Unknown')}</strong>
        ${p.unit_type ? `<span style="font-size:0.7rem; color:var(--text-muted); margin-left:4px;">${p.unit_type}</span>` : ''}
      </td>
      <td style="font-weight:700; color:var(--accent);">${p.qty || p.total_qty || 0}</td>
      <td style="font-weight:700; color:var(--primary);">${formatCurrency(p.rev || p.total_revenue || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSupplySchedule(supplyData) {
  const tbody = document.getElementById('dashSupplyScheduleBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!supplyData || supplyData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">All stock levels are healthy ✅</td></tr>';
    return;
  }

  supplyData.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name || 'Unknown Supplier')}</strong></td>
      <td><span style="color:var(--danger); font-weight:700;">${s.count || 0}</span> low-stock item(s)</td>
      <td>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;"
          onclick="switchView('ordersView')">
          📋 Order
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
