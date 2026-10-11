/* =============================================
   APP.JS — DompetKu: Pencatat Keuangan Digital
   BNI & BRI — localStorage based
   ============================================= */

'use strict';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let transactions = [];
let saldoAwal = { BNI: 0, BRI: 0 };
let editingId = null;
let txType = 'masuk';

let mainChartInstance = null;
let bankChartInstance = null;

const STORAGE_KEY  = 'dompetku_transactions';
const SALDO_KEY    = 'dompetku_saldo_awal';

// ─────────────────────────────────────────────
// LOAD / SAVE
// ─────────────────────────────────────────────
function loadData() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    const s = localStorage.getItem(SALDO_KEY);
    if (t) transactions = JSON.parse(t);
    if (s) saldoAwal = JSON.parse(s);
  } catch (e) {
    console.error('Load error:', e);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  localStorage.setItem(SALDO_KEY, JSON.stringify(saldoAwal));
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function fmt(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmtDate(str) {
  if (!str) return '-';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getCurrentMonth() {
  const now = new Date();
  return { m: now.getMonth(), y: now.getFullYear() };
}

function isThisMonth(dateStr) {
  const { m, y } = getCurrentMonth();
  const d = new Date(dateStr + 'T00:00:00');
  return d.getMonth() === m && d.getFullYear() === y;
}

// ─────────────────────────────────────────────
// COMPUTE SALDO
// ─────────────────────────────────────────────
function computeSaldo(bank) {
  let s = saldoAwal[bank] || 0;
  const sorted = [...transactions]
    .filter(t => t.bank === bank)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    s += t.type === 'masuk' ? t.amount : -t.amount;
  }
  return s;
}

function computeSaldoAt(bank, upToId) {
  let s = saldoAwal[bank] || 0;
  const sorted = [...transactions]
    .filter(t => t.bank === bank)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.createdAt - b.createdAt;
    });
  for (const t of sorted) {
    s += t.type === 'masuk' ? t.amount : -t.amount;
    if (t.id === upToId) break;
  }
  return s;
}

// ─────────────────────────────────────────────
// PAGE NAVIGATION
// ─────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  bni: 'Rekening BNI',
  bri: 'Rekening BRI',
  grafik: 'Grafik Keuangan'
};

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector(`[data-page="${name}"]`).classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[name];

  if (name === 'grafik') renderCharts();

  // Close sidebar on mobile
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
  }

  renderAll();
  return false;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─────────────────────────────────────────────
// RENDER ALL
// ─────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderBankPage('BNI');
  renderBankPage('BRI');
}

function renderDashboard() {
  const bniBal = computeSaldo('BNI');
  const briBal = computeSaldo('BRI');
  const total  = bniBal + briBal;

  document.getElementById('total-saldo').textContent = fmt(total);
  document.getElementById('saldo-bni').textContent   = fmt(bniBal);
  document.getElementById('saldo-bri').textContent   = fmt(briBal);
  document.getElementById('hero-saldo-bni').textContent = fmt(bniBal);
  document.getElementById('hero-saldo-bri').textContent = fmt(briBal);

  // Monthly summary
  const thisMonth = transactions.filter(t => isThisMonth(t.date));
  const income  = thisMonth.filter(t => t.type === 'masuk').reduce((s, t) => s + t.amount, 0);
  const expense = thisMonth.filter(t => t.type === 'keluar').reduce((s, t) => s + t.amount, 0);
  const net = income - expense;

  document.getElementById('total-income').textContent  = fmt(income);
  document.getElementById('total-expense').textContent = fmt(expense);
  const netEl = document.getElementById('net-balance');
  netEl.textContent = fmt(Math.abs(net));
  netEl.className = 'ov-value ' + (net >= 0 ? '' : 'neg');

  // Recent transactions (last 10, sorted newest first)
  const recent = [...transactions]
    .sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.createdAt - a.createdAt;
    })
    .slice(0, 10);

  const tbody = document.getElementById('recent-tx-body');
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada transaksi. Klik <strong>+ Tambah Transaksi</strong> untuk mulai.</td></tr>';
  } else {
    tbody.innerHTML = recent.map(t => `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td><span class="bank-badge ${t.bank === 'BNI' ? 'bni-badge' : 'bri-badge'}">${t.bank}</span></td>
        <td>${escHtml(t.desc)}</td>
        <td><span class="type-pill ${t.type === 'masuk' ? 'in' : 'out'}">${t.type === 'masuk' ? '⬆ Masuk' : '⬇ Keluar'}</span></td>
        <td class="${t.type === 'masuk' ? 'amount-in' : 'amount-out'}">${t.type === 'masuk' ? '+' : '-'}${fmt(t.amount)}</td>
        <td>
          <button class="btn-edit" onclick="editTx('${t.id}')">Edit</button>
          <button class="btn-del"  onclick="deleteTx('${t.id}')">Hapus</button>
        </td>
      </tr>`).join('');
  }
}

function renderBankPage(bank) {
  const key = bank.toLowerCase();
  const txs = [...transactions]
    .filter(t => t.bank === bank)
    .sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.createdAt - a.createdAt;
    });

  const bodyId = key + '-tx-body';
  const tbody = document.getElementById(bodyId);
  if (!tbody) return;

  if (txs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Belum ada transaksi ${bank}.</td></tr>`;
    return;
  }

  tbody.innerHTML = txs.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td>${escHtml(t.desc)}</td>
      <td><span class="type-pill ${t.type === 'masuk' ? 'in' : 'out'}">${t.type === 'masuk' ? '⬆ Masuk' : '⬇ Keluar'}</span></td>
      <td class="${t.type === 'masuk' ? 'amount-in' : 'amount-out'}">${t.type === 'masuk' ? '+' : '-'}${fmt(t.amount)}</td>
      <td>${fmt(computeSaldoAt(bank, t.id))}</td>
      <td>
        <button class="btn-edit" onclick="editTx('${t.id}')">Edit</button>
        <button class="btn-del"  onclick="deleteTx('${t.id}')">Hapus</button>
      </td>
    </tr>`).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────
function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }) });
  }
  return months;
}

function renderCharts() {
  const months = getLast6Months();

  const incomeData  = months.map(({ y, m }) =>
    transactions.filter(t => {
      const d = new Date(t.date + 'T00:00:00');
      return d.getFullYear() === y && d.getMonth() === m && t.type === 'masuk';
    }).reduce((s, t) => s + t.amount, 0)
  );

  const expenseData = months.map(({ y, m }) =>
    transactions.filter(t => {
      const d = new Date(t.date + 'T00:00:00');
      return d.getFullYear() === y && d.getMonth() === m && t.type === 'keluar';
    }).reduce((s, t) => s + t.amount, 0)
  );

  const labels = months.map(m => m.label);

  // Bar Chart
  const ctx1 = document.getElementById('mainChart').getContext('2d');
  if (mainChartInstance) mainChartInstance.destroy();
  mainChartInstance = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: incomeData,
          backgroundColor: 'rgba(63,185,80,.7)',
          borderColor: '#3fb950',
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'Pengeluaran',
          data: expenseData,
          backgroundColor: 'rgba(248,81,73,.7)',
          borderColor: '#f85149',
          borderWidth: 1,
          borderRadius: 6,
        },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmt(ctx.raw)
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { color: 'rgba(48,54,61,.6)' } },
        y: { ticks: { color: '#8b949e', callback: v => 'Rp ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : (v >= 1e3 ? (v/1e3).toFixed(0)+'rb' : v)) }, grid: { color: 'rgba(48,54,61,.6)' } }
      }
    }
  });

  // Pie Chart (Bank distribution by total transactions volume)
  const bniVol = transactions.filter(t => t.bank === 'BNI').reduce((s, t) => s + t.amount, 0);
  const briVol = transactions.filter(t => t.bank === 'BRI').reduce((s, t) => s + t.amount, 0);
  const totalVol = bniVol + briVol || 1;

  const ctx2 = document.getElementById('bankChart').getContext('2d');
  if (bankChartInstance) bankChartInstance.destroy();
  bankChartInstance = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: ['BNI', 'BRI'],
      datasets: [{
        data: [bniVol, briVol],
        backgroundColor: ['rgba(249,115,22,.8)', 'rgba(59,130,246,.8)'],
        borderColor: ['#f97316', '#3b82f6'],
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmt(ctx.raw) + ` (${(ctx.raw/totalVol*100).toFixed(1)}%)`
          }
        }
      }
    }
  });

  // Pie legend
  document.getElementById('pie-legend').innerHTML = [
    { label: 'BNI', color: '#f97316', pct: (bniVol/totalVol*100).toFixed(1), val: bniVol },
    { label: 'BRI', color: '#3b82f6', pct: (briVol/totalVol*100).toFixed(1), val: briVol },
  ].map(it => `
    <div class="pie-legend-item">
      <span class="pie-legend-dot" style="background:${it.color}"></span>
      <span><strong>${it.label}</strong> — ${fmt(it.val)} (${it.pct}%)</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// MODAL — ADD / EDIT
// ─────────────────────────────────────────────
function openModal(mode, id) {
  editingId = null;
  txType = 'masuk';

  // Reset form
  document.getElementById('tx-form').reset();
  document.getElementById('tx-id').value = '';
  document.getElementById('tx-date').value = todayStr();
  setType('masuk');

  if (mode === 'edit' && id) {
    const t = transactions.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    document.getElementById('modal-title').textContent = 'Edit Transaksi';
    document.getElementById('tx-bank').value   = t.bank;
    document.getElementById('tx-amount').value = t.amount;
    document.getElementById('tx-desc').value   = t.desc;
    document.getElementById('tx-date').value   = t.date;
    document.getElementById('tx-id').value     = t.id;
    setType(t.type);
  } else {
    document.getElementById('modal-title').textContent = 'Tambah Transaksi';
  }

  document.getElementById('modal-overlay').classList.add('show');
  // Use setTimeout for animation
  setTimeout(() => document.getElementById('modal').classList.add('show'), 10);
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
  document.getElementById('modal-overlay').classList.remove('show');
}

function setType(type) {
  txType = type;
  document.getElementById('tx-type').value = type;
  const btnIn  = document.getElementById('btn-in');
  const btnOut = document.getElementById('btn-out');
  btnIn.classList.remove('active', 'income-active', 'expense-active');
  btnOut.classList.remove('active', 'income-active', 'expense-active');
  if (type === 'masuk') {
    btnIn.classList.add('active', 'income-active');
  } else {
    btnOut.classList.add('active', 'expense-active');
  }
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function saveTransaction(e) {
  e.preventDefault();
  const bank   = document.getElementById('tx-bank').value;
  const type   = document.getElementById('tx-type').value;
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const desc   = document.getElementById('tx-desc').value.trim();
  const date   = document.getElementById('tx-date').value;

  if (!bank || !type || !amount || !desc || !date) {
    showToast('Semua field harus diisi!', 'error');
    return;
  }
  if (amount <= 0) {
    showToast('Jumlah harus lebih dari 0!', 'error');
    return;
  }

  if (editingId) {
    const idx = transactions.findIndex(t => t.id === editingId);
    if (idx >= 0) {
      transactions[idx] = { ...transactions[idx], bank, type, amount, desc, date };
      showToast('Transaksi diperbarui! ✓', 'success');
    }
  } else {
    transactions.push({ id: uid(), bank, type, amount, desc, date, createdAt: Date.now() });
    showToast('Transaksi ditambahkan! ✓', 'success');
  }

  saveData();
  closeModal();
  renderAll();

  // If on grafik page, re-render charts
  if (document.getElementById('page-grafik').classList.contains('active')) {
    renderCharts();
  }
}

function editTx(id) {
  openModal('edit', id);
}

function deleteTx(id) {
  if (!confirm('Yakin ingin menghapus transaksi ini?')) return;
  transactions = transactions.filter(t => t.id !== id);
  saveData();
  renderAll();
  if (document.getElementById('page-grafik').classList.contains('active')) renderCharts();
  showToast('Transaksi dihapus.', 'success');
}

// ─────────────────────────────────────────────
// MODAL — SALDO AWAL
// ─────────────────────────────────────────────
function openSaldoModal() {
  document.getElementById('init-bni').value = saldoAwal.BNI || '';
  document.getElementById('init-bri').value = saldoAwal.BRI || '';
  document.getElementById('saldo-overlay').classList.add('show');
  setTimeout(() => document.getElementById('saldo-modal').classList.add('show'), 10);
}

function closeSaldoModal() {
  document.getElementById('saldo-modal').classList.remove('show');
  document.getElementById('saldo-overlay').classList.remove('show');
}

function saveSaldoAwal(e) {
  e.preventDefault();
  saldoAwal.BNI = parseFloat(document.getElementById('init-bni').value) || 0;
  saldoAwal.BRI = parseFloat(document.getElementById('init-bri').value) || 0;
  saveData();
  closeSaldoModal();
  renderAll();
  showToast('Saldo awal disimpan! ✓', 'success');
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2800);
}

// ─────────────────────────────────────────────
// EXPORT CSV
// ─────────────────────────────────────────────
function exportCSV() {
  if (transactions.length === 0) {
    showToast('Belum ada data untuk diekspor.', 'error');
    return;
  }
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const rows = [
    ['Tanggal', 'Bank', 'Jenis', 'Keterangan', 'Jumlah (Rp)'],
    ...sorted.map(t => [
      t.date,
      t.bank,
      t.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran',
      '"' + t.desc.replace(/"/g, '""') + '"',
      t.amount
    ])
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'dompetku_' + todayStr() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Data diekspor! ✓', 'success');
}

// ─────────────────────────────────────────────
// DATE BADGE
// ─────────────────────────────────────────────
function updateDateBadge() {
  const now = new Date();
  document.getElementById('date-badge').textContent = now.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  updateDateBadge();
  renderAll();

  // First time: open saldo awal modal if no data
  if (transactions.length === 0 && saldoAwal.BNI === 0 && saldoAwal.BRI === 0) {
    setTimeout(() => openSaldoModal(), 500);
  }
});
