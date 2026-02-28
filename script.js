// ============================================================
//  PRODUCTIVITY CUBE — script.js
//  Links the web dashboard to the ESP32 "Cube_Project" device
//  via Web Bluetooth (BLE Serial / SPP-over-BLE approach).
//
//  Arduino sends every ~3 s:  "Side X | Time: Ys\n"
//  We parse that, keep live per-face timers, and persist all
//  session data to cube_data.json via the File System Access
//  API so totals survive a page reload.
// ============================================================

// ── Nordic UART Service UUIDs (most BT-Serial modules use these) ──
const UART_SERVICE_UUID    = '6e400001-b5ba-f393-e0a9-e50e24dcca9e';
const UART_TX_CHAR_UUID    = '6e400003-b5ba-f393-e0a9-e50e24dcca9e'; // ESP32 → Web (notify)
const UART_RX_CHAR_UUID    = '6e400002-b5ba-f393-e0a9-e50e24dcca9e'; // Web → ESP32 (write)

// ── DOM refs ──────────────────────────────────────────────────────
const connectbtn       = document.getElementById('connectbtn');
const opensettingsbtn  = document.getElementById('opensettings');
const closesettingsbtn = document.getElementById('closesettings');
const sidebar          = document.getElementById('sidebar');
const overlay          = document.getElementById('overlay');
const savetasksbtn     = document.getElementById('savetasksbtn');
const taskinputs       = document.querySelectorAll('.taskinput');
const activetaskdisplay= document.getElementById('activetaskdisplay');
const faceselector     = document.getElementById('faceselector');
const cubeside         = document.getElementById('cubeside');
const statusdot        = document.getElementById('statusdot');
const statustext       = document.getElementById('statustext');
const timerdisplay     = document.querySelector('.timerdisplay');

// ── Color themes (mirrors app.js) ────────────────────────────────
const faceThemes = [
  { bg:'#e8f5e9', text:'#2e7d32', border:'#a5d6a7', dot:'#81c784', hover:'#1b5e20', disabled:'#c8e6c9' },
  { bg:'#e3f2fd', text:'#1565c0', border:'#90caf9', dot:'#64b5f6', hover:'#0d47a1', disabled:'#bbdefb' },
  { bg:'#f3e5f5', text:'#6a1b9a', border:'#ce93d8', dot:'#ba68c8', hover:'#4a148c', disabled:'#e1bee7' },
  { bg:'#fff3e0', text:'#e65100', border:'#ffcc80', dot:'#ffb74d', hover:'#bf360c', disabled:'#ffe0b2' },
  { bg:'#ffebee', text:'#c62828', border:'#ef9a9a', dot:'#e57373', hover:'#b71c1c', disabled:'#ffcdd2' },
  { bg:'#e0f2f1', text:'#00695c', border:'#80cbc4', dot:'4db6ac',  hover:'#004d40', disabled:'#b2dfdb' },
];

// ── App state ─────────────────────────────────────────────────────
let btDevice       = null;
let rxCharacteristic = null;       // Web → ESP32
let activeFace     = 1;            // 1-indexed, mirrors cube
let lastArduinoFace= -1;           // last face reported by cube
let receiveBuffer  = '';           // partial-line accumulator

// Per-face accumulated seconds (loaded from JSON on start)
// Index 0 = Face 1 … Index 5 = Face 6
let faceSeconds = [0, 0, 0, 0, 0, 0];

// Live-timer state (ticks independently from Arduino for smooth display)
let liveTimerInterval = null;
let liveSeconds       = 0;         // seconds on display for activeFace

// ── JSON persistence (File System Access API) ─────────────────────
let fileHandle = null;             // persisted file handle across saves

const DATA_FILENAME = 'cube_data.json';

async function loadDataFromJSON() {
  try {
    // Try to open an existing file the user previously chose
    if (!fileHandle) return;
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (parsed.faceSeconds && Array.isArray(parsed.faceSeconds)) {
      faceSeconds = parsed.faceSeconds.map(v => Number(v) || 0);
      // Load task names if saved
      if (parsed.taskNames && Array.isArray(parsed.taskNames)) {
        parsed.taskNames.forEach((name, i) => {
          if (taskinputs[i] && name) taskinputs[i].value = name;
        });
      }
      console.log('[CUBE] Data loaded from JSON:', faceSeconds);
    }
  } catch (e) {
    console.warn('[CUBE] Could not load JSON data:', e.message);
  }
}

async function saveDataToJSON() {
  const taskNames = Array.from(taskinputs).map(i => i.value);
  const payload = {
    lastSaved  : new Date().toISOString(),
    taskNames,
    faceSeconds,
    stats: faceSeconds.map((s, i) => ({
      face: i + 1,
      task: taskNames[i],
      totalSeconds: s,
      formatted: formatTime(s),
    })),
  };

  try {
    if (!fileHandle) {
      // First save — ask user where to save
      fileHandle = await window.showSaveFilePicker({
        suggestedName: DATA_FILENAME,
        types: [{ description: 'JSON Data', accept: { 'application/json': ['.json'] } }],
      });
    }
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    console.log('[CUBE] Data saved to JSON.');
  } catch (e) {
    // User cancelled picker or API unavailable — fall back to auto-download
    if (e.name !== 'AbortError') {
      downloadJSON(payload);
    }
  }
}

function downloadJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = DATA_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
}

// Allow user to load a previous JSON file manually ─────────────────
async function promptLoadJSON() {
  try {
    [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON Data', accept: { 'application/json': ['.json'] } }],
    });
    await loadDataFromJSON();
    // Refresh display with loaded totals
    updateFaceDisplay(activeFace);
    updateStatsCard();
    showToast('Previous session loaded ✓');
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function applyTheme(faceIndex) {           // faceIndex: 0-based
  const t = faceThemes[faceIndex];
  const r = document.documentElement;
  r.style.setProperty('--bg-color',    t.bg);
  r.style.setProperty('--text-color',  t.text);
  r.style.setProperty('--border-color',t.border);
  r.style.setProperty('--dot-color',   t.dot);
  r.style.setProperty('--hover-color', t.hover);
  r.style.setProperty('--disabled-bg', t.disabled);
}

function updateFaceDisplay(faceNum) {       // faceNum: 1-based
  cubeside.textContent        = `FACE ${faceNum}`;
  activetaskdisplay.textContent = taskinputs[faceNum - 1]?.value || `Face ${faceNum}`;
  faceselector.value          = faceNum;
  applyTheme(faceNum - 1);
}

function updateStatsCard() {
  const statsCard = document.querySelector('.cards:last-child');
  if (!statsCard) return;
  const taskNames = Array.from(taskinputs).map(i => i.value);

  let html = '<h3>Stats</h3><div class="stats-list">';
  for (let i = 0; i < 6; i++) {
    html += `
      <div class="stat-row">
        <span class="stat-label">${taskNames[i] || 'Face ' + (i+1)}</span>
        <span class="stat-time" id="stat-time-${i+1}">${formatTime(faceSeconds[i])}</span>
      </div>`;
  }
  html += '</div>';
  html += '<button id="savejsonbtn" style="margin-top:16px;width:100%">Save Data</button>';
  html += '<button id="loadjsonbtn" style="margin-top:8px;width:100%" class="closebtn">Load Previous</button>';
  statsCard.innerHTML = html;

  document.getElementById('savejsonbtn')?.addEventListener('click', saveDataToJSON);
  document.getElementById('loadjsonbtn')?.addEventListener('click', promptLoadJSON);
}

function refreshStatTime(faceNum) {
  const el = document.getElementById(`stat-time-${faceNum}`);
  if (el) el.textContent = formatTime(faceSeconds[faceNum - 1]);
}

// ── Live display timer ────────────────────────────────────────────
function startLiveTimer(faceNum) {
  stopLiveTimer();
  liveSeconds = faceSeconds[faceNum - 1];   // resume from stored total
  timerdisplay.textContent = formatTime(liveSeconds);

  liveTimerInterval = setInterval(() => {
    liveSeconds++;
    faceSeconds[faceNum - 1] = liveSeconds;
    timerdisplay.textContent = formatTime(liveSeconds);
    refreshStatTime(faceNum);
  }, 1000);
}

function stopLiveTimer() {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
    liveTimerInterval = null;
  }
}

// ── Arduino data parser ───────────────────────────────────────────
// Format from Arduino: "Side X | Time: Ys"  (X = 1..6, Y = seconds)
function parseArduinoLine(line) {
  line = line.trim();
  if (!line) return;

  // --- Side data ---
  const match = line.match(/^Side\s+(\d+)\s*\|\s*Time:\s*(\d+)s/i);
  if (match) {
    const face    = parseInt(match[1]);   // 1-indexed
    const seconds = parseInt(match[2]);   // cumulative seconds from Arduino flash

    if (face < 1 || face > 6) return;

    // Sync Arduino's stored total into our array
    // We trust Arduino's persistent value as ground truth for that face,
    // but only update the non-active face to avoid overwriting our live count.
    if (face !== activeFace) {
      faceSeconds[face - 1] = seconds;
      refreshStatTime(face);
    }

    // Face change detected
    if (face !== lastArduinoFace) {
      console.log(`[CUBE] Face changed → ${face}`);
      lastArduinoFace = face;
      activeFace      = face;

      // Sync active face total from Arduino before starting live timer
      faceSeconds[face - 1] = seconds;

      updateFaceDisplay(face);
      startLiveTimer(face);
      updateStatsCard();
      saveDataToJSON();           // auto-save on face change
    }
    return;
  }

  // --- System messages ---
  if (line.includes('RESET')) {
    faceSeconds = [0, 0, 0, 0, 0, 0];
    liveSeconds = 0;
    timerdisplay.textContent = '00:00';
    updateStatsCard();
    showToast('Cube reset confirmed');
    return;
  }

  console.log('[CUBE]', line);
}

// ── Bluetooth ─────────────────────────────────────────────────────
function onBTData(event) {
  const chunk = new TextDecoder().decode(event.target.value);
  receiveBuffer += chunk;

  // Process complete lines
  let newline;
  while ((newline = receiveBuffer.indexOf('\n')) !== -1) {
    const line = receiveBuffer.slice(0, newline);
    receiveBuffer = receiveBuffer.slice(newline + 1);
    parseArduinoLine(line);
  }
}

async function sendBTCommand(cmd) {
  if (!rxCharacteristic) {
    showToast('Not connected to cube');
    return;
  }
  try {
    const encoded = new TextEncoder().encode(cmd + '\n');
    await rxCharacteristic.writeValue(encoded);
    console.log('[CUBE] Sent:', cmd);
  } catch (e) {
    console.error('[CUBE] Send error:', e);
  }
}

async function connectBluetooth() {
  if (!navigator.bluetooth) {
    showToast('Web Bluetooth not supported in this browser. Use Chrome/Edge on desktop.');
    return;
  }

  try {
    setConnectionUI('connecting');

    btDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'Cube_Project' }],
      optionalServices: [UART_SERVICE_UUID],
    });

    btDevice.addEventListener('gattserverdisconnected', onDisconnected);

    const server  = await btDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);

    // TX char: ESP32 → Web (we subscribe to notifications)
    const txChar  = await service.getCharacteristic(UART_TX_CHAR_UUID);
    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', onBTData);

    // RX char: Web → ESP32
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHAR_UUID);

    setConnectionUI('connected');
    showToast('Connected to Cube_Project ✓');
    console.log('[CUBE] Bluetooth connected');

  } catch (e) {
    setConnectionUI('disconnected');
    if (e.name !== 'NotFoundError') {
      showToast('Connection failed: ' + e.message);
      console.error('[CUBE] BT error:', e);
    }
  }
}

function onDisconnected() {
  setConnectionUI('disconnected');
  stopLiveTimer();
  rxCharacteristic = null;
  showToast('Cube disconnected');
  console.log('[CUBE] Bluetooth disconnected');

  // Auto-reconnect
  if (btDevice && btDevice.gatt) {
    setTimeout(() => {
      btDevice.gatt.connect().then(server => {
        console.log('[CUBE] Auto-reconnected');
        setConnectionUI('connected');
      }).catch(err => console.warn('[CUBE] Auto-reconnect failed:', err));
    }, 3000);
  }
}

function setConnectionUI(state) {
  if (state === 'connected') {
    statusdot.classList.add('connected');
    statustext.textContent = 'Cube connected';
    connectbtn.textContent  = 'Disconnect';
    connectbtn.dataset.state = 'connected';
  } else if (state === 'connecting') {
    statusdot.classList.remove('connected');
    statustext.textContent  = 'Connecting…';
    connectbtn.textContent  = 'Connecting…';
    connectbtn.disabled     = true;
  } else {
    statusdot.classList.remove('connected');
    statustext.textContent  = 'Cube disconnected';
    connectbtn.textContent  = 'Connect Cube';
    connectbtn.disabled     = false;
    connectbtn.dataset.state = 'disconnected';
  }
}

// ── Toast notification ────────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById('cube-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cube-toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
      border-radius: 20px; font-size: 14px; z-index: 9999;
      transition: opacity 0.4s ease; pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

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

const validateInputs = () => {
  let allFilled = true;
  taskinputs.forEach(input => {
    if (input.value.trim() === '') allFilled = false;
  });
  savetasksbtn.disabled = !allFilled;
};

taskinputs.forEach(input => input.addEventListener('input', validateInputs));

savetasksbtn.addEventListener('click', () => {
  updateFaceDisplay(activeFace);
  updateStatsCard();
  saveDataToJSON();
  showToast('Tasks saved ✓');
  closeSidebar();
});

// ── Face selector (manual override) ──────────────────────────────
faceselector.addEventListener('input', () => {
  let v = parseInt(faceselector.value);
  if (v < 1) v = 1;
  if (v > 6) v = 6;
  faceselector.value = v;
  activeFace = v;
  updateFaceDisplay(v);
  startLiveTimer(v);
});

// ── Connect button ────────────────────────────────────────────────
connectbtn.addEventListener('click', async () => {
  if (connectbtn.dataset.state === 'connected') {
    // Disconnect
    stopLiveTimer();
    if (btDevice && btDevice.gatt.connected) {
      btDevice.gatt.disconnect();
    }
    setConnectionUI('disconnected');
  } else {
    await connectBluetooth();
  }
});

// ── Stats card CSS injection ──────────────────────────────────────
(function injectStatsStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .stats-list { width: 100%; margin-top: 12px; }
    .stat-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px solid var(--border-color);
      font-size: 14px;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { font-weight: bold; color: var(--text-color); text-align:left; }
    .stat-time  { font-family: monospace; font-size: 15px; color: var(--text-color); }
  `;
  document.head.appendChild(style);
})();

// ── Init ──────────────────────────────────────────────────────────
(function init() {
  updateFaceDisplay(activeFace);
  updateStatsCard();
  timerdisplay.textContent = '00:00';

  // Show a "Load previous session?" prompt if File System API is available
  if (window.showOpenFilePicker) {
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load Session';
    loadBtn.style.cssText = 'font-size:12px; padding:6px 12px;';
    loadBtn.addEventListener('click', promptLoadJSON);
    document.querySelector('.header-actions')?.appendChild(loadBtn);
  }
})();
