const REALTIME_COOLDOWN_MS = 3000;

/**
 * Utility to prevent processing self-origin Realtime events.
 *
 * After a local write, call `set()` to start a cooldown period.
 * Before processing a Realtime event, call `isActive()` to check
 * whether the event should be ignored (likely self-origin).
 */
export class RealtimeCooldown {
  private until = 0;

  /** Start the cooldown (call after a local save/write). */
  set(): void {
    this.until = Date.now() + REALTIME_COOLDOWN_MS;
  }

  /** Returns `true` if we are within the cooldown window. */
  isActive(): boolean {
    return Date.now() < this.until;
  }
}
