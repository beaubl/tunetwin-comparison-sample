// Totals grow as playlist summaries arrive. Preserve their existing numeric
// behavior, but only a current explicit server confirmation makes coverage known.
export function mergeComparisonLibraryTotals(previous = {}, incoming = {}) {
  const totals = {};
  const castCount = value => Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  for (const slot of ['user1', 'user2']) {
    const ref = previous?.[slot]
      ? { ...previous[slot], total_known: false }
      : { saved: null, playlists: 0, total: null, total_known: false };
    const update = incoming?.[slot];
    if (update) {
      const saved = castCount(update.saved);
      const playlists = castCount(update.playlists);
      const total = castCount(update.total);
      if (saved !== null) ref.saved = ref.saved === null ? saved : Math.max(ref.saved, saved);
      if (playlists !== null) ref.playlists = ref.playlists === null ? playlists : Math.max(ref.playlists, playlists);
      if (total !== null) {
        ref.total = ref.total === null ? total : Math.max(ref.total, total);
      } else if (saved !== null || playlists !== null) {
        const computed = (saved !== null ? saved : (ref.saved || 0)) + (playlists !== null ? playlists : (ref.playlists || 0));
        ref.total = ref.total === null ? computed : Math.max(ref.total, computed);
      }
      ref.total_known = update.total_known === true && Number.isFinite(update.total) && update.total >= 0;
      if (update.total_count_status !== undefined) {
        ref.total_count_status = ref.total_known ? 'known'
          : update.total_count_status === 'partial' ? 'partial' : 'counting';
      } else {
        delete ref.total_count_status;
      }
    } else {
      delete ref.total_count_status;
    }
    if (ref.total === null && (ref.saved !== null || ref.playlists)) {
      ref.total = (ref.saved || 0) + (ref.playlists || 0);
    }
    totals[slot] = ref;
  }
  return totals;
}

export function comparisonCoverage(processed, library) {
  const total = library?.total;
  const validTotal = Number.isFinite(total) && total >= 0;
  const validProcessed = Number.isFinite(processed) && processed >= 0;
  const known = library?.total_known === true && validTotal && validProcessed;
  return {
    known,
    percent: known && total > 0 ? Math.min(100, (processed / total) * 100) : 0,
  };
}

// The server's replayable cursor can return the same page after a lost response.
// Keep each reader's append order stable and never consume another reader's data.
export function mergeComparisonTracks(existing, incoming, limit = 10000) {
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 10000;
  const seen = new Set();
  const tracks = [];
  let truncated = false;
  for (const track of [...existing, ...incoming]) {
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    if (tracks.length >= maximum) {
      truncated = true;
      continue;
    }
    tracks.push(track);
  }
  return { tracks, truncated };
}

// Validate a page before changing the reader cursor or visible results. The
// caller replaces its reader only after committing the returned items.
export function comparisonPage(reader, payload) {
  if (typeof payload?.run_id !== 'string' || !payload.run_id) {
    throw new Error('The scan returned no comparison identity. Try again.');
  }
  if (payload.reset || payload.run_id !== reader.runId) {
    return { reset: true, runId: payload.run_id, cursor: 0, items: [] };
  }
  const items = payload.items;
  if (!Array.isArray(items) || items.some(item => typeof item?.id !== 'string' || !item.id)
    || !Number.isInteger(payload.next_cursor) || payload.next_cursor !== reader.cursor + items.length) {
    throw new Error('The scan returned an invalid result page. Try again.');
  }
  return { reset: false, runId: payload.run_id, cursor: payload.next_cursor, items };
}
