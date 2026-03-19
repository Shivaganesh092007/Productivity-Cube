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
const view_stats_btn = document.getElementById('viewstatsbtn');

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

function format_center_time(s) {
    if (s === 0) return "0 mins";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h} hr, ${m} mins`;
    return `${m} mins`;
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
        clearInterval(live_interval); 
        live_interval = null; 
    }
}

function parse_string(line) {
    if(!line) {
        return;
    }

    line = line.trim();

    if(line === "") {
        console.log("Empty string received. Waiting...");
        return;
    }
    
    const match = line.match(/^Side\s+(\d+)\s*\|\s*Time:\s*(\d+)s/i);
    if(match) {
        const face = parseInt(match[1]);
        let seconds = parseInt(match[2]);

        if(seconds > Number.MAX_SAFE_INTEGER) {
            console.log("Integer overflow warning"); 
            seconds = Number.MAX_SAFE_INTEGER; 
        }

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
        el.style.cssText = `position:fixed; bottom:24px; left:50%; transform:translateX(-50%); 
        background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:20px; 
        font-size:14px; z-index:9999; transition:opacity 0.4s; pointer-events:none;`;
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

if (view_stats_btn) {
    view_stats_btn.addEventListener('click', () => {
        const total_time = face_seconds.reduce((a, b) => a + b, 0);
        let gradient_str = '';
        let legend_html = '';
        let current_deg = 0;

        if (total_time > 0) {
            for (let i = 0; i < 6; i++) {
                const percentage = (face_seconds[i] / total_time) * 360;
                if (percentage > 0) {
                    const next_deg = current_deg + percentage;
                    gradient_str += `${face_themes[i].text} ${current_deg}deg ${next_deg}deg, `;
                    current_deg = next_deg;
                    
                    legend_html += `
                    <div class="legend-item">
                        <div class="color-box" style="background-color: ${face_themes[i].text};"></div>
                        <span class="task-name">${task_inputs[i].value}</span>
                        <span class="task-time">${format_time(face_seconds[i])}</span>
                    </div>`;
                }
            }
            gradient_str = gradient_str.slice(0, -2);
        } else {
            gradient_str = '#e0e0e0 0deg 360deg';
            legend_html = '<p style="text-align: center; color: #777;">No data recorded yet.</p>';
        }

        const stats_html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Cube Activity Stats</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background-color: #fdfdfd;
                    color: #333;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                }
                .chart-container {
                    position: relative;
                    width: 320px;
                    height: 320px;
                    border-radius: 50%;
                    background: conic-gradient(${gradient_str});
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 50px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                }
                .chart-inner {
                    width: 280px;
                    height: 280px;
                    background-color: #fdfdfd;
                    border-radius: 50%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .chart-inner .today {
                    font-size: 14px;
                    color: #666;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    margin-bottom: 5px;
                }
                .chart-inner .time {
                    font-size: 42px;
                    color: #222;
                    text-align: center;
                }
                .legend-container {
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                    width: 320px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    font-size: 16px;
                }
                .color-box {
                    width: 16px;
                    height: 16px;
                    border-radius: 4px;
                    margin-right: 12px;
                }
                .task-name {
                    flex-grow: 1;
                    font-weight: 500;
                }
                .task-time {
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="chart-container">
                <div class="chart-inner">
                    <div class="today">TODAY</div>
                    <div class="time">${format_center_time(total_time)}</div>
                </div>
            </div>
            <div class="legend-container">
                ${legend_html}
            </div>
        </body>
        </html>
        `;

        const statsWindow = window.open('', '_blank');
        statsWindow.document.write(stats_html);
        statsWindow.document.close();
    });
}

update_face_display(active_face);
timer_display.textContent = '00:00';
