/**
 * RYFT FINA ENGINE 2.0
 * Полная реализация логики, анимаций и базы данных нормативов.
 */

"use strict";

// Названия для интерфейса
const STYLE_NAMES = {
    'freestyle': 'Вольный стиль',
    'backstroke': 'На спине',
    'breaststroke': 'Брасс',
    'butterfly': 'Баттерфляй',
    'medley': 'Комплекс'
};

const RANK_NAMES = {
    'MSMK': 'МСМК',
    'MS': 'МС',
    'KMS': 'КМС',
    'I': 'I разряд',
    'II': 'II разряд',
    'III': 'III разряд',
    'I_jun': 'I юн.',
    'II_jun': 'II юн.',
    'III_jun': 'III юн.',
    'none': 'Без разряда'
};

// Порядок разрядов для логики прогресса (от худшего к лучшему)
const RANK_ORDER = ['III_jun', 'II_jun', 'I_jun', 'III', 'II', 'I', 'KMS', 'MS', 'MSMK'];

/* ==========================================================================
   БАЗА ДАННЫХ (ПЕРЕНЕСЕНО ИЗ ТВОЕЙ ТАБЛИЦЫ)
   ========================================================================== */

// record_time используется как BaseTime для формулы FINA: 1000 * (BaseTime / Time)^3
const SWIMMING_DB = {
    'male': {
        '25': {
            'freestyle': {
                50: { record: 19.9, MSMK: 21.18, MS: 22.45, KMS: 23.2, I: 24.45, II: 26.85, III: 29.05, I_jun: 35.05, II_jun: 45.05, III_jun: 55.05 },
                100: { record: 44.84, MSMK: 46.72, MS: 50, KMS: 53.3, I: 56.7, II: 63.1, III: 70.6, I_jun: 83.1, II_jun: 103.1, III_jun: 123.1 },
                200: { record: 98.61, MSMK: 103.02, MS: 110.95, KMS: 117.45, I: 125.7, II: 140.2, III: 158.7, I_jun: 184.2, II_jun: 225, III_jun: 264.2 },
                400: { record: 212.25, MSMK: 220.94, MS: 236, KMS: 248.5, I: 265, II: 300, III: 341, I_jun: 397, II_jun: 453, III_jun: 509 },
                800: { record: 440.46, MSMK: 462.7, MS: 497, KMS: 530, I: 564, II: 662, III: 744, I_jun: 866, II_jun: 986, III_jun: 1106 },
                1500: { record: 846.88, MSMK: 884.74, MS: 928.5, KMS: 1026.5, I: 1085, II: 1227.5, III: 1407.5, I_jun: 1650, II_jun: 1890, III_jun: 2130 }
            },
            'backstroke': {
                50: { record: 22.11, MSMK: 23.29, MS: 25.89, KMS: 27.35, I: 29.35, II: 32.05, III: 35.55, I_jun: 41.55, II_jun: 51.55, III_jun: 61.55 },
                100: { record: 48.33, MSMK: 50.54, MS: 57, KMS: 60.4, I: 64.4, II: 72.6, III: 81.1, I_jun: 93.6, II_jun: 116.1, III_jun: 136.1 },
                200: { record: 105.63, MSMK: 112.45, MS: 124.75, KMS: 131.45, I: 139.2, II: 156.2, III: 176.2, I_jun: 204.2, II_jun: 250.2, III_jun: 290.2 }
            },
            'breaststroke': {
                50: { record: 24.95, MSMK: 26.28, MS: 28.25, KMS: 30, I: 31.65, II: 35.05, III: 38.55, I_jun: 45.05, II_jun: 55.05, III_jun: 65.05 },
                100: { record: 55.28, MSMK: 57.34, MS: 63, KMS: 66.9, I: 71.4, II: 80.1, III: 88.1, I_jun: 104.1, II_jun: 123.1, III_jun: 143.1 },
                200: { record: 120.16, MSMK: 125.56, MS: 138.45, KMS: 146.45, I: 156.45, II: 175.7, III: 198.7, I_jun: 231.6, II_jun: 264.6, III_jun: 304.6 }
            },
            'butterfly': {
                50: { record: 21.32, MSMK: 22.52, MS: 23.95, KMS: 24.95, I: 26.95, II: 30.05, III: 33.05, I_jun: 38.05, II_jun: 48.05, III_jun: 58.05 },
                100: { record: 47.71, MSMK: 50.15, MS: 54, KMS: 58, I: 61.5, II: 70.1, III: 80.1, I_jun: 90.1, II_jun: 109.1, III_jun: 121.1 },
                200: { record: 106.85, MSMK: 112.45, MS: 122.95, KMS: 129.95, I: 137.95, II: 156.7, III: 177.2, I_jun: 201.2, II_jun: 236.2, III_jun: 276.2 }
            },
            'medley': {
                100: { record: 49.28, MSMK: 52.57, MS: 56.5, KMS: 61.5, I: 65.5, II: 73.6, III: 83.6, I_jun: 94.6, II_jun: 113.6, III_jun: 133.6 },
                200: { record: 108.88, MSMK: 114.17, MS: 125.95, KMS: 134.45, I: 141.95, II: 158.95, III: 184.2, I_jun: 209.2, II_jun: 244.2, III_jun: 284.2 },
                400: { record: 234.81, MSMK: 246.68, MS: 268, KMS: 283, I: 302, II: 343, III: 391, I_jun: 446, II_jun: 502, III_jun: 558 }
            }
        },
        '50': {
            'freestyle': {
                50: { record: 20.91, MSMK: 21.91, MS: 23.2, KMS: 23.95, I: 25.2, II: 27.6, III: 29.8, I_jun: 35.8, II_jun: 45.8, III_jun: 55.8 },
                100: { record: 46.4, MSMK: 48.25, MS: 51.5, KMS: 54.9, I: 58.3, II: 64.6, III: 72.1, I_jun: 84.6, II_jun: 104.6, III_jun: 124.6 },
                200: { record: 102, MSMK: 106.5, MS: 113.95, KMS: 120.65, I: 128.95, II: 143.2, III: 161.7, I_jun: 187.2, II_jun: 227.2, III_jun: 267.2 },
                400: { record: 219.96, MSMK: 227.71, MS: 242, KMS: 254.5, I: 271, II: 306, III: 347, I_jun: 403, II_jun: 459, III_jun: 515 },
                800: { record: 452.12, MSMK: 472.6, MS: 505, KMS: 538, I: 577, II: 674, III: 756, I_jun: 878, II_jun: 998, III_jun: 1118 },
                1500: { record: 870.67, MSMK: 906.19, MS: 951, KMS: 1049, I: 1109, II: 1250, III: 1430, I_jun: 1672.5, II_jun: 1912.5, III_jun: 2152.5 }
            },
            'backstroke': {
                50: { record: 23.55, MSMK: 24.85, MS: 26.65, KMS: 28.15, I: 29.95, II: 32.8, III: 36.3, I_jun: 42.3, II_jun: 52.3, III_jun: 62.3 },
                100: { record: 51.6, MSMK: 53.72, MS: 58.5, KMS: 62, I: 66, II: 74.1, III: 82.6, I_jun: 95.1, II_jun: 117.6, III_jun: 137.6 },
                200: { record: 111.92, MSMK: 117.3, MS: 127.75, KMS: 135.45, I: 142.45, II: 158.2, III: 179.2, I_jun: 207.2, II_jun: 253.2, III_jun: 293.2 }
            },
            'breaststroke': {
                50: { record: 25.95, MSMK: 27.22, MS: 29, KMS: 30.5, I: 32.4, II: 35.8, III: 39.3, I_jun: 45.8, II_jun: 55.8, III_jun: 65.8 },
                100: { record: 56.88, MSMK: 59.91, MS: 64.5, KMS: 68.5, I: 73, II: 81.6, III: 89.6, I_jun: 105.6, II_jun: 124.6, III_jun: 144.6 },
                200: { record: 125.48, MSMK: 129.97, MS: 141.45, KMS: 149.45, I: 159.45, II: 178.7, III: 201.7, I_jun: 234.2, II_jun: 267.2, III_jun: 307.2 }
            },
            'butterfly': {
                50: { record: 22.27, MSMK: 23.27, MS: 24.7, KMS: 25.7, I: 27.7, II: 30.8, III: 33.8, I_jun: 38.8, II_jun: 48.8, III_jun: 58.8 },
                100: { record: 49.45, MSMK: 51.62, MS: 55.5, KMS: 59.5, I: 63, II: 71.6, III: 81.6, I_jun: 91.6, II_jun: 110.6, III_jun: 130.6 },
                200: { record: 110.34, MSMK: 116.23, MS: 125.95, KMS: 133.95, I: 140.95, II: 159.7, III: 180.2, I_jun: 204.2, II_jun: 239.2, III_jun: 279.2 }
            },
            'medley': {
                200: { record: 112.69, MSMK: 118.59, MS: 129.75, KMS: 137.25, I: 145.75, II: 164, III: 188, I_jun: 213, II_jun: 248, III_jun: 288 },
                400: { record: 242.5, MSMK: 253.76, MS: 274, KMS: 288, I: 307, II: 348, III: 397, I_jun: 452, II_jun: 508, III_jun: 564 }
            }
        }
    },
    'female': {
        '25': {
            'freestyle': {
                50: { record: 22.83, MSMK: 24.13, MS: 25.75, KMS: 26.55, I: 27.85, II: 30.55, III: 32.55, I_jun: 39.55, II_jun: 49.55, III_jun: 59.05 },
                100: { record: 50.25, MSMK: 52.68, MS: 56, KMS: 60, I: 63.84, II: 71.4, III: 79.1, I_jun: 93.1, II_jun: 113.1, III_jun: 132.1 },
                200: { record: 110.31, MSMK: 115.02, MS: 123.45, KMS: 131.75, I: 140.45, II: 156.2, III: 174.2, I_jun: 205.2, II_jun: 245.2, III_jun: 283.2 },
                400: { record: 230.25, MSMK: 243.32, MS: 260, KMS: 270, I: 292, II: 334, III: 378, I_jun: 449, II_jun: 520, III_jun: 591 },
                800: { record: 477.42, MSMK: 503.99, MS: 540, KMS: 570, I: 611, II: 702, III: 795, I_jun: 960, II_jun: 1110, III_jun: 1260 },
                1500: { record: 908.24, MSMK: 972.06, MS: 1032.5, KMS: 1101.5, I: 1204.5, II: 1354.5, III: 1557.5, I_jun: 1805, II_jun: 2050, III_jun: 2300 }
            },
            'backstroke': {
                50: { record: 25.23, MSMK: 26.57, MS: 28.65, KMS: 29.85, I: 31.55, II: 36.55, III: 40.55, I_jun: 47.05, II_jun: 57.05, III_jun: 67.05 },
                100: { record: 54.02, MSMK: 57.36, MS: 63.6, KMS: 68.5, I: 73, II: 81.1, III: 91.1, I_jun: 105.1, II_jun: 128.1, III_jun: 148.1 },
                200: { record: 118.04, MSMK: 125.15, MS: 137.95, KMS: 145.95, I: 154.95, II: 174.2, III: 196.2, I_jun: 230.2, II_jun: 275.2, III_jun: 315.2 }
            },
            'breaststroke': {
                50: { record: 28.37, MSMK: 30.04, MS: 32.45, KMS: 34.25, I: 35.95, II: 40.05, III: 44.05, I_jun: 51.55, II_jun: 61.55, III_jun: 71.55 },
                100: { record: 62.36, MSMK: 65.05, MS: 72, KMS: 76, I: 81, II: 89.6, III: 101.6, I_jun: 126.1, II_jun: 136.1, III_jun: 157.1 },
                200: { record: 132.5, MSMK: 141.34, MS: 154.45, KMS: 163.45, I: 173.95, II: 194.2, III: 219.6, I_jun: 256.6, II_jun: 291.6, III_jun: 333.2 }
            },
            'butterfly': {
                50: { record: 23.94, MSMK: 25.62, MS: 27.3, KMS: 28.45, I: 30.95, II: 33.55, III: 36.55, I_jun: 43.55, II_jun: 53.55, III_jun: 63.55 },
                100: { record: 52.71, MSMK: 57.16, MS: 61.5, KMS: 65, I: 69.5, II: 79.1, III: 90.1, I_jun: 102.1, II_jun: 121.1, III_jun: 141.1 },
                200: { record: 119.32, MSMK: 127.15, MS: 136.95, KMS: 144.45, I: 154.45, II: 175.2, III: 198.2, I_jun: 225.2, II_jun: 261.2, III_jun: 301.2 }
            },
            'medley': {
                100: { record: 55.11, MSMK: 59.56, MS: 64.5, KMS: 69.5, I: 74.5, II: 83.6, III: 94.6, I_jun: 106.6, II_jun: 125.6, III_jun: 165.6 },
                200: { record: 121.63, MSMK: 128.11, MS: 140.95, KMS: 149.45, I: 158.95, II: 179.2, III: 205.2, I_jun: 234.2, II_jun: 270.2, III_jun: 310.2 },
                400: { record: 255.48, MSMK: 275.03, MS: 298, KMS: 315.5, I: 337, II: 381, III: 434, I_jun: 495, II_jun: 566, III_jun: 637 }
            }
        },
        '50': {
            'freestyle': {
                50: { record: 23.61, MSMK: 24.82, MS: 26.5, KMS: 27.3, I: 28.6, II: 31.3, III: 33.3, I_jun: 40.3, II_jun: 50.3, III_jun: 59.8 },
                100: { record: 51.71, MSMK: 53.99, MS: 57.5, KMS: 61.5, I: 65.34, II: 72.9, III: 80.6, I_jun: 94.6, II_jun: 114.6, III_jun: 133.6 },
                200: { record: 112.23, MSMK: 116.9, MS: 126.45, KMS: 134.76, I: 143.45, II: 158.2, III: 177.2, I_jun: 208.2, II_jun: 248.2, III_jun: 286.2 },
                400: { record: 234.18, MSMK: 248.04, MS: 266, KMS: 281, I: 299, II: 340, III: 384, I_jun: 455, II_jun: 526, III_jun: 597 },
                800: { record: 484.12, MSMK: 511.12, MS: 548, KMS: 582, I: 623, II: 714, III: 807, I_jun: 972, II_jun: 1122, III_jun: 1272 },
                1500: { record: 920.48, MSMK: 980.88, MS: 1055, KMS: 1124, I: 1227, II: 1377, III: 1580, I_jun: 1827.5, II_jun: 2072.5, III_jun: 2322.5 }
            },
            'backstroke': {
                50: { record: 26.86, MSMK: 28.05, MS: 29, KMS: 30.7, I: 32.3, II: 37.3, III: 41.3, I_jun: 47.8, II_jun: 57.8, III_jun: 67.8 },
                100: { record: 57.13, MSMK: 59.8, MS: 66, KMS: 70, I: 74.5, II: 82.6, III: 92.6, I_jun: 106.6, II_jun: 129.6, III_jun: 149.6 },
                200: { record: 123.14, MSMK: 129.77, MS: 140.95, KMS: 148.95, I: 157.95, II: 177.2, III: 199.2, I_jun: 233.2, II_jun: 278.2, III_jun: 318 }
            },
            'breaststroke': {
                50: { record: 29.16, MSMK: 30.77, MS: 33.2, KMS: 35, I: 36.7, II: 40.8, III: 44.8, I_jun: 52.3, II_jun: 62.3, III_jun: 72.3 },
                100: { record: 64.13, MSMK: 66.88, MS: 73.5, KMS: 77.5, I: 82.5, II: 91.1, III: 103.1, I_jun: 127.6, II_jun: 137.6, III_jun: 158.6 },
                200: { record: 137.55, MSMK: 145.24, MS: 157.45, KMS: 166.4, I: 176.95, II: 197.2, III: 222.2, I_jun: 259.2, II_jun: 294.2, III_jun: 336.2 }
            },
            'butterfly': {
                50: { record: 24.43, MSMK: 26.03, MS: 28.05, KMS: 29.2, I: 31.7, II: 34.3, III: 37.3, I_jun: 44.3, II_jun: 54.3, III_jun: 64.3 },
                100: { record: 54.6, MSMK: 58.06, MS: 63, KMS: 66.5, I: 71, II: 80.6, III: 91.6, I_jun: 103.6, II_jun: 122.6, III_jun: 142.6 },
                200: { record: 121.81, MSMK: 128.9, MS: 139.95, KMS: 147.45, I: 157.45, II: 178.2, III: 201.2, I_jun: 228.2, II_jun: 264.2, III_jun: 304.2 }
            },
            'medley': {
                200: { record: 125.7, MSMK: 132.12, MS: 144.75, KMS: 153.25, I: 162.75, II: 183, III: 209, I_jun: 238, II_jun: 274, III_jun: 314 },
                400: { record: 263.65, MSMK: 280.8, MS: 303, KMS: 320.5, I: 342, II: 387, III: 440, I_jun: 501, II_jun: 572, III_jun: 643 }
            }
        }
    }
};

/* ==========================================================================
   STATE & INITIALIZATION
   ========================================================================== */

const state = {
    gender: 'male',
    pool: '25',
    style: 'freestyle',
    distance: 50,
    isSheetOpen: false
};

const tg = window.Telegram.WebApp;
tg.expand();

document.addEventListener('DOMContentLoaded', () => {
    initSwitches();
    initPickers();
    initTimeInput();
    initBottomSheet();
    
    document.getElementById('calc-btn').addEventListener('click', onCalculate);
});

/* ==========================================================================
   UI CONTROLS (SWITCHES)
   ========================================================================== */

function initSwitches() {
    // Gender
    const gBtns = document.querySelectorAll('.g-btn');
    const gSwitch = document.querySelector('.gender-switch');
    gBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.gender = btn.dataset.gender;
            gBtns.forEach(b => b.classList.toggle('active', b === btn));
            gSwitch.dataset.state = state.gender === 'male' ? 'm' : 'f';
            tg.HapticFeedback.selectionChanged();
            updateDistancePicker(); // Distances might change per gender/pool in some DBs
        });
    });

    // Pool
    const pBtns = document.querySelectorAll('.p-btn');
    const pSwitch = document.querySelector('.pool-switch');
    pBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.pool = btn.dataset.pool;
            pBtns.forEach(b => b.classList.toggle('active', b === btn));
            pSwitch.dataset.state = state.pool;
            tg.HapticFeedback.selectionChanged();
            updateDistancePicker();
        });
    });
}

/* ==========================================================================
   SCROLL PICKERS (IOS STYLE)
   ========================================================================== */

function initPickers() {
    renderStylePicker();
    updateDistancePicker();
}

function renderStylePicker() {
    const list = document.querySelector('#picker-style .picker-list');
    list.innerHTML = '';
    
    Object.keys(STYLE_NAMES).forEach(key => {
        const li = document.createElement('li');
        li.className = 'picker-item';
        li.dataset.val = key;
        li.textContent = STYLE_NAMES[key].split(' ')[0]; // Short name
        list.appendChild(li);
    });

    setupScrollLogic('#picker-style', (val) => {
        if(state.style !== val) {
            state.style = val;
            updateDistancePicker();
        }
    });
}

function updateDistancePicker() {
    const list = document.querySelector('#picker-dist .picker-list');
    const container = document.querySelector('#picker-dist');
    
    // Плавное исчезновение перед обновлением
    list.style.opacity = '0';
    
    setTimeout(() => {
        list.innerHTML = '';
        const data = SWIMMING_DB[state.gender][state.pool][state.style];
        const distances = Object.keys(data).filter(k => k !== 'record').map(Number).sort((a,b) => a-b);
        
        distances.forEach(d => {
            const li = document.createElement('li');
            li.className = 'picker-item';
            li.dataset.val = d;
            li.textContent = d + 'м';
            list.appendChild(li);
        });

        state.distance = distances[0];
        container.scrollTop = 0;
        list.style.opacity = '1';
        
        setupScrollLogic('#picker-dist', (val) => {
            state.distance = parseInt(val);
        });
    }, 150);
}

function setupScrollLogic(selector, callback) {
    const container = document.querySelector(selector);
    let isScrolling;

    container.onscroll = () => {
        window.clearTimeout(isScrolling);
        
        // Визуальное выделение центрального элемента
        const center = container.scrollTop + 75; // 75 = height/2
        const items = container.querySelectorAll('.picker-item');
        
        items.forEach(item => {
            const diff = Math.abs((item.offsetTop + 20) - center);
            if(diff < 20) {
                if(!item.classList.contains('selected')) {
                    item.classList.add('selected');
                    tg.HapticFeedback.selectionChanged();
                }
            } else {
                item.classList.remove('selected');
            }
        });

        isScrolling = setTimeout(() => {
            const selected = container.querySelector('.picker-item.selected');
            if(selected) callback(selected.dataset.val);
        }, 100);
    };
}

/* ==========================================================================
   INPUT LOGIC
   ========================================================================== */

function initTimeInput() {
    const input = document.getElementById('time-input');
    
    input.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^\d]/g, '');
        if (val.length > 6) val = val.substring(0, 6);
        
        let formatted = "";
        if (val.length > 4) {
            formatted = val.slice(0, -4) + ":" + val.slice(-4, -2) + "." + val.slice(-2);
        } else if (val.length > 2) {
            formatted = val.slice(0, -2) + "." + val.slice(-2);
        } else {
            formatted = val;
        }
        e.target.value = formatted;
    });
}

function parseTimeToSeconds(str) {
    if (!str) return 0;
    const parts = str.split(/[:.]/);
    if (parts.length === 3) { // MM:SS.ms
        return parseInt(parts[0]) * 60 + parseInt(parts[1]) + parseInt(parts[2]) / 100;
    } else if (parts.length === 2) { // SS.ms
        return parseInt(parts[0]) + parseInt(parts[1]) / 100;
    }
    return parseFloat(str) || 0;
}

/* ==========================================================================
   CALCULATION ENGINE
   ========================================================================== */

function onCalculate() {
    const rawTime = document.getElementById('time-input').value;
    const userSeconds = parseTimeToSeconds(rawTime);

    if (userSeconds <= 0) {
        tg.showAlert("Пожалуйста, введите корректное время");
        return;
    }

    const dbEntry = SWIMMING_DB[state.gender][state.pool][state.style][state.distance];
    
    // 1. FINA Points
    const points = Math.floor(1000 * Math.pow(dbEntry.record / userSeconds, 3));
    animatePoints(points);

    // 2. Rank & Progress
    const rankData = calculateRankAndProgress(userSeconds, dbEntry);
    
    // 3. Show Sheet
    showResults(rankData, points, rawTime);
}

function calculateRankAndProgress(time, norms) {
    let currentRankKey = 'none';
    let nextRankKey = RANK_ORDER[0];

    // Ищем текущий выполненный разряд (идем от лучшего к худшему)
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const key = RANK_ORDER[i];
        if (norms[key] && time <= norms[key]) {
            currentRankKey = key;
            nextRankKey = RANK_ORDER[i + 1] || null;
            break;
        }
    }

    let percent = 0;
    let gap = 0;

    if (currentRankKey === 'MSMK') {
        percent = 100;
        gap = 0;
    } else if (nextRankKey) {
        const nextTime = norms[nextRankKey];
        const currentTimeLimit = norms[currentRankKey] || (nextTime * 1.3); // Если разряда нет, берем +30% от времени
        
        gap = (time - nextTime).toFixed(2);
        
        // Процент: (Время_Лимит - Время_Юзера) / (Время_Лимит - Время_Цели)
        const totalRange = currentTimeLimit - nextTime;
        const userProgress = currentTimeLimit - time;
        percent = Math.max(5, Math.min(98, (userProgress / totalRange) * 100));
    }

    return {
        current: RANK_NAMES[currentRankKey],
        next: nextRankKey ? RANK_NAMES[nextRankKey] : "MAX",
        percent: percent,
        gap: gap,
        isMax: currentRankKey === 'MSMK'
    };
}

function animatePoints(target) {
    const el = document.getElementById('fina-score');
    const start = parseInt(el.innerText) || 0;
    const duration = 800;
    let startTime = null;

    // Масштабирование шрифта для больших чисел
    el.style.fontSize = target > 999 ? '38px' : '48px';

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const current = Math.floor(progress * (target - start) + start);
        el.innerText = current;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

/* ==========================================================================
   BOTTOM SHEET (GUESTURES & RENDER)
   ========================================================================== */

function initBottomSheet() {
    const sheet = document.getElementById('result-sheet');
    const overlay = document.getElementById('overlay');
    const handle = document.querySelector('.sheet-handle-area');
    
    let startY, currentY, dragging = false;

    handle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        dragging = true;
        sheet.style.transition = 'none';
    });

    handle.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        if (delta > 0) {
            sheet.style.transform = `translateY(${delta}px)`;
        }
    });

    handle.addEventListener('touchend', (e) => {
        dragging = false;
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        const delta = currentY - startY;
        if (delta > 120) {
            closeSheet();
        } else {
            sheet.style.transform = 'translateY(0)';
        }
    });

    overlay.addEventListener('click', closeSheet);
}

function showResults(rankData, points, timeStr) {
    // Рендер данных в шторку
    document.getElementById('rank-badge').innerText = rankData.current;
    document.getElementById('current-rank-label').innerText = rankData.current;
    document.getElementById('next-rank-label').innerText = rankData.next;
    
    const fill = document.getElementById('progress-fill');
    fill.style.width = '0%';
    setTimeout(() => fill.style.width = rankData.percent + '%', 300);

    const diffEl = document.getElementById('time-diff');
    if(rankData.isMax) {
        diffEl.innerText = "Норматив МСМК выполнен!";
        diffEl.style.color = "#34c759";
    } else {
        diffEl.innerText = `До ${rankData.next}: -${rankData.gap} сек`;
        diffEl.style.color = "var(--accent)";
    }

    document.getElementById('res-dist').innerText = state.distance + 'м';
    document.getElementById('res-style').innerText = STYLE_NAMES[state.style].split(' ')[0];
    document.getElementById('res-pool').innerText = state.pool + 'м';
    document.getElementById('res-time').innerText = timeStr;

    // Открытие
    document.getElementById('result-sheet').classList.add('active');
    document.getElementById('overlay').classList.add('active');
    tg.HapticFeedback.notificationOccurred('success');
}

function closeSheet() {
    document.getElementById('result-sheet').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
    document.getElementById('result-sheet').style.transform = '';
}
