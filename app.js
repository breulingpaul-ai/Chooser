// ============================================================
// SECTION 1 — SETUP
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const titleEl = document.getElementById('title');
const hintEl = document.getElementById('hint');

let touches = {};
let state = 'waiting';
let stabilityTimer = null;
let countdownStart = null;
let countdownProgress = 0;
let winnerId = null;
let hintTimer = null; // timer to auto-hide the 1-finger hint

const COUNTDOWN_DURATION = 2500;
const STABILITY_DURATION = 1000;
const HINT_DURATION = 3000; // hint disappears after 3 seconds

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);


// ============================================================
// SECTION 2 — TOUCH HANDLING
// ============================================================

canvas.addEventListener('touchstart', handleTouchChange, { passive: false });
canvas.addEventListener('touchend', handleTouchChange, { passive: false });
canvas.addEventListener('touchcancel', handleTouchChange, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

function handleTouchMove(e) {
  e.preventDefault();
  for (let t of e.touches) {
    if (touches[t.identifier]) {
      touches[t.identifier].x = t.clientX;
      touches[t.identifier].y = t.clientY;
    }
  }
}

function handleTouchChange(e) {
  e.preventDefault();

  // Any touch after winner is shown resets everything
  if (state === 'chosen') {
    resetAll();
    return;
  }

  // Rebuild touch map from current live touches
  const newTouches = {};
  for (let t of e.touches) {
    newTouches[t.identifier] = touches[t.identifier] || {
      x: t.clientX,
      y: t.clientY,
      radius: 40,
      opacity: 1,
      pulse: 0
    };
    newTouches[t.identifier].x = t.clientX;
    newTouches[t.identifier].y = t.clientY;
  }
  touches = newTouches;

  const count = Object.keys(touches).length;

  // Show/hide the home screen title
  titleEl.style.display = count > 0 ? 'none' : 'block';

  // Show hint if exactly 1 finger — hide if 0 or 2+
  updateHint(count);

  // Finger lifted during countdown — reset
  if (state === 'countdown') {
    resetCountdown();
    return;
  }

  if (count < 2) {
    resetStability();
    state = 'waiting';
    return;
  }

  // Finger count changed — restart stability timer
  if (state === 'stabilizing' || state === 'waiting') {
    resetStability();
    startStabilityTimer();
  }
}

// Show the "need 2 fingers" hint for 3 seconds when only 1 finger is on screen
function updateHint(count) {
  clearTimeout(hintTimer);

  if (count === 1) {
    hintEl.classList.add('visible');
    // Auto-hide after 3 seconds
    hintTimer = setTimeout(() => {
      hintEl.classList.remove('visible');
    }, HINT_DURATION);
  } else {
    hintEl.classList.remove('visible');
  }
}

function startStabilityTimer() {
  state = 'stabilizing';
  stabilityTimer = setTimeout(() => {
    if (Object.keys(touches).length >= 2) {
      startCountdown();
    }
  }, STABILITY_DURATION);
}

function resetStability() {
  clearTimeout(stabilityTimer);
  stabilityTimer = null;
}


// ============================================================
// SECTION 3 — COUNTDOWN, SELECTION & DRAWING
// ============================================================

function startCountdown() {
  state = 'countdown';
  countdownStart = performance.now();
  countdownProgress = 0;
}

function selectWinner() {
  const ids = Object.keys(touches);
  winnerId = ids[Math.floor(Math.random() * ids.length)];
  state = 'chosen';
}

function resetCountdown() {
  countdownStart = null;
  countdownProgress = 0;
  winnerId = null;
  startStabilityTimer();
}

function resetAll() {
  clearTimeout(stabilityTimer);
  clearTimeout(hintTimer);
  stabilityTimer = null;
  countdownStart = null;
  countdownProgress = 0;
  winnerId = null;
  touches = {};
  state = 'waiting';
  titleEl.style.display = 'block';
  hintEl.classList.remove('visible');
}

// ============================================================
// ANIMATION LOOP
// ============================================================

function animate(timestamp) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state === 'countdown' && countdownStart !== null) {
    countdownProgress = Math.min((timestamp - countdownStart) / COUNTDOWN_DURATION, 1);
    if (countdownProgress >= 1) {
      selectWinner();
    }
  }

  for (let id in touches) {
    const touch = touches[id];
    const isWinner = (state === 'chosen' && id === winnerId);
    const isLoser = (state === 'chosen' && id !== winnerId);

    if (isLoser) continue;

    // Pulse speed increases as countdown progresses — builds tension
    const pulseSpeed = state === 'countdown' ? 3 + countdownProgress * 4 : 1;
    touch.pulse = (touch.pulse || 0) + 0.05 * pulseSpeed;
    const pulseFactor = Math.sin(touch.pulse);

    let radius = 40;
    let opacity = 1;
    let lineWidth = 3;

    if (state === 'countdown') {
      radius = 40 + pulseFactor * 15;
      lineWidth = 3 + countdownProgress * 3;
    }

    if (isWinner) {
      const blink = Math.sin(timestamp * 0.008);
      radius = 70 + blink * 20;
      opacity = 0.6 + blink * 0.4;
      lineWidth = 5;
    }

    // Draw outer circle
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = isWinner
      ? `rgba(255, 255, 255, ${opacity})`   // bright white for winner
      : `rgba(255, 255, 255, ${opacity})`;  // white for all circles on orange bg
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Small center dot
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fill();
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);