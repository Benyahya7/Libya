const DB_KEY = 'shipeh_manager_ultimate_data';

let state = JSON.parse(localStorage.getItem(DB_KEY)) || {
    products: [],
    logs: [],
    settings: { rateLyd: 4.80, rateIqd: 1310, goal: 5000 }
};

let charts = {};

function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => {
        if (n.textContent.toLowerCase().includes(viewId.split('-')[0])) n.classList.add('active');
    });

    if (viewId === 'trends') renderCharts();
    renderData();
}

function toggleForm(id) { document.getElementById(id).classList.toggle('hidden'); }

function calculateFinancials(log, product) {
    if (!product) return { revenue: 0, netProfit: 0, roi: 0 };
    const isLibya = product.market === 'libya';
    const revenue = log.delivered * product.price;
    const cogs = log.delivered * product.cost;
    let fees = 0;

    if (isLibya) {
        fees += log.leads * 0.20 + log.confirmed * 1.60 + log.delivered * 6.64 + revenue * 0.02;
    } else {
        fees += log.leads * 0.20 + log.confirmed * 1.00 + log.delivered * 4.90 + revenue * 0.05 + (log.confirmed - log.delivered) * 1.50;
    }
    const totExpenses = cogs + fees + log.spend;
    const netProfit = revenue - totExpenses;
    return { revenue, netProfit, roi: totExpenses > 0 ? (netProfit / totExpenses) * 100 : 0 };
}

function calculateSmartSignals() {
    const productId = document.getElementById('log-product').value;
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    // Fixed Math for Max CPL
    const confRate = 0.6; const delRate = 0.7; // Historical baseline
    const perUnitFee = product.market === 'libya' ? (1.2 + 5.44 + (product.price * 0.02)) : (1.0 + 3.9 + (product.price * 0.05));
    const profitPerDel = product.price - product.cost - perUnitFee;
    const fixedCostPerLead = product.market === 'libya' ? (0.2 + 1.6 * confRate) : (0.2 + 1.0 * confRate);
    const maxCPL = (profitPerDel * confRate * delRate) - fixedCostPerLead;

    document.getElementById('calc-max-cpl').textContent = `$${Math.max(0, maxCPL).toFixed(2)}`;

    // Inventory Sidebar warning
    const prodLogs = state.logs.filter(l => l.productId === productId);
    const sold = prodLogs.reduce((sum, l) => sum + l.delivered, 0);
    const currentStock = product.initialStock - sold;
    const velocity = prodLogs.length > 0 ? sold / prodLogs.length : 0;
    const daysLeft = velocity > 0 ? currentStock / velocity : 999;
    
    const warn = document.getElementById('stock-warning');
    if (daysLeft < 7) {
        warn.style.display = 'block';
        document.getElementById('days-left-warn').textContent = Math.round(daysLeft);
    } else {
        warn.style.display = 'none';
    }
}

function renderCharts() {
    if (charts.main) charts.main.destroy();
    if (charts.agent) charts.agent.destroy();

    // Main Trend
    const dateGroups = {};
    state.logs.forEach(l => {
        if (!dateGroups[l.date]) dateGroups[l.date] = 0;
        const p = state.products.find(prod => prod.id === l.productId);
        dateGroups[l.date] += calculateFinancials(l, p).netProfit;
    });
    const labels = Object.keys(dateGroups).sort();
    charts.main = new Chart(document.getElementById('mainTrendsChart'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Daily Profit', data: labels.map(d => dateGroups[d]), borderColor: '#34c759' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Agent Efficiency
    const agentGroups = {};
    state.logs.forEach(l => {
        if (!l.agent) return;
        if (!agentGroups[l.agent]) agentGroups[l.agent] = { leads: 0, conf: 0 };
        agentGroups[l.agent].leads += l.leads;
        agentGroups[l.agent].conf += l.confirmed;
    });
    const agents = Object.keys(agentGroups);
    charts.agent = new Chart(document.getElementById('agentChart'), {
        type: 'bar',
        data: { labels: agents, datasets: [{ label: 'Confirmation %', data: agents.map(a => (agentGroups[a].conf / agentGroups[a].leads)*100), backgroundColor: '#007aff' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderData() {
    let totalProfit = 0, totalSpend = 0, totalRev = 0;
    
    // Monthly Goal Calculation
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyLogs = state.logs.filter(l => l.date.startsWith(currentMonth));
    const monthlyProfit = monthlyLogs.reduce((sum, l) => sum + calculateFinancials(l, state.products.find(p => p.id === l.productId)).netProfit, 0);
    
    const goalPercent = Math.min(100, (monthlyProfit / state.settings.goal) * 100);
    document.getElementById('goal-target-val').textContent = `$${state.settings.goal}`;
    document.getElementById('goal-percent').textContent = `${Math.round(goalPercent)}%`;
    document.getElementById('goal-progress-bar').style.width = `${goalPercent}%`;

    // Dashboard & Inventory logic
    const perfBody = document.getElementById('product-performance-body');
    const invBody = document.getElementById('inventory-list-body');
    if (!perfBody) return;

    perfBody.innerHTML = state.products.map(p => {
        const pLogs = state.logs.filter(l => l.productId === p.id);
        const sold = pLogs.reduce((sum, l) => sum + l.delivered, 0);
        const profit = pLogs.reduce((sum, l) => sum + calculateFinancials(l, p).netProfit, 0);
        const velocity = pLogs.length > 0 ? sold / pLogs.length : 0;
        const currentStock = p.initialStock - sold;
        const daysLeft = velocity > 0 ? Math.round(currentStock / velocity) : '---';
        
        totalProfit += profit;
        
        return `<tr>
            <td>${p.name}</td>
            <td class="${profit >= 0 ? 'trend-pos' : 'trend-neg'}">$${profit.toFixed(0)}</td>
            <td>${pLogs.length > 0 ? 'STABLE' : 'NEW'}</td>
            <td>${daysLeft} days</td>
            <td><span class="badge-status ${daysLeft < 7 ? 'badge-low' : 'badge-ok'}">${daysLeft < 7 ? 'LOW' : 'OK'}</span></td>
        </tr>`;
    }).join('');

    invBody.innerHTML = state.products.map(p => {
        const sold = state.logs.filter(l => l.productId === p.id).reduce((sum, l) => sum + l.delivered, 0);
        const currentStock = p.initialStock - sold;
        return `<tr><td>${p.name}</td><td>${currentStock}</td><td>${(sold/Math.max(1, state.logs.filter(l => l.productId === p.id).length)).toFixed(1)}</td><td>---</td><td><button class="btn" style="padding:0.2rem 0.5rem" onclick="refillStock('${p.id}')">+ Add</button></td></tr>`;
    }).join('');

    // Global Stats
    document.getElementById('global-stats').innerHTML = `
        <div class="stat-card"><p class="stat-label">Lifetime Profit</p><p class="stat-val">$${totalProfit.toLocaleString()}</p></div>
        <div class="stat-card" style="border-top: 3px solid var(--accent-green)"><p class="stat-label">This Month</p><p class="stat-val">$${monthlyProfit.toFixed(0)}</p></div>
        <div class="stat-card"><p class="stat-label">Currency (LYD)</p><p class="stat-val">${(monthlyProfit * state.settings.rateLyd).toFixed(0)} LYD</p></div>
    `;

    document.getElementById('product-list-body').innerHTML = state.products.map(p => `<tr><td>${p.name}</td><td>${p.market.toUpperCase()}</td><td>${p.initialStock}</td><td><button class="btn btn-danger" onclick="deleteProduct('${p.id}')">X</button></td></tr>`).join('');
    document.getElementById('log-product').innerHTML = state.products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    document.getElementById('logs-history-body').innerHTML = state.logs.sort((a,b) => new Date(b.date) - new Date(a.date)).map(l => {
        const p = state.products.find(prod => prod.id === l.productId);
        const fin = calculateFinancials(l, p);
        return `<tr><td>${l.date}</td><td>${p?p.name:'?'}</td><td>${l.agent || '---'}</td><td>${fin.roi.toFixed(0)}%</td><td>$${fin.netProfit.toFixed(2)}</td><td><button class="btn" onclick="deleteLog('${l.id}')">X</button></td></tr>`;
    }).join('');
}

function refillStock(id) {
    const amount = prompt('How many units to add?');
    if (amount) {
        state.products.find(p => p.id === id).initialStock += parseInt(amount);
        save();
    }
}

function save() { localStorage.setItem(DB_KEY, JSON.stringify(state)); renderData(); }
function saveSettings() {
    state.settings.goal = parseFloat(document.getElementById('setting-goal').value);
    state.settings.rateLyd = parseFloat(document.getElementById('rate-lyd').value);
    save();
}

document.getElementById('new-product-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.products.push({ id: Date.now().toString(), name: document.getElementById('p-name').value, price: parseFloat(document.getElementById('p-price').value), cost: parseFloat(document.getElementById('p-cost').value), initialStock: parseInt(document.getElementById('p-stock').value), market: document.getElementById('p-market').value });
    save(); e.target.reset(); toggleForm('product-form');
});

document.getElementById('daily-log-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.logs.push({ id: Date.now().toString(), date: document.getElementById('log-date').value, productId: document.getElementById('log-product').value, agent: document.getElementById('log-agent').value, spend: parseFloat(document.getElementById('log-spend').value), leads: parseInt(document.getElementById('log-leads').value), confirmed: parseInt(document.getElementById('log-confirmed').value), delivered: parseInt(document.getElementById('log-delivered').value) });
    save(); e.target.reset(); showView('dashboard');
});

function deleteProduct(id) { if(confirm('Delete?')) { state.products = state.products.filter(p => p.id !== id); state.logs = state.logs.filter(l => l.productId !== id); save(); } }
function deleteLog(id) { state.logs = state.logs.filter(l => l.id !== id); save(); }

// Init
document.getElementById('log-date').valueAsDate = new Date();
renderData();
if (state.logs.length > 0) renderCharts();
