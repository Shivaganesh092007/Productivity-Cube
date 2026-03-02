// ================================================
// Productivity Cube - Design Thinking Project
// ================================================

const connect_btn = document.getElementById('connectbtn');
const open_settings_btn = document.getElementById('opensettings');
const close_settings_btn = document.getElementById('closesettings');
const side_bar = document.getElementById('sidebar');
const over_lay = document.getElementById('overlay');
const save_tasks_btn = document.getElementById('savetasksbtn');
const task_inputs = document.querySelectorAll('.taskinput');
const active_task_display = document.getElementById('activetaskdisplay');
const face_selector = document.getElementById('faceselector');
const cube_side = document.getElementById('cubeside');
const status_dot = document.getElementById('statusdot');
const status_text = document.getElementById('statustext');
const timer_display = document.querySelector('.timerdisplay');

const face_themes = [
    { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7', dot: '#81c784', hover: '#1b5e20', disabled: '#c8e6c9' },
    { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9', dot: '#64b5f6', hover: '#0d47a1', disabled: '#bbdefb' },
    { bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8', dot: '#ba68c8', hover: '#4a148c', disabled: '#e1bee7' },
    { bg: '#fff3e0', text: '#e65100', border: '#ffcc80', dot: '#ffb74d', hover: '#bf360c', disabled: '#ffe0b2' },
    { bg: '#ffebee', text: '#c62828', border: '#ef9a9a', dot: '#e57373', hover: '#b71c1c', disabled: '#ffcdd2' },
    { bg: '#e0f2f1', text: '#00695c', border: '#80cbc4', dot: '#4db6ac', hover: '#004d40', disabled: '#b2dfdb' },
];

let serial_port = null;
let serial_reader = null;
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
    if(live_interval) { 
        clearInterval(live_interval); live_interval = null; 
    }
}

function build_stats_card() {
    const stats_card = document.querySelector('.cards:last-child');
    if(!stats_card) {
        return;
    }
    stats_card.innerHTML = '<h3>Stats</h3><div id="stats-container"></div>';
}

function parse_string(line) {
    line = line.trim();
    const match = line.match(/^Side\s+(\d+)\s*\|\s*Time:\s*(\d+)s/i);
    if(match) {
        const face = parseInt(match[1]);
        const seconds = parseInt(match[2]);

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

async function connect_serial() {
    try {
        set_connection_ui('connecting');
        serial_port = await navigator.serial.requestPort();
        await serial_port.open({ baudRate: 115200 });

        set_connection_ui('connected');
        show_toast('Connected!');

        const decoder = new TextDecoderStream();
        serial_port.readable.pipeTo(decoder.writable);
        serial_reader = decoder.readable.getReader();

        while(true) {
            const { value, done } = await serial_reader.read();
            if(done) {
                break;
            }

            if(value) {
                receive_buffer += value;
                let nl;
                while((nl = receive_buffer.indexOf('\n')) !== -1) {
                    const line = receive_buffer.slice(0, nl);
                    receive_buffer = receive_buffer.slice(nl + 1);
                    parse_string(line);
                }
            }
        }
    } 
    
    catch(e) {
        set_connection_ui('disconnected');
        show_toast('Error: ' + e.message);
    }
}

function set_connection_ui(state) {
    if(state === 'connected') {
        status_dot.classList.add('connected');
        status_text.textContent = 'Cube connected';
        connect_btn.textContent = 'Disconnect';
        connect_btn.dataset.state = 'connected';
        connect_btn.disabled = false;
    } 
    else if(state === 'connecting') {
        status_text.textContent = 'Connecting...';
        connect_btn.disabled = true;
    } 
    else {
        status_dot.classList.remove('connected');
        status_text.textContent = 'Cube disconnected';
        connect_btn.textContent = 'Connect Cube';
        connect_btn.dataset.state = 'disconnected';
        connect_btn.disabled = false;
    }
}

const validate_task_inputs = () => {
    let all_filled = true;
    task_inputs.forEach(input => {
        if(input.value.trim() === '') {
            all_filled = false;
        }
    });
    save_tasks_btn.disabled = !all_filled;
};

task_inputs.forEach(input => {
    input.addEventListener('input', validate_task_inputs);
});

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

save_tasks_btn.addEventListener('click', () => {
    update_face_display(active_face);
    show_toast('Tasks saved successfully!');
    close_sidebar();
});

connect_btn.addEventListener('click', async () => {
    if(!("serial" in navigator)) {
        show_toast('Web Serial API is not supported in this browser. Try Chrome or Edge.');
        return;
    }

    if(connect_btn.dataset.state === 'connected') {
        stop_live_timer();
        if (serial_reader) await serial_reader.cancel();
        if (serial_port) await serial_port.close();
        set_connection_ui('disconnected');
    } 
    else {
        await connect_serial();
    }
});

face_selector.addEventListener('input', (e) => {
    const val = face_selector.value;
    if(val === "") {
        return;
    }

    let num = parseInt(val);
    if(num > 6) {
        num = 6;
        face_selector.value = 6;
    } 
    else if(num < 1) {
        num = 1;
        face_selector.value = 1;
    }

    active_face = num;
    update_face_display(num);
});

function show_toast(msg) {
    let el = document.getElementById('cube-toast');
    if(!el) {
        el = document.createElement('div');
        el.id = 'cube-toast';
        el.style.cssText = `position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:20px; font-size:14px; z-index:9999; transition:opacity 0.4s; pointer-events:none;`;
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

update_face_display(active_face);
build_stats_card();
timer_display.textContent = '00:00';
