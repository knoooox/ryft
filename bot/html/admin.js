/**
 * ============================================================================
 * RYFT CONTROL: ENTERPRISE ADMIN MODULE (LIQUID GLASS EDITION)
 * Управление статистикой, пользователями (Бан/Разбан) и режимом Тех. Работ.
 * Внедрены скелетные загрузки, каскадные анимации и стекловидные карточки.
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
        this.init();
    }

    init() {
        const el = (id) => document.getElementById(id);
        this.dom = {
            topSec: el('adm-top-section'),
            searchSec: el('adm-search-section'),
            total: el('adm-total'),
            cards: el('adm-cards'),
            banned: el('adm-banned'),
            maintToggle: el('adm-maintenance-toggle'),
            scanVal: el('adm-scan-val'),
            scanLabel: el('adm-scan-label'),
            inactiveCont: el('adm-inactive-container'),
            inactiveCount: el('adm-inactive-count'),
            inactiveList: el('adm-inactive-list'),
            searchInput: el('admin-search-input'),
            searchResults: el('admin-search-results'),
        };
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
        this.fetchStats();
    }

    // --- СТАТИСТИКА И ТЕХ. РАБОТЫ ---

    async fetchStats() {
        const adminId = this.tg?.initDataUnsafe?.user?.id;
        if (!adminId) return;

        try {
            const res = await fetch(`${API_URL}/admin/stats`, {
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
        } catch (e) {}
    }

    renderStats() {
        const s = this.state.stats;
        // Добавляем плавное появление цифр, если они обновились
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
            const res = await fetch(`${API_URL}/admin/maintenance`, {
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
            this.tg?.showAlert("Ошибка изменения статуса.");
        }
    }

    // --- СКАНЕР АКТИВНОСТИ ---

    async runScan() {
        if (this.state.scanner.isScanning) return;
        const adminId = this.tg?.initDataUnsafe?.user?.id;

        this.haptic('medium');
        this.state.scanner = { ...this.state.scanner, isScanning: true, inactiveIds: [] };

        try {
            const res = await fetch(`${API_URL}/admin/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_id: adminId })
            });
            if (res.ok) {
                const data = await res.json();
                this.state.scanner = {
                    isScanning: false,
                    activeCount: data.active,
                    inactiveIds: data.inactive_ids,
                    totalCount: data.total
                };
                this.haptic('success');
            } else throw new Error();
        } catch (e) {
            this.state.scanner = { ...this.state.scanner, isScanning: false };
            this.haptic('error');
            this.tg?.showAlert("Ошибка сканирования.");
        }
    }

    renderScanner() {
        const s = this.state.scanner;

        if (s.isScanning) {
            if (this.dom.scanVal) {
                this.dom.scanVal.innerText = 'СКАНИРОВАНИЕ...';
                this.dom.scanVal.style.color = "var(--text-secondary)";
                this.dom.scanVal.style.fontFamily = "'Inter', sans-serif";
                this.dom.scanVal.style.fontSize = "13px";
                this.dom.scanVal.style.letterSpacing = "2px";
                this.dom.scanVal.style.animation = "shimmer 1.5s ease-in-out infinite alternate";
            }
            if (this.dom.scanLabel) {
                this.dom.scanLabel.innerText = 'Анализ базы данных...';
            }
        } else {
            if (this.dom.scanVal) {
                this.dom.scanVal.style.animation = "none";
                this.dom.scanVal.innerText = s.activeCount || 0;
                if (s.activeCount > 0) {
                    this.dom.scanVal.style.color = "var(--success)";
                    this.dom.scanVal.style.fontFamily = "'JetBrains Mono', monospace";
                    this.dom.scanVal.style.fontSize = "26px";
                    this.dom.scanVal.style.fontWeight = "900";
                    this.dom.scanVal.style.letterSpacing = "normal";
                }
            }
            if (this.dom.scanLabel) {
                if (s.activeCount > 0) {
                    this.dom.scanLabel.innerText = "Активных пользователей";
                    this.dom.scanLabel.style.color = "var(--text-tertiary)";
                } else {
                    this.dom.scanLabel.innerText = `Активных из ${s.totalCount || '-'}`;
                }
            }
        }

        if (this.dom.inactiveCont && this.dom.inactiveCount) {
            if (!s.isScanning && s.inactiveIds.length > 0) {
                this.dom.inactiveCount.innerText = s.inactiveIds.length;
                if (this.dom.inactiveList) this.dom.inactiveList.innerText = s.inactiveIds.join(', ');
                this.dom.inactiveCont.style.display = 'block';
            } else {
                this.dom.inactiveCont.style.display = 'none';
            }
        }
    }

    hideInactive() {
        if (this.dom.inactiveCont) {
            this.dom.inactiveCont.style.opacity = '0';
            setTimeout(() => this.dom.inactiveCont.style.display = 'none', 300);
        }
        this.haptic('light');
    }

    copyInactive() {
        const ids = this.state.scanner.inactiveIds;
        if (!ids.length) return;
        let csvContent = "user_id,status\n";
        ids.forEach(id => { csvContent += `${id},inactive\n`; });
        const tempInput = document.createElement("textarea");
        tempInput.value = csvContent;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        this.haptic('success');
        this.tg?.showAlert(`Скопировано ${ids.length} неактивных ID`);
    }

    // --- УПРАВЛЕНИЕ ДОСТУПОМ (БАНЫ) И ПОИСК ---

    openAccessControl() {
        if(this.dom.topSec) {
            this.dom.topSec.style.opacity = '0';
            this.dom.topSec.style.transform = 'scale(0.95)';
            setTimeout(() => this.dom.topSec.style.display = 'none', 300);
        }
        if(this.dom.searchSec) {
            setTimeout(() => {
                this.dom.searchSec.style.display = 'flex';
                this.dom.searchSec.style.opacity = '1';
                this.dom.searchSec.style.transform = 'scale(1)';
            }, 300);
        }
        this.state.search = { query: '', results: [], isLoading: true, isBannedList: true };
        if (this.dom.searchInput) this.dom.searchInput.value = '';
        this.executeSearch();
        this.haptic('medium');
    }

    closeAccessControl() {
        if(this.dom.searchSec) {
            this.dom.searchSec.style.opacity = '0';
            this.dom.searchSec.style.transform = 'scale(0.95)';
            setTimeout(() => this.dom.searchSec.style.display = 'none', 300);
        }
        if(this.dom.topSec) {
            setTimeout(() => {
                this.dom.topSec.style.display = 'block'; // Блок в новом дизайне
                this.dom.topSec.style.opacity = '1';
                this.dom.topSec.style.transform = 'scale(1)';
            }, 300);
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
            const res = await fetch(`${API_URL}/admin/search_users`, {
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
            // ПРЕМИАЛЬНЫЙ СКЕЛЕТНЫЙ ЛОАДЕР (3 блока)
            this.dom.searchResults.innerHTML = `
                <div class="skeleton-loading" style="height: 60px; border-radius: var(--radius-md); margin-bottom: 8px;"></div>
                <div class="skeleton-loading" style="height: 60px; border-radius: var(--radius-md); margin-bottom: 8px; animation-delay: 0.1s;"></div>
                <div class="skeleton-loading" style="height: 60px; border-radius: var(--radius-md); margin-bottom: 8px; animation-delay: 0.2s;"></div>
            `;
            return;
        }

        if (!results.length) {
            this.dom.searchResults.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; animation: fadeInUp 0.4s var(--ease-spring) forwards; opacity: 0;">
                    <span style="font-size: 40px; filter: grayscale(1) opacity(0.3); margin-bottom: 16px; display: block;">📂</span>
                    <div style="font-size: 14px; font-weight: 800; color: #fff; letter-spacing: 0.5px;">ПУСТО</div>
                    <div style="font-size: 13px; color: var(--text-tertiary); margin-top: 6px;">По вашему запросу ничего не найдено.</div>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        results.forEach((u, index) => {
            const isBanned = u.is_banned === 1 || u.is_banned === true;
            const item = document.createElement('div');
            item.className = `glass-panel ${isBanned ? 'banned-item' : ''}`;

            // Каскадная анимация
            item.style.opacity = '0';
            item.style.animation = `slideInRight 0.5s var(--ease-spring) forwards`;
            item.style.animationDelay = `${index * 0.05}s`;

            item.style.padding = '14px 18px';
            item.style.marginBottom = '10px';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';

            if (isBanned) {
                item.style.borderColor = 'rgba(255, 59, 48, 0.4)';
                item.style.background = 'rgba(255, 59, 48, 0.08)';
                item.style.boxShadow = 'inset 0 0 15px rgba(255, 59, 48, 0.1), 0 5px 15px rgba(0,0,0,0.2)';
            }

            item.innerHTML = `
                <div style="flex: 1; overflow: hidden; padding-right: 16px;">
                    <div style="font-weight: 800; font-size: 15px; color: ${isBanned ? 'var(--danger)' : '#fff'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.3px;">
                        ${u.full_name || 'Без имени'}
                    </div>
                    <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 6px; font-family: 'JetBrains Mono', monospace; font-weight: 500;">
                        ID: ${u.user_id} ${u.username ? `<span style="color: var(--text-secondary);">| @${u.username}</span>` : ''}
                    </div>
                </div>
                <button class="btn-base ${isBanned ? '' : 'primary'}"
                    style="padding: 8px 16px; font-size: 11px; height: 36px; border-radius: var(--radius-sm); flex-shrink: 0; box-shadow: none;
                    ${isBanned ? 'color: var(--success); border-color: var(--success); background: rgba(52,199,89,0.15);' : ''}"
                    onclick="adminApp.updateUserStatus(${u.user_id}, ${isBanned ? 0 : 1}, ${index}, this)">
                    ${isBanned ? 'РАЗБАНИТЬ' : 'ЗАБАНИТЬ'}
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
            const res = await fetch(`${API_URL}/admin/ban`, {
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
                    if (this.state.search.isBannedList && action === 0) {
                        newResults.splice(userIndex, 1);
                    }
                    this.state.search = { ...this.state.search, results: newResults };
                }
            } else throw new Error();
        } catch (e) {
            this.haptic('error');
            this.tg?.showAlert("Ошибка изменения статуса.");
            btnElement.innerText = originalText;
            btnElement.style.opacity = "1";
            btnElement.style.pointerEvents = "auto";
        }
    }
}

const adminApp = new RyftAdminCore();