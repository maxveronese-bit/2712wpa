// PERSONAL OS v5.3 - note + diario + categorie
const state = {
  inbox: [], tasks: [], eventi: [], pratiche: [], progetti: [],
  routine: [], routine_log: [], obiettivi: [], spese: [], incassi: [], time_log: [], note: [], diario: [],
  currentSection: 'dashboard', taskFilter: 'aperti', editingId: null,
  timer: { active: false, startTime: null, desc: '', codice: '', tipo: 'task', fatturabile: true },
  agendaView: 'day', agendaDate: new Date().toISOString().split('T')[0],
  eventiView: 'day', eventiDate: new Date().toISOString().split('T')[0]
};

const STORAGE_KEY = 'personalOS_v5_data';
const API_KEY = 'personalOS_v5_api';
const TIMER_KEY = 'personalOS_v5_timer';

document.addEventListener('DOMContentLoaded', function() {
  console.log('PersonalOS v5.3 - note + diario + categorie + deeplink');
  loadData(); loadTimer();
  // Carica sezione da URL hash se presente
  const hash = location.hash.replace('#', '');
  const validSections = ['dashboard','inbox','tasks','eventi','pratiche','progetti','routine','obiettivi','timer','finanze','agendaImpegni','agendaEventi','note','diario'];
  if (hash && validSections.includes(hash)) {
    showSection(hash);
  } else {
    render();
  }
  updateStats();
  setInterval(updateTimerDisplay, 1000);
  autoSync();
});

// Gestisce navigazione avanti/indietro del browser
window.addEventListener('hashchange', function() {
  const hash = location.hash.replace('#', '');
  const validSections = ['dashboard','inbox','tasks','eventi','pratiche','progetti','routine','obiettivi','timer','finanze','agendaImpegni','agendaEventi','note','diario'];
  if (hash && validSections.includes(hash)) {
    showSection(hash);
  }
});

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      ['inbox','tasks','eventi','pratiche','progetti','routine','routine_log','obiettivi','spese','incassi','time_log','note','diario'].forEach(k => {
        if (data[k]) state[k] = data[k];
      });
    }
  } catch(e) {}
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    inbox: state.inbox, tasks: state.tasks, eventi: state.eventi, pratiche: state.pratiche,
    progetti: state.progetti, routine: state.routine, routine_log: state.routine_log,
    obiettivi: state.obiettivi, spese: state.spese, incassi: state.incassi, time_log: state.time_log, note: state.note, diario: state.diario
  }));
}

function loadTimer() {
  try {
    const saved = localStorage.getItem(TIMER_KEY);
    if (saved) {
      const t = JSON.parse(saved);
      if (t.active) {
        state.timer = t;
        state.timer.startTime = new Date(t.startTime);
      }
    }
  } catch(e) {}
}

function saveTimer() { localStorage.setItem(TIMER_KEY, JSON.stringify(state.timer)); }

function getApiUrl() { return localStorage.getItem(API_KEY) || ''; }
function setApiUrl(url) { localStorage.setItem(API_KEY, url); }

async function autoSync() {
  const url = getApiUrl();
  if (!url) return;
  showSyncPopup();
  try {
    // STEP 1: Scarica dati dal server (fonte di verità)
    const resp = await fetch(url + '?action=read');
    const result = await resp.json();
    const data = result.data || result;
    if (data && (data.inbox || data.tasks || data.eventi)) {
      // STEP 2: Sostituisci locale con server
      replaceLocalWithServer(data);
      saveData(); render(); updateStats();
      toast('✅ Sincronizzato!');
    }
  } catch(e) { console.error('autoSync error:', e); }
  hideSyncPopup();
}

async function manualSync() {
  const url = getApiUrl();
  if (!url) { toast('Configura URL API'); openSettings(); return; }
  showSyncPopup();
  try {
    // Scarica dati dal server e sostituisci locale
    const resp = await fetch(url + '?action=read');
    const result = await resp.json();
    const data = result.data || result;
    if (data && (data.inbox || data.tasks || data.eventi)) {
      replaceLocalWithServer(data);
      saveData(); render(); updateStats();
      toast('✅ Sincronizzato!');
    } else { toast('Nessun dato trovato'); }
  } catch(e) { toast('Errore connessione'); console.error(e); }
  hideSyncPopup();
}

function replaceLocalWithServer(data) {
  // Mappa chiavi server → chiavi locali
  const keyMap = {
    'inbox': 'inbox', 'tasks': 'tasks', 'eventi': 'eventi',
    'pratiche': 'pratiche', 'progetti': 'progetti', 'routine': 'routine',
    'routineLog': 'routine_log', 'routine_log': 'routine_log',
    'obiettivi': 'obiettivi', 'spese': 'spese', 'incassi': 'incassi',
    'timeLog': 'time_log', 'time_log': 'time_log',
    'note': 'note', 'diario': 'diario'
  };
  
  // Per ogni chiave dal server, SOSTITUISCI il locale
  Object.keys(data).forEach(serverKey => {
    const localKey = keyMap[serverKey];
    if (localKey && Array.isArray(data[serverKey])) {
      if (localKey === 'note') {
        // Le note non hanno id, prendile tutte
        state[localKey] = data[serverKey];
      } else {
        state[localKey] = data[serverKey].filter(i => i && i.id);
      }
    }
  });
}

async function syncItem(collection, item) {
  const url = getApiUrl();
  if (!url) return;
  const sheetMap = { inbox:'INBOX', tasks:'TASKS', eventi:'EVENTI', pratiche:'PRATICHE', progetti:'PROGETTI', routine:'ROUTINE', routine_log:'ROUTINE_LOG', obiettivi:'OBIETTIVI', spese:'SPESE', incassi:'INCASSI', time_log:'TIME_LOG', diario:'DIARIO' };
  try { await fetch(`${url}?action=save&sheet=${sheetMap[collection]}&data=${encodeURIComponent(JSON.stringify(item))}`); } catch(e) {}
}

async function syncDelete(collection, id) {
  const url = getApiUrl();
  if (!url) return;
  const sheetMap = { inbox:'INBOX', tasks:'TASKS', eventi:'EVENTI', pratiche:'PRATICHE', progetti:'PROGETTI', routine:'ROUTINE', routine_log:'ROUTINE_LOG', obiettivi:'OBIETTIVI', spese:'SPESE', incassi:'INCASSI', time_log:'TIME_LOG', diario:'DIARIO' };
  try { await fetch(`${url}?action=delete&sheet=${sheetMap[collection]}&id=${id}`); } catch(e) {}
}

async function testConnection() {
  const url = document.getElementById('input-api-url').value.trim();
  const result = document.getElementById('connection-result');
  if (!url) { result.innerHTML = '<span style="color:#E74C3C">❌ Inserisci URL</span>'; return; }
  result.innerHTML = 'Testing...';
  try {
    const resp = await fetch(url + '?action=ping');
    const data = await resp.json();
    if (data.success || data.status === 'ok') {
      setApiUrl(url);
      result.innerHTML = '<span style="color:#27AE60">✅ Connesso!</span>';
    } else { result.innerHTML = '<span style="color:#E74C3C">❌ Risposta non valida</span>'; }
  } catch(e) { result.innerHTML = '<span style="color:#E74C3C">❌ Errore</span>'; }
}

function showSection(name) {
  state.currentSection = name;
  // Aggiorna URL hash per link diretti
  if (history.replaceState) {
    history.replaceState(null, null, '#' + name);
  } else {
    location.hash = name;
  }
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navMap = { dashboard: 0, tasks: 1, timer: 2, finanze: 3 };
  if (navMap[name] !== undefined) document.querySelectorAll('.nav-btn')[navMap[name]].classList.add('active');
  const titles = { dashboard: '📊 Dashboard', inbox: '📥 Inbox', tasks: '✅ Tasks', eventi: '📅 Eventi', pratiche: '📁 Pratiche', progetti: '📂 Progetti', routine: '🔄 Routine', obiettivi: '🎯 Obiettivi', timer: '⏱️ Timer', finanze: '💰 Finanze', agendaImpegni: '📋 Agenda Impegni', agendaEventi: '🗓️ Agenda Eventi', note: '📌 Note & Info', diario: '📔 Diario' };
  document.getElementById('header-title').textContent = titles[name] || name;
  render();
}

function toggleDrawer() { document.getElementById('drawer').classList.toggle('open'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); state.editingId = null; }

function openSettings() {
  document.getElementById('input-api-url').value = getApiUrl();
  document.getElementById('connection-result').innerHTML = '';
  openModal('modal-settings');
}

function render() {
  switch(state.currentSection) {
    case 'dashboard': renderDashboard(); break;
    case 'inbox': renderInbox(); break;
    case 'tasks': renderTasks(); break;
    case 'eventi': renderEventi(); break;
    case 'pratiche': renderPratiche(); break;
    case 'progetti': renderProgetti(); break;
    case 'routine': renderRoutine(); break;
    case 'obiettivi': renderObiettivi(); break;
    case 'timer': renderTimer(); break;
    case 'finanze': renderFinanze(); break;
    case 'agendaImpegni': renderAgendaImpegni(); break;
    case 'agendaEventi': renderAgendaEventi(); break;
    case 'note': renderNote(); break;
    case 'diario': renderDiario(); break;
  }
}

function updateStats() {
  const today = getToday();
  const openTasks = state.tasks.filter(t => t.stato !== 'completato').length;
  const inboxCount = state.inbox.filter(m => !m.processato).length;
  const todayEvents = state.eventi.filter(e => formatDateISO(parseDate(e.data)) === today).length;
  const mins = state.time_log.filter(t => formatDateISO(parseDate(t.data)) === today).reduce((s,t) => s + (parseInt(t.minuti)||0), 0);
  document.getElementById('stat-tasks').textContent = openTasks;
  document.getElementById('stat-inbox').textContent = inboxCount;
  document.getElementById('stat-eventi').textContent = todayEvents;
  document.getElementById('stat-tempo').textContent = Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
}

// DASHBOARD
function renderDashboard() {
  const today = getToday();
  const todayTasks = state.tasks.filter(t => formatDateISO(parseDate(t.scadenza)) === today && t.stato !== 'completato');
  const todayEvents = state.eventi.filter(e => formatDateISO(parseDate(e.data)) === today);
  
  let html = '<div class="dash-section"><h3>📋 Task di oggi</h3>';
  if (todayTasks.length === 0) html += '<p class="empty">Nessun task per oggi</p>';
  else todayTasks.forEach(t => { html += `<div class="list-item" onclick="openTask('${t.id}')"><span class="list-item-icon">✅</span><div class="list-item-content"><div class="list-item-title">${esc(t.titolo)}</div>${t.durata ? '<div class="list-item-meta">⏱️ '+t.durata+' min</div>' : ''}</div></div>`; });
  html += '</div>';
  
  html += '<div class="dash-section"><h3>📅 Eventi di oggi</h3>';
  if (todayEvents.length === 0) html += '<p class="empty">Nessun evento per oggi</p>';
  else todayEvents.forEach(e => { html += `<div class="list-item" onclick="openEvento('${e.id}')"><span class="list-item-icon">📅</span><div class="list-item-content"><div class="list-item-title">${esc(e.titolo)}</div><div class="list-item-meta">${e.ora || ''}${e.ora_fine ? '-'+e.ora_fine : ''} ${e.luogo ? '📍'+e.luogo : ''} ${e.durata ? '⏱️'+e.durata+'min' : ''}</div></div></div>`; });
  html += '</div>';
  
  // Widget Note & Info
  if (state.note && state.note.length > 0) {
    html += '<div class="dash-section"><h3>📌 Note & Info</h3>';
    const sorted = [...state.note].sort((a,b) => (parseInt(a.ordine)||99) - (parseInt(b.ordine)||99));
    sorted.slice(0, 5).forEach(n => {
      const icon = n.tipo === 'tip' ? '💡' : n.tipo === 'link' ? '🔗' : n.tipo === 'warning' ? '⚠️' : 'ℹ️';
      const contenuto = String(n.contenuto || '');
      const isLink = contenuto.startsWith('http');
      html += `<div class="list-item" ${isLink ? 'onclick="window.open(\''+esc(contenuto)+'\',\'_blank\')"' : 'onclick="showSection(\'note\')"'}>`;
      html += `<span class="list-item-icon">${icon}</span><div class="list-item-content"><div class="list-item-title">${esc(n.titolo)}</div>`;
      html += `<div class="list-item-meta">${isLink ? '🔗 Apri link' : esc(contenuto.substring(0, 80))}</div></div></div>`;
    });
    if (state.note.length > 5) html += `<p style="text-align:center;margin-top:8px"><a href="#" onclick="showSection('note');return false">Vedi tutte (${state.note.length})</a></p>`;
    html += '</div>';
  }
  
  document.getElementById('dashboard-content').innerHTML = html;
}

// NOTE
function renderNote() {
  const notes = state.note || [];
  let html = '';
  if (notes.length === 0) {
    html = '<p class="empty">Nessuna nota.<br>Aggiungi righe nel foglio NOTE del Google Sheet.</p>';
  } else {
    const sorted = [...notes].sort((a,b) => (parseInt(a.ordine)||99) - (parseInt(b.ordine)||99));
    sorted.forEach(n => {
      const icon = n.tipo === 'tip' ? '💡' : n.tipo === 'link' ? '🔗' : n.tipo === 'warning' ? '⚠️' : 'ℹ️';
      const contenuto = String(n.contenuto || '');
      const isLink = contenuto.startsWith('http');
      html += `<div class="note-card ${n.tipo || 'info'}">`;
      html += `<div class="note-header"><span>${icon}</span><strong>${esc(n.titolo)}</strong></div>`;
      if (isLink) {
        html += `<div class="note-body"><a href="${esc(contenuto)}" target="_blank">${esc(contenuto)}</a></div>`;
      } else {
        html += `<div class="note-body">${esc(contenuto).replace(/\n/g, '<br>')}</div>`;
      }
      html += '</div>';
    });
  }
  document.getElementById('note-content').innerHTML = html;
}

// DIARIO
let diarioView = 'day';
let diarioDate = getToday();

function renderDiario() {
  let html = '<div class="agenda-controls">';
  html += '<div class="agenda-nav"><button onclick="diarioNav(-1)">◀</button>';
  html += `<input type="date" value="${diarioDate}" onchange="diarioDateChange(this.value)">`;
  html += '<button onclick="diarioNav(1)">▶</button></div>';
  html += '<div class="agenda-views">';
  html += `<button class="${diarioView==='day'?'active':''}" onclick="setDiarioView('day')">Giorno</button>`;
  html += `<button class="${diarioView==='week'?'active':''}" onclick="setDiarioView('week')">Settimana</button>`;
  html += `<button class="${diarioView==='month'?'active':''}" onclick="setDiarioView('month')">Mese</button>`;
  html += `<button class="${diarioView==='quarter'?'active':''}" onclick="setDiarioView('quarter')">Trimestre</button>`;
  html += '</div></div>';
  html += '<div style="text-align:right;margin-bottom:10px"><button class="btn btn-primary" onclick="openNewDiario()">+ Aggiungi nota</button></div>';
  html += '<div id="diario-view-content"></div>';
  document.getElementById('diario-content').innerHTML = html;
  
  if (diarioView === 'day') renderDiarioDayView(diarioDate);
  else if (diarioView === 'week') renderDiarioWeekView(diarioDate);
  else if (diarioView === 'month') renderDiarioMonthView(diarioDate);
  else if (diarioView === 'quarter') renderDiarioQuarterView(diarioDate);
}

function setDiarioView(v) { diarioView = v; renderDiario(); }
function diarioNav(dir) {
  const d = new Date(diarioDate);
  if (diarioView === 'day') d.setDate(d.getDate() + dir);
  else if (diarioView === 'week') d.setDate(d.getDate() + dir * 7);
  else if (diarioView === 'month') d.setMonth(d.getMonth() + dir);
  else if (diarioView === 'quarter') d.setMonth(d.getMonth() + dir * 3);
  diarioDate = formatDateISO(d);
  renderDiario();
}
function diarioDateChange(v) { diarioDate = v; renderDiario(); }

function renderDiarioDayView(dateStr) {
  const items = (state.diario || []).filter(d => d.data === dateStr);
  const date = new Date(dateStr);
  const dayName = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  
  let html = `<h3>${dayName}</h3>`;
  html += '<div class="day-view">';
  
  // Griglia oraria con voci diario sovrapposte
  html += '<div class="time-grid">';
  for (let h = 7; h <= 21; h++) {
    html += `<div class="hour-row"><div class="hour-label">${h.toString().padStart(2,'0')}:00</div><div class="hour-content"></div></div>`;
  }
  
  // Voci diario posizionate sopra la griglia (dentro time-grid)
  html += '<div class="events-layer">';
  items.forEach(d => {
    const startHour = d.ora ? parseInt(d.ora.split(':')[0]) : 7;
    const startMin = d.ora ? parseInt(d.ora.split(':')[1]) : 0;
    const dur = parseInt(d.durata) || 30;
    const icon = d.tipo === 'task' ? '✅' : d.tipo === 'tempo' ? '⏱️' : d.tipo === 'nota' ? '📝' : '📔';
    const timeRange = formatTimeRange(d.ora, dur);
    
    // Calcola posizione (ogni ora = 50px)
    const topOffset = (startHour - 7) * 50 + (startMin / 60) * 50;
    const height = Math.max(24, (dur / 60) * 50);
    
    html += `<div class="agenda-item diario" style="top:${topOffset}px;height:${height}px" onclick="openDiario('${d.id}')">`;
    html += `<span class="item-icon">${icon}</span>`;
    html += `<span class="item-title">${esc(d.titolo)}</span>`;
    html += `<span class="item-meta">${timeRange}</span>`;
    html += `</div>`;
  });
  html += '</div></div>';
  
  html += '</div>';
  document.getElementById('diario-view-content').innerHTML = html;
}

function renderDiarioWeekView(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  let html = '<div class="week-grid">';
  for (let i = 0; i < 7; i++) {
    const curr = new Date(monday);
    curr.setDate(monday.getDate() + i);
    const ds = formatDateISO(curr);
    const items = (state.diario || []).filter(x => x.data === ds);
    const isToday = ds === getToday();
    html += `<div class="week-day ${isToday ? 'today' : ''}" onclick="diarioDate='${ds}';setDiarioView('day')">`;
    html += `<div class="week-day-header">${['Lun','Mar','Mer','Gio','Ven','Sab','Dom'][i]} ${curr.getDate()}</div>`;
    html += `<div class="week-day-count">${items.length} ${items.length===1?'voce':'voci'}</div>`;
    const mins = items.reduce((s,x) => s + (parseInt(x.durata)||0), 0);
    if (mins > 0) html += `<div class="week-day-meta">⏱️ ${mins} min</div>`;
    html += '</div>';
  }
  html += '</div>';
  document.getElementById('diario-view-content').innerHTML = html;
}

function renderDiarioMonthView(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  let html = `<h3 style="margin-bottom:15px">${['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][month]} ${year}</h3>`;
  html += '<div class="month-grid"><div class="month-header">L</div><div class="month-header">M</div><div class="month-header">M</div><div class="month-header">G</div><div class="month-header">V</div><div class="month-header">S</div><div class="month-header">D</div>';
  for (let i = 0; i < startPad; i++) html += '<div class="month-day empty"></div>';
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const items = (state.diario || []).filter(x => x.data === ds);
    const isToday = ds === getToday();
    html += `<div class="month-day ${isToday ? 'today' : ''} ${items.length ? 'has-items' : ''}" onclick="diarioDate='${ds}';setDiarioView('day')">${day}${items.length ? '<span class="dot"></span>' : ''}</div>`;
  }
  html += '</div>';
  document.getElementById('diario-view-content').innerHTML = html;
}

function renderDiarioQuarterView(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const quarter = Math.floor(d.getMonth() / 3);
  const months = [quarter * 3, quarter * 3 + 1, quarter * 3 + 2];
  const monthNames = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  let html = `<h3 style="margin-bottom:15px">Q${quarter+1} ${year}</h3><div class="quarter-grid">`;
  months.forEach(m => {
    html += `<div class="quarter-month"><h4>${monthNames[m]}</h4><div class="quarter-days">`;
    const lastDay = new Date(year, m + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const ds = `${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const items = (state.diario || []).filter(x => x.data === ds);
      html += `<div class="quarter-day ${items.length ? 'has-items' : ''}" onclick="diarioDate='${ds}';setDiarioView('day')">${day}</div>`;
    }
    html += '</div></div>';
  });
  html += '</div>';
  document.getElementById('diario-view-content').innerHTML = html;
}

function openNewDiario() {
  state.editingId = null;
  document.getElementById('diario-data').value = diarioDate;
  document.getElementById('diario-ora').value = '';
  document.getElementById('diario-tipo').value = 'nota';
  document.getElementById('diario-titolo').value = '';
  document.getElementById('diario-descrizione').value = '';
  document.getElementById('diario-durata').value = '';
  document.getElementById('diario-codice').value = '';
  document.getElementById('btn-del-diario').style.display = 'none';
  document.getElementById('modal-diario').classList.add('open');
}

function openDiario(id) {
  const d = state.diario.find(x => x.id === id);
  if (!d) return;
  state.editingId = id;
  document.getElementById('diario-data').value = d.data || '';
  document.getElementById('diario-ora').value = d.ora || '';
  document.getElementById('diario-tipo').value = d.tipo || 'nota';
  document.getElementById('diario-titolo').value = d.titolo || '';
  document.getElementById('diario-descrizione').value = d.descrizione || '';
  document.getElementById('diario-durata').value = d.durata || '';
  document.getElementById('diario-codice').value = d.codice || '';
  document.getElementById('btn-del-diario').style.display = '';
  document.getElementById('modal-diario').classList.add('open');
}

function saveDiario() {
  const item = {
    id: state.editingId || genId(),
    data: document.getElementById('diario-data').value,
    ora: document.getElementById('diario-ora').value,
    tipo: document.getElementById('diario-tipo').value,
    titolo: document.getElementById('diario-titolo').value,
    descrizione: document.getElementById('diario-descrizione').value,
    durata: document.getElementById('diario-durata').value,
    codice: document.getElementById('diario-codice').value,
    timestamp: new Date().toISOString()
  };
  if (state.editingId) {
    const idx = state.diario.findIndex(x => x.id === state.editingId);
    if (idx >= 0) state.diario[idx] = item;
  } else {
    state.diario.push(item);
  }
  closeModal('modal-diario'); saveData(); syncItem('diario', item); render(); toast('Salvato');
}

function deleteDiario() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.diario = state.diario.filter(x => x.id !== id);
  closeModal('modal-diario'); saveData(); syncDelete('diario', id); render(); toast('Eliminato');
}

function addToDiario(tipo, titolo, descrizione, durata, codice) {
  const item = {
    id: genId(),
    data: getToday(),
    ora: new Date().toTimeString().slice(0,5),
    tipo: tipo,
    titolo: titolo,
    descrizione: descrizione || '',
    durata: durata || '',
    codice: codice || '',
    timestamp: new Date().toISOString()
  };
  state.diario.push(item);
  saveData();
  syncItem('diario', item);
}

// INBOX
function renderInbox() {
  const items = state.inbox.filter(m => !m.processato);
  let html = '';
  if (items.length === 0) html = '<p class="empty">Inbox vuoto</p>';
  else items.forEach(m => {
    html += `<div class="list-item" onclick="openMemo('${m.id}')"><span class="list-item-icon">${m.urgente ? '🔴' : '📝'}</span><div class="list-item-content"><div class="list-item-title">${esc(m.titolo || m.testo)}</div><div class="list-item-meta">${formatDate(m.timestamp)} ${m.durata ? '⏱️'+m.durata+'min' : ''} ${m.scadenza ? '📅'+formatDate(m.scadenza) : ''}</div></div></div>`;
  });
  document.getElementById('inbox-list').innerHTML = html;
}

// TASKS
function renderTasks() {
  let items = [...state.tasks];
  const filter = state.taskFilter;
  if (filter === 'aperti') items = items.filter(t => t.stato !== 'completato');
  else if (filter === 'oggi') items = items.filter(t => formatDateISO(parseDate(t.scadenza)) === getToday() && t.stato !== 'completato');
  else if (filter === 'completati') items = items.filter(t => t.stato === 'completato');
  
  items.sort((a,b) => {
    const prio = {urgente:0, alta:1, media:2, bassa:3};
    const pa = prio[(a.priorita||'').toLowerCase()] ?? 2;
    const pb = prio[(b.priorita||'').toLowerCase()] ?? 2;
    if (pa !== pb) return pa - pb;
    // A parità di priorità, ordina per scadenza (prima le più vicine)
    const da = a.scadenza || '9999-12-31';
    const db = b.scadenza || '9999-12-31';
    return da.localeCompare(db);
  });
  
  let html = '';
  if (items.length === 0) html = '<p class="empty">Nessun task</p>';
  else items.forEach(t => {
    const done = t.stato === 'completato';
    html += `<div class="list-item ${done?'completed':''}" onclick="openTask('${t.id}')"><span class="list-item-icon">${done ? '✅' : '⬜'}</span><div class="list-item-content"><div class="list-item-title">${esc(t.titolo)}</div><div class="list-item-meta">${t.scadenza ? '📅'+formatDate(t.scadenza) : ''} ${t.durata ? '⏱️'+t.durata+'min' : ''} <span class="priority-${t.priorita||'media'}">${t.priorita||'media'}</span></div></div></div>`;
  });
  document.getElementById('tasks-list').innerHTML = html;
}

function filterTasks(filter) {
  state.taskFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderTasks();
}

// EVENTI
function renderEventi() {
  const items = [...state.eventi].sort((a,b) => new Date(a.data) - new Date(b.data));
  let html = '';
  if (items.length === 0) html = '<p class="empty">Nessun evento</p>';
  else items.forEach(e => {
    html += `<div class="list-item" onclick="openEvento('${e.id}')"><span class="list-item-icon">📅</span><div class="list-item-content"><div class="list-item-title">${esc(e.titolo)}</div><div class="list-item-meta">${formatDate(e.data)} ${e.ora||''}${e.ora_fine ? '-'+e.ora_fine : ''} ${e.luogo ? '📍'+e.luogo : ''} ${e.durata ? '⏱️'+e.durata+'min' : ''}</div></div></div>`;
  });
  document.getElementById('eventi-list').innerHTML = html;
}

// TIMER
function renderTimer() {
  const el = document.getElementById('btn-start');
  const el2 = document.getElementById('btn-stop');
  if (state.timer.active) {
    el.style.display = 'none';
    el2.style.display = 'inline-block';
  } else {
    el.style.display = 'inline-block';
    el2.style.display = 'none';
  }
  renderTimerLogs();
}

function renderTimerLogs() {
  const today = getToday();
  const logs = state.time_log.filter(l => formatDateISO(parseDate(l.data)) === today);
  let html = '<h3>⏱️ Tempo registrato oggi</h3>';
  if (logs.length === 0) html += '<p class="empty">Nessuna registrazione</p>';
  else {
    const total = logs.reduce((s,l) => s + (parseInt(l.minuti)||0), 0);
    html += `<p><strong>Totale: ${Math.floor(total/60)}h ${total%60}m</strong></p>`;
    logs.forEach(l => {
      html += `<div class="list-item"><span class="list-item-icon">⏱️</span><div class="list-item-content"><div class="list-item-title">${esc(l.descrizione)}</div><div class="list-item-meta">${l.minuti} min - ${l.tipo}</div></div></div>`;
    });
  }
  document.getElementById('timer-logs').innerHTML = html;
}

// FINANZE
function renderFinanze() {
  const thisMonth = getToday().substring(0, 7);
  const spese = state.spese.filter(s => s.data && s.data.startsWith(thisMonth));
  const incassi = state.incassi.filter(i => i.data && i.data.startsWith(thisMonth));
  const totSpese = spese.reduce((s,x) => s + (parseFloat(x.importo)||0), 0);
  const totIncassi = incassi.reduce((s,x) => s + (parseFloat(x.importo)||0), 0);
  
  let html = `<div class="finanze-summary"><div class="fin-card fin-spese"><span class="fin-label">Spese</span><span class="fin-value">€${totSpese.toFixed(2)}</span></div><div class="fin-card fin-incassi"><span class="fin-label">Incassi</span><span class="fin-value">€${totIncassi.toFixed(2)}</span></div><div class="fin-card fin-saldo"><span class="fin-label">Saldo</span><span class="fin-value">€${(totIncassi-totSpese).toFixed(2)}</span></div></div>`;
  
  const categorieSpese = {
    'spese_ufficio': 'Spese ufficio',
    'spese_auto': 'Spese auto e motoveicoli',
    'imposte': 'Pagamento imposte',
    'gioco': 'Gioco e azzardi',
    'cibo': 'Cibo e bevande',
    'pagamenti_ai': 'Pagamenti AI',
    'pagamenti_digitali': 'Altri pagamenti digitali',
    'fitness': 'Fitness e cura personale',
    'farmaci': 'Farmaci',
    'affitti_mutui': 'Affitti e mutui extra ufficio',
    'altro': 'Altro'
  };
  const all = [...spese.map(x=>({...x,_t:'spesa'})), ...incassi.map(x=>({...x,_t:'incasso'}))].sort((a,b) => new Date(b.data) - new Date(a.data));
  
  html += '<div class="finanze-list">';
  all.forEach(x => {
    const label = x._t === 'spesa' ? (x.descrizione || categorieSpese[x.categoria] || x.categoria || '-') : (x.descrizione || x.tipo || '-');
    html += `<div class="list-item" onclick="open${x._t==='spesa'?'Spesa':'Incasso'}('${x.id}')"><span class="list-item-icon">${x._t==='spesa'?'💸':'💰'}</span><div class="list-item-content"><div class="list-item-title">${esc(label)}</div><div class="list-item-meta">${formatDate(x.data)} ${x._t==='spesa' && x.categoria ? '| '+categorieSpese[x.categoria] : ''}</div></div><span class="list-item-value ${x._t==='spesa'?'text-danger':'text-success'}">€${parseFloat(x.importo).toFixed(2)}</span></div>`;
  });
  html += '</div>';
  document.getElementById('finanze-content').innerHTML = html;
}

// PRATICHE
function renderPratiche() {
  const items = state.pratiche.filter(p => p.stato !== 'chiusa');
  let html = '';
  if (items.length === 0) html = '<p class="empty">Nessuna pratica attiva</p>';
  else items.forEach(p => {
    html += `<div class="list-item" onclick="openPratica('${p.id}')"><span class="list-item-icon">📁</span><div class="list-item-content"><div class="list-item-title">${esc(p.codice)} - ${esc(p.cliente)}</div><div class="list-item-meta">${p.tipo||''} | ${p.stato}</div></div></div>`;
  });
  document.getElementById('pratiche-list').innerHTML = html;
}

// PROGETTI
function renderProgetti() {
  const items = state.progetti.filter(p => p.stato !== 'completato' && p.stato !== 'annullato');
  let html = '';
  if (items.length === 0) html = '<p class="empty">Nessun progetto attivo</p>';
  else items.forEach(p => {
    html += `<div class="list-item" onclick="openProgetto('${p.id}')"><span class="list-item-icon">📂</span><div class="list-item-content"><div class="list-item-title">${esc(p.codice)} - ${esc(p.nome)}</div><div class="list-item-meta">${p.stato}</div></div></div>`;
  });
  document.getElementById('progetti-list').innerHTML = html;
}

// ROUTINE
function renderRoutine() {
  const items = state.routine.filter(r => r.attiva !== false && r.attiva !== 'FALSE');
  const today = getToday();
  let html = '';
  if (items.length === 0) html = '<p class="empty">Nessuna routine attiva</p>';
  else items.forEach(r => {
    const done = state.routine_log.some(l => l.routineId === r.id && formatDateISO(parseDate(l.data)) === today);
    html += `<div class="list-item ${done?'completed':''}" onclick="toggleRoutineLog('${r.id}')"><span class="list-item-icon">${r.icona || '🔄'}</span><div class="list-item-content"><div class="list-item-title">${esc(r.nome)}</div><div class="list-item-meta">${r.frequenza}</div></div><span class="list-item-check">${done ? '✅' : '⬜'}</span></div>`;
  });
  document.getElementById('routine-list').innerHTML = html;
}

function toggleRoutineLog(routineId) {
  const today = getToday();
  const idx = state.routine_log.findIndex(l => l.routineId === routineId && formatDateISO(parseDate(l.data)) === today);
  if (idx >= 0) {
    const id = state.routine_log[idx].id;
    state.routine_log.splice(idx, 1);
    saveData(); syncDelete('routine_log', id);
  } else {
    const item = { id: genId(), routineId, data: today, timestamp: new Date().toISOString() };
    state.routine_log.push(item);
    saveData(); syncItem('routine_log', item);
  }
  render();
}

// OBIETTIVI
function renderObiettivi() {
  const items = state.obiettivi;
  let html = '';
  if (items.length === 0) html = '<p class="empty">Nessun obiettivo</p>';
  else items.forEach(o => {
    const pct = o.tipo === 'numerico' && o.target ? Math.min(100, Math.round((o.attuale||0) / o.target * 100)) : 0;
    html += `<div class="list-item" onclick="openObiettivo('${o.id}')"><span class="list-item-icon">🎯</span><div class="list-item-content"><div class="list-item-title">${esc(o.descrizione)}</div><div class="list-item-meta">${o.periodo} ${o.tipo==='numerico' ? '| '+pct+'%' : ''}</div></div></div>`;
  });
  document.getElementById('obiettivi-list').innerHTML = html;
}

// ====== AGENDA IMPEGNI (Task + Memo) ======
function renderAgendaImpegni() {
  const view = state.agendaView;
  const dateStr = state.agendaDate;
  
  let html = `<div class="agenda-controls">
    <div class="agenda-nav">
      <button onclick="agendaNav(-1)">◀</button>
      <input type="date" value="${dateStr}" onchange="agendaDateChange(this.value)">
      <button onclick="agendaNav(1)">▶</button>
    </div>
    <div class="agenda-views">
      <button class="${view==='day'?'active':''}" onclick="setAgendaView('day')">Giorno</button>
      <button class="${view==='week'?'active':''}" onclick="setAgendaView('week')">Settimana</button>
      <button class="${view==='month'?'active':''}" onclick="setAgendaView('month')">Mese</button>
      <button class="${view==='quarter'?'active':''}" onclick="setAgendaView('quarter')">Trimestre</button>
    </div>
  </div>`;
  
  html += '<div class="agenda-content">';
  
  if (view === 'day') {
    html += renderAgendaDayView(dateStr, 'impegni');
  } else if (view === 'week') {
    html += renderAgendaWeekView(dateStr, 'impegni');
  } else if (view === 'month') {
    html += renderAgendaMonthView(dateStr, 'impegni');
  } else if (view === 'quarter') {
    html += renderAgendaQuarterView(dateStr, 'impegni');
  }
  
  html += '</div>';
  document.getElementById('agenda-impegni-content').innerHTML = html;
}

function setAgendaView(v) { state.agendaView = v; renderAgendaImpegni(); }
function agendaDateChange(v) { state.agendaDate = v; renderAgendaImpegni(); }
function agendaNav(dir) {
  const d = new Date(state.agendaDate);
  if (state.agendaView === 'day') d.setDate(d.getDate() + dir);
  else if (state.agendaView === 'week') d.setDate(d.getDate() + (dir * 7));
  else if (state.agendaView === 'month') d.setMonth(d.getMonth() + dir);
  else if (state.agendaView === 'quarter') d.setMonth(d.getMonth() + (dir * 3));
  state.agendaDate = d.toISOString().split('T')[0];
  renderAgendaImpegni();
}

// ====== AGENDA EVENTI ======
function renderAgendaEventi() {
  const view = state.eventiView;
  const dateStr = state.eventiDate;
  
  let html = `<div class="agenda-controls">
    <div class="agenda-nav">
      <button onclick="eventiNav(-1)">◀</button>
      <input type="date" value="${dateStr}" onchange="eventiDateChange(this.value)">
      <button onclick="eventiNav(1)">▶</button>
    </div>
    <div class="agenda-views">
      <button class="${view==='day'?'active':''}" onclick="setEventiView('day')">Giorno</button>
      <button class="${view==='week'?'active':''}" onclick="setEventiView('week')">Settimana</button>
      <button class="${view==='month'?'active':''}" onclick="setEventiView('month')">Mese</button>
      <button class="${view==='quarter'?'active':''}" onclick="setEventiView('quarter')">Trimestre</button>
    </div>
  </div>`;
  
  html += '<div class="agenda-content">';
  
  if (view === 'day') {
    html += renderAgendaDayView(dateStr, 'eventi');
  } else if (view === 'week') {
    html += renderAgendaWeekView(dateStr, 'eventi');
  } else if (view === 'month') {
    html += renderAgendaMonthView(dateStr, 'eventi');
  } else if (view === 'quarter') {
    html += renderAgendaQuarterView(dateStr, 'eventi');
  }
  
  html += '</div>';
  document.getElementById('agenda-eventi-content').innerHTML = html;
}

function setEventiView(v) { state.eventiView = v; renderAgendaEventi(); }
function eventiDateChange(v) { state.eventiDate = v; renderAgendaEventi(); }
function eventiNav(dir) {
  const d = new Date(state.eventiDate);
  if (state.eventiView === 'day') d.setDate(d.getDate() + dir);
  else if (state.eventiView === 'week') d.setDate(d.getDate() + (dir * 7));
  else if (state.eventiView === 'month') d.setMonth(d.getMonth() + dir);
  else if (state.eventiView === 'quarter') d.setMonth(d.getMonth() + (dir * 3));
  state.eventiDate = d.toISOString().split('T')[0];
  renderAgendaEventi();
}

// VISTA GIORNO (con ore 07:00-21:00)
function renderAgendaDayView(dateStr, tipo) {
  const date = new Date(dateStr);
  const dayName = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  
  let items = [];
  if (tipo === 'impegni') {
    // Task e Memo del giorno
    const tasks = state.tasks.filter(t => formatDateISO(parseDate(t.scadenza)) === dateStr && t.stato !== 'completato');
    const memos = state.inbox.filter(m => formatDateISO(parseDate(m.scadenza)) === dateStr && !m.processato);
    items = [...tasks.map(t => ({...t, _tipo: 'task'})), ...memos.map(m => ({...m, _tipo: 'memo'}))];
  } else {
    items = state.eventi.filter(e => formatDateISO(parseDate(e.data)) === dateStr).map(e => ({...e, _tipo: 'evento'}));
  }
  
  let html = `<h3>${dayName}</h3>`;
  html += '<div class="day-view">';
  
  // Griglia oraria 07:00 - 21:00
  let currentMinute = 7 * 60; // 07:00 in minuti
  const endMinute = 21 * 60; // 21:00
  
  if (tipo === 'eventi') {
    // Griglia oraria con eventi sovrapposti
    html += '<div class="time-grid">';
    for (let h = 7; h <= 21; h++) {
      html += `<div class="hour-row"><div class="hour-label">${h.toString().padStart(2,'0')}:00</div><div class="hour-content"></div></div>`;
    }
    // Eventi posizionati sopra la griglia (dentro time-grid)
    html += '<div class="events-layer">';
    items.forEach(e => {
      const startHour = e.ora ? parseInt(e.ora.split(':')[0]) : 7;
      const startMin = e.ora ? parseInt(e.ora.split(':')[1]) : 0;
      const dur = parseInt(e.durata) || 60;
      const timeRange = formatTimeRange(e.ora, dur);
      
      // Calcola posizione (ogni ora = 50px)
      const topOffset = (startHour - 7) * 50 + (startMin / 60) * 50;
      const height = Math.max(24, (dur / 60) * 50);
      
      html += `<div class="agenda-item evento" style="top:${topOffset}px;height:${height}px" onclick="openEvento('${e.id}')">`;
      html += `<span class="item-title">${esc(e.titolo)}</span>`;
      html += `<span class="item-meta">${timeRange}</span>`;
      html += `</div>`;
    });
    html += '</div></div>';
  } else {
    // Task/Memo: griglia oraria con posizionamento
    html += '<div class="time-grid">';
    for (let h = 7; h <= 21; h++) {
      html += `<div class="hour-row"><div class="hour-label">${h.toString().padStart(2,'0')}:00</div><div class="hour-content"></div></div>`;
    }
    
    // Impegni posizionati sopra la griglia (dentro time-grid)
    html += '<div class="events-layer">';
    let accMins = 7 * 60; // Inizia dalle 7:00
    items.forEach(item => {
      const dur = parseInt(item.durata) || 30;
      const icon = item._tipo === 'task' ? '✅' : '📝';
      const timeRange = formatTimeRange(`${Math.floor(accMins/60).toString().padStart(2,'0')}:${(accMins%60).toString().padStart(2,'0')}`, dur);
      
      // Calcola posizione (ogni ora = 50px)
      const topOffset = (accMins - 7 * 60) / 60 * 50;
      const height = Math.max(24, (dur / 60) * 50);
      
      if (accMins < endMinute) {
        html += `<div class="agenda-item ${item._tipo}" style="top:${topOffset}px;height:${height}px" onclick="open${item._tipo==='task'?'Task':'Memo'}('${item.id}')">`;
        html += `<span class="item-icon">${icon}</span>`;
        html += `<span class="item-title">${esc(item.titolo)}</span>`;
        html += `<span class="item-meta">${timeRange}</span>`;
        html += `</div>`;
      }
      accMins += dur;
    });
    html += '</div></div>';
    
    // Sommario totale
    const totalMins = items.reduce((s, i) => s + (parseInt(i.durata) || 30), 0);
    html += `<div class="day-summary"><strong>Totale impegni: ${Math.floor(totalMins/60)}h ${totalMins%60}m</strong> (${items.length} elementi)</div>`;
  }
  
  html += '</div>';
  return html;
}

// VISTA SETTIMANA
function renderAgendaWeekView(dateStr, tipo) {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  
  const days = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  
  let html = '<div class="week-view"><div class="week-header">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isToday = formatDateISO(d) === getToday();
    html += `<div class="week-day-header ${isToday?'today':''}">${days[i]}<br>${d.getDate()}</div>`;
  }
  html += '</div><div class="week-body">';
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = formatDateISO(d);
    
    let items = [];
    if (tipo === 'impegni') {
      const tasks = state.tasks.filter(t => formatDateISO(parseDate(t.scadenza)) === ds && t.stato !== 'completato');
      const memos = state.inbox.filter(m => formatDateISO(parseDate(m.scadenza)) === ds && !m.processato);
      items = [...tasks.map(t=>({...t,_t:'task'})), ...memos.map(m=>({...m,_t:'memo'}))];
    } else {
      items = state.eventi.filter(e => formatDateISO(parseDate(e.data)) === ds);
    }
    
    const totalMins = items.reduce((s,i) => s + (parseInt(i.durata)||30), 0);
    
    html += `<div class="week-day-col"><div class="week-day-content">`;
    items.slice(0, 4).forEach(item => {
      const icon = tipo === 'eventi' ? '📅' : (item._t === 'task' ? '✅' : '📝');
      html += `<div class="week-item">${icon} ${esc((item.titolo||'').substring(0,15))}</div>`;
    });
    if (items.length > 4) html += `<div class="week-item more">+${items.length - 4} altri</div>`;
    if (items.length > 0) html += `<div class="week-total">${Math.floor(totalMins/60)}h${totalMins%60}m</div>`;
    html += '</div></div>';
  }
  html += '</div></div>';
  return html;
}

// VISTA MESE
function renderAgendaMonthView(dateStr, tipo) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7; // Lunedì = 0
  
  const monthName = date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  
  let html = `<h3>${monthName}</h3><div class="month-view"><div class="month-header">`;
  ['L','M','M','G','V','S','D'].forEach(d => html += `<div class="month-day-header">${d}</div>`);
  html += '</div><div class="month-body">';
  
  for (let i = 0; i < startPad; i++) html += '<div class="month-day empty"></div>';
  
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const ds = `${year}-${(month+1).toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
    const isToday = ds === getToday();
    
    let count = 0;
    if (tipo === 'impegni') {
      count = state.tasks.filter(t => formatDateISO(parseDate(t.scadenza)) === ds && t.stato !== 'completato').length;
      count += state.inbox.filter(m => formatDateISO(parseDate(m.scadenza)) === ds && !m.processato).length;
    } else {
      count = state.eventi.filter(e => formatDateISO(parseDate(e.data)) === ds).length;
    }
    
    html += `<div class="month-day ${isToday?'today':''}" onclick="state.agendaDate='${ds}';state.agendaView='day';render()"><span class="day-num">${day}</span>${count > 0 ? '<span class="day-count">'+count+'</span>' : ''}</div>`;
  }
  
  html += '</div></div>';
  return html;
}

// VISTA TRIMESTRE
function renderAgendaQuarterView(dateStr, tipo) {
  const date = new Date(dateStr);
  const currentMonth = date.getMonth();
  const quarterStart = Math.floor(currentMonth / 3) * 3;
  
  let html = '<div class="quarter-view">';
  
  for (let m = 0; m < 3; m++) {
    const monthDate = new Date(date.getFullYear(), quarterStart + m, 1);
    const monthName = monthDate.toLocaleDateString('it-IT', { month: 'short' });
    const lastDay = new Date(date.getFullYear(), quarterStart + m + 1, 0).getDate();
    
    html += `<div class="quarter-month"><h4>${monthName}</h4><div class="quarter-days">`;
    
    for (let day = 1; day <= lastDay; day++) {
      const ds = `${date.getFullYear()}-${(quarterStart+m+1).toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
      let count = 0;
      if (tipo === 'impegni') {
        count = state.tasks.filter(t => formatDateISO(parseDate(t.scadenza)) === ds && t.stato !== 'completato').length;
        count += state.inbox.filter(i => formatDateISO(parseDate(i.scadenza)) === ds && !i.processato).length;
      } else {
        count = state.eventi.filter(e => formatDateISO(parseDate(e.data)) === ds).length;
      }
      const hasItems = count > 0;
      html += `<div class="quarter-day ${hasItems?'has-items':''}" title="${ds}: ${count}">${day}</div>`;
    }
    
    html += '</div></div>';
  }
  
  html += '</div>';
  return html;
}

// CRUD MEMO
function openNewMemo() {
  state.editingId = null;
  document.getElementById('memo-titolo').value = '';
  document.getElementById('memo-testo').value = '';
  document.getElementById('memo-scadenza').value = '';
  document.getElementById('memo-durata').value = '';
  document.getElementById('memo-urgente').checked = false;
  document.getElementById('memo-link1').value = '';
  document.getElementById('memo-link2').value = '';
  document.getElementById('btn-del-memo').style.display = 'none';
  openModal('modal-memo');
}

function openMemo(id) {
  const m = state.inbox.find(x => x.id === id);
  if (!m) return;
  state.editingId = id;
  document.getElementById('memo-titolo').value = m.titolo || m.testo || '';
  document.getElementById('memo-testo').value = m.testo || '';
  document.getElementById('memo-scadenza').value = m.scadenza ? formatDateISO(parseDate(m.scadenza)) : '';
  document.getElementById('memo-durata').value = m.durata || '';
  document.getElementById('memo-urgente').checked = m.urgente || false;
  document.getElementById('memo-link1').value = m.link1 || '';
  document.getElementById('memo-link2').value = m.link2 || '';
  document.getElementById('btn-del-memo').style.display = 'inline-block';
  openModal('modal-memo');
}

function saveMemo() {
  const titolo = document.getElementById('memo-titolo').value.trim();
  if (!titolo) { toast('Inserisci titolo'); return; }
  const item = { 
    id: state.editingId || genId(), 
    titolo, 
    testo: document.getElementById('memo-testo').value,
    scadenza: document.getElementById('memo-scadenza').value,
    durata: document.getElementById('memo-durata').value,
    urgente: document.getElementById('memo-urgente').checked,
    link1: document.getElementById('memo-link1').value,
    link2: document.getElementById('memo-link2').value,
    processato: false,
    timestamp: new Date().toISOString() 
  };
  if (state.editingId) { const i = state.inbox.findIndex(x => x.id === state.editingId); if (i >= 0) state.inbox[i] = item; }
  else state.inbox.push(item);
  closeModal('modal-memo'); saveData(); syncItem('inbox', item); render(); updateStats(); toast('Salvato!');
}

function deleteMemo() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.inbox = state.inbox.filter(x => x.id !== id);
  closeModal('modal-memo'); saveData(); syncDelete('inbox', id); render(); updateStats(); toast('Eliminato');
}

// CRUD TASK
function openNewTask() {
  state.editingId = null;
  document.getElementById('task-titolo').value = '';
  document.getElementById('task-descrizione').value = '';
  document.getElementById('task-scadenza').value = '';
  document.getElementById('task-durata').value = '';
  document.getElementById('task-priorita').value = 'media';
  document.getElementById('task-stato').value = 'da_fare';
  document.getElementById('task-codice').value = '';
  document.getElementById('task-link1').value = '';
  document.getElementById('task-link2').value = '';
  document.getElementById('btn-del-task').style.display = 'none';
  openModal('modal-task');
}

function openTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  state.editingId = id;
  document.getElementById('task-titolo').value = t.titolo || '';
  document.getElementById('task-descrizione').value = t.descrizione || '';
  document.getElementById('task-scadenza').value = t.scadenza ? formatDateISO(parseDate(t.scadenza)) : '';
  document.getElementById('task-durata').value = t.durata || '';
  document.getElementById('task-priorita').value = t.priorita || 'media';
  document.getElementById('task-stato').value = t.stato || 'da_fare';
  document.getElementById('task-codice').value = t.codice || '';
  document.getElementById('task-link1').value = t.link1 || '';
  document.getElementById('task-link2').value = t.link2 || '';
  document.getElementById('btn-del-task').style.display = 'inline-block';
  openModal('modal-task');
}

function saveTask() {
  const titolo = document.getElementById('task-titolo').value.trim();
  if (!titolo) { toast('Inserisci titolo'); return; }
  const oldTask = state.editingId ? state.tasks.find(x => x.id === state.editingId) : null;
  const wasCompleted = oldTask ? oldTask.stato === 'completato' : false;
  const item = { 
    id: state.editingId || genId(), 
    titolo, 
    descrizione: document.getElementById('task-descrizione').value, 
    scadenza: document.getElementById('task-scadenza').value, 
    durata: document.getElementById('task-durata').value,
    priorita: document.getElementById('task-priorita').value, 
    stato: document.getElementById('task-stato').value, 
    codice: document.getElementById('task-codice').value,
    link1: document.getElementById('task-link1').value,
    link2: document.getElementById('task-link2').value,
    creato: new Date().toISOString() 
  };
  // Registra nel diario se appena completato
  if (item.stato === 'completato' && !wasCompleted) {
    addToDiario('task', '✅ ' + titolo, item.descrizione, item.durata, item.codice);
  }
  if (state.editingId) { const i = state.tasks.findIndex(x => x.id === state.editingId); if (i >= 0) state.tasks[i] = item; }
  else state.tasks.push(item);
  closeModal('modal-task'); saveData(); syncItem('tasks', item); render(); updateStats(); toast('Salvato!');
}

function deleteTask() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.tasks = state.tasks.filter(x => x.id !== id);
  closeModal('modal-task'); saveData(); syncDelete('tasks', id); render(); updateStats(); toast('Eliminato');
}

// CRUD EVENTO
function openNewEvento() {
  state.editingId = null;
  document.getElementById('evento-titolo').value = '';
  document.getElementById('evento-data').value = getToday();
  document.getElementById('evento-ora').value = '';
  document.getElementById('evento-durata').value = '';
  document.getElementById('evento-luogo').value = '';
  document.getElementById('evento-note').value = '';
  document.getElementById('btn-del-evento').style.display = 'none';
  openModal('modal-evento');
}

function openEvento(id) {
  const e = state.eventi.find(x => x.id === id);
  if (!e) return;
  state.editingId = id;
  document.getElementById('evento-titolo').value = e.titolo || '';
  document.getElementById('evento-data').value = e.data ? formatDateISO(parseDate(e.data)) : '';
  document.getElementById('evento-ora').value = e.ora || '';
  document.getElementById('evento-durata').value = e.durata || '';
  document.getElementById('evento-luogo').value = e.luogo || '';
  document.getElementById('evento-note').value = e.note || '';
  document.getElementById('btn-del-evento').style.display = 'inline-block';
  openModal('modal-evento');
}

function saveEvento() {
  const titolo = document.getElementById('evento-titolo').value.trim();
  const data = document.getElementById('evento-data').value;
  if (!titolo || !data) { toast('Inserisci titolo e data'); return; }
  const item = { 
    id: state.editingId || genId(), 
    titolo, 
    data, 
    ora: document.getElementById('evento-ora').value, 
    durata: document.getElementById('evento-durata').value,
    luogo: document.getElementById('evento-luogo').value, 
    note: document.getElementById('evento-note').value, 
    timestamp: new Date().toISOString() 
  };
  if (state.editingId) { const i = state.eventi.findIndex(x => x.id === state.editingId); if (i >= 0) state.eventi[i] = item; }
  else state.eventi.push(item);
  closeModal('modal-evento'); saveData(); syncItem('eventi', item); render(); updateStats(); toast('Salvato!');
}

function deleteEvento() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.eventi = state.eventi.filter(x => x.id !== id);
  closeModal('modal-evento'); saveData(); syncDelete('eventi', id); render(); updateStats(); toast('Eliminato');
}

// CRUD PRATICA
function openNewPratica() {
  state.editingId = null;
  document.getElementById('pratica-codice').value = '';
  document.getElementById('pratica-cliente').value = '';
  document.getElementById('pratica-tipo').value = '';
  document.getElementById('pratica-stato').value = 'aperta';
  document.getElementById('pratica-link1').value = '';
  document.getElementById('pratica-link2').value = '';
  document.getElementById('btn-del-pratica').style.display = 'none';
  openModal('modal-pratica');
}

function openPratica(id) {
  const p = state.pratiche.find(x => x.id === id);
  if (!p) return;
  state.editingId = id;
  document.getElementById('pratica-codice').value = p.codice || '';
  document.getElementById('pratica-cliente').value = p.cliente || '';
  document.getElementById('pratica-tipo').value = p.tipo || '';
  document.getElementById('pratica-stato').value = p.stato || 'aperta';
  document.getElementById('pratica-link1').value = p.link1 || '';
  document.getElementById('pratica-link2').value = p.link2 || '';
  document.getElementById('btn-del-pratica').style.display = 'inline-block';
  openModal('modal-pratica');
}

function savePratica() {
  const codice = document.getElementById('pratica-codice').value.trim();
  const cliente = document.getElementById('pratica-cliente').value.trim();
  if (!codice || !cliente) { toast('Inserisci codice e cliente'); return; }
  const item = { id: state.editingId || genId(), codice, cliente, tipo: document.getElementById('pratica-tipo').value, stato: document.getElementById('pratica-stato').value, link1: document.getElementById('pratica-link1').value, link2: document.getElementById('pratica-link2').value, timestamp: new Date().toISOString() };
  if (state.editingId) { const i = state.pratiche.findIndex(x => x.id === state.editingId); if (i >= 0) state.pratiche[i] = item; }
  else state.pratiche.push(item);
  closeModal('modal-pratica'); saveData(); syncItem('pratiche', item); render(); toast('Salvato!');
}

function deletePratica() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.pratiche = state.pratiche.filter(x => x.id !== id);
  closeModal('modal-pratica'); saveData(); syncDelete('pratiche', id); render(); toast('Eliminato');
}

// CRUD PROGETTO
function openNewProgetto() {
  state.editingId = null;
  document.getElementById('progetto-codice').value = '';
  document.getElementById('progetto-nome').value = '';
  document.getElementById('progetto-stato').value = 'pianificato';
  document.getElementById('progetto-link1').value = '';
  document.getElementById('progetto-link2').value = '';
  document.getElementById('btn-del-progetto').style.display = 'none';
  openModal('modal-progetto');
}

function openProgetto(id) {
  const p = state.progetti.find(x => x.id === id);
  if (!p) return;
  state.editingId = id;
  document.getElementById('progetto-codice').value = p.codice || '';
  document.getElementById('progetto-nome').value = p.nome || '';
  document.getElementById('progetto-stato').value = p.stato || 'pianificato';
  document.getElementById('progetto-link1').value = p.link1 || '';
  document.getElementById('progetto-link2').value = p.link2 || '';
  document.getElementById('btn-del-progetto').style.display = 'inline-block';
  openModal('modal-progetto');
}

function saveProgetto() {
  const codice = document.getElementById('progetto-codice').value.trim();
  const nome = document.getElementById('progetto-nome').value.trim();
  if (!codice || !nome) { toast('Inserisci codice e nome'); return; }
  const item = { id: state.editingId || genId(), codice, nome, stato: document.getElementById('progetto-stato').value, link1: document.getElementById('progetto-link1').value, link2: document.getElementById('progetto-link2').value, timestamp: new Date().toISOString() };
  if (state.editingId) { const i = state.progetti.findIndex(x => x.id === state.editingId); if (i >= 0) state.progetti[i] = item; }
  else state.progetti.push(item);
  closeModal('modal-progetto'); saveData(); syncItem('progetti', item); render(); toast('Salvato!');
}

function deleteProgetto() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.progetti = state.progetti.filter(x => x.id !== id);
  closeModal('modal-progetto'); saveData(); syncDelete('progetti', id); render(); toast('Eliminato');
}

// CRUD ROUTINE
function openNewRoutine() {
  state.editingId = null;
  document.getElementById('routine-nome').value = '';
  document.getElementById('routine-icona').value = '';
  document.getElementById('routine-frequenza').value = 'giornaliera';
  document.getElementById('btn-del-routine').style.display = 'none';
  openModal('modal-routine');
}

function openRoutine(id) {
  const r = state.routine.find(x => x.id === id);
  if (!r) return;
  state.editingId = id;
  document.getElementById('routine-nome').value = r.nome || '';
  document.getElementById('routine-icona').value = r.icona || '';
  document.getElementById('routine-frequenza').value = r.frequenza || 'giornaliera';
  document.getElementById('btn-del-routine').style.display = 'inline-block';
  openModal('modal-routine');
}

function saveRoutine() {
  const nome = document.getElementById('routine-nome').value.trim();
  if (!nome) { toast('Inserisci nome'); return; }
  const item = { id: state.editingId || genId(), nome, icona: document.getElementById('routine-icona').value, frequenza: document.getElementById('routine-frequenza').value, attiva: true, timestamp: new Date().toISOString() };
  if (state.editingId) { const i = state.routine.findIndex(x => x.id === state.editingId); if (i >= 0) state.routine[i] = item; }
  else state.routine.push(item);
  closeModal('modal-routine'); saveData(); syncItem('routine', item); render(); toast('Salvato!');
}

function deleteRoutine() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.routine = state.routine.filter(x => x.id !== id);
  closeModal('modal-routine'); saveData(); syncDelete('routine', id); render(); toast('Eliminato');
}

// CRUD OBIETTIVO
function openNewObiettivo() {
  state.editingId = null;
  document.getElementById('obiettivo-descrizione').value = '';
  document.getElementById('obiettivo-periodo').value = 'mensile';
  document.getElementById('obiettivo-target').value = '';
  document.getElementById('btn-del-obiettivo').style.display = 'none';
  openModal('modal-obiettivo');
}

function openObiettivo(id) {
  const o = state.obiettivi.find(x => x.id === id);
  if (!o) return;
  state.editingId = id;
  document.getElementById('obiettivo-descrizione').value = o.descrizione || '';
  document.getElementById('obiettivo-periodo').value = o.periodo || 'mensile';
  document.getElementById('obiettivo-target').value = o.target || '';
  document.getElementById('btn-del-obiettivo').style.display = 'inline-block';
  openModal('modal-obiettivo');
}

function saveObiettivo() {
  const desc = document.getElementById('obiettivo-descrizione').value.trim();
  if (!desc) { toast('Inserisci descrizione'); return; }
  const item = { id: state.editingId || genId(), descrizione: desc, periodo: document.getElementById('obiettivo-periodo').value, target: document.getElementById('obiettivo-target').value, attuale: 0, creato: new Date().toISOString() };
  if (state.editingId) { const i = state.obiettivi.findIndex(x => x.id === state.editingId); if (i >= 0) state.obiettivi[i] = item; }
  else state.obiettivi.push(item);
  closeModal('modal-obiettivo'); saveData(); syncItem('obiettivi', item); render(); toast('Salvato!');
}

function deleteObiettivo() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.obiettivi = state.obiettivi.filter(x => x.id !== id);
  closeModal('modal-obiettivo'); saveData(); syncDelete('obiettivi', id); render(); toast('Eliminato');
}

// TIMER
function updateTimerDisplay() {
  if (state.timer.active && state.timer.startTime) {
    const secs = Math.floor((new Date() - new Date(state.timer.startTime)) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    document.getElementById('timer-time').textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
    document.getElementById('timer-desc').textContent = state.timer.desc;
  }
}

function openStartTimer() {
  document.getElementById('timer-descrizione').value = '';
  document.getElementById('timer-codice').value = '';
  document.getElementById('timer-tipo').value = 'task';
  document.getElementById('timer-fatturabile').checked = true;
  openModal('modal-start-timer');
}

function startTimer() {
  const desc = document.getElementById('timer-descrizione').value.trim();
  if (!desc) { toast('Inserisci descrizione'); return; }
  state.timer = { active: true, startTime: new Date().toISOString(), desc, codice: document.getElementById('timer-codice').value, tipo: document.getElementById('timer-tipo').value, fatturabile: document.getElementById('timer-fatturabile').checked };
  saveTimer();
  closeModal('modal-start-timer');
  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('btn-stop').style.display = 'inline-block';
  toast('Timer avviato!');
}

function stopTimer() {
  if (!state.timer.active) return;
  const secs = Math.floor((new Date() - new Date(state.timer.startTime)) / 1000);
  const mins = Math.max(1, Math.round(secs / 60));
  document.getElementById('stop-timer-desc').textContent = state.timer.desc;
  document.getElementById('stop-timer-time').textContent = mins + ' minuti';
  document.getElementById('stop-timer-note').value = '';
  openModal('modal-stop-timer');
}

function saveTimerLog() {
  const secs = Math.floor((new Date() - new Date(state.timer.startTime)) / 1000);
  const mins = Math.max(1, Math.round(secs / 60));
  const item = { id: genId(), data: getToday(), descrizione: state.timer.desc, codice: state.timer.codice, tipo: state.timer.tipo, minuti: mins, fatturabile: state.timer.fatturabile, note: document.getElementById('stop-timer-note').value, timestamp: new Date().toISOString() };
  state.time_log.push(item);
  // Registra nel diario
  addToDiario('tempo', '⏱️ ' + state.timer.desc, item.note, mins, item.codice);
  resetTimer();
  closeModal('modal-stop-timer');
  saveData(); syncItem('time_log', item); render(); updateStats(); toast('Tempo salvato!');
}

function discardTimer() {
  if (!confirm('Scartare tempo?')) return;
  resetTimer();
  closeModal('modal-stop-timer');
  toast('Timer scartato');
}

function resetTimer() {
  state.timer = { active: false, startTime: null, desc: '', codice: '', tipo: 'task', fatturabile: true };
  saveTimer();
  document.getElementById('btn-start').style.display = 'inline-block';
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('timer-time').textContent = '00:00:00';
  document.getElementById('timer-desc').textContent = '';
}

// CRUD SPESA
function openNewSpesa() {
  state.editingId = null;
  document.getElementById('spesa-data').value = getToday();
  document.getElementById('spesa-importo').value = '';
  document.getElementById('spesa-categoria').value = 'spese_ufficio';
  document.getElementById('spesa-descrizione').value = '';
  document.getElementById('btn-del-spesa').style.display = 'none';
  openModal('modal-spesa');
}

function openSpesa(id) {
  const s = state.spese.find(x => x.id === id);
  if (!s) return;
  state.editingId = id;
  document.getElementById('spesa-data').value = formatDateISO(parseDate(s.data));
  document.getElementById('spesa-importo').value = s.importo || '';
  document.getElementById('spesa-categoria').value = s.categoria || 'altro';
  document.getElementById('spesa-descrizione').value = s.descrizione || '';
  document.getElementById('btn-del-spesa').style.display = 'inline-block';
  openModal('modal-spesa');
}

function saveSpesa() {
  const data = document.getElementById('spesa-data').value;
  const importo = document.getElementById('spesa-importo').value;
  if (!data || !importo) { toast('Inserisci data e importo'); return; }
  const item = { id: state.editingId || genId(), data, importo: parseFloat(importo), categoria: document.getElementById('spesa-categoria').value, descrizione: document.getElementById('spesa-descrizione').value, timestamp: new Date().toISOString() };
  if (state.editingId) { const i = state.spese.findIndex(x => x.id === state.editingId); if (i >= 0) state.spese[i] = item; }
  else state.spese.push(item);
  closeModal('modal-spesa'); saveData(); syncItem('spese', item); render(); toast('Salvato!');
}

function deleteSpesa() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.spese = state.spese.filter(x => x.id !== id);
  closeModal('modal-spesa'); saveData(); syncDelete('spese', id); render(); toast('Eliminato');
}

// CRUD INCASSO
function openNewIncasso() {
  state.editingId = null;
  document.getElementById('incasso-data').value = getToday();
  document.getElementById('incasso-importo').value = '';
  document.getElementById('incasso-tipo').value = 'fattura';
  document.getElementById('incasso-descrizione').value = '';
  document.getElementById('btn-del-incasso').style.display = 'none';
  openModal('modal-incasso');
}

function openIncasso(id) {
  const s = state.incassi.find(x => x.id === id);
  if (!s) return;
  state.editingId = id;
  document.getElementById('incasso-data').value = formatDateISO(parseDate(s.data));
  document.getElementById('incasso-importo').value = s.importo || '';
  document.getElementById('incasso-tipo').value = s.tipo || 'fattura';
  document.getElementById('incasso-descrizione').value = s.descrizione || '';
  document.getElementById('btn-del-incasso').style.display = 'inline-block';
  openModal('modal-incasso');
}

function saveIncasso() {
  const data = document.getElementById('incasso-data').value;
  const importo = document.getElementById('incasso-importo').value;
  if (!data || !importo) { toast('Inserisci data e importo'); return; }
  const item = { id: state.editingId || genId(), data, importo: parseFloat(importo), tipo: document.getElementById('incasso-tipo').value, descrizione: document.getElementById('incasso-descrizione').value, timestamp: new Date().toISOString() };
  if (state.editingId) { const i = state.incassi.findIndex(x => x.id === state.editingId); if (i >= 0) state.incassi[i] = item; }
  else state.incassi.push(item);
  closeModal('modal-incasso'); saveData(); syncItem('incassi', item); render(); toast('Salvato!');
}

function deleteIncasso() {
  if (!state.editingId || !confirm('Eliminare?')) return;
  const id = state.editingId;
  state.incassi = state.incassi.filter(x => x.id !== id);
  closeModal('modal-incasso'); saveData(); syncDelete('incassi', id); render(); toast('Eliminato');
}

// UTILITIES
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2,9); }
function calcEndTime(startTime, durationMin) {
  if (!startTime || !durationMin) return '';
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + parseInt(durationMin);
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${endH.toString().padStart(2,'0')}:${endM.toString().padStart(2,'0')}`;
}
function formatTimeRange(startTime, durationMin) {
  if (!startTime) return '';
  const endTime = calcEndTime(startTime, durationMin);
  return endTime ? `${startTime} - ${endTime}` : startTime;
}
function getToday() { return new Date().toISOString().split('T')[0]; }
function pad(n) { return n.toString().padStart(2, '0'); }
function parseDate(val) { if (!val) return null; return new Date(val); }
function formatDate(val) { const d = parseDate(val); if (!d || isNaN(d)) return ''; return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }); }
function formatDateISO(d) { if (!d || isNaN(d)) return ''; return d.toISOString().split('T')[0]; }
function esc(str) { if (!str) return ''; return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
function showSyncPopup() { document.getElementById('sync-popup').classList.add('show'); }
function hideSyncPopup() { document.getElementById('sync-popup').classList.remove('show'); }

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(e => {}); }
