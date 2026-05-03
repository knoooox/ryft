/**
 * ============================================================================
 * RYFT: CALCULATOR & NORMS MODULE (LIQUID GLASS EDITION)
 * Вся математика очков FINA, реверсивный расчет и генерация нормативов.
 * Внедрены каскадные анимации нормативов, 3D-рефлоу и пульсация очков.
 * ============================================================================
 */

const CalcModule = {
    // Инициализация 3D-барабанов для выбора стиля и дистанции
    initWheels() {
        if (this.stylePicker) this.stylePicker = null;
        if (this.distPicker) this.distPicker = null;

        const orientation = this.localSettings.wheelStyle;

        if (this.dom.wheelsContainer) {
            this.dom.wheelsContainer.classList.toggle('vertical', orientation === 'vertical');
        }

        this.stylePicker = new WheelPicker('style-scroll', [
            {label: LABELS.freestyle, value: 'freestyle'}, {label: LABELS.backstroke, value: 'backstroke'},
            {label: LABELS.breaststroke, value: 'breaststroke'}, {label: LABELS.butterfly, value: 'butterfly'},
            {label: LABELS.medley, value: 'medley'}
        ], (val) => {
            this.state.style = val;
            this.updateDistances({ smooth: true, pulse: true });
            this.calculate();
            this.haptic('light');
        }, orientation);

        this.distPicker = new WheelPicker('dist-scroll', [], (val) => {
            this.state.dist = val;
            this.calculate();
            this.haptic('light');
        }, orientation);
    },

    // Обновление списка доступных дистанций при смене стиля
    updateDistances(options = {}) {
        if (!DB) return;
        const { smooth = true, allowScrollAnchor = true, pulse = false } = options;
        const distances = Object.keys(DB[this.state.gender][this.state.pool][this.state.style]).sort((a,b) => parseInt(a) - parseInt(b));

        // Ищем ближайшую дистанцию, если старая недоступна
        if (!distances.includes(this.state.dist)) {
            let oldDist = parseInt(this.state.dist) || 0;
            this.state.dist = distances.reduce((prev, curr) => Math.abs(parseInt(curr) - oldDist) < Math.abs(parseInt(prev) - oldDist) ? curr : prev);
        }

        const items = distances.map(d => ({label: `${d} м`, value: d}));
        if (this.distPicker) this.distPicker.updateItems(items, { preferredValue: this.state.dist, smooth, emitChange: true, pulse });
        if (allowScrollAnchor && this.isSheetOpen) this.refreshSheet({ align: true });
    },

    // Настройка полей ввода времени (переключение фокуса, форматирование)
    setupInputs() {
        const inputs = [this.dom.inpMin, this.dom.inpSec, this.dom.inpMs];
        const wrapper = document.querySelector('.time-input-wrapper');

        inputs.forEach((el, idx) => {
            if (!el) return;

            // ПРЕМИАЛЬНЫЙ ФОКУС: Подсветка контейнера ввода при клике
            el.addEventListener('focus', () => {
                if(wrapper) {
                    wrapper.style.borderColor = 'rgba(255, 255, 255, 0.46)';
                    wrapper.style.boxShadow = '0 0 0 4px rgba(255, 255, 255, 0.08), inset 0 2px 10px rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.5)';
                }
            });
            el.addEventListener('blur', () => {
                if(wrapper) {
                    wrapper.style.borderColor = 'var(--glass-border)';
                    wrapper.style.boxShadow = 'inset 0 2px 10px rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.5)';
                }
            });

            el.addEventListener('input', (e) => {
                this.isReverseModeActive = false;
                let val = e.target.value.replace(/[^0-9]/g, '');
                if (idx === 1 && parseInt(val) > 59) val = '59';
                e.target.value = val;

                // Умный перескок фокуса
                if (val.length >= 2 && idx < 2) inputs[idx+1].focus();

                this.calculate();
            });

            el.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value === '' && idx > 0) inputs[idx-1].focus();
            });
        });
    },

    // Главный расчет очков FINA
    calculate() {
        if (!DB) return;
        const data = DB[this.state.gender]?.[this.state.pool]?.[this.state.style]?.[this.state.dist];
        if (!data) return;

        // Если включен реверсивный режим (очки -> время)
        if (this.isReverseModeActive && this.targetReversePoints > 0 && data.rec) {
            const record = data.rec;
            const target = this.targetReversePoints;
            let timeInSec = Math.round((record / Math.pow(target / 1000, 1/3)) * 100) / 100;

            const getP = (t) => Math.floor(1000 * Math.pow(record / t, 3));
            let loops = 0;
            while (getP(timeInSec) < target && loops++ < 50) timeInSec = Math.round((timeInSec - 0.01) * 100) / 100;
            loops = 0;
            while (getP(timeInSec + 0.01) >= target && loops++ < 50) timeInSec = Math.round((timeInSec + 0.01) * 100) / 100;

            const m = Math.floor(timeInSec / 60);
            const s = Math.floor(timeInSec % 60);
            const ms = Math.round((timeInSec - Math.floor(timeInSec)) * 100);

            if(this.dom.inpMin) this.dom.inpMin.value = m > 0 ? m.toString().padStart(2, '0') : '';
            if(this.dom.inpSec) this.dom.inpSec.value = s.toString().padStart(2, '0');
            if(this.dom.inpMs) this.dom.inpMs.value = ms.toString().padStart(2, '0');
        }

        const min = parseInt(this.dom.inpMin?.value) || 0;
        const sec = parseInt(this.dom.inpSec?.value) || 0;
        const ms = parseInt(this.dom.inpMs?.value) || 0;
        const totalSeconds = (min * 60) + sec + (ms / 100);
        const record = data.rec;

        // Вывод мирового рекорда
        const rM = Math.floor(record / 60);
        const rS = Math.floor(record % 60);
        const rMS = Math.round((record - Math.floor(record)) * 100);
        if (this.dom.worldRecord) this.dom.worldRecord.innerText = `WORLD RECORD: ${rM > 0 ? rM + ':' : ''}${rS.toString().padStart(2, '0')}.${rMS.toString().padStart(2, '0')}`;

        if (totalSeconds === 0) {
            this.lastPoints = 0;
            this.updateDisplay(0, UI_TEXT.noData);
            if (this.isSheetOpen) this.refreshSheet({ align: false });
            return;
        }

        // Формула FINA
        let points = Math.floor(1000 * Math.pow(record / totalSeconds, 3));
        points = Math.max(0, Math.min(points, 1199));

        // Определение разряда
        let rank = UI_TEXT.noRank;
        for (let r of RANKS) {
            if (totalSeconds <= data[r]) { rank = LABELS[r]; break; }
        }

        this.lastPoints = points;
        this.updateDisplay(points, rank);
        if (this.isSheetOpen) this.refreshSheet({ align: false });
    },

    updateDisplay(points, rank) {
        if (!this.dom.finaValue || !this.dom.rankBadge) return;
        const start = parseInt(this.dom.finaValue.innerText) || 0;

        if (start !== points) {
            if(this.animateValue) this.animateValue(this.dom.finaValue, start, points, 500);
            else this.dom.finaValue.innerText = points;

            // ПРЕМИАЛЬНАЯ ПУЛЬСАЦИЯ: Микро-анимация при смене очков
            this.dom.finaValue.style.transform = 'scale(1.05)';
            this.dom.finaValue.style.filter = 'drop-shadow(0 20px 50px rgba(255, 255, 255, 0.22))';
            setTimeout(() => {
                this.dom.finaValue.style.transform = 'scale(1)';
                this.dom.finaValue.style.filter = 'drop-shadow(0 15px 40px rgba(255, 255, 255, 0.14))';
            }, 150);
        }

        this.dom.rankBadge.innerText = rank;
        this.dom.rankBadge.classList.toggle('active', rank !== UI_TEXT.noRank && rank !== UI_TEXT.noData);
    },

    clearInputs() {
        this.isReverseModeActive = false;
        if(this.dom.inpMin) this.dom.inpMin.value = '';
        if(this.dom.inpSec) this.dom.inpSec.value = '';
        if(this.dom.inpMs) this.dom.inpMs.value = '';
        this.calculate(); this.haptic('success');
    },

    enableReverseMode() {
        if(!this.dom.finaValue || !this.dom.finaInput) return;

        // Плавный переход в реверсивный режим
        this.dom.finaValue.style.opacity = '0';
        setTimeout(() => {
            this.dom.finaValue.style.display = 'none';
            this.dom.finaInput.style.display = 'inline-block';
            let currentVal = this.dom.finaValue.innerText;
            this.dom.finaInput.value = (currentVal === '0') ? '' : currentVal;
            this.dom.finaInput.style.opacity = '1';
            this.dom.finaInput.focus();
        }, 150);
        this.haptic('selection');
    },

    confirmReverseCalc() {
        if(!this.dom.finaInput || !this.dom.finaValue) return;
        const valStr = this.dom.finaInput.value.replace(/[^0-9]/g, '');
        const targetPoints = parseInt(valStr);

        this.dom.finaInput.style.opacity = '0';
        setTimeout(() => {
            this.dom.finaInput.style.display = 'none';
            this.dom.finaValue.style.display = 'inline-block';
            this.dom.finaValue.style.opacity = '1';

            if (!valStr || isNaN(targetPoints) || targetPoints <= 0) {
                this.dom.finaValue.innerText = this.lastPoints || 0; return;
            }
            this.isReverseModeActive = true; this.targetReversePoints = targetPoints;
            this.calculate();
        }, 150);
        this.haptic('success');
    },

    // --- ЛОГИКА ШТОРКИ НОРМАТИВОВ ---

    getRankState(data, userTime) {
        const achieved = RANKS.filter(r => userTime > 0 && userTime <= data[r]);
        const achievedRank = achieved.length ? achieved[0] : null;
        const achievedIndex = achievedRank ? RANKS.indexOf(achievedRank) : -1;
        let nextIndex = (userTime > 0 && achievedIndex > 0) ? achievedIndex - 1 : (userTime > 0 && achievedIndex === -1 ? RANKS.length - 1 : -1);
        return { achievedRank, achievedIndex, nextRank: nextIndex >= 0 ? RANKS[nextIndex] : null, nextIndex };
    },

    getProgressWidth(userTime, data, rankState) {
        if (userTime <= 0 || !rankState.nextRank) return 0;
        const tIndex = rankState.nextIndex; const tTime = data[rankState.nextRank];
        const lowerBound = tIndex < RANKS.length - 1 ? data[RANKS[tIndex + 1]] : tTime * 1.18;
        const range = Math.max(0.01, lowerBound - tTime);
        return Math.max(0, Math.min(100, ((lowerBound - userTime) / range) * 100));
    },

    buildNormRows() {
        if (!DB) return {};
        const data = DB[this.state.gender]?.[this.state.pool]?.[this.state.style]?.[this.state.dist];
        if(!data) return {};

        const userTime = (parseInt(this.dom.inpMin?.value) || 0) * 60 + (parseInt(this.dom.inpSec?.value) || 0) + (parseInt(this.dom.inpMs?.value) || 0) / 100;
        const rankState = this.getRankState(data, userTime);

        if(this.dom.sheetSub) this.dom.sheetSub.innerText = `${UI_TEXT[this.state.gender]} • ${this.state.pool} М • ${LABELS[this.state.style]} • ${this.state.dist} М`;

        const fragment = document.createDocumentFragment();
        let anchorRow = null;
        let index = 0;

        RANKS.forEach((r) => {
            if (this.localSettings.hiddenRanks.includes(r)) return;

            const time = data[r];
            const isDone = rankState.achievedRank === r;
            const isNext = rankState.nextRank === r;
            const row = document.createElement('div');

            // КАСКАДНАЯ АНИМАЦИЯ (Stagger effect) для строк нормативов
            row.className = `norm-row ${isDone ? 'achieved' : ''} ${isNext ? 'next-goal' : ''}`;
            row.style.opacity = '0';
            row.style.animation = `fadeInUp 0.5s var(--ease-spring) forwards`;
            row.style.animationDelay = `${index * 0.05}s`;

            let tM = Math.floor(time / 60); let tS = Math.floor(time % 60); let tMS = Math.round((time - Math.floor(time)) * 100);
            const timeStr = `${tM > 0 ? tM + ':' : ''}${tS.toString().padStart(2, '0')}.${tMS.toString().padStart(2, '0')}`;
            const progress = this.getProgressWidth(userTime, data, rankState);

            row.innerHTML = `
                <div style="width:100%">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap: 8px;">
                        <span class="norm-rank">${LABELS[r]}</span>
                        <span class="norm-time">${timeStr}</span>
                    </div>
                    ${isNext ? `<div class="norm-progress"><div class="progress-fill" style="width: ${progress}%; box-shadow: 0 0 10px rgba(255,255,255,0.35);"></div></div>` : ''}
                </div>`;

            if ((!userTime && r === 'iii') || (userTime > 0 && isDone)) anchorRow = row;
            fragment.appendChild(row);
            index++;
        });

        if(this.dom.normsList) {
            requestAnimationFrame(() => {
                this.dom.normsList.innerHTML = '';
                this.dom.normsList.appendChild(fragment);
            });
        }
        return { anchorRow };
    },

    refreshSheet(options = {}) {
        if (!this.isSheetOpen || !this.dom.normsList) return;
        const prevScrollTop = this.dom.normsList.scrollTop;
        const { anchorRow } = this.buildNormRows();
        if (options.align && anchorRow) requestAnimationFrame(() => anchorRow.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        else this.dom.normsList.scrollTop = prevScrollTop;
    },

    openSheet() {
        this.buildNormRows(); 
        requestAnimationFrame(() => {
            if(this.dom.sheet) this.dom.sheet.classList.add('active'); 
            if(this.dom.backdrop) this.dom.backdrop.classList.add('active');
            if(this.dom.normsList) this.dom.normsList.scrollTo({ top: 0, behavior: 'instant' });
        });
        this.isSheetOpen = true;
        this.haptic('medium');
    },

    closeSheet() {
        this.isSheetOpen = false; 
        requestAnimationFrame(() => {
            if(this.dom.sheet) {
                this.dom.sheet.classList.remove('active');
                this.dom.sheet.style.transform = ''; 
            }
            if(this.dom.backdrop) this.dom.backdrop.classList.remove('active');
        });
        this.sheetTranslateY = 0;
    }, 

    setupSheetGesture() {
        if(!this.dom.sheet) return;
        const handle = this.dom.sheet.querySelector('.sheet-handle');
        if(!handle) return;
        
        const canStartDrag = (target) => this.isSheetOpen && (target.closest('.sheet-handle') || (target.closest('.sheet-scroll') && this.dom.normsList.scrollTop <= 0));

        const start = (y, target) => {
            if (!canStartDrag(target)) return;
            this.isSheetDragging = true; this.sheetDragStartY = y;
            this.dom.sheet.classList.add('dragging');
        };

        const move = (y) => {
            if (!this.isSheetDragging) return;
            requestAnimationFrame(() => {
                const rawDelta = Math.max(0, y - this.sheetDragStartY);
                this.sheetTranslateY = rawDelta > 140 ? 140 + (rawDelta - 140) * 0.35 : rawDelta;
                this.dom.sheet.style.transform = `translateY(${this.sheetTranslateY}px)`;
            });
        };

        const end = () => {
            if (!this.isSheetDragging) return;
            this.isSheetDragging = false;
            this.dom.sheet.classList.remove('dragging');
            if (this.sheetTranslateY > 110) this.closeSheet();
            else { this.sheetTranslateY = 0; this.dom.sheet.style.transform = ''; this.dom.sheet.classList.add('active'); }
        };

        this.dom.sheet.addEventListener('touchstart', (e) => start(e.touches[0].clientY, e.target), { passive: true });
        document.addEventListener('touchmove', (e) => move(e.touches[0].clientY), { passive: true });
        document.addEventListener('touchend', end);
        handle.addEventListener('mousedown', (e) => start(e.clientY, e.target));
        document.addEventListener('mousemove', (e) => move(e.clientY));
        document.addEventListener('mouseup', end);
        if(this.dom.backdrop) this.dom.backdrop.addEventListener('click', () => { if (this.isSheetOpen) this.closeSheet(); });
    }
};
