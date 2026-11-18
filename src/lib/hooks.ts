"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Runs `load` now and again (debounced) whenever any of `tables` changes via Supabase Realtime.
 * Returns { loading, error, reload }.
 */
export function useLiveData(load: () => Promise<void>, tables: string[], deps: unknown[] = []) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      await loadRef.current();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const sb = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout>;
    const ch = sb.channel(`live-${tables.join("-")}-${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(reload, 400);
      });
    }
    ch.subscribe();
    return () => {
      clearTimeout(timer);
      sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps]);

  return { loading, error, reload };
}
