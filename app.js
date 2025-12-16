/* TZ Journal Pro Logic V5 */
const APP_KEY = 'tz_pro_v1';
const PREFS_KEY = 'tz_prefs_v1';

let state = { 
  accounts: [{ id: 'main', name: 'Main', type: 'Real', initial: 0, balance: 0 }], 
  trades: [],
  transfers: [] 
};
let prefs = { darkMode: true };
let currentAccId = 'main';
let myChart = null;
let currentCalDate = dayjs(); 

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  applyTheme();
  setupListeners();
  renderAll();
});

/* --- DATA HANDLING --- */
function loadData() {
  const d = localStorage.getItem(APP_KEY);
  const p = localStorage.getItem(PREFS_KEY);
  
  if (d) {
    const loaded = JSON.parse(d);
    if (loaded.accounts && typeof loaded.accounts[0] === 'string') {
      loaded.accounts = loaded.accounts.map((name, i) => ({
        id: 'acc_'+i, name: name, type: 'Real', initial: 0, balance: 0
      }));
      loaded.trades.forEach(t => {
        const found = loaded.accounts.find(a => a.name === t.account);
        if (found) t.account = found.id; 
      });
    }
    state = { ...state, ...loaded };
  }
  
  if (p) prefs = JSON.parse(p);
  if (state.accounts.length > 0) currentAccId = state.accounts[0].id;
  
  const toggle = document.getElementById('themeToggle');
  if(toggle) toggle.checked = prefs.darkMode;
}

function saveData() { localStorage.setItem(APP_KEY, JSON.stringify(state)); }
function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); applyTheme(); }

/* --- CALCULATIONS --- */
function getAccountData() {
  const trades = state.trades.filter(t => t.account === currentAccId);
  const transfers = (state.transfers || []).filter(t => t.accountId === currentAccId);
  const account = state.accounts.find(a => a.id === currentAccId) || state.accounts[0];
  return { trades, transfers, account };
}

function getFinancials() {
  const { trades, transfers, account } = getAccountData();
  let netPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  let totalDeposits = transfers.filter(t => t.type === 'Deposit').reduce((s, t) => s + t.amount, 0);
  let totalWithdrawals = transfers.filter(t => t.type === 'Withdrawal').reduce((s, t) => s + t.amount, 0);
  let currentEquity = (account.initial || 0) + netPnL + totalDeposits - totalWithdrawals;
  let growth = account.initial > 0 ? ((currentEquity - account.initial) / account.initial) * 100 : 0;
  return { netPnL, currentEquity, growth, initial: account.initial, type: account.type, trades };
}

/* --- UI RENDERING --- */
function renderAll() {
  updateAccSelects();
  renderDashboard();
  renderCalendar();
  renderLog();
  renderSettings();
}

function renderDashboard() {
  const data = getFinancials();
  
  document.getElementById('dashBalance').innerText = fmtMoney(data.currentEquity);
  document.getElementById('dashGrowth').innerText = data.growth.toFixed(2) + '%';
  document.getElementById('dashGrowth').className = `value ${data.growth >= 0 ? 'text-green' : 'text-red'}`;
  document.getElementById('dashInitial').innerText = fmtMoney(data.initial);
  document.getElementById('dashType').innerText = data.type;
  
  document.getElementById('dashNet').innerText = fmtMoney(data.netPnL);
  document.getElementById('dashNet').className = `value ${data.netPnL >= 0 ? 'text-green' : 'text-red'}`;

  let wins = data.trades.filter(t => t.pnl > 0).length;
  let wr = data.trades.length ? Math.round((wins / data.trades.length) * 100) : 0;
  document.getElementById('dashWR').innerText = wr + '%';

  const sorted = [...data.trades].sort((a,b) => new Date(a.date) - new Date(b.date));
  let running = data.initial;
  let labels = [], points = [];
  
  if(sorted.length) { labels.push('Start'); points.push(data.initial); }
  sorted.forEach(t => {
      running += t.pnl;
      labels.push(dayjs(t.date).format('MM/DD'));
      points.push(running);
  });

  const ctx = document.getElementById('equityCurve').getContext('2d');
  const color = prefs.darkMode ? '#22d3ee' : '#0284c7';
  if (myChart) myChart.destroy();
  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: points, borderColor: color, backgroundColor: color+'15',
        borderWidth: 2, fill: true, pointRadius: 0, tension: 0.1
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: {display:false} },
      scales: { x: {display:false}, y: {grid:{color:prefs.darkMode?'#333':'#eee'}} }
    }
  });
}

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  document.getElementById('calMonthLabel').innerText = currentCalDate.format('MMMM YYYY');
  
  const startOfMonth = currentCalDate.startOf('month');
  const daysInMonth = currentCalDate.daysInMonth();
  const startDay = startOfMonth.day(); 
  
  for(let i=0; i<startDay; i++) grid.appendChild(document.createElement('div'));

  const { trades } = getAccountData();
  let monthPnL = 0, monthTrades = 0;

  for(let i=1; i<=daysInMonth; i++) {
    const dateStr = currentCalDate.date(i).format('YYYY-MM-DD');
    const dayTrades = trades.filter(t => t.date.startsWith(dateStr));
    
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    
    // Add Big Date Number
    cell.innerHTML = `<div class="cal-date-label">${i}</div>`;
    
    if(dayTrades.length > 0) {
        // Group by Symbol
        const grouped = {};
        let dayTotal = 0;

        dayTrades.forEach(t => {
            if(!grouped[t.symbol]) grouped[t.symbol] = 0;
            grouped[t.symbol] += t.pnl;
            dayTotal += t.pnl;
        });
        
        monthPnL += dayTotal;
        monthTrades += dayTrades.length;
        
        // Color the whole cell based on daily total
        cell.classList.add(dayTotal >= 0 ? 'profit' : 'loss');

        // Render Instrument Rows
        Object.keys(grouped).forEach(sym => {
            const pnl = grouped[sym];
            const row = document.createElement('div');
            row.className = 'cal-instrument-row';
            row.innerHTML = `
                <span class="cal-instrument-name">${sym}</span>
                <span class="cal-instrument-pnl ${pnl>=0?'text-green':'text-red'}">${fmtMoneyCompact(pnl)}</span>
            `;
            cell.appendChild(row);
        });
        
        // On click show details
        cell.style.cursor = 'pointer';
        cell.onclick = () => alert(`Date: ${dateStr}\nDaily Total: ${fmtMoney(dayTotal)}\nTrades: ${dayTrades.length}`);
    }
    grid.appendChild(cell);
  }

  document.getElementById('calTrades').innerText = monthTrades;
  document.getElementById('calPnL').innerText = fmtMoney(monthPnL);
  document.getElementById('calPnL').className = monthPnL >= 0 ? 'text-green' : 'text-red';
}

function renderLog() {
  const tbody = document.getElementById('tradeListBody');
  tbody.innerHTML = '';
  const search = document.getElementById('searchTrade').value.toLowerCase();
  const { trades } = getAccountData();
  
  trades.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(t => {
    if(search && !t.symbol.toLowerCase().includes(search)) return;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dayjs(t.date).format('MM/DD')}</td>
      <td><b>${t.symbol}</b><br><span style="font-size:0.7em;color:var(--text-muted)">${t.side}</span></td>
      <td class="${t.pnl>=0?'text-green':'text-red'}"><b>${fmtMoney(t.pnl)}</b></td>
      <td><button class="btn ghost small" onclick="openModal('${t.id}')"><i class="bi bi-eye"></i></button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSettings() {
  const list = document.getElementById('accList');
  list.innerHTML = '';
  state.accounts.forEach(acc => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div><b>${acc.name}</b> <small class="text-muted">(${acc.type})</small></div>
      ${acc.id !== currentAccId ? `<button onclick="delAcc('${acc.id}')" class="btn danger small">X</button>` : '<small>Active</small>'}
    `;
    list.appendChild(li);
  });
}

function updateAccSelects() {
  const sel = document.getElementById('globalAccountSelect');
  const formSel = document.getElementById('formAccountSelect');
  sel.innerHTML = ''; formSel.innerHTML = '';
  
  state.accounts.forEach(acc => {
    const opt = document.createElement('option');
    opt.value = acc.id; opt.innerText = acc.name;
    if(acc.id === currentAccId) opt.selected = true;
    sel.appendChild(opt);
    formSel.appendChild(opt.cloneNode(true));
  });
}

/* --- MODAL & ACTIONS --- */
window.openModal = function(id) {
    const t = state.trades.find(x => x.id == id);
    if(!t) return;
    
    document.getElementById('mSymbol').innerText = `${t.symbol} (${t.side})`;
    document.getElementById('mDate').innerText = dayjs(t.date).format('YYYY-MM-DD HH:mm');
    document.getElementById('mStats').innerHTML = `
        <div style="text-align:center"><span>P&L</span><br><b class="${t.pnl>=0?'text-green':'text-red'}">${fmtMoney(t.pnl)}</b></div>
        <div style="text-align:center"><span>Status</span><br><b>${t.status}</b></div>
    `;
    document.getElementById('mNotes').innerText = t.notes || 'No notes.';
    
    const imgCon = document.getElementById('mImgContainer');
    imgCon.innerHTML = '';
    if(t.img) imgCon.innerHTML = `<a href="${t.img}" target="_blank"><img src="${t.img}"></a>`;
    
    document.getElementById('btnDeleteTrade'