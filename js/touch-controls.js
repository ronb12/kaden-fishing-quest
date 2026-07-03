const MOVE_RADIUS = 52;

export function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function initTouchControls(callbacks) {
  if (!isTouchDevice()) return { active: false };

  const overlay = document.getElementById("touch-controls");
  if (!overlay) return { active: false };

  overlay.classList.add("visible");
  document.body.classList.add("touch-mode");
  document.querySelector(".loading-hint")?.classList.add("hidden");

  const joystick = document.getElementById("touch-joystick");
  const stick = document.getElementById("touch-stick");
  const lookPad = document.getElementById("touch-look");
  const actionBtn = document.getElementById("touch-action");
  const reelBtn = document.getElementById("touch-reel");
  const baitBtn = document.getElementById("touch-bait");

  let moveVector = { x: 0, z: 0 };
  let reelHeld = false;
  let joyTouchId = null;
  let joyCenter = { x: 0, y: 0 };
  let lookTouchId = null;
  let lastLook = { x: 0, y: 0 };

  function setActionLabel(text) {
    if (actionBtn) actionBtn.textContent = text;
  }

  function updateJoystick(clientX, clientY) {
    const dx = clientX - joyCenter.x;
    const dy = clientY - joyCenter.y;
    const dist = Math.min(MOVE_RADIUS, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const sx = Math.cos(angle) * dist;
    const sy = Math.sin(angle) * dist;
    if (stick) {
      stick.style.transform = `translate(${sx}px, ${sy}px)`;
    }
    moveVector = {
      x: sx / MOVE_RADIUS,
      z: sy / MOVE_RADIUS,
    };
  }

  function resetJoystick() {
    joyTouchId = null;
    moveVector = { x: 0, z: 0 };
    if (stick) stick.style.transform = "translate(0, 0)";
  }

  joystick?.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyTouchId = t.identifier;
      const rect = joystick.getBoundingClientRect();
      joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      updateJoystick(t.clientX, t.clientY);
    },
    { passive: false }
  );

  joystick?.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) updateJoystick(t.clientX, t.clientY);
      }
    },
    { passive: false }
  );

  joystick?.addEventListener(
    "touchend",
    (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) resetJoystick();
      }
    },
    { passive: false }
  );

  lookPad?.addEventListener(
    "touchstart",
    (e) => {
      if (lookTouchId !== null) return;
      const t = e.changedTouches[0];
      lookTouchId = t.identifier;
      lastLook = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );

  lookPad?.addEventListener(
    "touchmove",
    (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookTouchId) continue;
        const dx = t.clientX - lastLook.x;
        const dy = t.clientY - lastLook.y;
        lastLook = { x: t.clientX, y: t.clientY };
        callbacks.onLook?.(dx, dy);
      }
    },
    { passive: true }
  );

  lookPad?.addEventListener(
    "touchend",
    (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookTouchId) lookTouchId = null;
      }
    },
    { passive: true }
  );

  actionBtn?.addEventListener("touchstart", (e) => {
    e.preventDefault();
    callbacks.onAction?.();
    actionBtn.classList.add("pressed");
  });
  actionBtn?.addEventListener("touchend", () => actionBtn.classList.remove("pressed"));

  reelBtn?.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      reelHeld = true;
      reelBtn.classList.add("pressed");
      callbacks.onReelStart?.();
    },
    { passive: false }
  );

  const endReel = () => {
    if (!reelHeld) return;
    reelHeld = false;
    reelBtn?.classList.remove("pressed");
    callbacks.onReelEnd?.();
  };
  reelBtn?.addEventListener("touchend", endReel);
  reelBtn?.addEventListener("touchcancel", endReel);

  baitBtn?.addEventListener("touchstart", (e) => {
    e.preventDefault();
    callbacks.onBait?.();
  });

  return {
    active: true,
    getMoveVector: () => moveVector,
    isReelHeld: () => reelHeld,
    setActionLabel,
    setReelVisible: (visible) => reelBtn?.classList.toggle("hidden", !visible),
    setActionEnabled: (enabled) => {
      if (actionBtn) actionBtn.disabled = !enabled;
    },
  };
}
