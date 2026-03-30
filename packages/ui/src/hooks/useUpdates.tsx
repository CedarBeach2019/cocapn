/**
 * useUpdates — fetches the auto-publisher's updates/index.json and
 * returns the list of UpdateEntry objects, sorted newest-first.
 *
 * The base URL defaults to the document origin (works on GitHub Pages
 * where the public repo is served at the same domain).
 */

import { useState, useEffect, useCallback } from "react";
import type { UpdateEntry, UpdatesIndex } from "@/types/updates.js";

export interface UseUpdatesResult {
  entries: UpdateEntry[];
  loading: boolean;
  /** Non-null when the fetch failed or the file doesn't exist yet. */
  error: string | null;
  refresh: () => void;
}

export function useUpdates(baseUrl = ""): UseUpdatesResult {
  const [entries, setEntries] = useState<UpdateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = `${baseUrl}/updates/index.json`;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
        return r.json() as Promise<UpdatesIndex>;
      })
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setEntries([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [baseUrl, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { entries, loading, error, refresh };
}
