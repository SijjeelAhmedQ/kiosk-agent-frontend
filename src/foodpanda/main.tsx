import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import { useColorScheme } from '@/hooks/useColorScheme';
import { makeTheme } from '@/theme';
import '@/styles.css';
import App from './App';
import './foodpanda.css';

/**
 * The delivery console's own root.
 *
 * Same shape as the other two consoles', and separate from them by design: this
 * is a third Vite entry, so the pages share a design system and nothing else.
 * The shared stylesheet is imported first and this page's own rules after, so
 * `foodpanda.css` only ever adds.
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
