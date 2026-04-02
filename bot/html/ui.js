/**
 * ============================================================================
 * RYFT: UI MODULE
 * Содержит методы для работы с DOM, анимациями, вкладками, модалками и Haptic.
 * Этот объект будет автоматически объединен с главным объектом app.
 * ============================================================================
 */

const UIModule = {
    domCache: new Map(),
    isLowEnd: false,
    tabTimeout: null,

    // Определяет мощность устройства для отключения тяжелых анимаций
    setupOptimization() {
        this.isLowEnd = (navigator.hardwareConcurrency || 4) <= 2;
        if (this.isLowEnd) document.documentElement.classList.add('low-end-device');
    },

    // Масштабирует шрифты и интерфейс в зависимости от ширины экрана
    setupAdaptation() {
        const adapt = () => {
            const w = window.innerWidth;
            const scale = Math.min(Math.max(w / 390, 0.85), 1.2);
            document.documentElement.style.setProperty('--app-scale', scale);
            
            document.querySelectorAll('.bento-value, .norm-rank, .profile-fullname').forEach(el => {
                if (el.scrollWidth > el.clientWidth) {
                    const currentSize = parseFloat(window.getComputedStyle(el).fontSize);
                    el.style.fontSize = `${currentSize * (el.clientWidth / el.scrollWidth)}px`;
                }
            });
        };
        window.addEventListener('resize', () => requestAnimationFrame(adapt));
        setTimeout(() => requestAnimationFrame(adapt), 100);
    },

    // Умный поиск элемента с кэшированием (ускоряет работу DOM)
    el(id) { 
        if (!this.domCache.has(id)) {
            const element = document.getElementById(id);
            if (element) this.domCache.set(id, element);
            else return null;
        }
        return this.domCache.get(id);
    },

    setText(id, text) { const el = this.el(id); if (el) el.innerText = text; },
    setVal(id, val) { const el = this.el(id); if (el) el.value = val; },

    // Единая точка вызова вибраций Telegram
    haptic(type = 'selection') {
        if (!this.tg?.HapticFeedback) return;
        if (type === 'selection') this.tg.HapticFeedback.selectionChanged();
        else if (['light', 'medium', 'heavy'].includes(type)) this.tg.HapticFeedback.impactOccurred(type);
        else if (['error', 'success', 'warning'].includes(type)) this.tg.HapticFeedback.notificationOccurred(type);
    },

    // Анимация переключателей (свитчеров)
    animateSwitch(id, isRight) {
        requestAnimationFrame(() => {
            const el = this.el(id); if(!el) return;
            el.setAttribute('data-state', isRight ? '1' : '0');
            const btns = el.querySelectorAll('.segment-btn');
            if (btns.length) {
                btns[0].classList.toggle('active', !isRight);
                btns[1].classList.toggle('active', isRight);
            }
        });
        this.haptic('light');
    },

    // Плавное начисление очков FINA
    animateValue(obj, start, end, duration) {
        if (this.isLowEnd) { obj.innerHTML = end; return; }
        if (obj.animationId) window.cancelAnimationFrame(obj.animationId);
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3); 
            obj.innerHTML = Math.floor(ease * (end - start) + start);
            if (progress < 1) obj.animationId = window.requestAnimationFrame(step);
        };
        obj.animationId = window.requestAnimationFrame(step);
    },

    // Логика переключения нижнего меню навигации
    switchTab(tab, isAutoLaunch = false) {
        if (!isAutoLaunch && !this.isSubVerified) {
            this.verifySubscription();
        }

        if (this.currentTab === tab && !isAutoLaunch) {
            if (tab === 'profile' && this.isViewerMode) {
                this.viewingUserId = null; this.isViewerMode = false;
                this.loadProfileData(); this.haptic('selection');
            }
            return;
        }
        if (!isAutoLaunch) this.haptic('selection');
        
        const screens = { 'calc': this.el('calc-screen'), 'profile': this.el('profile-screen'), 'settings': this.el('settings-screen'), 'admin': this.el('admin-screen') };
        const tabs = document.querySelectorAll('.nav-tab');

        requestAnimationFrame(() => {
            Object.values(screens).forEach(s => { if(s) { s.style.display = ''; s.classList.remove('screen-hidden'); }});
            if (screens['calc']) void screens['calc'].offsetWidth; 
            tabs.forEach(t => t.classList.remove('active'));

            if (tab !== 'profile' && !isAutoLaunch && this.el('search-modal')?.style.display !== 'flex') {
                this.viewingUserId = null; this.isViewerMode = false;
            }

            if (this.isEditingProfile && tab !== 'profile') this.toggleEditMode();

            document.body.className = `tab-${tab}-active`;

            const activeTabBtn = document.querySelector(`.nav-tab[onclick="app.switchTab('${tab}')"]`);
            if (activeTabBtn) activeTabBtn.classList.add('active');

            if (tab === 'profile') {
                if (!isAutoLaunch) this.loadProfileData(); 
            } else if (tab === 'settings') {
                this.renderSettingsScreen();
            } else if (tab === 'admin') {
                if (typeof adminApp !== 'undefined') adminApp.open(); 
            }

            this.currentTab = tab;
            if (this.tabTimeout) clearTimeout(this.tabTimeout);
            this.tabTimeout = setTimeout(() => {
                Object.keys(screens).forEach(key => { if (key !== this.currentTab && screens[key]) screens[key].classList.add('screen-hidden'); });
            }, 350);
        });
    },

    // Модалка просмотра аватара
    openPhotoViewer() {
        if (this.isEditingProfile) return;
        const bgImage = this.el('p-avatar')?.style.backgroundImage;
        if (!bgImage || bgImage === 'none' || bgImage.includes('undefined')) return;
        const url = bgImage.slice(4, -1).replace(/['"]/g, "");
        if (!url) return;

        const modal = this.el('photo-viewer-modal');
        if(!modal) return;
        this.el('viewer-image').src = url;
        requestAnimationFrame(() => { modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10); });
        this.haptic('light');
    },

    closePhotoViewer() {
        const modal = this.el('photo-viewer-modal');
        if(!modal) return;
        modal.classList.remove('active');
        setTimeout(() => { modal.style.display = 'none'; this.el('viewer-image').src = ''; }, 300);
    },

    // Аккордеон профиля (Сворачивание/Разворачивание информации)
    toggleProfileInfo(forceOpen = false) {
        const wrapper = this.el('p-fields-wrapper');
        const icon = document.getElementById('info-toggle-icon');
        if (!wrapper || !icon) return;

        const isCollapsed = wrapper.classList.contains('collapsed');

        if (isCollapsed || forceOpen) {
            wrapper.classList.remove('collapsed');
            wrapper.classList.add('expanded');
            icon.classList.add('rotated');
        } else if (!forceOpen) {
            wrapper.classList.remove('expanded');
            wrapper.classList.add('collapsed');
            icon.classList.remove('rotated');
        }
        if (!forceOpen) this.haptic('light');
    }
};