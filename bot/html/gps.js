/**
 * ============================================================================
 * RYFT: GPS MODULE (LIQUID GLASS EDITION)
 * Управление таблицами ГПС, расчет пульсовых зон и доступ тренера.
 * Добавлены скелетные лоадеры, каскадные анимации и премиальные пустые стейты.
 * ============================================================================
 */

const gpsApp = {
    state: {
        distance: '50',
        profile: null,
        times: {},
        hasData: false,
        coachSelectedAthleteId: null
    },
    dom: {},
    dragStartY: 0,
    translateY: 0,
    isDragging: false,

    get tg() { return window.Telegram?.WebApp; },

    init() {
        this.dom = {
            sheet: document.getElementById('gps-sheet'),
            backdrop: document.getElementById('gps-backdrop'),
            list: document.getElementById('gps-list'),
            btnDist: document.getElementById('gps-btn-dist'),
            dispDist: document.getElementById('gps-disp-dist'),
            headerInfo: document.getElementById('gps-header-info')
        };
        this.setupGestures();
    },

    async open() {
        this.state.coachSelectedAthleteId = null;

        requestAnimationFrame(() => {
            this.dom.sheet.classList.add('active');
            this.dom.backdrop.classList.add('active');
            this.dom.list.scrollTop = 0;
        });

        if (typeof app !== 'undefined') app.haptic('medium');

        await this.fetchData();
    },

    close() {
        requestAnimationFrame(() => {
            this.dom.sheet.classList.remove('active');
            this.dom.backdrop.classList.remove('active');
            this.dom.sheet.style.transform = '';
        });
        this.translateY = 0;
    },

    async fetchData() {
        // ПРЕМИАЛЬНЫЙ СКЕЛЕТНЫЙ ЛОАДЕР
        this.dom.headerInfo.innerHTML = '';
        this.dom.list.innerHTML = `
            <div style="padding: 0 24px 20px; animation: fadeInUp 0.4s var(--ease-spring) forwards;">
                <div class="gps-cards-scroll" style="margin: 0 -24px; padding: 0 24px;">
                    <div class="gps-card-mini skeleton-loading" style="height: 85px; min-width: 140px; border-color: transparent;"></div>
                    <div class="gps-card-mini skeleton-loading" style="height: 85px; min-width: 140px; border-color: transparent; animation-delay: 0.1s;"></div>
                    <div class="gps-card-mini skeleton-loading" style="height: 85px; min-width: 140px; border-color: transparent; animation-delay: 0.2s;"></div>
                </div>
                <div class="gps-table skeleton-loading" style="height: 250px; border-color: transparent; margin: 20px 0 0 0; border-radius: var(--radius-xl); animation-delay: 0.3s;"></div>
            </div>
        `;

        const currentUserId = this.tg?.initDataUnsafe?.user?.id;
        let targetId = currentUserId;

        if (typeof app !== 'undefined' && app.isViewerMode) {
            targetId = app.viewingUserId;
        } else if (this.state.coachSelectedAthleteId) {
            targetId = this.state.coachSelectedAthleteId;
        }

        if (!targetId) return;

        try {
            if (this.dom.headerInfo) this.dom.headerInfo.style.display = 'block';
            if (this.dom.btnDist) this.dom.btnDist.style.display = 'flex';

            const response = await fetch(`${API_URL}/gps/${targetId}?viewer_id=${currentUserId}&t=${Date.now()}`);
            if (!response.ok) throw new Error("HTTP error " + response.status);

            const data = await response.json();

            // СОСТОЯНИЕ: ДОСТУП ЗАКРЫТ
            if (data.status === 'hidden') {
                if (this.dom.headerInfo) this.dom.headerInfo.style.display = 'none';
                if (this.dom.btnDist) this.dom.btnDist.style.display = 'none';

                this.dom.list.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-top: 100px; animation: fadeInUp 0.5s var(--ease-spring) forwards; opacity: 0;">
                        <span style="font-size: 64px; margin-bottom: 24px; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.4));">🔒</span>
                        <span style="font-size: 16px; font-weight: 900; color: #fff; letter-spacing: 0.5px; margin-bottom: 8px;">ДОСТУП ЗАКРЫТ</span>
                        <span style="font-size: 14px; font-weight: 500; color: var(--text-secondary); line-height: 1.5;">Спортсмен ограничил доступ<br>к своей таблице ГПС.</span>
                    </div>`;
                return;
            }

            if (data.status === 'success') {
                this.state.hasData = true;
                this.state.profile = data.profile;
                this.state.times = data.times;

                const availableDistances = Object.keys(this.state.times);
                if (availableDistances.length > 0 && !availableDistances.includes(this.state.distance)) {
                    this.state.distance = availableDistances.includes('50') ? '50' : availableDistances[0];
                }
            } else {
                this.state.hasData = false;
            }
        } catch (e) {
            console.error("Ошибка загрузки ГПС:", e);
            this.state.hasData = false;
        }

        this.renderContent();
    },

    setDistance(val) {
        this.state.distance = String(val);
        if (this.dom.dispDist) this.dom.dispDist.innerText = `${val} м`;

        const backdrop = document.getElementById('s-backdrop');
        const sheet = document.getElementById('s-sheet');
        if (backdrop) backdrop.classList.remove('active');
        if (sheet) sheet.classList.remove('active');

        this.renderContent();
    },

    openDistanceSelect() {
        if (!this.state.hasData) return;

        const backdrop = document.getElementById('s-backdrop');
        const sheet = document.getElementById('s-sheet');
        const title = document.getElementById('s-title');
        const list = document.getElementById('s-list');

        if (!backdrop || !sheet || !list) return;

        if (title) title.innerText = "Выберите дистанцию";
        list.innerHTML = '';

        const distances = [50, 75, 100, 150, 200];

        distances.forEach(dist => {
            const strDist = String(dist);
            const hasDistData = this.state.times[strDist] && this.state.times[strDist].length > 0;

            const div = document.createElement('div');
            div.className = `s-sheet-item ${strDist === this.state.distance ? 'selected' : ''}`;
            if (!hasDistData) div.style.opacity = '0.3';

            div.innerText = `${dist} м`;
            div.onclick = () => {
                if (hasDistData) {
                    this.setDistance(strDist);
                    if (typeof app !== 'undefined') app.haptic('selection');
                } else {
                    if (typeof app !== 'undefined') app.haptic('error');
                    this.tg?.showAlert("Нет данных для этой дистанции");
                }
            };
            list.appendChild(div);
        });

        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            sheet.classList.add('active');
        });

        if (typeof app !== 'undefined') app.haptic('light');
    },

    renderContent() {
        // СОСТОЯНИЕ: ПУСТАЯ ТАБЛИЦА
        if (!this.state.hasData) {
            this.dom.headerInfo.style.display = 'none';
            this.dom.btnDist.style.display = 'none';

            const isViewer = (typeof app !== 'undefined' && app.isViewerMode);
            let emptyHtml = '';

            if (isViewer) {
                emptyHtml = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-top: 80px; animation: fadeInUp 0.5s var(--ease-spring) forwards; opacity: 0;">
                        <svg style="opacity: 0.4; margin-bottom: 20px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5));" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4" ry="4"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        <span style="font-size: 16px; font-weight: 900; color: #fff; letter-spacing: 0.5px;">ТАБЛИЦА ПУСТА</span>
                        <span style="font-size: 14px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5; font-weight: 500;">Спортсмен еще не загрузил<br>свою таблицу ГПС.</span>
                    </div>`;
            } else {
                emptyHtml = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-top: 60px; animation: fadeInUp 0.5s var(--ease-spring) forwards; opacity: 0;">
                        <svg style="opacity: 0.4; margin-bottom: 20px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5));" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4" ry="4"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        <span style="font-size: 16px; font-weight: 900; color: #fff; letter-spacing: 0.5px;">ВАША ТАБЛИЦА ПУСТА</span>
                        <span style="font-size: 14px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5; margin-bottom: 24px; font-weight: 500;">Для заполнения таблицы отправьте<br>свои результаты администратору.</span>
                        <button class="btn-base gps-admin-btn" style="padding: 16px 28px;" onclick="window.Telegram?.WebApp?.openTelegramLink('https://t.me/knoooox')">СВЯЗАТЬСЯ С АДМИНИСТРАТОРОМ</button>
                    </div>`;
            }

            this.dom.list.innerHTML = emptyHtml;
            return;
        }

        this.dom.headerInfo.style.display = 'block';
        this.dom.btnDist.style.display = 'flex';
        this.dom.dispDist.innerText = `${this.state.distance} м`;

        const p = this.state.profile;
        const cardsData = [
            { label: 'Лучшие 50 м', val: p.best_50 || '—' },
            { label: 'Текущие 200 м', val: p.current_200 || '—' },
            { label: 'Целевые 200 м', val: p.target_200 || '—' },
            { label: 'Текущий ГПС', val: p.current_gps || '—' },
            { label: 'Целевой ГПС', val: p.target_gps || '—' }
        ];

        // КАСКАДНАЯ АНИМАЦИЯ МИНИ-КАРТОЧЕК
        let cardsHtml = '<div class="gps-cards-scroll">';
        cardsData.forEach((c, index) => {
            cardsHtml += `
                <div class="gps-card-mini" style="opacity: 0; animation: slideInRight 0.5s var(--ease-spring) forwards; animation-delay: ${index * 0.06}s;">
                    <div class="gps-c-label">${c.label}</div>
                    <div class="gps-c-val">${c.val}</div>
                </div>
            `;
        });
        cardsHtml += '</div>';
        this.dom.headerInfo.innerHTML = cardsHtml;

        const currentData = this.state.times[this.state.distance] || [];

        if (currentData.length === 0) {
            this.dom.list.innerHTML = '<div style="text-align: center; margin-top: 40px; font-weight: 600; color: var(--text-tertiary); animation: fadeInUp 0.4s var(--ease-spring) forwards;">Нет записей для этой дистанции</div>';
            return;
        }

        currentData.sort((a, b) => {
            const getVal = (z) => {
                if (z.includes('>') || z.includes('Свыше') || z.includes('32')) return 999;
                const match = z.match(/\d+/);
                return match ? parseInt(match[0], 10) : 0;
            };
            return getVal(a.zone) - getVal(b.zone);
        });

        // КАСКАДНАЯ АНИМАЦИЯ СТРОК ТАБЛИЦЫ
        let tableHtml = `
            <div class="gps-table" style="opacity: 0; animation: fadeInUp 0.6s var(--ease-spring) forwards; animation-delay: 0.1s;">
                <div class="gps-t-head">
                    <span>Пульсовая зона</span>
                    <span style="text-align: right;">Время</span>
                </div>
        `;

        currentData.forEach((item, index) => {
            let displayZone = item.zone;
            if (displayZone.includes('> 32') || displayZone.includes('>32')) displayZone = 'Свыше 32';

            tableHtml += `
                <div class="gps-t-row" style="opacity: 0; animation: fadeInUp 0.4s var(--ease-spring) forwards; animation-delay: ${(index * 0.05) + 0.2}s;">
                    <div class="gps-t-zone">
                        <div class="pulse-dot pd-white" style="box-shadow: 0 0 10px rgba(255,255,255,0.8);"></div>
                        <span>${displayZone}</span>
                    </div>
                    <div class="gps-t-time">${item.time}</div>
                </div>
            `;
        });

        tableHtml += `</div>`;
        this.dom.list.innerHTML = tableHtml;
    },

    setupGestures() {
        if (!this.dom.sheet || !this.dom.backdrop) return;
        const handle = this.dom.sheet.querySelector('.sheet-handle');

        const canStartDrag = (target) => {
            if (target.closest('.sheet-handle')) return true;
            const insideScroll = target.closest('.sheet-scroll');
            if (target.closest('.gps-cards-scroll')) return false; // Запрещаем тянуть за горизонтальный скролл
            return insideScroll && this.dom.list && this.dom.list.scrollTop <= 0;
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

window.addEventListener('load', () => gpsApp.init());