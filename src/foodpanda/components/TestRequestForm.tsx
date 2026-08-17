import { useState } from 'react';
import { Button, Input, InputNumber } from 'antd';
import type { TestRequestInput } from '../types';

/**
 * Send a delivery request by hand, as the ordering agent would.
 *
 * This exists so the delivery agent can be looked at on its own — without
 * starting an errand, ordering food and paying for it first — and it is honest
 * about what it is: the request it builds is the *real* A2A message, posted to
 * the same public endpoint the ordering agent posts to. There is no back door
 * and no special test mode on the server; the only difference is who typed it.
 *
 * The one field worth playing with is the distance. Inside the service radius
 * the dispatcher takes the job; outside it, it should refuse — and watching it
 * refuse is the fastest way to see that a model is actually deciding rather
 * than a state machine ticking over.
 */

interface Props {
  onSend: (input: TestRequestInput) => void;
  disabled: boolean;
  /** The radius the dispatcher refuses beyond, for the hint under the field. */
  radiusKm: number | null;
}

/** A different order number each time, so two test jobs never look like one. */
function freshOrderNumber(): string {
  return `FK-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function TestRequestForm({ onSend, disabled, radiusKm }: Props) {
  const [orderNumber, setOrderNumber] = useState(freshOrderNumber);
  const [itemName, setItemName] = useState('Zinger Burger');
  const [quantity, setQuantity] = useState(2);
  // Saddar to Westridge, the pair of points the request actually carries.
  const [distanceKm, setDistanceKm] = useState(5.6);
  const [dropoffAddress, setDropoffAddress] = useState(
    'House 12, Westridge 1, Rawalpindi',
  );
  const [notes, setNotes] = useState('Gate code 4417. Leave at reception if no answer.');

  const outside = radiusKm !== null && distanceKm > radiusKm;

  const send = () => {
    onSend({ orderNumber, itemName, quantity, distanceKm, dropoffAddress, notes });
    // A fresh number for the next one, so the board never shows two jobs that
    // look like the same order.
    setOrderNumber(freshOrderNumber());
  };

  return (
    <div className="fp-form">
      <div className="fp-field-row">
        <label className="fp-field">
          <span className="fk-label">Order number</span>
          <Input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            disabled={disabled}
          />
        </label>

        <label className="fp-field fp-field-narrow">
          <span className="fk-label">Quantity</span>
          <InputNumber
            min={1}
            max={99}
            value={quantity}
            onChange={(value) => setQuantity(value ?? 1)}
            disabled={disabled}
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <label className="fp-field">
        <span className="fk-label">Item</span>
        <Input
          value={itemName}
          onChange={(event) => setItemName(event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="fp-field">
        <span className="fk-label">Deliver to</span>
        <Input
          value={dropoffAddress}
          onChange={(event) => setDropoffAddress(event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="fp-field">
        <span className="fk-label">Distance from the branch</span>
        <InputNumber
          min={0}
          max={2000}
          step={0.5}
          value={distanceKm}
          onChange={(value) => setDistanceKm(value ?? 0)}
          disabled={disabled}
          addonAfter="km"
          style={{ width: '100%' }}
        />
        <span className={`fk-hint${outside ? ' fp-hint-warn' : ''}`}>
          {radiusKm === null
            ? 'The dispatcher refuses anything outside its service radius.'
            : outside
              ? `Outside the ${radiusKm} km service radius — the dispatcher should refuse this one.`
              : `Inside the ${radiusKm} km service radius — the dispatcher should take this one.`}
        </span>
      </label>

      <label className="fp-field">
        <span className="fk-label">For the rider</span>
        <Input.TextArea
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={disabled}
        />
      </label>

      <Button type="primary" block onClick={send} disabled={disabled}>
        Send the delivery request
      </Button>

      <p className="fk-hint fp-gap">
        This posts the same message the ordering agent posts, to the same endpoint.
        It does not create an order at the restaurant — it asks this agent to
        deliver one.
      </p>
    </div>
  );
}
