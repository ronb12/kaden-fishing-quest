/**
 * Optional WebXR hand tracking — pinch to cast when enabled in settings.
 */
export class HandTrackingInput {
  constructor(session, getSettings) {
    this.session = session;
    this.getSettings = getSettings;
    this.hands = [];
    this.active = false;
  }

  async tryEnable(session) {
    this.session = session;
    if (!this.getSettings?.()?.handTracking) return false;
    if (!session?.enabledFeatures?.includes?.("hand-tracking")) return false;
    try {
      this.active = true;
      return true;
    } catch {
      this.active = false;
      return false;
    }
  }

  disable() {
    this.active = false;
    this.hands = [];
  }

  /** Returns { cast: bool, reel: number } from hand poses if tracking active. */
  poll() {
    if (!this.active || !this.session?.inputSources) return null;
    let cast = false;
    let reel = 0;
    for (const src of this.session.inputSources) {
      if (src.hand && src.gamepad) {
        const pinch = src.gamepad.buttons?.[0]?.value > 0.85;
        if (pinch) cast = true;
        const grip = src.gamepad.buttons?.[1]?.value ?? 0;
        reel = Math.max(reel, grip);
      }
    }
    return { cast, reel };
  }
}
