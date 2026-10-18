import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupDragged, layerInGroup, pullGroup, type GroupDrag, type GroupPull } from './stage-gesture.ts';

const t = (x: number, y: number, s = 1, rotate = 0) => ({ x, y, scaleX: s, scaleY: s, rotate });
const size = { w: 100, h: 50 };
const drag = (d: Partial<GroupDrag>): GroupDrag => ({ kind: 'move', dx: 0, dy: 0, kx: 1, ky: 1, turn: 0, anchor: { x: 0, y: 0 }, ...d });
const near = (a: Record<string, number>, b: Record<string, number>) => {
  for (const k of Object.keys(b)) assert.ok(Math.abs(a[k]! - b[k]!) < 1e-9, `${k}: ${a[k]} vs ${b[k]}`);
};

test('several clips dragged together move by the same amount', () => {
  assert.deepEqual(groupDragged(drag({ dx: 30, dy: -10 }), t(100, 40), size), t(130, 30));
});

test('scaled from a corner, every clip keeps its place in proportion about the corner that stays', () => {
  const d = drag({ kind: 'scale', kx: 0.5, ky: 0.5, anchor: { x: 100, y: 40 } });
  near(groupDragged(d, t(100, 40, 2), size), t(100, 40, 1));
  near(groupDragged(d, t(700, 340), size), t(400, 190, 0.5));
});

test('stretched from an edge, only that way: each clip is stretched too', () => {
  const d = drag({ kind: 'scale', kx: 2, ky: 1, anchor: { x: 0, y: 0 } });
  near(groupDragged(d, t(100, 0), size), { x: 200, y: 0, scaleX: 2, scaleY: 1, rotate: 0 });
});

test('turned, each clip goes round the middle of the frame and turns by as much', () => {
  /* a clip whose center is 100 px right of the middle, turned a quarter: its center 100 px below, itself turned 90° */
  const d = drag({ kind: 'rotate', turn: 90, anchor: { x: 0, y: 0 } });
  near(groupDragged(d, t(50, -25), size), t(-50, 75, 1, 90));
});

test('several layers scaled from a corner: each center keeps its place in proportion, each one scaled as much', () => {
  const d = drag({ kind: 'scale', kx: 2, ky: 2, anchor: { x: 100, y: 100 } });
  const g = { t: [5, 5] as [number, number], s: [1, 0.5] as [number, number], r: 30 };
  assert.deepEqual(layerInGroup(d, { x: 100, y: 100 }, g), { dx: 0, dy: 0, s: [2, 1], r: 30 }, 'at the corner that stays: not moved');
  assert.deepEqual(layerInGroup(d, { x: 150, y: 120 }, g), { dx: 50, dy: 20, s: [2, 1], r: 30 });
});

test('several layers turned: each center goes round the box\'s middle, each one turned as much', () => {
  const m = layerInGroup(drag({ kind: 'rotate', turn: 90, anchor: { x: 0, y: 0 } }), { x: 10, y: 0 }, { t: [0, 0], s: [1, 1], r: 10 });
  assert.ok(Math.abs(m.dx - -10) < 1e-9 && Math.abs(m.dy - 10) < 1e-9, `${m.dx}, ${m.dy}`);
  assert.equal(m.r, 100);
});

test('a selection\'s box pulled: a corner scales both ways alike, an edge one way, the ring turns (Shift: 15° steps)', () => {
  const pull = (p: Partial<GroupPull>): GroupPull => ({ ...drag({}), handle: null, from: { x: 0, y: 0 }, a0: 0, ...p });
  const corner = pull({ kind: 'scale', handle: 'se', anchor: { x: 0, y: 0 }, from: { x: 100, y: 50 } });
  pullGroup(corner, { x: 200, y: 100 }, false);
  assert.deepEqual([corner.kx, corner.ky], [2, 2]);
  const edge = pull({ kind: 'scale', handle: 'e', anchor: { x: 0, y: 25 }, from: { x: 100, y: 25 } });
  pullGroup(edge, { x: 150, y: 80 }, false);
  assert.deepEqual([edge.kx, edge.ky], [1.5, 1]);
  const ring = pull({ kind: 'rotate', anchor: { x: 0, y: 0 } });
  pullGroup(ring, { x: 0, y: 10 }, false);
  assert.ok(Math.abs(ring.turn - 90) < 1e-9);
  pullGroup(ring, { x: 10, y: 4 }, true);
  assert.equal(ring.turn, 15);
});
