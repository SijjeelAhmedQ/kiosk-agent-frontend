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
    localStorage.setItem(KEY, scheme);
  }, [scheme]);

  const toggle = useCallback(() => {
    setScheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { scheme, toggle };
}
