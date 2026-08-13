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

**Right — what happened.** A live timeline of every step the agent took, ticked
green or flagged red as each one lands, and then the agent's own report of how
it went with the money it actually spent.

Steps that move money are tagged in the timeline. That is deliberate: in a run
with a dozen tool calls, the one that spends is the one worth finding.

The errand stays put while the trace scrolls, because it is what you come back
to. On a narrow screen the two stack instead, errand first.

`Ctrl`/`⌘`+`Enter` in the order box sends the agent, for whoever is running a
dozen of these in a row.

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
  hooks/
    useAgentRun.ts         One errand's worth of state, fed by SSE
    useColorScheme.ts      Light or dark, remembered
  services/
    agentApi.ts            Start, follow, cancel
    couponApi.ts           The coupon picker's options
  components/
    Panel.tsx              The surface every section sits on
    ServiceStatus.tsx      What is and is not ready
    ErrandForm.tsx         The errand and the money
    RunTrace.tsx           Timeline of steps
    RunReport.tsx          The agent's report and what it spent
```

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
