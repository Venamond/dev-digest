import { REPORT_TTL_MS, REPORT_WINDOWS } from './constants.js';

/**
 * A15 — when the next regeneration is due. Pure arithmetic over timestamps;
 * the caller decides what to do with the answer.
 */

export interface ScheduleEntry {
  window: (typeof REPORT_WINDOWS)[number];
  dueAt: Date;
}

export function nextDue(lastGeneratedAt: Date | null): Date {
  const base = lastGeneratedAt ? lastGeneratedAt.getTime() : Date.now() - REPORT_TTL_MS;
  return new Date(base + REPORT_TTL_MS);
}

export function scheduleFor(lastGeneratedAt: Date | null): ScheduleEntry[] {
  const dueAt = nextDue(lastGeneratedAt);
  return REPORT_WINDOWS.map((window) => ({ window, dueAt }));
}

export function isDue(entry: ScheduleEntry, now: Date): boolean {
  return entry.dueAt.getTime() <= now.getTime();
}
