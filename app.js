(() => {
  const arena = document.getElementById("arena");
  const statusEl = document.getElementById("status");

  const modeSelectBtn = document.getElementById("modeSelect");
  const modeElimBtn = document.getElementById("modeElim");

  const MODE = {
    SELECT: "select",
    ELIM: "elimination",
  };

  const STATE = {
    IDLE: "idle",
    STABILIZING: "stabilizing",
    COUNTDOWN: "countdown",
    SHOWING: "showing",
    WINNER_WAIT: "winner_wait",
  };

  const STABLE_MS = 1000;
  const COUNTDOWN_MS = 3000;

  let mode = MODE.SELECT;
  let state = STATE.IDLE;

  // Active touches on screen right now
  // id -> { x, y, el }
  const touches = new Map();

  // In elimination mode, eliminated finger ids are ignored for eligibility
  const eliminated = new Set();

  // Current round participants (locked ids)
  let lockedIds = [];

  // In elimination mode, remaining ids for the overall elimination session
  let remaining = new Set();

  let stabilityTimer = null;
  let countdownTimer = null;

  let winnerId = null;

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function setMode(nextMode) {
    if (state !== STATE.IDLE) return;

    mode = nextMode;
    modeSelectBtn.classList.toggle("active", mode === MODE.SELECT);
    modeElimBtn.classList.toggle("active", mode === MODE.ELIM);

    eliminated.clear();
    lockedIds = [];
    remaining = new Set();
    winnerId = null;

    setStatus(mode === MODE.SELECT ? "Select mode" : "Elimination mode");
    scheduleStabilityCheck();
  }

  modeSelectBtn.addEventListener("click", () => setMode(MODE.SELECT));
  modeElimBtn.addEventListener("click", () => setMode(MODE.ELIM));

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function makeFingerEl() {
    const el = document.createElement("div");
    el.className = "finger";
    arena.appendChild(el);
    return el;
  }

  function removeFingerEl(el) {
    if (!el) return;
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  function positionFingerEl(el, x, y) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function getEligibleIdsNow() {
    const ids = [];
    for (const id of touches.keys()) {
      if (mode === MODE.ELIM && eliminated.has(id)) continue;
      ids.push(id);
    }
    return ids.sort((a, b) => a - b);
  }

  function getEligibleIdsFromRemaining() {
    // Only used in elimination mode after at least one elimination
    const ids = [];
    for (const id of remaining) {
      if (!touches.has(id)) continue;
      if (eliminated.has(id)) continue;
      ids.push(id);
    }
    return ids.sort((a, b) => a - b);
  }

  function currentEligibilitySignature() {
    const ids = (mode === MODE.ELIM && remaining.size > 0)
      ? getEligibleIdsFromRemaining()
      : getEligibleIdsNow();
    return ids.join(",");
  }

  function clearTimers() {
    if (stabilityTimer) clearTimeout(stabilityTimer);
    if (countdownTimer) clearTimeout(countdownTimer);
    stabilityTimer = null;
    countdownTimer = null;
  }

  function resetToIdle() {
    clearTimers();

    state = STATE.IDLE;
    lockedIds = [];
    winnerId = null;

    if (mode === MODE.SELECT) {
      setStatus("Place 2+ fingers. Hold steady for 1 second.");
    } else {
      setStatus("Place 2+ fingers. Hold steady for 1 second.");
    }

    // Remove winner styling from any leftover elements
    for (const { el } of touches.values()) {
      el.classList.remove("winner", "pulse", "eliminated", "muted");
    }

    scheduleStabilityCheck();
  }

  function cancelRoundBecauseChanged() {
    if (state === STATE.COUNTDOWN || state === STATE.STABILIZING || state === STATE.SHOWING) {
      resetToIdle();
    }
  }

  function scheduleStabilityCheck() {
    if (state === STATE.WINNER_WAIT) return;

    if (stabilityTimer) clearTimeout(stabilityTimer);
    stabilityTimer = null;

    const eligibleSig = currentEligibilitySignature();
    const eligibleCount = eligibleSig.length ? eligibleSig.split(",").filter(Boolean).length : 0;

    if (eligibleCount < 2) {
      setStatus("Need 2+ fingers");
      return;
    }

    state = STATE.STABILIZING;
    setStatus("Hold steady");

    stabilityTimer = setTimeout(() => {
      const sigNow = currentEligibilitySignature();
      const countNow = sigNow.length ? sigNow.split(",").filter(Boolean).length : 0;

      if (sigNow === eligibleSig && countNow >= 2 && state === STATE.STABILIZING) {
        startCountdown(sigNow.split(",").map(n => Number(n)));
      } else {
        scheduleStabilityCheck();
      }
    }, STABLE_MS);
  }

  function secureRandomIndex(n) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % n;
  }

  function startCountdown(ids) {
    if (ids.length < 2) return;

    lockedIds = ids.slice();
    state = STATE.COUNTDOWN;
    setStatus("Choosing");

    // Visually keep all locked bubbles active
    for (const [id, t] of touches.entries()) {
      const isLocked = lockedIds.includes(id);
      const isIgnored = mode === MODE.ELIM && eliminated.has(id);
      t.el.classList.toggle("muted", !isLocked || isIgnored);
      t.el.classList.remove("winner", "pulse", "eliminated");
    }

    countdownTimer = setTimeout(() => {
      countdownTimer = null;

      if (mode === MODE.SELECT) {
        resolveSelectMode();
      } else {
        resolveEliminationStep();
      }
    }, COUNTDOWN_MS);
  }

  function resolveSelectMode() {
    const stillThere = lockedIds.filter(id => touches.has(id));
    if (stillThere.length < 2) {
      resetToIdle();
      return;
    }

    const chosen = stillThere[secureRandomIndex(stillThere.length)];
    winnerId = chosen;

    for (const [id, t] of touches.entries()) {
      if (id === chosen) {
        t.el.classList.remove("muted");
        t.el.classList.add("winner");
      } else {
        t.el.classList.add("muted");
      }
    }

    vibrate([40, 40, 40]);
    setStatus("Chosen");

    state = STATE.WINNER_WAIT;
  }

  function resolveEliminationStep() {
    // Initialize remaining on the first elimination step
    if (remaining.size === 0) {
      const base = lockedIds.filter(id => touches.has(id));
      for (const id of base) remaining.add(id);
    }

    // Recompute eligible among remaining
    const eligible = [];
    for (const id of remaining) {
      if (!touches.has(id)) continue;
      if (eliminated.has(id)) continue;
      eligible.push(id);
    }

    if (eligible.length <= 1) {
      // Winner reached
      const finalId = eligible.length === 1 ? eligible[0] : pickAnyRemainingOnScreen();
      if (finalId == null) {
        resetToIdle();
        return;
      }
      winnerId = finalId;

      for (const [id, t] of touches.entries()) {
        if (id === finalId) {
          t.el.classList.remove("muted");
          t.el.classList.add("winner");
        } else {
          t.el.classList.add("muted");
        }
      }

      vibrate([60, 60, 60]);
      setStatus("Winner");
      state = STATE.WINNER_WAIT;
      return;
    }

    // Eliminate one
    const outId = eligible[secureRandomIndex(eligible.length)];
    eliminated.add(outId);
    remaining.delete(outId);

    // Animate: eliminated fades, others pulse
    for (const [id, t] of touches.entries()) {
      if (id === outId) {
        t.el.classList.add("eliminated");
      } else if (!eliminated.has(id) && remaining.has(id)) {
        t.el.classList.remove("muted");
        t.el.classList.add("pulse");
      } else {
        t.el.classList.add("muted");
      }
    }

    vibrate([30, 30, 30]);

    state = STATE.SHOWING;
    setStatus("Eliminated");

    setTimeout(() => {
      // Remove pulse, keep only remaining active
      for (const [id, t] of touches.entries()) {
        t.el.classList.remove("pulse");

        if (eliminated.has(id)) {
          t.el.classList.add("muted");
        } else if (remaining.has(id)) {
          t.el.classList.remove("muted");
        } else {
          t.el.classList.add("muted");
        }
      }

      // Continue with next cycle, using stability check over remaining
      state = STATE.IDLE;
      setStatus("Hold steady");
      scheduleStabilityCheck();
    }, 650);
  }

  function pickAnyRemainingOnScreen() {
    for (const id of remaining) {
      if (touches.has(id) && !eliminated.has(id)) return id;
    }
    // If remaining is empty due to lifts, fallback to any active non-eliminated touch
    const ids = getEligibleIdsNow();
    if (ids.length) return ids[0];
    return null;
  }

  function handleTouchStart(e) {
    e.preventDefault();

    for (const t of Array.from(e.changedTouches)) {
      const id = t.identifier;
      if (touches.has(id)) continue;

      const el = makeFingerEl();
      touches.set(id, { x: t.clientX, y: t.clientY, el });
      positionFingerEl(el, t.clientX, t.clientY);
    }

    cancelRoundBecauseChanged();
    scheduleStabilityCheck();
  }

  function handleTouchMove(e) {
    e.preventDefault();

    for (const t of Array.from(e.changedTouches)) {
      const id = t.identifier;
      const entry = touches.get(id);
      if (!entry) continue;

      entry.x = t.clientX;
      entry.y = t.clientY;
      positionFingerEl(entry.el, entry.x, entry.y);
    }
  }

  function handleTouchEnd(e) {
    e.preventDefault();

    for (const t of Array.from(e.changedTouches)) {
      const id = t.identifier;
      const entry = touches.get(id);
      if (!entry) continue;

      removeFingerEl(entry.el);
      touches.delete(id);

      if (mode === MODE.ELIM) {
        remaining.delete(id);
        eliminated.delete(id);
      }

      if (state === STATE.WINNER_WAIT && winnerId === id) {
        // Winner lifted, end round
        resetToIdle();
        continue;
      }
    }

    cancelRoundBecauseChanged();
    scheduleStabilityCheck();
  }

  // Attach touch listeners, non-passive so preventDefault works
  arena.addEventListener("touchstart", handleTouchStart, { passive: false });
  arena.addEventListener("touchmove", handleTouchMove, { passive: false });
  arena.addEventListener("touchend", handleTouchEnd, { passive: false });
  arena.addEventListener("touchcancel", handleTouchEnd, { passive: false });

  // Initial status
  setStatus("Select mode");
  resetToIdle();
})();
