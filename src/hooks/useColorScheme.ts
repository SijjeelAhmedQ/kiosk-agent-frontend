/**
 * Light or dark, remembered.
 *
 * Starts from what the operator chose last time, falls back to what the OS
 * asks for, and writes the palette onto <html> so the stylesheet and antd are
 * never one paint out of step.
 */

import { useCallback, useEffect, useState } from 'react';
import { cssVariables, type ColorScheme } from '@/theme';

const KEY = 'fk-agent-scheme';

function initial(): ColorScheme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useColorScheme() {
  const [scheme, setScheme] = useState<ColorScheme>(initial);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', scheme);
    for (const [name, value] of Object.entries(cssVariables(scheme))) {
      root.style.setProperty(name, value);
    }
    // The phone's address bar, kept in step with the page under it. Every entry
    // sets this before the first paint from the same saved key; without this
    // line a scheme *switched* in the page leaves the strip on the old colour
    // until the next reload. Absent on the entries that carry no such meta, so
    // the lookup is allowed to find nothing.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', scheme === 'dark' ? '#0B0B0E' : '#F4F4F7');
    localStorage.setItem(KEY, scheme);
  }, [scheme]);

  const toggle = useCallback(() => {
    setScheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { scheme, toggle };
}
