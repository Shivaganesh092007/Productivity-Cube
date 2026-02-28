// ============================================================
//  PRODUCTIVITY CUBE — script.js
//  Connects to ESP32 via Web Bluetooth (BLE UART / Nordic UART)
//
//  BROWSER: Chrome or Edge on Desktop/Android ONLY.
//           Web Bluetooth is NOT supported on Firefox or Safari.
//
//  Arduino sends every ~3s:  "Side X | Time: Ys\n"
//  We parse that, run smooth per-face timers, and persist to JSON.
// ============================================================

// ── BLE Nordic UART UUIDs (must match Arduino exactly) ───────────
const UART_SERVICE_UUID = '6e400001-b5ba-f393-e0a9-e50e24dcca9e';
const UART_TX_CHAR_UUID = '6e400003-b5ba-f393-e0a9-e50e24dcca9e'; // ESP32 → Web (notify)
const UART_RX_CHAR_UUID = '6e400002-b5ba-f393-e0a9-e50e24dcca9e'; // Web → ESP32 (write)

// ── DOM refs ──────────────────────────────────────────────────────
const connectbtn        = document.getElementById('connectbtn');
const opensettingsbtn   = document.getElementById('opensettings');
const closesettingsbtn  = document.getElementById('closesettings');
const sidebar           = document.getElementById('sidebar');
const overlay           = document.getElementById('overlay');
const savetasksbtn      = document.getElementById('savetasksbtn');
const taskinputs        = document.querySelectorAll('.taskinput');
const activetaskdisplay = document.getElementById('activetaskdisplay');
const faceselector      = document.getElementById('faceselector');
const cubeside          = document.getElementById('cubeside');
const statusdot         = document.getElementById('statusdot');
const statustext        = document.getElementById('statustext');
const timerdisplay      = document.querySelector('.timerdisplay');

// ── Color themes ─────────────────────────────────────────────────
const faceThemes = [
  { bg:'#e8f5e9', text:'#2e7d32', border:'#a5d6a7', dot:'#81c784', hover:'#1b5e20', disabled:'#c8e6c9' },
  { bg:'#e3f2fd', text:'#1565c0', border:'#90caf9', dot:'#64b5f6', hover:'#0d47a1', disabled:'#bbdefb' },
  { bg:'#f3e5f5', text:'#6a1b9a', border:'#ce93d8', dot:'#ba68c8', hover:'#4a148c', disabled:'#e1bee7' },
  { bg:'#fff3e0', text:'#e65100', border:'#ffcc80', dot:'#ffb74d', hover:'#bf360c', disabled:'#ffe0b2' },
  { bg:'#ffebee', text:'#c62828', border:'#ef9a9a', dot:'#e57373', hover:'#b71c1c', disabled:'#ffcdd2' },
  { bg:'#e0f2f1', text:'#00695c', border:'#80cbc4', dot:'#4db6ac', hover:'#004d40', disabled:'#b2dfdb' },
];

// ── App state ─────────────────────────────────────────────────────
let btDevice         = null;
let rxCharacteristic = null;
let receiveBuffer    = '';

let activeFace      = 1;   // 1-indexed face currently on display
let lastArduinoFace = -1;  // last face the cube reported

// Per-face accumulated seconds (index 0 = Face 1)
let faceSeconds = [0, 0, 0, 0, 0, 0];

// Live JS timer (runs every second for smooth display)
let liveInterval = null;
let liveSeconds  = 0;

// JSON file handle (File System Access API)
let fileHandle = null;

// ── Helpers ───────────────────────────────────────────────────────
function formatTime(s) {
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function applyTheme(faceIndex) {  // 0-based
  const t = faceThemes[faceIndex];
  const r = document.documentElement;
  r.style.setProperty('--bg-color',    t.bg);
  r.style.setProperty('--text-color',  t.text);
  r.style.setProperty('--border-color',t.border);
  r.style.setProperty('--dot-color',   t.dot);
  r.style.setProperty('--hover-color', t.hover);
  r.style.setProperty('--disabled-bg', t.disabled);
}

function updateFaceDisplay(faceNum) {  // 1-based
  cubeside.textContent          = `FACE ${faceNum}`;
  activetaskdisplay.textContent = taskinputs[faceNum - 1]?.value || `Face ${faceNum}`;
  faceselector.value            = faceNum;
  applyTheme(faceNum - 1);
}

// ── Live timer ────────────────────────────────────────────────────
function startLiveTimer(faceNum) {
  stopLiveTimer();
  liveSeconds = faceSeconds[faceNum - 1];
  timerdisplay.textContent = formatTime(liveSeconds);

  liveInterval = setInterval(() => {
    liveSeconds++;
    faceSeconds[faceNum - 1] = liveSeconds;
    timerdisplay.textContent  = formatTime(liveSeconds);
    refreshStatRow(faceNum);
  }, 1000);
}

function stopLiveTimer() {
  if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
}

// ── Stats card ────────────────────────────────────────────────────
function buildStatsCard() {
  const statsCard = document.querySelector('.cards:last-child');
  if (!statsCard) return;

  const taskNames = Array.from(taskinputs).map(i => i.value);
  let html = '<h3>Stats</h3><div class="stats-list">';
  for (let i = 0; i < 6; i++) {
    html += `
      <div class="stat-row">
        <span class="stat-label">${taskNames[i] || 'Face ' + (i + 1)}</span>
        <span class="stat-time" id="stat-time-${i + 1}">${formatTime(faceSeconds[i])}</span>
      </div>`;
  }
  html += `</div>
    <button id="savejsonbtn" style="margin-top:16px;width:100%">💾 Save Data</button>
    <button id="loadjsonbtn" style="margin-top:8px;width:100%" class="closebtn">📂 Load Session</button>`;
  statsCard.innerHTML = html;

  document.getElementById('savejsonbtn')?.addEventListener('click', saveDataToJSON);
  document.getElementById('loadjsonbtn')?.addEventListener('click', promptLoadJSON);
}

function refreshStatRow(faceNum) {
  const el = document.getElementById(`stat-time-${faceNum}`);
  if (el) el.textContent = formatTime(faceSeconds[faceNum - 1]);
}

// ── JSON persistence ──────────────────────────────────────────────
async function saveDataToJSON() {
  const taskNames = Array.from(taskinputs).map(i => i.value);
  const payload = {
    lastSaved: new Date().toISOString(),
    taskNames,
    faceSeconds,
    stats: faceSeconds.map((s, i) => ({
      face        : i + 1,
      task        : taskNames[i],
      totalSeconds: s,
      formatted   : formatTime(s),
    })),
  };

  try {
    if (!fileHandle) {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'cube_data.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
    }
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    showToast('Data saved ✓');
  } catch (e) {
    if (e.name === 'AbortError') return;
    // Fallback: trigger a download if File System API fails
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: 'cube_data.json'
    });
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Downloaded cube_data.json');
  }
}

async function promptLoadJSON() {
  try {
    [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const file   = await fileHandle.getFile();
    const parsed = JSON.parse(await file.text());

    if (Array.isArray(parsed.faceSeconds))
      faceSeconds = parsed.faceSeconds.map(v => Number(v) || 0);
    if (Array.isArray(parsed.taskNames))
      parsed.taskNames.forEach((n, i) => { if (taskinputs[i] && n) taskinputs[i].value = n; });

    buildStatsCard();
    updateFaceDisplay(activeFace);
    liveSeconds = faceSeconds[activeFace - 1];
    timerdisplay.textContent = formatTime(liveSeconds);
    showToast('Session loaded ✓');
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Could not load file.');
  }
}

// ── Arduino data parser ───────────────────────────────────────────
// Format from Arduino: "Side X | Time: Ys\n"
function parseArduinoLine(line) {
  line = line.trim();
  if (!line) return;

  const match = line.match(/^Side\s+(\d+)\s*\|\s*Time:\s*(\d+)s/i);
  if (match) {
    const face    = parseInt(match[1]);  // 1-indexed
    const seconds = parseInt(match[2]); // cumulative from Arduino flash

    if (face < 1 || face > 6) return;

    // Sync non-active faces from Arduino's authoritative flash total
    if (face !== activeFace) {
      faceSeconds[face - 1] = seconds;
      refreshStatRow(face);
    }

    if (face !== lastArduinoFace) {
      // ── Face changed ─────────────────────────────────────────────
      console.log(`[CUBE] Face → ${face}`);
      lastArduinoFace         = face;
      activeFace              = face;
      faceSeconds[face - 1]   = seconds;  // seed from flash total

      updateFaceDisplay(face);
      buildStatsCard();
      startLiveTimer(face);
      saveDataToJSON();  // auto-save on each flip
    }
    return;
  }

  if (line.includes('RESET')) {
    faceSeconds = [0, 0, 0, 0, 0, 0];
    liveSeconds  = 0;
    timerdisplay.textContent = '00:00';
    buildStatsCard();
    showToast('Cube reset ✓');
    return;
  }

  console.log('[CUBE]', line);
}

// ── BLE receive handler ───────────────────────────────────────────
function onBLEData(event) {
  const chunk = new TextDecoder().decode(event.target.value);
  receiveBuffer += chunk;

  let nl;
  while ((nl = receiveBuffer.indexOf('\n')) !== -1) {
    const line    = receiveBuffer.slice(0, nl);
    receiveBuffer = receiveBuffer.slice(nl + 1);
    parseArduinoLine(line);
  }
}

// ── Send command to cube ──────────────────────────────────────────
async function sendCommand(cmd) {
  if (!rxCharacteristic) { showToast('Cube not connected'); return; }
  try {
    await rxCharacteristic.writeValue(new TextEncoder().encode(cmd + '\n'));
    console.log('[CUBE] Sent:', cmd);
  } catch (e) {
    showToast('Send failed: ' + e.message);
  }
}

// ── Bluetooth connect ─────────────────────────────────────────────
async function connectBluetooth() {
  if (!navigator.bluetooth) {
    showToast('Web Bluetooth not supported. Use Chrome or Edge on desktop/Android.');
    return;
  }

  try {
    setConnectionUI('connecting');

    // Request device — the browser will show a picker.
    // We filter by service UUID so the ESP32 appears when advertising.
    btDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UART_SERVICE_UUID] }],
      optionalServices: [UART_SERVICE_UUID],
    });

    btDevice.addEventListener('gattserverdisconnected', onDisconnected);

    const server  = await btDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);

    // Subscribe to TX notifications (ESP32 → Web)
    const txChar = await service.getCharacteristic(UART_TX_CHAR_UUID);
    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', onBLEData);

    // Grab RX characteristic for writing (Web → ESP32)
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHAR_UUID);

    setConnectionUI('connected');
    showToast('Connected to Cube_Project ✓');
    console.log('[CUBE] BLE connected');

  } catch (e) {
    setConnectionUI('disconnected');
    if (e.name === 'NotFoundError') {
      showToast('No device selected.');
    } else {
      showToast('Connection failed: ' + e.message);
      console.error('[CUBE] BT error:', e);
    }
  }
}

function onDisconnected() {
  setConnectionUI('disconnected');
  stopLiveTimer();
  rxCharacteristic = null;
  showToast('Cube disconnected — retrying in 3s…');

  setTimeout(async () => {
    if (!btDevice) return;
    try {
      await btDevice.gatt.connect();
      setConnectionUI('connected');
      showToast('Reconnected ✓');
    } catch (e) {
      console.warn('[CUBE] Auto-reconnect failed:', e.message);
    }
  }, 3000);
}

function setConnectionUI(state) {
  connectbtn.disabled = false;
  if (state === 'connected') {
    statusdot.classList.add('connected');
    statustext.textContent   = 'Cube connected';
    connectbtn.textContent   = 'Disconnect';
    connectbtn.dataset.state = 'connected';
  } else if (state === 'connecting') {
    statusdot.classList.remove('connected');
    statustext.textContent  = 'Connecting…';
    connectbtn.textContent  = 'Connecting…';
    connectbtn.disabled     = true;
  } else {
    statusdot.classList.remove('connected');
    statustext.textContent   = 'Cube disconnected';
    connectbtn.textContent   = 'Connect Cube';
    connectbtn.dataset.state = 'disconnected';
  }
}

// ── Connect button ────────────────────────────────────────────────
connectbtn.addEventListener('click', async () => {
  if (connectbtn.dataset.state === 'connected') {
    stopLiveTimer();
    if (btDevice?.gatt.connected) btDevice.gatt.disconnect();
    btDevice         = null;
    rxCharacteristic = null;
    setConnectionUI('disconnected');
  } else {
    await connectBluetooth();
  }
});

// ── Settings sidebar ──────────────────────────────────────────────
opensettingsbtn.addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('show');
  validateInputs();
});

const closeSidebar = () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
};

closesettingsbtn.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

function validateInputs() {
  savetasksbtn.disabled = Array.from(taskinputs).some(i => i.value.trim() === '');
}
taskinputs.forEach(i => i.addEventListener('input', validateInputs));

savetasksbtn.addEventListener('click', () => {
  updateFaceDisplay(activeFace);
  buildStatsCard();
  saveDataToJSON();
  showToast('Tasks saved ✓');
  closeSidebar();
});

// ── Face selector (manual override / testing without cube) ────────
faceselector.addEventListener('input', () => {
  let v = Math.min(6, Math.max(1, parseInt(faceselector.value) || 1));
  faceselector.value = v;
  activeFace         = v;
  updateFaceDisplay(v);
  startLiveTimer(v);
});

// ── Toast notification ────────────────────────────────────────────
function showToast(msg) {
  let el = document.getElementById('cube-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cube-toast';
    el.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:rgba(0,0,0,0.82); color:#fff; padding:10px 22px;
      border-radius:20px; font-size:14px; z-index:9999;
      transition:opacity 0.4s; pointer-events:none; white-space:nowrap;`;
    document.body.appendChild(el);
  }
  el.textContent   = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

// ── Stats card CSS ────────────────────────────────────────────────
(function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
    .stats-list { width:100%; margin-top:10px; }
    .stat-row {
      display:flex; justify-content:space-between; align-items:center;
      padding:7px 0; border-bottom:1px solid var(--border-color); font-size:13px;
    }
    .stat-row:last-child { border-bottom:none; }
    .stat-label { font-weight:bold; color:var(--text-color); }
    .stat-time  { font-family:monospace; font-size:14px; color:var(--text-color); }
  `;
  document.head.appendChild(s);
})();

// ── Init ──────────────────────────────────────────────────────────
(function init() {
  updateFaceDisplay(activeFace);
  buildStatsCard();
  timerdisplay.textContent = '00:00';
})();
