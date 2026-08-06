import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import App from '@/App';
import { useColorScheme } from '@/hooks/useColorScheme';
import { makeTheme } from '@/theme';
import '@/styles.css';

/**
 * The scheme lives above antd, not inside the page, because `ConfigProvider`
 * has to be rebuilt with a new token set when it changes — App only needs to
 * know which one is on and how to flip it.
 */
function Root() {
  const { scheme, toggle } = useColorScheme();

  // `filled` is the variant that matches the kiosk's fields: a cream fill, no
  // border, white and lifted on focus. Set once here rather than on every
  // control, the way the back office does it.
  return (
    <ConfigProvider theme={makeTheme(scheme)} variant="filled">
      {/* antd's App wrapper — gives message/notification the theme context. */}
      <AntApp>
        <App scheme={scheme} onToggleScheme={toggle} />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
