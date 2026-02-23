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

// Current game mode: 'classic', 'elimination', 'scheich'
let currentMode = 'classic';

// All active touches — keyed by touch identifier
let touches = {};

// In elimination mode, tracks which touch IDs have been eliminated
let eliminatedIds = new Set();

// The order fingers were placed — used by Scheich mode
let touchOrder = [];

// App state: 'waiting' → 'stabilizing' → 'countdown' → 'chosen'
let state = 'waiting';

let stabilityTimer = null;
let hintTimer = null;
let countdownStart = null;
let countdownProgress = 0;
let winnerId = null;

const COUNTDOWN_DURATION = 2500; // ms
const STABILITY_DURATION = 1000; // ms
const HINT_DURATION = 3000;      // ms
const MAX_TOUCHES = 10;          // browser maximum

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
  // Only open menu when no game is in progress
  if (state === 'waiting') {
    menuOverlay.classList.add('visible');
  }
});

closeButton.addEventListener('click', () => {
  menuOverlay.classList.remove('visible');
});

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // Update active state visually
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Set the mode
    currentMode = btn.dataset.mode;

    // Update the subtle mode label on the play screen
    const labels = {
      classic: 'Classic Chooser',
      elimination: 'Elimination',
      scheich: 'Scheich Mode'
    };
    modelabelEl.textContent = labels[currentMode];

    menuOverlay.classList.remove('visible');
  });
});


// ============================================================
// SECTION 3 — TOUCH HANDLING
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

  // Tapping after winner shown — reset and start fresh
  if (state === 'chosen') {
    // In elimination: if fingers still remain, auto-restart countdown
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

  // Rebuild touches from live touch list
  const newTouches = {};
  for (let t of e.touches) {
    // Check max touch limit
    if (!touches[t.identifier] && Object.keys(newTouches).length >= MAX_TOUCHES) {
      showMaxWarning();
      continue;
    }

    newTouches[t.identifier] = touches[t.identifier] || {
      x: t.clientX,
      y: t.clientY,
      radius: 40,
      opacity: 1,
      pulse: 0,
      placedAt: Date.now() // timestamp for Scheich mode ordering
    };
    newTouches[t.identifier].x = t.clientX;
    newTouches[t.identifier].y = t.clientY;

    // Track placement order for Scheich mode
    if (!touchOrder.includes(t.identifier)) {
      touchOrder.push(t.identifier);
    }
  }

  // Remove lifted fingers from order tracking
  touchOrder = touchOrder.filter(id => newTouches[id]);
  touches = newTouches;

  const count = Object.keys(touches).length;

  // Show/hide home screen title
  titleEl.style.display = count > 0 ? 'none' : 'block';

  // Show 1-finger hint
  updateHint(count);

  // Countdown interrupted by finger change
  if (state === 'countdown') {
    resetCountdown();
    return;
  }

  if (count < 2) {
    resetStability();
    state = 'waiting';
    return;
  }

  // Restart stability check on any finger change
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
  setTimeout(() => maxWarningEl.classList.remove('visible'), 2000);
}


// ============================================================
// SECTION 4 — GAME STATE LOGIC
// ============================================================

function startStabilityTimer() {
  state = 'stabilizing';
  stabilityTimer = setTimeout(() => {
    const activeTouches = Object.keys(touches).filter(id => !eliminatedIds.has(id));
    if (activeTouches.length >= 2) {
      startCountdown();
    }
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
  // Get only non-eliminated active touches
  const eligible = Object.keys(touches).filter(id => !eliminatedIds.has(id));

  if (currentMode === 'scheich') {
    // Scheich: always pick the second finger placed (index 1 in touchOrder)
    // Falls back to first if only one is available
    const scheichPick = touchOrder.find(id => eligible.includes(id) && touchOrder.indexOf(id) >= 1);
    winnerId = scheichPick || eligible[0];
  } else {
    // Classic and Elimination: truly random
    winnerId = eligible[Math.floor(Math.random() * eligible.length)];
  }

  state = 'chosen';

  // In elimination mode: mark winner as eliminated after showing result
  // The next round starts automatically when user taps (handled in handleTouchChange)
  if (currentMode === 'elimination') {
    setTimeout(() => {
      eliminatedIds.add(winnerId);
      const remaining = Object.keys(touches).filter(id => !eliminatedIds.has(id));
      if (remaining.length === 1) {
        // Final winner — celebrate them
        winnerId = remaining[0];
        state = 'chosen';
      } else if (remaining.length >= 2) {
        // More rounds to go — restart automatically
        winnerId = null;
        state = 'waiting';
        startStabilityTimer();
      } else {
        resetAll();
      }
    }, 2000); // show eliminated result for 2 seconds before next round
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
}


// ============================================================
// SECTION 5 — ANIMATION LOOP
// Draws all circles every frame (~60fps)
// ============================================================

function animate(timestamp) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Advance countdown progress
  if (state === 'countdown' && countdownStart !== null) {
    countdownProgress = Math.min((timestamp - countdownStart) / COUNTDOWN_DURATION, 1);
    if (countdownProgress >= 1) {
      selectWinner();
    }
  }

  for (let id in touches) {
    const touch = touches[id];
    const isEliminated = eliminatedIds.has(id);
    const isWinner = (state === 'chosen' && id === winnerId);
    const isLoser = (state === 'chosen' && id !== winnerId && !isEliminated);

    // In classic mode losers disappear immediately
    if (currentMode === 'classic' && isLoser) continue;

    // Eliminated fingers in elimination mode fade out
    if (isEliminated) continue;

    // Pulse animation — sine wave creates smooth grow/shrink
    const pulseSpeed = state === 'countdown' ? 3 + countdownProgress * 4 : 1;
    touch.pulse = (touch.pulse || 0) + 0.05 * pulseSpeed;
    const pulseFactor = Math.sin(touch.pulse);

    let radius = 40;
    let opacity = 1;
    let lineWidth = 3;
    let color = 'rgba(255, 255, 255, 1)';

    if (state === 'countdown') {
      // Circles pulse bigger during countdown, building tension
      radius = 40 + pulseFactor * 15;
      lineWidth = 3 + countdownProgress * 3;
    }

    if (isWinner) {
      // Winner: large gold blinking circle
      const blink = Math.sin(timestamp * 0.008);
      radius = 70 + blink * 20;
      opacity = 0.6 + blink * 0.4;
      lineWidth = 5;
      color = `rgba(255, 220, 50, ${opacity})`;
    }

    if (isLoser && currentMode === 'elimination') {
      // In elimination, non-winners stay visible but dimmed
      opacity = 0.4;
      color = `rgba(255, 255, 255, ${opacity})`;
    }

    // Draw the circle around the finger
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Small dot at the finger's exact position
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);