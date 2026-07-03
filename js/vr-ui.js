/**
 * In-headset HUD: large readable status + mini tension strip (DOM overlay).
 */
export class VRHud {
  constructor(rootEl, tensionEl, tensionFillEl) {
    this.root = rootEl;
    this.tension = tensionEl;
    this.tensionFill = tensionFillEl;
    this.visible = false;
    this.lastText = "";
  }

  setActive(active) {
    this.visible = active;
    this.root?.classList.toggle("visible", active);
    if (!active) this.tension?.classList.remove("visible");
  }

  setStatus(text, tone = "") {
    if (!this.root) return;
    if (text === this.lastText && tone === this.lastTone) return;
    this.lastText = text;
    this.lastTone = tone;
    const label = this.root.querySelector(".vr-hud-status");
    if (label) {
      label.textContent = text;
      label.classList.remove("urgent", "strike", "fail");
      if (tone) label.classList.add(tone);
    }
  }

  setTension(tension, progress, show) {
    if (!this.tension || !this.tensionFill) return;
    this.tension.classList.toggle("visible", show && this.visible);
    if (!show) return;
    this.tensionFill.style.width = `${Math.round(tension * 100)}%`;
    this.tensionFill.dataset.zone = tension >= 0.82 ? "warning" : tension >= 0.28 && tension <= 0.7 ? "sweet" : "high";
    const prog = this.tension.querySelector(".vr-reel-fill");
    if (prog) prog.style.width = `${Math.round(progress * 100)}%`;
  }

  setHint(text) {
    const hint = this.root?.querySelector(".vr-hud-hint");
    if (hint) hint.textContent = text || "";
  }
}
