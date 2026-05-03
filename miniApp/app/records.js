/**
 * ============================================================================
 * RYFT: RECORDS MODULE (LIQUID GLASS EDITION)
 * Управление личными рекордами, умный парсинг дат, расчет FINA "на лету".
 * Внедрены скелетные загрузки, каскадные анимации и фокус-стейты.
 * ============================================================================
 */

const recordsApp = {
    state: {
        pool: '25',
        style: 'freestyle',
        data: [],
        isEditMode: false,
        coachSelectedAthleteId: null
    },
    dom: {},
    dragStartY: 0,
    translateY: 0,
    isDragging: false,

    get tg() { return window.Telegram?.WebApp; },

    init() {
        this.dom = {
            sheet: document.getElementById('records-sheet'),
            backdrop: document.getElementById('records-backdrop'),
            list: document.getElementById('records-list'),
            btnStyle: document.getElementById('rec-btn-style'),
            dispStyle: document.getElementById('rec-disp-style'),
            btnEdit: document.getElementById('rec-btn-edit'),
            poolSwitch: document.getElementById('rec-pool-switch')
        };
        this.setupGestures();
        this.injectDynamicStyles();
    },

    // Динамические стили для анимаций внутри шторки
    injectDynamicStyles() {
        if (document.getElementById('ryft-rec-dynamic-styles')) return;
        const style = document.createElement('style');
        style.id = 'ryft-rec-dynamic-styles';
        style.innerHTML = `
            @keyframes recCardFadeUp {
                from { opacity: 0; transform: translateY(20px) scale(0.95); filter: blur(5px); }
                to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
            }
            .rec-card {
                animation: recCardFadeUp 0.5s var(--ease-bounce) forwards;
                opacity: 0; /* Стартовое состояние для каскада */
            }

            /* Минимализм для пустых карточек */
            .rec-card.is-empty:not(.edit-mode) { padding: 16px 20px !important; gap: 0 !important; }
            .rec-card.is-empty:not(.edit-mode) .rec-card-header { border-bottom: none !important; padding-bottom: 0 !important; }
            .rec-card.is-empty:not(.edit-mode) .rec-badges { display: none !important; }
            .rec-empty-text { display: none; font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 1px; }
            .rec-card.is-empty:not(.edit-mode) .rec-empty-text { display: block; }
            .rec-card.is-empty.edit-mode .rec-empty-text { display: none; }
        `;
        document.head.appendChild(style);
    },

    open() {
        this.state.coachSelectedAthleteId = null;
        this.fetchRecords();

        requestAnimationFrame(() => {
            this.dom.sheet.classList.add('active');
            this.dom.backdrop.classList.add('active');
            this.dom.list.scrollTop = 0;
        });

        this.state.isEditMode = false;
        this.updateEditButtonUI();
        if (typeof app !== 'undefined') app.haptic('medium');
    },

    close() {
        requestAnimationFrame(() => {
            this.dom.sheet.classList.remove('active');
            this.dom.backdrop.classList.remove('active');
            this.dom.sheet.style.transform = '';
        });
        this.state.isEditMode = false;
        this.updateEditButtonUI();
        this.translateY = 0;
    },

    setPool(val) {
        if (this.state.pool === val) return;
        this.state.pool = val;

        if (typeof app !== 'undefined') app.animateSwitch('rec-pool-switch', val === '50');

        if (this.state.style === 'medley' && val === '50') {
            this.setStyle('freestyle');
        } else {
            this.renderRecords();
        }
    },

    setStyle(val) {
        this.state.style = val;
        const labels = { freestyle: "Вольный", backstroke: "На спине", breaststroke: "Брасс", butterfly: "Баттерфляй", medley: "Комплекс" };
        this.dom.dispStyle.innerText = labels[val] || "Стиль";

        const backdrop = document.getElementById('s-backdrop');
        const sheet = document.getElementById('s-sheet');
        if (backdrop) backdrop.classList.remove('active');
        if (sheet) sheet.classList.remove('active');

        this.renderRecords();
        this.dom.btnStyle?.classList.remove('is-open');
    },

    openStyleSelect() {
        const backdrop = document.getElementById('s-backdrop');
        const sheet = document.getElementById('s-sheet');
        const title = document.getElementById('s-title');
        const list = document.getElementById('s-list');

        if (!backdrop || !sheet || !list) return;

        if (title) title.innerText = "Выберите стиль";
        list.innerHTML = '';

        const styles = [
            { id: 'freestyle', name: 'Вольный' },
            { id: 'backstroke', name: 'На спине' },
            { id: 'breaststroke', name: 'Брасс' },
            { id: 'butterfly', name: 'Баттерфляй' },
            { id: 'medley', name: 'Комплекс' }
        ];

        styles.forEach(st => {
            if (this.state.pool === '50' && st.id === 'medley') return;

            const div = document.createElement('div');
            div.className = `s-sheet-item ${st.id === this.state.style ? 'selected' : ''}`;
            div.innerText = st.name;
            div.onclick = () => {
                this.setStyle(st.id);
                if (typeof app !== 'undefined') app.haptic('selection');
            };
            list.appendChild(div);
        });

        this.dom.btnStyle?.classList.add('is-open');
        requestAnimationFrame(() => { backdrop.classList.add('active'); sheet.classList.add('active'); });
        if (typeof app !== 'undefined') app.haptic('light');
    },

    toggleEdit() {
        if (typeof app !== 'undefined' && app.isViewerMode) {
            this.tg?.showAlert("Вы не можете редактировать чужие рекорды.");
            return;
        }

        this.state.isEditMode = !this.state.isEditMode;
        if (typeof app !== 'undefined') app.haptic('light');

        this.updateEditButtonUI();

        const cards = this.dom.list.querySelectorAll('.rec-card');
        cards.forEach(card => {
            if (this.state.isEditMode) {
                card.classList.add('edit-mode');
            } else {
                card.classList.remove('edit-mode');
            }
        });
    },

    updateEditButtonUI() {
        const isViewer = (typeof app !== 'undefined' && app.isViewerMode);
        if (!this.dom.btnEdit) return;

        if (isViewer) {
            this.dom.btnEdit.style.display = 'none';
        } else {
            this.dom.btnEdit.style.display = 'flex';
            if (this.state.isEditMode) {
                this.dom.btnEdit.classList.add('active');
            } else {
                this.dom.btnEdit.classList.remove('active');
            }
        }
    },

    async fetchRecords() {
        let targetId = this.tg?.initDataUnsafe?.user?.id;

        if (typeof app !== 'undefined' && app.isViewerMode) {
            targetId = app.viewingUserId;
        } else if (this.state.coachSelectedAthleteId) {
            targetId = this.state.coachSelectedAthleteId;
        }

        if (!targetId) return;

        // Премиальный скелетный лоадер вместо крутилки
        this.dom.list.innerHTML = `
            <div class="rec-card skeleton-loading" style="height: 100px; border-color: transparent;"></div>
            <div class="rec-card skeleton-loading" style="height: 100px; border-color: transparent; animation-delay: 0.1s;"></div>
            <div class="rec-card skeleton-loading" style="height: 100px; border-color: transparent; animation-delay: 0.2s;"></div>
        `;

        try {
            const res = await fetch(`${typeof API_URL !== 'undefined' ? API_URL : 'https://app.ryft-official.ru/api'}/records/${targetId}?t=${Date.now()}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();

            if (data.is_hidden && typeof app !== 'undefined' && app.isViewerMode) {
                this.dom.list.innerHTML = `
                    <div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <div style="font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 8px;">Рекорды скрыты</div>
                        <div style="font-size: 14px;">Пользователь ограничил доступ к своим результатам</div>
                    </div>`;
                return;
            }

            this.state.data = data.records || data || [];
            this.renderRecords();
        } catch (e) {
            this.dom.list.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--danger); font-weight: 800; font-size: 14px;">ОШИБКА ЗАГРУЗКИ</div>';
        }
    },

    renderRecords() {
        if (!this.dom.list) return;
        this.dom.list.innerHTML = '';

        let distances = this.state.style === 'medley' && this.state.pool === '50'
            ? ['200', '400']
            : ['50', '100', '200', '400', '800', '1500'];

        if (this.state.style === 'medley' && this.state.pool === '25') {
            distances = ['100', '200', '400'];
        }

        const fragment = document.createDocumentFragment();

        distances.forEach((dist, index) => {
            const record = this.state.data.find(r => r.pool === this.state.pool && r.style === this.state.style && r.distance === parseInt(dist));
            const el = this.createRecordElement(dist, record, index); // Передаем индекс для задержки анимации
            if (el) fragment.appendChild(el);
        });

        if (!fragment.childNodes.length) {
            this.dom.list.innerHTML = `
                <div class="search-empty" style="padding-top: 48px;">
                    <div style="font-size: 15px; color: var(--text-main); margin-bottom: 6px;">Нет записей</div>
                    <div style="font-size: 11px;">Для выбранного стиля пока нет рекордов</div>
                </div>`;
            return;
        }

        this.dom.list.appendChild(fragment);
    },

    createRecordElement(dist, record, index) {
        const isViewer = (typeof app !== 'undefined' && app.isViewerMode);

        if (isViewer && !record && typeof app !== 'undefined' && app.cachedProfileData?.hide_empty_records) {
            return null;
        }

        const div = document.createElement('div');
        div.className = `rec-card ${record ? 'has-data' : 'is-empty'} ${this.state.isEditMode ? 'edit-mode' : ''}`;

        // Добавляем каскадную задержку анимации (Stagger effect)
        div.style.animationDelay = `${index * 0.05}s`;

        const finaPoints = record ? this.calculateFina(this.state.style, parseInt(dist), record.best_time) : 0;

        let m = '', s = '', ms = '';
        if (record && record.best_time) {
            m = Math.floor(record.best_time / 60); m = m > 0 ? m : '';
            s = Math.floor(record.best_time % 60).toString().padStart(2, '0');
            ms = Math.round((record.best_time % 1) * 100).toString().padStart(2, '0');
        }

        div.innerHTML = `
            <div class="rec-card-header">
                <span class="rec-dist">${dist} м</span>
                <div class="rec-badges">
                    ${record ? `<span class="rec-fina">${finaPoints} FINA</span>` : '<span class="rec-empty-badge">Ввести время</span>'}
                </div>
                <span class="rec-empty-text">Нет результата</span>
            </div>

            ${record ? `
            <div class="rec-card-body">
                <div class="rec-col" style="align-items: flex-start;">
                    <span class="rec-label">Лучшее</span>
                    <span class="rec-time">${this.formatTimeDisplay(record.best_time)}</span>
                    <span class="rec-date">${record.date_best || '--.--.----'}</span>
                </div>
                <div class="rec-col" style="align-items: flex-end;">
                    <span class="rec-label">Последнее</span>
                    <span class="rec-time" style="color: var(--text-secondary);">${record.last_time ? this.formatTimeDisplay(record.last_time) : '--:--.--'}</span>
                </div>
            </div>` : ''}

            <div class="rec-edit-wrapper">
                <div class="rec-edit-block">
                    <div class="rec-edit-inputs-col">
                        <div class="rec-time-inputs">
                            <input type="tel" class="rec-time-field" id="rec-min-${dist}" placeholder="00" maxlength="2" value="${m}">
                            <div class="rec-time-div">:</div>
                            <input type="tel" class="rec-time-field" id="rec-sec-${dist}" placeholder="00" maxlength="2" value="${s}">
                            <div class="rec-time-div">.</div>
                            <input type="tel" class="rec-time-field" id="rec-ms-${dist}" placeholder="00" maxlength="2" value="${ms}">
                        </div>
                        
                    </div>

                    <button class="rec-save-btn" onclick="recordsApp.saveRecord('${dist}')">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </button>

                    ${record ? `
                    <button class="icon-btn-circular" style="background: rgba(255,59,48,0.15); border-color: rgba(255,59,48,0.3); color: var(--danger); width: 44px; height: 44px; flex-shrink: 0;" onclick="recordsApp.deleteRecord('${dist}')">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>` : ''}
                </div>
            </div>
        `;

        // Настройка умных инпутов времени (перескок фокуса)
        const iMin = div.querySelector(`#rec-min-${dist}`);
        const iSec = div.querySelector(`#rec-sec-${dist}`);
        const iMs = div.querySelector(`#rec-ms-${dist}`);

        const setupTimeInput = (el, nextEl, prevEl) => {
            if (!el) return;
            el.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^\d]/g, '');
                if (e.target.value.length >= 2 && nextEl) nextEl.focus();
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value === '' && prevEl) prevEl.focus();
            });

            // Премиальный фокус: затемнение остального экрана при вводе
            el.addEventListener('focus', () => { div.classList.add('input-focused'); });
            el.addEventListener('blur', () => { div.classList.remove('input-focused'); });
        };

        setupTimeInput(iMin, iSec, null);
        setupTimeInput(iSec, iMs, iMin);
        setupTimeInput(iMs, null, iSec);


        return div;
    },

    async saveRecord(dist) {
        const minStr = document.getElementById(`rec-min-${dist}`)?.value || '0';
        const secStr = document.getElementById(`rec-sec-${dist}`)?.value || '0';
        const msStr = document.getElementById(`rec-ms-${dist}`)?.value || '0';
let dateStr = this.formatDate(new Date().toLocaleDateString('ru-RU'));

        const m = parseInt(minStr) || 0;
        const s = parseInt(secStr) || 0;
        const ms = parseInt(msStr) || 0;

        const totalSeconds = (m * 60) + s + (ms / 100);

        if (totalSeconds <= 0) {
            this.tg?.showAlert("Введите корректное время!");
            return;
        }


        if (typeof app !== 'undefined') app.haptic('medium');

        const userId = this.tg?.initDataUnsafe?.user?.id;
        if (!userId) return;

        const payload = {
            user_id: userId,
            pool: this.state.pool,
            style: this.state.style,
            distance: parseInt(dist),
            time: totalSeconds,
            date: dateStr
        };

        try {
            const res = await fetch(`${typeof API_URL !== 'undefined' ? API_URL : 'https://app.ryft-official.ru/api'}/records/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (typeof app !== 'undefined') app.haptic('success');
                this.state.isEditMode = false; 
                this.updateEditButtonUI();
                this.fetchRecords(); 
            } else {
                this.tg?.showAlert("Ошибка сохранения.");
            }
        } catch (e) {
            this.tg?.showAlert("Ошибка сети.");
        }
    },

    async deleteRecord(dist) {
        this.tg?.showConfirm(`Удалить рекорд на ${dist}м?`, async (confirm) => {
            if (!confirm) return;

            const userId = this.tg?.initDataUnsafe?.user?.id;
            if (!userId) return;
            
            if (typeof app !== 'undefined') app.haptic('medium');

            try {
                const res = await fetch(`${typeof API_URL !== 'undefined' ? API_URL : 'https://app.ryft-official.ru/api'}/records/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        pool: this.state.pool,
                        style: this.state.style,
                        distance: parseInt(dist)
                    })
                });

                if (res.ok) {
                    if (typeof app !== 'undefined') app.haptic('success');
                    this.fetchRecords();
                }
            } catch (e) {}
        });
    },

    calculateFina(style, distance, timeInSeconds) {
        if (typeof DB === 'undefined' || !DB) return 0;
        const gender = (typeof app !== 'undefined') ? app.state.gender : 'male';
        const data = DB[gender]?.[this.state.pool]?.[style]?.[distance.toString()];
        if (!data || !data.rec || !timeInSeconds) return 0;
        let points = Math.floor(1000 * Math.pow(data.rec / timeInSeconds, 3));
        return Math.max(0, Math.min(points, 1199));
    },

    formatTimeDisplay(totalSeconds) {
        if (!totalSeconds) return '--:--.--';
        const m = Math.floor(totalSeconds / 60);
        const s = Math.floor(totalSeconds % 60);
        const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 100);
        return `${m > 0 ? m.toString().padStart(2, '0') + ':' : ''}${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    },

    formatDate(dateStr) {
        if (!dateStr || dateStr.trim() === '') return '';
        let clean = dateStr.replace(/[^\d]/g, '');
        if (clean.length !== 8 && clean.length !== 6 && clean.length !== 4) return "Error";
        
        let d, m, y;
        const currentYear = new Date().getFullYear();
        const currentCentury = Math.floor(currentYear / 100) * 100;
        
        if (clean.length === 8) {
            d = parseInt(clean.slice(0, 2)); m = parseInt(clean.slice(2, 4)); y = parseInt(clean.slice(4, 8));
        } else if (clean.length === 6) {
            d = parseInt(clean.slice(0, 2)); m = parseInt(clean.slice(2, 4)); 
            let shortY = parseInt(clean.slice(4, 6));
            y = (shortY <= currentYear % 100) ? currentCentury + shortY : currentCentury - 100 + shortY;
        } else if (clean.length === 4) {
            d = parseInt(clean.slice(0, 2)); m = parseInt(clean.slice(2, 4)); y = currentYear;
        }

        if (m < 1 || m > 12 || d < 1 || d > 31 || y > currentYear || y < 1920) return "Error";
        return `${d.toString().padStart(2, '0')}.${m.toString().padStart(2, '0')}.${y}`;
    },

    setupGestures() {
        if(!this.dom.sheet) return;
        const handle = this.dom.sheet.querySelector('.sheet-handle');
        if(!handle) return;
        
        const canStartDrag = (target) => {
            return this.dom.sheet.classList.contains('active') && 
                   (target.closest('.sheet-handle') || (this.dom.list && this.dom.list.scrollTop <= 0));
        };

        const start = (y, target) => {
            if (!canStartDrag(target)) return;
            this.isDragging = true;
            this.dragStartY = y;
            this.dom.sheet.classList.add('dragging');
        };

        const move = (y) => {
            if (!this.isDragging) return;
            requestAnimationFrame(() => {
                const rawDelta = Math.max(0, y - this.dragStartY);
                this.translateY = rawDelta > 140 ? 140 + (rawDelta - 140) * 0.35 : rawDelta;
                this.dom.sheet.style.transform = `translateY(${this.translateY}px)`;
            });
        };

        const end = () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.dom.sheet.classList.remove('dragging');
            if (this.translateY > 110) {
                this.close();
            } else { 
                this.translateY = 0; 
                this.dom.sheet.style.transform = ''; 
            }
        };

        this.dom.sheet.addEventListener('touchstart', (e) => start(e.touches[0].clientY, e.target), { passive: true });
        document.addEventListener('touchmove', (e) => move(e.touches[0].clientY), { passive: true });
        document.addEventListener('touchend', end);
        handle.addEventListener('mousedown', (e) => start(e.clientY, e.target));
        document.addEventListener('mousemove', (e) => move(e.clientY));
        document.addEventListener('mouseup', end);
    }
};

window.addEventListener('load', () => recordsApp.init());
