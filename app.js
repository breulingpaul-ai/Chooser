// ============================================================
// SECTION 1 — SETUP & CONSTANTS
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const titleEl = document.getElementById('title');
const hintEl = document.getElementById('hint');
const maxWarningEl = document.getElementById('maxwarning');
const modelabelEl = document.getElementById('modelabel');
const menuButton = document.getElementById('menubutton');
const menuOverlay = document.getElementById('menuoverlay');
const closeButton = document.getElementById('closebutton');
const modeButtons = document.querySelectorAll('.modebutton');
const startButton = document.getElementById('startbutton');

// Current game mode
let currentMode = 'classic';

// ---- Standard mode state (classic / elimination / scheich) ----
let touches = {};           // active touch points keyed by identifier
let eliminatedIds = new Set();
let touchOrder = [];        // order fingers were placed (for scheich)
let state = 'waiting';      // waiting → stabilizing → countdown → chosen
let stabilityTimer = null;
let hintTimer = null;
let countdownStart = null;
let countdownProgress = 0;
let winnerId = null;

const COUNTDOWN_DURATION = 2500;
const STABILITY_DURATION = 1000;
const HINT_DURATION = 3000;
const MAX_TOUCHES = 5; // iOS Safari hard limit

// ---- Family mode state ----
// Stores registered tap circles: { x, y, color, number, id }
let familyPlayers = [];
let familyState = 'registering'; // registering → countdown → chosen
let familyCountdownStart = null;
let familyCountdownProgress = 0;
let familyWinnerId = null;
let familyPulse = 0; // shared pulse counter for countdown animation

// Distinct colors for up to 10 family players
const FAMILY_COLORS = [
  '#FF6B6B', // red
  '#4ECDC4', // teal
  '#45B7D1', // blue
  '#96CEB4', // green
  '#FFEAA7', // yellow
  '#DDA0DD', // plum
  '#98D8C8', // mint
  '#F7DC6F', // gold
  '#BB8FCE', // purple
  '#85C1E9'  // sky blue
];

// Scheich safe zone: top-left quarter of screen
// Any finger placed here is excluded from selection
function isInScheichSafeZone(x, y) {
  return x < window.innerWidth / 2 && y < window.innerHeight / 2;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);


// ============================================================
// SECTION 2 — MENU LOGIC
// ============================================================

menuButton.addEventListener('click', () => {
  if (state === 'waiting' && familyState === 'registering') {
    menuOverlay.classList.add('visible');
  }
});

closeButton.addEventListener('click', () => {
  menuOverlay.classList.remove('visible');
});

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;

    const labels = {
      classic: 'Classic Chooser',
      elimination: 'Elimination',
      scheich: 'Scheich Mode',
      family: 'Family Mode'
    };
    modelabelEl.textContent = labels[currentMode];
    menuOverlay.classList.remove('visible');

    // Reset everything when switching modes
    resetAll();
  });
});


// ============================================================
// SECTION 3 — FAMILY MODE LOGIC
// ============================================================

// Family mode uses click/tap events, not touch events
// This allows up to 10 registered spots regardless of iOS touch limit
canvas.addEventListener('click', handleFamilyTap);

// Start button triggers the draw in family mode
startButton.addEventListener('click', () => {
  if (currentMode === 'family' && familyPlayers.length >= 2) {
    startFamilyCountdown();
  }
});

function handleFamilyTap(e) {
  // Only active in family mode during registration phase
  if (currentMode !== 'family') return;
  if (familyState !== 'registering') return;

  const x = e.clientX;
  const y = e.clientY;

  // Check if tap is on an existing circle — if so, remove it (undo)
  const TAP_RADIUS = 50;
  const existingIndex = familyPlayers.findIndex(p => {
    const dx = p.x - x;
    const dy = p.y - y;
    return Math.sqrt(dx * dx + dy * dy) < TAP_RADIUS;
  });

  if (existingIndex !== -1) {
    // Remove the tapped circle and renumber remaining
    familyPlayers.splice(existingIndex, 1);
    familyPlayers.forEach((p, i) => {
      p.number = i + 1;
      p.color = FAMILY_COLORS[i];
    });
  } else {
    // Add new player if under limit
    if (familyPlayers.length >= 10) {
      showMaxWarning();
      return;
    }
    const number = familyPlayers.length + 1;
    familyPlayers.push({
      x,
      y,
      color: FAMILY_COLORS[number - 1],
      number,
      id: Date.now() + Math.random(), // unique id
      pulse: 0
    });
  }

  // Hide home title once first player registers
  titleEl.style.display = familyPlayers.length > 0 ? 'none' : 'block';

  // Show start button when 2+ players registered
  if (familyPlayers.length >= 2) {
    startButton.classList.add('visible');
  } else {
    startButton.classList.remove('visible');
  }
}

function startFamilyCountdown() {
  familyState = 'countdown';
  familyCountdownStart = performance.now();
  familyCountdownProgress = 0;
  startButton.classList.remove('visible');
}

function selectFamilyWinner() {
  // Pick a random player from registered family players
  const idx = Math.floor(Math.random() * familyPlayers.length);
  familyWinnerId = familyPlayers[idx].id;
  familyState = 'chosen';
}

function resetFamilyMode() {
  familyPlayers = [];
  familyState = 'registering';
  familyCountdownStart = null;
  familyCountdownProgress = 0;
  familyWinnerId = null;
  familyPulse = 0;
  startButton.classList.remove('visible');
  titleEl.style.display = 'block';
}


// ============================================================
// SECTION 4 — STANDARD TOUCH HANDLING (classic/elimination/scheich)
// ============================================================

canvas.addEventListener('touchstart', handleTouchChange, { passive: false });
canvas.addEventListener('touchend', handleTouchChange, { passive: false });
canvas.addEventListener('touchcancel', handleTouchChange, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

function handleTouchMove(e) {
  e.preventDefault();
  if (currentMode === 'family') return; // family mode ignores touch move
  for (let t of e.touches) {
    if (touches[t.identifier]) {
      touches[t.identifier].x = t.clientX;
      touches[t.identifier].y = t.clientY;
    }
  }
}

function handleTouchChange(e) {
  e.preventDefault();

  // Family mode handles its own input via click events
  if (currentMode === 'family') return;

  // After winner shown — tap to reset
  if (state === 'chosen') {
    if (currentMode === 'elimination') {
      const remaining = Object.keys(touches).filter(id => !eliminatedIds.has(id));
      if (remaining.length >= 2) {
        state = 'waiting';
        winnerId = null;
        startStabilityTimer();
        return;
      }
    }
    resetAll();
    return;
  }

  // Rebuild touches from current live touches
  const newTouches = {};
  for (let t of e.touches) {
    // Enforce 5-finger max — warn and ignore extras
    if (!touches[t.identifier] && Object.keys(newTouches).length >= MAX_TOUCHES) {
      showMaxWarning();
      continue;
    }

    newTouches[t.identifier] = touches[t.identifier] || {
      x: t.clientX,
      y: t.clientY,
      pulse: 0,
      placedAt: Date.now()
    };
    newTouches[t.identifier].x = t.clientX;
    newTouches[t.identifier].y = t.clientY;

    // Track placement order for scheich mode
    if (!touchOrder.includes(String(t.identifier))) {
      touchOrder.push(String(t.identifier));
    }
  }

  // Clean up lifted fingers from order list
  touchOrder = touchOrder.filter(id => newTouches[id]);
  touches = newTouches;

  const count = Object.keys(touches).length;

  titleEl.style.display = count > 0 ? 'none' : 'block';
  updateHint(count);

  // Any finger change during countdown resets it
  if (state === 'countdown') {
    resetCountdown();
    return;
  }

  if (count < 2) {
    resetStability();
    state = 'waiting';
    return;
  }

  if (state === 'stabilizing' || state === 'waiting') {
    resetStability();
    startStabilityTimer();
  }
}

function updateHint(count) {
  clearTimeout(hintTimer);
  if (count === 1) {
    hintEl.classList.add('visible');
    hintTimer = setTimeout(() => hintEl.classList.remove('visible'), HINT_DURATION);
  } else {
    hintEl.classList.remove('visible');
  }
}

function showMaxWarning() {
  maxWarningEl.classList.add('visible');
  setTimeout(() => maxWarningEl.classList.remove('visible'), 2500);
}


// ============================================================
// SECTION 5 — STANDARD GAME STATE (classic/elimination/scheich)
// ============================================================

function startStabilityTimer() {
  state = 'stabilizing';
  stabilityTimer = setTimeout(() => {
    const active = Object.keys(touches).filter(id => !eliminatedIds.has(id));
    if (active.length >= 2) startCountdown();
  }, STABILITY_DURATION);
}

function resetStability() {
  clearTimeout(stabilityTimer);
  stabilityTimer = null;
}

function startCountdown() {
  state = 'countdown';
  countdownStart = performance.now();
  countdownProgress = 0;
}

function selectWinner() {
  // Build eligible list — exclude eliminated fingers
  let eligible = Object.keys(touches).filter(id => !eliminatedIds.has(id));

  if (currentMode === 'scheich') {
    // Remove any fingers in the top-left safe zone from the eligible pool
    const outsideSafeZone = eligible.filter(id => {
      const t = touches[id];
      return !isInScheichSafeZone(t.x, t.y);
    });

    // If everyone is in the safe zone fall back to full pool (edge case)
    const pool = outsideSafeZone.length > 0 ? outsideSafeZone : eligible;
    winnerId = pool[Math.floor(Math.random() * pool.length)];
  } else {
    // Classic and Elimination: purely random
    winnerId = eligible[Math.floor(Math.random() * eligible.length)];
  }

  state = 'chosen';

  if (currentMode === 'elimination') {
    setTimeout(() => {
      eliminatedIds.add(winnerId);
      const remaining = Object.keys(touches).filter(id => !eliminatedIds.has(id));
      if (remaining.length === 1) {
        // Last one standing — celebrate them
        winnerId = remaining[0];
        state = 'chosen';
      } else if (remaining.length >= 2) {
        winnerId = null;
        state = 'waiting';
        startStabilityTimer();
      } else {
        resetAll();
      }
    }, 2000);
  }
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
  eliminatedIds = new Set();
  touchOrder = [];
  state = 'waiting';
  titleEl.style.display = 'block';
  hintEl.classList.remove('visible');
  // Also reset family mode if switching
  if (currentMode === 'family') resetFamilyMode();
}


// ============================================================
// SECTION 6 — ANIMATION LOOP
// Draws everything every frame (~60fps)
// ============================================================

function animate(timestamp) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ---- FAMILY MODE DRAWING ----
  if (currentMode === 'family') {

    // Advance family countdown
    if (familyState === 'countdown' && familyCountdownStart !== null) {
      familyCountdownProgress = Math.min(
        (timestamp - familyCountdownStart) / COUNTDOWN_DURATION, 1
      );
      familyPulse += 0.05 * (3 + familyCountdownProgress * 4);
      if (familyCountdownProgress >= 1) selectFamilyWinner();
    }

    // Draw each registered family player circle
    for (let p of familyPlayers) {
      const isWinner = (familyState === 'chosen' && p.id === familyWinnerId);
      const isLoser = (familyState === 'chosen' && p.id !== familyWinnerId);

      if (isLoser) continue; // losers disappear on selection

      let radius = 44;
      let opacity = 1;
      let lineWidth = 3;

      if (familyState === 'countdown') {
        // All circles pulse during countdown
        const pulseFactor = Math.sin(familyPulse + p.number);
        radius = 44 + pulseFactor * 15;
        lineWidth = 3 + familyCountdownProgress * 3;
      }

      if (isWinner) {
        // Winner blinks and grows
        const blink = Math.sin(timestamp * 0.008);
        radius = 70 + blink * 20;
        opacity = 0.6 + blink * 0.4;
        lineWidth = 5;
      }

      // Outer colored circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = opacity;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Filled center dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = opacity * 0.3;
      ctx.fill();

      // Player number inside circle
      ctx.globalAlpha = opacity;
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.number, p.x, p.y);

      ctx.globalAlpha = 1; // reset opacity
    }

    // Show instruction text in family mode during registration
    if (familyState === 'registering' && familyPlayers.length === 0) {
      ctx.font = '600 16px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Each player tap the screen to register', canvas.width / 2, canvas.height / 2 + 60);
    }

    requestAnimationFrame(animate);
    return; // stop here — don't run standard drawing below
  }

  // ---- STANDARD MODE DRAWING (classic / elimination / scheich) ----

  if (state === 'countdown' && countdownStart !== null) {
    countdownProgress = Math.min((timestamp - countdownStart) / COUNTDOWN_DURATION, 1);
    if (countdownProgress >= 1) selectWinner();
  }

  for (let id in touches) {
    const touch = touches[id];
    const isEliminated = eliminatedIds.has(id);
    const isWinner = (state === 'chosen' && id === winnerId);
    const isLoser = (state === 'chosen' && id !== winnerId && !isEliminated);

    // Classic and scheich: non-winners vanish immediately on selection
    if ((currentMode === 'classic' || currentMode === 'scheich') && state === 'chosen' && !isWinner) continue;

    // Skip already eliminated fingers
    if (isEliminated) continue;

    const pulseSpeed = state === 'countdown' ? 3 + countdownProgress * 4 : 1;
    touch.pulse = (touch.pulse || 0) + 0.05 * pulseSpeed;
    const pulseFactor = Math.sin(touch.pulse);

    let radius = 40;
    let opacity = 1;
    let lineWidth = 3;
    let color = `rgba(255, 255, 255, ${opacity})`;

    if (state === 'countdown') {
      radius = 40 + pulseFactor * 15;
      lineWidth = 3 + countdownProgress * 3;
    }

    if (isWinner) {
      const blink = Math.sin(timestamp * 0.008);
      radius = 70 + blink * 20;
      opacity = 0.6 + blink * 0.4;
      lineWidth = 5;
      color = `rgba(255, 220, 50, ${opacity})`;
    }

    if (isLoser && currentMode === 'elimination') {
      // Non-winners stay visible but dimmed during elimination
      opacity = 0.35;
      color = `rgba(255, 255, 255, ${opacity})`;
    }

    // Outer circle
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  requestAnimationFrame(animate);
}

// Kick off the animation loop
requestAnimationFrame(animate);