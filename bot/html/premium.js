/**
 * ============================================================================
 * RYFT PREMIUM MODULE
 * Изолированный скрипт для премиум-функций (Bio, Социальные сети).
 * ============================================================================
 */

const premiumApp = {
    isPremium: false,
    networks: ['vk', 'tg', 'inst', 'tiktok'],
    sparkleTimer: null,

    el(id) { return document.getElementById(id); },

    init(data, isViewerMode) {
        this.isPremium = data.is_premium || false;

        const bioBlock = document.getElementById('premium-bio-block');
        const socialBlock = document.getElementById('premium-social-block');
        const searchPill = document.getElementById('btn-open-search');

        if (!this.isPremium) {
            if (bioBlock) bioBlock.style.display = 'none';
            if (socialBlock) socialBlock.style.display = 'none';
            if (searchPill) searchPill.style.margin = '24px auto 20px auto';
            if (this.sparkleTimer) clearInterval(this.sparkleTimer);
            return;
        }

        this.startSparkles();

        // --- УСТАНОВКА BIO ---
        const bioText = document.getElementById('p-bio-text');
        const bioInput = document.getElementById('i-bio');

        if (bioText && bioInput) {
            bioText.innerText = data.bio || (isViewerMode ? '' : 'Расскажите о себе (до 120 символов)...');
            bioText.style.opacity = data.bio || isViewerMode ? '1' : '0.4';
            bioInput.value = data.bio || '';
            if (bioBlock) bioBlock.style.display = (!data.bio && isViewerMode) ? 'none' : 'block';
        }

        // --- УСТАНОВКА СОЦСЕТЕЙ ---
        this.networks.forEach(net => this.setupSocialLink(net, data[`${net}_link`]));

        const hasLinks = this.networks.some(net => data[`${net}_link`]);
        if (socialBlock) {
            socialBlock.style.display = hasLinks ? 'flex' : 'none';
            socialBlock.style.marginBottom = '20px';
        }

        // --- УМНАЯ КНОПКА ПОИСКА ---
        if (searchPill) {
            if (hasLinks || data.bio || !isViewerMode) {
                searchPill.style.margin = '0 auto 20px auto';
            } else {
                searchPill.style.margin = '24px auto 20px auto';
            }
        }

        this.updateCharCount();
    },

    setupSocialLink(network, url) {
        const btn = this.el(`s-${network}`);
        const input = this.el(`i-${network}`);

        if (input) input.value = url || '';
        if (btn) {
            btn.style.display = url ? 'flex' : 'none';
            btn.href = url ? (url.startsWith('http') ? url : `https://${url}`) : '#';
        }
    },

    toggleEditMode(isEditing) {
        if (!this.isPremium) return;

        const display = (id, state) => { const element = this.el(id); if (element) element.style.display = state; };

        display('premium-bio-block', isEditing || this.el('p-bio-text')?.innerText.trim() ? 'block' : 'none');
        display('p-bio-text', isEditing ? 'none' : 'block');
        display('i-bio', isEditing ? 'block' : 'none');
        display('p-bio-counter', isEditing ? 'block' : 'none');

        display('premium-social-edit', isEditing ? 'flex' : 'none');

        if (isEditing) {
            display('premium-social-block', 'none');
        } else {
            const hasLinks = this.networks.some(net => this.el(`i-${net}`)?.value.trim());
            display('premium-social-block', hasLinks ? 'flex' : 'none');
        }
    },

    updateCharCount() {
        const input = this.el('i-bio');
        const counter = this.el('p-bio-counter');
        if (input && counter) counter.innerText = `${input.value.length}/120`;
    },

    async save(userId) {
        if (!this.isPremium) return;

        const payload = { user_id: userId, bio: this.el('i-bio')?.value.trim() || '' };
        this.networks.forEach(net => payload[`${net}_link`] = this.el(`i-${net}`)?.value.trim() || '');

        const bioText = this.el('p-bio-text');
        if (bioText) {
            bioText.innerText = payload.bio || 'Расскажите о себе (до 120 символов)...';
            bioText.style.opacity = payload.bio ? '1' : '0.4';
        }

        this.networks.forEach(net => this.setupSocialLink(net, payload[`${net}_link`]));

        try {
            const apiUrl = typeof API_URL !== 'undefined' ? API_URL : 'https://app.ryft-official.ru/api';
            await fetch(`${apiUrl}/premium/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.error("Premium Module Error: Failed to save");
        }
    },

    openPromoModal() {
        if (typeof UIModule !== 'undefined') UIModule.haptic('light');

        const backdrop = this.el('premium-promo-backdrop');
        const sheet = this.el('premium-promo-sheet');
        if (!backdrop || !sheet) return;

        const desc = this.el('premium-promo-desc');
        if (desc) {
            const name = document.getElementById('p-fullname')?.innerText || "Пользователь";
            desc.innerText = `${name} является обладателем подписки RYFT Premium и имеет эксклюзивный доступ к множеству дополнительных функций.`;
        }

        this.bounceStar();

        backdrop.style.display = 'block';
        sheet.style.display = 'flex';

        void sheet.offsetWidth;

        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            sheet.classList.add('active');
        });

        if (!this.promoGestureSetup) {
            this.setupPromoGesture(sheet);
            this.promoGestureSetup = true;
        }
    },

    closePromoModal() {
        const backdrop = this.el('premium-promo-backdrop');
        const sheet = this.el('premium-promo-sheet');
        if (!backdrop || !sheet) return;

        backdrop.classList.remove('active');
        sheet.classList.remove('active');

        sheet.style.transform = '';

        setTimeout(() => {
            backdrop.style.display = 'none';
            sheet.style.display = 'none';
        }, 400);
    },

    bounceStar() {
        const wrapper = this.el('promo-star-wrapper');
        if (!wrapper) return;
        if (typeof UIModule !== 'undefined') UIModule.haptic('light');

        wrapper.style.transition = 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)';
        wrapper.style.transform = 'scale(0.8)';

        setTimeout(() => {
            wrapper.style.transform = 'scale(1.15)';
            setTimeout(() => {
                wrapper.style.transform = 'scale(1)';
                setTimeout(() => { wrapper.style.transition = ''; }, 150);
            }, 150);
        }, 150);
    },

    setupPromoGesture(sheet) {
        const scrollArea = sheet.querySelector('.sheet-scroll');
        if (!scrollArea) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        sheet.addEventListener('touchstart', (e) => {
            if (scrollArea.scrollTop > 0) return;

            startY = e.touches[0].clientY;
            isDragging = true;
            sheet.style.transition = 'none';
        }, {passive: true});

        sheet.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const y = e.touches[0].clientY;
            currentY = y - startY;

            if (currentY > 0 && scrollArea.scrollTop <= 0) {
                e.preventDefault();
                sheet.style.transform = `translateY(${currentY}px)`;
            } else {
                currentY = 0;
            }
        }, {passive: false});

        sheet.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            sheet.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)';

            if (currentY > 100) {
                this.closePromoModal();
            } else {
                sheet.style.transform = '';
            }
            currentY = 0;
        });
    },

    startSparkles() {
        const badge = this.el('p-premium-badge');
        if (!badge) return;

        if (this.sparkleTimer) clearInterval(this.sparkleTimer);

        this.sparkleTimer = setInterval(() => {
            if (!document.body.classList.contains('tab-profile-active')) return;

            const spark = document.createElement('span');
            spark.className = 'sparkle-particle';

            const tx = (Math.random() - 0.5) * 60;
            const ty = (Math.random() - 0.5) * 60;
            const duration = 1 + Math.random() * 1.5;

            spark.style.setProperty('--tx', `${tx}px`);
            spark.style.setProperty('--ty', `${ty}px`);
            spark.style.setProperty('--dur', `${duration}s`);

            badge.appendChild(spark);

            setTimeout(() => spark.remove(), duration * 1000);

        }, 400);
    }

};