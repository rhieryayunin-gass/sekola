/** Short-lived read cache only. Never cache authentication or authorization decisions. */
export class BoundedCache<T> {
  private readonly entries = new Map<string, { expires: number; value: Promise<T> }>();
  constructor(private readonly ttlMs = 15000, private readonly maxEntries = 128, private readonly now = Date.now) {}
  get(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expires > this.now()) return cached.value;
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    const value = Promise.resolve().then(loader);
    this.entries.set(key, { expires: this.now() + this.ttlMs, value });
    void value.catch(() => { if (this.entries.get(key)?.value === value) this.entries.delete(key); });
    return value;
  }
}
