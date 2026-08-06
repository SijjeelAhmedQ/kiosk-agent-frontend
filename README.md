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

It is a different product for a different person. The kiosk is a full-screen
touch flow for a customer standing at a panel; this is a desk tool for whoever
is sending the agent out. Keeping them apart means the customer's bundle never
carries the agent console, and this app can be deployed, restarted and demoed
without touching the till.

It also has no dependency on the kiosk's front end at all — only on the agent's
HTTP API. The kiosk can be rebuilt or replaced and this keeps working.

---

## What you need running

Three services, in this order:

| Service | Where | Port |
|---|---|---|
| Kiosk backend | `kiosk-backend` | 8000 |
| Agent server | `kiosk-agent` — `.venv\Scripts\python -m uvicorn server:app --port 8100` | 8100 |
| This app | `npm run dev` | 5174 |

For **browser mode** the kiosk front end (`kiosk-frontend`, port 5173) must be
running too — that is the website the agent drives.

The banner at the top of the page reports all of this. If something is missing
it says which thing and how to start it, rather than failing at the first click.

---

## The screen

**Left — the errand.** What to order, in plain language. A coupon picked from
the restaurant's own spendable coupons (or typed in). A cash limit for whatever
the coupon does not cover. And whether the agent should order through the API or
by driving the real website.

**Right — what happened.** A live timeline of every step the agent took, ticked
green or flagged red as each one lands, and then the agent's own report of how
it went with the money it actually spent.

Steps that move money are tagged in the timeline. That is deliberate: in a run
with a dozen tool calls, the one that spends is the one worth finding.

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
than from the kiosk API directly. The kiosk only allows its own origin, and
forwarding one read from the agent — which already knows the restaurant's
address — is a smaller change than widening the kiosk's CORS for a second app.

---

## Layout

```
src/
  App.tsx                  The shell: health banner, form, trace
  theme.ts                 antd in the Friends Kitchen palette
  types.ts                 Wire types for the agent server
  toolLabels.ts            Tool names → what an operator would call them
  hooks/useAgentRun.ts     One errand's worth of state, fed by SSE
  services/
    agentApi.ts            Start, follow, cancel
    couponApi.ts           The coupon picker's options
  components/
    ServiceStatus.tsx      What is and is not ready
    ErrandForm.tsx         The errand and the money
    RunTrace.tsx           Timeline of steps
    RunReport.tsx          The agent's report and what it spent
```

`theme.ts` copies its hexes from `kiosk-frontend/tailwind.config.js`. The two
apps cannot share a config, so if a colour moves there, move it here too.

---

## Notes

- **The agent needs its own Anthropic API key**, set in `kiosk-agent/.env`. This
  app never sees it — it only reports whether the agent has one.
- **Runs are serialised.** The agent's wallet, cart and browser are one per
  process, so a second run waits for the first. The banner says when it is busy.
- **Stop** cancels the run, but anything already paid for stands. The panel says
  so rather than implying a clean rollback.
"# kiosk-agent-frontend" 
