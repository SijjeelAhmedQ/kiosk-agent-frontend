import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { App as AntApp, Button, Input, InputNumber, Select, Tooltip } from 'antd';
import { AppShell, SidebarTrigger } from '@/components/AppShell';
import { Panel } from '@/components/Panel';
import type { ColorScheme } from '@/theme';
import {
  llmApi,
  LLM_OFFLINE,
  ServiceError,
  START_COMMAND,
  type ServiceFault,
} from './api';
import type {
  ActiveLlm,
  HealthCheck,
  ModelInfo,
  ProviderHealth,
  ProviderInfo,
  ProviderSetting,
  TestResult,
} from './types';
import './llm.css';

/**
 * The LLM configuration screen — the one place a provider or model is chosen.
 *
 * A sibling of the other four consoles, built the same way: its own Vite entry,
 * its own service client, the shared `AppShell` and `Panel`. What makes it
 * different from them is what it writes to. The consoles each drive one agent;
 * this page changes the brain all four of them share, so a choice made here
 * reaches the ordering agent, both A2A agents and the Foodpanda dispatcher at
 * once — no restart, no second setting anywhere.
 *
 * The screen holds a *draft*. Picking a provider or a model changes nothing on
 * the floor until Apply, which is why there is a dirty state at all: a control
 * that silently repointed four running agents the instant it was touched would
 * be the wrong control for this job.
 *
 * The layout follows from that. A readout at the top says what is live; the
 * workspace under it is the draft being assembled; and the dock at the foot —
 * pinned to the bottom of the scroll rather than buried in a card — is where
 * the draft becomes real. Apply is the one irreversible control on the page, so
 * it is never below the fold and never more than one glance from the state it
 * would overwrite.
 */

interface Props {
  scheme: ColorScheme;
  onToggleScheme: () => void;
}

/** Emoji, the way every other nav and panel surface in this app draws icons. */
const ICON: Record<string, string> = {
  llamacpp: '🦙',
  lmstudio: '🧪',
  janai: '🕊',
  gpt4all: '💽',
  vllm: '🚀',
  ollama: '🖥',
  openrouter: '☁',
  anthropic: '◆',
  gemini: '✦',
  openai: '⬡',
  groq: '⚡',
  huggingface: '🤗',
};

function iconFor(provider: string): string {
  return ICON[provider] ?? '🧠';
}

/** Bytes as something a person reads. Ollama reports model sizes in them. */
function gigabytes(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** 131072 → "128K". Context lengths are the one number worth showing per model. */
function context(tokens: number | null | undefined): string | null {
  if (!tokens) return null;
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}K ctx` : `${tokens} ctx`;
}

/** Everything a model says about itself, as short strings. Empty when silent. */
function notesFor(item: ModelInfo): { text: string; free: boolean }[] {
  return [
    item.parameterSize ? { text: item.parameterSize, free: false } : null,
    gigabytes(item.sizeBytes) ? { text: gigabytes(item.sizeBytes) as string, free: false } : null,
    context(item.contextLength) ? { text: context(item.contextLength) as string, free: false } : null,
    item.quantization ? { text: item.quantization, free: false } : null,
    item.family ? { text: item.family, free: false } : null,
    item.free ? { text: 'free', free: true } : null,
  ].filter((note): note is { text: string; free: boolean } => note !== null);
}

/**
 * The modifier this keyboard actually has.
 *
 * The shortcut binds both, so the only thing that varies is what the hint on
 * the button says — and a Windows desk told to press ⌘ is a Windows desk that
 * does not press anything.
 */
const CHORD = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? '⌘↵' : 'Ctrl ↵';

/** How long a generation took, rounded to something a person would say. */
function elapsed(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/**
 * Empty, loading-finished-with-nothing, and failed — one shape for all three.
 *
 * A panel that keeps the same block in every state does not jump as it moves
 * between them, and the only thing the eye has to re-read is the sentence.
 */
function State({
  tone,
  icon,
  title,
  children,
  actions,
}: {
  tone?: 'bad' | 'warn';
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`llm-state${tone ? ` llm-state-${tone}` : ''}`}>
      <span className="llm-state-icon" aria-hidden>
        {icon}
      </span>
      <span className="llm-state-title">{title}</span>
      {children && <span className="llm-state-text">{children}</span>}
      {actions && <span className="llm-state-actions">{actions}</span>}
    </div>
  );
}

/** Shimmering boxes at the shape of what is coming, not a spinner over nothing. */
function Skeleton({ rows = 3, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="llm-skel-stack" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="llm-skel" style={{ height }} />
      ))}
    </div>
  );
}

/**
 * One settings field, drawn from what the backend said about it.
 *
 * Three kinds and no provider names: a URL and a text field are the same input
 * with a different placeholder, and a number is a stepper carrying the range the
 * backend declared. A provider that adds a knob next month gets a field here
 * without this file changing.
 */
function SettingField({
  setting,
  value,
  onChange,
}: {
  setting: ProviderSetting;
  value: string | number | undefined;
  onChange: (value: string | number | null) => void;
}) {
  const id = `llm-setting-${setting.key}`;
  return (
    <div className="llm-setting">
      <div className="llm-field-head">
        <label className="llm-field-label" htmlFor={id}>
          {setting.label}
        </label>
      </div>

      {setting.kind === 'number' ? (
        <InputNumber
          id={id}
          className="llm-setting-input"
          /* Null, not 0, for an emptied field: an empty box is how a setting
             is put back to what .env says, and `Number('')` is a zero somebody
             would then have to notice and undo. */
          value={value === '' || value === undefined ? null : Number(value)}
          min={setting.min ?? undefined}
          max={setting.max ?? undefined}
          step={setting.step ?? undefined}
          precision={setting.number === 'int' ? 0 : undefined}
          style={{ width: '100%' }}
          onChange={(next) => onChange(next as number | null)}
        />
      ) : (
        <Input
          id={id}
          className="llm-setting-input"
          value={String(value ?? '')}
          placeholder={String(setting.default)}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {setting.help && <span className="llm-setting-help">{setting.help}</span>}
    </div>
  );
}

/** One selectable provider, as a row. */
function ProviderCard({
  provider,
  selected,
  onPick,
}: {
  provider: ProviderInfo;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="llm-provider"
      onClick={onPick}
    >
      <span className="llm-provider-icon" aria-hidden>
        {iconFor(provider.name)}
      </span>

      <span className="llm-provider-body">
        <span className="llm-provider-top">
          <span className="llm-provider-name">{provider.displayName}</span>
          <span className={`llm-badge llm-badge-${provider.kind}`}>
            {provider.kind === 'local' ? 'Local' : 'Cloud'}
          </span>
        </span>

        <span className="llm-provider-blurb">{provider.blurb}</span>

        {/* Whether a key is present — never what it is. A provider that needs
            one and has not got one is still selectable: saying so is more
            useful than hiding the option and leaving the operator to guess. */}
        {provider.requiresKey && !provider.configured && (
          <span className="llm-provider-warn">
            <span className="fk-dot fk-dot-bad" aria-hidden /> {provider.keyEnv} is not set
          </span>
        )}
      </span>

      <span className="llm-radio" aria-hidden>
        ✓
      </span>
    </button>
  );
}

/** A health or test report, one row per check. */
function Checks({ checks }: { checks: HealthCheck[] }) {
  return (
    <ul className="llm-checks">
      {checks.map((check, index) => (
        <li
          key={`${check.label}-${index}`}
          className={`llm-check ${check.ok ? 'llm-check-ok' : 'llm-check-bad'}`}
        >
          <span className="llm-check-mark" aria-hidden>
            {check.ok ? '✓' : '✕'}
          </span>
          <span className="llm-check-body">
            <span className="llm-check-label">{check.label}</span>
            {check.detail && <span className="llm-check-detail">{check.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The one-line answer, above the detail: connected, not connected, or asking. */
function StatusLine({
  checking,
  health,
}: {
  checking: boolean;
  health: ProviderHealth | null;
}) {
  if (checking) {
    return (
      <span className="fk-pill">
        <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden />
        Checking…
      </span>
    );
  }
  if (!health) {
    return (
      <span className="fk-pill">
        <span className="fk-dot" aria-hidden />
        Unknown
      </span>
    );
  }
  return (
    <span className="fk-pill">
      <span className={`fk-dot ${health.ok ? 'fk-dot-ok' : 'fk-dot-bad'}`} aria-hidden />
      {health.ok ? 'Connected' : 'Not connected'}
    </span>
  );
}

/** The four agents a change here reaches. There is no per-agent setting. */
const REACH: [string, string, string][] = [
  ['🤖', 'Ordering Agent', 'Places orders at Friends Kitchen'],
  ['🤝', 'A2A Buyer', 'Buys from the ordering desk'],
  ['🏪', 'A2A Merchant', 'Takes orders from other agents'],
  ['🛵', 'Delivery Dispatcher', 'Decides and rides'],
];

export default function App({ scheme, onToggleScheme }: Props) {
  const { message } = AntApp.useApp();

  // -- what the floor is on ------------------------------------------------ #
  const [active, setActive] = useState<ActiveLlm | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  /**
   * Why the page cannot be used, when it cannot.
   *
   * Three shapes rather than one boolean, because the fix is different for
   * each: start the service, *restart* the service, or read the message. The
   * middle one is the whole reason this is not a boolean — a build older than
   * this feature is up and answering, and telling somebody to start it is
   * advice they will follow for ten minutes before noticing it is already on.
   */
  const [fault, setFault] = useState<{ kind: ServiceFault; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // -- the draft ----------------------------------------------------------- #
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  // -- the model list for whichever provider is drafted -------------------- #
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsProblem, setModelsProblem] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  /**
   * Bumped to ask for the list again.
   *
   * A counter rather than re-setting the provider: setting a state to the value
   * it already holds is a no-op React bails out of, so "Retry" on a local
   * runtime that has since been started would have done nothing at all — which
   * is the one case the button exists for.
   */
  const [modelsNonce, setModelsNonce] = useState(0);

  // -- the selected provider's own settings -------------------------------- #
  /**
   * The settings being edited, or null while they match what is saved.
   *
   * A draft here for the same reason the provider and model are drafts: typing
   * a port should not repoint four running agents halfway through the number.
   * Null rather than a copy of the saved values, so "has this been touched" is
   * a fact rather than a deep comparison — and so a save elsewhere that changes
   * the values is picked up instead of being painted over by a stale copy.
   */
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string | number> | null>(
    null,
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // -- the checks ---------------------------------------------------------- #
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  /**
   * How long the last test took, measured here rather than reported.
   *
   * The endpoint does not time itself, and the number an operator wants is the
   * round trip they would feel — which is exactly what a clock on this side of
   * the fetch measures. Cleared with the test it belongs to.
   */
  const [testMs, setTestMs] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);

  /** The floor's state, and the draft reset to match it. */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const answer = await llmApi.providers();
      setFault(null);
      setProviders(answer.items);
      setActive(answer.active);
      setProvider((current) => current ?? answer.active.provider);
      setModel((current) => current ?? answer.active.model);
    } catch (error) {
      setFault(
        error instanceof ServiceError
          ? { kind: error.fault, message: error.message }
          : { kind: 'offline', message: LLM_OFFLINE },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Fetch the model list whenever the drafted provider changes.
   *
   * `cancelled` rather than an AbortController because the losing request's
   * *result* is the problem, not the request: clicking two providers quickly
   * must not let the slower answer paint over the faster one.
   */
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;

    setModelsLoading(true);
    setModels([]);
    setModelsProblem(null);

    void llmApi.models(provider).then((list) => {
      if (cancelled) return;
      setModelsLoading(false);
      if (!list) {
        setModelsProblem(LLM_OFFLINE);
        return;
      }
      setModels(list.items);
      setModelsProblem(list.problem);
    });

    return () => {
      cancelled = true;
    };
  }, [provider, modelsNonce]);

  /**
   * Keep the drafted model on a provider that can actually serve it.
   *
   * Switching from OpenRouter to the local runtime with `openai/gpt-oss-120b`
   * still in the box would offer an Apply that could only fail. When the list
   * arrives and the drafted model is not on it, the provider's own first model
   * takes its place — except while the list is empty, which means the provider
   * would not answer rather than that it has nothing.
   */
  useEffect(() => {
    if (modelsLoading || models.length === 0) return;
    if (model && models.some((item) => item.id === model)) return;
    const fallback =
      active && active.provider === provider
        ? models.find((item) => item.id === active.model)?.id
        : undefined;
    setModel(fallback ?? models[0].id);
  }, [models, modelsLoading, model, provider, active]);

  /** The connection check. Cheap enough to run whenever the draft settles. */
  useEffect(() => {
    if (!provider || !model) return;
    let cancelled = false;

    setChecking(true);
    setHealth(null);
    void llmApi.health(provider, model).then((answer) => {
      if (cancelled) return;
      setChecking(false);
      setHealth(answer);
    });

    return () => {
      cancelled = true;
    };
  }, [provider, model]);

  // A new draft invalidates the last test — a tick beside a model nobody tested
  // is worse than no tick.
  useEffect(() => {
    setTest(null);
    setTestMs(null);
  }, [provider, model]);

  // Half-typed settings belong to the provider they were typed for. Clicking
  // another card abandons them rather than carrying a port from one runtime
  // onto the next.
  useEffect(() => {
    setSettingsDraft(null);
  }, [provider]);

  const selected = useMemo(
    () => providers?.find((item) => item.name === provider) ?? null,
    [providers, provider],
  );

  const featured = useMemo(
    () => providers?.filter((item) => item.featured) ?? [],
    [providers],
  );
  const others = useMemo(
    () => providers?.filter((item) => !item.featured) ?? [],
    [providers],
  );

  const dirty =
    !!active && !!provider && !!model && (active.provider !== provider || active.model !== model);

  const options = useMemo(
    () =>
      models.map((item) => ({
        value: item.id,
        label: item.id,
        model: item,
      })),
    [models],
  );

  /** Whatever the drafted model tells us about itself, for the badges. */
  const chosen = useMemo(
    () => models.find((item) => item.id === model) ?? null,
    [models, model],
  );

  /** The settings as they should be drawn: the draft if there is one, else live. */
  const settingValues = settingsDraft ?? selected?.settingValues ?? {};

  /** Whether the settings differ from what the four services are reading. */
  const settingsDirty = useMemo(() => {
    if (!settingsDraft || !selected) return false;
    return Object.entries(settingsDraft).some(
      ([key, value]) => String(value) !== String(selected.settingValues[key] ?? ''),
    );
  }, [settingsDraft, selected]);

  const editSetting = (key: string, value: string | number | null) => {
    setSettingsDraft((current) => ({
      ...(current ?? selected?.settingValues ?? {}),
      // An emptied field is not a value — it becomes the placeholder, and the
      // backend reads a missing key as "leave it as it is".
      [key]: value === null ? '' : value,
    }));
  };

  /**
   * Save this provider's settings, then re-read everything they decide.
   *
   * A changed server URL moves three things at once — which models exist, what
   * the connection check says, and what a generation would reach — so all three
   * are asked again rather than left showing answers from the previous address.
   */
  const saveSettings = async () => {
    if (!provider || !settingsDraft) return;
    setSavingSettings(true);
    try {
      // Only what was actually touched. A field left alone is not sent, so a
      // value this build does not know about cannot be flattened by it.
      const changed: Record<string, string | number | null> = {};
      for (const [key, value] of Object.entries(settingsDraft)) {
        if (String(value) === String(selected?.settingValues[key] ?? '')) continue;
        changed[key] = value === '' ? null : value;
      }

      await llmApi.saveSettings(provider, changed);
      setSettingsDraft(null);
      message.success(`${selected?.displayName ?? 'The provider'} settings saved.`);

      await load();
      setModelsNonce((nonce) => nonce + 1);
      setTest(null);
      setTestMs(null);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'The settings could not be saved.',
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const runTest = async () => {
    if (!provider || !model) return;
    setTesting(true);
    setTest(null);
    setTestMs(null);
    const started = performance.now();
    try {
      setTest(await llmApi.test(provider, model));
      setTestMs(Math.round(performance.now() - started));
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'The test could not be run.');
    } finally {
      setTesting(false);
    }
  };

  const apply = async () => {
    if (!provider || !model) return;
    setApplying(true);
    try {
      const now = await llmApi.apply(provider, model);
      setActive(now);
      message.success(`Every agent is now on ${now.displayName} · ${now.model}.`);
      // Providers report whether they are configured, and that can change with
      // the selection — re-read rather than assume.
      void load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'The change could not be saved.');
    } finally {
      setApplying(false);
    }
  };

  /** Put the draft back to what every agent is running on. */
  const reset = useCallback(() => {
    if (!active) return;
    setProvider(active.provider);
    setModel(active.model);
  }, [active]);

  /**
   * ⌘/Ctrl + Enter applies.
   *
   * The one shortcut on the page, and it is on the one action worth reaching
   * for without the mouse. Guarded by the same conditions as the button, so the
   * keyboard can never do what the button would refuse to.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
      if (!dirty || applying || testing) return;
      event.preventDefault();
      void apply();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `apply` is re-created every render; the guards it depends on are the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, applying, testing, provider, model]);

  /** Clipboard, with the one failure it actually has reported rather than eaten. */
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${what} copied.`);
    } catch {
      message.error(`${what} could not be copied — the browser refused clipboard access.`);
    }
  };

  /** The model box: loading, error, empty and list, in that order of honesty. */
  const modelField = () => {
    if (modelsLoading) {
      return <Skeleton rows={1} height={52} />;
    }

    if (modelsProblem) {
      return (
        <State
          tone="warn"
          icon="⚠"
          title={
            selected?.kind === 'local' ? 'The local runtime is not available' : 'No model list'
          }
          actions={
            <Button onClick={() => setModelsNonce((nonce) => nonce + 1)}>Retry</Button>
          }
        >
          {modelsProblem}
        </State>
      );
    }

    if (models.length === 0) {
      return (
        <State
          icon="📭"
          title="Nothing to choose from"
          actions={
            selected?.kind === 'local' ? (
              <Button onClick={() => setModelsNonce((nonce) => nonce + 1)}>
                Check again
              </Button>
            ) : undefined
          }
        >
          {selected?.kind === 'local' ? (
            <>
              {selected.name === 'ollama' ? (
                <>
                  No models are installed. Pull one with <code>ollama pull llama3.1</code>,
                  then check again.
                </>
              ) : (
                <>
                  {selected.displayName} is running but has no model loaded.{' '}
                  {selected.startHint}
                </>
              )}
            </>
          ) : (
            'This provider offers no models to choose from.'
          )}
        </State>
      );
    }

    return (
      <>
        <Select
          id="llm-model"
          className="llm-select"
          showSearch
          value={model ?? undefined}
          onChange={setModel}
          placeholder="Choose a model"
          optionFilterProp="label"
          style={{ width: '100%' }}
          options={options}
          listHeight={320}
          classNames={{ popup: { root: 'llm-model-popup' } }}
          optionRender={(option) => {
            const item = (option.data as { model?: ModelInfo }).model;
            if (!item) return option.label;
            const notes = notesFor(item);
            return (
              <div className="llm-option">
                <span className="llm-option-id">{item.id}</span>
                {notes.length > 0 && (
                  <span className="llm-option-notes">
                    {notes.map((note, index) => (
                      <span
                        key={index}
                        className={`llm-option-note${note.free ? ' llm-option-note-free' : ''}`}
                      >
                        {note.text}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          }}
        />

        {chosen && notesFor(chosen).length > 0 && (
          <div className="llm-model-meta">
            {notesFor(chosen).map((note, index) => (
              <span
                key={index}
                className={`llm-badge${note.free ? ' llm-badge-ok' : ''}`}
              >
                {note.text}
              </span>
            ))}
          </div>
        )}
      </>
    );
  };

  const themeButton = (
    <Tooltip title={scheme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}>
      <button
        type="button"
        className="llm-icon-btn"
        onClick={onToggleScheme}
        aria-label={scheme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
      >
        <span aria-hidden>{scheme === 'dark' ? '☀' : '☾'}</span>
      </button>
    </Tooltip>
  );

  const masthead = (
    <header className="fk-header llm-topbar">
      <div className="fk-header-inner">
        <div className="fk-brand">
          <SidebarTrigger />
          <img className="fk-mark" src="/logo.png" alt="" width={44} height={44} aria-hidden />
          <div className="llm-title">
            <span className="llm-eyebrow">Friends Kitchen · Control plane</span>
            <h1 className="fk-brand-name">LLM Configuration</h1>
          </div>
        </div>

        <div className="fk-header-actions llm-topbar-actions">
          {active && (
            <Tooltip
              title={
                active.ready
                  ? 'Every agent on this floor is running on this'
                  : (active.problem ?? 'This configuration cannot serve a run')
              }
            >
              <span className="llm-live-chip">
                <span
                  className={`fk-dot ${active.ready ? 'fk-dot-ok' : 'fk-dot-bad'}`}
                  aria-hidden
                />
                <span className="llm-live-chip-text">
                  <b>{active.displayName}</b> · {active.model}
                </span>
              </span>
            </Tooltip>
          )}
          {themeButton}
        </div>
      </div>
    </header>
  );

  if (fault) {
    const heading =
      fault.kind === 'stale'
        ? 'The agent service needs restarting'
        : fault.kind === 'offline'
          ? 'The agent service is not running'
          : 'The agent service could not be read';

    const why =
      fault.kind === 'stale'
        ? 'It is up and answering, but it is an older build with no LLM configuration endpoints. Restarting it is what picks them up.'
        : fault.kind === 'offline'
          ? 'Nothing answered on port 8100 — the process is not running, or it is not reachable from this browser.'
          : fault.message;

    return (
      <AppShell active="llm">
        <div className="fk-shell llm-page">
          {masthead}
          <main className="fk-content llm-content">
            <div className="llm-fault">
              <div
                className={`llm-fault-card fk-rise${fault.kind === 'stale' ? ' llm-fault-warn' : ''}`}
              >
                <span className="llm-fault-icon" aria-hidden>
                  {fault.kind === 'stale' ? '↻' : '⚡'}
                </span>
                <h2 className="llm-fault-title">{heading}</h2>
                <p className="llm-fault-text">{why}</p>

                {fault.kind !== 'error' && (
                  <div className="llm-cmd">
                    <code>{START_COMMAND}</code>
                    <button
                      type="button"
                      className="llm-copy"
                      onClick={() => void copy(START_COMMAND, 'The command')}
                    >
                      <span aria-hidden>⧉</span> Copy
                    </button>
                  </div>
                )}

                <div className="llm-state-actions">
                  <Button type="primary" loading={loading} onClick={() => void load()}>
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </AppShell>
    );
  }

  const draftLabel = provider && model ? `${provider} · ${model}` : '—';

  return (
    <AppShell
      active="llm"
      action={{
        label: 'Reset',
        icon: '↺',
        onClick: reset,
        disabled: !dirty,
        title: dirty
          ? 'Put the draft back to what every agent is running on'
          : 'The draft already matches what is live',
      }}
    >
      <div className="fk-shell llm-page">
        {masthead}

        <main className="fk-content llm-content">
          {/* What is live right now, said before anything that could change it. */}
          {loading && !active ? (
            <div className="llm-skel fk-rise" style={{ height: 90, borderRadius: 26 }} aria-hidden />
          ) : (
            active && (
              <section
                className="llm-hero fk-rise"
                data-dirty={dirty ? 'true' : 'false'}
                data-ready={active.ready ? 'true' : 'false'}
                aria-label="Active configuration"
              >
                <span className="llm-hero-icon" aria-hidden>
                  {iconFor(active.provider)}
                </span>

                <div className="llm-hero-body">
                  <span className="llm-hero-eyebrow">
                    <span
                      className={`fk-dot ${active.ready ? 'fk-dot-ok' : 'fk-dot-bad'}`}
                      aria-hidden
                    />
                    Active on every agent
                  </span>

                  <span className="llm-hero-model">
                    <span className="llm-hero-provider">{active.displayName}</span>
                    <span className="llm-hero-id">{active.model}</span>
                  </span>

                  <span className="llm-hero-meta">
                    <span className={`llm-badge llm-badge-${active.kind}`}>
                      {active.kind === 'local' ? 'On this machine' : 'Cloud'}
                    </span>
                    <Tooltip
                      title={
                        active.source === 'central'
                          ? `Chosen on this screen${active.updatedAt ? ` · ${new Date(active.updatedAt).toLocaleString()}` : ''}`
                          : 'Still on AGENT_PROVIDER / AGENT_MODEL from .env — nothing has been chosen here yet'
                      }
                    >
                      <span className="llm-badge">
                        {active.source === 'central' ? 'Set here' : 'From .env'}
                      </span>
                    </Tooltip>
                    <span className={`llm-badge ${active.ready ? 'llm-badge-ok' : 'llm-badge-bad'}`}>
                      {active.ready ? 'Ready' : 'Not ready'}
                    </span>
                  </span>
                </div>

                <div className="llm-hero-side">
                  {dirty && (
                    <span className="llm-badge llm-badge-draft">
                      <span className="fk-dot fk-dot-busy" aria-hidden />
                      Unapplied changes
                    </span>
                  )}
                </div>
              </section>
            )
          )}

          {active && !active.ready && active.problem && (
            <div className="llm-notice fk-rise" role="status">
              <span className="llm-notice-icon" aria-hidden>
                ⚠
              </span>
              <span className="llm-notice-body">
                <span className="llm-notice-title">The active configuration cannot run</span>
                <span className="llm-notice-text">{active.problem}</span>
              </span>
            </div>
          )}

          <div className="llm-grid">
            <div className="llm-col fk-rise fk-rise-1">
              <Panel
                icon="🧩"
                title="Provider"
                note="Where the model runs. Every agent on this floor uses the one you pick."
              >
                {loading && !providers ? (
                  <Skeleton rows={2} height={86} />
                ) : (
                  <>
                    <div className="llm-providers" role="radiogroup" aria-label="Provider">
                      {featured.map((item) => (
                        <ProviderCard
                          key={item.name}
                          provider={item}
                          selected={item.name === provider}
                          onPick={() => setProvider(item.name)}
                        />
                      ))}
                    </div>

                    {/* Everything else: the other four local servers, Ollama, and
                        the cloud providers this project supported before the two
                        above were given cards. Equally selectable and equally
                        supported — folded away because a floor runs on one of the
                        two, and a list of twelve reads as a decision to make. */}
                    {others.length > 0 && (
                      <details className="llm-more">
                        <summary>Other providers ({others.length})</summary>
                        <div
                          className="llm-more-grid"
                          role="radiogroup"
                          aria-label="Other providers"
                        >
                          {others.map((item) => (
                            <button
                              key={item.name}
                              type="button"
                              role="radio"
                              aria-checked={item.name === provider}
                              className="llm-mini"
                              onClick={() => setProvider(item.name)}
                              title={item.problem ?? item.blurb}
                            >
                              <span aria-hidden>{iconFor(item.name)}</span>
                              {item.displayName}
                              {item.requiresKey && !item.configured && (
                                <span className="fk-dot fk-dot-bad" aria-hidden />
                              )}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </Panel>

              {selected && selected.settings.length > 0 && (
                <Panel
                  icon="🔧"
                  title={`${selected.displayName} settings`}
                  note={`Where ${selected.displayName} is reached on this machine, and how it is asked.`}
                  collapsible
                  defaultOpen
                  persistKey="llm-provider-settings"
                  extra={
                    settingsDirty ? (
                      <span className="llm-badge llm-badge-draft">
                        <span className="fk-dot fk-dot-busy" aria-hidden />
                        Unsaved
                      </span>
                    ) : undefined
                  }
                  footer={
                    <div className="llm-setting-actions">
                      <Button
                        onClick={() => setSettingsDraft(null)}
                        disabled={!settingsDirty || savingSettings}
                      >
                        Discard
                      </Button>
                      <Button
                        type="primary"
                        onClick={() => void saveSettings()}
                        loading={savingSettings}
                        disabled={!settingsDirty}
                      >
                        Save settings
                      </Button>
                    </div>
                  }
                >
                  <div className="llm-settings">
                    {selected.settings
                      .filter((setting) => !setting.advanced)
                      .map((setting) => (
                        <SettingField
                          key={setting.key}
                          setting={setting}
                          value={settingValues[setting.key]}
                          onChange={(value) => editSetting(setting.key, value)}
                        />
                      ))}
                  </div>

                  {/* The knobs whose defaults are right almost always. Folded,
                      so the section stays the one field somebody came for. */}
                  {selected.settings.some((setting) => setting.advanced) && (
                    <details className="llm-more">
                      <summary>
                        Advanced ({selected.settings.filter((s) => s.advanced).length})
                      </summary>
                      <div className="llm-settings">
                        {selected.settings
                          .filter((setting) => setting.advanced)
                          .map((setting) => (
                            <SettingField
                              key={setting.key}
                              setting={setting}
                              value={settingValues[setting.key]}
                              onChange={(value) => editSetting(setting.key, value)}
                            />
                          ))}
                      </div>
                    </details>
                  )}

                  {/* Saved settings are live at once; the provider itself still
                      needs Apply. Said here rather than left to be discovered. */}
                  <span className="llm-setting-note">
                    Saved settings take effect on the next model built, in all four
                    services. Choosing {selected.displayName} itself still needs Apply.
                  </span>
                </Panel>
              )}

              <Panel
                icon="🎛"
                title="Model"
                note={
                  selected
                    ? selected.dynamicModels
                      ? `Read from ${selected.displayName} — this is what it can actually serve.`
                      : `${selected.displayName} publishes no model list, so this is its configured default.`
                    : undefined
                }
                extra={
                  selected && (
                    <span className="llm-badge llm-badge-mono">
                      {modelsLoading ? '…' : `${models.length} available`}
                    </span>
                  )
                }
              >
                <div className="llm-field-head">
                  <label className="llm-field-label" htmlFor="llm-model">
                    Model
                  </label>
                  {models.length > 0 && !modelsLoading && (
                    <span className="llm-field-hint">Type to search</span>
                  )}
                </div>
                {modelField()}
              </Panel>
            </div>

            <div className="llm-col fk-rise fk-rise-2">
              <Panel
                icon="📡"
                title="Connection"
                note="Whether the drafted provider and model could serve a run right now."
                extra={<StatusLine checking={checking} health={health} />}
              >
                {checking && <Skeleton rows={2} height={44} />}

                {!checking && health && <Checks checks={health.checks} />}

                {!checking && health && !health.ok && health.problem && (
                  <div style={{ marginTop: 12 }}>
                    <State
                      tone="bad"
                      icon="⚡"
                      title={
                        selected?.kind === 'local'
                          ? 'The local LLM is not available'
                          : `Unable to reach ${selected?.displayName ?? 'the provider'}`
                      }
                    >
                      {health.problem}
                    </State>
                  </div>
                )}

                {!checking && !health && (
                  <State icon="🔌" title="Nothing to check yet">
                    Pick a provider and a model and this panel reports whether they could
                    serve a run.
                  </State>
                )}
              </Panel>

              <Panel
                icon="🧪"
                title="Verification"
                note="A real generation, through exactly the client an agent would get."
                tone={test ? (test.ok ? 'leaf' : 'flame') : undefined}
              >
                <div className="llm-bench">
                  {(testing || test) && (
                    <div className="llm-probe">
                      <span className="llm-probe-tag">Probe</span>
                      <span>
                        POST /api/llm/test → {provider} / {model}
                      </span>
                    </div>
                  )}

                  {testing && (
                    <div className="llm-thinking" role="status" aria-live="polite">
                      <span className="llm-dots" aria-hidden>
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="llm-thinking-text">
                        {model} is answering — a first call to a cold local model can take a
                        while.
                      </span>
                    </div>
                  )}

                  {!testing && !test && (
                    <div className="llm-state">
                      <span className="llm-orb" aria-hidden />
                      <span className="llm-state-title">Nothing verified yet</span>
                      <span className="llm-state-text">
                        A verification asks the selected model a question and reads the answer
                        back — the only check that proves the whole path, from this screen to
                        the provider and home again.
                      </span>
                      <span className="llm-state-actions">
                        <Button
                          onClick={() => void runTest()}
                          disabled={!provider || !model || applying}
                        >
                          Run verification
                        </Button>
                      </span>
                    </div>
                  )}

                  {!testing && test && (
                    <>
                      <Checks checks={test.checks} />

                      {test.ok ? (
                        <div className="llm-reply">
                          <div className="llm-reply-head">
                            <span
                              className="fk-dot fk-dot-ok"
                              aria-hidden
                              style={{ flex: 'none' }}
                            />
                            <span className="llm-reply-who">{test.model} answered</span>
                            {testMs !== null && (
                              <span className="llm-reply-when">{elapsed(testMs)}</span>
                            )}
                            {test.reply && (
                              <button
                                type="button"
                                className="llm-copy"
                                onClick={() => void copy(test.reply as string, 'The reply')}
                              >
                                <span aria-hidden>⧉</span> Copy
                              </button>
                            )}
                          </div>
                          {test.reply && <div className="llm-reply-body">{test.reply}</div>}
                        </div>
                      ) : (
                        <div className="llm-reply llm-reply-bad">
                          <div className="llm-reply-head">
                            <span
                              className="fk-dot fk-dot-bad"
                              aria-hidden
                              style={{ flex: 'none' }}
                            />
                            <span className="llm-reply-who">Unable to connect</span>
                            <span className="llm-reply-when">
                              <Button size="small" type="text" onClick={() => void runTest()}>
                                Retry
                              </Button>
                            </span>
                          </div>
                          {test.problem && <div className="llm-reply-body">{test.problem}</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Panel>

              <Panel
                icon="🤖"
                title="What this changes"
                note="There is no per-agent model setting. This is the only one."
                collapsible
                defaultOpen
                persistKey="llm-reach"
              >
                <ul className="llm-reach">
                  {REACH.map(([icon, name, what]) => (
                    <li
                      key={name}
                      className={`llm-reach-row${dirty ? ' llm-reach-pending' : ''}`}
                    >
                      <span className="llm-reach-icon" aria-hidden>
                        {icon}
                      </span>
                      <span className="llm-reach-text">
                        <span className="llm-reach-name">{name}</span>
                        <span className="llm-reach-what">{what}</span>
                      </span>
                      <span className="llm-reach-target">
                        {dirty && provider && model
                          ? `${provider} · ${model}`
                          : active
                            ? `${active.provider} · ${active.model}`
                            : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
                {dirty && (
                  <span className="llm-reach-note">
                    Shown as it would be after Apply. Nothing has moved yet.
                  </span>
                )}
              </Panel>
            </div>
          </div>

          {/* The draft, and the two things that can be done with it. Pinned to
              the bottom of the scroll so Apply is never hunted for. */}
          <div className="llm-dock" data-dirty={dirty ? 'true' : 'false'}>
            <div className="llm-dock-inner">
              <div className="llm-dock-info">
                <span className="llm-dock-label">
                  <span
                    className={`fk-dot${dirty ? ' fk-dot-busy' : health?.ok ? ' fk-dot-ok' : ''}`}
                    aria-hidden
                  />
                  {dirty ? 'Draft — not applied' : 'Live on every agent'}
                </span>
                <span className="llm-dock-value">{draftLabel}</span>
              </div>

              <div className="llm-dock-actions">
                {dirty && (
                  <Tooltip title="Put the draft back to what every agent is running on">
                    <Button onClick={reset} disabled={applying}>
                      Reset
                    </Button>
                  </Tooltip>
                )}
                <Button
                  onClick={() => void runTest()}
                  loading={testing}
                  disabled={!provider || !model || applying}
                >
                  Test Connection
                </Button>
                <Tooltip
                  title={
                    dirty
                      ? 'Point every agent at this provider and model'
                      : 'This is already what every agent is running on'
                  }
                >
                  <Button
                    type="primary"
                    onClick={() => void apply()}
                    loading={applying}
                    disabled={!dirty || testing}
                  >
                    Apply Changes
                    {dirty && (
                      <kbd className="llm-kbd" aria-hidden>
                        {CHORD}
                      </kbd>
                    )}
                  </Button>
                </Tooltip>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
