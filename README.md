# Friends Kitchen — Ordering Agent UI

The control panel for the ordering agent. Write the errand, hand over a coupon
and a spending limit, press **Send the agent**, and watch it shop.

React 19 · TypeScript · Vite · **Ant Design 6**

```bash
npm install
npm run dev          # http://localhost:5174
```

---

## Why it is its own app

It is a different product for a different person. Friends Kitchen is a full-screen
touch flow for a customer standing at a panel; this is a desk tool for whoever
is sending the agent out. Keeping them apart means the customer's bundle never
carries the agent console, and this app can be deployed, restarted and demoed
without touching the till.

It also has no dependency on Friends Kitchen's front end at all — only on the agent's
HTTP API. Friends Kitchen can be rebuilt or replaced and this keeps working.

---

## What you need running

Three services, in this order:

| Service | Where | Port |
|---|---|---|
| Friends Kitchen backend | `friends-kitchen-backend` | 8000 |
| Agent server | `friends-kitchen-agent-backend` — `.venv\Scripts\python -m uvicorn server:app --port 8100` | 8100 |
| This app | `npm run dev` | 5174 |

Then one per console you want to open. The agent orders at the counter without
any of them, and the status strip says which is missing rather than failing at
the first click:

| Service | Where (all in `friends-kitchen-agent-backend`) | Port | Console |
|---|---|---|---|
| A2A merchant | `.venv\Scripts\python -m uvicorn a2a_server:app --port 8101` | 8101 | `/a2a.html` |
| In-house courier | `.venv\Scripts\python -m uvicorn delivery_server:app --port 8102` | 8102 | — |
| Foodpanda dispatcher agent | `.venv\Scripts\python -m uvicorn foodpanda_server:app --port 8103` | 8103 | `/foodpanda.html` |

`/dashboard.html` reads **all four** and drives none of them — see *The operations
dashboard* below. It needs nothing extra running; whatever is up appears on it,
and whatever is not says so by name and port.

If the floor is set to a **local model** — llama.cpp, LM Studio, Jan.ai, GPT4All,
vLLM or Ollama — that runtime is one more thing to have running, and it is the
only one none of these commands starts. `/llm.html` says which one is selected,
whether it is answering, and on what port; for llama.cpp the agent backend ships
`scripts\llama-server.ps1`, which starts it on the settings in that project's
`.env`. Nothing else changes: the consoles, the dashboard and the agents behave
the same whichever provider is behind them.

The two couriers are an either/or: `DELIVERY_PROVIDER` in the agent's `.env` names
one of them, and the other cannot answer its jobs. `mock_foodpanda` means 8103 —
the board at `/foodpanda.html` — so that is the one to start if you want to watch
a delivery happen.

For **browser mode** the Friends Kitchen front end (`friends-kitchen-frontend`, port 5173) must be
running too — that is the website the agent drives.

The strip at the top of the page reports all of this — one pill per service,
green or red. If something is missing it says which thing and how to start it,
rather than failing at the first click.

---

## The screen

**Left — the errand.** What to order, in plain language. A coupon picked from
the restaurant's own coupons (or typed in) — the used, expired and cancelled
ones are listed too, greyed out and labelled with what is wrong with them, so a
code that will not work says so before the errand starts. A cash limit for
whatever the coupon does not cover. And whether the agent should order through the API or
by driving the real website.

**Where it goes.** A switch between the order and the money, off by default. Off
is the counter order this form has always sent. On fills in the customer's saved
address — `FK_CUSTOMER_ADDRESS` on the agent server, served through its health
endpoint so there is one copy of it — because "my own place" is where nearly
every delivery goes and it needs no permission prompt. *Detect location* asks the
device for the errand going somewhere else, the coordinates can be typed when a
desk machine refuses, and *Use my saved address* comes back. The place can be
named ("Flat 3, second floor"); that is what the rider reads.

**Right — what happened.** A live timeline of every step the agent took, ticked
green or flagged red as each one lands, and then the agent's own report of how
it went with the money it actually spent.

**The delivery**, on a delivery errand only: the route, and how far along the
courier is. It sits above the report because it is the part still moving after
the agent has stopped talking — and it says *not delivered yet* until the
courier itself says otherwise, which is the one thing a paid, finished-looking
order must not be allowed to imply.

Steps that move money are tagged in the timeline. That is deliberate: in a run
with a dozen tool calls, the one that spends is the one worth finding.

The errand stays put while the trace scrolls, because it is what you come back
to. On a narrow screen the two stack instead, errand first.

`Ctrl`/`⌘`+`Enter` in the order box sends the agent, for whoever is running a
dozen of these in a row.

---

## The operations dashboard — `/dashboard.html`

A fourth page beside the three consoles, and the only one that reads every
service at once. The consoles each drive an agent; this one drives nothing. It
answers the questions you have *before* you know which console to open.

**The header** is the floor's verdict, not a page title: whether every service is
answering or the floor is degraded — said in words beside its colour — how many
conversations are live, how many events a minute are crossing, and the clock
every timestamp below it is relative to. The three consoles sit to its right as
one grouped rail with the page you are on filled in.

**At a glance.** The overview reads in two weights, because the questions are not
equal. Paper tiles for the delivery floor — what is live this second (with the
arrival sparkline behind it), what came in, what landed, how long it took, how
many services are answering — and under them one rail for the agent fleet: agents
talking, live conversations, agent-to-agent turns, handovers open, tool and API
calls, median response, completed, and failed or blocked. Anything unknowable
prints an em dash rather than a zero, and nothing carries a trend arrow: the page
holds no history to compare against, and an arrow drawn without one is decoration
that reads as evidence.

**Who is on the floor.** Five workers across four services — the ordering agent
on 8100, the buyer and the merchant that share 8101, the Foodpanda dispatcher on
8103, and the in-house courier on 8102. Each says what it runs on, whether it is
working, idle, not ready or offline, and — where the service will say — how much
work it is holding. An agent card that is *blocked* is running and missing a key;
one that is *offline* is not running at all. The two are kept apart because they
send you to different terminals.

**The control centre.** The panel at the top of the page, and the reason to keep
this tab open on a second screen. It shows what the agents are *saying to each
other* while they say it:

- a **pulse line** along the top: conversations live, events in the last minute,
  parties that have spoken, the median round trip and failures recorded — the
  five readings you watch *while* watching. The fuller set lives in the overview
  at the top of the page rather than being printed twice on one screen;
- a **route ribbon** — the parties this particular request has passed through, in
  the order it reached them, with the hop that is carrying right now lit up;
- the **cast**, on the left: every worker with two separate readings on it —
  reachable (from the health poll) and *doing* (from the wire). Up and silent is
  a different morning from down, and one card shows both;
- **who is calling whom**: each directed wire with its traffic, its last message
  and whether anything on it has failed. Clicking one narrows the whole right
  side to that agent.

On the right, the same events cut five ways, because five different questions get
asked of them:

- **Conversation** — a negotiation drawn as a negotiation, two lanes with the
  machinery (tool calls, API answers, the handover to the courier) running
  quietly down the middle;
- **Handovers** — every time work changed hands, drawn as a transfer: previous
  owner, new owner, the reason given, how long the receiver took to answer, what
  happened before and after, and where a handover opened a job of its own, a link
  through to it. A transfer nobody has answered says *pending* however old it is,
  and the panel raises an alert above the tabs when one goes unanswered;
- **Timeline** — one task's stages in the order it passed through them, each with
  its owner, its duration and the events it was read from. Stages that have not
  happened are absent rather than greyed out;
- **Event log** — every event with both ends named, chip-filterable by agent
  messages, negotiation, API calls, tool calls, orders, delivery or errors, with
  the raw payload one click away;
- **Code** — the technical view: each call paired with its answer, both payloads
  collapsible, with the round trip in milliseconds. This is the one that answers
  "it succeeded and still returned the wrong thing".

One **search and filter bar** sits above all five rather than one per tab —
agent, event kind, status, time window and free text over everything an event
carries, its stored payload included, so a delivery id that only exists as a JSON
value is still findable. Pick a run from the chips along the top, or leave it
alone and it follows whatever is live.

**The task drawer.** Every task id on the page opens it — a run chip, a handover
card, a call row, a log row, an order number in *Who is holding what*. Inside:
what the task is and how long it has been going, the chain of agents that have
held it (and who handed it to whom), everyone involved, what went wrong if
anything did, and then the same conversation, handovers, calls and timeline for
that task alone. It reads and never writes, like the rest of the page.

**API usage & billing.** One chip in the toolbar — `API usage · 1.24M tokens ·
≈$4.82` — and everything else behind it. Press it and a drawer comes in from the
right over the board: total tokens with the input/output split, the estimated
bill, requests, remaining budget, average cost per request, usage against the
budget, provider, model, key status, billing period and the last call. Under
those, a token-split bar and a budget bar; three figures over the range (tokens
used, the running cost trend, request activity by outcome), each with its table
twin; a per-service **agent breakdown** — ordering, agent-to-agent, dispatcher —
that opens onto each worker's own requests, tokens, cost and last calls; and a
**live activity** list reading *Ordering → claude-opus-5 → 1,240 tokens →
$0.0042 → Success*, where any row opens the task drawer on the run it belongs
to. Today / 7 days / 30 days / a custom range scopes all of it. Closed by
default, closes on `Esc`, on the scrim, or on the ×.

It is an **estimate**, and it says so on every surface that shows a figure. No
service on this floor reports token usage — not on a stream, not in a health
payload — so the drawer counts the text it has actually watched go past (four
characters to the token) and prices it from a table of published rates keyed by
model id. System prompts, tool schemas and the history a model is re-sent every
turn never reach this page, so the real invoice is **larger**, usually by a wide
margin. It is built to compare agents and catch a runaway, not to reconcile a
bill, and the drawer's last section spells that out in full. The budget is your
own number, kept in this browser; nothing enforces it. The in-house courier never
appears — it runs no model.

**How work moves.** A diagram of the floor with live counts on it: what is
waiting to be judged, what is on the dispatcher's desk, what is on the road, what
arrived and what did not. Nodes tint with their state and edges crawl where work
is actually crossing.

**Who is holding what.** Every job with the name of whoever it is waiting on —
derived from `status` *and* `awaiting` together, because neither says it alone.
An accepted job is the dispatcher's while it hunts for a rider and **yours** the
moment it starts waiting to be asked for one. Those rows are marked, and *Only
what needs me* filters down to them.

**What is being done, right now.** The dispatcher's tool calls and its own
sentences, across up to four live jobs at once.

**How it is going.** Arrivals per bucket, how far each job got, where the time
goes, and how the settled ones ended — all read from the delivery board's
timelines. One time range at the top scopes every number below it, and every
chart has a table twin.

### What it will not do

- **It never writes.** Every call it makes is a `GET` (plus the read-only event
  streams). An overview that could also press buttons would become a fifth place
  an order's state can change, and this floor has enough of those.
- **It does not invent history.** Neither ordering service publishes a list of
  its runs, so the page can say whether one is running but not how many have run.
  Those two agents report *no queue published* rather than a made-up zero.
- **The activity strips are its own record.** No agent here tracks its own
  busyness, so each strip is what this page has watched since it was opened,
  sampled once per poll. Reload and they start empty — which is why the stretch
  before you arrived is drawn as nothing rather than as idle time.
- **It does not invent a bill.** Nothing reports token usage, so the usage drawer
  estimates from text it has seen and labels every figure as an estimate — rather
  than printing a confident number nobody can trace. A model with no published
  rate in the table is counted in tokens and left out of the money, because an
  unpriced model is a missing rate and not a free one.
- **It does not invent a conversation.** See below. With no console open, the two
  ordering agents are silent on this screen and the panel says so, rather than
  drawing you a plausible negotiation that never happened.

### Where the conversation comes from

The delivery dispatcher on 8103 publishes a per-job event stream anyone may
subscribe to, so the dashboard reads it directly. The other two do not: the
errand server on 8100 and the A2A desk on 8101 stream a run **only to whoever
started it**, keyed by a run id that is handed back from the `POST` and never
listed anywhere. A page that starts nothing therefore cannot hear them.

Rather than add an endpoint or fake the content, the consoles that *do* receive
those streams re-broadcast what they were told onto a shared bus — a
`BroadcastChannel` for tabs that are open now, plus a `localStorage` ring of the
last 400 events so a dashboard opened mid-run still has the first half of it.
`src/shared/agentBus.ts` is the whole of it; `src/hooks/runBus.ts` and
`src/a2a/negotiationBus.ts` are the two taps, and both are pure forwarders sitting
on events that have already arrived from a real `EventSource`.

What that buys, and what it costs:

- the dashboard shows the genuine execution flow — every message, tool call,
  quote, payment and handover, with real timestamps and real direction;
- nothing in the ordering logic changed to make it work: the taps are called
  beside the existing fold, never inside a `setState` updater;
- and the two ordering agents only appear here while one of their consoles is
  open somewhere. That is a real limit and it is stated on the panel itself.

A collapsible panel at the bottom of the page names the endpoint behind every
number on it, so none of this has to be taken on trust.

**On the colours.** The charts use a *status* palette, not a categorical one:
amber is work in progress, green is arrived, red is not, grey is nothing
happening — the same four meanings the delivery board's pills carry. Measured
against the categorical checks those four collapse (amber↔red sit at ΔE 1.4 under
deuteranopia on the light scheme), which is expected of status colour and is
exactly why every mark here carries a glyph and a word beside it, and why the
activity strips encode state as height first and colour second. Nothing on the
page is distinguished by hue alone.

---

## How it talks to the agent

Starting a run and following it are two separate calls:

```
POST /api/agent/runs        → { runId }
GET  /api/agent/runs/:id/events   (Server-Sent Events)
```

Two rather than one because `EventSource` can only GET — and the split earns
something: the server records every event, so re-opening the stream replays the
run from the beginning instead of dropping you into the middle of it.

The agent streams three interleaved things — which tool it is calling, how that
call turned out, and what it is saying. [`useAgentRun`](src/hooks/useAgentRun.ts)
folds those into the two shapes the page renders.

Coupons are read through the agent server too (`GET /api/agent/coupons`) rather
than from the Friends Kitchen API directly. Friends Kitchen only allows its own origin, and
forwarding one read from the agent — which already knows the restaurant's
address — is a smaller change than widening Friends Kitchen's CORS for a second app.
That read returns every status Friends Kitchen computes — `unused`,
`partially_redeemed`, `fully_redeemed`, `expired`, `cancelled` — and the picker
decides which of them can be selected.

---

## Layout

```
src/
  App.tsx                  The shell: header, status strip, the two columns
  styles.css               The page shell, panels, and the custom controls
  theme.ts                 The palette: brand hexes, both schemes, antd tokens
  types.ts                 Wire types for the agent server
  toolLabels.ts            Tool names → what an operator would call them
  shared/
    agentBus.ts            The cross-tab event log the dashboard listens on
  hooks/
    useAgentRun.ts         One errand's worth of state, fed by SSE
    runBus.ts              That run, mirrored onto the bus — forwarding only
    useUserLocation.ts     Where the customer is — permission, refusal, fallback
    useColorScheme.ts      Light or dark, remembered
  services/
    agentApi.ts            Start, follow, cancel
    couponApi.ts           The coupon picker's options
  a2a/                     The A2A console — /a2a.html
    negotiationBus.ts      The buyer/merchant turns, mirrored onto the bus
  components/
    Panel.tsx              The surface every section sits on
    ServiceStatus.tsx      What is and is not ready
    ErrandForm.tsx         The errand and the money
    DeliveryField.tsx      Where it goes, and how that was found out
    RunTrace.tsx           Timeline of steps
    DeliveryTrack.tsx      The route, and how far along the courier is
    RunReport.tsx          The agent's report and what it spent
  dashboard/               The operations board — /dashboard.html
    App.tsx                The page: toolbar, figures, diagram, roster, feed
    api.ts                 All four services, read-only
    derive.ts              Every number on the page, as pure functions
    useFleet.ts            The poll, and the state history it keeps itself
    useLiveFeed.ts         Several jobs' streams at once
    monitor.ts             Bus + feed in one shape, and what is derived from it
    ops.ts                 Handovers, paired calls, task stages, one filter model
    useMonitor.ts          The control centre's live wire
    usage.ts               Token and cost estimates, priced per model — read it first
    useUsage.ts            The range picker, and the numbers the chip and drawer share
    dashboard.css          The chart palette and this page's own components
    monitor.css            The control centre's own rules
    ops.css                Metrics, filters, handovers, lifecycle, drawer
    usage.css              The usage chip, the billing drawer, one categorical pair
    components/
      KpiRow.tsx           The headline numbers, hero first
      Pipeline.tsx         The floor as a diagram, with live counts
      AgentRoster.tsx      Five agents, each with an activity strip
      AssignmentTable.tsx  Every job and whose hands it is in
      LiveFeed.tsx         What the agents are saying, across jobs
      Charts.tsx           Columns, bars, sparkline, meter, table twin
      monitor/
        ControlCenter.tsx  The split screen, and what picks the run on it
        FlowRibbon.tsx     The route one request took, live hop lit
        AgentRail.tsx      Each party: reachable, and what it is doing
        ConversationView.tsx  The negotiation, in two lanes
        EventLog.tsx       Every event, filtered, searchable, expandable
        CommandBar.tsx     One search and four filters, above every tab
        HandoverBoard.tsx  Where work changed hands, and who picked it up
        Lifecycle.tsx      One task's stages, with the events behind each
        TechLog.tsx        Calls paired with answers, payloads and timings
        TaskDrawer.tsx     One task opened right up — the page's deep view
        UsageChip.tsx      The whole of billing on the board: one chip, one door
        UsageDrawer.tsx    Tokens, cost, budget, per-agent spend, live calls
        UsageCharts.tsx    The drawer's three figures and its two bars
```

**Location never leaves this app as a claim.** The browser gives coordinates and
the operator gives a name; both go to the agent server, which validates them and
decides which branch serves them. Nothing here works out a branch, a distance or
an address — those come back from the server, so the panel and the courier
cannot disagree about where the customer is.

**No keys here either.** The courier's credentials live in the agent server's
`.env`, and this app only ever learns *whether* delivery is configured. That is
the one field the health endpoint exposes about it.

`theme.ts` copies its brand hexes from `friends-kitchen-frontend/tailwind.config.js`. The
two apps cannot share a config, so if a colour moves there, move it here too.

Everything else in the palette is scheme-dependent and reaches the page three
ways from that one file: real values for antd's own components, custom
properties on `<html>` for `styles.css`, and the same properties as strings for
inline styles. A colour therefore cannot be right in the stylesheet and wrong in
a component.

**Light and dark.** The toggle sits in the header and remembers what you picked;
the first visit follows the OS. A small script in `index.html` paints the
background before React loads, so a dark session never flashes white.

---

## Notes

- **The agent needs its own Anthropic API key**, set in `friends-kitchen-agent-backend/.env`. This
  app never sees it — it only reports whether the agent has one.
- **Runs are serialised.** The agent's wallet, cart and browser are one per
  process, so a second run waits for the first. The banner says when it is busy.
- **Stop** cancels the run, but anything already paid for stands. The panel says
  so rather than implying a clean rollback.
"# friends-kitchen-agent-frontend" 
"# friends-kitchen-agent-frontend" 
