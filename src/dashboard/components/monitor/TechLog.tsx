/**
 * The technical view: what was called, what came back, and how long it took.
 *
 * The event log next door is the *narrative* — one row per thing that happened,
 * in order, in words. This is the pathological case that narrative cannot serve:
 * a call that succeeded and still returned the wrong thing. For that you need the
 * call and its answer on the same row, the payload both ways, and the round trip
 * in milliseconds — none of which a chronological log gives you, because the
 * answer is forty rows below the question.
 *
 * Pairing is done in `ops.ts` against the real events; a call with no answer
 * shows as still out rather than as instant, and an answer whose call has fallen
 * off the ring keeps its payload and reports no duration. Neither is rounded to
 * something tidier.
 *
 * Both payloads are collapsed by default. A page of pretty-printed JSON per row
 * is how a technical view becomes the tab nobody opens.
 */

import { useState } from 'react';
import { ACTORS, stamp } from '../../monitor';
import { millis, type ApiCall } from '../../ops';

interface Props {
  calls: ApiCall[];
  narrowed: boolean;
  onOpenTask: (correlationId: string) => void;
}

/** Pretty-print stored JSON, falling back to the raw string it actually is. */
function pretty(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

/**
 * How slow is slow, in ms.
 *
 * Not a threshold anybody configured — it is the point past which a call is
 * worth a second look on a floor whose agents are mostly waiting on one HTTP
 * hop. Marked rather than coloured red: a two-second tool call is interesting,
 * not broken, and the red on this page means failed.
 */
const SLOW_MS = 2_000;

function Row({ call, onOpenTask }: { call: ApiCall; onOpenTask: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const request = pretty(call.request ? JSON.stringify(call.request) : undefined);
  const response = pretty(call.response);
  const has = Boolean(request || response);
  const pending = call.resultEvent === null;
  const slow = (call.durationMs ?? 0) >= SLOW_MS;

  return (
    <li
      className={[
        'fko-call',
        call.ok === false ? 'fko-call-bad' : '',
        pending ? 'fko-call-open' : '',
        open ? 'fko-call-expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="fko-call-head">
        <button
          type="button"
          className="fko-call-hit"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={has ? open : undefined}
          disabled={!has}
        >
          <span className="fko-call-time">{stamp(call.at)}</span>

          <span className="fko-call-actor">
            <span aria-hidden>{ACTORS[call.actor].glyph}</span>
            {ACTORS[call.actor].short}
          </span>

          <span className="fko-call-fn">
            {call.tool}
            <span className="fko-call-fn-paren" aria-hidden>
              ()
            </span>
          </span>

          <span className="fko-call-target">
            {call.target ? (
              <>
                <span className="fko-call-arrow" aria-hidden>
                  →
                </span>
                <span aria-hidden>{ACTORS[call.target].glyph}</span>
                {ACTORS[call.target].name}
              </>
            ) : (
              <span className="fko-call-target-none">no external call</span>
            )}
          </span>

          <span
            className={[
              'fko-call-verdict',
              call.ok === true ? 'fko-call-ok' : '',
              call.ok === false ? 'fko-call-fail' : '',
              pending ? 'fko-call-wait' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {pending ? '◷ out' : call.ok === false ? '✕ failed' : '✓ ok'}
          </span>

          <span className={`fko-call-ms${slow ? ' fko-call-slow' : ''}`}>
            {pending ? '—' : millis(call.durationMs)}
          </span>

          {has && (
            <span className="fko-call-caret" aria-hidden>
              {open ? '−' : '+'}
            </span>
          )}
        </button>

        <button
          type="button"
          className="fko-call-ref"
          onClick={() => onOpenTask(call.correlationId)}
          title="Open the task this call belongs to"
        >
          {call.ref}
        </button>
      </div>

      <p className="fko-call-summary">
        <span className="fko-call-summary-out">{call.title}</span>
        {call.answer && (
          <>
            <span className="fko-call-summary-arrow" aria-hidden>
              ↩
            </span>
            <span className="fko-call-summary-back">{call.answer}</span>
          </>
        )}
      </p>

      {open && has && (
        <div className="fko-call-body">
          {request && (
            <section className="fko-payload">
              <h5 className="fko-payload-head">
                Request
                <span className="fko-payload-note">what the agent sent</span>
              </h5>
              <pre className="fko-payload-json">{request}</pre>
            </section>
          )}
          {response && (
            <section className="fko-payload">
              <h5 className="fko-payload-head">
                Response
                <span className="fko-payload-note">
                  {call.ok === false ? 'the failure, as returned' : 'what came back'}
                </span>
              </h5>
              <pre className="fko-payload-json">{response}</pre>
            </section>
          )}
          <p className="fko-call-meta">
            <span>
              <span className="fko-call-meta-key">executed</span>
              {millis(call.durationMs)}
            </span>
            <span>
              <span className="fko-call-meta-key">started</span>
              {stamp(call.at)}
            </span>
            <span>
              <span className="fko-call-meta-key">answered</span>
              {call.endedAt === null ? 'not yet' : stamp(call.endedAt)}
            </span>
            <span>
              <span className="fko-call-meta-key">channel</span>
              {call.channel}
            </span>
          </p>
        </div>
      )}
    </li>
  );
}

export function TechLog({ calls, narrowed, onOpenTask }: Props) {
  if (calls.length === 0) {
    return (
      <div className="fkm-empty">
        <span className="fkm-empty-glyph" aria-hidden>
          {narrowed ? '🔍' : '⌘'}
        </span>
        <p className="fkm-empty-title">
          {narrowed ? 'No call matches' : 'No tool or API call recorded yet'}
        </p>
        <p className="fkm-empty-body">
          {narrowed
            ? 'No call in this range fits the current filters. Widen one of them.'
            : 'Every tool an agent invokes and every service it reaches lands here, paired with what came back and how long it took.'}
        </p>
      </div>
    );
  }

  const failed = calls.filter((call) => call.ok === false).length;
  const out = calls.filter((call) => call.resultEvent === null).length;

  return (
    <div className="fko-calls">
      <p className="fko-calls-lead">
        <strong>{calls.length}</strong> {calls.length === 1 ? 'call' : 'calls'}
        {failed > 0 && <span className="fko-calls-bad">{failed} failed</span>}
        {out > 0 && <span className="fko-calls-out">{out} still out</span>}
      </p>

      <ol className="fko-call-list">
        {calls.map((call) => (
          <Row key={call.id} call={call} onOpenTask={onOpenTask} />
        ))}
      </ol>
    </div>
  );
}
