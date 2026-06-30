// Asteroids — HTML5 Canvas
'use strict';

const canvas  = document.getElementById('c');
const ctx     = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');

// ── sizing ───────────────────────────────────────────────────────────────────
function resize() {
  const s = Math.min(window.innerWidth - 8, window.innerHeight - 80, 700);
  canvas.width  = s;
  canvas.height = s;
}
resize();
window.addEventListener('resize', resize);

const W = () => canvas.width;
const H = () => canvas.height;

// ── constants ────────────────────────────────────────────────────────────────
const SHIP_SIZE    = 20;
const TURN_SPEED   = 4.5;   // deg/frame
const THRUST       = 0.12;
const FRICTION     = 0.985;
const BULLET_SPEED = 9;
const BULLET_LIFE  = 55;    // frames
const INVINCIBLE   = 180;   // frames after respawn
const MAX_LIVES    = 5;

// ── state ────────────────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles;
let score, lives, level, state;   // state: 'title' | 'play' | 'dead' | 'over'
let invTimer, levelTimer;
const keys = {};

// ── vector helpers ───────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const rad = d => d * Math.PI / 180;
const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
const rndInt = (lo, hi) => Math.floor(rnd(lo, hi + 1));
function wrap(v, max) {
  if (v < 0)   return v + max;
  if (v >= max) return v - max;
  return v;
}

// ── ship ─────────────────────────────────────────────────────────────────────
function makeShip() {
  return {
    x: W() / 2, y: H() / 2,
    vx: 0, vy: 0,
    angle: -90,   // pointing up
    thrusting: false,
  };
}

function drawShip(s, alpha = 1) {
  const a = rad(s.angle);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(a);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#0ff';
  ctx.lineWidth   = 2;
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.moveTo(SHIP_SIZE, 0);
  ctx.lineTo(-SHIP_SIZE * 0.7,  SHIP_SIZE * 0.6);
  ctx.lineTo(-SHIP_SIZE * 0.35, 0);
  ctx.lineTo(-SHIP_SIZE * 0.7, -SHIP_SIZE * 0.6);
  ctx.closePath();
  ctx.stroke();
  if (s.thrusting) {
    ctx.strokeStyle = `hsl(${rndInt(10, 50)},100%,60%)`;
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#f80';
    ctx.beginPath();
    ctx.moveTo(-SHIP_SIZE * 0.35, SHIP_SIZE * 0.25);
    ctx.lineTo(-SHIP_SIZE * rnd(0.9, 1.4), 0);
    ctx.lineTo(-SHIP_SIZE * 0.35, -SHIP_SIZE * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

// ── asteroids ────────────────────────────────────────────────────────────────
const SIZES = [48, 28, 16];  // large, medium, small (radius)

function makeAsteroid(x, y, sizeIdx) {
  const angle  = rnd(0, TAU);
  const speed  = rnd(0.4, 1.0 + level * 0.15);
  const verts  = rndInt(7, 14);
  const offsets = Array.from({length: verts}, () => rnd(0.7, 1.3));
  return { x, y, sizeIdx,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: SIZES[sizeIdx],
    angle: 0, spin: rnd(-1.5, 1.5),
    verts, offsets };
}

function spawnAsteroids() {
  asteroids = [];
  const count = 3 + level;
  for (let i = 0; i < count; i++) {
    let x, y;
    // keep away from ship
    do {
      x = rnd(0, W());
      y = rnd(0, H());
    } while (Math.hypot(x - W()/2, y - H()/2) < 140);
    asteroids.push(makeAsteroid(x, y, 0));
  }
}

function drawAsteroid(a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(rad(a.angle));
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth   = 1.5;
  ctx.shadowColor = '#666';
  ctx.shadowBlur  = 6;
  ctx.beginPath();
  for (let i = 0; i < a.verts; i++) {
    const ang = (i / a.verts) * TAU;
    const r   = a.radius * a.offsets[i];
    i === 0
      ? ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
      : ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// ── bullets ──────────────────────────────────────────────────────────────────
function shoot() {
  const a = rad(ship.angle);
  bullets.push({
    x:  ship.x + Math.cos(a) * SHIP_SIZE,
    y:  ship.y + Math.sin(a) * SHIP_SIZE,
    vx: Math.cos(a) * BULLET_SPEED + ship.vx,
    vy: Math.sin(a) * BULLET_SPEED + ship.vy,
    life: BULLET_LIFE,
  });
}

function drawBullet(b) {
  ctx.beginPath();
  ctx.arc(b.x, b.y, 2.5, 0, TAU);
  ctx.fillStyle   = '#ff0';
  ctx.shadowColor = '#ff0';
  ctx.shadowBlur  = 10;
  ctx.fill();
}

// ── particles ────────────────────────────────────────────────────────────────
function explode(x, y, color = '#fa0', count = 18) {
  for (let i = 0; i < count; i++) {
    const angle = rnd(0, TAU);
    const speed = rnd(0.5, 4);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rndInt(20, 55),
      color,
    });
  }
}

function drawParticle(p) {
  ctx.globalAlpha = p.life / 55;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 1.5, 0, TAU);
  ctx.fillStyle   = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur  = 8;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── collision ────────────────────────────────────────────────────────────────
function circle(ax, ay, ar, bx, by, br) {
  return Math.hypot(ax - bx, ay - by) < ar + br;
}

// ── scoring ──────────────────────────────────────────────────────────────────
const POINTS = [20, 50, 100];   // large→medium→small
function addScore(sizeIdx) {
  score += POINTS[sizeIdx];
  scoreEl.textContent = score;
}

// ── game loop ────────────────────────────────────────────────────────────────
let lastShot  = 0;
let frameCount = 0;

function startGame() {
  score      = 0;
  lives      = 3;
  level      = 1;
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent  = level;
  ship       = makeShip();
  bullets    = [];
  particles  = [];
  invTimer   = INVINCIBLE;
  levelTimer = 0;
  state      = 'play';
  overlay.style.display = 'none';
  spawnAsteroids();
}

function respawn() {
  ship     = makeShip();
  invTimer = INVINCIBLE;
  state    = 'play';
}

function showOverlay(title, sub, hint = '') {
  overlay.innerHTML = `
    <h1>${title}</h1>
    <p>${sub}</p>
    ${hint ? `<small>${hint}</small>` : ''}
  `;
  overlay.style.display = 'flex';
}

function nextLevel() {
  level++;
  levelEl.textContent = level;
  ship    = makeShip();
  bullets = [];
  invTimer = INVINCIBLE;
  spawnAsteroids();
  state = 'play';
}

let shootQueued = false;

function update() {
  frameCount++;

  if (state === 'title' || state === 'over') return;

  if (state === 'dead') {
    levelTimer--;
    if (levelTimer <= 0) {
      if (lives > 0) respawn();
      else { state = 'over'; showOverlay('GAME OVER', `Score: ${score}`, 'Press ENTER to play again'); }
    }
    return;
  }

  // ── input ────────────────────────────────────────────────────────────────
  const left  = keys['ArrowLeft']  || keys['KeyA'];
  const right = keys['ArrowRight'] || keys['KeyD'];
  const up    = keys['ArrowUp']    || keys['KeyW'];
  const fire  = keys['Space'] || keys['KeyF'];

  if (left)  ship.angle -= TURN_SPEED;
  if (right) ship.angle += TURN_SPEED;
  ship.thrusting = !!up;
  if (up) {
    const a = rad(ship.angle);
    ship.vx += Math.cos(a) * THRUST;
    ship.vy += Math.sin(a) * THRUST;
  }

  // speed cap
  const spd = Math.hypot(ship.vx, ship.vy);
  if (spd > 7) { ship.vx = ship.vx/spd*7; ship.vy = ship.vy/spd*7; }

  ship.vx *= FRICTION; ship.vy *= FRICTION;
  ship.x = wrap(ship.x + ship.vx, W());
  ship.y = wrap(ship.y + ship.vy, H());

  // shooting (rate-limited to every 12 frames)
  if ((fire || shootQueued) && frameCount - lastShot >= 12) {
    shoot(); lastShot = frameCount; shootQueued = false;
  }

  // ── bullets ──────────────────────────────────────────────────────────────
  bullets = bullets.filter(b => b.life-- > 0);
  for (const b of bullets) {
    b.x = wrap(b.x + b.vx, W());
    b.y = wrap(b.y + b.vy, H());
  }

  // ── asteroids ────────────────────────────────────────────────────────────
  for (const a of asteroids) {
    a.x = wrap(a.x + a.vx, W());
    a.y = wrap(a.y + a.vy, H());
    a.angle += a.spin;
  }

  // ── particles ────────────────────────────────────────────────────────────
  particles = particles.filter(p => p.life-- > 0);
  for (const p of particles) { p.x += p.vx; p.y += p.vy; }

  // ── bullet × asteroid ────────────────────────────────────────────────────
  const nextAsteroids = [];
  const hitBullets    = new Set();

  for (const a of asteroids) {
    let hit = false;
    for (let bi = 0; bi < bullets.length; bi++) {
      const b = bullets[bi];
      if (circle(b.x, b.y, 3, a.x, a.y, a.radius)) {
        hitBullets.add(bi);
        hit = true;
        addScore(a.sizeIdx);
        explode(a.x, a.y, '#fa0', 14);
        if (a.sizeIdx < 2) {
          for (let k = 0; k < 2; k++)
            nextAsteroids.push(makeAsteroid(a.x, a.y, a.sizeIdx + 1));
        }
        break;
      }
    }
    if (!hit) nextAsteroids.push(a);
  }
  bullets   = bullets.filter((_, i) => !hitBullets.has(i));
  asteroids = nextAsteroids;

  // level clear
  if (asteroids.length === 0) nextLevel();

  // ── ship × asteroid ──────────────────────────────────────────────────────
  if (invTimer > 0) { invTimer--; return; }
  for (const a of asteroids) {
    if (circle(ship.x, ship.y, SHIP_SIZE * 0.7, a.x, a.y, a.radius * 0.85)) {
      explode(ship.x, ship.y, '#0ff', 22);
      lives--;
      livesEl.textContent = lives;
      state     = 'dead';
      levelTimer = 90;
      return;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W(), H());

  // stars (static seed per frame-0 layout)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 80; i++) {
    const sx = ((i * 2731 + 17) % 997) / 997 * W();
    const sy = ((i * 1999 + 53) % 991) / 991 * H();
    ctx.fillRect(sx, sy, 1, 1);
  }

  for (const a of asteroids) drawAsteroid(a);
  for (const p of particles) drawParticle(p);

  // bullets
  ctx.save();
  for (const b of bullets) drawBullet(b);
  ctx.restore();

  // ship
  if (state === 'play') {
    const blink = invTimer > 0 && Math.floor(invTimer / 6) % 2 === 0;
    if (!blink) drawShip(ship);
  }

  // lives icons
  for (let i = 0; i < lives; i++) {
    const tx = 12 + i * 22;
    const ty = H() - 16;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur  = 6;
    const s = 8;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.7,  s * 0.6);
    ctx.lineTo(-s * 0.35, 0);
    ctx.lineTo(-s * 0.7, -s * 0.6);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ── input handling ───────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Enter') {
    if (state === 'title' || state === 'over') startGame();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// touch controls
let touchStartX, touchStartY, touchStartT;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartT = Date.now();
  if (state === 'title' || state === 'over') { startGame(); return; }
  shootQueued = true;
}, {passive: false});

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
  if (Math.abs(dx) > 10) keys['ArrowLeft']  = dx < 0;
  if (Math.abs(dx) > 10) keys['ArrowRight'] = dx > 0;
  if (dy < -20) keys['ArrowUp'] = true;
  else          keys['ArrowUp'] = false;
}, {passive: false});

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  keys['ArrowLeft'] = keys['ArrowRight'] = keys['ArrowUp'] = false;
}, {passive: false});

// ── boot ─────────────────────────────────────────────────────────────────────
state = 'title';
showOverlay('ASTEROIDS', 'Press <b>ENTER</b> or tap to start',
  'WASD / Arrows to move &nbsp;·&nbsp; Space to shoot');
loop();
