/**
 * ============================================================================
 * RYFT 3D WHEEL PICKER
 * Компонент 3D-барабанов (Стиль/Дистанция) с физикой инерции и Haptic-откликом.
 * ============================================================================
 */

class WheelPicker {
    constructor(elementId, items, onChange, orientation = 'horizontal') {
        this.container = document.getElementById(elementId);
        this.host = this.container.parentElement;
        this.onChange = onChange;
        this.isVertical = orientation === 'vertical';
        this.itemSize = this.isVertical ? 40 : 110; 
        
        this.host.classList.toggle('vertical', this.isVertical);
        
        // Пакетная инициализация состояния
        Object.assign(this, {
            scrollPos: 0, velocity: 0, targetScrollPos: null,
            isDragging: false, startPos: 0, currentPos: 0, pointerId: null,
            velocityHistory: [], lastEmittedValue: null, lastHapticValue: null,
            hasMoved: false, domItems: []
        });
        
        this.setItems(items);
        this.attachEvents();
        requestAnimationFrame(() => this.animate());
    }

    get maxScroll() { return Math.max(0, (this.items.length - 1) * this.itemSize); }
    clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

    setItems(newItems, preferredValue = null) {
        this.items = [...newItems];
        this.container.innerHTML = '';
        
        this.items.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'picker-item';
            el.innerText = item.label;
            
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.hasMoved) {
                    this.targetScrollPos = index * this.itemSize;
                    this.velocity = 0; 
                }
            });
            this.container.appendChild(el);
        });
        
        this.domItems = Array.from(this.container.querySelectorAll('.picker-item'));

        if (preferredValue) {
            const idx = this.items.findIndex(i => i.value === preferredValue);
            if (idx !== -1) {
                this.scrollPos = this.targetScrollPos = idx * this.itemSize;
                this.lastEmittedValue = this.lastHapticValue = preferredValue;
            }
        } else {
            this.scrollPos = this.targetScrollPos = 0;
            if (this.items.length) {
                this.lastEmittedValue = this.lastHapticValue = this.items[0].value;
            }
        }
        this.forceRender();
    }

    updateItems(newItems, options = {}) {
        const { preferredValue = null, smooth = true } = options;
        let nextVal = preferredValue || (this.lastEmittedValue && newItems.find(i => i.value === this.lastEmittedValue) ? this.lastEmittedValue : newItems[0].value);
        
        this.velocity = 0;
        if (!smooth) this.targetScrollPos = null;
        
        this.setItems(newItems, nextVal);
        
        if (this.lastEmittedValue !== nextVal) {
            this.lastEmittedValue = nextVal;
            this.onChange(nextVal);
        }
    }

    attachEvents() {
        this.host.style.touchAction = this.isVertical ? 'pan-x' : 'pan-y'; 
        
        this.host.addEventListener('pointerdown', e => this.onPointerDown(e));
        window.addEventListener('pointermove', e => this.onPointerMove(e));
        window.addEventListener('pointerup', e => this.onPointerUp(e));
        window.addEventListener('pointercancel', e => this.onPointerUp(e));

        this.host.addEventListener('wheel', (e) => {
            const delta = this.isVertical ? e.deltaY : e.deltaX;
            if (Math.abs(delta) > 5) {
                e.preventDefault();
                this.velocity = 0;
                this.targetScrollPos = null;
                this.scrollPos += delta * 0.5;
                
                clearTimeout(this.wheelSnapTimer);
                this.wheelSnapTimer = setTimeout(() => {
                    this.targetScrollPos = this.clamp(Math.round(this.scrollPos / this.itemSize), 0, this.items.length - 1) * this.itemSize;
                }, 150);
            }
        }, { passive: false });
    }

    onPointerDown(e) {
        if (this.pointerId !== null) return; 
        
        this.pointerId = e.pointerId;
        this.isDragging = true;
        this.hasMoved = false;
        
        this.startPos = this.currentPos = this.isVertical ? e.clientY : e.clientX;
        this.velocity = 0;
        this.targetScrollPos = null;
        this.host.classList.add('dragging');
        
        this.velocityHistory = [{ time: performance.now(), pos: this.scrollPos }];
        this.host.setPointerCapture(this.pointerId);
    }

    onPointerMove(e) {
        if (!this.isDragging || e.pointerId !== this.pointerId) return;

        const coord = this.isVertical ? e.clientY : e.clientX;
        const delta = coord - this.currentPos;
        
        if (Math.abs(coord - this.startPos) > 5) this.hasMoved = true;

        if (this.hasMoved) {
            this.scrollPos -= (this.scrollPos < 0 || this.scrollPos > this.maxScroll) ? delta * 0.3 : delta;
            
            const now = performance.now();
            this.velocityHistory.push({ time: now, pos: this.scrollPos });
            if (now - this.velocityHistory[0].time > 100) this.velocityHistory.shift();
        }
        this.currentPos = coord;
    }

    onPointerUp(e) {
        if (e.pointerId !== this.pointerId) return;
        
        this.isDragging = false;
        this.pointerId = null;
        this.host.classList.remove('dragging');
        this.host.releasePointerCapture(e.pointerId);

        if (this.hasMoved && this.velocityHistory.length > 1) {
            const now = performance.now();
            const startPoint = this.velocityHistory[0];
            
            if (now - this.velocityHistory[this.velocityHistory.length - 1].time > 50) {
                this.velocity = 0;
            } else {
                const maxVel = this.isVertical ? 50 : 80;
                this.velocity = this.clamp(((this.scrollPos - startPoint.pos) / (now - startPoint.time)) * 16, -maxVel, maxVel); 
            }
        } else {
            this.velocity = 0;
        }

        this.velocityHistory = []; 
        
        if (Math.abs(this.velocity) < 0.5 && this.hasMoved) {
            this.targetScrollPos = this.clamp(Math.round(this.scrollPos / this.itemSize), 0, this.items.length - 1) * this.itemSize;
        }
    }

    emitChange() {
        const centerIndex = this.clamp(Math.round(this.scrollPos / this.itemSize), 0, this.items.length - 1);
        const val = this.items[centerIndex]?.value;
        if (val !== undefined && this.lastEmittedValue !== val) {
            this.lastEmittedValue = val;
            this.onChange(val); 
        }
    }

    forceRender() {
        if (!this.domItems.length) return;

        this.domItems.forEach((item, i) => {
            const dist = (i * this.itemSize) - this.scrollPos;
            const absDist = Math.abs(dist);
            
            const radius = this.isVertical ? this.itemSize * 3 : this.itemSize * 2.5; 
            const proximity = Math.max(0, 1 - absDist / radius);
            const scale = 0.7 + (0.3 * proximity); 
            
            const opacity = this.isVertical ? 0.2 + (0.8 * Math.pow(proximity, 1.5)) : 0.25 + (0.75 * Math.pow(proximity, 2));

            if (this.isVertical) {
                item.style.transform = `translate3d(0, ${dist}px, 0) scale(${scale}) rotateX(${-(dist / radius) * 25}deg)`;
            } else {
                item.style.transform = `translate3d(${dist}px, 0, 0) scale(${scale})`;
            }
            
            item.style.opacity = opacity;
            item.style.zIndex = Math.round(proximity * 100); 

            if (proximity > 0.95) item.classList.add('selected');
            else item.classList.remove('selected');
        });
    }

    animate() {
        if (!this.items.length) { requestAnimationFrame(() => this.animate()); return; }

        if (!this.isDragging) {
            if (this.targetScrollPos !== null) {
                const diff = this.targetScrollPos - this.scrollPos;
                this.scrollPos += diff * 0.15; 
                this.velocity = 0;

                if (Math.abs(diff) < 0.5) {
                    this.scrollPos = this.targetScrollPos;
                    this.targetScrollPos = null;
                    this.emitChange(); 
                }
            } 
            else if (Math.abs(this.velocity) > 0) {
                this.scrollPos += this.velocity;
                this.velocity *= (this.scrollPos < 0 || this.scrollPos > this.maxScroll) ? 0.8 : 0.92;

                if (Math.abs(this.velocity) < 0.5) { 
                    this.velocity = 0;
                    this.targetScrollPos = this.clamp(Math.round(this.scrollPos / this.itemSize), 0, this.items.length - 1) * this.itemSize;
                }
            }
            else if (this.scrollPos < 0) {
                this.scrollPos += (0 - this.scrollPos) * 0.2;
                if (this.scrollPos > -0.5) { this.scrollPos = 0; this.emitChange(); }
            }
            else if (this.scrollPos > this.maxScroll) {
                this.scrollPos += (this.maxScroll - this.scrollPos) * 0.2;
                if (this.scrollPos < this.maxScroll + 0.5) { this.scrollPos = this.maxScroll; this.emitChange(); }
            }
        }

        const centerIndex = this.clamp(Math.round(this.scrollPos / this.itemSize), 0, this.items.length - 1);
        const currentCenterValue = this.items[centerIndex]?.value;

        if (currentCenterValue !== undefined && this.lastHapticValue !== currentCenterValue) {
            this.lastHapticValue = currentCenterValue;
            if (Math.abs(this.velocity) > 0.5 || this.targetScrollPos !== null) {
                if (typeof app !== 'undefined' && app.haptic) app.haptic('selection');
                else if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
            }
        }

        this.forceRender();
        requestAnimationFrame(() => this.animate());
    }
}