// ============================================================
// SECTION 1 — SETUP
// Get the canvas element and prepare it for drawing
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d'); // '2d' means we draw in 2D
const instructions = document.getElementById('instructions');

// Store all active touches — each finger gets its own entry
let touches = {};

// App state machine — tracks which phase we're in
// Phases: 'waiting' → 'stabilizing' → 'countdown' → 'chosen'
let state = 'waiting';

// Timers
let stabilityTimer = null;   // counts the 1 second of stable fingers
let countdownTimer = null;   // counts the 2-3 second countdown
let animationFrame = null;   // drives the animation loop

// Countdown duration in milliseconds (2.5 seconds)
const COUNTDOWN_DURATION = 2500;

// How long fingers must stay stable before countdown starts (1 second)
const STABILITY_DURATION = 1000;

// The index of the winning touch (set after selection)
let winnerId = null;

// Countdown progress — goes from 0 to 1 over the countdown duration
let countdownProgress = 0;
let countdownStart = null;

// Make the canvas fill the screen at full resolution (important for sharp drawing on iPhone)
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================================
// SECTION 2 — TOUCH HANDLING
// Responds to fingers being placed, moved, or lifted
// ============================================================

canvas.addEventListener('touchstart', handleTouchChange, { passive: false });
canvas.addEventListener('touchend', handleTouchChange, { passive: false });
canvas.addEventListener('touchcancel', handleTouchChange, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

function handleTouchMove(e) {
  e.preventDefault(); // stops the page from scrolling

  // Update position of each finger as it moves
  for (let t of e.touches) {
    if (touches[t.identifier]) {
      touches[t.identifier].x = t.clientX;
      touches[t.identifier].y = t.clientY;
    }
  }
}

function handleTouchChange(e) {
  e.preventDefault(); // stops the page from scrolling

  // If a winner is already shown, any touch resets the whole app
  if (state === 'chosen') {
    resetAll();
    return;
  }

  // Rebuild the touches object from the current live touches
  const previousCount = Object.keys(touches).length;
  const newTouches = {};
  for (let t of e.touches) {
    // Keep existing touch data if finger was already tracked, otherwise create new entry
    newTouches[t.identifier] = touches[t.identifier] || {
      x: t.clientX,
      y: t.clientY,
      radius: 40,        // starting circle size
      opacity: 1,
      pulse: 0           // used for the pulsing animation during countdown
    };
    // Always update position
    newTouches[t.identifier].x = t.clientX;
    newTouches[t.identifier].y = t.clientY;
  }
  touches = newTouches;

  const count = Object.keys(touches).length;

  // Hide instructions once fingers are on screen
  instructions.style.display = count > 0 ? 'none' : 'block';

  // If we're in countdown phase and finger count changes — reset everything
  if (state === 'countdown') {
    resetCountdown();
    return;
  }

  // If fewer than 2 fingers, go back to waiting
  if (count < 2) {
    resetStability();
    state = 'waiting';
    return;
  }

  // If finger count changed during stabilizing phase, restart the stability timer
  if (state === 'stabilizing' || state === 'waiting') {
    resetStability();
    startStabilityTimer();
  }
}

function startStabilityTimer() {
  state = 'stabilizing';

  // Wait 1 second — if nothing changes, begin countdown
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
  countdownStart = performance.now(); // record when countdown began
  countdownProgress = 0;
}

function selectWinner() {
  // Pick a random finger from the active touches
  const ids = Object.keys(touches);
  winnerId = ids[Math.floor(Math.random() * ids.length)];
  state = 'chosen';
}

function resetCountdown() {
  countdownStart = null;
  countdownProgress = 0;
  winnerId = null;
  // Go back to stabilizing so the 1-second wait starts again
  startStabilityTimer();
}

function resetAll() {
  clearTimeout(stabilityTimer);
  clearTimeout(countdownTimer);
  stabilityTimer = null;
  countdownTimer = null;
  countdownStart = null;
  countdownProgress = 0;
  winnerId = null;
  touches = {};
  state = 'waiting';
  instructions.style.display = 'block';
}

// ============================================================
// ANIMATION LOOP — runs every frame (~60fps) to draw everything
// ============================================================

function animate(timestamp) {
  // Clear the canvas each frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // If in countdown, update progress (0 = just started, 1 = done)
  if (state === 'countdown' && countdownStart !== null) {
    countdownProgress = Math.min((timestamp - countdownStart) / COUNTDOWN_DURATION, 1);

    // When countdown reaches 100%, pick the winner
    if (countdownProgress >= 1) {
      selectWinner();
    }
  }

  // Draw each finger's circle
  for (let id in touches) {
    const touch = touches[id];
    const isWinner = (state === 'chosen' && id === winnerId);
    const isLoser = (state === 'chosen' && id !== winnerId);

    // Don't draw losers after selection
    if (isLoser) continue;

    // Pulse animation — uses sine wave to smoothly grow and shrink
    // During countdown: pulses faster as countdown progresses
    const pulseSpeed = state === 'countdown' ? 3 + countdownProgress * 4 : 1;
    touch.pulse = (touch.pulse || 0) + 0.05 * pulseSpeed;
    const pulseFactor = Math.sin(touch.pulse);

    let radius = 40;
    let opacity = 1;
    let lineWidth = 3;

    if (state === 'countdown') {
      // Circles pulse bigger/smaller during countdown
      radius = 40 + pulseFactor * 15;
      lineWidth = 3 + countdownProgress * 3;
    }

    if (isWinner) {
      // Winner circle: large, blinking brightness and size
      const blink = Math.sin(timestamp * 0.008);
      radius = 70 + blink * 20;
      opacity = 0.6 + blink * 0.4;
      lineWidth = 5;
    }

    // Draw the circle
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = isWinner
      ? `rgba(255, 220, 50, ${opacity})`   // gold for winner
      : `rgba(255, 255, 255, ${opacity})`; // white for others
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Small dot at finger center
    ctx.beginPath();
    ctx.arc(touch.x, touch.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = isWinner ? `rgba(255, 220, 50, ${opacity})` : 'rgba(255,255,255,0.8)';
    ctx.fill();
  }

  // Keep the animation loop running
  animationFrame = requestAnimationFrame(animate);
}

// Start the animation loop immediately
animationFrame = requestAnimationFrame(animate);
