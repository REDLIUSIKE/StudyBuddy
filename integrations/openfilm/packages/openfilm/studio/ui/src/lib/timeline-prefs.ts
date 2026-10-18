/**
 * The timeline's switches, kept on this machine across projects:
 *   · `snap` (on by default, as in CapCut, Premiere and OpenCut): drags line up with edges and the playhead; off means
 *     "it lands exactly where I let go";
 *   · `magnet` (on by default, as CapCut's main-track magnet): the main track (the lowest picture track) stays closed
 *     up — a clip put down on it inserts and pushes what follows, a delete or a clip taken off it closes the gap, a
 *     trim ripples. On other tracks nothing is covered: a clip put where another is goes to a free track, a delete
 *     leaves a gap. Off, the main track is like the others;
 *   · `linkage` (on, as CapCut's 联动): an edit of the main track carries the clips on the other tracks along with
 *     the main-track clips they start over, so titles, B-roll and sound stay with their picture.
 *
 * Clips sharing a `data-link` (a video and its detached sound) are always selected and edited together; ⌥-click picks
 * one alone. Premiere's sync lock is not offered: linkage does that job, the CapCut way.
 *
 * The inspector reads them too (a slower speed pushes the next clip only with the magnet on), so a change is told to
 * everyone listening.
 */
import { useSyncExternalStore } from 'react';

export type TimelinePrefs = { snap: boolean; magnet: boolean; linkage: boolean };
type Pref = keyof TimelinePrefs;

const DEFAULTS: TimelinePrefs = { snap: true, magnet: true, linkage: true };
const KEY: Record<Pref, string> = {
  snap: 'openfilm.timeline.snap',
  /* new keys: the magnet now acts on the main track alone, and sync lock gave way to linkage, so the choices made
     for the old switches do not carry over */
  magnet: 'openfilm.timeline.mainMagnet',
  linkage: 'openfilm.timeline.linkage',
};

/** Without localStorage (private window), the choices last this session. */
const memory: Partial<TimelinePrefs> = {};
const listeners = new Set<() => void>();
let current: TimelinePrefs | null = null;

function read(pref: Pref): boolean {
  try {
    const raw = localStorage.getItem(KEY[pref]);
    if (raw != null) return raw !== '0';
  } catch { /* no localStorage: this session's choice */ }
  return memory[pref] ?? DEFAULTS[pref];
}

export function readTimelinePrefs(): TimelinePrefs {
  current ??= { snap: read('snap'), magnet: read('magnet'), linkage: read('linkage') };
  return current;
}

export function writeTimelinePref(pref: Pref, on: boolean): void {
  memory[pref] = on;
  try {
    localStorage.setItem(KEY[pref], on ? '1' : '0');
  } catch { /* not stored: `memory` has it */ }
  current = { ...readTimelinePrefs(), [pref]: on };
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The switches, kept up to date wherever one is changed. */
export function useTimelinePrefs(): TimelinePrefs {
  return useSyncExternalStore(subscribe, readTimelinePrefs, () => DEFAULTS);
}

/** What a ripple carries along (timeline-edit Follow), from the switches. */
export function followOf(prefs: Pick<TimelinePrefs, 'linkage'>): { sync: boolean; linkage: boolean } {
  return { sync: false, linkage: prefs.linkage };
}
