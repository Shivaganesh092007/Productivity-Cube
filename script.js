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
const limit_inputs = document.querySelectorAll('.limitinput');
const limit_warning = document.getElementById('limitwarning');
const active_task_display = document.getElementById('activetaskdisplay');
const face_selector = document.getElementById('faceselector');
const cube_side = document.getElementById('cubeside');
const status_dot = document.getElementById('statusdot');
const status_text = document.getElementById('statustext');
const timer_display = document.querySelector('.timerdisplay');
const dark_toggle_btn = document.getElementById('darktogglebtn');

const view_stats_btn = document.getElementById('viewstatsbtn');
const back_btn = document.getElementById('backbtn');
const main_view = document.getElementById('mainview');
const stats_view = document.getElementById('statsview');
const donut_chart = document.getElementById('donutchart');
const total_time_display = document.getElementById('total-time-display');
const legend_container = document.getElementById('legend-container');

const weekly_view = document.getElementById('weeklyview');
const view_detailed_btn = document.getElementById('viewdetailedbtn');
const back_from_weekly_btn = document.getElementById('backfromweeklybtn');
const ai_summary_box = document.getElementById('aisummarybox');
const ai_summary_text = document.getElementById('aisummarytext');

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
let is_dark = false;

// --- Weekly Storage ---
const TODAY_KEY = new Date().toISOString().slice(0, 10);

function save_today() {
    try {
        const weekly = JSON.parse(localStorage.getItem('pc_weekly') || '{}');
        weekly[TODAY_KEY] = {
            face_seconds: [...face_seconds],
            tasks: Array.from(task_inputs).map(i => i.value)
        };
        localStorage.setItem('pc_weekly', JSON.stringify(weekly));
    } catch(e) {}
}

function load_weekly() {
    try {
        return JSON.parse(localStorage.getItem('pc_weekly') || '{}');
    } catch(e) { return {}; }
}

function get_last_7_days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }
    return days;
}

// --- Formatting ---
function format_time(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function format_time_short(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// --- Dark Mode ---
dark_toggle_btn.addEventListener('click', () => {
    is_dark = !is_dark;
    document.body.classList.toggle('dark', is_dark);
    dark_toggle_btn.textContent = is_dark ? '☀️' : '🌙';
    apply_theme(active_face - 1);
});

// --- Theme ---
function apply_theme(face_index) {
    const light_themes = face_themes;
    const dark_themes = [
        { bg: '#0f1f10', text: '#a5d6a7', border: '#2d5a2e', dot: '#66bb6a', hover: '#c8e6c9', disabled: '#1a3a1b' },
        { bg: '#0a1628', text: '#90caf9', border: '#1a3a5c', dot: '#42a5f5', hover: '#bbdefb', disabled: '#112244' },
        { bg: '#1a0a2e', text: '#ce93d8', border: '#4a1a6a', dot: '#ab47bc', hover: '#e1bee7', disabled: '#2d1245' },
        { bg: '#2a1500', text: '#ffcc80', border: '#5c3200', dot: '#ffa726', hover: '#ffe0b2', disabled: '#3d2000' },
        { bg: '#2a0a0a', text: '#ef9a9a', border: '#5c1a1a', dot: '#ef5350', hover: '#ffcdd2', disabled: '#3d1212' },
        { bg: '#001a18', text: '#80cbc4', border: '#003d38', dot: '#26a69a', hover: '#b2dfdb', disabled: '#002a26' },
    ];

    const t = is_dark ? dark_themes[face_index] : light_themes[face_index];
    const r = document.documentElement;
    r.style.setProperty('--bg-color', t.bg);
    r.style.setProperty('--text-color', t.text);
    r.style.setProperty('--border-color', t.border);
    r.style.setProperty('--dot-color', t.dot);
    r.style.setProperty('--hover-color', t.hover);
    r.style.setProperty('--disabled-bg', t.disabled);
}

// --- Face Display ---
function update_face_display(face_num) {
    cube_side.textContent = `FACE ${face_num}`;
    active_task_display.textContent = task_inputs[face_num - 1]?.value || `Face ${face_num}`;
    apply_theme(face_num - 1);
    update_daily_total_card();
}

// --- Daily Total Card ---
function update_daily_total_card() {
    const total = face_seconds.reduce((a, b) => a + b, 0);
    const el = document.getElementById('dailytotalstat');
    if (!el) return;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
        el.innerHTML = `<span class="stat-num">${h}<span class="stat-unit">h</span> ${m}<span class="stat-unit">m</span></span>`;
    } else if (m > 0) {
        el.innerHTML = `<span class="stat-num">${m}<span class="stat-unit">m</span> ${s}<span class="stat-unit">s</span></span>`;
    } else {
        el.innerHTML = `<span class="stat-num">${s}<span class="stat-unit">s</span></span>`;
    }

    const top_el = document.getElementById('toptaskstat');
    if (top_el) {
        let max_i = 0;
        face_seconds.forEach((sec, i) => { if (sec > face_seconds[max_i]) max_i = i; });
        const top_name = task_inputs[max_i]?.value || `Face ${max_i + 1}`;
        top_el.textContent = total > 0 ? top_name : '—';
    }
}

// --- Timer ---
function start_live_timer(face_num) {
    stop_live_timer();
    limit_warning.classList.remove('show'); 
    live_seconds = face_seconds[face_num - 1];
    timer_display.textContent = format_time(live_seconds);
    live_interval = setInterval(() => {
        live_seconds++;
        face_seconds[face_num - 1] = live_seconds;
        timer_display.textContent = format_time(live_seconds);
        update_daily_total_card();
        save_today();

        const limit_val = parseInt(limit_inputs[face_num - 1]?.value) || 0;
        if (limit_val > 0 && live_seconds >= limit_val * 60) {
            limit_warning.classList.add('show');
            limit_warning.textContent = `⏰ Limit reached for ${task_inputs[face_num - 1]?.value || `Face ${face_num}`}!`;
        }
    }, 1000);
}

function stop_live_timer() {
    if (live_interval) {
        clearInterval(live_interval);
        live_interval = null;
    }
}

// --- Daily Donut Chart ---
function render_chart() {
    const total_seconds = face_seconds.reduce((a, b) => a + b, 0);
    const hrs = Math.floor(total_seconds / 3600);
    const mins = Math.floor((total_seconds % 3600) / 60);
    total_time_display.textContent = hrs > 0 ? `${hrs} hr, ${mins} mins` : `${mins} mins`;

    let gradient_string = '';
    let current_pct = 0;
    legend_container.innerHTML = '';

    if (total_seconds === 0) {
        donut_chart.style.background = '#e0e0e0';
        legend_container.innerHTML = "<p style='grid-column: span 2; text-align: center; color: #666;'>No activity recorded yet.</p>";
        return;
    }

    face_seconds.forEach((sec, index) => {
        if (sec > 0) {
            const pct = (sec / total_seconds) * 100;
            const start = current_pct;
            const end = current_pct + pct;
            const color = face_themes[index].dot;
            gradient_string += `${color} ${start}% ${end}%, `;
            current_pct = end;

            const task_name = task_inputs[index].value || `Face ${index + 1}`;
            legend_container.innerHTML += `
                <div class="legend-item">
                    <div class="legend-color" style="background-color: ${color};"></div>
                    <div>
                        <div style="color: #333;">${task_name}</div>
                        <div style="font-size: 13px; color: #888; font-weight: normal;">${format_time_short(sec)}</div>
                    </div>
                </div>`;
        }
    });

    gradient_string = gradient_string.slice(0, -2);
    donut_chart.style.background = `conic-gradient(${gradient_string})`;
}

// --- Weekly Bar Chart ---
function render_weekly_chart() {
    const weekly_data = load_weekly();
    const days_keys = get_last_7_days();
    const day_labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const bars_container = document.getElementById('weeklybars');
    bars_container.innerHTML = '';

    let max_seconds = 0;
    const day_totals = days_keys.map(key => {
        const entry = weekly_data[key];
        const total = entry ? entry.face_seconds.reduce((a, b) => a + b, 0) : 0;
        if (total > max_seconds) max_seconds = total;
        return { key, total, entry };
    });

    if (max_seconds === 0) max_seconds = 3600; 

    day_totals.forEach(({ key, total, entry }) => {
        const d = new Date(key + 'T00:00:00');
        const day_name = day_labels[d.getDay()];
        const date_str = `${d.getDate()}/${d.getMonth() + 1}`;
        const height_pct = Math.max((total / max_seconds) * 100, total > 0 ? 4 : 0);
        const is_today = key === TODAY_KEY;

        let tooltip_html = `<strong>${day_name}, ${date_str}</strong><br>Total: ${format_time_short(total)}`;
        if (entry && total > 0) {
            entry.face_seconds.forEach((sec, i) => {
                if (sec > 0) {
                    const task = entry.tasks?.[i] || `Face ${i + 1}`;
                    tooltip_html += `<br>${task}: ${format_time_short(sec)}`;
                }
            });
        }

        const bar_color = is_today ? 'var(--text-color)' : 'var(--border-color)';

        bars_container.innerHTML += `
            <div class="bar-col">
                <div class="bar-tooltip">${tooltip_html}</div>
                <div class="bar-time">${total > 0 ? format_time_short(total) : ''}</div>
                <div class="bar-wrap">
                    <div class="bar-fill" style="height: ${height_pct}%; background: ${bar_color}; ${is_today ? 'box-shadow: 0 0 12px var(--dot-color)44;' : ''}"></div>
                </div>
                <div class="bar-label">
                    <div class="bar-day" style="${is_today ? 'font-weight: 900; color: var(--text-color);' : ''}">${day_name}</div>
                    <div class="bar-date">${date_str}</div>
                </div>
            </div>`;
    });
}

// --- Claude AI Summary ---
async function fetch_ai_summary() {
    const weekly_data = load_weekly();
    const days_keys = get_last_7_days();
    let stats_text = 'Past 7 days productivity:\n';
    let has_data = false;

    days_keys.forEach(key => {
        const entry = weekly_data[key];
        if (entry) {
            has_data = true;
            stats_text += `${key}: Total ${format_time_short(entry.face_seconds.reduce((a, b) => a + b, 0))}\n`;
        }
    });

    if (!has_data) {
        ai_summary_text.innerHTML = '<em>No weekly data yet.</em>';
        ai_summary_box.style.display = 'block';
        return;
    }

    ai_summary_text.innerHTML = '<em>⏳ Analysing...</em>';
    ai_summary_box.style.display = 'block';

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 200,
                messages: [{ role: 'user', content: stats_text + "\nSummarize my week briefly." }]
            })
        });
        const data = await response.json();
        ai_summary_text.textContent = data.content[0].text;
    } catch(e) { ai_summary_text.textContent = 'Summary unavailable.'; }
}

// --- View Switching ---
view_stats_btn.addEventListener('click', () => {
    main_view.style.display = 'none';
    stats_view.style.display = 'flex';
    render_chart();
});

back_btn.addEventListener('click', () => {
    stats_view.style.display = 'none';
    main_view.style.display = 'grid';
});

view_detailed_btn.addEventListener('click', () => {
    stats_view.style.display = 'none';
    weekly_view.style.display = 'flex';
    render_weekly_chart();
    fetch_ai_summary();
});

back_from_weekly_btn.addEventListener('click', () => {
    weekly_view.style.display = 'none';
    stats_view.style.display = 'flex';
    ai_summary_box.style.display = 'none';
});

// --- Serial Parsing Logic ---
function parse_string(line) {
    if (!line) return;

    line = line.trim();

    if (line === "") {
        console.log("Empty string received. Waiting...");
        return;
    }

    const match = line.match(/^Side\s+(\d+)\s*\|\s*Time:\s*(\d+)s/i);
    if (match) {
        const face = parseInt(match[1]);
        let seconds = parseInt(match[2]);

        if (seconds > Number.MAX_SAFE_INTEGER) {
            console.log("Integer overflow warning");
            seconds = Number.MAX_SAFE_INTEGER;
        }

        if (face !== last_face) {
            last_face = face;
            active_face = face;
            face_seconds[face - 1] = seconds;
            face_selector.value = face;
            update_face_display(face);
            start_live_timer(face);
        }
    }
}

// --- Web Serial Connection ---
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

        while (true) {
            const { value, done } = await serial_reader.read();
            if (done) break;

            if (value) {
                receive_buffer += value;
                let nl;
                while ((nl = receive_buffer.indexOf('\n')) !== -1) {
                    const line = receive_buffer.slice(0, nl);
                    receive_buffer = receive_buffer.slice(nl + 1);
                    parse_string(line);
                }
            }
        }
    } catch(e) {
        set_connection_ui('disconnected');
        show_toast('Error: ' + e.message);
    }
}

function set_connection_ui(state) {
    if (state === 'connected') {
        status_dot.classList.add('connected');
        status_text.textContent = 'Cube connected';
        connect_btn.textContent = 'Disconnect';
        connect_btn.dataset.state = 'connected';
    } else if (state === 'connecting') {
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
    task_inputs.forEach(input => { if (input.value.trim() === '') all_filled = false; });
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

save_tasks_btn.addEventListener('click', () => {
    update_face_display(active_face);
    show_toast('Tasks saved!');
    close_sidebar();
    save_today();
});

connect_btn.addEventListener('click', async () => {
    if (!("serial" in navigator)) {
        show_toast('Web Serial API is not supported in this browser. Try Chrome or Edge.');
        return;
    }

    if (connect_btn.dataset.state === 'connected') {
        stop_live_timer();
        if (serial_reader) await serial_reader.cancel();
        if (serial_port) await serial_port.close();
        set_connection_ui('disconnected');
    } else {
        await connect_serial();
    }
});

face_selector.addEventListener('input', () => {
    let num = parseInt(face_selector.value);
    if (num > 6) num = 6; else if (num < 1) num = 1;
    face_selector.value = num;
    active_face = num;
    update_face_display(num);
});

function show_toast(msg) {
    let el = document.getElementById('cube-toast') || document.createElement('div');
    el.id = 'cube-toast';
    el.style.cssText = `position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:20px; font-size:14px; z-index:9999; transition:opacity 0.4s;`;
    if (!el.parentElement) document.body.appendChild(el);
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// --- Init ---
update_face_display(active_face);
timer_display.textContent = '00:00';
update_daily_total_card();
