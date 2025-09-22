const DEFAULT_WINDOW_MS = 5_000;

export class RateLimiter {
  private readonly windowMs: number;
  private readonly hits = new Map<string, number>();

  constructor(windowMs = DEFAULT_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  /**
   * Returns true when the action is allowed and records the timestamp.
   * Returns false when the caller should be throttled.
   */
  tryConsume(key: string): boolean {
    const now = Date.now();
    const last = this.hits.get(key);
    if (last && now - last < this.windowMs) {
      return false;
    }
    this.hits.set(key, now);
    return true;
  }
}
