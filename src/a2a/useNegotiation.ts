/**
 * One negotiation, followed live.
 *
 * The service streams flat events; this folds them into the rows the transcript
 * draws, and keeps the handful of facts the rest of the page reads off — the
 * wallet, the final report, whether anything was actually paid for.
 *
 * The fold is append-only and order-preserving. Nothing is re-sorted and
 * nothing is grouped by speaker, because in a negotiation the sequence is the
 * content: the same quote means one thing before a confirmation and another
 * after it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { a2aApi } from './api';
import type { A2AEvent, A2ARunStatus, Entry, StartA2ARunInput, WalletSummary } from './types';

const BUSY: A2ARunStatus[] = ['queued', 'running'];

interface Negotiation {
  status: A2ARunStatus;
  busy: boolean;
  entries: Entry[];
  wallet: WalletSummary | null;
  finalText: string;
  /** True when the run died *after* the money moved — both facts matter. */
  finalAfterError: boolean;
  paid: boolean;
  orderNumber: string | null;
  merchantTaskId: string | null;
  error: string | null;
  start: (input: StartA2ARunInput) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

export function useNegotiation(): Negotiation {
  const [status, setStatus] = useState<A2ARunStatus>('idle');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [finalText, setFinalText] = useState('');
  const [finalAfterError, setFinalAfterError] = useState(false);
  const [paid, setPaid] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [merchantTaskId, setMerchantTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runId = useRef<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  // Closing the stream on unmount matters more here than in a normal page: an
  // EventSource left open keeps a queue alive on the server for every reload.
  useEffect(() => () => unsubscribe.current?.(), []);

  const absorb = useCallback((event: A2AEvent) => {
    switch (event.type) {
      case 'status':
        // 'completed' and 'failed' are the *protocol's* words for a finished
        // conversation; the run's own status arrives with `final` and `error`.
        // Mapping them here would make a run look done before its report lands.
        if (event.status === 'queued' || event.status === 'running') {
          setStatus(event.status);
        }
        break;

      case 'discovery':
        setEntries((rows) => [
          ...rows,
          { kind: 'discovery', name: event.name, skills: event.skills, url: event.url },
        ]);
        break;

      case 'merchant_task':
        setMerchantTaskId(event.taskId);
        break;

      case 'tool':
        setEntries((rows) => {
          const last = rows[rows.length - 1];
          const call = { toolUseId: event.toolUseId, name: event.name, ok: null, summary: null };
          // Fold into the strip already at the bottom, unless something has
          // been said since — a tool call after a message starts a new strip.
          if (last?.kind === 'tools' && last.speaker === event.speaker) {
            return [...rows.slice(0, -1), { ...last, calls: [...last.calls, call] }];
          }
          return [...rows, { kind: 'tools', speaker: event.speaker, calls: [call] }];
        });
        break;

      case 'tool_result':
        setEntries((rows) =>
          rows.map((row) =>
            row.kind === 'tools' && row.calls.some((c) => c.toolUseId === event.toolUseId)
              ? {
                  ...row,
                  calls: row.calls.map((c) =>
                    c.toolUseId === event.toolUseId
                      ? { ...c, ok: event.ok, summary: event.summary }
                      : c,
                  ),
                }
              : row,
          ),
        );
        break;

      case 'message':
        if (!event.text.trim()) break;
        setEntries((rows) => [
          ...rows,
          { kind: 'turn', speaker: event.speaker, text: event.text },
        ]);
        break;

      case 'artifact':
        setEntries((rows) => [
          ...rows,
          { kind: 'artifact', name: event.name, data: event.data },
        ]);
        break;

      case 'final':
        setFinalText(event.text);
        setFinalAfterError(event.afterError === true);
        setWallet(event.wallet);
        setPaid(event.paid === true);
        setOrderNumber(event.orderNumber ?? null);
        if (!event.afterError) setStatus('done');
        break;

      case 'error':
        setError(event.message);
        setEntries((rows) => [...rows, { kind: 'error', message: event.message }]);
        setStatus('failed');
        break;

      case 'end':
        // Whatever happened, nothing more is coming. A run that ended without
        // a status of its own settled quietly rather than succeeded.
        setStatus((current) => (BUSY.includes(current) ? 'done' : current));
        break;
    }
  }, []);

  const reset = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    runId.current = null;
    setStatus('idle');
    setEntries([]);
    setWallet(null);
    setFinalText('');
    setFinalAfterError(false);
    setPaid(false);
    setOrderNumber(null);
    setMerchantTaskId(null);
    setError(null);
  }, []);

  const start = useCallback(
    async (input: StartA2ARunInput) => {
      reset();
      setStatus('queued');
      try {
        const id = await a2aApi.start(input);
        runId.current = id;
        unsubscribe.current = a2aApi.subscribe(id, absorb, (message) => {
          setError(message);
          setStatus('failed');
        });
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : String(exc));
        setStatus('failed');
      }
    },
    [absorb, reset],
  );

  const cancel = useCallback(async () => {
    if (runId.current) await a2aApi.cancel(runId.current);
  }, []);

  return {
    status,
    busy: BUSY.includes(status),
    entries,
    wallet,
    finalText,
    finalAfterError,
    paid,
    orderNumber,
    merchantTaskId,
    error,
    start,
    cancel,
    reset,
  };
}
