/**
 * Finding out where the customer is, for an errand that has to reach them.
 *
 * The browser's Geolocation API is a permission prompt with three answers —
 * yes, no, and silence — and only the first of them is a location. So this
 * hook is written around the other two: every failure resolves to a *state the
 * page renders* rather than an exception, and an operator who is refused can
 * type coordinates instead.
 *
 * Nothing here blocks an errand. A run with no location is the counter order
 * this app has always sent, which is why `location` starts as null and staying
 * null is a legitimate outcome rather than an error to clear.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserLocation } from '@/types';

export type LocationStatus =
  | 'idle'
  | 'asking'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'failed';

export interface UserLocationState {
  /** The fix itself — what gets sent with the errand. Null means no delivery. */
  location: UserLocation | null;
  status: LocationStatus;
  /** What went wrong, in words worth putting on screen. */
  problem: string | null;
  /** Ask the device. Safe to call again after a refusal. */
  detect: () => void;
  /** Type it in instead, when the device will not say. */
  setManual: (latitude: number, longitude: number, label?: string) => void;
  /** Name the place without changing the coordinates. */
  setLabel: (label: string) => void;
  /** Back to a counter order. */
  clear: () => void;
}

/** How long to wait for a fix before giving up and saying so. */
const TIMEOUT_MS = 10_000;

/**
 * Why the device would not say, in words an operator can act on.
 *
 * The DOM's own messages are written for a developer ("User denied
 * Geolocation"), and the useful half — what to do about it — is never in them.
 */
function explain(error: GeolocationPositionError): [LocationStatus, string] {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return [
        'denied',
        'Location permission was refused. Allow it in the browser’s site ' +
          'settings, or type the coordinates below — the errand runs either way.',
      ];
    case error.POSITION_UNAVAILABLE:
      return [
        'unavailable',
        'The device could not get a fix. Type the coordinates below, or send ' +
          'the errand without one as a counter order.',
      ];
    case error.TIMEOUT:
      return [
        'failed',
        'The device took too long to answer. Try again, or type the coordinates below.',
      ];
    default:
      return ['failed', 'The browser could not report a location.'];
  }
}

export function useUserLocation(): UserLocationState {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  // Geolocation callbacks fire long after the call, and an operator who has
  // navigated away should not have state written into a dead component.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const detect = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setProblem(
        'This browser has no location support. Type the coordinates below instead.',
      );
      return;
    }

    setStatus('asking');
    setProblem(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!alive.current) return;
        setLocation((previous) => ({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
          // A label the operator already typed survives a re-detect: it names
          // the place, not the fix, and re-reading the GPS does not un-name it.
          label: previous?.label ?? null,
          source: 'browser',
        }));
        setStatus('ready');
        setProblem(null);
      },
      (error) => {
        if (!alive.current) return;
        const [nextStatus, message] = explain(error);
        setStatus(nextStatus);
        setProblem(message);
      },
      {
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        // A fix from the last minute is fine for choosing a branch, and it
        // spares the device a cold GPS lock on every errand.
        maximumAge: 60_000,
      },
    );
  }, []);

  const setManual = useCallback(
    (latitude: number, longitude: number, label?: string) => {
      setLocation({
        latitude,
        longitude,
        accuracyMeters: null,
        label: label?.trim() || null,
        source: 'manual',
      });
      setStatus('ready');
      setProblem(null);
    },
    [],
  );

  const setLabel = useCallback((label: string) => {
    setLocation((previous) =>
      previous ? { ...previous, label: label.trim() || null } : previous,
    );
  }, []);

  const clear = useCallback(() => {
    setLocation(null);
    setStatus('idle');
    setProblem(null);
  }, []);

  return { location, status, problem, detect, setManual, setLabel, clear };
}
