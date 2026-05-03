/**
 * ============================================================================
 * RYFT: PROFILE & NETWORK MODULE (ULTRA PREMIUM EDITION)
 * Логика профиля, загрузки фото, поиска спортсменов и системы тренеров.
 * Внедрены скелетные загрузки, 3D-рефлоу QR-кода и Liquid Glass интеграция.
 * ============================================================================
 */

const ProfileModule = {
    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ДАТЫ И ВОЗРАСТ) ---
    formatDOBInput(input) {
        let v = input.value.replace(/\D/g, '');
        if (v.length > 8) v = v.slice(0, 8);
        if (v.length >= 5) input.value = `${v.slice(0,2)}.${v.slice(2,4)}.${v.slice(4)}`;
        else if (v.length >= 3) input.value = `${v.slice(0,2)}.${v.slice(2)}`;
        else input.value = v;
    },

    validateDOB(dateStr) {
        const parts = dateStr.split('.'); if (parts.length !== 3) return false;
        const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
        if (isNaN(d) || isNaN(m) || isNaN(y) || m < 1 || m > 12 || d < 1 || d > 31) return false;
        return (y >= 1920 && y <= new Date().getFullYear());
    },

    calculateAge(dateStr) {
        if (!this.validateDOB(dateStr)) return null;
        const parts = dateStr.split('.'); const bdate = new Date(parts[2], parts[1]-1, parts[0]); const today = new Date();
        let age = today.getFullYear() - bdate.getFullYear();
        if (today.getMonth() < bdate.getMonth() || (today.getMonth() === bdate.getMonth() && today.getDate() < bdate.getDate())) Math.max(0, age--);
        return age;
    },

    calculateCareerTime(dateStr) {
        if (!this.validateDOB(dateStr)) return null;
        const parts = dateStr.split('.'); const diffDays = Math.floor(Math.abs(new Date() - new Date(parts[2], parts[1]-1, parts[0])) / (1000 * 60 * 60 * 24));
        const years = Math.floor(diffDays / 365); const days = diffDays % 365;
        return years > 0 ? `${years} г. и ${days} дн.` : `${days} дней`;
    },

    // --- ЗАГРУЗКА И ОТОБРАЖЕНИЕ ПРОФИЛЯ ---
    async saveInitialGender(genderStr) {
        const user = this.tg?.initDataUnsafe?.user;
        if (!user?.id) return alert("Ошибка: Нет ID Telegram.");

        const btns = document.querySelectorAll('.gender-btn');
        btns.forEach(b => { b.style.opacity = '0.5'; b.style.pointerEvents = 'none'; });

        try {
            const res = await fetch(`${API_URL}/profile/set_gender`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, gender: genderStr, full_name: `${user.last_name || ''} ${user.first_name || ''}`.trim(), username: user.username || '' })
            });
            if (res.ok) {
                this.haptic('success');
                const gModal = this.el('gender-modal');
                if(gModal) { gModal.classList.remove('active'); setTimeout(() => gModal.style.display = 'none', 300); }
                this.loadProfileData();
            } else alert(`Ошибка сервера: ${res.status}`);
        } catch (e) { alert(`Ошибка сети: ${e.message}`); }
        finally { btns.forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; }); }
    },

    async loadProfileData(isBackground = false) {
        const loader = this.el('profile-loader');
        const user = this.tg?.initDataUnsafe?.user;
        const targetId = this.viewingUserId || user?.id;

        if (!targetId) { if (loader && !isBackground) loader.style.display = 'none'; return; }
        if (this.loadedProfileId !== targetId) this.viewerRole = 'athlete';

        const isFirstLoad = (this.loadedProfileId != targetId);
        if (loader && !isBackground && isFirstLoad) { loader.style.display = 'flex'; loader.style.opacity = '1'; }

        const tgFullName = `${user?.last_name || ''} ${user?.first_name || ''}`.trim();
        if (!this.isViewerMode) this.setText('p-username', user?.username ? `@${user.username}` : tgFullName);

        if (isFirstLoad) {
            try {
                const cached = localStorage.getItem(`profile_cache_${targetId}`);
                if (cached) {
                    this.applyProfileDOM(JSON.parse(cached), targetId, tgFullName);
                    if (loader && !isBackground) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 400); }
                }
            } catch(e) {}
        }

        try {
            const res = await fetch(`${API_URL}/profile/${targetId}?viewer_id=${user?.id || ''}&t=${Date.now()}`);

            if (res.status === 503) {
                const maintScreen = document.getElementById('maintenance-overlay');
                if (maintScreen) maintScreen.style.display = 'flex';
                if (loader && !isBackground && isFirstLoad) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 400); }
                return;
            }

            const data = res.ok ? await res.json() : {};

            if (!data.gender && !this.isViewerMode) {
                const gModal = this.el('gender-modal');
                if (gModal) { gModal.style.display = 'flex'; setTimeout(() => gModal.classList.add('active'), 10); }
                if (loader && !isBackground && isFirstLoad) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 400); }
                return;
            }

            localStorage.setItem(`profile_cache_${targetId}`, JSON.stringify(data));
            this.applyProfileDOM(data, targetId, tgFullName);
        } catch (e) {}
        finally { if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 400); } }
    },

    applyProfileDOM(data, targetId, tgFullName) {
        const banScreen = document.getElementById('ban-overlay');
        if (data.is_banned && !this.isViewerMode) {
            if (banScreen) banScreen.style.display = 'flex';
            return;
        } else {
            if (banScreen) banScreen.style.display = 'none';
        }

        this.cachedProfileData = data; this.cachedTgFullName = tgFullName;

        if (!this.isViewerMode) {
            this.coachData.isCoach = data.is_coach || false;
            this.coachData.careerStartDate = data.career_start_date || '';
            this.coachData.athletesCount = data.athletes_count || 0;
            if (!this.coachData.isCoach) { this.localSettings.activeRole = 'athlete'; this.saveLocalSettings(); }
        }

        const isDisplayingCoach = (!this.isViewerMode && this.localSettings.activeRole === 'coach') || (this.isViewerMode && this.viewerRole === 'coach');
        const athleteBlocks = document.querySelectorAll('.athlete-only-block');
        const coachBlocks = document.querySelectorAll('.coach-only-block');

        const animBlocks = (blocks) => {
            blocks.forEach(b => { b.classList.remove('block-swap-anim'); void b.offsetWidth; b.classList.add('block-swap-anim'); });
        };

        requestAnimationFrame(() => {
            if (isDisplayingCoach) {
                athleteBlocks.forEach(b => b.style.display = 'none'); coachBlocks.forEach(b => b.style.display = 'flex'); animBlocks(coachBlocks);
            } else {
                coachBlocks.forEach(b => b.style.display = 'none'); athleteBlocks.forEach(b => b.style.display = 'flex'); animBlocks(athleteBlocks);
            }
        });

        if (!this.isViewerMode) {
            this.serverSettings = { is_gps_hidden: data.is_gps_hidden || false, is_records_hidden: data.is_records_hidden || false };
            if (data.wheel_style && this.localSettings.wheelStyle !== data.wheel_style) {
                this.localSettings.wheelStyle = data.wheel_style; this.saveLocalSettings(); this.initWheels();
                this.updateDistances({ smooth: false, allowScrollAnchor: false, pulse: false });
            }
        }

        if (data.gender) this.setGender(data.gender);

        const dbName = data.full_name || (!this.isViewerMode ? tgFullName : 'ПЛОВЕЦ');
        this.setText('p-fullname', dbName ? dbName.toUpperCase() : 'ПЛОВЕЦ'); this.setVal('i-fullname', dbName);
        if (this.isViewerMode) this.setText('p-username', data.username ? `@${data.username}` : "Спортсмен RYFT");

        // ПОКАЗЫВАЕМ ЗВЕЗДОЧКУ ТОЛЬКО ПРЕМИУМ-ЮЗЕРАМ
        const premiumBadge = this.el('p-premium-badge');
        if (premiumBadge) {
            premiumBadge.style.display = data.is_premium ? 'flex' : 'none';
        }

        const dob = data.birthdate || ''; this.setVal('i-dob', dob);
        if (dob && this.validateDOB(dob)) { this.setText('t-age', `${this.calculateAge(dob)} лет`); this.setText('t-dob', dob); }
        else { this.setText('t-age', 'Не указано'); this.setText('t-dob', ''); }

        this.tempCity = data.city || '';
        this.tempSchool = data.school || '';

        this.isCustomCity = false;
        this.isCustomSchool = false;

        this.setText('t-city', this.tempCity || 'Не указано');
        this.setText('t-school', this.tempSchool || '');
        this.setText('disp-city', this.tempCity || 'Город / Регион');
        this.setText('disp-school', this.tempSchool || 'Спортивная школа / Бассейн');
        this.setVal('i-city', this.tempCity);
        this.setVal('i-school', this.tempSchool);

        this.setText('t-coach', data.coach || 'Не указано'); this.setText('t-rank', data.rank || 'Не указано');
        this.setText('t-style-dist', data.style && data.distance ? `${data.style} • ${data.distance}м` : 'Не указано');

        this.setVal('i-coach', data.coach || '');
        this.tempRank = data.rank || ''; this.tempStyle = data.style || ''; this.tempDistance = data.distance || '';
        this.setText('disp-rank', this.tempRank || 'Выбрать'); this.setText('disp-style', this.tempStyle || 'Стиль');
        this.setText('disp-distance', this.tempDistance ? this.tempDistance + ' м' : 'Дистанция');

        if (isDisplayingCoach) {
            const careerStart = data.career_start_date || ''; this.setVal('i-career-start', careerStart);
            if (careerStart && this.validateDOB(careerStart)) {
                this.setText('t-career-time', this.calculateCareerTime(careerStart)); this.setText('t-career-start', careerStart);
            } else { this.setText('t-career-time', 'Не указано'); this.setText('t-career-start', ''); }
            this.setText('t-athletes-count', data.athletes_count || 0);
        }

        const avatarDiv = this.el('p-avatar');
        if (avatarDiv) {
            requestAnimationFrame(() => {
                if (data.photo_id) avatarDiv.style.backgroundImage = `url('${API_URL}/profile/get_photo/${data.photo_id}')`;
                else avatarDiv.style.backgroundImage = `url('${this.generateInitialsAvatar(data.full_name || data.username || (!this.isViewerMode ? tgFullName : 'Спортсмен'))}')`;
            });
        }

        const btnEdit = this.el('p-btn-edit'); const btnShare = this.el('p-btn-share');
        const btnGps = this.el('p-btn-gps'); const btnRec = this.el('p-btn-rec');
        const btnMyAthletes = this.el('p-btn-my-athletes'); const btnEditText = this.el('p-btn-edit-text');

        const playAnim = (el, className) => { if (!el) return; el.classList.remove(className); void el.offsetWidth; el.classList.add(className); };

        requestAnimationFrame(() => {
            if (this.isViewerMode) {
                if (btnEdit) btnEdit.style.display = 'none'; if (btnShare) btnShare.style.display = 'flex';
            } else {
                if (btnEdit) btnEdit.style.display = ''; if (btnShare) btnShare.style.display = 'flex';
            }

            if (isDisplayingCoach) {
                if (btnGps) btnGps.style.display = 'none'; if (btnRec) btnRec.style.display = 'none';
                if (btnMyAthletes) { if (btnMyAthletes.style.display === 'none') playAnim(btnMyAthletes, 'btn-anim'); btnMyAthletes.style.display = ''; btnMyAthletes.style.flex = '2'; }
                if (btnEdit) { btnEdit.style.flex = '1'; btnEdit.style.width = ''; btnEdit.style.minWidth = ''; btnEdit.style.padding = '0 4px'; }
                if (btnEditText) { btnEditText.style.display = 'block'; btnEditText.innerText = this.isEditingProfile ? 'СОХРАНИТЬ' : 'РЕДАКТИРОВАТЬ'; }
            } else {
                if (btnGps) { if (btnGps.style.display === 'none') playAnim(btnGps, 'btn-anim'); btnGps.style.display = ''; }
                if (btnRec) { if (btnRec.style.display === 'none') playAnim(btnRec, 'btn-anim'); btnRec.style.display = ''; }
                if (btnMyAthletes) btnMyAthletes.style.display = 'none';
                if (btnEdit) { btnEdit.style.flex = '1.2'; btnEdit.style.width = ''; btnEdit.style.minWidth = ''; btnEdit.style.padding = '0 4px'; }
                if (btnEditText) { btnEditText.style.display = 'block'; btnEditText.innerText = this.isEditingProfile ? 'СОХРАНИТЬ' : 'РЕДАКТИРОВАТЬ'; }
            }

            const btnToggleRole = this.el('p-btn-toggle-role');
            const btnToggleText = this.el('p-btn-toggle-text');

            if (this.isViewerMode && data.is_coach) {
                if (btnToggleRole) {
                    if (btnToggleRole.style.display === 'none') playAnim(btnToggleRole, 'btn-anim');
                    btnToggleRole.style.display = 'flex';
                }
                if (btnToggleText) {
                    btnToggleText.innerText = this.viewerRole === 'coach' ? 'СПОРТСМЕН' : 'ТРЕНЕР';
                }
            } else if (btnToggleRole) {
                btnToggleRole.style.display = 'none';
            }

            const bgBlurEl = this.el('p-bg-blur');
            if (avatarDiv && bgBlurEl) {
                bgBlurEl.style.transition = 'opacity 0.8s cubic-bezier(0.25, 1, 0.5, 1)';
                if (avatarDiv.style.backgroundImage) {
                    bgBlurEl.style.backgroundImage = avatarDiv.style.backgroundImage;
                    bgBlurEl.style.opacity = '1';
                } else {
                    bgBlurEl.style.backgroundImage = 'none';
                    bgBlurEl.style.opacity = '0';
                }
            }
        });

        // ПРИНУДИТЕЛЬНО СВОРАЧИВАЕМ ИНФОБЛОК ПРИ ЗАГРУЗКЕ ПРОФИЛЯ
        const infoWrapper = this.el('p-fields-wrapper');
        const infoIcon = document.getElementById('info-toggle-icon');
        if (infoWrapper && infoIcon) {
            infoWrapper.classList.remove('expanded');
            infoWrapper.classList.add('collapsed');
            infoIcon.classList.remove('rotated');
        }

        // ИНИЦИАЛИЗАЦИЯ ПРЕМИУМ ФИЧ
        if (typeof premiumApp !== 'undefined') premiumApp.init(data, this.isViewerMode);

        // ЖЕСТКИЙ СБРОС ИНПУТОВ ПРИ ЗАГРУЗКЕ ПРОФИЛЯ
        document.querySelectorAll('.bento-input, .custom-select-btn').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.bento-value, .bento-sub').forEach(el => el.style.display = 'block');
        if(this.el('premium-social-edit')) this.el('premium-social-edit').style.display = 'none';

        this.loadedProfileId = targetId;
    },

    // --- РЕДАКТИРОВАНИЕ И СОХРАНЕНИЕ ---
    async toggleEditMode() {
        this.isEditingProfile = !this.isEditingProfile;
        const btnEdit = this.el('p-btn-edit');
        const controls = this.el('p-avatar-controls');
        const btnSearch = this.el('btn-open-search');
        const premiumBadge = this.el('p-premium-badge');
        const profileScreen = this.el('profile-screen');
        if (!profileScreen) return;

        if (typeof premiumApp !== 'undefined') premiumApp.toggleEditMode(this.isEditingProfile);

        const btnEditText = this.el('p-btn-edit-text');
        const texts = profileScreen.querySelectorAll('.bento-value, .bento-sub, .profile-fullname');
        const inputs = profileScreen.querySelectorAll('.bento-input');
        const selectBtns = profileScreen.querySelectorAll('.custom-select-btn');
        const boxes = profileScreen.querySelectorAll('.bento-box');

        if (this.isEditingProfile) {
            if (btnSearch) btnSearch.style.display = 'none';
            if (premiumBadge) premiumBadge.style.display = 'none';
            if (btnEdit) btnEdit.classList.add('save-mode');
            if (btnEditText) btnEditText.innerText = "СОХРАНИТЬ";
            if (controls) controls.style.display = "flex";
            texts.forEach(t => t.style.display = 'none');

            this.isCustomCity = false;
            this.isCustomSchool = false;
            if (this.el('i-city')) this.el('i-city').value = this.tempCity;
            if (this.el('i-school')) this.el('i-school').value = this.tempSchool;

            // Включаем фокус эффект на body для инпутов
            inputs.forEach(i => {
                if (i.id === 'i-city' || i.id === 'i-school') i.style.display = 'none';
                else i.style.display = 'block';

                // Добавляем слушатели для премиального блюра остального фона при вводе
                i.addEventListener('focus', () => document.body.classList.add('input-focused'));
                i.addEventListener('blur', () => document.body.classList.remove('input-focused'));
            });

            selectBtns.forEach(btn => btn.style.display = 'flex');
            boxes.forEach(b => b.classList.add('editable'));

            setTimeout(() => {
                if (typeof this.toggleProfileInfo === 'function') this.toggleProfileInfo(true);
            }, 50);

        } else {
            const dobVal = this.el('i-dob')?.value; const nameVal = this.el('i-fullname')?.value;
            if (!nameVal || nameVal.trim() === '') { this.tg?.showAlert("Пожалуйста, введите Фамилию и Имя"); this.isEditingProfile = true; if (premiumBadge) premiumBadge.style.display = 'none'; return; }
            if (dobVal && !this.validateDOB(dobVal)) { this.tg?.showAlert("Некорректная дата рождения. Формат: ДД.ММ.ГГГГ"); this.isEditingProfile = true; if (premiumBadge) premiumBadge.style.display = 'none'; return; }

            this.saveProfileData();

            if (btnSearch) btnSearch.style.display = 'flex'; if (btnEdit) btnEdit.classList.remove('save-mode');
            if (premiumBadge) premiumBadge.style.display = this.cachedProfileData?.is_premium ? 'flex' : 'none';
            if (btnEditText) btnEditText.innerText = "РЕДАКТИРОВАТЬ"; if (controls) controls.style.display = "none";
            inputs.forEach(i => i.style.display = 'none'); selectBtns.forEach(btn => btn.style.display = 'none');
            texts.forEach(t => t.style.display = t.id === 't-style-dist' ? 'flex' : ''); boxes.forEach(b => b.classList.remove('editable'));
        }
    },

    // --- РАБОТА С АВАТАРКАМИ (CROPPER) ---
    generateInitialsAvatar(name) {
        const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 400; const ctx = canvas.getContext('2d');
        // Обновили градиент под Apple Dark Mode (глубокий черный/серый)
        const grad = ctx.createLinearGradient(0, 0, 400, 400); grad.addColorStop(0, '#2c2c2e'); grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 400, 400); ctx.font = 'bold 160px Inter, sans-serif';
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        let initials = "СП";
        if (name && name !== 'ПЛОВЕЦ') {
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) initials = (parts[0][0] + parts[1][0]).toUpperCase();
            else if (parts.length === 1 && parts[0].length > 0) initials = parts[0].substring(0, 2).toUpperCase();
        }
        ctx.fillText(initials, 200, 215); return canvas.toDataURL('image/jpeg', 0.8);
    },

    initCropper(event) {
        const file = event.target.files[0];
        if (!file) return;

        const loader = this.el('profile-loader');
        if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }

        const image = this.el('cropper-image');
        const modal = this.el('cropper-modal');

        image.src = '';
        if(modal) { modal.style.display = 'flex'; modal.style.opacity = '0'; }

        const objectUrl = URL.createObjectURL(file);

        image.onload = () => {
            if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 300); }
            if (this.cropperInstance) this.cropperInstance.destroy();

            this.cropperInstance = new Cropper(image, {
                aspectRatio: 1, viewMode: 1, dragMode: 'move', background: false,
                modal: true, autoCropArea: 0.9, guides: false, center: false, highlight: false,
                toggleDragModeOnDblclick: false,
                ready: () => {
                    if(modal) { modal.style.opacity = ''; modal.classList.add('active'); }
                    URL.revokeObjectURL(objectUrl);
                }
            });
        };
        image.src = objectUrl; event.target.value = '';
    },

    closeCropper() {
        const modal = this.el('cropper-modal');
        if(modal) { modal.classList.remove('active'); setTimeout(() => modal.style.display = 'none', 300); }
        if (this.cropperInstance) this.cropperInstance.destroy();
        this.el('cropper-image').src = '';
    },

    applyCrop() {
        if (!this.cropperInstance) return;
        const loader = this.el('profile-loader'); if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }
        const canvas = this.cropperInstance.getCroppedCanvas({ maxWidth: 1080, maxHeight: 1080, fillColor: '#111' });
        if (!canvas) { if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 300); } return; }

        const base64Image = canvas.toDataURL('image/jpeg', 0.85);
        this.el('p-avatar').style.backgroundImage = `url('${base64Image}')`;

        const bgBlurEl = this.el('p-bg-blur');
        if(bgBlurEl) {
            bgBlurEl.style.backgroundImage = `url('${base64Image}')`;
            bgBlurEl.style.opacity = '1';
        }

        this.el('p-btn-del-photo').style.display = 'flex';
        this.closeCropper(); this.uploadAvatarToServer(base64Image);
    },

    async uploadAvatarToServer(base64Str) {
        const user = this.tg?.initDataUnsafe?.user; if (!user?.id) return;
        try {
            await fetch(`${API_URL}/profile/upload_photo`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, image: base64Str })
            });
            this.haptic('success');
        } catch (e) {}
        finally { const loader = this.el('profile-loader'); if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 300); } }
    },

    async deletePhoto() {
        const user = this.tg?.initDataUnsafe?.user;
        this.tg?.showConfirm("Удалить фото?", async (confirm) => {
            if (!confirm) return;
            const fallbackImg = `url('${this.generateInitialsAvatar(this.el('p-fullname')?.innerText || "СП")}')`;
            this.el('p-avatar').style.backgroundImage = fallbackImg;

            const bgBlurEl = this.el('p-bg-blur');
            if(bgBlurEl) { bgBlurEl.style.backgroundImage = fallbackImg; bgBlurEl.style.opacity = '1'; }
            this.el('p-btn-del-photo').style.display = 'none';

            try {
                await fetch(`${API_URL}/profile/upload_photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, image: null }) });
                this.haptic('success');
            } catch (e) {}
        });
    },

    // --- ПОИСК И СЕТЬ (Спортсмены и Тренеры) ---
    async verifySubscription(isManualClick = false) {
        const userId = this.tg?.initDataUnsafe?.user?.id; const subModal = this.el('sub-modal');
        if (!userId || !subModal) return;
        if (isManualClick) this.haptic('light');

        try {
            const res = await fetch(`${API_URL}/check_sub/${userId}`);

            if (res.status === 503) {
                const maintScreen = document.getElementById('maintenance-overlay');
                if (maintScreen) maintScreen.style.display = 'flex';
                return;
            }

            if (res.ok && (await res.json()).subscribed) {
                this.isSubVerified = true;
                if (isManualClick) this.haptic('success');
                subModal.classList.remove('active'); setTimeout(() => subModal.style.display = 'none', 300);
                return;
            }
            if (isManualClick) { this.haptic('error'); this.tg?.showAlert("Вы еще не подписались на канал!"); }
            else { subModal.style.display = 'flex'; setTimeout(() => subModal.classList.add('active'), 10); }
        } catch (e) {
            this.isSubVerified = true;
            subModal.classList.remove('active'); setTimeout(() => subModal.style.display = 'none', 300);
        }
    },

    openSearch() {
        if (!this.isSubVerified) { this.verifySubscription(); return; }
        const modal = this.el('search-modal'); if(!modal) return;
        modal.classList.remove('athletes-mode');
        const searchBar = modal.querySelector('.search-header'); if (searchBar) searchBar.style.display = 'flex';
        modal.style.display = 'flex'; setTimeout(() => { modal.classList.add('active'); this.el('search-input').focus(); }, 10);
        this.onSearchInput(''); this.haptic('light');
    },

    async openMyAthletes() {
        if (!this.isSubVerified) { this.verifySubscription(); return; }
        const modal = this.el('search-modal'); if(!modal) return;
        modal.classList.add('athletes-mode');

        const searchBar = modal.querySelector('.search-header');
        if (searchBar) searchBar.style.display = 'none';

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
        this.haptic('light');

        const container = this.el('search-results');

        // Внедряем премиальную скелетную загрузку (shimmer effect)
        container.innerHTML = `
            <div class="search-item skeleton-loading" style="height: 80px; border-color: transparent;"></div>
            <div class="search-item skeleton-loading" style="height: 80px; border-color: transparent; animation-delay: 0.1s;"></div>
            <div class="search-item skeleton-loading" style="height: 80px; border-color: transparent; animation-delay: 0.2s;"></div>
        `;

        try {
            const res = await fetch(`${typeof API_URL !== 'undefined' ? API_URL : 'https://app.ryft-official.ru/api'}/coach/athletes/${this.isViewerMode ? this.viewingUserId : this.tg?.initDataUnsafe?.user?.id}?t=${Date.now()}`);
            const data = await res.json();
            data.athletes.sort((a, b) => (a.athlete_name || '').localeCompare(b.athlete_name || '', 'ru'));

            container.innerHTML = `
                <div class="coach-athletes-toolbar">
                    <button type="button" class="search-back-btn icon-btn-circular" onclick="app.closeSearch()" aria-label="Назад">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div class="coach-athletes-title">МОИ СПОРТСМЕНЫ (${data.athletes.length})</div>
                </div>
            `;

            if (!data.athletes.length) { container.innerHTML += '<div class="search-empty">У вас пока нет привязанных спортсменов</div>'; return; }

            data.athletes.forEach(ath => {
                const el = document.createElement('div'); el.className = 'search-item';
                el.onclick = () => { this.closeSearch(); this.viewingUserId = ath.athlete_id; this.isViewerMode = true; this.switchTab('profile', true); this.loadProfileData(); };

                const photoId = ath.photo_id || ath.photo_file_id;
                const avatarStyle = photoId
                    ? `background-image: url('${typeof API_URL !== 'undefined' ? API_URL : 'https://app.ryft-official.ru/api'}/profile/get_photo/${photoId}'); border: none;`
                    : `background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;`;
                const fallbackIcon = photoId ? '' : `<svg viewBox="0 0 24 24" width="22" height="22" stroke="rgba(255,255,255,0.6)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

                el.innerHTML = `
                    <div class="search-item-avatar" style="${avatarStyle}">${fallbackIcon}</div>
                    <div class="search-item-info">
                        <div class="search-item-name">${ath.athlete_name || 'Спортсмен'}</div>
                        <div class="search-item-user">${ath.username ? '@'+ath.username : 'ID: '+ath.athlete_id}</div>
                    </div>`;
                container.appendChild(el);
            });
        } catch (e) { container.innerHTML = '<div class="search-empty" style="margin-top: 80px;">Ошибка загрузки списка.</div>'; }
    },

    closeSearch() {
        const modal = this.el('search-modal'); if(!modal) return;
        modal.classList.remove('active');
        setTimeout(() => {
            modal.style.display = 'none';
            this.el('search-input').value = '';
            this.el('search-results').innerHTML = '';
            modal.classList.remove('athletes-mode');

            const searchBar = modal.querySelector('.search-header');
            if (searchBar) searchBar.style.display = 'flex';
        }, 400);
    },

    onSearchInput(query) { clearTimeout(this.searchTimeout); this.searchTimeout = setTimeout(() => this.fetchSearchResults(query.trim()), 400); },

    async fetchSearchResults(query) {
        const container = this.el('search-results');
        if (!query.length) { container.innerHTML = '<div class="search-empty">Введите имя, @username или Telegram ID</div>'; return; }

        // Внедряем премиальную скелетную загрузку (shimmer effect)
        container.innerHTML = `
            <div class="search-item skeleton-loading" style="height: 80px; border-color: transparent;"></div>
            <div class="search-item skeleton-loading" style="height: 80px; border-color: transparent; animation-delay: 0.1s;"></div>
            <div class="search-item skeleton-loading" style="height: 80px; border-color: transparent; animation-delay: 0.2s;"></div>
        `;

        try {
            const res = await fetch(`${API_URL}/profile/search?q=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error();
            const users = await res.json();
            if (!users.length) { container.innerHTML = '<div class="search-empty">Спортсмен не найден 😔</div>'; return; }

            container.innerHTML = '';
            users.forEach(u => {
                const el = document.createElement('div'); el.className = 'search-item';
                el.onclick = () => {
                    this.closeSearch(); const currentUser = this.tg?.initDataUnsafe?.user;
                    if (currentUser && u.user_id == currentUser.id) { this.viewingUserId = null; this.isViewerMode = false; }
                    else { this.viewingUserId = u.user_id; this.isViewerMode = true; }
                    this.switchTab('profile', true); this.loadProfileData();
                };

                const photoId = u.photo_id || u.photo_file_id;
                const avatarStyle = photoId
                    ? `background-image: url('${API_URL}/profile/get_photo/${photoId}'); border: none;`
                    : `background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;`;
                const fallbackIcon = photoId ? '' : `<svg viewBox="0 0 24 24" width="22" height="22" stroke="rgba(255,255,255,0.6)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

                el.innerHTML = `
                    <div class="search-item-avatar" style="${avatarStyle}">${fallbackIcon}</div>
                    <div class="search-item-info">
                        <div class="search-item-name">${u.full_name || 'Спортсмен'}</div>
                        <div class="search-item-user">${u.username ? '@'+u.username : 'ID: '+(u.user_id || '')}</div>
                    </div>`;
                container.appendChild(el);
            });
        } catch (e) { container.innerHTML = '<div class="search-empty">Ошибка поиска. Проверьте соединение.</div>'; }
    },

    // --- НОВАЯ СИСТЕМА ШЕРИНГА И QR (PREMIUM) ---
    currentShareLink: '',

    openShareModal() {
        try {
            const user = this.tg?.initDataUnsafe?.user || { id: 12345 };
            const targetId = this.isViewerMode ? this.viewingUserId : user.id;
            if (!targetId) return;

            const isPremium = this.cachedProfileData?.is_premium;

            // 1. ЛОГИКА ДЛЯ ОБЫЧНЫХ ПОЛЬЗОВАТЕЛЕЙ
            if (!isPremium) {
                const link = `https://t.me/RyftAppBot/RYFT?startapp=profile_${targetId}`;
                const name = this.el('p-fullname')?.innerText || "спортсмена";
                const text = this.isViewerMode ? `Профиль пловца ${name} в RYFT! 🏊‍♂️` : `Мой профиль в RYFT! 🏊‍♂️`;
                this.tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
                return;
            }

            // 2. PREMIUM ПОЛЬЗОВАТЕЛИ
            const profileData = this.cachedProfileData || {};
            const shortId = profileData.custom_link || profileData.username || targetId;

            this.currentShareLink = `https://t.me/RyftAppBot/RYFT?startapp=profile_${shortId}`;
            this.setText('share-link-text', this.currentShareLink.replace(/^https?:\/\//, ''));

            const editBtn = document.getElementById('btn-edit-share-link');
            const copyBtn = document.getElementById('btn-copy-share-link');

            if (editBtn) {
                editBtn.style.display = this.isViewerMode ? 'none' : 'flex';
            }
            if (copyBtn) {
                copyBtn.style.display = 'flex';
                copyBtn.style.width = '40px'; copyBtn.style.height = '40px';
                copyBtn.style.borderRadius = '50%'; copyBtn.style.padding = '0';
                copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            }

            if (this.el('share-link-read')) this.el('share-link-read').style.display = 'flex';
            if (this.el('share-link-edit')) this.el('share-link-edit').style.display = 'none';

            const modal = document.getElementById('share-modal');
            if (modal) {
                modal.style.display = 'flex';

                // Триггерим 3D анимацию QR кода (сброс и рестарт)
                const canvas = document.getElementById('qr-canvas');
                if (canvas) {
                    canvas.style.animation = 'none';
                    void canvas.offsetWidth; // Reflow
                    canvas.style.animation = null;
                }

                setTimeout(() => {
                    modal.classList.add('active');
                    setTimeout(() => this.generateDesignQR(this.currentShareLink), 250);
                }, 50);
                this.haptic('light');
            }
        } catch (e) { console.error(e); }
    },

    closeShareModal() {
        const modal = document.getElementById('share-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 400);
        }
    },

    toggleShareEditMode() {
        if (this.isViewerMode) return;
        this.haptic('light');
        if (this.el('share-link-read')) this.el('share-link-read').style.display = 'none';
        if (this.el('share-link-edit')) this.el('share-link-edit').style.display = 'flex';
        const input = document.getElementById('i-custom-link');
        if (input) {
            input.value = this.cachedProfileData?.custom_link || this.cachedProfileData?.username || '';
            input.focus();
        }
    },

    async saveShareLink() {
        const user = this.tg?.initDataUnsafe?.user;
        const input = document.getElementById('i-custom-link');
        if (!user?.id || !input) return;

        let newLink = input.value.trim().toLowerCase();
        if (newLink !== '' && (newLink.length < 4 || !/^[a-z0-9_]+$/.test(newLink))) {
            return this.tg?.showAlert("Минимум 4 символа (латиница, цифры, _)");
        }

        try {
            const res = await fetch(`${API_URL}/profile/set_link`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, custom_link: newLink })
            });
            const data = await res.json();
            if (res.ok) {
                if (this.cachedProfileData) this.cachedProfileData.custom_link = data.link;
                this.openShareModal(); // Перезапуск отрисовки
                this.haptic('success');
            } else {
                this.tg?.showAlert(data.error || "Ссылка занята");
            }
        } catch (e) { this.tg?.showAlert("Ошибка сети"); }
    },

    copyProfileLink() {
        const tempInput = document.createElement("input");
        tempInput.value = this.currentShareLink;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        this.haptic('success');
        this.tg?.showAlert("Ссылка скопирована!");
    },

    shareToTelegram() {
        const text = this.isViewerMode ? `Посмотри профиль в RYFT! 🏊‍♂️` : `Посмотри мой профиль в RYFT! 🏊‍♂️`;
        this.tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(this.currentShareLink)}&text=${encodeURIComponent(text)}`);
    },

    generateDesignQR(link) {
        const QRCodeLib = window.QRCode;
        const canvas = document.getElementById('qr-canvas');
        if (!QRCodeLib || !canvas) return;

        const size = 800;

        QRCodeLib.toCanvas(canvas, link, {
            width: size, margin: 1.5, errorCorrectionLevel: 'H',
            color: { dark: '#000000', light: '#ffffff' }
        }, (error) => {
            if (error) return console.error(error);

            canvas.style.width = '200px';
            canvas.style.height = '200px';

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const logoSize = 192;
            const center = (size - logoSize) / 2;

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(center - 12, center - 12, logoSize + 24, logoSize + 24, 40);
            else ctx.fillRect(center - 12, center - 12, logoSize + 24, logoSize + 24);
            ctx.fill();

            const img = new Image();
            img.crossOrigin = "Anonymous";

            img.onload = () => {
                ctx.save();
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, logoSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(img, center, center, logoSize, logoSize);
                ctx.restore();
            };

            img.src = 'https://app.ryft-official.ru/static/logo.png?v=' + Date.now();
        });
    },

    // --- ПРОЧЕЕ (ТРЕНЕР, СОХРАНЕНИЕ) ---
    toggleViewerRole() {
        this.haptic('medium');
        this.viewerRole = this.viewerRole === 'coach' ? 'athlete' : 'coach';
        if (this.cachedProfileData) this.applyProfileDOM(this.cachedProfileData, this.viewingUserId, this.cachedTgFullName);
    },

    toggleCoachMode() {
        this.localSettings.activeRole = this.localSettings.activeRole === 'athlete' ? 'coach' : 'athlete';
        this.saveLocalSettings();
        this.haptic('medium');
        const switcherText = this.el('st-switcher-text');
        if (switcherText) switcherText.innerText = this.localSettings.activeRole === 'athlete' ? 'Перейти в аккаунт Тренера' : 'Перейти в аккаунт Спортсмена';
        this.loadedProfileId = null;
        this.tg?.showAlert(`Вы переключились на аккаунт ${this.localSettings.activeRole === 'athlete' ? 'Спортсмена' : 'Тренера'}`);
    },

    async saveProfileData() {
        const user = this.tg?.initDataUnsafe?.user;
        if (!user?.id) return;
        if (this.isCustomCity) this.tempCity = this.el('i-city')?.value.trim() || '';
        if (this.isCustomSchool) this.tempSchool = this.el('i-school')?.value.trim() || '';
        const payload = {
            user_id: user.id, username: user.username || '', full_name: this.el('i-fullname')?.value || '', birthdate: this.el('i-dob')?.value || '',
            city: this.tempCity, school: this.tempSchool, coach: this.el('i-coach')?.value || '',
            rank: this.tempRank, style: this.tempStyle, distance: this.tempDistance
        };

        if (this.localSettings.activeRole === 'coach') {
            const careerStart = this.el('i-career-start')?.value || '';
            if (careerStart && !this.validateDOB(careerStart)) return this.tg?.showAlert("Некорректная дата");
            try {
                await fetch(`${API_URL}/coach/save_profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, career_start_date: careerStart }) });
            } catch(e) {}
        }
        if (typeof premiumApp !== 'undefined') await premiumApp.save(user.id);

        try {
            await fetch(`${API_URL}/profile/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } catch (e) {}
    },

    openCoachModal() {
        const user = this.tg?.initDataUnsafe?.user; const modal = this.el('coach-modal'); if (!user || !modal) return;
        this.setVal('coach-f-athlete-id', user.id); this.setVal('coach-f-athlete-name', this.el('i-fullname')?.value || `${user.first_name || ''} ${user.last_name || ''}`.trim());
        this.setVal('coach-f-coach-id', '');
        modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10); this.haptic('light');
    },

    closeCoachModal() {
        const modal = this.el('coach-modal'); if (!modal) return;
        modal.classList.remove('active'); setTimeout(() => modal.style.display = 'none', 400);
    },

    async submitCoachLink() {
        const user = this.tg?.initDataUnsafe?.user; if (!user) return;
        const athleteName = this.el('coach-f-athlete-name').value.trim(); const coachIdStr = this.el('coach-f-coach-id').value.replace(/\D/g, ''); 
        if (!athleteName || !coachIdStr) return this.tg?.showAlert("Проверьте поля.");
        try {
            const res = await fetch(`${API_URL}/coach/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ athlete_id: user.id, athlete_name: athleteName, coach_id: parseInt(coachIdStr) }) });
            if (res.ok) { this.haptic('success'); this.tg?.showAlert("Тренер добавлен."); this.closeCoachModal(); }
        } catch (e) { this.tg?.showAlert("Ошибка сети."); }
    },

    copyUserId() {
        const userId = this.tg?.initDataUnsafe?.user?.id; if (!userId) return;
        const tempInput = document.createElement("input"); tempInput.value = userId; document.body.appendChild(tempInput); tempInput.select(); document.execCommand("copy"); document.body.removeChild(tempInput);
        this.haptic('success'); this.tg?.showAlert("ID скопирован!");
    }
};
