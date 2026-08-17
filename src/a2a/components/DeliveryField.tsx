import { useState } from 'react';
import { Button, Input, InputNumber, Switch, Tooltip } from 'antd';
import { Crosshair, Home, Keyboard, Scooter, Storefront } from '@/icons';
import type { LocationStatus } from '@/hooks/useUserLocation';
import type { DeliveryHealth, UserLocation } from '../types';

/**
 * Where the negotiated order goes.
 *
 * The console used to answer this in a footnote: *two agents, no customer on the
 * line — a delivery from here always goes to the saved address*. True, and a
 * dead end. The order this flow buys is real food that a rider takes to a real
 * door, and "which door" was the one thing about it the operator could not say.
 *
 * So this is the errand console's own "Where it goes", on the form where the
 * errand is written, with the same three questions in the same order: *where* is
 * it going (the drop card), *how do we know* (the sources), and *what should the
 * rider be told* (the note). An operator who has used one console should
 * recognise this one on sight.
 *
 * ── What is different here, and why ─────────────────────────────────────────
 *
 * **Off is not "no delivery".** On the errand console the switch is the whole
 * difference between a counter order and a delivery. Here it is not: a paid
 * take-away order has been handed to the courier since `agent/a2a/delivery.py`
 * was written, and it goes to the customer's saved address when nobody says
 * otherwise. So the head says that in the off state rather than claiming the
 * order stops at the counter — the switch names *another* drop, it does not
 * invent the delivery.
 *
 * **The switch cannot be left on with nowhere to go.** `wanted` is held by the
 * form rather than in here, so the send button can refuse an errand whose
 * delivery was asked for and never named. The errand console's own version
 * keeps that state to itself and quietly sends a counter order instead, which is
 * the failure this arrangement exists to rule out.
 *
 * **The sources are one segmented row, not three cards.** This form sits in a
 * 345–400px column and never scrolls, so the 62px pills of the errand console
 * would cost the coupon picker its place on screen. Same three handlers, same
 * `aria-pressed` marking of the live one, a third of the height — and the line
 * underneath says what the marked one actually is, which the taller pills never
 * did.
 *
 * **Coordinates can be pasted.** Nobody types "33.5875, 72.9950" in two boxes;
 * they copy it out of a map in one piece. The pair box takes it as it comes and
 * fills the two fields, which are still there for the fix that has to be edited.
 */

interface Props {
  /** Is a delivery to a named drop being asked for? Held by the form. */
  wanted: boolean;
  onWanted: (on: boolean) => void;
  location: UserLocation | null;
  status: LocationStatus;
  problem: string | null;
  /** The courier, from the delivery agent's own health. Null when it is down. */
  courier: DeliveryHealth | null;
  /** The address the service holds on file — the drop when none is named. */
  saved: UserLocation | null;
  busy: boolean;
  onDetect: () => void;
  onManual: (latitude: number, longitude: number, label?: string) => void;
  onLabel: (label: string) => void;
  onClear: () => void;
}

/** The fix, written the way the courier and the trace will both write it. */
function coordinates(location: UserLocation): string {
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

/**
 * A pasted pair of coordinates, or null when that is not what it is.
 *
 * Deliberately forgiving about everything except the numbers: a map hands over
 * `33.5875, 72.9950`, a URL hands over `33.5875,72.9950`, and somebody typing it
 * puts a space where they feel like one. What it will not do is guess — two
 * numbers in range or nothing, because a half-read pair is a delivery to a
 * latitude with somebody else's longitude.
 */
function readPair(text: string): [number, number] | null {
  const found = text.match(/-?\d+(?:\.\d+)?/g);
  if (!found || found.length < 2) return null;
  const [latitude, longitude] = found.slice(0, 2).map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [latitude, longitude];
}

export function DeliveryField({
  wanted,
  onWanted,
  location,
  status,
  problem,
  courier,
  saved,
  busy,
  onDetect,
  onManual,
  onLabel,
  onClear,
}: Props) {
  const [pair, setPair] = useState('');
  const [manualLat, setManualLat] = useState<number | null>(null);
  const [manualLon, setManualLon] = useState<number | null>(null);

  // Opened as soon as the device has refused: at that point typing it in is the
  // only way forward, and making the operator find a second control first is a
  // step that exists only because the UI was written optimistically.
  const refused = status === 'denied' || status === 'unavailable' || status === 'failed';
  const [typing, setTyping] = useState(false);
  const showTyped = typing || (refused && !location);

  const useSaved = () => {
    if (saved) onManual(saved.latitude, saved.longitude, saved.label ?? undefined);
    setTyping(false);
  };

  const toggle = (on: boolean) => {
    onWanted(on);
    if (on) {
      // Somewhere straight away. The switch *is* the request — a second click to
      // make it do what it says it does is a click for nothing. The saved
      // address first and the device only when there is nothing saved, because a
      // permission prompt is the more disruptive of the two.
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

  /** Which of the three sources the fix on screen came by, or null for none. */
  const source: 'saved' | 'device' | 'typed' | null = !location
    ? null
    : onSaved
      ? 'saved'
      : location.source === 'browser'
        ? 'device'
        : 'typed';

  const useTyped = (latitude = manualLat, longitude = manualLon) => {
    if (latitude === null || longitude === null) return;
    onManual(latitude, longitude);
    setTyping(false);
  };

  // Typing over the pair box fills the two fields under it rather than replacing
  // them: the paste is the fast path, and the fields are where a fix gets
  // corrected. Enter commits, which is what a pasted line wants.
  const takePair = (text: string) => {
    setPair(text);
    const read = readPair(text);
    if (read) {
      setManualLat(read[0]);
      setManualLon(read[1]);
    }
  };

  const service = courier?.service ?? 'the delivery service';
  const named = (location?.label ?? '').trim();

  /** Whether what has been pasted is a pair yet, said in the box's own words. */
  const badPair = pair.trim().length > 0 && readPair(pair) === null;
  const pairHint = badPair
    ? 'Two numbers, latitude first — nothing else was found in that.'
    : 'Straight out of a map. Latitude first; the boxes below follow.';

  // The one line under the eyebrow, which is all there is to read when the block
  // is shut. Off, it says the order still goes somewhere — this service delivers
  // a paid take-away order whether or not anybody names a drop, and a switch
  // that read "no delivery" in that state would be a lie. On, it says who
  // carries it: the drop itself is on the card below and is not said twice.
  //
  // The saved address is on the line's `title` rather than in it. Written out it
  // is a street, a landmark and a city — three lines in a 340px column, in the
  // one card on this page that cannot scroll.
  const headline = !wanted
    ? 'Off — a paid order goes to the address on file.'
    : location
      ? `${service} collects it from the branch nearest the drop.`
      : status === 'asking'
        ? 'Finding out where you are…'
        : 'Nowhere to send it yet — pick a drop below.';

  const headlineTitle =
    !wanted && saved ? (saved.label ?? coordinates(saved)) : undefined;

  // What the marked source actually is. The segmented row shows which of the
  // three is live; this says what that means, which is the half the errand
  // console's taller pills never managed to fit.
  const sourceNote =
    status === 'asking'
      ? 'Asking the browser for a location…'
      : source === 'saved'
        ? 'The address the service holds on file for this customer.'
        : source === 'device'
          ? typeof location?.accuracyMeters === 'number'
            ? `This browser’s own fix, to about ${Math.round(location.accuracyMeters)} m.`
            : 'This browser’s own fix.'
          : source === 'typed'
            ? 'Coordinates given by hand — nothing checked them but the range.'
            : 'Pick one. A delivery cannot be sent without somewhere to send it.';

  return (
    <section className={`fk-where a2a-where${wanted ? ' fk-where-on' : ''}`}>
      <div className="fk-where-head">
        {/* Storefront while the drop is the default one, a courier once it has
            been chosen — the glyph says which of the two this is before the
            words do. */}
        <span className="fk-where-glyph" aria-hidden>
          {wanted ? <Scooter /> : <Storefront />}
        </span>

        <div className="fk-where-said">
          <div className="fk-eyebrow">Where it goes</div>
          <p className="fk-where-line" title={headlineTitle}>
            {headline}
          </p>
        </div>

        <Tooltip
          title={
            wanted
              ? 'Turn off to deliver to the saved address'
              : 'Send this order somewhere other than the saved address'
          }
        >
          <Switch
            checked={wanted}
            onChange={toggle}
            disabled={busy}
            aria-label="Choose where this order is delivered"
          />
        </Tooltip>
      </div>

      {wanted && (
        <div className="fk-where-body">
          {/* The drop, on its own card. This is the one line on this form that,
              wrong, sends food to a stranger, so it is the largest thing in the
              block and it is never further than the first glance. */}
          {location ? (
            <div className="fk-where-drop">
              <span className="fk-where-pin" aria-hidden>
                <Home />
              </span>
              <div className="fk-where-drop-main">
                {/* Clipped to one line by the shared rule, so the whole of it is
                    on the title: a saved address is a street, a landmark and a
                    city, and the half that fits is not the half that identifies
                    it. */}
                <div
                  className={`fk-where-drop-name${named ? '' : ' fk-where-drop-unnamed'}`}
                  title={named || undefined}
                >
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
              {/* Where it came from, on the card itself. The row below marks the
                  same thing, but the card is what gets read — and "is this the
                  saved address or something I typed" is the question somebody
                  asks about the address, not about the row of buttons. */}
              <span className="fk-badge a2a-where-from">
                {source === 'saved' ? 'on file' : source === 'device' ? 'device' : 'by hand'}
              </span>
            </div>
          ) : (
            <p className="fk-where-empty">
              {status === 'asking' ? (
                <>
                  <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden />
                  Asking the browser for a location…
                </>
              ) : (
                'No drop yet. Choose one of the three below, or switch this off to use the saved address.'
              )}
            </p>
          )}

          {/* One row, three segments, the live one marked — and all three always
              on screen. Buttons that come and go with the state move the set of
              choices under the cursor and never show which one you are on. */}
          <div className="a2a-where-sources" role="group" aria-label="How to set the drop">
            <button
              type="button"
              className="a2a-source"
              aria-pressed={source === 'saved'}
              disabled={busy || !saved}
              onClick={useSaved}
              title={
                saved
                  ? (saved.label ?? coordinates(saved))
                  : 'The A2A service has no address on file for this customer.'
              }
            >
              <span className="a2a-source-glyph" aria-hidden>
                <Home />
              </span>
              <span className="a2a-source-label">On file</span>
            </button>

            <button
              type="button"
              className="a2a-source"
              aria-pressed={source === 'device'}
              disabled={busy || status === 'asking'}
              onClick={onDetect}
              title="Ask this browser where it is"
            >
              <span className="a2a-source-glyph" aria-hidden>
                <Crosshair />
              </span>
              <span className="a2a-source-label">
                {status === 'asking' ? 'Asking…' : 'This device'}
              </span>
            </button>

            {/* Pressed while the boxes are open *and* while the drop on screen
                came out of them: the row marks where the fix came from, and a
                typed one does not stop being typed when the boxes close. */}
            <button
              type="button"
              className="a2a-source"
              aria-pressed={showTyped || source === 'typed'}
              disabled={busy}
              onClick={() => setTyping(true)}
              title="Paste or type the coordinates"
            >
              <span className="a2a-source-glyph" aria-hidden>
                <Keyboard />
              </span>
              <span className="a2a-source-label">By hand</span>
            </button>
          </div>

          <p className="a2a-where-source-note">{sourceNote}</p>

          {showTyped && (
            <div className="fk-where-typed">
              {/* The fast path, first: a coordinate pair arrives from a map as
                  one string, and splitting it by hand into two boxes is work the
                  form can do. */}
              <div className="fk-field">
                <label className="fk-label" htmlFor="a2a-pair">
                  Paste a coordinate pair
                </label>
                <Input
                  id="a2a-pair"
                  disabled={busy}
                  value={pair}
                  onChange={(event) => takePair(event.target.value)}
                  onPressEnter={() => useTyped()}
                  placeholder="33.5875, 72.9950"
                  status={badPair ? 'warning' : undefined}
                />
                {/* One line, with the whole sentence on hover: `fk-hint-1`
                    clips rather than wraps, and a hint that pushed the boxes
                    down a row every time a paste went wrong would move the
                    field under the cursor. */}
                <p className="fk-hint fk-hint-1" title={pairHint}>
                  {pairHint}
                </p>
              </div>

              <div className="fk-fields">
                <div className="fk-field">
                  <label className="fk-label" htmlFor="a2a-lat">
                    Latitude
                  </label>
                  <InputNumber
                    id="a2a-lat"
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
                  <label className="fk-label" htmlFor="a2a-lon">
                    Longitude
                  </label>
                  <InputNumber
                    id="a2a-lon"
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
                onClick={() => useTyped()}
              >
                Use these coordinates
              </Button>
            </div>
          )}

          {location && (
            <div className="fk-field">
              <label className="fk-label" htmlFor="a2a-place">
                Note for the rider
              </label>
              <Input
                id="a2a-place"
                // Keyed to the fix rather than to nothing: the box is
                // uncontrolled, so without this a note typed for one drop stayed
                // on screen after the drop was replaced — and the form then read
                // as a place the errand was no longer going to. Only the
                // coordinates are in the key, so typing does not remount the
                // field under the cursor.
                key={`${location.source ?? 'x'}:${location.latitude}:${location.longitude}`}
                disabled={busy}
                defaultValue={location.label ?? ''}
                onBlur={(event) => onLabel(event.target.value)}
                maxLength={200}
                placeholder="Flat 3, second floor — optional"
              />
              {/* The rider reads this, not the coordinates. Worth saying,
                  because a lat/long that is already correct makes the field look
                  like decoration. */}
              <p className="fk-hint fk-hint-1">Names the drop on the delivery board.</p>
            </div>
          )}

          {problem && <p className="fk-where-warn">{problem}</p>}

          {/* Who would actually carry it, said here as well as in the strip at
              the top of the page: this is the moment the operator decides to rely
              on a courier, so a courier that cannot be reached belongs in front
              of them now — before the money moves, since a failed handover
              leaves a bought order rather than undoing one. */}
          <div className={`fk-where-courier${courier?.dispatcher.ready ? '' : ' fk-where-courier-out'}`}>
            <span className="fk-where-courier-glyph" aria-hidden>
              <Scooter />
            </span>
            <div className="fk-where-courier-said">
              <div className="fk-where-courier-name">{courier?.service ?? 'No courier'}</div>
              <div className="fk-where-courier-note">
                {!courier
                  ? 'The delivery agent is not answering on port 8103 — a paid order would have no rider.'
                  : courier.dispatcher.ready
                    ? `Ready — handed over the moment the order is paid for.${
                        courier.activeJobs > 0
                          ? ` ${courier.activeJobs} already on the board.`
                          : ''
                      }`
                    : (courier.dispatcher.problem ??
                      `${courier.service} is not ready — the order would be bought and left without a rider.`)}
              </div>
            </div>
            <span
              className={`fk-dot ${courier?.dispatcher.ready ? 'fk-dot-ok' : 'fk-dot-bad'}`}
              aria-hidden
            />
          </div>
        </div>
      )}
    </section>
  );
}
