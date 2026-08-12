import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import { useColorScheme } from '@/hooks/useColorScheme';
import { makeTheme } from '@/theme';
import '@/styles.css';
import App from './App';
import './a2a.css';

/**
 * The A2A console's own root.
 *
 * Same shape as the errand console's, and separate from it by design: this is a
 * second Vite entry, so the two pages share a design system and nothing else.
 * The shared stylesheet is imported first and this page's own rules after, so
 * `a2a.css` only ever adds.
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
