/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the ordering agent's server is listening. The only service this app
   *  talks to — the Friends Kitchen API is reached through it. */
  readonly VITE_AGENT_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
