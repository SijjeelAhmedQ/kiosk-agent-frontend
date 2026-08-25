import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './App';
import { useColorScheme } from '@/hooks/useColorScheme';
import { makeTheme } from '@/theme';
import '@/styles.css';

/**
 * The LLM configuration screen's entry, identical in shape to the other four.
 *
 * The scheme lives above antd, not inside the page, because `ConfigProvider`
 * has to be rebuilt with a new token set when it changes — and `filled` is set
 * once here rather than on every control, the way the whole floor does it.
 *
 * `AntApp` is not decoration on this page: it is what gives `message` its theme
 * context, and this is the one screen that reports the result of a write.
 *
 * `toggle` is handed down because the masthead carries the scheme control. The
 * hook already owned both halves of it — the saved choice and the paint onto
 * <html> — so this is the button being wired to a switch that was always there,
 * under the same `fk-agent-scheme` key the pre-paint script in `llm.html` reads.
 */
function Root() {
  const { scheme, toggle } = useColorScheme();

  return (
    <ConfigProvider theme={makeTheme(scheme)} variant="filled">
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
