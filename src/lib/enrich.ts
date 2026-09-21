import { fetchTaxa } from './api';
import type { SpeciesDetail } from './types';

type Listener = () => void;

/**
 * Loads Wikipedia summaries for species in the background, 30 at a time with
 * limited concurrency, and keeps them in a session-wide cache so switching
 * searches or filters never refetches what we already have.
 */
class Enricher {
  readonly cache = new Map<number, SpeciesDetail>();
  private queue: number[] = [];
  private inFlight = new Set<number>();
  private requested = new Set<number>();
  private active = 0;
  private readonly limit = 3;
  private readonly batchSize = 30;
  private listeners = new Set<Listener>();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Replace the working set (called on each new search / group arrival). */
  request(ids: number[]): void {
    this.requested = new Set(ids);
    this.queue = ids.filter((id) => !this.cache.has(id) && !this.inFlight.has(id));
    this.pump();
    this.notify();
  }

  reset(): void {
    this.requested = new Set();
    this.queue = [];
    this.notify();
  }

  get progress(): { done: number; total: number } {
    let done = 0;
    for (const id of this.requested) if (this.cache.has(id)) done++;
    return { done, total: this.requested.size };
  }

  get(id: number): SpeciesDetail | undefined {
    return this.cache.get(id);
  }

  private pump(): void {
    while (this.active < this.limit && this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      for (const id of batch) this.inFlight.add(id);
      this.active++;
      fetchTaxa(batch)
        .then((details) => {
          for (const [k, v] of Object.entries(details)) this.cache.set(Number(k), v);
        })
        .catch(() => {
          // Leave them uncached; a later request() will retry.
        })
        .finally(() => {
          for (const id of batch) this.inFlight.delete(id);
          this.active--;
          this.notify();
          this.pump();
        });
    }
  }

  private notify(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      for (const fn of this.listeners) fn();
    }, 150);
  }
}

export const enricher = new Enricher();
