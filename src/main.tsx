import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import App from '@/App';
import { agentTheme } from '@/theme';
import '@/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={agentTheme}>
      {/* antd's App wrapper — gives message/notification the theme context. */}
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
