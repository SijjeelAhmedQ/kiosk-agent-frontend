import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import { useColorScheme } from '@/hooks/useColorScheme';
import { makeTheme } from '@/theme';
import '@/styles.css';
import App from './App';
import './dashboard.css';
import './monitor.css';

/**
 * The operations dashboard's own root.
 *
 * A fourth Vite entry beside the three consoles, and separate from them for the
 * same reason they are separate from each other: these are different apps that
 * share a design system. This one is the only one that reads every service at
 * once, which makes keeping it out of the others' folders more important rather
 * than less — a page that talks to four things should not be able to break the
 * three that each talk to one.
 *
 * The stylesheets are imported in the order they layer: the shared design
 * system first, this page's rules on top of it, and the control centre's on top
 * of those. Each one only ever adds — nothing below is overridden.
 */
function Root() {
  const { scheme } = useColorScheme();

  return (
    <ConfigProvider theme={makeTheme(scheme)} variant="filled">
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
