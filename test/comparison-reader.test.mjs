import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparisonCoverage,
  comparisonPage,
  mergeComparisonLibraryTotals,
  mergeComparisonTracks,
} from '../src/comparison-reader.mjs';

const track = (id, fields = {}) => ({ id, name: id, artists: 'Example artist', ...fields });
const ids = tracks => tracks.map(item => item.id);

test('a provisional one-of-one total cannot become full-library coverage while playlist counting is pending', () => {
  const pending = mergeComparisonLibraryTotals({}, {
    user1: { saved: 1, playlists: 0, total: 1, total_known: false },
  });
  assert.deepEqual(comparisonCoverage(1, pending.user1), { known: false, percent: 0 });
  const counted = mergeComparisonLibraryTotals(pending, {
    user1: { saved: 1, playlists: 99, total: 100, total_known: true },
  });
  assert.deepEqual(counted.user1, { saved: 1, playlists: 99, total: 100, total_known: true });
  assert.deepEqual(comparisonCoverage(1, counted.user1), { known: true, percent: 1 });
  assert.equal(pending.user1.total_known, false);
  assert.equal(pending.user1.total, 1);
});

test('coverage confirmation is independent per listener and must be explicit in every current response', () => {
  let previous = mergeComparisonLibraryTotals({}, {
    user1: { saved: 10, playlists: 20, total: 30, total_known: true },
    user2: { saved: 0, playlists: 2, total: 2, total_known: false },
  });
  assert.equal(comparisonCoverage(5, previous.user1).known, true);
  assert.equal(comparisonCoverage(2, previous.user2).known, false);
  for (const confirmation of [undefined, null, false, 'true', 1]) {
    const next = mergeComparisonLibraryTotals(previous, {
      user1: { total: 30, total_known: confirmation },
      user2: { total: 2, total_known: true },
    });
    assert.equal(next.user1.total_known, false);
    assert.equal(next.user2.total_known, true);
    assert.deepEqual([next.user1.saved, next.user1.playlists, next.user1.total], [10, 20, 30]);
    previous = next;
  }
  const missing = mergeComparisonLibraryTotals(previous, {});
  assert.equal(missing.user1.total_known, false);
  assert.equal(missing.user2.total_known, false);
  assert.equal(missing.user2.total, 2);
});

test('unknown and invalid denominators remain provisional while a confirmed zero stays a valid empty total', () => {
  for (const total of [undefined, null, '0', NaN, Infinity, -1]) {
    const totals = mergeComparisonLibraryTotals({}, { user1: { total, total_known: true } });
    assert.equal(totals.user1.total_known, false);
    assert.equal(comparisonCoverage(0, { total, total_known: true }).known, false);
  }
  assert.deepEqual(comparisonCoverage(0, null), { known: false, percent: 0 });
  const empty = mergeComparisonLibraryTotals({}, { user1: { saved: 0, playlists: 0, total: 0, total_known: true } });
  assert.deepEqual(comparisonCoverage(0, empty.user1), { known: true, percent: 0 });
  assert.deepEqual(comparisonCoverage(50, { total: 20, total_known: true }), { known: true, percent: 100 });
  for (const processed of [undefined, null, '1', NaN, Infinity, -1]) {
    assert.deepEqual(comparisonCoverage(processed, { total: 20, total_known: true }), { known: false, percent: 0 });
  }
});

test('coverage confirmation changes without resetting existing monotonic numeric totals', () => {
  const previous = Object.freeze({
    user1: Object.freeze({ saved: 10, playlists: 20, total: 30, total_known: true }),
  });
  const lower = mergeComparisonLibraryTotals(previous, {
    user1: { saved: 5, playlists: 10, total: 15, total_known: false },
  });
  assert.deepEqual(lower.user1, { saved: 10, playlists: 20, total: 30, total_known: false });
  assert.deepEqual(previous.user1, { saved: 10, playlists: 20, total: 30, total_known: true });
  const computed = mergeComparisonLibraryTotals({}, { user1: { saved: 3, playlists: 7 } });
  assert.deepEqual(computed.user1, { saved: 3, playlists: 7, total: 10, total_known: false });
});

test('each reader advances only its successful page and can retry a lost response', () => {
  const first = { runId: 'run-a', cursor: 0 };
  const second = { runId: 'run-a', cursor: 0 };
  const payload = { run_id: 'run-a', items: [track('one'), track('two')], next_cursor: 2 };
  const discarded = comparisonPage(first, payload);
  assert.equal(first.cursor, 0);
  assert.deepEqual(comparisonPage(first, payload), discarded);
  first.cursor = discarded.cursor;
  assert.equal(second.cursor, 0);
  second.cursor = comparisonPage(second, payload).cursor;
  assert.equal(first.cursor, second.cursor);
});

test('a new server run resets the reader instead of mixing generations', () => {
  const old = { runId: 'old', cursor: 85 };
  assert.deepEqual(comparisonPage(old, { run_id: 'new', reset: true, items: [], next_cursor: 0 }), {
    reset: true, runId: 'new', cursor: 0, items: [],
  });
  assert.equal(old.cursor, 85);
});

test('malformed pages never move the reader beyond tracks it actually consumed', () => {
  const reader = { runId: 'run-a', cursor: 40 };
  for (const payload of [
    {}, { run_id: 'run-a', next_cursor: 41, items: [] },
    { run_id: 'run-a', next_cursor: 41, items: [{}] },
    { run_id: 'run-a', next_cursor: 39, items: [] },
  ]) assert.throws(() => comparisonPage(reader, payload));
  assert.equal(reader.cursor, 40);
});

test('each reader accumulates the same 85 matches independently and retries do not reorder or duplicate rows', () => {
  const matches = Array.from({ length: 85 }, (_, index) => track(`id-${index}`));
  const pages = [matches.slice(0, 40), matches.slice(40, 80), matches.slice(80)];
  let first = [];
  let second = [];
  first = mergeComparisonTracks(first, pages[0]).tracks;
  second = mergeComparisonTracks(second, pages[0]).tracks;
  // Reader A receives page one twice; reader B replays all pages after reconnecting.
  first = mergeComparisonTracks(first, pages[0]).tracks;
  for (const page of pages.slice(1)) first = mergeComparisonTracks(first, page).tracks;
  for (const page of pages) second = mergeComparisonTracks(second, page).tracks;
  assert.deepEqual(ids(first), ids(matches));
  assert.deepEqual(ids(second), ids(matches));
  assert.equal(new Set(ids(first)).size, 85);
  assert.notEqual(first, second);
});

test('merge preserves inputs and flags only omitted unique results at the explicit local cap', () => {
  const existing = Object.freeze([Object.freeze(track('first')), Object.freeze(track('second'))]);
  const incoming = Object.freeze([Object.freeze(track('second')), Object.freeze(track('third')), null, {}]);
  assert.deepEqual(mergeComparisonTracks(existing, incoming, 3), { tracks: [...existing, incoming[1]], truncated: false });
  assert.deepEqual(mergeComparisonTracks(existing, incoming, 2), { tracks: [...existing], truncated: true });
  assert.deepEqual(mergeComparisonTracks(existing, [], 2), { tracks: [...existing], truncated: false });
  assert.deepEqual(mergeComparisonTracks([], incoming, 0), { tracks: [], truncated: true });
  assert.deepEqual(ids(existing), ['first', 'second']);
  assert.deepEqual(ids(incoming.filter(item => item?.id)), ['second', 'third']);
});
