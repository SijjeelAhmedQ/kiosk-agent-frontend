/**
 * Which brain the floor is running on, for the indicator in the rail.
 *
 * The rail is drawn by all five pages, so this read happens on all five. That
 * makes it the one shared fetch on this floor, and it is written to cost as
 * little as a fetch can:
 *
 * · One request per page load, not a poll. The selection only changes when
 *   somebody changes it, and the page that changes it is the one page that
 *   re-reads afterwards.
 * · `sessionStorage` carries the last answer across a navigation, so the rail
 *   draws the right thing immediately instead of flashing "unknown" on every
 *   page change — these are five separate documents, and without it every link
 *   would be a fresh unknown state.
 * · Failure is silence. The agent service being down is not something the
 *   *navigation* should shout about; each console already says so in its own
 *   status strip, and a second red row in the rail on every page would be
 *   noise.
 *
 * It reads the ordering agent on 8100 because that is the service a control
 * panel expects to be up. Any of the four would answer identically — they all
 * mount `/api/llm` and all read the same file.
 */

import { useEffect, useState } from 'react';

const BASE =
  (import.meta.env.VITE_AGENT_BASE_URL as string | undefined) ?? 'http://localhost:8100';

const CACHE_KEY = 'fk-active-llm';

/** Only what the rail draws. The full shape lives in `src/llm/types.ts`. */
export interface ActiveLlmBadge {
  provider: string;
  model: string;
  displayName: string;
  kind: string;
  ready: boolean;
}

function readCache(): ActiveLlmBadge | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ActiveLlmBadge) : null;
  } catch {
    // Private mode, no storage, or something else wrote nonsense under the key.
    return null;
  }
}

function writeCache(badge: ActiveLlmBadge): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(badge));
  } catch {
    /* nothing to do — the rail just re-fetches on the next page */
  }
}

/** The active provider and model, or null while it is unknown. */
export function useActiveLlm(): ActiveLlmBadge | null {
  const [badge, setBadge] = useState<ActiveLlmBadge | null>(readCache);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${BASE}/api/llm/config`);
        if (!response.ok) return;
        const payload = (await response.json()) as {
          data?: { active?: ActiveLlmBadge };
        };
        const active = payload.data?.active;
        if (!active || cancelled) return;
        setBadge(active);
        writeCache(active);
      } catch {
        // The service is down. The cached badge, if there is one, is a better
        // answer than blanking the row — and each console says so properly.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return badge;
}
