import { useEffect, useRef } from 'react';
import { QuoteCard } from './QuoteCard';
import { toolLabel } from '../toolLabels';
import type { Entry } from '../types';

/**
 * The negotiation, read top to bottom.
 *
 * Two speakers, so the first job is telling them apart at a glance: the buyer
 * sits left in amber, the merchant right in ink. Everything else — tool strips,
 * quote slips — sits full width between them, because those belong to the
 * conversation rather than to either side of it.
 */

interface Props {
  entries: Entry[];
  busy: boolean;
  status: string;
}

function Tick({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="a2a-tool-dot a2a-tool-dot-run" aria-hidden />;
  return (
    <span
      className={`a2a-tool-dot ${ok ? 'a2a-tool-dot-ok' : 'a2a-tool-dot-bad'}`}
      aria-hidden
    />
  );
}

export function Transcript({ entries, busy, status }: Props) {
  const foot = useRef<HTMLDivElement>(null);

  // Follow the conversation as it arrives. `block: 'nearest'` so the whole page
  // does not jump when the transcript is already the thing being looked at.
  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="fk-empty">
        <div className="fk-empty-art" aria-hidden>
          🤝
        </div>
        <p className="fk-empty-title">
          {status === 'idle' ? 'No negotiation yet' : 'Waiting for the first message'}
        </p>
        <p className="fk-empty-note">
          Send the buyer out and the two agents will work the order out between
          themselves here.
        </p>
      </div>
    );
  }

  return (
    <div className="a2a-transcript">
      {entries.map((entry, index) => {
        switch (entry.kind) {
          case 'discovery':
            return (
              <div className="a2a-discovery" key={`d${index}`}>
                <span className="a2a-discovery-lead">Found</span>
                <strong>{entry.name}</strong>
                <span className="a2a-discovery-skills">{entry.skills.join(' · ')}</span>
              </div>
            );

          case 'tools':
            return (
              <ul className={`a2a-tools a2a-tools-${entry.speaker}`} key={`t${index}`}>
                {entry.calls.map((call) => (
                  <li key={call.toolUseId} className={call.ok === false ? 'a2a-tool-failed' : ''}>
                    <Tick ok={call.ok} />
                    <span className="a2a-tool-name">{toolLabel(call.name)}</span>
                    {call.ok === false && call.summary && (
                      <span className="a2a-tool-why">{call.summary}</span>
                    )}
                  </li>
                ))}
              </ul>
            );

          case 'turn':
            return (
              <div className={`a2a-turn a2a-turn-${entry.speaker}`} key={`m${index}`}>
                <span className="a2a-who">
                  {entry.speaker === 'buyer' ? 'Buying agent' : 'Ordering desk'}
                </span>
                <p className="a2a-said">{entry.text}</p>
              </div>
            );

          case 'artifact':
            return <QuoteCard key={`a${index}`} name={entry.name} data={entry.data} />;

          case 'error':
            return (
              <div className="a2a-fault" key={`e${index}`}>
                {entry.message}
              </div>
            );
        }
      })}

      {busy && (
        <div className="a2a-thinking">
          <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden />
          negotiating
        </div>
      )}

      <div ref={foot} />
    </div>
  );
}
