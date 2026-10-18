/**
 * Edits that change more than one clip: insert and overwrite, ripple, roll, slip, closing gaps, speed, and
 * linked clips. Each works on a plain model of the tracks (film ms, and each clip's own source ms) and comes back as
 * the operations film.html takes (studio/server/ops.mjs), in one batch: one write, one undo step.
 *
 * Rules every edit here keeps:
 *   · a locked track never changes;
 *   · clips on one track never overlap;
 *   · a ripple moves what comes after the edit point on the tracks it reaches: the clips' own tracks and, with sync
 *     lock, every unlocked track, so a voice-over or B-roll stays with the picture it belongs to. Time is closed only
 *     as far as every one of those tracks has room (`shortMs` says how much could not be), so they never come apart;
 *   · with linkage (CapCut's 联动) an edit of the main track (the lowest picture track) carries the clips on the
 *     other tracks with the main-track clips they start over (rides). A long clip crossing more than one cut there (a
 *     music bed) stays where it is. The main track alone limits it; a clip carried into another on its track goes to
 *     a free track nearby (settle).
 *
 * Pure: the timeline draws a plan's `placed` while the hand is still on a clip, and sends its `ops` on release.
 */
import type { Op, PropValue } from '../api.ts';
import type { TimelineTrack } from './timeline-layout';
import { MIN_BLOCK_MS } from './timeline-drag.ts';
import { frameMs } from './timecode.ts';

/** Clips closer than this are touching: film.html rounds each time alone, to the millisecond. */
export const TOUCH_MS = 1;

/** What an overwrite leaves of a clip shorter than this goes with the rest: a sliver of a frame is not a shot. */
const PIECE_MIN_MS = frameMs(1);

/** A clip as an edit sees it. */
export interface EditClip {
  /** Its id in film.html. */
  id: string;
  startMs: number;
  endMs: number;
  /** The source millisecond it starts at (its in point); 0 for a still. */
  inMs: number;
  /** Source ms per film ms (`speed`); 1 without one. */
  speed: number;
  /** How long its source is, in source ms; Infinity when it has no end (a page holds its last frame). */
  sourceMs: number;
  /** A picture: no source to trim into, any length; its in point stays 0. */
  still?: boolean;
  /** Its `data-link`: clips sharing one move, trim, split and delete together. */
  link?: string;
}

export interface EditTrack {
  /** Its place in film.html; below 0 for a track an edit opens (see openTrack). */
  index: number;
  /** A track an edit opens: what it was opened for. */
  openKey?: string;
  locked?: boolean;
  /** What the timeline calls it by the clips on it; a sound taken off a video goes to an `audio` one. */
  role?: 'mg' | 'video' | 'audio';
  clips: EditClip[];
}

export type EditModel = readonly EditTrack[];

/**
 * What a ripple carries besides the tracks edited. `sync` (sync lock, as Premiere): every unlocked track, as far as
 * all of them have room. `linkage` (as CapCut): an edit of the main track carries the clips on every other unlocked
 * track. Sync lock wins when both are on.
 */
export interface Follow { sync: boolean; linkage?: boolean }

/** The main track: the lowest picture track (V1), film.html's last track that is not a sound track. */
export function mainTrackOf(model: readonly Pick<EditTrack, 'index' | 'role'>[]): number | null {
  const pictures = model.filter((t) => t.index >= 0 && t.role !== 'audio');
  return pictures.length ? Math.max(...pictures.map((t) => t.index)) : null;
}

/** Whether the magnet acts on a track: it is CapCut's main-track magnet, so only on the main track. */
export function magnetOn(model: EditModel, track: number | null | undefined, magnet: boolean): boolean {
  return magnet && track != null && track === mainTrackOf(model);
}

/**
 * The main-track clip a clip rides on with linkage: the one its start falls in, or the last when it starts after the
 * main track ends. None in a gap of the main track.
 */
export function hostOf(main: Pick<EditTrack, 'clips'>, clip: { startMs: number }): EditClip | null {
  const on = main.clips.find((c) => clip.startMs >= c.startMs - TOUCH_MS && clip.startMs < c.endMs - TOUCH_MS);
  if (on) return on;
  const last = [...main.clips].sort((a, b) => b.endMs - a.endMs)[0];
  return last && clip.startMs >= last.endMs - TOUCH_MS ? last : null;
}

/**
 * Whether a clip rides on the main track with linkage: it has a host (hostOf) and crosses at most one cut of the main
 * track — a title, a sticker, a sound effect, B-roll over a shot or two. A clip crossing more (a music bed under
 * several shots) belongs to the film's time, not to a shot, and stays where it is.
 */
export function ridesOn(main: Pick<EditTrack, 'clips'>, clip: { startMs: number; endMs: number }): boolean {
  if (!hostOf(main, clip)) return false;
  const cuts = new Set(main.clips.flatMap((c) => [c.startMs, c.endMs]));
  let crossed = 0;
  for (const cut of cuts) if (cut > clip.startMs + TOUCH_MS && cut < clip.endMs - TOUCH_MS) crossed += 1;
  return crossed <= 1;
}

/** Where a track goes: one in film.html, or a new one opened at that place. */
export type TrackDest = number | { insert: number };

/** Where a clip the edit touched ends up, for drawing it before it is written; null: it goes. */
export type Placed = { startMs: number; endMs: number; track: TrackDest } | null;

export interface EditPlan {
  ops: Op[];
  /** By clip id; the halves an edit cuts off a clip are `<id>~b`. */
  placed: Map<string, Placed>;
  /** Time a ripple meant to close but could not, because a clip on a track it reaches is in the way (ms). */
  shortMs: number;
}

/* ── the model, from the timeline's rows ── */

/**
 * The model of a timeline: one track per film.html track (rows spread from one track are joined again), the clips
 * that are written in film.html (a drop not written yet is not one). `links`: clip id → its `data-link`.
 */
export function editModelOf(tracks: readonly TimelineTrack[], links?: ReadonlyMap<string, string>): EditTrack[] {
  const byIndex = new Map<number, EditTrack>();
  for (const row of tracks) {
    if (row.docIndex == null) continue;
    let track = byIndex.get(row.docIndex);
    if (!track) {
      track = { index: row.docIndex, role: row.role, clips: [], ...(row.locked ? { locked: true } : {}) };
      byIndex.set(row.docIndex, track);
    }
    if (row.locked) track.locked = true;
    for (const b of row.blocks) {
      if (!b.clipId || !b.loc) continue;
      const speed = b.speed && b.speed > 0 ? b.speed : 1;
      const still = Boolean(b.anchor?.still);
      const inMs = still ? 0 : b.inMs ?? Math.round((b.anchor?.trimFrom ?? 0) * 1000);
      const srcEnd = inMs + (b.endMs - b.startMs) * speed;
      const sourceMs = still ? Infinity
        : b.sourceDurMs != null ? b.sourceDurMs
          : b.room?.tailMs != null ? srcEnd + b.room.tailMs * speed : Infinity;
      const link = links?.get(b.clipId);
      track.clips.push({
        id: b.clipId, startMs: b.startMs, endMs: b.endMs, inMs, speed, sourceMs,
        ...(still ? { still: true } : {}),
        ...(link ? { link } : {}),
      });
    }
  }
  const out = [...byIndex.values()].sort((a, b) => a.index - b.index);
  for (const track of out) track.clips.sort((a, b) => a.startMs - b.startMs);
  return out;
}

/* ── a draft: the model being changed, and what it was ── */

/** A draft of the model, for edits planned elsewhere on the same terms (lib/transitions). */
export interface Draft {
  before: Map<string, { clip: EditClip; track: number }>;
  tracks: EditTrack[];
  /** Clips going to a track opened by this edit, and where it opens. */
  opened: Map<string, number>;
  /** The right half cut off a clip, by the clip's id. */
  cut: Map<string, EditClip>;
  shortMs: number;
  /** Linkage carried clips without asking their tracks for room: some may now run into another (see settle). */
  settle?: boolean;
  /** With linkage, the clips on other tracks that do not ride on the main track (ridesOn, as the film was). */
  anchored?: Set<string>;
}

/**
 * A track this edit opens, at film.html place `insert`, for clips put there: one per `key` (a new track per track the
 * clips came from, say), with an index of its own below 0 so new tracks never share one by accident.
 */
function openTrack(d: Draft, insert: number, key: string, role?: EditTrack['role']): EditTrack {
  const name = `${insert}:${key}`;
  const found = d.tracks.find((t) => t.index < 0 && t.openKey === name);
  if (found) return found;
  const track: EditTrack = { index: Math.min(0, ...d.tracks.map((t) => t.index)) - 1, clips: [], openKey: name, ...(role ? { role } : {}) };
  d.tracks.push(track);
  return track;
}

function draftOf(model: EditModel): Draft {
  const before = new Map<string, { clip: EditClip; track: number }>();
  const tracks = model.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c })) }));
  for (const t of model) for (const c of t.clips) before.set(c.id, { clip: c, track: t.index });
  return { before, tracks, opened: new Map(), cut: new Map(), shortMs: 0 };
}

const lenOf = (c: EditClip): number => c.endMs - c.startMs;
const srcEndOf = (c: EditClip): number => c.inMs + lenOf(c) * c.speed;
/** How far the head can still be pulled out, in film ms. */
const headRoomOf = (c: EditClip): number => (c.still ? Infinity : Math.max(0, c.inMs / c.speed));
/** How far the tail can still be pulled out, in film ms. */
const tailRoomOf = (c: EditClip): number => (
  c.still || !Number.isFinite(c.sourceMs) ? Infinity : Math.max(0, (c.sourceMs - srcEndOf(c)) / c.speed)
);

/**
 * How much more of its source a clip can show at one edge, in film ms: how far that edge can still be pulled out.
 * Infinity for a still or a source with no end; undefined for a clip not in the model.
 */
export function sourceLeftMs(model: EditModel, id: string, edge: 'start' | 'end'): number | undefined {
  const c = model.flatMap((t) => t.clips).find((x) => x.id === id);
  if (!c) return undefined;
  return edge === 'start' ? headRoomOf(c) : tailRoomOf(c);
}

function trackAt(d: Draft, index: number): EditTrack | undefined {
  return d.tracks.find((t) => t.index === index);
}

function find(d: Draft, id: string): { track: EditTrack; clip: EditClip } | null {
  for (const track of d.tracks) {
    const clip = track.clips.find((c) => c.id === id);
    if (clip) return { track, clip };
  }
  return null;
}

/** The head moved to `ms`: the in point follows (a still keeps 0). */
function setStart(c: EditClip, ms: number): void {
  if (!c.still) c.inMs = Math.max(0, c.inMs + (ms - c.startMs) * c.speed);
  c.startMs = ms;
}

function shiftClip(c: EditClip, ms: number): void {
  c.startMs += ms;
  c.endMs += ms;
}

/** The tracks a ripple reaches: those edited and, with sync lock, every other; never a locked one. */
function reach(d: Draft, edited: Iterable<number>, sync: boolean): number[] {
  const set = new Set(sync ? d.tracks.map((t) => t.index) : edited);
  return d.tracks.filter((t) => set.has(t.index) && !t.locked).map((t) => t.index);
}

/**
 * The tracks a ripple moves (`tracks`) and those whose room limits it (`bound`): with sync lock every unlocked track
 * both moves and limits; with linkage an edit of the main track moves every unlocked track, limited by the tracks
 * edited alone; else just the tracks edited.
 */
function follow(d: Draft, edited: Iterable<number>, opts: Follow): { tracks: number[]; bound: number[] } {
  const own = reach(d, edited, false);
  if (opts.sync) {
    const all = reach(d, [], true);
    return { tracks: all, bound: all };
  }
  const main = mainTrackOf(d.tracks);
  if (opts.linkage && main != null && own.includes(main)) {
    d.anchored ??= anchoredOf(d, main);
    return { tracks: reach(d, [], true), bound: own };
  }
  return { tracks: own, bound: own };
}

/** The clips on other tracks that stay put with linkage (they do not ride on the main track as it was). */
function anchoredOf(d: Draft, main: number): Set<string> {
  const was = [...d.before.values()];
  const mainWas = { clips: was.filter((x) => x.track === main).map((x) => x.clip) };
  return new Set(was.filter((x) => x.track !== main && !ridesOn(mainWas, x.clip)).map((x) => x.clip.id));
}

/**
 * How far left what starts at or after `point` on a track can go before it meets what stays (what starts before it).
 * Infinity when nothing starts after it.
 */
function roomBefore(track: EditTrack, point: number, skip?: ReadonlySet<string>): number {
  let floor = 0;
  let first = Infinity;
  for (const c of track.clips) {
    if (skip?.has(c.id)) continue;
    if (c.startMs >= point - TOUCH_MS) first = Math.min(first, c.startMs);
    else floor = Math.max(floor, c.endMs);
  }
  return Number.isFinite(first) ? Math.max(0, first - floor) : Infinity;
}

/**
 * Move what starts at or after `point` by `deltaMs` on these tracks. Leftwards only as far as every track has room;
 * the time that could not be closed is added to `shortMs`. Returns the shift made.
 */
function rippleAt(
  d: Draft,
  point: number,
  deltaMs: number,
  tracks: readonly number[],
  skip?: ReadonlySet<string>,
  bound: readonly number[] = tracks,
): number {
  const rows = tracks.map((i) => trackAt(d, i)).filter((t): t is EditTrack => Boolean(t && !t.locked));
  const limits = rows.filter((t) => bound.includes(t.index));
  let amount = deltaMs;
  if (amount < 0) {
    const room = Math.min(...limits.map((t) => roomBefore(t, point, skip)));
    if (-amount > room) {
      d.shortMs += -amount - room;
      amount = -room;
    }
  }
  if (!amount) return 0;
  if (limits.length < rows.length) d.settle = true;
  for (const t of rows) {
    /* the tracks carried along (linkage): what does not ride on the main track stays */
    const still = limits.includes(t) ? undefined : d.anchored;
    for (const c of t.clips) {
      if (!skip?.has(c.id) && !still?.has(c.id) && c.startMs >= point - TOUCH_MS) shiftClip(c, amount);
    }
  }
  return amount;
}

/**
 * Close spans of time: per track its own (`byTrack`), or with sync lock all of them merged, on every track; with
 * linkage, when the main track has spans, those, carrying every unlocked track. From the last span back, so closing
 * one does not move the ones before it. Returns the shifts made, for mapping a time from before to after (see
 * mapThrough).
 */
interface Shift { point: number; amount: number; tracks: readonly number[] }
function closeSpans(d: Draft, byTrack: ReadonlyMap<number, { startMs: number; endMs: number }[]>, opts: Follow): Shift[] {
  const shifts: Shift[] = [];
  const main = mainTrackOf(d.tracks);
  const onMain = main != null ? byTrack.get(main) : undefined;
  type Group = { spans: { startMs: number; endMs: number }[]; tracks: number[]; bound: number[] };
  const groups: Group[] = opts.sync
    ? [{ spans: [...byTrack.values()].flat(), ...follow(d, [], opts) }]
    : opts.linkage && onMain && !trackAt(d, main!)?.locked
      ? [{ spans: onMain, ...follow(d, [main!], opts) }]
      : [...byTrack.entries()].map(([t, spans]) => ({ spans, ...follow(d, [t], { sync: false }) }));
  for (const group of groups) {
    if (!group.tracks.length) continue;
    for (const span of mergeSpans(group.spans).reverse()) {
      const amount = rippleAt(d, span.endMs, -(span.endMs - span.startMs), group.tracks, undefined, group.bound);
      if (amount) shifts.push({ point: span.endMs, amount, tracks: group.tracks });
    }
  }
  return shifts;
}

function mergeSpans(spans: readonly { startMs: number; endMs: number }[]): { startMs: number; endMs: number }[] {
  const out: { startMs: number; endMs: number }[] = [];
  for (const s of [...spans].sort((a, b) => a.startMs - b.startMs)) {
    const last = out.at(-1);
    if (last && s.startMs <= last.endMs + TOUCH_MS) last.endMs = Math.max(last.endMs, s.endMs);
    else if (s.endMs > s.startMs) out.push({ ...s });
  }
  return out;
}

/** A time from before some shifts, after them, on one track: inside a closed span it lands where the span closed to. */
function mapThrough(ms: number, track: number, shifts: readonly Shift[]): number {
  let at = ms;
  for (const s of shifts) {
    if (!s.tracks.includes(track)) continue;
    if (at >= s.point - TOUCH_MS) at += s.amount;
    else if (s.amount < 0 && at > s.point + s.amount) at = s.point + s.amount;
  }
  return at;
}

/** Cut a clip in two at `ms`: the right half is a new clip (`<id>~b`) right after it. */
function cutAt(d: Draft, track: EditTrack, c: EditClip, ms: number): EditClip | null {
  if (!(ms > c.startMs + TOUCH_MS && ms < c.endMs - TOUCH_MS) || d.cut.has(c.id)) return null;
  const right: EditClip = { ...c, id: `${c.id}~b` };
  setStart(right, ms);
  c.endMs = ms;
  track.clips.push(right);
  d.cut.set(c.id, right);
  return right;
}

/**
 * Take [a, b) off a track: what lies inside goes, what reaches into it is trimmed back, what spans it is cut in two.
 * A piece shorter than a frame goes too. With `only`, just those clips (the rest of the track stays as it is).
 */
function clearRange(d: Draft, track: EditTrack, a: number, b: number, skip?: ReadonlySet<string>, only?: ReadonlySet<string>): void {
  for (const c of [...track.clips]) {
    if (skip?.has(c.id) || (only && !only.has(c.id)) || c.endMs <= a + TOUCH_MS || c.startMs >= b - TOUCH_MS) continue;
    if (c.startMs < a && c.endMs > b) {
      /* spanning it: cut in two, unless one side would be a sliver (then that side goes) */
      const keepLeft = a - c.startMs >= PIECE_MIN_MS;
      const keepRight = c.endMs - b >= PIECE_MIN_MS;
      if (keepLeft && keepRight) cutAt(d, track, c, b);
      if (keepLeft) c.endMs = a;
      else if (keepRight) setStart(c, b);
      else c.endMs = c.startMs;
    } else if (c.startMs < a) {
      c.endMs = a;
    } else if (c.endMs > b) {
      setStart(c, b);
    } else {
      c.endMs = c.startMs;
    }
    if (lenOf(c) < PIECE_MIN_MS) track.clips.splice(track.clips.indexOf(c), 1);
  }
}

/**
 * An overwrite of [a, b) on these tracks takes the same time off the clips linked to what it covers there (a video's
 * detached sound), on their own tracks: no sound is left under a picture that is gone. Other clips on those tracks,
 * and locked tracks, stay. Called before the tracks themselves are cleared.
 */
function clearLinked(d: Draft, tracks: readonly number[], a: number, b: number, skip?: ReadonlySet<string>): void {
  const links = new Set<string>();
  for (const t of d.tracks) {
    if (!tracks.includes(t.index)) continue;
    for (const c of t.clips) {
      if (c.link && !skip?.has(c.id) && c.endMs > a + TOUCH_MS && c.startMs < b - TOUCH_MS) links.add(c.link);
    }
  }
  if (!links.size) return;
  for (const t of d.tracks) {
    if (t.locked || tracks.includes(t.index)) continue;
    const only = new Set(t.clips.filter((c) => c.link && links.has(c.link) && !skip?.has(c.id)).map((c) => c.id));
    if (only.size) clearRange(d, t, a, b, skip, only);
  }
}

/**
 * The right halves an edit cut off linked clips: those cut together (a picture and its sound) are linked to each
 * other with a link of their own, as the left halves stay linked; a half cut alone is linked to nothing, or it would
 * pull the clips its left half is linked to along.
 */
function relinkCuts(d: Draft): void {
  const now = new Set(d.tracks.flatMap((t) => t.clips));
  const byLink = new Map<string, EditClip[]>();
  for (const right of d.cut.values()) {
    if (!right.link || !now.has(right)) continue;
    byLink.set(right.link, [...(byLink.get(right.link) ?? []), right]);
  }
  if (!byLink.size) return;
  const taken = new Set([...d.before.values()].flatMap((x) => (x.clip.link ? [x.clip.link] : [])));
  for (const [link, halves] of byLink) {
    let fresh: string | undefined;
    if (halves.length > 1) {
      fresh = `${link}-b`;
      for (let n = 2; taken.has(fresh); n++) fresh = `${link}-b-${n}`;
      taken.add(fresh);
    }
    for (const right of halves) {
      if (fresh) right.link = fresh;
      else delete right.link;
    }
  }
}

/* ── the plan: what changed, as film.html's operations ── */

const sec = (ms: number): number => Math.round(ms) / 1000;

/** The source end film.html writes (`#t=in,end`); a still's is its length. */
const writtenEnd = (c: EditClip): number => (c.still ? lenOf(c) : Math.min(srcEndOf(c), c.sourceMs));

/** The fields of a clip that changed from `was` to `now`, as ops.mjs's props take them. */
function changedFields(was: EditClip, now: EditClip): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  if (Math.abs(now.startMs - was.startMs) >= 0.5) out.at = sec(Math.max(0, now.startMs));
  if (!now.still && Math.abs(now.inMs - was.inMs) >= 0.5) out.start = sec(Math.max(0, now.inMs));
  if (Math.abs(writtenEnd(now) - writtenEnd(was)) >= 0.5) out.end = sec(writtenEnd(now));
  if (now.speed !== was.speed) out.speed = now.speed === 1 ? null : now.speed;
  if ((now.link ?? null) !== (was.link ?? null)) out.link = now.link ?? null;
  return out;
}

const overlap = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean => (
  a.startMs < b.endMs - TOUCH_MS && a.endMs > b.startMs + TOUCH_MS
);

/**
 * Clips carried (linkage) or put (the magnet, off the main track) into another clip on their track go to another
 * track: the one that moved goes, the one that stayed stays. Where: the nearest unlocked track of their kind with room
 * (above for a picture, below for a sound), not the main track; else a new track opened beside theirs.
 */
function settle(d: Draft): void {
  const main = mainTrackOf(d.tracks);
  const moved = (c: EditClip, on: EditTrack): boolean => {
    const was = d.before.get(c.id);
    return !was || was.track !== on.index || Math.abs(was.clip.startMs - c.startMs) >= 0.5;
  };
  const relocate = (from: EditTrack, c: EditClip): void => {
    const free = nearestFree(d.tracks, from, c);
    if (free) {
      free.clips.push(c);
      return;
    }
    const insert = newTrackBeside(from);
    d.opened.set(c.id, insert);
    /* clips settled beside one track share a new one while they fit on it */
    let n = 0;
    let opened = openTrack(d, insert, `settle-${from.index}-${n}`, from.role);
    while (opened.clips.some((x) => overlap(x, c))) opened = openTrack(d, insert, `settle-${from.index}-${++n}`, from.role);
    opened.clips.push(c);
  };
  for (const t of [...d.tracks]) {
    if (t.index < 0 || t.index === main || t.locked) continue;
    const kept: EditClip[] = [];
    for (const c of [...t.clips].sort((a, b) => a.startMs - b.startMs)) {
      const hits = kept.filter((k) => overlap(k, c));
      if (!hits.length) {
        kept.push(c);
        continue;
      }
      const go = moved(c, t) || hits.some((h) => !moved(h, t)) ? [c] : hits;
      for (const x of go) {
        t.clips.splice(t.clips.indexOf(x), 1);
        if (kept.includes(x)) kept.splice(kept.indexOf(x), 1);
        relocate(t, x);
      }
      if (!go.includes(c)) kept.push(c);
    }
  }
}

/**
 * The nearest unlocked track of the same kind as `from` (sound or picture) with `span` free, not the main track and
 * not `from`: above for a picture, below for a sound at the same distance. Undefined when none has room.
 */
type Lane = Pick<EditTrack, 'index' | 'role' | 'locked'> & { clips: readonly { startMs: number; endMs: number }[] };
function nearestFree<T extends Lane>(tracks: readonly T[], from: Lane, span: { startMs: number; endMs: number }): T | undefined {
  const main = mainTrackOf(tracks);
  const sound = (t: Lane) => t.role === 'audio';
  return tracks
    .filter((t) => t !== from && t.index >= 0 && t.index !== main && !t.locked && sound(t) === sound(from))
    .filter((t) => !t.clips.some((x) => overlap(x, span)))
    .sort((a, b) => {
      const away = Math.abs(a.index - from.index) - Math.abs(b.index - from.index);
      return away || (sound(from) ? b.index - a.index : a.index - b.index);
    })[0];
}

/** Where a track opened for a clip that found no room goes: above a picture track, below a sound track. */
const newTrackBeside = (from: Lane): number => (from.role === 'audio' ? from.index + 1 : from.index);

/**
 * Where a clip put on a track off the main track goes with the magnet, as CapCut's: covering nothing. That track
 * when the time is free there, else the nearest free track of its kind (nearestFree), else a new track beside it.
 * `taken`: what has been put already in the same edit (on existing tracks).
 */
export function freeTrackFor(
  model: EditModel,
  track: number,
  span: { startMs: number; endMs: number },
  taken: readonly { track: number; startMs: number; endMs: number }[] = [],
): TrackDest {
  const tracks: Lane[] = model.map((t) => ({ ...t, clips: [...t.clips, ...taken.filter((x) => x.track === t.index)] }));
  const own = tracks.find((t) => t.index === track);
  if (!own) return track;
  if (!own.clips.some((c) => overlap(c, span))) return track;
  return nearestFree(tracks, own, span)?.index ?? { insert: newTrackBeside(own) };
}

function planOf(d: Draft): EditPlan {
  if (d.settle) settle(d);
  relinkCuts(d);
  const ops: Op[] = [];
  const edits: { clip: string; prop: string; value: PropValue }[] = [];
  const removes: Op[] = [];
  const placed = new Map<string, Placed>();
  const now = new Map<string, { clip: EditClip; track: number }>();
  for (const t of d.tracks) for (const c of t.clips) now.set(c.id, { clip: c, track: t.index });
  const destOf = (id: string, track: number): TrackDest => {
    const opened = d.opened.get(id);
    return opened != null ? { insert: opened } : track;
  };
  /*
   * A new track takes one clip as it opens (film.html opens a track per clip moved to `{ insert }`); the others on it
   * move onto it in a second step, by the place it has once all are open: the new tracks open in order of place, each
   * before the track that was there, so the i-th (in that order) is at `insert + i`.
   */
  const fresh = d.tracks.filter((t) => t.index < 0 && t.clips.length)
    .map((t) => ({ t, insert: d.opened.get(t.clips[0]!.id)! }))
    .sort((a, b) => a.insert - b.insert);
  const opener = new Set<string>();
  const joins = new Map<string, number>();
  fresh.forEach(({ t, insert }, i) => {
    const [first, ...rest] = [...t.clips].sort((a, b) => a.startMs - b.startMs);
    opener.add(first!.id);
    for (const c of rest) joins.set(c.id, insert + i);
  });
  const openEdits: { clip: string; prop: string; value: PropValue }[] = [];
  const joinEdits: { clip: string; prop: string; value: PropValue }[] = [];
  for (const [id, was] of d.before) {
    const cur = now.get(id);
    if (!cur) {
      removes.push({ op: 'remove', clip: id });
      placed.set(id, null);
      continue;
    }
    const fields = changedFields(was.clip, cur.clip);
    const dest = destOf(id, cur.track);
    const right = d.cut.get(id);
    if (right && now.has(right.id)) {
      const rightFields = changedFields(was.clip, right);
      ops.push({ op: 'split', clip: id, left: fields, right: rightFields });
      placed.set(id, { startMs: cur.clip.startMs, endMs: cur.clip.endMs, track: dest });
      placed.set(right.id, { startMs: right.startMs, endMs: right.endMs, track: dest });
      continue;
    }
    const moved = typeof dest === 'object' || dest !== was.track;
    if (!Object.keys(fields).length && !moved) continue;
    for (const [prop, value] of Object.entries(fields)) edits.push({ clip: id, prop, value });
    if (joins.has(id)) joinEdits.push({ clip: id, prop: 'track', value: joins.get(id)! });
    else if (opener.has(id)) openEdits.push({ clip: id, prop: 'track', value: dest });
    else if (moved) edits.push({ clip: id, prop: 'track', value: dest });
    placed.set(id, { startMs: cur.clip.startMs, endMs: cur.clip.endMs, track: dest });
  }
  /* the openers in the order the new tracks open (see above) */
  const openOrder = (clip: string) => fresh.findIndex((f) => f.t.clips.some((c) => c.id === clip));
  openEdits.sort((a, b) => openOrder(a.clip) - openOrder(b.clip));
  if (edits.length || openEdits.length) ops.push({ op: 'props', edits: [...edits, ...openEdits] });
  if (joinEdits.length) ops.push({ op: 'props', edits: joinEdits });
  ops.push(...removes);
  return { ops, placed, shortMs: d.shortMs };
}

/* the draft's own steps, for edits planned elsewhere (lib/transitions) */
export { draftOf, find as findInDraft, follow, planOf, reach, rippleAt, trackAt };

/** An edit that changes nothing. */
export function emptyPlan(): EditPlan {
  return { ops: [], placed: new Map(), shortMs: 0 };
}

/* ── linked clips ── */

/** These clips and every clip linked to one of them. */
export function linkedIds(model: EditModel, ids: readonly string[]): string[] {
  const clips = model.flatMap((t) => t.clips);
  const links = new Set(clips.filter((c) => ids.includes(c.id) && c.link).map((c) => c.link));
  const out = new Set(ids);
  for (const c of clips) if (c.link && links.has(c.link)) out.add(c.id);
  return [...out];
}

/** A link value no clip has yet, from `base`. */
export function freshLink(model: EditModel, base: string, taken: ReadonlySet<string> = new Set()): string {
  const used = new Set([...taken, ...model.flatMap((t) => t.clips.flatMap((c) => (c.link ? [c.link] : [])))]);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Link clips: they all get one `data-link`, the first's id (or a link one of them has already, so clips linked before
 * stay with them). Fewer than two clips link nothing.
 */
export function planLink(model: EditModel, ids: readonly string[]): Op[] {
  if (ids.length < 2) return [];
  const clips = model.flatMap((t) => t.clips);
  const picked = ids.map((id) => clips.find((c) => c.id === id)).filter((c): c is EditClip => Boolean(c));
  if (picked.length < 2) return [];
  const others = new Set(clips.filter((c) => !ids.includes(c.id) && c.link).map((c) => c.link!));
  const kept = picked.find((c) => c.link)?.link;
  const link = kept ?? freshLink(model, picked[0]!.id, others);
  const edits = picked.filter((c) => c.link !== link).map((c) => ({ clip: c.id, prop: 'link', value: link }));
  return edits.length ? [{ op: 'props', edits }] : [];
}

/** Unlink clips: their `data-link` goes, and so does the last one's left alone with that link. */
export function planUnlink(model: EditModel, ids: readonly string[]): Op[] {
  const clips = model.flatMap((t) => t.clips);
  const gone = new Set(clips.filter((c) => ids.includes(c.id) && c.link).map((c) => c.id));
  for (const link of new Set(clips.filter((c) => gone.has(c.id)).map((c) => c.link))) {
    const left = clips.filter((c) => c.link === link && !gone.has(c.id));
    if (left.length === 1) gone.add(left[0]!.id);
  }
  return gone.size ? [{ op: 'props', edits: [...gone].map((clip) => ({ clip, prop: 'link', value: null })) }] : [];
}

/* ── gaps ── */

/** The empty stretch of a track around `ms`, between two clips or before the first; null on a clip or after the last. */
export function gapAt(model: EditModel, track: number, ms: number): { startMs: number; endMs: number } | null {
  const clips = model.find((t) => t.index === track)?.clips ?? [];
  if (clips.some((c) => ms >= c.startMs && ms < c.endMs)) return null;
  const startMs = Math.max(0, ...clips.filter((c) => c.endMs <= ms).map((c) => c.endMs));
  const after = clips.filter((c) => c.startMs > ms).map((c) => c.startMs);
  if (!after.length) return null;
  const endMs = Math.min(...after);
  return endMs - startMs > TOUCH_MS ? { startMs, endMs } : null;
}

/**
 * Close a gap: what comes after it moves back, on its track and, with sync lock, every unlocked track. A gap picked
 * is closed whole: when a synced track has no room for it (a clip there spans the gap's end), it closes on its own
 * track alone, and `alone` says so.
 */
export function planCloseGap(
  model: EditModel,
  track: number,
  gap: { startMs: number; endMs: number },
  opts: Follow,
): EditPlan & { alone?: boolean } {
  const d = draftOf(model);
  if (trackAt(d, track)?.locked) return emptyPlan();
  closeSpans(d, new Map([[track, [gap]]]), opts);
  if (!opts.sync || d.shortMs <= 0) return planOf(d);
  const alone = draftOf(model);
  closeSpans(alone, new Map([[track, [gap]]]), { sync: false });
  return { ...planOf(alone), alone: true };
}

/** The gaps on a track: before its first clip and between clips (not after the last). */
export function gapsOf(model: EditModel, track: number): { startMs: number; endMs: number }[] {
  const spans: { startMs: number; endMs: number }[] = [];
  let end = 0;
  for (const c of [...(model.find((t) => t.index === track)?.clips ?? [])].sort((x, y) => x.startMs - y.startMs)) {
    if (c.startMs - end > TOUCH_MS) spans.push({ startMs: end, endMs: c.startMs });
    end = Math.max(end, c.endMs);
  }
  return spans;
}

/**
 * Every gap on a track closed (CapCut's "批量闭合空隙"), carrying what follows as a ripple does (sync lock, linkage on
 * the main track). Nothing on a locked track.
 */
export function planCloseTrackGaps(model: EditModel, track: number, opts: Follow): EditPlan {
  const spans = gapsOf(model, track);
  if (!spans.length || model.find((t) => t.index === track)?.locked) return emptyPlan();
  const d = draftOf(model);
  closeSpans(d, new Map([[track, spans]]), opts);
  return planOf(d);
}

/** The main track closed up, as CapCut does when its magnet is turned on (planCloseTrackGaps on the main track). */
export function planCloseMainGaps(model: EditModel, opts: Follow): EditPlan {
  const main = mainTrackOf(model);
  return main == null ? emptyPlan() : planCloseTrackGaps(model, main, opts);
}

/* ── delete ── */

/**
 * Delete clips. With `ripple` the time they took closes after them (each track its own, or with sync lock all the
 * deleted time on every unlocked track, or with linkage the main track's, carrying the other tracks); `'main'` closes
 * only the main track's (the magnet), the others leave a gap; without, they all leave a gap. With linkage the clips
 * riding on a deleted main-track clip go too. Clips on locked tracks stay.
 */
export function planRemove(model: EditModel, ids: readonly string[], opts: Follow & { ripple: boolean | 'main' }): EditPlan {
  const d = draftOf(model);
  const main = mainTrackOf(model);
  /* with linkage what rides on a main-track clip goes with it, as CapCut's ("随着主轨移动、删除") */
  const mainTrack = model.find((t) => t.index === main);
  if (opts.linkage && !opts.sync && mainTrack && !mainTrack.locked) {
    const gone = new Set(mainTrack.clips.filter((c) => ids.includes(c.id)).map((c) => c.id));
    const riders = model.filter((t) => t !== mainTrack && !t.locked).flatMap((t) => t.clips)
      .filter((c) => gone.size && ridesOn(mainTrack, c) && gone.has(hostOf(mainTrack, c)?.id ?? ''));
    if (riders.length) ids = [...ids, ...riders.map((c) => c.id)];
  }
  const spans = new Map<number, { startMs: number; endMs: number }[]>();
  for (const t of d.tracks) {
    if (t.locked) continue;
    const gone = t.clips.filter((c) => ids.includes(c.id));
    if (!gone.length) continue;
    t.clips = t.clips.filter((c) => !ids.includes(c.id));
    if (opts.ripple === 'main' && t.index !== main) continue;
    spans.set(t.index, gone.map((c) => ({ startMs: c.startMs, endMs: c.endMs })));
  }
  if (opts.ripple && spans.size) closeSpans(d, spans, opts);
  return planOf(d);
}

/* ── insert and overwrite: room for clips coming in ── */

export type EditMode = 'insert' | 'overwrite';

/**
 * Where an insert goes on a track, as in CapCut's main track: over a clip, before it when over its first half and
 * after it over the second; in a gap, where it was put (`atMs`, kept inside the gap); past the last clip, right after
 * it (so a first clip on an empty track starts at 0). `pointerMs` is where the hand is.
 */
export function insertPointOn(model: EditModel, track: number, pointerMs: number, atMs: number, skip?: ReadonlySet<string>): number {
  const clips = (model.find((t) => t.index === track)?.clips ?? []).filter((c) => !skip?.has(c.id));
  const over = clips.find((c) => pointerMs >= c.startMs && pointerMs < c.endMs);
  if (over) return pointerMs < (over.startMs + over.endMs) / 2 ? over.startMs : over.endMs;
  const lastEnd = Math.max(0, ...clips.map((c) => c.endMs));
  if (pointerMs >= lastEnd) return lastEnd;
  const gapStart = Math.max(0, ...clips.filter((c) => c.endMs <= pointerMs).map((c) => c.endMs));
  const gapEnd = Math.min(...clips.filter((c) => c.startMs > pointerMs).map((c) => c.startMs));
  return Math.min(Math.max(atMs, gapStart), gapEnd);
}

/**
 * Room for clips coming in, `durMs` long from `atMs`, on these tracks: an insert pushes what starts there on, on them
 * and with sync lock on every unlocked track (a clip on them that `atMs` falls inside is cut there first, and its rest
 * goes on with them); an overwrite takes that time off them. The clips themselves are the caller's (insert ops after
 * these).
 */
export function planRoom(
  model: EditModel,
  spans: readonly { track: number; startMs: number; endMs: number }[],
  opts: Follow & { mode: EditMode },
): EditPlan {
  const d = draftOf(model);
  if (spans.some((s) => trackAt(d, s.track)?.locked)) return emptyPlan();
  if (opts.mode === 'overwrite') {
    const dests = spans.map((s) => s.track);
    for (const s of spans) clearLinked(d, dests, s.startMs, s.endMs);
    for (const s of spans) {
      const track = trackAt(d, s.track);
      if (track) clearRange(d, track, s.startMs, s.endMs);
    }
    return planOf(d);
  }
  if (!spans.length) return planOf(d);
  const at = Math.min(...spans.map((s) => s.startMs));
  const durMs = Math.max(...spans.map((s) => s.endMs)) - at;
  const dests = [...new Set(spans.map((s) => s.track))];
  for (const index of dests) {
    const track = trackAt(d, index)!;
    if (!track) continue;
    for (const c of [...track.clips]) cutAt(d, track, c, at);
  }
  const f = follow(d, dests, opts);
  rippleAt(d, at, durMs, f.tracks, undefined, f.bound);
  return planOf(d);
}

/* ── moving clips ── */

export interface MoveSpec {
  /** The clips in hand, the one grabbed first. */
  ids: readonly string[];
  /** How far they move in time (where they land, after snapping). */
  deltaMs: number;
  /** Where the hand is (film ms, before the move): an insert goes before or after the clip under it. */
  pointerMs: number;
  /** Clips going to another track (an index), or to a new one (`{ insert }`). The rest stay on theirs. */
  to?: ReadonlyMap<string, TrackDest>;
  mode: EditMode;
  sync: boolean;
  linkage?: boolean;
  /**
   * The main-track magnet. Given, the time clips leave on the main track closes up when it is on (wherever they land),
   * and the time they leave on other tracks stays open; an overwrite off the main track covers nothing then: a clip
   * landing on another goes to a free track (settle), as CapCut's. Not given, an insert closes the time they leave
   * everywhere and an overwrite covers what is there.
   */
  magnet?: boolean;
}

/**
 * Clips moved. Overwrite: they land where they were let go and take that time off the tracks they land on. Insert:
 * they are lifted out (the time they took closes, as a ripple delete) and go in at the insert point of the track the
 * grabbed one lands on, pushing what comes after on (as an insert). A new track takes them as they are. With linkage,
 * main-track clips moved along the main track take the clips riding on them (hostOf) along.
 * Null when a track it would change is locked.
 */
export function planMove(model: EditModel, spec: MoveSpec): (EditPlan & { landMs: number }) | null {
  const d = draftOf(model);
  const ids = spec.ids.filter((id) => d.before.has(id));
  const main = ids[0];
  if (!main) return null;
  const hand = new Set(ids);
  const destOf = (id: string): TrackDest => spec.to?.get(id) ?? d.before.get(id)!.track;
  for (const id of ids) {
    const dest = destOf(id);
    if (trackAt(d, d.before.get(id)!.track)?.locked) return null;
    if (typeof dest === 'number' && (!trackAt(d, dest) || trackAt(d, dest)!.locked)) return null;
  }
  /* with linkage, what rides on main-track clips that stay on the main track goes with them: taken off too */
  const mainIndex = mainTrackOf(model);
  const mainTrack = mainIndex != null ? trackAt(d, mainIndex) : undefined;
  const riders = new Map<EditClip, { track: EditTrack; host: string }>();
  if (spec.linkage && !spec.sync && mainTrack && !mainTrack.locked) {
    const hosts = new Set(mainTrack.clips.filter((c) => hand.has(c.id) && destOf(c.id) === mainIndex).map((c) => c.id));
    for (const t of d.tracks) {
      if (t === mainTrack || t.locked || !hosts.size) continue;
      for (const c of t.clips) {
        const host = hand.has(c.id) || !ridesOn(mainTrack, c) ? null : hostOf(mainTrack, c);
        if (host && hosts.has(host.id)) riders.set(c, { track: t, host: host.id });
      }
    }
    for (const [c, r] of riders) r.track.clips.splice(r.track.clips.indexOf(c), 1);
  }
  /* take them off their tracks */
  const lifted = new Map<string, EditClip>();
  const spans = new Map<number, { startMs: number; endMs: number }[]>();
  for (const t of d.tracks) {
    for (const c of t.clips.filter((x) => hand.has(x.id))) {
      lifted.set(c.id, c);
      spans.set(t.index, [...(spans.get(t.index) ?? []), { startMs: c.startMs, endMs: c.endMs }]);
    }
    t.clips = t.clips.filter((c) => !hand.has(c.id));
  }
  const mainWas = d.before.get(main)!.clip;
  const mainDest = destOf(main);
  let landMs = Math.max(0, mainWas.startMs + spec.deltaMs);
  /* the group keeps its shape; none goes before 0 */
  const offset = (c: EditClip) => c.startMs - mainWas.startMs;
  const minOffset = Math.min(...[...lifted.values()].map(offset));
  landMs = Math.max(landMs, -minOffset);

  /* an insert lifts them out: the time they took closes, as a ripple delete (with the magnet given: on the main
     track, when it is on) */
  const closing = spec.magnet === undefined
    ? (spec.mode === 'insert' ? spans : null)
    : spec.magnet && mainIndex != null && spans.has(mainIndex) ? new Map([[mainIndex, spans.get(mainIndex)!]]) : null;
  const shifts = closing ? closeSpans(d, closing, spec) : [];
  if (spec.mode === 'insert' && typeof mainDest === 'number') {
    /* the insert point, worked out on the track as it was (where the hand is), then carried through the lift; the
       first of them goes in there, whichever is in hand (the group keeps its shape after it) */
    const point = insertPointOn(model, mainDest, spec.pointerMs, landMs + minOffset, hand);
    landMs = Math.max(-minOffset, mapThrough(point, mainDest, shifts) - minOffset);
    const starts = [...lifted.values()].map((c) => landMs + offset(c));
    const at = Math.min(...starts);
    const durMs = Math.max(...[...lifted.values()].map((c) => landMs + offset(c) + lenOf(c))) - at;
    const dests = [...new Set(ids.map(destOf).filter((t): t is number => typeof t === 'number'))];
    for (const index of dests) {
      const track = trackAt(d, index);
      if (track) for (const c of [...track.clips]) cutAt(d, track, c, at);
    }
    const f = follow(d, dests, spec);
    rippleAt(d, at, durMs, f.tracks, undefined, f.bound);
  }

  /* put them down */
  for (const [id, c] of lifted) {
    const startMs = landMs + offset(c);
    c.endMs = startMs + lenOf(c);
    c.startMs = startMs;
    const dest = destOf(id);
    if (typeof dest === 'object') {
      /* a new track for each track the clips came from: a group keeps its rows */
      d.opened.set(id, dest.insert);
      openTrack(d, dest.insert, `from-${d.before.get(id)!.track}`).clips.push(c);
      continue;
    }
    const track = trackAt(d, dest)!;
    if (spec.mode === 'overwrite' && spec.magnet && dest !== mainIndex) {
      d.settle = true;
    } else if (spec.mode === 'overwrite') {
      clearLinked(d, [dest], c.startMs, c.endMs, hand);
      clearRange(d, track, c.startMs, c.endMs, hand);
    }
    track.clips.push(c);
  }
  /* the riders, where their clip went */
  for (const [c, r] of riders) {
    const host = lifted.get(r.host)!;
    shiftClip(c, host.startMs - d.before.get(r.host)!.clip.startMs);
    r.track.clips.push(c);
    d.settle = true;
  }
  const plan = planOf(d);
  return { ...plan, landMs };
}

/* ── trims ── */

/** One clip's part in a trim: which edge moves (`start` takes the in point along), or the whole clip, or its content. */
export type EdgeKind = 'start' | 'end' | 'shift' | 'slip';
export interface EdgeMove { id: string; kind: EdgeKind }

/**
 * How far an edge can go, both ways: not past its source, not shorter than the shortest clip, not into a neighbor
 * on its track that is not moving along (one that is, the other side of a roll, is not a fence).
 */
function rangeOf(track: EditTrack, c: EditClip, kind: EdgeKind, moving: ReadonlySet<string>): [number, number] {
  let lo = -Infinity;
  let hi = Infinity;
  const others = track.clips.filter((x) => x !== c);
  const prev = others.filter((x) => x.endMs <= c.startMs + TOUCH_MS).sort((a, b) => b.endMs - a.endMs)[0];
  const next = others.filter((x) => x.startMs >= c.endMs - TOUCH_MS).sort((a, b) => a.startMs - b.startMs)[0];
  const fenceStart = prev && !moving.has(`${prev.id}:end`) ? prev.endMs - c.startMs : -c.startMs;
  const fenceEnd = next && !moving.has(`${next.id}:start`) ? next.startMs - c.endMs : Infinity;
  if (kind === 'start') {
    lo = Math.max(-headRoomOf(c), fenceStart);
    hi = Math.max(0, lenOf(c) - MIN_BLOCK_MS);
  } else if (kind === 'end') {
    lo = -Math.max(0, lenOf(c) - MIN_BLOCK_MS);
    hi = Math.min(tailRoomOf(c), fenceEnd);
  } else if (kind === 'shift') {
    lo = fenceStart;
    hi = fenceEnd;
  } else {
    /* the content moves with the hand: dragged right, earlier frames come into the clip */
    if (c.still) return [0, 0];
    lo = Number.isFinite(c.sourceMs) ? -(c.sourceMs - srcEndOf(c)) / c.speed : -Infinity;
    hi = c.inMs / c.speed;
  }
  return [Math.min(lo, 0), Math.max(hi, 0)];
}

function applyEdge(c: EditClip, kind: EdgeKind, ms: number): void {
  if (kind === 'start') setStart(c, c.startMs + ms);
  else if (kind === 'end') c.endMs += ms;
  else if (kind === 'shift') shiftClip(c, ms);
  else c.inMs = Math.max(0, c.inMs - ms * c.speed);
}

/**
 * Edges moved together by one amount, kept to what every one of them allows: a trim (one edge, and the same edge of
 * linked clips), a roll (the end of one clip and the start of the next), a slip (the content of clips, the
 * inspector's source bar), a nudge (clips shifted into free time). Moves on locked tracks are left out.
 */
export function planEdges(model: EditModel, moves: readonly EdgeMove[], deltaMs: number): EditPlan & { deltaMs: number } {
  const d = draftOf(model);
  const live = moves
    .map((m) => ({ m, at: find(d, m.id) }))
    .filter((x): x is { m: EdgeMove; at: { track: EditTrack; clip: EditClip } } => Boolean(x.at && !x.at.track.locked));
  const moving = new Set(live.flatMap(({ m }) => (m.kind === 'shift' ? [`${m.id}:start`, `${m.id}:end`] : [`${m.id}:${m.kind}`])));
  let lo = -Infinity;
  let hi = Infinity;
  for (const { m, at } of live) {
    const [a, b] = rangeOf(at.track, at.clip, m.kind, moving);
    lo = Math.max(lo, a);
    hi = Math.min(hi, b);
  }
  /* `+ 0`: no -0 from a fence at 0 */
  const amount = (live.length ? Math.min(Math.max(deltaMs, Math.min(lo, 0)), Math.max(hi, 0)) : 0) + 0;
  if (amount) for (const { m, at } of live) applyEdge(at.clip, m.kind, amount);
  return { ...planOf(d), deltaMs: amount };
}

/**
 * A ripple trim: one edge of these clips (the first is the one in hand, the rest linked to it) moves by `deltaMs` and
 * what comes after follows, on their tracks and with sync lock every unlocked track. The start edge trims the head
 * and keeps the clip where it starts, as in Premiere and CapCut: it is the clip that gets shorter, and what follows
 * moves back. Shortening stops where a track the ripple reaches has no room.
 */
export function planRippleTrim(
  model: EditModel,
  ids: readonly string[],
  edge: 'start' | 'end',
  deltaMs: number,
  opts: Follow,
): EditPlan & { deltaMs: number } {
  const d = draftOf(model);
  const parts = ids.map((id) => find(d, id)).filter((x): x is { track: EditTrack; clip: EditClip } => Boolean(x && !x.track.locked));
  const main = parts[0];
  if (!main) return { ...emptyPlan(), deltaMs: 0 };
  /* how much longer each gets (a head pulled left lengthens too) */
  let grow = edge === 'end' ? deltaMs : -deltaMs;
  for (const { clip } of parts) {
    grow = Math.max(grow, -Math.max(0, lenOf(clip) - MIN_BLOCK_MS));
    grow = Math.min(grow, edge === 'end' ? tailRoomOf(clip) : headRoomOf(clip));
  }
  const point = main.clip.endMs;
  const { tracks, bound } = follow(d, parts.map((p) => p.track.index), opts);
  const skip = new Set(parts.map((p) => p.clip.id));
  if (grow < 0) {
    const room = Math.min(...bound.map((i) => roomBefore(trackAt(d, i)!, point, skip)));
    grow = Math.max(grow, -room);
  }
  if (!grow) return { ...planOf(d), deltaMs: 0 };
  for (const { clip } of parts) {
    if (edge === 'start' && !clip.still) clip.inMs = Math.max(0, clip.inMs - grow * clip.speed);
    clip.endMs += grow;
  }
  rippleAt(d, point, grow, tracks, skip, bound);
  return { ...planOf(d), deltaMs: edge === 'end' ? grow : -grow };
}

/**
 * Ripple trim to the playhead (Q and W): `start` takes off the head up to `atMs`, `end` the tail from it, and what
 * comes after closes up. Null when `atMs` is not inside the first clip.
 */
export function planRippleTrimTo(model: EditModel, ids: readonly string[], edge: 'start' | 'end', atMs: number, opts: Follow): EditPlan | null {
  const main = model.flatMap((t) => t.clips).find((c) => c.id === ids[0]);
  if (!main || !(atMs > main.startMs + TOUCH_MS && atMs < main.endMs - TOUCH_MS)) return null;
  const plan = planRippleTrim(model, ids, edge, edge === 'start' ? atMs - main.startMs : atMs - main.endMs, opts);
  return plan.ops.length ? plan : null;
}

/**
 * A roll of the cut after `leftId`: its end and the next clip's start move together. Linked clips with a cut at the
 * same place roll too; a linked clip whose edge is elsewhere has it trimmed by the same amount.
 */
export function rollMoves(model: EditModel, leftId: string, rightId: string, linked: boolean): EdgeMove[] {
  const out: EdgeMove[] = [{ id: leftId, kind: 'end' }, { id: rightId, kind: 'start' }];
  if (!linked) return out;
  for (const id of linkedIds(model, [leftId]).filter((x) => x !== leftId)) out.push({ id, kind: 'end' });
  for (const id of linkedIds(model, [rightId]).filter((x) => x !== rightId)) {
    if (!out.some((m) => m.id === id)) out.push({ id, kind: 'start' });
  }
  return out;
}

/* ── speed ── */

/**
 * A new speed for clips (the first and those linked to it): each keeps its part of the source, so its length on the
 * film changes. With `ripple` what comes after follows; without, a clip that would run into the next one cannot get
 * that slow: `slowest` says how slow it can go, and nothing changes.
 */
export function planSpeed(
  model: EditModel,
  ids: readonly string[],
  speed: number,
  opts: Follow & { ripple: boolean },
): EditPlan & { slowest?: number } {
  const d = draftOf(model);
  const parts = ids.map((id) => find(d, id)).filter((x): x is { track: EditTrack; clip: EditClip } => Boolean(x && !x.track.locked && !x.clip.still));
  const main = parts[0];
  if (!main || !(speed > 0)) return emptyPlan();
  const grow = (c: EditClip) => (lenOf(c) * c.speed) / speed - lenOf(c);
  if (!opts.ripple) {
    /* each may grow only into the free time after it */
    let slowest = 0;
    for (const { track, clip } of parts) {
      const next = track.clips.filter((x) => x !== clip && x.startMs >= clip.endMs - TOUCH_MS);
      if (!next.length) continue;
      const free = Math.max(0, Math.min(...next.map((x) => x.startMs)) - clip.endMs);
      slowest = Math.max(slowest, (lenOf(clip) * clip.speed) / (lenOf(clip) + free));
    }
    if (speed < slowest - 1e-9) return { ...emptyPlan(), slowest: Math.ceil(slowest * 100) / 100 };
    for (const { clip } of parts) {
      clip.endMs += grow(clip);
      clip.speed = speed;
    }
    return planOf(d);
  }
  const point = main.clip.endMs;
  const by = grow(main.clip);
  const { tracks, bound } = follow(d, parts.map((p) => p.track.index), opts);
  const skip = new Set(parts.map((p) => p.clip.id));
  for (const { clip } of parts) {
    clip.endMs += grow(clip);
    clip.speed = speed;
  }
  rippleAt(d, point, by, tracks, skip, bound);
  return planOf(d);
}

/* ── where a sound taken off a video goes ── */

/**
 * The track for a video's sound taken apart from it: the first sound track with room for it over `range` (below the
 * video first), else a new one opened under the last sound track (or at the bottom).
 */
export function soundTrackFor(model: EditModel, range: { startMs: number; endMs: number }, fromTrack: number): TrackDest {
  const free = (t: EditTrack) => t.role === 'audio' && !t.locked
    && !t.clips.some((c) => c.startMs < range.endMs - TOUCH_MS && c.endMs > range.startMs + TOUCH_MS);
  const below = model.filter((t) => t.index > fromTrack).find(free) ?? model.find(free);
  if (below) return below.index;
  const sounds = model.filter((t) => t.role === 'audio');
  const last = Math.max(-1, ...model.map((t) => t.index));
  return { insert: sounds.length ? Math.max(...sounds.map((t) => t.index)) + 1 : last + 1 };
}
