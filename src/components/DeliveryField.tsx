import { useState } from 'react';
import { Button, Input, InputNumber, Switch, Tooltip, Typography } from 'antd';
import type { DeliveryHealth, UserLocation } from '@/types';
import type { LocationStatus } from '@/hooks/useUserLocation';
import { V } from '@/theme';

const { Text } = Typography;

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

  return (
    <div className="fk-delivery">
      <div className="fk-delivery-head">
        <div style={{ minWidth: 0 }}>
          <div className="fk-eyebrow" style={{ marginBottom: 2 }}>
            Where it goes
          </div>
          <p className="fk-hint" style={{ margin: 0 }}>
            {!wanted
              ? 'Off — the agent orders at the counter, as it always has.'
              : location?.label
                ? // The address itself, once there is one: this is the line that
                  // answers "where is my food going", and it is the field the
                  // rider actually reads.
                  `To ${location.label} — ${service} collects from the nearest branch.`
                : `Ordered from the nearest branch, then ${service} carries it.`}
          </p>
        </div>

        <Tooltip
          title={
            wanted
              ? 'Turn off to send a counter order'
              : 'Deliver this order to the customer'
          }
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
        <div className="fk-delivery-body">
          {status === 'asking' && (
            <p className="fk-hint fk-hint-1">
              <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden /> Asking the
              browser for a location…
            </p>
          )}

          {location && (
            <>
              <div className="fk-delivery-fix">
                <span className="fk-badge fk-badge-leaf">
                  {location.source === 'browser'
                    ? 'from the device'
                    : onSaved
                      ? 'your saved address'
                      : 'typed in'}
                </span>
                <span style={{ fontFamily: V.fontMono, fontSize: 12 }}>
                  {coordinates(location)}
                </span>
                {typeof location.accuracyMeters === 'number' && (
                  <span className="fk-hint" style={{ margin: 0 }}>
                    ±{Math.round(location.accuracyMeters)} m
                  </span>
                )}
              </div>

              <div className="fk-field">
                <label className="fk-label" htmlFor="fk-place">
                  What to call this place
                </label>
                <Input
                  id="fk-place"
                  disabled={busy}
                  defaultValue={location.label ?? ''}
                  onBlur={(event) => onLabel(event.target.value)}
                  maxLength={200}
                  placeholder="Flat 3, second floor — optional"
                />
                {/* The rider reads this, not the coordinates. Worth saying,
                    because a lat/long that is already correct makes the field
                    look like decoration. */}
                <p className="fk-hint fk-hint-1">
                  Goes to the rider as the delivery note.
                </p>
              </div>
            </>
          )}

          {problem && (
            <Text style={{ fontSize: 12.5, color: V.flame, display: 'block' }}>
              {problem}
            </Text>
          )}

          {showManual && (
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
          )}

          <div className="fk-delivery-actions">
            {/* Always offered, not only as a recovery: an operator who detected
                the wrong place, or typed one, gets back to their own address in
                one click. Hidden only when it is already the address in use. */}
            {saved && !onSaved && (
              <Button size="small" type="primary" ghost disabled={busy} onClick={useSaved}>
                Use my saved address
              </Button>
            )}

            {showManual && (
              <Button
                size="small"
                type="primary"
                ghost
                disabled={busy || manualLat === null || manualLon === null}
                onClick={useTyped}
              >
                Use these coordinates
              </Button>
            )}

            <Button size="small" disabled={busy || status === 'asking'} onClick={onDetect}>
              {location ? 'Re-detect' : 'Detect location'}
            </Button>

            {!showManual && (
              <Button size="small" type="text" disabled={busy} onClick={() => setTyping(true)}>
                Type it instead
              </Button>
            )}
          </div>

          {/* Said here rather than only in the status strip: this is the moment
              the operator is deciding to rely on a courier, so a courier that
              cannot be reached belongs in front of them now. */}
          {delivery && !delivery.configured && (
            <Text style={{ fontSize: 12.5, color: V.flame, display: 'block' }}>
              {delivery.problem ??
                `${delivery.displayName} is not configured — the order would be placed but not delivered.`}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
