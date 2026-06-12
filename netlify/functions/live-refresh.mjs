// Scheduled Netlify Function: poll the slow worldcup26.ir API in the background
// and write the latest live-scores payload to a Netlify Blob. The user-facing
// /.netlify/functions/live endpoint reads that blob instead of calling the
// upstream itself, so its response time never depends on the upstream's 10-16s
// latency (which exceeds the synchronous-function limit).
//
// Scheduled functions get a 30s budget (enough for the slow fetch) and run on
// all plans. To stay cheap on the free tier we only hit the upstream while a
// match is actually in progress — outside those windows this returns in ~1ms.
// At every 2 minutes that bounds the expensive fetches to ~match time only.
import { getStore } from '@netlify/blobs';
import { getGames, liveMatchesFromGames } from '../../scripts/lib/worldcup.mjs';
import matches from '../../src/data/matches.json' with { type: 'json' };

export const config = { schedule: '*/2 * * * *' };

const PRE_MS = 5 * 60 * 1000; // begin polling 5 min before kickoff
const PLAY_MS = 2.5 * 60 * 60 * 1000; // ...through ~2.5h after (extra time + buffer)

// A match's kickoff carries its venue UTC offset, so Date.parse gives the true
// instant. True while any match is within its live window.
function matchInProgress(now) {
  return matches.some((m) => {
    const k = Date.parse(m.kickoff);
    return Number.isFinite(k) && now >= k - PRE_MS && now <= k + PLAY_MS;
  });
}

export default async function () {
  if (!matchInProgress(Date.now())) return; // cheap no-op between matches
  try {
    const games = await getGames({ timeoutMs: 27000, retries: 0 });
    const payload = { ok: true, updatedAt: new Date().toISOString(), matches: liveMatchesFromGames(games) };
    await getStore('live-scores').setJSON('latest', { ts: Date.now(), payload });
  } catch (err) {
    // Leave the previous blob in place; the live endpoint serves it as stale.
    console.error('live-refresh failed:', err?.message ?? err);
  }
}
