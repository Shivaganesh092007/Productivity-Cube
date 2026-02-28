// DOM Elements
        const opensettingsbtn = document.getElementById('opensettings');
        const closesettingsbtn = document.getElementById('closesettings');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');
        const savetasksbtn = document.getElementById('savetasksbtn');
        const taskinputs = document.querySelectorAll('.taskinput');
        const activetaskdisplay = document.getElementById('activetaskdisplay');
        const faceselector = document.getElementById('faceselector');
        const cubeside = document.getElementById('cubeside');

        // Color Themes
        const faceThemes = [
            { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7', dot: '#81c784', hover: '#1b5e20', disabled: '#c8e6c9' }, // Face 1: Mint
            { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9', dot: '#64b5f6', hover: '#0d47a1', disabled: '#bbdefb' }, // Face 2: Blue
            { bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8', dot: '#ba68c8', hover: '#4a148c', disabled: '#e1bee7' }, // Face 3: Purple
            { bg: '#fff3e0', text: '#e65100', border: '#ffcc80', dot: '#ffb74d', hover: '#bf360c', disabled: '#ffe0b2' }, // Face 4: Orange
            { bg: '#ffebee', text: '#c62828', border: '#ef9a9a', dot: '#e57373', hover: '#b71c1c', disabled: '#ffcdd2' }, // Face 5: Red
            { bg: '#e0f2f1', text: '#00695c', border: '#80cbc4', dot: '#4db6ac', hover: '#004d40', disabled: '#b2dfdb' }  // Face 6: Teal
        ];

        // --- SETTINGS & SIDEBAR LOGIC ---
        opensettingsbtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('show');
            validateinputs();
        });
        
        const closesidebar = () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
        };

        closesettingsbtn.addEventListener('click', closesidebar);
        overlay.addEventListener('click', closesidebar);

        const validateinputs = () => {
            let allfilled = true;
            taskinputs.forEach(input => {
                if (input.value.trim() === '') {
                    allfilled = false;
                }
            });
            savetasksbtn.disabled = !allfilled;
        };

        taskinputs.forEach(input => {
            input.addEventListener('input', validateinputs);
        });

        // --- CUBE DISPLAY & THEME LOGIC ---
        const updateCubeDisplay = () => {
            let faceNum = parseInt(faceselector.value);
            
            if (faceNum < 1) faceNum = 1;
            if (faceNum > 6) faceNum = 6;
            faceselector.value = faceNum; 

            // Update text displays
            cubeside.textContent = `FACE ${faceNum}`;
            activetaskdisplay.textContent = taskinputs[faceNum - 1].value; 

            // Apply Theme
            const theme = faceThemes[faceNum - 1];
            const root = document.documentElement;
            root.style.setProperty('--bg-color', theme.bg);
            root.style.setProperty('--text-color', theme.text);
            root.style.setProperty('--border-color', theme.border);
            root.style.setProperty('--dot-color', theme.dot);
            root.style.setProperty('--hover-color', theme.hover);
            root.style.setProperty('--disabled-bg', theme.disabled);
        };

        faceselector.addEventListener('input', updateCubeDisplay);

        savetasksbtn.addEventListener('click', () => {
            updateCubeDisplay(); 
            alert('Tasks saved successfully!');
            closesidebar();
        });

        // Initialize display and theme on page load
        updateCubeDisplay();
