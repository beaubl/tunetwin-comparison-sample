import {
  comparisonCoverage,
  comparisonPage,
  mergeComparisonLibraryTotals,
  mergeComparisonTracks,
} from './src/comparison-reader.mjs';

const firstReader = { runId: 'scan-1', cursor: 0 };
const secondReader = { ...firstReader };
const response = {
  run_id: 'scan-1',
  items: [
    { id: 'track-1', name: 'Paper Lanterns' },
    { id: 'track-2', name: 'Daybreak' },
  ],
  next_cursor: 2,
};

const firstPage = comparisonPage(firstReader, response);
const replayedPage = comparisonPage(firstReader, response);
const { tracks } = mergeComparisonTracks(firstPage.items, replayedPage.items);
firstReader.cursor = replayedPage.cursor;

console.log(`Matches after replay: ${tracks.map(track => track.name).join(', ')}`);
console.log(`Reader positions: ${firstReader.cursor} and ${secondReader.cursor}`);
secondReader.cursor = comparisonPage(secondReader, response).cursor;
console.log(`After the second reader catches up: ${firstReader.cursor} and ${secondReader.cursor}`);

const pending = mergeComparisonLibraryTotals({}, {
  user1: { saved: 2, total: 2, total_known: false },
});
const confirmed = mergeComparisonLibraryTotals(pending, {
  user1: { saved: 2, playlists: 8, total: 10, total_known: true },
});
const before = comparisonCoverage(2, pending.user1);
const after = comparisonCoverage(2, confirmed.user1);
console.log(`Coverage while counting: ${before.known ? before.percent + '%' : 'pending'}`);
console.log(`Coverage with a confirmed total: ${after.percent}%`);
