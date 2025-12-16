/* TZ Journal Pro Logic V6 - Syntax Safe */
const APP_KEY = 'tz_pro_v1';
const PREFS_KEY = 'tz_prefs_v1';

// Default State
let state = { 
  accounts: [{ id: 'main', name: 'Main', type: 'Real', initial: 0, balance: 0 }], 
  trades: [],
  transfers: [] 
};
let prefs = { darkMode: true };
let currentAccId = 'main';
let myChart = null;
let currentCalDate = dayjs(); 

// Start App
document.addEventListener('DOMContentLoaded', function() {
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
    // Backward compatibility check
    if (loaded.accounts && typeof loaded.accounts[0] === 'string') {
      loaded.accounts = loaded.accounts.map(function(name, i) {
        return { id: 'acc_'+i, name: name, type: 'Real', initial: 0, balance: 0 };
      });
      loaded.trades.forEach(function(t) {
        const found = loaded.accounts.find(a => a.name === t.account);
        if (found) t.account = found.id; 
      });
    }
    state = Object.assign({}, state, loaded);
  }
  
  if (p) prefs = JSON.parse(p);
  
  // Ensure we have at least one account
  if (state.accounts.length > 0) {
      // Check if currentAccId is valid
      const exists = state.accounts.find(a => a.id === currentAccId);
      if (!exists) currentAccId = state.accounts[0].id;
  } else {
      currentAccId = 'main';
  }
  
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
  return { trades: trades, transfers: transfers, account: account };
}

function getFinancials() {
  const data = getAccountData();
  let netPnL = data.trades.reduce((sum, t) => sum + t.pnl, 0);
  let totalDeposits = data.transfers.filter(t => t.type === 'Deposit').reduce((s, t) => s + t.amount, 0);
  let totalWithdrawals = data.transfers.filter(t => t.type === 'Withdrawal').reduce((s, t) => s + t.amount, 0);
  
  let currentEquity = (data.account.initial || 0) + netPnL + totalDeposits - totalWithdrawals;
  let growth = 0;
  if (data.account.initial > 0) {
      growth = ((currentEquity - data.account.initial) / data.account.initial) * 100;
  }
  
  return { 
      netPnL: netPnL, 
      currentEquity: currentEquity, 
      growth: growth, 
      initial: data.account.initial, 
      type: data.account.type, 
      trades: data.trades 
  };
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
  
  const growthEl = document.getElementById('dashGrowth');
  growthEl.innerText = data.growth.toFixed(2) + '%';
  growthEl.className = 'value ' + (data.growth >= 0 ? 'text-green' : 'text-red');
  
  document.getElementById('dashInitial').innerText = fmtMoney(data.initial);
  document.getElementById('dashType').innerText = data.type;
  
  const netEl = document.getElementById('dashNet');
  netEl.innerText = fmtMoney(data.netPnL);
  netEl.className = 'value ' + (data.netPnL >= 0 ? 'text-green' : 'text-red');

  let wins = data.trades.filter(t => t.pnl > 0).length;
  let wr = data.trades.length ? Math.round((wins / data.trades.length) * 100) : 0;
  document.getElementById('dashWR').innerText = wr + '%';

  // Chart Logic
  const sorted = [...data.trades].sort((a,b) => new Date(a.date) - new Date(b.date));
  let running = data.initial;
  let labels = [], points = [];
  
  if(sorted.length > 0) { 
      labels.push('Start'); 
      points.push(data.initial); 
  }
  
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
        data: points, 
        borderColor: color, 
        backgroundColor: color+'15',
        borderWidth: 2, 
        fill: true, 
        pointRadius: 0, 
        tension: 0.1
      }]
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false,
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
  
  // Empty slots
  for(let i=0; i<startDay; i++) {
      grid.appendChild(document.createElement('div'));
  }

  const data = getAccountData();
  let monthPnL = 0;
  let monthTrades = 0;

  for(let i=1; i<=daysInMonth; i++) {
    const dateStr = currentCalDate.date(i).format('YYYY-MM-DD');
    const dayTrades = data.trades.filter(t => t.date.startsWith(dateStr));
    
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.innerHTML = '<div class="cal-date-label">' + i + '</div>';
    
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
        
        // Color
        cell.classList.add(dayTotal >= 0 ? 'profit' : 'loss');

        // Render Instrument Rows
        Object.keys(grouped).forEach(sym => {
            const pnl = grouped[sym];
            const row = document.createElement('div');
            row.className = 'cal-instrument-row';
            
            const pnlClass = pnl >= 0 ? 'text-green' : 'text-red';
            const pnlStr = fmtMoneyCompact(pnl);
            
            row.innerHTML = '<span class="cal-instrument-name">' + sym + '</span>' +
                            '<span class="cal-instrument-pnl ' + pnlClass + '">' + pnlStr + '</span>';
            cell.appendChild(row);
        });
        
        cell.style.cursor = 'pointer';
        cell.onclick = function() {
            alert('Date: ' + dateStr + '\nDaily Total: ' + fmtMoney(dayTotal) + '\nTrades: ' + dayTrades.length);
        };
    }
    grid.appendChild(cell);
  }

  document.getElementById('calTrades').innerText = monthTrades;
  const calPnLEl = document.getElementById('calPnL');
  calPnLEl.innerText = fmtMoney(monthPnL);
  calPnLEl.className = monthPnL >= 0 ? 'text-green' : 'text-red';
}

function renderLog() {
  const tbody = document.getElementById('tradeListBody');
  tbody.innerHTML = '';
  const search = document.getElementById('searchTrade').value.toLowerCase();
  const data = getAccountData();
  
  const sorted = data.trades.sort((a,b) => new Date(b.date) - new Date(a.date));

  sorted.forEach(t => {
    if(search && !t.symbol.toLowerCase().includes(search)) return;
    
    const tr = document.createElement('tr');
    const dateDisplay = dayjs(t.date).format('MM/DD');
    const pnlClass = t.pnl >= 0 ? 'text-green' : 'text-red';
    
    tr.innerHTML = '<td>' + dateDisplay + '</td>' +
                   '<td><b>' + t.symbol + '</b><br><span style="font-size:0.7em;color:var(--text-muted)">' + t.side + '</span></td>' +
                   '<td class="' + pnlClass + '"><b>' + fmtMoney(t.pnl) + '</b></td>' +
                   '<td><button class="btn ghost small" onclick="openModal(\'' + t.id + '\')"><i class="bi bi-eye"></i></button></td>';
    tbody.appendChild(tr);
  });
}

function renderSettings() {
  const list = document.getElementById('accList');
  list.innerHTML = '';
  state.accounts.forEach(acc => {
    const li = document.createElement('li');
    let btnHtml = '';
    
    if (acc.id !== currentAccId) {
        btnHtml = '<button onclick="delAcc(\'' + acc.id + '\')" class="btn danger small">X</button>';
    } else {
        btnHtml = '<small>Active</small>';
    }
    
    li.innerHTML = '<div><b>' + acc.name + '</b> <small class="text-muted">(' + acc.type + ')</small></div>' + btnHtml;
    list.appendChild(li);
  });
}

function updateAccSelects() {
  const sel = document.getElementById('globalAccountSelect');
  const formSel = document.getElementById('formAccountSelect');
  sel.innerHTML = ''; 
  formSel.innerHTML = '';
  
  state.accounts.forEach(acc => {
    const opt = document.createElement('option');
    opt.value = acc.id; 
    opt.innerText = acc.name;
    if(acc.id === currentAccId) opt.selected = true;
    
    sel.appendChild(opt);
    formSel.appendChild(opt.cloneNode(true));
  });
}

/* --- ACTIONS --- */
window.openModal = function(id) {
    // Find trade safely (comparing as strings to be safe)
    const t = state.trades.find(x => String(x.id) === String(id));
    if(!t) return;
    
    document.getElementById('mSymbol').innerText = t.symbol + ' (' + t.side + ')';
    document.getElementById('mDate').innerText = dayjs(t.date).format('YYYY-MM-DD HH:mm');
    
    const pnlClass = t.pnl >= 0 ? 'text-green' : 'text-red';
    document.getElementById('mStats').innerHTML = 
        '<div style="text-align:center"><span>P&L</span><br><b class="' + pnlClass + '">' + fmtMoney(t.pnl) + '</b></div>' +
        '<div style="text-align:center"><span>Status</span><br><b>' + t.status + '</b></div>';
        
    document.getElementById('mNotes').innerText = t.notes || 'No notes.';
    
    const imgCon = document.getElementById('mImgContainer');
    imgCon.innerHTML = '';
    if(t.img) {
        imgCon.innerHTML = '<a href="' + t.img + '" target="_blank"><img src="' + t.img + '"></a>';
    }
    
    document.getElementById('btnDeleteTrade').onclick = function() {
        if(confirm('Delete?')) {
            state.trades = state.trades.filter(x => String(x.id) !== String(id));
            saveData(); 
            renderAll(); 
            document.getElementById('tradeModal').classList.add('hidden');
        }
    };
    
    document.getElementById('tradeModal').classList.remove('hidden');
};

window.delAcc = function(id) { 
    if(confirm('Delete account?')) { 
        state.accounts = state.accounts.filter(a => a.id !== id);
        if(currentAccId === id) {
            currentAccId = state.accounts[0] ? state.accounts[0].id : '';
        }
        saveData(); 
        renderAll(); 
    } 
};

/* --- LISTENERS --- */
function setupListeners() {
  // Tabs
  document.querySelectorAll('.nav-tabs button').forEach(btn => {
    btn.addEventListener('click', e => {
      document.querySelectorAll('.nav-tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      const targetBtn = e.target.closest('button');
      targetBtn.classList.add('active');
      document.getElementById(targetBtn.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('prevMonth').onclick = () => { currentCalDate = currentCalDate.subtract(1, 'month'); renderCalendar(); };
  document.getElementById('nextMonth').onclick = () => { currentCalDate = currentCalDate.add(1, 'month'); renderCalendar(); };
  document.getElementById('globalAccountSelect').onchange = (e) => { currentAccId = e.target.value; renderAll(); };

  // Add Account
  document.getElementById('btnAddAcc').onclick = () => {
    const name = document.getElementById('newAccName').value.trim();
    const type = document.getElementById('newAccType').value;
    const bal = parseFloat(document.getElementById('newAccBal').value) || 0;
    
    if(name) {
        const newId = 'acc_' + Date.now();
        state.accounts.push({ id: newId, name: name, type: type, initial: bal, balance: bal });
        currentAccId = newId;
        saveData(); renderAll();
        document.getElementById('newAccName').value = '';
    }
  };

  // Transfer
  document.getElementById('btnTransfer').onclick = () => {
      const amt = parseFloat(document.getElementById('transferAmount').value);
      const type = document.getElementById('transferType').value;
      if(amt > 0) {
          state.transfers = state.transfers || [];
          state.transfers.push({ 
              id: Date.now(), 
              accountId: currentAccId, 
              type: type, 
              amount: amt, 
              date: new Date().toISOString() 
          });
          saveData(); 
          renderAll();
          document.getElementById('transferAmount').value = '';
          showToast('Transaction Logged');
      }
  };

  // Trade Form
  document.getElementById('tradeForm').onsubmit = async (e) => {
    e.preventDefault();
    const pnl = parseFloat(document.getElementById('tPnL').value);
    const dateVal = document.getElementById('tDate').value;
    let imgData = document.getElementById('tImgLink').value; 
    const fileInput = document.getElementById('tImgFile');
    
    if (fileInput.files[0]) {
        imgData = await readFileAsBase64(fileInput.files[0]);
    }

    state.trades.push({
      id: Date.now(),
      account: document.getElementById('formAccountSelect').value,
      date: dateVal,
      symbol: document.getElementById('tSymbol').value,
      side: document.getElementById('tSide').value,
      pnl: pnl,
      status: pnl >= 0 ? 'Win' : 'Loss',
      notes: document.getElementById('tNotes').value,
      img: imgData
    });
    
    saveData(); 
    renderAll(); 
    e.target.reset();
    document.getElementById('tDate').value = dateVal; 
    showToast('Trade Saved');
  };

  // CSV
  document.getElementById('csvInput').onchange = (e) => {
      const file = e.target.files[0];
      if(!file) return;

      Papa.parse(file, {
          header: true, 
          skipEmptyLines: true,
          complete: (res) => {
              let c = 0;
              res.data.forEach(r => {
                 if(!r['Profit']) return;
                 let net = parseFloat(r['Profit']) + (parseFloat(r['Commission'])||0) + (parseFloat(r['Swap'])||0);
                 
                 let side = 'Long';
                 if((r['Type']||'').toLowerCase().includes('sell')) side = 'Short';

                 state.trades.push({
                     id: r['Ticket ID'] || Date.now() + Math.random(),
                     account: currentAccId,
                     date: r['Close Time'] || new Date().toISOString(),
                     symbol: (r['Symbol']||'UNK').toUpperCase(),
                     side: side, 
                     pnl: net, 
                     status: net >= 0 ? 'Win' : 'Loss', 
                     notes: 'Imported', 
                     img: null
                 });
                 c++;
              });
              saveData(); 
              renderAll(); 
              showToast('Imported ' + c + ' trades');
          }
      });
  };

  // Restore
  document.getElementById('jsonRestore').onchange = (e) => {
      const reader = new FileReader();
      reader.onload = (event) => {
          try { 
              state = JSON.parse(event.target.result); 
              saveData(); 
              location.reload(); 
          } catch(err) { alert('Invalid File'); }
      };
      reader.readAsText(e.target.files[0]);
  };
  
  document.querySelector('.close-modal').onclick = () => document.getElementById('tradeModal').classList.add('hidden');
  document.getElementById('themeToggle').onchange = (e) => { prefs.darkMode = e.target.checked; savePrefs(); };
  document.getElementById('searchTrade').oninput = renderLog;
  
  // Init Date
  document.getElementById('tDate').value = dayjs().format('YYYY-MM-DDTHH:mm');
}

/* --- HELPERS --- */
function readFileAsBase64(file) {
    return new Promise((resolve) => {
        if(file.size > 200000) { 
            alert("Image too large! Max 200KB."); 
            resolve(null); 
            return; 
        }
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

function fmtMoney(n) { return (n<0?'-':'') + '$' + Math.abs(n).toFixed(2); }
function fmtMoneyCompact(n) { return (n<0?'-':'') + '$' + Math.abs(n).toFixed(0); }

function applyTheme() {
    if (prefs.darkMode) document.body.classList.remove('light-mode');
    else document.body.classList.add('light-mode');
}

function exportData() {
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    a.download = "tz_pro_backup.json";
    document.body.appendChild(a); 
    a.click(); 
    a.remove();
}

function wipeData() { 
    if(confirm("RESET APP?")) { 
        localStorage.removeItem(APP_KEY); 
        location.reload(); 
    } 
}

function showToast(m) { 
    const t = document.getElementById('toast'); 
    t.innerText = m; 
    t.style.opacity = 1; 
    setTimeout(() => t.style.opacity = 0, 3000); 
}
