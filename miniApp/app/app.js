/**
 * ============================================================================
 * RYFT: CORE MODULE (LIQUID GLASS EDITION)
 * Главный файл. Хранит состояние, инициализирует Telegram WebApp,
 * подгружает настройки и объединяет все модули (UI, Calc, Profile) воедино.
 * Внедрены каскадные анимации списков и премиальные фокусы.
 * ============================================================================
 */

const app = {
    tg: window.Telegram?.WebApp,

    // Глобальное состояние приложения
    state: { gender: 'male', pool: '25', style: 'freestyle', dist: '50' },
    localSettings: { startScreen: 'calc', hiddenRanks: [], wheelStyle: 'horizontal', activeRole: 'athlete' },
    coachData: { isCoach: false, careerStartDate: null, athletesCount: 0 },
    serverSettings: { is_gps_hidden: false, is_records_hidden: false },
    isSubVerified: false,

    locationsData: null,
    currentSheetOptions: [],
    currentSheetType: null,
    isCustomCity: false,
    isCustomSchool: false,

    stylePicker: null, distPicker: null,
    isSheetOpen: false, sheetDragStartY: 0, sheetTranslateY: 0, isSheetDragging: false,
    viewingUserId: null, isViewerMode: false, loadedProfileId: null, isEditingProfile: false,
    viewerRole: 'athlete', cachedProfileData: null, cachedTgFullName: null,
    isReverseModeActive: false, targetReversePoints: 0, searchTimeout: null, cropperInstance: null,

    tempRank: "", tempStyle: "", tempDistance: "", tempCity: "", tempSchool: "",
    locationsPromise: null,
    currentTab: 'calc',

    async init() {
    // 1. МОМЕНТАЛЬНО убиваем лоадер Telegram, не ждем ничего!
    if (this.tg) {
        this.tg.ready();
    }

    // 2. Теперь выполняем тяжелые расчеты
    if (typeof this.setupOptimization === 'function') this.setupOptimization();
    if (typeof this.setupAdaptation === 'function') this.setupAdaptation();

    // 3. Настройка Telegram WebApp
    if (this.tg) {
        const isMobile = /android|ios|ipad/i.test(this.tg.platform);
        if (isMobile && this.tg.requestFullscreen) this.tg.requestFullscreen();
        else this.tg.expand();

        try {
            this.tg.setHeaderColor('#000000');
            this.tg.setBackgroundColor('#000000');
            if (this.tg.isVersionAtLeast?.('7.7')) this.tg.disableVerticalSwipes();
        } catch(e) {}

        this.setupViewportSafety();
    }

        // 2. Загрузка данных
        this.loadLocalSettings();
        this.locationsPromise = this.fetchLocations();
        this.setupInputFocusSystem();

        const el = (id) => document.getElementById(id);
        this.dom = {
            sheet: el('sheet'), backdrop: el('backdrop'),
            inpMin: el('inp-min'), inpSec: el('inp-sec'), inpMs: el('inp-ms'),
            finaValue: el('fina-value'), finaInput: el('fina-input'),
            worldRecord: el('world-record'), rankBadge: el('rank-badge'),
            normsList: el('norms-list'), sheetSub: el('sheet-sub'),
            wheelsContainer: el('wheels-container')
        };

        // 3. Загрузка FINA нормативов с сервера
        try {
            const res = await fetch(`${API_URL}/standards`);
            if (!res.ok) throw new Error("HTTP " + res.status);
            DB = await res.json();
        } catch (e) {
            if (this.tg) this.tg.showAlert("Ошибка подключения к серверу нормативов.");
            return;
        }

        // 4. Инициализация UI-модулей
        if (typeof this.initWheels === 'function') this.initWheels();
        if (typeof this.updateDistances === 'function') this.updateDistances({ smooth: false, allowScrollAnchor: false, pulse: false });
        if (typeof this.setupInputs === 'function') this.setupInputs();
        if (typeof this.setupSheetGesture === 'function') this.setupSheetGesture();

        // 5. Роутинг (Deep Links) и запуск нужного экрана
        const startParam = this.tg?.initDataUnsafe?.start_param;
        const currentUser = this.tg?.initDataUnsafe?.user;

        if (startParam && startParam.startsWith('profile_')) {
            this.viewingUserId = startParam.split('_')[1];
            if (currentUser && this.viewingUserId != currentUser.id) this.isViewerMode = true;

            setTimeout(() => {
                if (typeof this.switchTab === 'function') this.switchTab('profile', true);
                if (typeof this.loadProfileData === 'function') this.loadProfileData();
            }, 100);
        } else {
            if (typeof this.verifySubscription === 'function') this.verifySubscription();
            if (typeof this.switchTab === 'function') this.switchTab(this.localSettings.startScreen, true);
            if (typeof this.loadProfileData === 'function') this.loadProfileData(this.localSettings.startScreen === 'calc');
        }

        // Кнопка админки для разработчика
        if (currentUser && currentUser.id === 861703506) { // <-- Убедись, что это точно твой ID
            const adminTab = document.querySelector('.nav-tab[data-tab="admin"]');
            if (adminTab) adminTab.style.display = 'flex';
        }
    },

    setupViewportSafety() {
        const updateSafeOffsets = () => {
            const tg = this.tg;
            const viewport = window.visualViewport;
            const viewportTop = viewport?.offsetTop || 0;
            const safeTop = Math.max(
                Number(tg?.safeAreaInset?.top || 0),
                Number(tg?.contentSafeAreaInset?.top || 0),
                0
            );
            const fallbackTop = /ios|ipad/i.test(tg?.platform || '')
                ? 'calc(env(safe-area-inset-top, 0px) + 30px)'
                : 'calc(env(safe-area-inset-top, 0px) + 28px)';
            const topOffset = safeTop > 0 || viewportTop > 0
                ? `${Math.max(28, Math.round(safeTop + viewportTop + 14))}px`
                : fallbackTop;

            document.documentElement.style.setProperty('--search-dynamic-top', topOffset);
        };

        updateSafeOffsets();
        window.addEventListener('resize', () => requestAnimationFrame(updateSafeOffsets));
        window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(updateSafeOffsets));
        window.visualViewport?.addEventListener('scroll', () => requestAnimationFrame(updateSafeOffsets));
        setTimeout(updateSafeOffsets, 250);
    },

    setupInputFocusSystem() {
        if (this.inputFocusSystemReady) return;
        this.inputFocusSystemReady = true;

        const root = document.documentElement;
        const focusableSelector = 'input:not([type="hidden"]), textarea';
        const containerSelector = [
            '.time-input-wrapper',
            '.fina-wrapper',
            '.search-input-wrapper',
            '.rec-edit-block',
            '.bento-box',
            '.premium-bio-block',
            '.share-link-edit',
            '.coach-input-group',
            '.social-editor-field'
        ].join(',');

        let activeContainer = null;
        let activeField = null;

        const getKeyboardHeight = () => {
            const vv = window.visualViewport;
            if (!vv) return 0;
            return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        };

        const clearFocusState = () => {
            if (activeContainer) activeContainer.classList.remove('input-spotlight-active');
            activeContainer = null;
            activeField = null;
            document.body.classList.remove('input-focused', 'keyboard-open');
            root.style.setProperty('--keyboard-height', '0px');
            root.style.setProperty('--spotlight-lift', '0px');
        };

        const updateFocusState = () => {
            if (!activeField || document.activeElement !== activeField) return;

            const keyboardHeight = getKeyboardHeight();
            const vv = window.visualViewport;
            const visibleBottom = (vv ? vv.height + vv.offsetTop : window.innerHeight) - 24;
            const rect = (activeContainer || activeField).getBoundingClientRect();
            const lift = Math.max(0, Math.min(220, Math.ceil(rect.bottom - visibleBottom)));

            root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
            root.style.setProperty('--spotlight-lift', `${lift}px`);
            document.body.classList.add('input-focused', 'keyboard-open');
        };

        document.addEventListener('focusin', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.matches(focusableSelector)) return;
            if (target.readOnly || target.disabled) return;

            if (activeContainer) activeContainer.classList.remove('input-spotlight-active');
            activeField = target;
            activeContainer = target.closest(containerSelector) || target;
            activeContainer.classList.add('input-spotlight-active');

            requestAnimationFrame(updateFocusState);
            setTimeout(updateFocusState, 80);
            setTimeout(updateFocusState, 240);
        });

        document.addEventListener('focusout', () => {
            setTimeout(() => {
                if (!document.activeElement?.matches?.(focusableSelector)) clearFocusState();
            }, 60);
        });

        window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(updateFocusState));
        window.visualViewport?.addEventListener('scroll', () => requestAnimationFrame(updateFocusState));
    },

    async fetchLocations() {
        try {
            const res = await fetch(`${API_URL}/locations`);
            if(res.ok) {
                this.locationsData = await res.json();
                return this.locationsData;
            }
        } catch(e) {}
        this.locationsData = this.locationsData || {};
        return this.locationsData;
    },

    loadLocalSettings() {
        try {
            const uid = this.tg?.initDataUnsafe?.user?.id || 'default';
            const saved = localStorage.getItem(`ryft_settings_${uid}`) || localStorage.getItem('ryft_settings');
            if (saved) this.localSettings = { ...this.localSettings, ...JSON.parse(saved) };
        } catch(e) {}
    },

    saveLocalSettings() {
        try {
            const uid = this.tg?.initDataUnsafe?.user?.id || 'default';
            localStorage.setItem(`ryft_settings_${uid}`, JSON.stringify(this.localSettings));
        } catch(e) {}
    },

    toggleRankVisibility(rank, isVisible) {
        if (isVisible) this.localSettings.hiddenRanks = this.localSettings.hiddenRanks.filter(r => r !== rank);
        else if (!this.localSettings.hiddenRanks.includes(rank)) this.localSettings.hiddenRanks.push(rank);
        this.saveLocalSettings();
        if (typeof this.haptic === 'function') this.haptic('light');
    },

    async updateServerSettings() {
        const user = this.tg?.initDataUnsafe?.user;
        if (!user?.id) return;

        const el = (id) => document.getElementById(id);
        const gpsHidden = el('st-gps-hidden')?.checked || false;
        const recHidden = el('st-rec-hidden')?.checked || false;

        this.serverSettings.is_gps_hidden = gpsHidden;
        this.serverSettings.is_records_hidden = recHidden;

        try {
            await fetch(`${API_URL}/settings/update`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, is_gps_hidden: gpsHidden, is_records_hidden: recHidden, wheel_style: this.localSettings.wheelStyle })
            });
            if (typeof this.haptic === 'function') this.haptic('success');
        } catch (e) {}
    },

    setGender(val) {
        if (this.state.gender === val) return;
        this.state.gender = val;
        if (typeof this.animateSwitch === 'function') this.animateSwitch('gender-switch', val === 'female');
        if (typeof this.calculate === 'function') this.calculate();
    },

    setPool(val) {
        if (this.state.pool === val) return;
        this.state.pool = val;
        if (typeof this.animateSwitch === 'function') this.animateSwitch('pool-switch', val === '50');
        if (this.state.style === 'medley') {
            if (typeof this.updateDistances === 'function') this.updateDistances({ smooth: false, allowScrollAnchor: false, pulse: true });
        }
        else {
            if (typeof this.calculate === 'function') this.calculate();
        }
    },

    async renderSettingsScreen() {
        const user = this.tg?.initDataUnsafe?.user;
        if (!user) return;

        const setText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
        const el = (id) => document.getElementById(id);

        setText('st-name', `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Пользователь');
        setText('st-id', `ID: ${user.id}`);

        const stAvatar = el('st-avatar');
        if (stAvatar) {
            try {
                const res = await fetch(`${API_URL}/profile/${user.id}?t=${Date.now()}`);
                const data = res.ok ? await res.json() : {};
                requestAnimationFrame(() => {
                    const fallback = typeof this.generateInitialsAvatar === 'function' ? this.generateInitialsAvatar(`${user.first_name || ''} ${user.last_name || ''}`) : '';
                    stAvatar.style.backgroundImage = data.photo_id ? `url('${API_URL}/profile/get_photo/${data.photo_id}')` : `url('${fallback}')`;
                });
            } catch (e) {
                const fallback = typeof this.generateInitialsAvatar === 'function' ? this.generateInitialsAvatar(`${user.first_name || ''} ${user.last_name || ''}`) : '';
                requestAnimationFrame(() => stAvatar.style.backgroundImage = `url('${fallback}')`);
            }
        }

        setText('st-val-screen', this.localSettings.startScreen === 'calc' ? 'Калькулятор' : 'Профиль');
        setText('st-val-wheel', this.localSettings.wheelStyle === 'vertical' ? 'Вертикальные' : 'Горизонтальные');

        const switcherContainer = el('st-acc-switcher-container');
        const switcherText = el('st-switcher-text');

        if (this.coachData.isCoach) {
            if (switcherContainer) switcherContainer.style.display = 'block';
            if (switcherText) switcherText.innerText = this.localSettings.activeRole === 'athlete' ? 'Перейти в аккаунт Тренера' : 'Перейти в аккаунт Спортсмена';
        } else if (switcherContainer) switcherContainer.style.display = 'none';

        const gpsToggle = el('st-gps-hidden'); if (gpsToggle) gpsToggle.checked = this.serverSettings.is_gps_hidden;
        const recToggle = el('st-rec-hidden'); if (recToggle) recToggle.checked = this.serverSettings.is_records_hidden;

        const ranksList = el('st-ranks-list');
        if (ranksList) {
            let html = '';
            if (typeof RANKS !== 'undefined') {
                RANKS.forEach((r, index) => {
                    const isHidden = this.localSettings.hiddenRanks.includes(r);
                    // КАСКАДНАЯ АНИМАЦИЯ для настроек разрядов
                    html += `
                    <div class="tg-item" style="opacity: 0; animation: slideInRight 0.4s var(--ease-spring) forwards; animation-delay: ${index * 0.05}s;">
                        <div class="tg-item-text">${typeof LABELS !== 'undefined' ? LABELS[r] : r}</div>
                        <label class="tg-switch">
                            <input type="checkbox" onchange="app.toggleRankVisibility('${r}', this.checked)" ${!isHidden ? 'checked' : ''}>
                            <span class="tg-slider"></span>
                        </label>
                    </div>`;
                });
            }
            requestAnimationFrame(() => ranksList.innerHTML = html);
        }
    },

    // --- ЛОГИКА ВСПЛЫВАЮЩИХ ОКОН (CUSTOM SELECT С КАСКАДОМ) ---
    openSettingsSelect(type) {
        const el = (id) => document.getElementById(id);
        const backdrop = el('s-backdrop'); const sheet = el('s-sheet');
        const title = el('s-title'); const list = el('s-list');
        const searchCont = el('s-search-container');
        if (!backdrop || !sheet || !title || !list) return;

        this.currentSheetType = type;
        let options = [], currentVal = "";

        if(searchCont) searchCont.style.display = 'none';

        if (type === 'startScreen') {
            title.innerText = "Стартовый экран";
            options = [{label: "Калькулятор", val: "calc"}, {label: "Профиль", val: "profile"}];
            currentVal = this.localSettings.startScreen;
        }
        else if (type === 'wheelStyle') {
            title.innerText = "Вид барабанов";
            options = [{label: "Горизонтальные", val: "horizontal"}, {label: "Вертикальные", val: "vertical"}];
            currentVal = this.localSettings.wheelStyle;
        }

        list.innerHTML = '';
        options.forEach((opt, index) => {
            const div = document.createElement('div');
            div.className = `s-sheet-item ${opt.val === currentVal ? 'selected' : ''}`;
            div.innerText = opt.label;
            // Каскадная анимация
            div.style.opacity = '0';
            div.style.animation = 'fadeInUp 0.4s var(--ease-spring) forwards';
            div.style.animationDelay = `${index * 0.05}s`;

            div.onclick = () => this.selectSettingsOption(type, opt.val, opt.label);
            list.appendChild(div);
        });

        requestAnimationFrame(() => { backdrop.classList.add('active'); sheet.classList.add('active'); });
        if (typeof this.haptic === 'function') this.haptic('light');
    },

    selectSettingsOption(type, val, label) {
        const setText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

        if (type === 'startScreen') {
            this.localSettings.startScreen = val;
            setText('st-val-screen', label);
        }
        else if (type === 'wheelStyle') {
            this.localSettings.wheelStyle = val;
            setText('st-val-wheel', label);
            if (typeof this.initWheels === 'function') this.initWheels();
            if (typeof this.updateDistances === 'function') this.updateDistances({ smooth: false, allowScrollAnchor: false, pulse: false });
            this.updateServerSettings();
        }

        this.saveLocalSettings();
        this.closeCustomSelect();
        if (typeof this.haptic === 'function') this.haptic('selection');
    },

    async openCustomSelect(type) {
        const el = (id) => document.getElementById(id);
        const backdrop = el('s-backdrop'); const sheet = el('s-sheet');
        const title = el('s-title'); const list = el('s-list');
        const searchCont = el('s-search-container'); const searchInput = el('s-search-input');
        if (!backdrop || !sheet || !title || !list) return;

        this.currentSheetType = type;
        let options = [], currentVal = "";

        if(searchCont) searchCont.style.display = 'none';
        if(searchInput) searchInput.value = '';

        if ((type === 'city' || type === 'school') && !this.locationsData) {
            list.innerHTML = '<div class="s-sheet-item skeleton-loading" style="height: 56px; border-color: transparent;"></div>';
            requestAnimationFrame(() => { backdrop.classList.add('active'); sheet.classList.add('active'); });
            await (this.locationsPromise || this.fetchLocations());
        }

        if (type === 'rank') { title.innerText = "Выберите разряд"; options = ["МСМК", "МС", "КМС", "I", "II", "III", "I юн", "II юн", "III юн"]; currentVal = this.tempRank; }
        else if (type === 'style') { title.innerText = "Основной стиль"; options = ["Вольный", "На спине", "Брасс", "Баттерфляй", "Комплекс"]; currentVal = this.tempStyle; }
        else if (type === 'distance') { title.innerText = "Основная дистанция"; options = this.tempStyle === 'Вольный' ? ["50", "100", "200", "400", "800", "1500"] : (this.tempStyle === 'Комплекс' ? ["100", "200", "400"] : ["50", "100", "200"]); currentVal = this.tempDistance; }
        else if (type === 'city') {
            title.innerText = "Выберите город";
            options = this.locationsData ? Object.keys(this.locationsData) : [];
            currentVal = this.tempCity;
            if(searchCont) searchCont.style.display = 'block';
        }
        else if (type === 'school') {
            if (!this.tempCity) {
                if (this.tg) this.tg.showAlert("Сначала выберите город!"); return;
            }
            if (this.isCustomCity || !this.locationsData || !this.locationsData[this.tempCity]) {
                this.enableCustomInput('school');
                return;
            }
            title.innerText = "Выберите школу";
            options = this.locationsData[this.tempCity] || [];
            currentVal = this.tempSchool;
            if(searchCont) searchCont.style.display = 'block';
        }

        this.currentSheetOptions = options;
        this.renderSheetList(options, currentVal);

        requestAnimationFrame(() => { backdrop.classList.add('active'); sheet.classList.add('active'); });
        if (typeof this.haptic === 'function') this.haptic('light');
    },

    renderSheetList(options, currentVal) {
        const list = document.getElementById('s-list');
        if(!list) return;
        list.innerHTML = '';

        let delayOffset = 0;

        if (this.currentSheetType === 'city' || this.currentSheetType === 'school') {
            const customBtn = document.createElement('div');
            customBtn.className = 's-sheet-custom-btn';
            customBtn.innerText = "Не нашли нужный? Вписать свой вариант";
            // Анимация кнопки кастомного ввода
            customBtn.style.opacity = '0';
            customBtn.style.animation = 'fadeInUp 0.4s var(--ease-spring) forwards';
            customBtn.onclick = () => this.enableCustomInput(this.currentSheetType);
            list.appendChild(customBtn);
            delayOffset = 1;

            if(options.length === 0) {
                const empty = document.createElement('div');
                empty.style.textAlign = 'center'; empty.style.color = 'var(--text-tertiary)'; empty.style.padding = '40px 20px'; empty.style.fontSize = '14px'; empty.style.fontWeight = '600';
                empty.innerText = "Ничего не найдено";
                list.appendChild(empty);
            }
        }

        options.forEach((opt, index) => {
            const div = document.createElement('div');
            div.className = `s-sheet-item ${opt === currentVal ? 'selected' : ''}`;
            div.innerText = this.currentSheetType === 'distance' ? opt + ' м' : opt;

            // Каскадная анимация
            div.style.opacity = '0';
            div.style.animation = 'fadeInUp 0.4s var(--ease-spring) forwards';
            div.style.animationDelay = `${(index + delayOffset) * 0.04}s`;

            div.onclick = () => this.selectCustomOption(this.currentSheetType, opt);
            list.appendChild(div);
        });
    },

    onSheetSearch(query) {
        if (!this.currentSheetOptions) return;
        const lowerQ = query.toLowerCase();
        const filtered = this.currentSheetOptions.filter(opt => opt.toLowerCase().includes(lowerQ));
        let currentVal = "";
        if (this.currentSheetType === 'city') currentVal = this.tempCity;
        if (this.currentSheetType === 'school') currentVal = this.tempSchool;
        this.renderSheetList(filtered, currentVal);
    },

    enableCustomInput(type) {
        this.closeCustomSelect();
        const el = (id) => document.getElementById(id);

        if (type === 'city') {
            this.isCustomCity = true;
            this.tempCity = '';
            el('btn-sel-city').style.display = 'none';
            el('i-city').style.display = 'block';
            el('i-city').value = '';

            // Премиальный фокус
            el('i-city').addEventListener('focus', () => document.body.classList.add('input-focused'));
            el('i-city').addEventListener('blur', () => document.body.classList.remove('input-focused'));

            setTimeout(() => el('i-city').focus(), 400);

            this.tempSchool = '';
            this.isCustomSchool = true;
            el('btn-sel-school').style.display = 'none';
            el('i-school').style.display = 'block';
            el('i-school').value = '';

            el('i-school').addEventListener('focus', () => document.body.classList.add('input-focused'));
            el('i-school').addEventListener('blur', () => document.body.classList.remove('input-focused'));

        } else if (type === 'school') {
            this.isCustomSchool = true;
            this.tempSchool = '';
            el('btn-sel-school').style.display = 'none';
            el('i-school').style.display = 'block';
            el('i-school').value = '';

            el('i-school').addEventListener('focus', () => document.body.classList.add('input-focused'));
            el('i-school').addEventListener('blur', () => document.body.classList.remove('input-focused'));

            setTimeout(() => el('i-school').focus(), 400);
        }
        if (typeof this.haptic === 'function') this.haptic('medium');
    },

    selectCustomOption(type, val) {
        const setText = (id, text) => { const element = document.getElementById(id); if (element) element.innerText = text; };
        const el = (id) => document.getElementById(id);

        if (type === 'rank') { this.tempRank = val; setText('disp-rank', val); }
        else if (type === 'style') { this.tempStyle = val; setText('disp-style', val); this.tempDistance = ""; setText('disp-distance', "Дистанция"); }
        else if (type === 'distance') { this.tempDistance = val; setText('disp-distance', val + ' м'); }
        else if (type === 'city') {
            if (this.tempCity !== val) {
                this.tempCity = val;
                setText('disp-city', val);
                this.tempSchool = "";
                setText('disp-school', "Спортивная школа / Бассейн");
                this.isCustomSchool = false;
                if(el('i-school')) el('i-school').value = '';
                if(el('btn-sel-school')) el('btn-sel-school').style.display = 'flex';
                if(el('i-school')) el('i-school').style.display = 'none';
            }
        }
        else if (type === 'school') {
            this.tempSchool = val;
            setText('disp-school', val);
        }
        this.closeCustomSelect();
        if (typeof this.haptic === 'function') this.haptic('selection');
    },

    closeCustomSelect() {
        const backdrop = document.getElementById('s-backdrop');
        const sheet = document.getElementById('s-sheet');
        requestAnimationFrame(() => {
            if(backdrop) backdrop.classList.remove('active');
            if(sheet) sheet.classList.remove('active');
        });
    }
};

/**
 * ============================================================================
 * МЕРДЖ И ЗАПУСК
 * Склеиваем все модули (UI, Calc, Profile) в единый объект `app`
 * ============================================================================
 */
// Проверяем наличие модулей перед слиянием, чтобы избежать ошибок, если какой-то файл загрузится позже
const coreOpenCustomSelect = app.openCustomSelect;
const coreCloseCustomSelect = app.closeCustomSelect;

const modulesToMerge = [
    typeof UIModule !== 'undefined' ? UIModule : {},
    typeof CalcModule !== 'undefined' ? CalcModule : {},
    typeof ProfileModule !== 'undefined' ? ProfileModule : {}
];

Object.assign(app, ...modulesToMerge);
app.openCustomSelect = coreOpenCustomSelect;
app.closeCustomSelect = coreCloseCustomSelect;

// Точка входа
window.addEventListener('load', () => app.init());
