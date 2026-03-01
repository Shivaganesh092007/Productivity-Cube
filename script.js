// ============================================================
//  PRODUCTIVITY CUBE — app.js (Serial Version)
// ============================================================

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

const faceThemes = [
  { bg:'#e8f5e9', text:'#2e7d32', border:'#a5d6a7', dot:'#81c784', hover:'#1b5e20', disabled:'#c8e6c9' },
  { bg:'#e3f2fd', text:'#1565c0', border:'#90caf9', dot:'#64b5f6', hover:'#0d47a1', disabled:'#bbdefb' },
  { bg:'#f3e5f5', text:'#6a1b9a', border:'#ce93d8', dot:'#ba68c8', hover:'#4a148c', disabled:'#e1bee7' },
  { bg:'#fff3e0', text:'#e65100', border:'#ffcc80', dot:'#ffb74d', hover:'#bf360c', disabled:'#ffe0b2' },
  { bg:'#ffebee', text:'#c62828', border:'#ef9a9a', dot:'#e57373', hover:'#b71c1c', disabled:'#ffcdd2' },
  { bg:'#e0f2f1', text:'#00695c', border:'#80cbc4', dot:'#4db6ac', hover:'#004d40', disabled:'#b2dfdb' },
];

let port = null;
let reader = null;
let receiveBuffer = '';
let activeFace = 1;
let lastArduinoFace = -1;
let faceSeconds = [0, 0, 0, 0, 0, 0];
let liveInterval = null;
let liveSeconds = 0;

function formatTime(s) {
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function applyTheme(faceIndex) {
  const t = faceThemes[faceIndex];
  const r = document.documentElement;
  r.style.setProperty('--bg-color',    t.bg);
  r.style.setProperty('--text-color',  t.text);
  r.style.setProperty('--border-color',t.border);
  r.style.setProperty('--dot-color',   t.dot);
  r.style.setProperty('--hover-color', t.hover);
  r.style.setProperty('--disabled-bg', t.disabled);
}

function updateFaceDisplay(faceNum) {
  cubeside.textContent = `FACE ${faceNum}`;
  activetaskdisplay.textContent = taskinputs[faceNum - 1]?.value || `Face ${faceNum}`;
  applyTheme(faceNum - 1);
}

function startLiveTimer(faceNum) {
  stopLiveTimer();
  liveSeconds = faceSeconds[faceNum - 1];
  timerdisplay.textContent = formatTime(liveSeconds);

  liveInterval = setInterval(() => {
    liveSeconds++;
    faceSeconds[faceNum - 1] = liveSeconds;
    timerdisplay.textContent = formatTime(liveSeconds);
  }, 1000);
}

function stopLiveTimer() {
  if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
}

function buildStatsCard() {
  const statsCard = document.querySelector('.cards:last-child');
  if (!statsCard) return;
  statsCard.innerHTML = '<h3>Stats</h3><div id="stats-container"></div>';
}

function parseArduinoLine(line) {
  line = line.trim();
  const match = line.match(/^Side\s+(\d+)\s*\|\s*Time:\s*(\d+)s/i);
  if (match) {
    const face = parseInt(match[1]);
    const seconds = parseInt(match[2]);

    if (face !== lastArduinoFace) {
      lastArduinoFace = face;
      activeFace = face;
      faceSeconds[face - 1] = seconds;
      faceselector.value = face;
      updateFaceDisplay(face);
      startLiveTimer(face); 
    }
  }
}

async function connectSerial() {
  try {
    setConnectionUI('connecting');
    // REMOVED FILTER: Browser will now show all available COM ports
    port = await navigator.serial.requestPort(); 
    await port.open({ baudRate: 115200 });

    setConnectionUI('connected');
    showToast('Connected ✓');

    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        receiveBuffer += value;
        let nl;
        while ((nl = receiveBuffer.indexOf('\n')) !== -1) {
          const line = receiveBuffer.slice(0, nl);
          receiveBuffer = receiveBuffer.slice(nl + 1);
          parseArduinoLine(line);
        }
      }
    }
  } catch (e) {
    setConnectionUI('disconnected');
    showToast('Error: ' + e.message);
  }
}

function setConnectionUI(state) {
  if (state === 'connected') {
    statusdot.classList.add('connected');
    statustext.textContent = 'Cube connected';
    connectbtn.textContent = 'Disconnect';
    connectbtn.dataset.state = 'connected';
    connectbtn.disabled = false;
  } else if (state === 'connecting') {
    statustext.textContent = 'Connecting...';
    connectbtn.disabled = true;
  } else {
    statusdot.classList.remove('connected');
    statustext.textContent = 'Cube disconnected';
    connectbtn.textContent = 'Connect Cube';
    connectbtn.dataset.state = 'disconnected';
    connectbtn.disabled = false;
  }
}

connectbtn.addEventListener('click', async () => {
  if (connectbtn.dataset.state === 'connected') {
    stopLiveTimer();
    if (reader) await reader.cancel();
    if (port) await port.close();
    setConnectionUI('disconnected');
  } else {
    await connectSerial();
  }
});

// Settings validation: Disable save if any task name is empty
function validateTaskInputs() {
  let isAnyEmpty = false;
  taskinputs.forEach(input => {
    if (input.value.trim() === "") {
      isAnyEmpty = true;
    }
  });
  savetasksbtn.disabled = isAnyEmpty;
}

// Attach validation to input events
taskinputs.forEach(input => {
  input.addEventListener('input', validateTaskInputs);
});

opensettingsbtn.addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('show');
  validateTaskInputs(); // Check on open
});

const closeSidebar = () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
};

closesettingsbtn.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

savetasksbtn.addEventListener('click', () => {
  updateFaceDisplay(activeFace);
  showToast('Tasks saved ✓');
  closeSidebar();
});

faceselector.addEventListener('input', (e) => {
  const val = faceselector.value;
  if (val === "") return; 
  
  let num = parseInt(val);
  if (num > 6) {
    num = 6;
    faceselector.value = 6;
  } else if (num < 1) {
    num = 1;
    faceselector.value = 1;
  }
  
  activeFace = num;
  updateFaceDisplay(num);
});

function showToast(msg) {
  let el = document.getElementById('cube-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cube-toast';
    el.style.cssText = `position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:20px; font-size:14px; z-index:9999; transition:opacity 0.4s; pointer-events:none;`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// Initialization
updateFaceDisplay(activeFace);
buildStatsCard();
timerdisplay.textContent = '00:00';
