/**
 * ============================================================================
 * RYFT CONTROL: ENTERPRISE ADMIN MODULE (MONOCHROME BRUTALISM)
 * Управление статистикой, пользователями (Бан/Разбан) и режимом Тех. Работ.
 * Строгий дизайн: отсутствие синего цвета, плоские элементы, списки.
 * ============================================================================
 */

class RyftAdminCore {
    constructor() {
        this.tg = window.Telegram?.WebApp;

        // Реактивное состояние админки
        this.state = new Proxy({
            stats: { total: '-', cards: '-', banned: '-', maintenance: false },
            scanner: { isScanning: false, activeCount: 0, inactiveIds: [], totalCount: 0 },
            search: { query: '', results: [], isLoading: false, isBannedList: false }
        }, {
            set: (target, property, value) => {
                target[property] = value;
                this.reactToStateChange(property);
                return true;
            }
        });

        this.dom = {};
        this.debouncedSearch = this.debounce(this.executeSearch.bind(this), 350);

        // Инициализация при загрузке DOM
        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    init() {
        const el = (id) => document.getElementById(id);
        this.dom = {
            mainView: el('adm-main-view'),
            searchView: el('adm-search-view'),
            total: el('adm-total'),
            cards: el('adm-cards'),
            banned: el('adm-banned'),
            maintToggle: el('adm-maintenance-toggle'),
            scanVal: el('adm-scan-val'),
            scanLabel: el('adm-scan-label'),
            searchInput: el('admin-search-input'),
            searchResults: el('admin-search-results'),
            avatar: el('adm-avatar')
        };

        this.loadAdminAvatar();
    }

    haptic(type = 'selection') {
        if (typeof app !== 'undefined' && app.haptic) app.haptic(type);
    }

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    reactToStateChange(property) {
        if (property === 'stats') this.renderStats();
        if (property === 'scanner') this.renderScanner();
        if (property === 'search') this.renderSearchResults();
    }

    open() {
        this.loadAdminAvatar();
        this.fetchStats();
    }

    async loadAdminAvatar() {
        const user = this.tg?.initDataUnsafe?.user;
        if (!user?.id || !this.dom.avatar) return;

        const fallbackName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Admin';
        const fallback = typeof app !== 'undefined' && typeof app.generateInitialsAvatar === 'function'
            ? app.generateInitialsAvatar(fallbackName)
            : '';

        try {
            const apiUrl = typeof API_URL !== 'undefined' ? API_URL : '';
            const res = await fetch(`${apiUrl}/profile/${user.id}?t=${Date.now()}`);
            const data = res.ok ? await res.json() : {};
            this.dom.avatar.style.backgroundImage = data.photo_id
                ? `url('${apiUrl}/profile/get_photo/${data.photo_id}')`
                : `url('${fallback}')`;
        } catch (e) {
            if (fallback) this.dom.avatar.style.backgroundImage = `url('${fallback}')`;
        }
    }

    // --- 1. СТАТИСТИКА И ТЕХ. РАБОТЫ ---

    async fetchStats() {
        const adminId = this.tg?.initDataUnsafe?.user?.id;
        if (!adminId) return;

        try {
            const apiUrl = typeof API_URL !== 'undefined' ? API_URL : '';
            const res = await fetch(`${apiUrl}/admin/stats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_id: adminId })
            });
            if (res.ok) {
                const data = await res.json();
                this.state.stats = {
                    total: data.total_users,
                    cards: data.filled_cards,
                    banned: data.banned_users,
                    maintenance: data.is_maintenance
                };
                if (this.dom.maintToggle) {
                    this.dom.maintToggle.checked = data.is_maintenance;
                }
            }
        } catch (e) {
            console.error("Ошибка загрузки статистики админа", e);
        }
    }

    renderStats() {
        const s = this.state.stats;

        // Плавная замена цифр
        const animateNum = (el, val) => {
            if (el && el.innerText !== String(val)) {
                el.style.opacity = '0';
                setTimeout(() => {
                    el.innerText = val;
                    el.style.opacity = '1';
                }, 150);
            }
        };

        animateNum(this.dom.total, s.total);
        animateNum(this.dom.cards, s.cards);
        animateNum(this.dom.banned, s.banned);
    }

    async toggleMaintenance(isEnabled) {
        const adminId = this.tg?.initDataUnsafe?.user?.id;
        this.haptic('medium');
        try {
            const apiUrl = typeof API_URL !== 'undefined' ? API_URL : '';
            const res = await fetch(`${apiUrl}/admin/maintenance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_id: adminId, enable: isEnabled })
            });
            if (res.ok) {
                this.haptic('success');
                this.tg?.showAlert(`Тех. работы ${isEnabled ? 'ВКЛЮЧЕНЫ' : 'ВЫКЛЮЧЕНЫ'}.`);
            } else throw new Error();
        } catch (err) {
            this.haptic('error');
            if(this.dom.maintToggle) this.dom.maintToggle.checked = !isEnabled;
            this.tg?.showAlert("Ошибка изменения статуса тех. работ.");
        }
    }

    // --- 2. СКАНЕР АКТИВНОСТИ ---

    async runScan() {
        if (this.state.scanner.isScanning) return;
        const adminId = this.tg?.initDataUnsafe?.user?.id;

        this.haptic('medium');
        this.state.scanner = { ...this.state.scanner, isScanning: true };

        try {
            const apiUrl = typeof API_URL !== 'undefined' ? API_URL : '';
            const res = await fetch(`${apiUrl}/admin/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_id: adminId })
            });
            if (res.ok) {
                const data = await res.json();
                this.state.scanner = {
                    isScanning: false,
                    activeCount: data.active,
                    inactiveIds: data.inactive_ids || [],
                    totalCount: data.total
                };
                this.haptic('success');
            } else throw new Error();
        } catch (e) {
            this.state.scanner = { ...this.state.scanner, isScanning: false };
            this.haptic('error');
            this.tg?.showAlert("Ошибка при сканировании базы.");
        }
    }

    renderScanner() {
        const s = this.state.scanner;
        if (!this.dom.scanVal || !this.dom.scanLabel) return;

        if (s.isScanning) {
            this.dom.scanVal.innerText = 'АНАЛИЗ...';
            this.dom.scanVal.style.color = "var(--text-muted)";
            this.dom.scanVal.classList.add('is-running');
            this.dom.scanLabel.innerText = 'Сканирование БД';
        } else {
            this.dom.scanVal.classList.remove('is-running');
            if (s.activeCount > 0) {
                this.dom.scanVal.innerText = `${s.activeCount} / ${s.totalCount}`;
                this.dom.scanVal.style.color = "var(--text-main)";
                this.dom.scanLabel.innerText = "Активных пользователей";
            } else {
                this.dom.scanVal.innerText = 'ЗАПУСК';
                this.dom.scanVal.style.color = "var(--text-main)";
                this.dom.scanLabel.innerText = "Сканировать базу";
            }
        }
    }

    // --- 3. УПРАВЛЕНИЕ ДОСТУПОМ (БАНЫ) И ПОИСК ---

    openAccessControl() {
        if(this.dom.mainView) {
            this.dom.mainView.style.display = 'none';
        }
        if(this.dom.searchView) {
            this.dom.searchView.style.display = 'flex';
        }

        this.state.search = { query: '', results: [], isLoading: true, isBannedList: true };
        if (this.dom.searchInput) this.dom.searchInput.value = '';
        this.executeSearch();
        this.haptic('medium');
    }

    closeAccessControl() {
        if(this.dom.searchView) {
            this.dom.searchView.style.display = 'none';
        }
        if(this.dom.mainView) {
            this.dom.mainView.style.display = 'flex';
        }

        this.fetchStats();
        this.haptic('medium');
    }

    onSearch(val) {
        const query = val.trim();
        this.state.search = { ...this.state.search, query: query, isBannedList: query === '' };
        this.state.search.isLoading = true;
        this.renderSearchResults();
        this.debouncedSearch();
    }

    clearSearch() {
        if (this.dom.searchInput) this.dom.searchInput.value = '';
        this.onSearch('');
    }

    async executeSearch() {
        const query = this.state.search.query;
        const isBannedList = this.state.search.isBannedList;
        const adminId = this.tg?.initDataUnsafe?.user?.id;

        try {
            const apiUrl = typeof API_URL !== 'undefined' ? API_URL : '';
            const res = await fetch(`${apiUrl}/admin/search_users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_id: adminId, query: query, banned_only: isBannedList })
            });
            if (res.ok) {
                const data = await res.json();
                this.state.search = { ...this.state.search, results: data, isLoading: false };
            } else throw new Error();
        } catch (e) {
            this.state.search = { ...this.state.search, results: [], isLoading: false };
        }
    }

    renderSearchResults() {
        const results = this.state.search.results;
        const isLoading = this.state.search.isLoading;

        if (!this.dom.searchResults) return;

        if (isLoading) {
            // Брутальные скелетоны загрузки
            this.dom.searchResults.innerHTML = `
                <div class="skeleton-loading" style="height: 68px; border-radius: var(--radius-md); margin-bottom: 12px;"></div>
                <div class="skeleton-loading" style="height: 68px; border-radius: var(--radius-md); margin-bottom: 12px; animation-delay: 0.1s;"></div>
                <div class="skeleton-loading" style="height: 68px; border-radius: var(--radius-md); margin-bottom: 12px; animation-delay: 0.2s;"></div>
            `;
            return;
        }

        if (!results.length) {
            // Сообщение о пустом результате
            this.dom.searchResults.innerHTML = `
                <div class="search-empty">
                    <div class="admin-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"></path></svg>
                    </div>
                    <div style="font-size: 15px; color: var(--text-main);">ПУСТО</div>
                    <div style="font-size: 11px; margin-top: 6px;">Ничего не найдено</div>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        results.forEach((u, index) => {
            const isBanned = u.is_banned === 1 || u.is_banned === true;
            const item = document.createElement('div');
            item.className = 'search-item slide-in-right';
            item.style.animationDelay = `${index * 0.05}s`;
            item.style.cursor = 'default';

            // Оформление забаненного юзера
            if (isBanned) {
                item.style.borderColor = 'var(--danger)';
                item.style.backgroundColor = 'rgba(255, 69, 58, 0.05)';
            }

            const apiUrl = typeof API_URL !== 'undefined' ? API_URL : '';
            const photoId = u.photo_id || u.photo_file_id;
            const avatarStyle = photoId
                ? `background-image: url('${apiUrl}/profile/get_photo/${photoId}')`
                : 'display: flex; align-items: center; justify-content: center;';
            const fallbackIcon = photoId ? '' : `<svg viewBox="0 0 24 24" width="20" height="20" stroke="rgba(255,255,255,0.55)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

            item.innerHTML = `
                <div class="search-item-avatar" style="${avatarStyle}">${fallbackIcon}</div>
                <div class="search-item-info">
                    <div class="search-item-name" style="color: ${isBanned ? 'var(--danger)' : 'var(--text-main)'};">
                        ${u.full_name || 'Без имени'}
                    </div>
                    <div class="search-item-user">ID: ${u.user_id} ${u.username ? `| @${u.username}` : ''}</div>
                </div>
                <button class="btn-base admin-ban-btn ${isBanned ? '' : 'primary'}"
                    style="height: 40px; padding: 0 16px; font-size: 11px; margin-left: auto; flex-shrink: 0; box-shadow: none;
                    ${isBanned ? 'color: var(--text-main); border-color: var(--text-main); background: transparent;' : ''}"
                    onclick="adminApp.updateUserStatus(${u.user_id}, ${isBanned ? 0 : 1}, ${index}, this)">
                    ${isBanned ? 'РАЗБАН' : 'БАН'}
                </button>
            `;
            fragment.appendChild(item);
        });

        this.dom.searchResults.innerHTML = '';
        this.dom.searchResults.appendChild(fragment);
    }

    async updateUserStatus(targetUserId, action, userIndex, btnElement) {
        const adminId = this.tg?.initDataUnsafe?.user?.id;
        this.haptic('medium');

        const originalText = btnElement.innerText;
        btnElement.innerText = "...";
        btnElement.style.opacity = "0.5";
        btnElement.style.pointerEvents = "none";

        try {
            const apiUrl = typeof API_URL !== 'undefined' ? API_URL : '';
            const res = await fetch(`${apiUrl}/admin/ban`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    admin_id: adminId,
                    target_user_id: targetUserId,
                    action: action
                })
            });

            if (res.ok) {
                this.haptic('success');
                let newResults = [...this.state.search.results];
                if (newResults[userIndex]) {
                    newResults[userIndex].is_banned = (action === 1);
                    // Если мы в дефолтном списке банов и разбанили человека - убираем его из списка
                    if (this.state.search.isBannedList && action === 0) {
                        newResults.splice(userIndex, 1);
                    }
                    this.state.search = { ...this.state.search, results: newResults };
                }
            } else {
                throw new Error();
            }
        } catch (e) {
            this.haptic('error');
            this.tg?.showAlert("Ошибка изменения статуса.");
            btnElement.innerText = originalText;
            btnElement.style.opacity = "1";
            btnElement.style.pointerEvents = "auto";
        }
    }
}

// Экспортируем в глобальную область
const adminApp = new RyftAdminCore();
