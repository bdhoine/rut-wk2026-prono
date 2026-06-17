// Netlify Function (v2): nudge the "Update results" GitHub Actions workflow to
// run now, so the committed results/klassement data refresh sooner after a
// match instead of waiting for the next ~15-min scheduled run.
//
// Served at /.netlify/functions/trigger-update. The client (LiveScores.astro)
// calls this only while a match is recently/currently in its window; this
// endpoint adds the guards: it never dispatches when a run is already
// queued/in_progress, nor when the last run is younger than FRESH_MS, and it
// self-debounces via a Netlify Blob so repeated calls can't pile up dispatches.
// The workflow's own `concurrency` group is a second safety net.
//
// Requires a GitHub token in env GH_DISPATCH_TOKEN (needs actions:write on the
// repo; the gh CLI's `workflow` scope is enough). Without it this is a no-op.
import { getStore } from '@netlify/blobs';

const REPO = 'bdhoine/rut-wk2026-prono';
const WORKFLOW = 'update-results.yml';
const REF = 'master';
const FRESH_MS = 5 * 60 * 1000; // skip when the last run is younger than this
const STORE = 'update-trigger';
const KEY = 'last-dispatch';

function json(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'rut-wk2026-prono',
});

// GitHub run states that mean "don't add another dispatch".
const ACTIVE = new Set(['queued', 'in_progress', 'requested', 'waiting', 'pending']);

export default async function () {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return json({ ok: false, error: 'not-configured' });

  const now = Date.now();

  // Self-debounce: at most one dispatch per FRESH_MS, even across cold starts.
  let store = null;
  try {
    store = getStore(STORE);
    const last = await store.get(KEY, { type: 'json' });
    if (last?.ts && now - last.ts < FRESH_MS) return json({ ok: true, status: 'debounced' });
  } catch { /* blob optional; fall through */ }

  try {
    // Is a run already queued or running? If so, never add another.
    const runsRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=10`,
      { headers: ghHeaders(token) },
    );
    if (runsRes.ok) {
      const data = await runsRes.json();
      const runs = data.workflow_runs ?? [];
      if (runs.some((r) => ACTIVE.has(r.status))) return json({ ok: true, status: 'running' });
      const latestMs = runs[0] ? Date.parse(runs[0].created_at) : NaN;
      if (Number.isFinite(latestMs) && now - latestMs < FRESH_MS) return json({ ok: true, status: 'fresh' });
    }

    // Trigger a run.
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      { method: 'POST', headers: ghHeaders(token), body: JSON.stringify({ ref: REF }) },
    );
    if (dispatchRes.status !== 204) {
      const detail = await dispatchRes.text().catch(() => '');
      return json({ ok: false, error: 'dispatch-failed', code: dispatchRes.status, detail: detail.slice(0, 200) });
    }
    try { await store?.setJSON(KEY, { ts: now }); } catch { /* ignore */ }
    return json({ ok: true, status: 'triggered' });
  } catch (err) {
    return json({ ok: false, error: 'failed', detail: String(err?.message ?? err).slice(0, 200) });
  }
}
