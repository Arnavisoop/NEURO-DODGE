/* NEURO DODGE - Main Game Logic */
(() => {
    // ==== CONFIG ====
    const CONFIG = {
        PLAYER_SIZE: 40,
        PLAYER_SPEED: 5,
        BASE_ENEMY_SPEED: 1.5,
        ENEMY_SPAWN_RATE: 800, // ms at level 1
        MAX_ENEMIES_ON_SCREEN: 10,
        LEVEL_TIME_BASE: 20000, // 20 seconds
        LEVEL_TIME_INCREMENT: 2000, // +2 sec per level
        HEALTH_START: 3,
        COMBO_RESET_ON_MISS: true,
        PARTICLE_COUNT: 12,
    };

    const ENEMY_CHARS = ['>', '<', '!', '@', '#', '$', '%', '&', '*', '+', '=', '?'];
    const PATTERNS = ['straight', 'sine', 'zigzag'];

    // ==== STATE ====
    let state = {
        level: 1,
        score: 0,
        health: CONFIG.HEALTH_START,
        combo: 0,
        maxCombo: 0,
        enemiesAvoided: 0,
        startTime: null,
        elapsedTime: 0,
        paused: false,
        gameOver: false,
        levelComplete: false,
        enemies: [],
        particles: [],
        lastEnemySpawn: 0,
        animationFrame: null,
        highScore: parseInt(localStorage.getItem('neuroDodgeHighScore')) || 0,
        // For AI skill calculation
        reactionTimes: [],
        lastDodgeTime: 0,
    };

    // ==== CACHED ELEMENTS ====
    const els = {
        gameContainer: document.getElementById('gameContainer'),
        startMenu: document.getElementById('startMenu'),
        hud: document.getElementById('hud'),
        levelValue: document.getElementById('levelValue'),
        scoreValue: document.getElementById('scoreValue'),
        healthValue: document.getElementById('healthValue'),
        comboValue: document.getElementById('comboValue'),
        timerValue: document.getElementById('timerValue'),
        aiScoreValue: document.getElementById('aiScoreValue'),
        gameCanvas: document.getElementById('gameCanvas'),
        player: document.getElementById('player'),
        pauseMenu: document.getElementById('pauseMenu'),
        levelCompleteMenu: document.getElementById('levelCompleteMenu'),
        lcScore: document.getElementById('lcScore'),
        lcCombo: document.getElementById('lcCombo'),
        gameOverMenu: document.getElementById('gameOverMenu'),
        goScore: document.getElementById('goScore'),
        goHighScore: document.getElementById('goHighScore'),
        mobileControls: document.getElementById('mobileControls'),
        startBtn: document.getElementById('startBtn'),
        resumeBtn: document.getElementById('resumeBtn'),
        restartBtn: document.getElementById('restartBtn'),
        quitToMenuBtn: document.getElementById('quitToMenuBtn'),
        nextLevelBtn: document.getElementById('nextLevelBtn'),
        retryBtn: document.getElementById('retryBtn'),
        menuBtn: document.getElementById('menuBtn'),
        highScoreDisplay: document.getElementById('highScoreDisplay'),
        highScoreValue: document.getElementById('highScoreValue'),
        bgMusic: document.getElementById('bgMusic'),
        sfxHit: document.getElementById('sfxHit'),
        sfxPoint: document.getElementById('sfxPoint'),
        sfxLevelUp: document.getElementById('sfxLevelUp'),
    };

    // ==== INIT ====
    function init() {
        loadHighScore();
        updateHUD();
        bindEvents();
        resizeCanvas();
        // start menu already visible
    }

    function loadHighScore() {
        const saved = localStorage.getItem('neuroDodgeHighScore');
        if (saved !== null) {
            state.highScore = parseInt(saved);
            els.highScoreValue.textContent = state.highScore;
        }
    }

    function saveHighScore() {
        if (state.score > state.highScore) {
            state.highScore = state.score;
            localStorage.setItem('neuroDodgeHighScore', state.highScore);
            els.highScoreValue.textContent = state.highScore;
        }
    }

    function bindEvents() {
        // Keyboard
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('resize', resizeCanvas);

        // Buttons
        els.startBtn.addEventListener('click', startGame);
        els.resumeBtn.addEventListener('click', resumeGame);
        els.restartBtn.addEventListener('click', restartGame);
        els.quitToMenuBtn.addEventListener('click', () => { cancelAnimationFrame(state.animationFrame); showStartMenu(); });
        els.nextLevelBtn.addEventListener('click', nextLevel);
        els.retryBtn.addEventListener('click', restartGame);
        els.menuBtn.addEventListener('click', () => { cancelAnimationFrame(state.animationFrame); showStartMenu(); });

        // Mobile controls
        els.mobileControls.querySelectorAll('.control-btn').forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const key = btn.dataset.key;
                handleKeyDown({ key });
            });
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                const key = btn.dataset.key;
                handleKeyUp({ key });
            });
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const key = btn.dataset.key;
                handleKeyDown({ key });
            });
            btn.addEventListener('mouseup', (e) => {
                e.preventDefault();
                const key = btn.dataset.key;
                handleKeyUp({ key });
            });
        });

        // Pause on P or Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
                if (!state.gameOver && !state.levelComplete) {
                    togglePause();
                }
            }
        });
    }

    function resizeCanvas() {
        const canvas = els.gameCanvas;
        const width = Math.min(window.innerWidth * 0.9, 600);
        const height = Math.min(window.innerHeight * 0.6, 500);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    }

    // ==== GAME LOOP ====
    function gameLoop(timestamp) {
        if (!state.startTime) state.startTime = timestamp;
        const delta = timestamp - (state.lastRender || timestamp);
        state.lastRender = timestamp;

        if (!state.paused && !state.gameOver && !state.levelComplete) {
            update(timestamp);
            render();
        }

        state.animationFrame = requestAnimationFrame(gameLoop);
    }

    function update(timestamp) {
        state.elapsedTime = timestamp - state.startTime;
        updateTimerHUD();

        // Spawn enemies
        const spawnRate = Math.max(100, CONFIG.ENEMY_SPAWN_RATE - (state.level - 1) * 30);
        if (timestamp - state.lastEnemySpawn > spawnRate && state.enemies.length < CONFIG.MAX_ENEMIES_ON_SCREEN) {
            spawnEnemy();
            state.lastEnemySpawn = timestamp;
        }

        // Update enemies
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const enemy = state.enemies[i];
            enemy.y += enemy.speed * (delta / 16); // approximate 60fps
            // pattern movement
            switch (enemy.pattern) {
                case 'sine':
                    enemy.x = enemy.startX + enemy.amplitude * Math.sin(enemy.frequency * enemy.y);
                    break;
                case 'zigzag':
                    enemy.x = enemy.startX + enemy.offset * Math.sign(Math.sin(enemy.frequency * enemy.y));
                    break;
                // straight: nothing
            }

            // Remove if off screen
            if (enemy.y > window.innerHeight + 50) {
                enemy.el.remove();
                state.enemies.splice(i, 1);
                state.enemiesAvoided++;
                state.combo++;
                if (state.combo > state.maxCombo) state.maxCombo = state.combo;
                state.lastDodgeTime = timestamp;
                // reaction time approximate
                if (enemy.spawnTime) {
                    const reaction = timestamp - enemy.spawnTime;
                    state.reactionTimes.push(reaction);
                }
                increaseScore(10);
                createParticles(enemy.x, enemy.y - 20, 'success');
                continue;
            }

            // Collision with player
            const playerRect = els.player.getBoundingClientRect();
            const enemyRect = enemy.el.getBoundingClientRect();
            if (
                enemyRect.left < playerRect.right &&
                enemyRect.right > playerRect.left &&
                enemyRect.top < playerRect.bottom &&
                enemyRect.bottom > playerRect.top
            ) {
                enemy.el.remove();
                state.enemies.splice(i, 1);
                state.health--;
                state.combo = 0;
                state.lastDodgeTime = 0;
                increaseScore(-15);
                createParticles(enemy.x, enemy.y, 'danger');
                playSound(els.sfxHit);
                if (state.health <= 0) endGame();
            }
        }

        // Update particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) {
                p.el.remove();
                state.particles.splice(i, 1);
            } else {
                p.el.style.left = `${p.x}px`;
                p.el.style.top = `${p.y}px`;
                p.el.style.opacity = p.life / p.maxLife;
            }
        }

        // Check level completion
        const levelTime = CONFIG.LEVEL_TIME_BASE + (state.level - 1) * CONFIG.LEVEL_TIME_INCREMENT;
        if (state.elapsedTime >= levelTime) {
            completeLevel();
        }
    }

    function render() {
        // Update enemy positions
        state.enemies.forEach(e => {
            e.el.style.left = `${e.x}px`;
            e.el.style.top = `${e.y}px`;
        });
    }

    // ==== SPAWNING ====
    function spawnEnemy() {
        const canvasWidth = els.gameCanvas.clientWidth;
        const char = ENEMY_CHARS[Math.floor(Math.random() * ENEMY_CHARS.length)];
        const x = Math.random() * (canvasWidth - 30) + 15; // keep within bounds
        const speed = CONFIG.BASE_ENEMY_SPEED + (state.level - 1) * 0.2 + Math.random() * 0.5;
        const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
        let amplitude, frequency, offset;
        if (pattern === 'sine') {
            amplitude = Math.random() * 50 + 20;
            frequency = Math.random() * 0.02 + 0.005;
        } else if (pattern === 'zigzag') {
            offset = Math.random() * 40 + 20;
            frequency = Math.random() * 0.03 + 0.01;
        }

        const el = document.createElement('div');
        el.className = 'enemy';
        el.textContent = char;
        el.style.left = `${x}px`;
        el.style.top = `-30px`;
        el.style.fontSize = `${1.4 + Math.random() * 0.6}rem`;
        els.gameCanvas.appendChild(el);

        state.enemies.push({
            x,
            y: -30,
            char,
            speed,
            pattern,
            startX: x,
            amplitude,
            frequency,
            offset,
            el,
            spawnTime: performance.now()
        });
    }

    // ==== SCORE / HUD ====
    function increaseScore(amount) {
        state.score = Math.max(0, state.score + amount);
        els.scoreValue.textContent = state.score;
    }

    function updateTimerHUD() {
        const seconds = Math.floor(state.elapsedTime / 1000);
        els.timerValue.textContent = seconds;
    }

    function updateHUD() {
        els.levelValue.textContent = state.level;
        els.scoreValue.textContent = state.score;
        els.healthValue.textContent = state.health;
        els.comboValue.textContent = state.combo;
        els.timerValue.textContent = Math.floor(state.elapsedTime / 1000);
        updateAISkill();
    }

    function updateAISkill() {
        const survival = state.elapsedTime / 1000;
        const avoided = state.enemiesAvoided;
        const combo = state.maxCombo;
        const level = state.level;
        const reactionAvg = state.reactionTimes.length ?
            (state.reactionTimes.reduce((a,b)=>a+b,0)/state.reactionTimes.length)/1000 : 0;
        // AI Skill score formula (0-1000)
        const skill = Math.min(1000,
            survival * 5 +
            avoided * 0.5 +
            combo * 10 +
            level * 20 -
            reactionAvg * 2 // faster reaction = higher skill
        );
        els.aiScoreValue.textContent = Math.floor(skill);
    }

    // ==== LEVEL / GAME STATE ====
    function completeLevel() {
        state.levelComplete = true;
        cancelAnimationFrame(state.animationFrame);
        els.lcScore.textContent = state.score;
        els.lcCombo.textContent = state.maxCombo;
        els.levelCompleteMenu.style.display = 'flex';
        playSound(els.sfxLevelUp);
    }

    function nextLevel() {
        state.levelComplete = false;
        state.level++;
        // clear enemies
        state.enemies.forEach(e => e.el.remove());
        state.enemies = [];
        state.lastEnemySpawn = 0;
        state.startTime = null;
        state.elapsedTime = 0;
        updateHUD();
        els.levelCompleteMenu.style.display = 'none';
        state.animationFrame = requestAnimationFrame(gameLoop);
    }

    function endGame() {
        state.gameOver = true;
        cancelAnimationFrame(state.animationFrame);
        saveHighScore();
        els.goScore.textContent = state.score;
        els.goHighScore.textContent = state.highScore;
        els.gameOverMenu.style.display = 'flex';
        playSound(els.sfxHit);
    }

    function restartGame() {
        // reset state
        state = {
            level: 1,
            score: 0,
            health: CONFIG.HEALTH_START,
            combo: 0,
            maxCombo: 0,
            enemiesAvoided: 0,
            startTime: null,
            elapsedTime: 0,
            paused: false,
            gameOver: false,
            levelComplete: false,
            enemies: [],
            particles: [],
            lastEnemySpawn: 0,
            animationFrame: null,
            highScore: state.highScore, // keep high score
            reactionTimes: [],
            lastDodgeTime: 0,
        };
        // clear DOM
        state.enemies.forEach(e => e.el.remove());
        state.particles.forEach(p => p.el.remove());
        // also clear any leftover (should be none)
        els.gameCanvas.querySelectorAll('.enemy').forEach(el => el.remove());
        els.gameCanvas.querySelectorAll('.particle').forEach(el => el.remove());
        updateHUD();
        els.gameOverMenu.style.display = 'none';
        els.levelCompleteMenu.style.display = 'none';
        els.pauseMenu.style.display = 'none';
        startGame();
    }

    function togglePause() {
        state.paused = !state.paused;
        els.pauseMenu.style.display = state.paused ? 'flex' : 'none';
        if (state.paused) {
            cancelAnimationFrame(state.animationFrame);
        } else {
            state.lastRender = null;
            state.animationFrame = requestAnimationFrame(gameLoop);
        }
    }

    function showStartMenu() {
        els.startMenu.style.display = 'flex';
        els.hud.style.display = 'none';
        els.gameCanvas.style.display = 'none';
        els.mobileControls.style.display = 'none';
        cancelAnimationFrame(state.animationFrame);
        state.paused = false;
        state.gameOver = false;
        state.levelComplete = false;
    }

    function startGame() {
        els.startMenu.style.display = 'none';
        els.hud.style.display = 'flex';
        els.gameCanvas.style.display = 'block';
        els.mobileControls.style.display = 'flex';
        state.startTime = null;
        state.elapsedTime = 0;
        state.level = 1;
        state.score = 0;
        state.health = CONFIG.HEALTH_START;
        state.combo = 0;
        state.maxCombo = 0;
        state.enemiesAvoided = 0;
        state.enemies = [];
        state.particles = [];
        state.lastEnemySpawn = 0;
        state.reactionTimes = [];
        updateHUD();
        // reset player position to center bottom
        const canvasRect = els.gameCanvas.getBoundingClientRect();
        els.player.style.left = (canvasRect.width / 2) + 'px';
        els.player.style.top = (canvasRect.height * 0.85) + 'px'; // slightly above bottom
        els.player.style.transform = 'translateX(-50%)';
        state.animationFrame = requestAnimationFrame(gameLoop);
    }

    // ==== INPUT ====
    const keys = {};
    function handleKeyDown(e) {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)) {
            e.preventDefault();
            keys[e.key.toLowerCase()] = true;
            movePlayer(e.key);
        }
    }
    function handleKeyUp(e) {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)) {
            keys[e.key.toLowerCase()] = false;
        }
    }

    function movePlayer(key) {
        const move = CONFIG.PLAYER_SPEED;
        const canvasRect = els.gameCanvas.getBoundingClientRect();
        const playerRect = els.player.getBoundingClientRect();
        let left = parseFloat(els.player.style.left) || 0;
        let top = parseFloat(els.player.style.top) || 0;
        const maxX = canvasRect.width - playerRect.width;
        const maxY = canvasRect.height - playerRect.height;

        switch (key.toLowerCase()) {
            case 'arrowup':
            case 'w':
                top = Math.max(0, top - move);
                break;
            case 'arrowdown':
            case 's':
                top = Math.min(maxY, top + move);
                break;
            case 'arrowleft':
            case 'a':
                left = Math.max(0, left - move);
                break;
            case 'arrowright':
            case 'd':
                left = Math.min(maxX, left + move);
                break;
        }
        els.player.style.left = `${left}px`;
        els.player.style.top = `${top}px`;
        // keep transform for centering? Actually we already set left/top as pixel offsets from left/top, so we need to adjust for centering.
        // We set initial left as canvasWidth/2, which is the left edge of the player? Actually we want the player's center at that point.
        // So we need to offset by -playerWidth/2. We'll incorporate that in the initial setting and movement.
        // Simpler: we store player position as center coordinates, and convert to left/top each frame.
        // Let's change approach: store playerX/Y as center.
        // Due to time, we'll keep current method but note that initial left is set to canvasRect.width/2, which is the left edge? Actually we set left to canvasRect.width/2, then transform: translateX(-50%) which shifts left by half its own width, making the center at canvasRect.width/2.
        // When we change left/top in pixels without transform, we break centering.
        // So we need to either keep transform and adjust left as center minus half width, or remove transform and adjust left accordingly.
        // Let's remove transform and compute left as center - playerWidth/2.
        // We'll assume player width is 40px (CONFIG.PLAYER_SIZE). We'll compute half = 20.
        const halfPlayer = CONFIG.PLAYER_SIZE / 2;
        els.player.style.left = (left - halfPlayer) + 'px';
        els.player.style.top = (top - halfPlayer) + 'px';
        els.player.style.transform = 'none';
    }

    // ==== PARTICLES ====
    function createParticles(x, y, type) {
        const colors = {
            success: ['#4dff4d', '#00ff00'],
            danger: ['#ff4d4d', '#ff0000'],
            neutral: ['#00ffff', '#00cccc']
        };
        const palette = colors[type] || colors.neutral;
        for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
            const angle = Math.random * Math.PI * 2;
            const speed = 2 + Math.random * 3;
            const p = {
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 30 + Math.random * 20,
                maxLife: 30 + Math.random * 20,
                color: palette[Math.floor(Math.random * palette.length)],
                el: null
            };
            const el = document.createElement('div');
            el.className = 'particle';
            el.style.position = 'absolute';
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.width = '4px';
            el.style.height = '4px';
            el.style.background = p.color;
            el.style.borderRadius = '50%';
            el.style.pointerEvents = 'none';
            els.gameCanvas.appendChild(el);
            p.el = el;
            state.particles.push(p);
        }
    }

    // ==== SOUND ====
    function playSound(audio) {
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(()=>{}); // ignore autoplay restrictions
        }
    }

    // ==== START ====
    init();
})();