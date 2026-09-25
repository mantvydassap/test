// Keyboard + mouse state with per-frame edges. Uses KeyboardEvent.code so layouts don't matter.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mdx = 0; this.mdy = 0;
    this.wheel = 0;
    this.buttons = new Set();
    this.bPressed = new Set();
    this.bReleased = new Set();
    this.locked = false;
    this.free = false;      // mouse-look without pointer lock (fallback)
    this.enabled = true;
    this.onLockChange = null;

    const block = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote', 'F1']);
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (block.has(e.code) || ((this.locked || this.free) && !e.metaKey && !e.ctrlKey)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.buttons.clear(); });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.free) return;
      // clamp huge spikes some browsers produce when locking
      this.mdx += Math.max(-200, Math.min(200, e.movementX || 0));
      this.mdy += Math.max(-200, Math.min(200, e.movementY || 0));
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.free) return;
      this.buttons.add(e.button);
      this.bPressed.add(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons.delete(e.button);
      this.bReleased.add(e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (!this.locked && !this.free) return;
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.buttons.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (r && r.catch) r.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* pointer lock unavailable */ }
    }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(code) { return this.enabled && this.down.has(code); }
  wasPressed(code) { return this.enabled && this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }
  mouse(b) { return this.enabled && this.buttons.has(b); }
  mousePressed(b) { return this.enabled && this.bPressed.has(b); }
  mouseReleased(b) { return this.bReleased.has(b); }

  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.bPressed.clear(); this.bReleased.clear();
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
  }
}
