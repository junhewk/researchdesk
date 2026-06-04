"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { SupervisorEvent } from "@/server/types";

interface UseEventStreamOptions {
  sessionId: string | null;
  onEvent?: (event: SupervisorEvent) => void;
}

export function useEventStream({ sessionId, onEvent }: UseEventStreamOptions) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SupervisorEvent;
        onEventRef.current?.(event);
      } catch {
        // skip unparseable events
      }
    };

    es.onerror = () => {
      setConnected(false);
      if (es.readyState === EventSource.CLOSED) {
        es.close();
      }
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [sessionId]);

  return { connected, disconnect };
}
