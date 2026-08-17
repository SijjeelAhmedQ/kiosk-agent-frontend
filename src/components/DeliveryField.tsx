import { useState } from 'react';
import { Button, Input, InputNumber, Switch, Tooltip } from 'antd';
import { Crosshair, Home, Keyboard, Scooter, Storefront } from '@/icons';
import type { DeliveryHealth, UserLocation } from '@/types';
import type { LocationStatus } from '@/hooks/useUserLocation';

interface Props {
  location: UserLocation | null;
  status: LocationStatus;
  problem: string | null;
  delivery: DeliveryHealth | undefined;
  /**
   * The customer's own address, as the agent server holds it — or null when it
   * is not running or is too old to report one.
   */
  saved: UserLocation | null;
  busy: boolean;
  onDetect: () => void;
  onManual: (latitude: number, longitude: number, label?: string) => void;
  onLabel: (label: string) => void;
  onClear: () => void;
}

/** The fix, written the way the trace and the courier will both write it. */
function coordinates(location: UserLocation): string {
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

/**
 * Where the order is going.
 *
 * Off by default, and that is the important part: an errand with this switch
 * untouched is exactly the counter order this form has always sent. Turning it
 * on is what adds a delivery to the run — so the control that changes the shape
 * of the errand is a deliberate act rather than a default nobody chose.
 *
 * The manual coordinate boxes are not a fallback bolted on for completeness.
 * A browser that refuses to share a location is the common case on a desk
 * machine, and an operator who cannot type an address instead simply cannot
 * send a delivery at all.
 *
 * Turning the switch on fills in the saved address rather than asking the
 * device, when the server has one. That ordering is deliberate: "my own place"
 * is where nearly every delivery goes, it needs no permission prompt, and it is
 * a street the rider can read instead of five decimal places. The device is
 * still one button away for the errand that is going somewhere else.
 *
 * ── On the shape of it ──────────────────────────────────────────────────────
 *
 * Three questions, in the order they are asked, each with its own band: *where*
 * is it going (the drop card), *how do we know* (three source pills), and *what
 * should the rider be told* (the note). The three used to be one undifferentiated
 * run of fields with four buttons wrapping at the bottom, and the operator had
 * to read all of it to find out which one applied.
 *
 * The pills are the change worth knowing about. The buttons they replace
 * appeared and disappeared — "Use my saved address" was hidden the moment it was
 * in use, "Type it instead" the moment you were — so the set of choices moved
 * about under the cursor and never showed which one you were on. The same three
 * handlers now sit in a fixed row that marks the live one instead. Nothing new
 * can be reached from here; what changed is that all of it can be seen at once.
 */
export function DeliveryField({
  location,
  status,
  problem,
  delivery,
  saved,
  busy,
  onDetect,
  onManual,
  onLabel,
  onClear,
}: Props) {
  const [wanted, setWanted] = useState(false);
  const [manualLat, setManualLat] = useState<number | null>(null);
  const [manualLon, setManualLon] = useState<number | null>(null);

  // Opened as soon as the device has refused: at that point typing it in is
  // the only way forward, and making the operator find a second control first
  // is a step that exists only because the UI was written optimistically.
  const refused = status === 'denied' || status === 'unavailable' || status === 'failed';
  const [typing, setTyping] = useState(false);
  const showManual = typing || (refused && !location);

  const useSaved = () => {
    if (saved) onManual(saved.latitude, saved.longitude, saved.label ?? undefined);
    setTyping(false);
  };

  const toggle = (on: boolean) => {
    setWanted(on);
    if (on) {
      // Somewhere straight away. The switch *is* the request — a second click to
      // make it do the thing it says it does is a click for nothing. The saved
      // address first, and the device only when there is nothing saved, because
      // a permission prompt is the more disruptive of the two.
      if (!location) {
        if (saved) useSaved();
        else onDetect();
      }
    } else {
      onClear();
      setTyping(false);
    }
  };

  /** Is the fix on screen the saved address, rather than something else? */
  const onSaved =
    location !== null &&
    saved !== null &&
    location.latitude === saved.latitude &&
    location.longitude === saved.longitude;

  const useTyped = () => {
    if (manualLat === null || manualLon === null) return;
    onManual(manualLat, manualLon);
    setTyping(false);
  };

  const service = delivery?.displayName ?? 'the delivery service';

  const named = (location?.label ?? '').trim();

  // The one line under the eyebrow, which is all there is to read when the block
  // is shut. Off, it says the errand is unchanged; on, it says who carries it —
  // the address itself is on the drop card below and does not need saying twice.
  const headline = !wanted
    ? 'Off — the agent orders at the counter, as it always has.'
    : location
      ? `${service} collects it from the branch nearest the drop.`
      : status === 'asking'
        ? 'Finding out where you are…'
        : 'Nowhere to send it yet — pick a drop below.';

  /** Which of the three sources the fix on screen came by, or null for none. */
  const source: 'saved' | 'device' | 'typed' | null = !location
    ? null
    : onSaved
      ? 'saved'
      : location.source === 'browser'
        ? 'device'
        : 'typed';

  return (
    <section className={`fk-where${wanted ? ' fk-where-on' : ''}`}>
      <div className="fk-where-head">
        {/* Storefront while it is a counter order, a courier once it is not —
            the glyph says which of the two errands this is before the words do. */}
        <span className="fk-where-glyph" aria-hidden>
          {wanted ? <Scooter /> : <Storefront />}
        </span>

        <div className="fk-where-said">
          <div className="fk-eyebrow">Where it goes</div>
          <p className="fk-where-line">{headline}</p>
        </div>

        <Tooltip
          title={wanted ? 'Turn off to send a counter order' : 'Deliver this order to the customer'}
        >
          <Switch
            checked={wanted}
            onChange={toggle}
            disabled={busy}
            aria-label="Deliver this order to the customer"
          />
        </Tooltip>
      </div>

      {wanted && (
        <div className="fk-where-body">
          {/* The drop, on its own card. This is the one line on the form that,
              wrong, sends food to a stranger, so it is the largest thing in the
              block and it is never further than the first glance. */}
          {location ? (
            <div className="fk-where-drop">
              <span className="fk-where-pin" aria-hidden>
                <Home />
              </span>
              <div className="fk-where-drop-main">
                <div className={`fk-where-drop-name${named ? '' : ' fk-where-drop-unnamed'}`}>
                  {named || 'This spot, unnamed'}
                </div>
                <div className="fk-where-drop-fix">
                  <span>{coordinates(location)}</span>
                  {typeof location.accuracyMeters === 'number' && (
                    <span className="fk-where-drop-acc">
                      ±{Math.round(location.accuracyMeters)} m
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="fk-where-empty">
              {status === 'asking' ? (
                <>
                  <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden />
                  Asking the browser for a location…
                </>
              ) : (
                'No drop yet. Choose one of the three below — the errand cannot be delivered without it.'
              )}
            </p>
          )}

          {/* The three ways of naming a drop, all of them always on screen and
              the live one marked. Same three handlers as before; what is new is
              that the operator can see which is in play without deducing it from
              which buttons happen to be missing. */}
          <div className="fk-where-sources" role="group" aria-label="How to set the drop">
            <button
              type="button"
              className="fk-source"
              aria-pressed={source === 'saved'}
              disabled={busy || !saved}
              onClick={useSaved}
              title={
                saved
                  ? (saved.label ?? coordinates(saved))
                  : 'The agent server has no address on file for this customer.'
              }
            >
              <span className="fk-source-glyph" aria-hidden>
                <Home />
              </span>
              <span className="fk-source-label">Saved address</span>
            </button>

            <button
              type="button"
              className="fk-source"
              aria-pressed={source === 'device'}
              disabled={busy || status === 'asking'}
              onClick={onDetect}
              title="Ask this browser where it is"
            >
              <span className="fk-source-glyph" aria-hidden>
                <Crosshair />
              </span>
              <span className="fk-source-label">
                {status === 'asking' ? 'Asking…' : 'This device'}
              </span>
            </button>

            {/* Pressed while the boxes are open *and* while the drop on screen
                came out of them: the row marks where the fix came from, and a
                typed one does not stop being typed when the boxes close. */}
            <button
              type="button"
              className="fk-source"
              aria-pressed={showManual || source === 'typed'}
              disabled={busy}
              onClick={() => setTyping(true)}
              title="Type the coordinates by hand"
            >
              <span className="fk-source-glyph" aria-hidden>
                <Keyboard />
              </span>
              <span className="fk-source-label">Type it in</span>
            </button>
          </div>

          {showManual && (
            <div className="fk-where-typed">
              <div className="fk-fields">
                <div className="fk-field">
                  <label className="fk-label" htmlFor="fk-lat">
                    Latitude
                  </label>
                  <InputNumber
                    id="fk-lat"
                    disabled={busy}
                    value={manualLat}
                    onChange={setManualLat}
                    min={-90}
                    max={90}
                    step={0.0001}
                    style={{ width: '100%' }}
                    placeholder="33.5875"
                  />
                </div>
                <div className="fk-field">
                  <label className="fk-label" htmlFor="fk-lon">
                    Longitude
                  </label>
                  <InputNumber
                    id="fk-lon"
                    disabled={busy}
                    value={manualLon}
                    onChange={setManualLon}
                    min={-180}
                    max={180}
                    step={0.0001}
                    style={{ width: '100%' }}
                    placeholder="72.9950"
                  />
                </div>
              </div>

              <Button
                size="small"
                type="primary"
                ghost
                block
                disabled={busy || manualLat === null || manualLon === null}
                onClick={useTyped}
              >
                Use these coordinates
              </Button>
            </div>
          )}

          {location && (
            <div className="fk-field">
              <label className="fk-label" htmlFor="fk-place">
                What to call this place
              </label>
              <Input
                id="fk-place"
                // Keyed to the fix rather than to nothing: the box is
                // uncontrolled, so without this a name typed for one drop stayed
                // on screen after the drop was replaced — and the form then read
                // as a place the errand was no longer going to. Only the
                // coordinates are in the key, so typing a name does not remount
                // the field under the cursor.
                key={`${location.source ?? 'x'}:${location.latitude}:${location.longitude}`}
                disabled={busy}
                defaultValue={location.label ?? ''}
                onBlur={(event) => onLabel(event.target.value)}
                maxLength={200}
                placeholder="Flat 3, second floor — optional"
              />
              {/* The rider reads this, not the coordinates. Worth saying,
                  because a lat/long that is already correct makes the field
                  look like decoration. */}
              <p className="fk-hint fk-hint-1">Goes to the rider as the delivery note.</p>
            </div>
          )}

          {problem && <p className="fk-where-warn">{problem}</p>}

          {/* Who would actually carry it, said here rather than only in the
              status strip up the page: this is the moment the operator decides
              to rely on a courier, so a courier that cannot be reached belongs
              in front of them now. */}
          {delivery && (
            <div
              className={`fk-where-courier${delivery.configured ? '' : ' fk-where-courier-out'}`}
            >
              <span className="fk-where-courier-glyph" aria-hidden>
                <Scooter />
              </span>
              <div className="fk-where-courier-said">
                <div className="fk-where-courier-name">{delivery.displayName}</div>
                <div className="fk-where-courier-note">
                  {delivery.configured
                    ? 'Ready — the order is handed over as soon as it is paid for.'
                    : (delivery.problem ??
                      `${delivery.displayName} is not configured — the order would be placed but not delivered.`)}
                </div>
              </div>
              <span
                className={`fk-dot ${delivery.configured ? 'fk-dot-ok' : 'fk-dot-bad'}`}
                aria-hidden
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
