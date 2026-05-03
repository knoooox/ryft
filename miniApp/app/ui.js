/**
 * ============================================================================
 * RYFT FRONTEND: CORE UI MODULE
 * Базовые UI-функции, хелперы для DOM, Haptic и маршрутизация.
 * ============================================================================
 */

const UIModule = {
    currentTab: 'calc',
    tabTimeout: null,
    sheetStack: [],
    cachedElems: new Map(),

    // Флаги состояний
    isViewerMode: false,
    viewingUserId: null,
    isEditingProfile: false,
    isCoachMode: false,
    isSubVerified: false,
    initialGenderSet: false,

    // === 1. ДОБАВЛЕННЫЕ ХЕЛПЕРЫ ДЛЯ DOM (ИСПРАВЛЯЮТ ЧЕРНЫЙ ЭКРАН ПРОФИЛЯ) ===
    el(id) {
        if (!this.cachedElems.has(id)) {
            const element = document.getElementById(id);
            if (element) this.cachedElems.set(id, element);
        }
        return this.cachedElems.get(id);
    },

    setText(id, text) {
        const element = document.getElementById(id);
        if (element) element.innerText = text;
    },

    setVal(id, val) {
        const element = document.getElementById(id);
        if (element) element.value = val;
    },

    // === 2. ФИКС АНИМАЦИИ ПЕРЕКЛЮЧАТЕЛЕЙ (БАССЕЙН И ПОЛ) ===
    animateSwitch(containerId, isRight) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.setAttribute('data-state', isRight ? '1' : '0');
        const btns = container.querySelectorAll('.segment-btn');
        btns.forEach((btn, index) => {
            if ((isRight && index === 1) || (!isRight && index === 0)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    // === 3. ИСПРАВЛЕННЫЙ HAPTIC (УБИРАЕТ ОШИБКИ ИЗ КОНСОЛИ TELEGRAM) ===
    haptic(type = 'selection') {
        const tg = window.Telegram?.WebApp;
        if (!tg?.HapticFeedback) return;

        try {
            if (type === 'selection') {
                tg.HapticFeedback.selectionChanged();
            } else if (['success', 'warning', 'error'].includes(type)) {
                tg.HapticFeedback.notificationOccurred(type);
            } else if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(type)) {
                tg.HapticFeedback.impactOccurred(type);
            }
        } catch (e) {
            console.error("Haptic Error:", e);
        }
    },

    // === 4. МАРШРУТИЗАЦИЯ И ШТОРКИ ===
    switchTab(tab, isAutoLaunch = false) {
        if (!isAutoLaunch && !this.isSubVerified) {
            if (typeof this.verifySubscription === 'function') this.verifySubscription();
        }

        if (this.currentTab === tab && !isAutoLaunch) {
            if (tab === 'profile' && this.isViewerMode) {
                this.viewingUserId = null; 
                this.isViewerMode = false;
                if (typeof this.loadProfileData === 'function') this.loadProfileData(); 
                this.haptic('selection');
            }
            return;
        }
        
        if (!isAutoLaunch) this.haptic('selection');
        
        requestAnimationFrame(() => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            const activeTabBtn = document.querySelector(`.nav-tab[data-tab="${tab}"]`) || document.querySelector(`.nav-tab[onclick*="${tab}"]`);
            if (activeTabBtn) activeTabBtn.classList.add('active');

            if (tab !== 'profile' && !isAutoLaunch) {
                const searchModal = document.getElementById('search-modal');
                if (searchModal && searchModal.style.display !== 'flex') {
                    this.viewingUserId = null; 
                    this.isViewerMode = false;
                }
            }

            if (this.isEditingProfile && tab !== 'profile') {
                if (typeof this.toggleEditMode === 'function') this.toggleEditMode();
            }

            // Плавное переключение через CSS
            document.body.className = document.body.className.replace(/\btab-[a-z]+-active\b/g, '').trim();
            document.body.classList.add(`tab-${tab}-active`);

            if (tab === 'profile') {
                if (!isAutoLaunch && typeof this.loadProfileData === 'function') this.loadProfileData(); 
            } else if (tab === 'settings') {
                if (typeof this.renderSettingsScreen === 'function') this.renderSettingsScreen();
            } else if (tab === 'admin') {
                if (typeof adminApp !== 'undefined') adminApp.open(); 
            }

            this.currentTab = tab;
        });
    },

    openGenericSheet(sheetId, backdropId, titleElId, titleText) {
        this.haptic('light');
        const sheet = this.el(sheetId);
        const backdrop = this.el(backdropId);
        if (!sheet || !backdrop) return;

        if (titleElId && titleText) {
            const titleEl = this.el(titleElId);
            if (titleEl) titleEl.innerText = titleText;
        }

        if (this.sheetStack.length > 0) {
            const prev = this.sheetStack[this.sheetStack.length - 1];
            prev.sheet.classList.remove('active');
            prev.backdrop.classList.remove('active');
        }

        backdrop.classList.add('active');
        sheet.classList.add('active');
        this.sheetStack.push({ sheet, backdrop });

        this.initDragToClose(sheet, backdropId);
    },

    closeGenericSheet(sheetId, backdropId) {
        this.haptic('light');
        const sheet = this.el(sheetId);
        const backdrop = this.el(backdropId);
        if (!sheet || !backdrop) return;

        sheet.classList.remove('active');
        backdrop.classList.remove('active');

        this.sheetStack = this.sheetStack.filter(s => s.sheet.id !== sheetId);

        if (this.sheetStack.length > 0) {
            const prev = this.sheetStack[this.sheetStack.length - 1];
            prev.sheet.classList.add('active');
            prev.backdrop.classList.add('active');
        }
    },

    openSheet() { this.openGenericSheet('sheet', 'backdrop', 'sheet-title', 'НОРМАТИВЫ'); const tg = window.Telegram?.WebApp; if(tg) tg.expand(); },
    closeSheet() { this.closeGenericSheet('sheet', 'backdrop'); },
    openCustomSelect(type) { const tg = window.Telegram?.WebApp; if(tg) tg.expand(); this.openGenericSheet('s-sheet', 's-backdrop'); },
    closeCustomSelect() { this.closeGenericSheet('s-sheet', 's-backdrop'); },

    initDragToClose(sheet, backdropId) {
        let startY = 0, currentY = 0;
        const handle = sheet.querySelector('.sheet-handle, .s-sheet-handle');
        const scrollArea = sheet.querySelector('.sheet-scroll, .s-sheet-list');
        if (!handle || !scrollArea) return;

        const resetDrag = () => {
            sheet.style.transform = '';
            sheet.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        };

        const onTouchStart = (e) => {
            if (scrollArea.scrollTop > 0 && e.target !== handle) return;
            startY = e.touches[0].clientY;
            sheet.style.transition = 'none';
        };

        const onTouchMove = (e) => {
            if (scrollArea.scrollTop > 0 && e.target !== handle) return;
            currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            if (diff > 0) sheet.style.transform = `translateY(${diff}px)`;
        };

        const onTouchEnd = () => {
            sheet.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
            if (currentY - startY > 100) {
                this.closeGenericSheet(sheet.id, backdropId);
                setTimeout(resetDrag, 400);
            } else {
                resetDrag();
            }
        };

        handle.replaceWith(handle.cloneNode(true));
        const newHandle = sheet.querySelector('.sheet-handle, .s-sheet-handle');
        
        newHandle.addEventListener('touchstart', onTouchStart, {passive: true});
        newHandle.addEventListener('touchmove', onTouchMove, {passive: true});
        newHandle.addEventListener('touchend', onTouchEnd);
    },

    openSearch() {
        this.haptic('medium');
        const modal = this.el('search-modal');
        const inp = this.el('search-input');
        const results = this.el('search-results');
        
        if (modal) modal.style.display = 'flex';
        
        requestAnimationFrame(() => {
            if(modal) modal.classList.add('active');
            if(inp) { inp.value = ''; inp.focus(); }
            if(results) results.innerHTML = `<div class="search-empty"><div style="font-size: 32px; margin-bottom: 10px; opacity: 0.5;">🔍</div>Введите имя или ID</div>`;
        });
        
        const tg = window.Telegram?.WebApp; if(tg) tg.expand();
    },

    closeSearch() {
        this.haptic('light');
        const modal = this.el('search-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
        }
    },

    openPhotoViewer() {
        if (this.isEditingProfile) return;

        const avatar = this.el('p-avatar');
        const photoId = this.cachedProfileData?.photo_id || this.cachedProfileData?.photo_file_id;
        let photoUrl = photoId && typeof API_URL !== 'undefined'
            ? `${API_URL}/profile/get_photo/${photoId}`
            : '';

        if (!photoUrl && avatar?.style.backgroundImage) {
            const match = avatar.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
            photoUrl = match?.[1] || '';
        }
        if (!photoUrl || photoUrl === 'none') return;

        this.haptic('medium');
        const modal = this.el('photo-viewer-modal');
        const img = this.el('viewer-image');
        
        if (modal && img) {
            img.src = photoUrl;
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('active'));
        }
    },

    closePhotoViewer() {
        this.haptic('light');
        const modal = this.el('photo-viewer-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
        }
    },

    copyUserId() {
        const tg = window.Telegram?.WebApp;
        const id = tg?.initDataUnsafe?.user?.id;
        if (!id) return;
        const tmp = document.createElement("textarea");
        tmp.value = id; document.body.appendChild(tmp);
        tmp.select(); document.execCommand("copy");
        document.body.removeChild(tmp);
        this.haptic('success');
        tg?.showAlert("Ваш ID скопирован в буфер обмена!");
    },

    toggleProfileInfo() {
        this.haptic('light');
        const wrapper = this.el('p-fields-wrapper');
        const icon = this.el('info-toggle-icon');
        if (!wrapper || !icon) return;

        wrapper.classList.toggle('expanded');
        wrapper.classList.toggle('collapsed');
        icon.classList.toggle('rotated');
    }
};
