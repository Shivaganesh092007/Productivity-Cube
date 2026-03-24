// ================================================
// Productivity Cube - Design Thinking Project
// ================================================

// --- BLUETOOTH CONFIGURATION ---
const BLE_DEVICE_NAME = 'ProductivityCube'; 
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'; 
const BLE_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; 

const connect_btn = document.getElementById('connectbtn');
const open_settings_btn = document.getElementById('opensettings');
const close_settings_btn = document.getElementById('closesettings');
const side_bar = document.getElementById('sidebar');
const over_lay = document.getElementById('overlay');
const save_tasks_btn = document.getElementById('savetasksbtn');
const task_inputs = document.querySelectorAll('.taskinput');
const limit_inputs = document.querySelectorAll('.limitinput');
const active_task_display = document.getElementById('activetaskdisplay');
const face_selector = document.getElementById('faceselector');
const cube_side = document.getElementById('cubeside');
const status_dot = document.getElementById('statusdot');
const status_text = document.getElementById('statustext');
const timer_display = document.querySelector('.timerdisplay');

const view_stats_btn = document.getElementById('viewstatsbtn');
const back_btn = document.getElementById('backbtn');
const main_view = document.getElementById('mainview');
const stats_view = document.getElementById('statsview');
const donut_chart = document.getElementById('donutchart');
const total_time_display = document.getElementById('total-time-display');
const legend_container = document.getElementById('legend-container');

const face_themes = [
    { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7', dot: '#81c784', hover: '#1b5e20', disabled: '#c8e6c9' },
    { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9', dot: '#64b5f6', hover: '#0d47a1', disabled: '#bbdefb' },
    { bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8', dot: '#ba68c8', hover: '#4a148c', disabled: '#e1bee7' },
    { bg: '#fff3e0', text: '#e65100', border: '#ffcc80', dot: '#ffb74d', hover: '#bf360c', disabled: '#ffe0b2' },
    { bg: '#ffebee', text: '#c62828', border: '#ef9a9a', dot: '#e57373', hover: '#b71c1c', disabled: '#ffcdd2' },
    { bg: '#e0f2f1', text: '#00695c', border: '#80cbc4', dot: '#4db6ac', hover: '#004d40', disabled: '#b2dfdb' },
];

let bleDevice;
let bleServer;
let bleService;
let bleCharacteristic;
let receive_buffer = '';

let active_face = 1;
let last_face = -1;
let face_seconds = [0, 0, 0, 0, 0, 0];
let live_interval = null;
let live_seconds = 0;

function format_time(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function apply_theme(face_index) {
    const t = face_themes[face_index];
    const r = document.documentElement;
    r.style.setProperty('--bg-color', t.bg);
    r.style.setProperty('--text-color', t.text);
    r.style.setProperty('--border-color', t.border);
    r.style.setProperty('--dot-color', t.dot);
    r.style.setProperty('--hover-color', t.hover);
    r.style.setProperty('--disabled-bg', t.disabled);
}

function update_face_display(face_num) {
    cube_side.textContent = `FACE ${face_num}`;
    active_task_display.textContent = task_inputs[face_num - 1]?.value || `Face ${face_num}`;
    apply_theme(face_num - 1);
}

function start_live_timer(face_num) {
    stop_live_timer();
    live_seconds = face_seconds[face_num - 1];
    timer_display.textContent = format_time(live_seconds);

    live_interval = setInterval(() => {
        live_seconds++;
        face_seconds[face_num - 1] = live_seconds;
        timer_display.textContent = format_time(live_seconds);
    }, 1000);
}

function stop_live_timer() {
    if(live_interval) { clearInterval(live_interval); live_interval = null; }
}

function render_chart() {
    const total_seconds = face_seconds.reduce((a, b) => a + b, 0);
    const hrs = Math.floor(total_seconds / 3600);
    const mins = Math.floor((total_seconds % 3600) / 60);
    
    total_time_display.textContent = hrs > 0 ? `${hrs} hr, ${mins} mins` : `${mins} mins`;

    let gradient_string = "";
    let current_percentage = 0;
    legend_container.innerHTML = "";

    if (total_seconds === 0) {
         donut_chart.style.background = "#e0e0e0";
         legend_container.innerHTML = "<p style='grid-column: span 2; text-align: center; color: #666;'>No activity recorded yet.</p>";
         return;
    }

    face_seconds.forEach((sec, index) => {
        if (sec > 0) {
            const percentage = (sec / total_seconds) * 100;
            const start = current_percentage;
            const end = current_percentage + percentage;
            const color = face_themes[index].dot; 

            gradient_string += `${color} ${start}% ${end}%, `;
            current_percentage = end;

            const task_name = task_inputs[index].value || `Face ${index + 1}`;
            const task_hrs = Math.floor(sec / 3600);
            const task_mins = Math.floor((sec % 3600) / 60);
            const task_secs = sec % 60;
            
            let time_str = "";
            if(task_hrs > 0) time_str += `${task_hrs}h `;
            if(task_mins > 0 || task_hrs > 0) time_str += `${task_mins}m `;
            time_str += `${task_secs}s`;

            legend_container.innerHTML += `
                <div class="legend-item">
                    <div class="legend-color" style="background-color: ${color};"></div>
                    <div>
                        <div style="color: #333;">${task_name}</div>
                        <div style="font-size: 13px; color: #888; font-weight: normal;">${time_str}</div>
                    </div>
                </div>`;
        }
    });

    gradient_string = gradient_string.slice(0, -2);
    donut_chart.style.background = `conic-gradient(${gradient_string})`;
}

view_stats_btn.addEventListener('click', () => {
    main_view.style.display = 'none';
    stats_view.style.display = 'flex';
    render_chart();
});

back_btn.addEventListener('click', () => {
    stats_view.style.display = 'none';
    main_view.style.display = 'grid'; 
});

function parse_string(line) {
    if(!line) return;
    line = line.trim();
    if(line === "") return;
    
    const match = line.match(/^Side\s+(\d+)\s*\|\s*Time:\s*(\d+)s/i);
    if(match) {
        const face = parseInt(match[1]);
        let seconds = parseInt(match[2]); 
        if(seconds > Number.MAX_SAFE_INTEGER) seconds = Number.MAX_SAFE_INTEGER; 

        if(face !== last_face) {
            last_face = face;
            active_face = face;
            face_seconds[face - 1] = seconds;
            face_selector.value = face;
            update_face_display(face);
            start_live_timer(face);
        }
    }
}

// --- WEB BLUETOOTH CONNECTION LOGIC ---
async function connect_bluetooth() {
    try {
        set_connection_ui('connecting');
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: BLE_DEVICE_NAME }], 
            optionalServices: [BLE_SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        bleServer = await bleDevice.gatt.connect();
        bleService = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
        bleCharacteristic = await bleService.getCharacteristic(BLE_CHARACTERISTIC_UUID);

        await bleCharacteristic.startNotifications();
        bleCharacteristic.addEventListener('characteristicvaluechanged', handle_incoming_data);

        set_connection_ui('connected');
        show_toast('Bluetooth Connected wirelessly!');
    } catch(e) {
        console.error(e);
        set_connection_ui('disconnected');
        show_toast('Bluetooth Error: ' + e.message);
    }
}

function onDisconnected() {
    set_connection_ui('disconnected');
    show_toast('Cube disconnected.');
}

function handle_incoming_data(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(value);
    
    receive_buffer += text;
    let nl;
    while((nl = receive_buffer.indexOf('\n')) !== -1) {
        const line = receive_buffer.slice(0, nl);
        receive_buffer = receive_buffer.slice(nl + 1);
        parse_string(line);
    }
}

function set_connection_ui(state) {
    if(state === 'connected') {
        status_dot.classList.add('connected');
        status_text.textContent = 'Cube connected';
        connect_btn.textContent = 'Disconnect';
        connect_btn.dataset.state = 'connected';
        connect_btn.disabled = false;
    } else if(state === 'connecting') {
        status_text.textContent = 'Connecting...';
        connect_btn.disabled = true;
    } else {
        status_dot.classList.remove('connected');
        status_text.textContent = 'Cube disconnected';
        connect_btn.textContent = 'Connect Cube';
        connect_btn.dataset.state = 'disconnected';
        connect_btn.disabled = false;
    }
}

const validate_task_inputs = () => {
    let all_filled = true;
    task_inputs.forEach(input => { if(input.value.trim() === '') all_filled = false; });
    save_tasks_btn.disabled = !all_filled;
};

task_inputs.forEach(input => input.addEventListener('input', validate_task_inputs));

open_settings_btn.addEventListener('click', () => {
    side_bar.classList.add('open');
    over_lay.classList.add('show');
    validate_task_inputs();
});

const close_sidebar = () => {
    side_bar.classList.remove('open');
    over_lay.classList.remove('show');
};

close_settings_btn.addEventListener('click', close_sidebar);
over_lay.addEventListener('click', close_sidebar);

save_tasks_btn.addEventListener('click', async () => {
    update_face_display(active_face);
    
    // Send Limits to ESP32 over BLE
    if (bleDevice && bleDevice.gatt.connected && bleCharacteristic) {
        const encoder = new TextEncoder();
        for (let i = 0; i < 6; i++) {
            let mins = parseInt(limit_inputs[i].value) || 120;
            let secs = mins * 60;
            let command = `LIMIT,${i},${secs}\n`;
            try {
                await bleCharacteristic.writeValue(encoder.encode(command));
                await new Promise(resolve => setTimeout(resolve, 50)); 
            } catch (error) {
                console.error("Failed to send limit for Face " + (i+1), error);
            }
        }
    }
    show_toast('Tasks & Limits saved successfully!');
    close_sidebar();
});

connect_btn.addEventListener('click', async () => {
    if(!("bluetooth" in navigator)) {
        show_toast('Web Bluetooth API is not supported in this browser. Try Chrome or Edge.');
        return;
    }
    if(connect_btn.dataset.state === 'connected') {
        stop_live_timer();
        if (bleDevice && bleDevice.gatt.connected) bleDevice.gatt.disconnect();
        set_connection_ui('disconnected');
    } else {
        await connect_bluetooth();
    }
});

face_selector.addEventListener('input', (e) => {
    const val = face_selector.value;
    if(val === "") return;
    let num = parseInt(val);
    if(num > 6) { num = 6; face_selector.value = 6; } 
    else if(num < 1) { num = 1; face_selector.value = 1; }
    active_face = num;
    update_face_display(num);
});

function show_toast(msg) {
    let el = document.getElementById('cube-toast');
    if(!el) {
        el = document.createElement('div');
        el.id = 'cube-toast';
        el.style.cssText = `position:fixed; bottom:24px; left:50%; transform:translateX(-50%); 
        background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:20px; 
        font-size:14px; z-index:9999; transition:opacity 0.4s; pointer-events:none;`;
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

update_face_display(active_face);
timer_display.textContent = '00:00';
