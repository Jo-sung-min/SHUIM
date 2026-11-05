"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { latestBambooNotes, readBambooNotes, type BambooNote } from "@/lib/beach/bamboo-notes";
import BambooGuestbook from "./BambooGuestbook";

type Props = { ticket: string; initialName?: string; open: boolean; onClose: () => void;
  onEntries: (notes: readonly BambooNote[]) => void };

/** Keep the surface in the world and its readable close-up on the same room snapshot. */
export default function BambooBulletin({ ticket, initialName, open, onClose, onEntries }: Props) {
  const [entries, setEntries] = useState<BambooNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = useCallback(() => {
    clearTimeout(timer.current); request.current?.abort(); request.current = null;
  }, []);
  const refresh = useCallback(async function read() {
    cancel();
    if (document.hidden) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const notes = await readBambooNotes(ticket, controller.signal);
      if (controller.signal.aborted) return;
      setEntries(previous => previous.length === notes.length && previous.every((n, i) => n.id === notes[i].id) ? previous : notes);
      setError("");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setEntries([]);
      setError(cause instanceof Error && cause.name === "Error" ? cause.message : "게시판에 연결하지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        timer.current = setTimeout(() => void read(), 6000);
      }
    }
  }, [ticket, cancel]);
  useEffect(() => {
    const visible = () => { if (document.hidden) cancel(); else void refresh(); };
    void refresh();
    document.addEventListener("visibilitychange", visible);
    return () => { cancel(); document.removeEventListener("visibilitychange", visible); onEntries([]); };
  }, [refresh, cancel, onEntries]);
  useEffect(() => { onEntries(entries); }, [entries, onEntries]);
  return open ? <BambooGuestbook ticket={ticket} initialName={initialName} entries={entries} loading={loading} loadError={error}
    onRetry={() => void refresh()} onClose={onClose} onPosted={note => {
      cancel(); setEntries(previous => latestBambooNotes([...previous, note])); void refresh();
    }} /> : null;
}
