import { useEffect, useRef, useState, type RefObject } from 'react';
import { Panel } from '@/components/Panel';
import type { AgentRunStatus, AgentToolCall } from '@/types';
import { toolLabel } from '@/toolLabels';
import { rawDetail, toolStory, type Thing } from '@/toolStory';

interface Props {
  toolCalls: AgentToolCall[];
  busy: boolean;
  status: AgentRunStatus | 'idle';
  browserOpen: boolean;
}

/** mm:ss — long enough for any errand, short enough to read at a glance. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${`${s}`.padStart(2, '0')}`;
}

/**
 * How long this run has been going, ticking while it does.
 *
 * Display only — nothing about the run depends on it. It exists because a
 * browser-mode errand can take a minute, and a page with no clock on it makes
 * thirty seconds feel like failure.
 */
function useElapsed(busy: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  return seconds;
}

/**
 * Keeps the newest step in the trace's own scroll box.
 *
 * The list scrolls, not the page — a fifteen-step errand should not push the
 * report below the fold — so nothing brings a new step into view on its own.
 * Aligning its top rather than jumping to the bottom keeps the title readable
 * when a step's summary is taller than the box.
 */
function useFollowNewest(count: number) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || count === 0) return;

    const list = box.querySelector<HTMLElement>('.fk-trace');
    const newest = list?.lastElementChild as HTMLElement | null;
    if (!list || !newest) return;

    // offsetTop, not a rect: a step enters under a slide-in transform, and a
    // rect measured mid-animation would aim 20px past where the step lands.
    box.scrollTo({
      // Clamped by the browser, so a short last step still settles at the end.
      top: list.offsetTop + newest.offsetTop - 8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [count]);

  return boxRef;
}

/**
 * Whether the trace has steps hidden above or below its scroll box.
 *
 * The fades that mark a cut-off step have to be conditional. Painted always,
 * the top one would sit over the first step of a run that fits — which reads as
 * a smudge on the card rather than as "there is more up there".
 */
function useCutOff(boxRef: RefObject<HTMLDivElement | null>, count: number) {
  const [cut, setCut] = useState({ above: false, below: false });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const read = () => {
      const { scrollTop, scrollHeight, clientHeight } = box;
      setCut({
        // A pixel of slack: sub-pixel scroll positions would otherwise leave a
        // fade lit at a hard end of the list.
        above: scrollTop > 2,
        below: scrollTop + clientHeight < scrollHeight - 2,
      });
    };

    read();
    box.addEventListener('scroll', read, { passive: true });

    // The box's height and the list's are both in play: the panel resizes with
    // the column, and a summary streaming in grows the list under a still box.
    const sizes = new ResizeObserver(read);
    sizes.observe(box);
    const list = box.querySelector('.fk-trace');
    if (list) sizes.observe(list);

    return () => {
      box.removeEventListener('scroll', read);
      sizes.disconnect();
    };
  }, [boxRef, count]);

  return cut;
}

/** A dot per step: running, succeeded, or refused. */
function Dot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="fk-step-dot fk-step-dot-run">•</span>;
  return (
    <span className={`fk-step-dot ${ok ? 'fk-step-dot-ok' : 'fk-step-dot-bad'}`}>
      {ok ? '✓' : '!'}
    </span>
  );
}

/** How many named things a step shows before it asks to be opened. */
const THINGS_SHOWN = 3;

/**
 * The named things a step involved — products found, lines ordered.
 *
 * Capped, because a browse of the menu returns dozens and the trace is skimmed:
 * three is enough to recognise that the agent found the right burger. The rest
 * are one click away, and `beyond` covers what the agent saw but the server
 * never sent — that count can only be reported, not revealed.
 */
function Things({ things, beyond }: { things: Thing[]; beyond: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? things : things.slice(0, THINGS_SHOWN);
  const foldedAway = things.length - shown.length;

  return (
    <ul className="fk-things">
      {shown.map((thing, index) => (
        <li className="fk-thing" key={`${thing.name}-${index}`}>
          <span className="fk-thing-name">
            {thing.name}
            {thing.note && <em>{thing.note}</em>}
          </span>
          {thing.value && <span className="fk-thing-value">{thing.value}</span>}
        </li>
      ))}

      {foldedAway > 0 ? (
        <li>
          <button type="button" className="fk-things-more" onClick={() => setAll(true)}>
            and {foldedAway + beyond} more
          </button>
        </li>
      ) : (
        beyond > 0 && <li className="fk-thing fk-thing-rest">and {beyond} more besides</li>
      )}
    </ul>
  );
}

/**
 * One step: what the agent did, and what came back — in words.
 *
 * The result is a sentence first and figures second, because the question being
 * asked of this panel is "did the right thing happen", not "what did the API
 * return". The raw result is kept, folded away, for when it is the API that is
 * in question.
 */
function Step({ call }: { call: AgentToolCall }) {
  const meta = toolLabel(call.name);
  const story = toolStory(call);
  const raw = call.ok === true ? rawDetail(call.detail) : null;

  return (
    <li className="fk-step">
      <Dot ok={call.ok} />

      <div className="fk-step-body">
        <div className="fk-step-title">
          <span aria-hidden>{meta.icon}</span>
          <span>{meta.label}</span>
          {meta.spends && <span className="fk-badge">spends money</span>}
        </div>

        {/* No story yet: the call is still out. */}
        {story === null ? (
          <div className="fk-step-wait">
            <span className="fk-working">
              working
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : (
          <>
            {/* A refusal is boxed rather than merely coloured: the wallet turning
                down an over-budget payment is a normal part of a run, and it has
                to be findable in a stack of a dozen green steps. */}
            {call.ok === false ? (
              <p className="fk-step-refusal">{story.headline}</p>
            ) : (
              <p className="fk-said">{story.headline}</p>
            )}

            {story.note && <p className="fk-step-note">{story.note}</p>}

            {story.facts.length > 0 && (
              <div className="fk-facts">
                {story.facts.map((item) => (
                  <span
                    className={`fk-fact${item.tone ? ` fk-fact-${item.tone}` : ''}`}
                    key={item.label}
                  >
                    <span className="fk-fact-label">{item.label}</span>
                    <span className="fk-fact-value">{item.value}</span>
                  </span>
                ))}
              </div>
            )}

            {story.things.length > 0 && <Things things={story.things} beyond={story.more} />}

            {raw && (
              <details className="fk-raw">
                <summary>raw result</summary>
                <pre>{raw}</pre>
              </details>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * What the agent did, step by step.
 *
 * A refused step is not a crash — the wallet turning down an over-budget
 * payment shows up here in red and the agent is expected to carry on. So
 * failures are rendered as part of the story rather than as an error state.
 */
export function RunTrace({ toolCalls, busy, status, browserOpen }: Props) {
  const elapsed = useElapsed(busy);
  const done = toolCalls.filter((call) => call.ok !== null).length;
  const scrollBox = useFollowNewest(toolCalls.length);
  const cut = useCutOff(scrollBox, toolCalls.length);

  // The count carries a track beside it. The steps themselves are the honest
  // measure of progress — but they scroll, and this line does not, so it is the
  // one place a folded or half-scrolled trace can still say how far along it is.
  const note =
    toolCalls.length === 0 ? (
      'Every step, as it happens'
    ) : (
      <span className="fk-progress">
        <span>
          {done} of {toolCalls.length} step{toolCalls.length === 1 ? '' : 's'} finished
        </span>
        <span className="fk-progress-track" aria-hidden>
          <span
            className="fk-progress-fill"
            style={{ width: `${Math.round((done / toolCalls.length) * 100)}%` }}
          />
        </span>
      </span>
    );

  return (
    <Panel
      icon="🧭"
      title="What the agent did"
      note={note}
      live={busy}
      collapsible
      // The trace takes the smaller share of the column — it is a log, skimmed
      // rather than read — and the list inside it, not the panel body, scrolls.
      fill="flex"
      className="fk-panel-trace"
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {browserOpen && (
            <span className="fk-badge">
              <span aria-hidden>🖥️</span> Browser open
            </span>
          )}
          {(busy || elapsed > 0) && status !== 'idle' && (
            <span className="fk-pill fk-pill-mono">{clock(elapsed)}</span>
          )}
        </div>
      }
    >
      {toolCalls.length === 0 ? (
        <div className="fk-empty">
          <span className="fk-empty-art" aria-hidden>
            {busy ? '🤔' : '🛒'}
          </span>
          <p className="fk-empty-title">
            {busy ? 'Thinking about where to start…' : 'Nothing yet'}
          </p>
          <p className="fk-empty-note">
            {busy
              ? 'The first step will appear here the moment the agent takes it.'
              : 'Write an errand and send the agent — its steps land here as it takes them.'}
          </p>
        </div>
      ) : (
        <div
          className={`fk-trace-scroll${cut.above ? ' fk-cut-above' : ''}${
            cut.below ? ' fk-cut-below' : ''
          }`}
          ref={scrollBox}
        >
          <ol className="fk-trace">
            {toolCalls.map((call) => (
              <Step call={call} key={call.toolUseId} />
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}
