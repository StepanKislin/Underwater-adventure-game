let game;

class Game {
    constructor() {
        game = this;
        this.canvas = document.getElementById('game');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('blur', () => this.keys = {});

        this.difficulties = {
            easy: { speedMult: 1.0, oxygenLoss: 0.06, mines: ['S','M','L'], repair: true, crystalsForSonar: 5, sonarAvailable: true },
            medium: { speedMult: 1.3, oxygenLoss: 0.08, mines: ['M','L'], repair: true, crystalsForSonar: 7, sonarAvailable: true },
            hard: { speedMult: 1.6, oxygenLoss: 0.10, mines: ['L'], repair: false, crystalsForSonar: Infinity, sonarAvailable: false }
        };

        this.state = 'menu';
        this.name = '';
        this.difficulty = 'medium';
        this.startTime = 0;
        this.elapsed = 0;
        this.lastFrame = 0;
        this.rafId = null;
        this.countdownTimer = null;
        this.deathReason = '';

        this.boatSize = 96;
        this.boat = { x: 0, y: 0, speed: 10.5 };
        this.boatTargetY = 0;
        this.emergenceActive = true;

        this.health = 100;
        this.oxygen = 100;
        this.crystals = 0;
        this.sonarCharge = 0;
        this.sonarActive = false;
        this.sonarEndTime = 0;

        this.objects = { crystals: [], mines: [], capsules: [], healers: [] };
        this.lastSpawn = { crystal: 0, mine: 0, capsule: 0, healer: 0 };
        this.particles = [];
        this.bgBubbles = [];

        this.sharkActive = false;
        this.sharkPos = { x: 0, y: 0 };
        this.sharkDir = 1;
        this.sharkSize = 100;
        this.sharkSpeed = 5.5;
        this.sharkTimer = null;
        this.sharkWarning = false;

        this.shake = 0;
        this.keys = {};
        this.isGameOver = false;

        this.bindEvents();

        const imgs = { bg: 'bg.jpg', player: 'player.png', shark: 'shark.png', bomb: 'bomb.png', crystal: 'crystall.png', healer: 'healer.png', oxygen: 'kislorod.png', sonar: 'sonar.png' };
        this.images = {};
        for (const [key, src] of Object.entries(imgs)) { this.images[key] = new Image(); this.images[key].src = src; }

        this.results = JSON.parse(localStorage.getItem('bathyscaphe_results') || '[]');
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.boatTargetY) { this.boatTargetY = this.canvas.height - 120; this.boat.y = Math.min(this.boat.y, this.boatTargetY); }
    }

    stopAllTimers() {
        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        if (this.sharkTimer) { clearTimeout(this.sharkTimer); this.sharkTimer = null; }
        if (this.countdownTimer) { clearTimeout(this.countdownTimer); this.countdownTimer = null; }
    }

    resetState() {
        this.stopAllTimers();
        this.health = 100;
        this.oxygen = 100;
        this.crystals = 0;
        this.sonarCharge = 0;
        this.sonarActive = false;
        this.sonarEndTime = 0;
        this.objects = { crystals: [], mines: [], capsules: [], healers: [] };
        this.elapsed = 0;
        this.particles = [];
        this.bgBubbles = [];
        this.lastSpawn = { crystal: 0, mine: 0, capsule: 0, healer: 0 };
        this.shake = 0;
        this.sharkWarning = false;
        this.sharkActive = false;
        this.sharkPos = { x: 0, y: 0 };
        this.boat.x = this.canvas.width / 2 - this.boatSize / 2;
        this.boat.y = this.canvas.height + 150;
        this.boatTargetY = this.canvas.height - 120;
        this.emergenceActive = true;
        this.keys = {};
        this.isGameOver = false;
        this.deathReason = '';
        document.body.classList.remove('sonar-active', 'shark-warning', 'paused');
        document.getElementById('pause')?.classList.remove('active');
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    bindEvents() {
        window.addEventListener('keydown', e => {
            if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
            const code = e.code;
            if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code)) this.keys[code] = true;
            if (code === 'KeyP' && this.state === 'playing') this.togglePause();
            if (code === 'KeyE' && this.state === 'playing') this.activateSonar();
        });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });

        const nameInput = document.getElementById('playerName');
        const startBtn = document.getElementById('startBtn');
        nameInput.addEventListener('input', () => { startBtn.disabled = nameInput.value.trim().length === 0; });
        startBtn.addEventListener('click', () => this.startGame());
        document.getElementById('resumeBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('pauseMenuBtn').addEventListener('click', () => { this.stopAllTimers(); this.goToMenu(); });
        document.getElementById('retryBtn').addEventListener('click', () => { this.stopAllTimers(); this.startGame(); });
        document.getElementById('menuBtn').addEventListener('click', () => { this.stopAllTimers(); this.goToMenu(); });
        document.getElementById('downloadJsonBtn').addEventListener('click', () => this.downloadResults());
        document.getElementById('showLeaderboardBtn').addEventListener('click', () => this.showLeaderboard());
        document.getElementById('lbDifficulty').addEventListener('change', () => this.showLeaderboard());
    }

    notify(msg, type = 'info') {
        const n = document.createElement('div'); n.className = 'notification'; n.textContent = msg;
        n.style.borderColor = type === 'success' ? '#2ed573' : type === 'error' ? '#ff4757' : '#00fbff';
        document.body.appendChild(n); setTimeout(() => n.remove(), 3000);
    }

    startGame() {
        this.resetState();
        document.getElementById('results')?.classList.add('hidden');
        document.getElementById('leaderboard')?.classList.add('hidden');
        document.getElementById('countdown')?.classList.add('hidden');

        this.difficulty = document.getElementById('difficulty').value || 'medium';
        const d = this.difficulties[this.difficulty] || this.difficulties.medium;

        document.getElementById('menu').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        this.name = document.getElementById('playerName').value.trim() || 'Игрок';
        document.getElementById('playerNameDisplay').textContent = this.escapeHtml(this.name);
        document.getElementById('crystalsNeeded').textContent = d.crystalsForSonar === Infinity ? '∞' : d.crystalsForSonar;
        this.updateHUD();

        this.state = 'countdown';
        let count = 3;
        const countEl = document.getElementById('countNum');
        countEl.textContent = count;
        document.getElementById('countdown').classList.remove('hidden');

        const tick = () => {
            if (this.state !== 'countdown') return;
            if (count > 0) {
                countEl.textContent = count--;
                this.countdownTimer = setTimeout(tick, 1000);
            } else {
                countEl.textContent = '🌊';
                this.countdownTimer = setTimeout(() => {
                    if (this.state !== 'countdown') return;
                    document.getElementById('countdown').classList.add('hidden');
                    this.state = 'playing';
                    this.startTime = Date.now();
                    this.lastFrame = Date.now();
                    this.gameLoop();
                    this.sharkTimer = setTimeout(() => this.spawnShark(), 4000 + Math.random() * 3000);
                    this.notify('Погружение началось! 🚀', 'success');
                }, 500);
            }
        };
        tick();
    }

    togglePause() {
        if (this.state === 'playing') {
            this.keys = {};
            this.stopAllTimers();
            this.state = 'paused';
            document.getElementById('pause').classList.add('active');
            document.body.classList.add('paused');
        } else if (this.state === 'paused') {
            this.keys = {};
            this.state = 'playing';
            document.getElementById('pause').classList.remove('active');
            document.body.classList.remove('paused');
            this.lastFrame = Date.now();
            this.gameLoop();
        }
    }

    activateSonar() {
        const d = this.difficulties[this.difficulty] || this.difficulties.medium;
        if (this.sonarCharge > 0 && !this.sonarActive && d.sonarAvailable) {
            this.sonarCharge = 0;
            this.sonarActive = true;
            this.sonarEndTime = Date.now() + 4000;
            document.body.classList.add('sonar-active');
            this.updateHUD();
            this.notify('📡 Сонар активирован!', 'success');
        }
    }

    gameLoop() {
        if (this.state !== 'playing' || this.isGameOver) return;
        const now = Date.now();
        let dt = (now - this.lastFrame) / 1000;
        if (isNaN(dt) || dt < 0) dt = 0.016;
        if (dt > 0.1) dt = 0.1;
        this.lastFrame = now;

        const d = this.difficulties[this.difficulty] || this.difficulties.medium;

        this.elapsed = Math.floor((now - this.startTime) / 1000);
        this.updateHUD();
        this.updatePlayer(dt, d);
        this.spawnObjects(now, d);
        this.updateObjects(dt, d);
        this.updateParticles(dt);
        this.updateBgBubbles(dt);
        this.updateShark(dt);
        this.checkCollisions();
        this.checkSharkCollisions();

        if (this.shake > 0) this.shake *= 0.9;
        if (this.shake < 0.5) this.shake = 0;
        if (this.sonarActive && Date.now() > this.sonarEndTime) {
            this.sonarActive = false;
            document.body.classList.remove('sonar-active');
        }

        if (this.health <= 0 || this.oxygen <= 0) { this.gameOver(); return; }
        this.draw();
        this.rafId = requestAnimationFrame(() => this.gameLoop());
    }

    updatePlayer(dt, d) {
        if (this.emergenceActive) {
            if (this.boat.y > this.boatTargetY) this.boat.y -= 300 * dt;
            else { this.boat.y = this.boatTargetY; this.emergenceActive = false; }
            return;
        }
        let dx = 0, dy = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) dy -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) dy += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
        if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
        this.boat.x += dx * this.boat.speed * d.speedMult;
        this.boat.y += dy * this.boat.speed * d.speedMult;
        this.boat.x = Math.max(0, Math.min(this.canvas.width - this.boatSize, this.boat.x));
        this.boat.y = Math.max(0, Math.min(this.canvas.height - this.boatSize, this.boat.y));
        this.oxygen = Math.max(0, this.oxygen - d.oxygenLoss * 100 * dt);
        if (isNaN(this.oxygen)) this.oxygen = 0;
    }

    spawnObjects(now, d) {
        if (now - this.lastSpawn.crystal > 1100) { this.spawn('crystal', d); this.lastSpawn.crystal = now; }
        if (now - this.lastSpawn.mine > 1100) { this.spawn('mine', d); this.lastSpawn.mine = now; }
        if (now - this.lastSpawn.capsule > 1800) { this.spawn('capsule', d); this.lastSpawn.capsule = now; }
        if (d.repair && now - this.lastSpawn.healer > 6000) { this.spawn('healer', d); this.lastSpawn.healer = now; }
    }

    spawn(type, d) {
        const x = Math.random() * (this.canvas.width - 80);
        let obj = { type, x, y: -70, size: 48, speed: 2.0, marked: false, picked: false };
        if (type === 'mine') {
            const types = { 'S': { size: 40, damage: 10, speed: 2.5, img: 'bomb' }, 'M': { size: 56, damage: 20, speed: 1.8, img: 'bomb' }, 'L': { size: 72, damage: 30, speed: 1.3, img: 'bomb' } };
            const t = d.mines[Math.floor(Math.random() * d.mines.length)];
            Object.assign(obj, types[t]);
        } else if (type === 'crystal') { obj.img = 'crystal'; }
        else if (type === 'capsule') { obj.img = 'oxygen'; obj.size = 52; }
        else if (type === 'healer') { obj.img = 'healer'; obj.size = 52; }
        const tooClose = this.objects[type + 's'].some(o => Math.abs(o.x - obj.x) < 70 && Math.abs(o.y - obj.y) < 70);
        if (!tooClose) this.objects[type + 's'].push(obj);
    }

    updateObjects(dt, d) {
        const speedMult = this.sonarActive ? 0.6 : 1;
        for (const arr of Object.values(this.objects)) {
            for (let i = arr.length - 1; i >= 0; i--) {
                const obj = arr[i];
                if (!obj || obj.picked) continue;
                obj.y += obj.speed * d.speedMult * speedMult;
                if (obj.y > this.canvas.height + 80) { arr.splice(i, 1); continue; }
                if (obj.type === 'mine') obj.marked = this.sonarActive;
            }
        }
    }

    updateBgBubbles(dt) {
        if (Math.random() < 0.05) this.bgBubbles.push({ x: Math.random() * this.canvas.width, y: this.canvas.height + 10, r: Math.random() * 3 + 1, speed: Math.random() * 1.5 + 0.5, wobble: Math.random() * Math.PI * 2 });
        for (let i = this.bgBubbles.length - 1; i >= 0; i--) {
            const b = this.bgBubbles[i]; b.y -= b.speed * 60 * dt; b.wobble += 0.05; b.x += Math.sin(b.wobble) * 0.5;
            if (b.y < -20) { this.bgBubbles.splice(i, 1); continue; }
        }
    }

    addParticle(x, y, color, count = 8) {
        for (let i = 0; i < count; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 1, color, size: Math.random() * 4 + 2 });
    }

    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i]; p.x += p.vx; p.y += p.vy; p.life -= dt * 2; p.vy += 0.1;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        }
    }

    spawnShark() {
        if (this.state !== 'playing') return;
        this.sharkActive = true;
        this.sharkDir = Math.random() > 0.5 ? 1 : -1;
        this.sharkPos = { x: this.sharkDir === 1 ? -this.sharkSize - 20 : this.canvas.width + 20, y: Math.random() * (this.canvas.height - this.sharkSize - 80) + 40 };
        this.sharkWarning = true; setTimeout(() => this.sharkWarning = false, 800);
    }

    updateShark(dt) {
        if (!this.sharkActive) return;
        this.sharkPos.x += this.sharkSpeed * this.sharkDir * (dt * 60);
        if ((this.sharkDir === 1 && this.sharkPos.x > this.canvas.width + 100) || (this.sharkDir === -1 && this.sharkPos.x < -this.sharkSize - 50)) {
            this.sharkActive = false;
            this.sharkTimer = setTimeout(() => this.spawnShark(), 4000 + Math.random() * 3000);
        }
    }

    checkCollisions() {
        const boat = { x: this.boat.x, y: this.boat.y, w: this.boatSize, h: this.boatSize };
        for (const [key, arr] of Object.entries(this.objects)) {
            for (let i = arr.length - 1; i >= 0; i--) {
                const obj = arr[i];
                if (!obj || obj.picked) continue;
                if (!this.intersect(boat, { x: obj.x, y: obj.y, w: obj.size, h: obj.size })) continue;

                if (obj.type === 'crystal') {
                    this.crystals++; obj.picked = true; arr.splice(i, 1);
                    this.addParticle(obj.x + obj.size/2, obj.y + obj.size/2, '#feca57', 12);
                    const d = this.difficulties[this.difficulty] || this.difficulties.medium;
                    if (this.crystals >= d.crystalsForSonar && this.sonarCharge < 1 && d.sonarAvailable) {
                        this.sonarCharge = 1; this.crystals = 0;
                        this.notify('📡 Сонар заряжен!', 'success');
                    }
                } else if (obj.type === 'mine') {
                    this.health = Math.max(0, this.health - obj.damage);
                    this.shake = 12; obj.picked = true; arr.splice(i, 1);
                    this.addParticle(obj.x + obj.size/2, obj.y + obj.size/2, '#ff4757', 20);
                    this.notify(`💥 Урон: ${obj.damage}`, 'error');
                } else if (obj.type === 'capsule') {
                    this.oxygen = Math.min(100, this.oxygen + 20); obj.picked = true; arr.splice(i, 1);
                    this.addParticle(obj.x + obj.size/2, obj.y + obj.size/2, '#4facfe', 10);
                    this.notify('🫁 +20% кислорода', 'success');
                } else if (obj.type === 'healer') {
                    this.health = Math.min(100, this.health + 20); obj.picked = true; arr.splice(i, 1);
                    this.addParticle(obj.x + obj.size/2, obj.y + obj.size/2, '#2ed573', 10);
                    this.notify('❤️ +20% прочности', 'success');
                }
            }
        }
    }

    checkSharkCollisions() {
        if (!this.sharkActive) return;
        const sharkBox = { x: this.sharkPos.x, y: this.sharkPos.y, w: this.sharkSize, h: this.sharkSize };
        const boat = { x: this.boat.x, y: this.boat.y, w: this.boatSize, h: this.boatSize };

        if (this.intersect(boat, sharkBox)) {
            this.health = Math.max(0, this.health - 20); this.shake = 10;
            this.addParticle(this.sharkPos.x + this.sharkSize/2, this.sharkPos.y + this.sharkSize/2, '#ff4757', 18);
            this.notify('🦈 Акула укусила!', 'error');
            this.sharkActive = false;
            this.sharkTimer = setTimeout(() => this.spawnShark(), 6000);
            return;
        }

        const mines = this.objects.mines;
        for (let i = mines.length - 1; i >= 0; i--) {
            const m = mines[i];
            if (!m || m.picked) continue;
            if (this.intersect(sharkBox, { x: m.x, y: m.y, w: m.size, h: m.size })) {
                this.sharkActive = false; m.picked = true; mines.splice(i, 1);
                this.addParticle(this.sharkPos.x + this.sharkSize/2, this.sharkPos.y + this.sharkSize/2, '#ff6b6b', 30);
                this.notify('💣 Акула подорвалась на мине!', 'success');
                this.shake = 8;
                this.sharkTimer = setTimeout(() => this.spawnShark(), 7000 + Math.random() * 4000);
                return;
            }
        }

        for (const [type, arr] of Object.entries(this.objects)) {
            for (let i = arr.length - 1; i >= 0; i--) {
                const obj = arr[i];
                if (!obj || obj.picked) continue;
                if (this.intersect(sharkBox, { x: obj.x, y: obj.y, w: obj.size, h: obj.size })) {
                    arr.splice(i, 1);
                    this.addParticle(obj.x + obj.size/2, obj.y + obj.size/2, '#00fbff', 8);
                }
            }
        }
    }

    intersect(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

    updateHUD() {
        const timerEl = document.getElementById('timer');
        const crysEl = document.getElementById('crystals');
        if (timerEl) timerEl.textContent = String(Math.floor(this.elapsed/60)).padStart(2,'0') + ':' + String(this.elapsed%60).padStart(2,'0');
        if (crysEl) crysEl.textContent = this.crystals;
        const hf = document.getElementById('health-fill');
        const of = document.getElementById('oxygen-fill');
        if (hf) hf.style.width = Math.max(0, Math.min(100, this.health)) + '%';
        if (of) of.style.width = Math.max(0, Math.min(100, this.oxygen)) + '%';
        const s = document.getElementById('sonar');
        if (s) s.textContent = this.sonarCharge;
        document.body.classList.toggle('shark-warning', this.sharkWarning);
    }

    draw() {
        const ctx = this.ctx;
        const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
        const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
        ctx.translate(sx, sy);
        ctx.clearRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);

        if (this.images.bg.complete) ctx.drawImage(this.images.bg, 0, 0, this.canvas.width, this.canvas.height);

        ctx.globalAlpha = 0.4; ctx.fillStyle = '#aaddff';
        for (const b of this.bgBubbles) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); }
        ctx.globalAlpha = 1;

        for (const p of this.particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); }
        ctx.globalAlpha = 1;
        for (const arr of Object.values(this.objects)) for (const obj of arr) { if (obj && !obj.picked) this.drawObject(obj); }
        this.drawPlayer(); this.drawShark();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    drawObject(obj) {
        const ctx = this.ctx, img = this.images[obj.img];
        if (img?.complete) {
            ctx.drawImage(img, obj.x, obj.y, obj.size, obj.size);
        } else {
            ctx.fillStyle = obj.type === 'crystal' ? '#feca57' :
                obj.type === 'mine' ? '#ff4757' :
                    obj.type === 'capsule' ? '#4facfe' : '#2ed573';
            ctx.beginPath(); ctx.arc(obj.x + obj.size/2, obj.y + obj.size/2, obj.size/2, 0, Math.PI*2); ctx.fill();
        }
        if (obj.marked) { ctx.beginPath(); ctx.arc(obj.x + obj.size/2, obj.y + obj.size/2, obj.size + 15, 0, Math.PI*2); ctx.strokeStyle = 'rgba(255,255,0,0.9)'; ctx.lineWidth = 4; ctx.stroke(); }
    }

    drawPlayer() {
        const ctx = this.ctx, img = this.images.player, { x, y } = this.boat;
        if (img?.complete) {
            ctx.drawImage(img, x, y, this.boatSize, this.boatSize);
        } else {
            ctx.fillStyle = '#9b59b6';
            ctx.beginPath(); ctx.arc(x + this.boatSize/2, y + this.boatSize/2, this.boatSize/2, 0, Math.PI*2); ctx.fill();
        }
    }

    drawShark() {
        if (!this.sharkActive) return;
        const ctx = this.ctx, img = this.images.shark;
        ctx.save();
        const cx = this.sharkPos.x + this.sharkSize/2;
        const cy = this.sharkPos.y + this.sharkSize/2;
        ctx.translate(cx, cy);
        if (this.sharkDir === 1) ctx.scale(-1, 1);
        if (img?.complete) {
            ctx.drawImage(img, -this.sharkSize/2, -this.sharkSize/2, this.sharkSize, this.sharkSize);
        } else {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath(); ctx.arc(0, 0, this.sharkSize/2, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }

    gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.stopAllTimers();

        if (this.health <= 0) {
            this.deathReason = '💔 Корпус разрушен';
        } else {
            this.deathReason = '🫁 Закончился кислород';
        }

        this.state = 'gameover';
        document.getElementById('hud').classList.add('hidden');
        const result = { client: 'bathyscaphe-game', name: this.name, difficulty: this.difficulty, time: this.elapsed, crystals: this.crystals, timestamp: new Date().toISOString() };
        this.results.unshift(result); this.results.sort((a, b) => b.time - a.time); if (this.results.length > 100) this.results.pop();
        try {
            localStorage.setItem('bathyscaphe_results', JSON.stringify(this.results));
        } catch (e) { console.warn('LocalStorage недоступен:', e); }
        document.getElementById('resName').textContent = this.escapeHtml(result.name);
        document.getElementById('resTime').textContent = String(Math.floor(result.time/60)).padStart(2,'0') + ':' + String(result.time%60).padStart(2,'0');
        document.getElementById('resCrystals').textContent = result.crystals;
        const reasonEl = document.getElementById('resDeathReason');
        if (reasonEl) reasonEl.innerHTML = `<span class="death-reason ${this.health <= 0 ? 'health' : 'oxygen'}">${this.deathReason}</span>`;
        document.getElementById('apiStatus').textContent = '✅ Результат сохранён локально';
        document.getElementById('results').classList.remove('hidden');
        this.notify('Экспедиция завершена 🏁', 'info');
    }

    goToMenu() {
        this.resetState();
        document.getElementById('results')?.classList.add('hidden');
        document.getElementById('leaderboard')?.classList.add('hidden');
        document.getElementById('menu').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        const nameInput = document.getElementById('playerName');
        if (nameInput && nameInput.value.trim()) {
            document.getElementById('startBtn').disabled = false;
        }
        this.state = 'menu';
    }

    downloadResults() {
        const blob = new Blob([JSON.stringify(this.results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bathyscaphe_results.json';
        a.click();
        URL.revokeObjectURL(url);
        this.notify('📁 Файл скачан!', 'success');
    }

    showLeaderboard() {
        document.getElementById('results')?.classList.add('hidden');
        document.getElementById('menu')?.classList.add('hidden');
        document.getElementById('leaderboard')?.classList.remove('hidden');
        const filter = document.getElementById('lbDifficulty').value;
        const filtered = filter === 'all' ? this.results : this.results.filter(r => r.difficulty === filter);
        const tbody = document.getElementById('lbBody');
        tbody.innerHTML = '';
        filtered.sort((a, b) => b.time - a.time).slice(0, 20).forEach((r, idx) => {
            const tr = document.createElement('tr'),
                timeStr = String(Math.floor(r.time/60)).padStart(2,'0') + ':' + String(r.time%60).padStart(2,'0');
            const diffBadge = {
                easy: '<span class="badge easy">Лёгкий</span>',
                medium: '<span class="badge medium">Средний</span>',
                hard: '<span class="badge hard">Сложный</span>'
            }[r.difficulty] || r.difficulty;
            tr.innerHTML = `<td style="font-weight:700;color:#00fbff">${idx + 1}</td><td>${this.escapeHtml(r.name)}</td><td>${diffBadge}</td><td><strong>${timeStr}</strong></td><td style="color:#feca57">${r.crystals}</td><td style="opacity:0.8">${new Date(r.timestamp).toLocaleDateString('ru-RU')}</td>`;
            tbody.appendChild(tr);
        });
        if (filtered.length === 0) tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:20px;opacity:0.7">Нет записей</td></tr>';
    }
}

document.addEventListener('DOMContentLoaded', () => { new Game(); });