# Gacha original UI in a public browser

The default entry mounts the original `App`, `ModalProvider`, motion configuration and error boundary. Its home, character selection, result, conversation and navigation components are reused. `public` contains 368 original image/font/icon files and the Pretendard OFL license; private keys and certificates are excluded.

## Local development

Use Node.js 24 or newer:

```sh
npm ci --ignore-scripts
npm run dev
```

The interface defaults to public browser mode. Vite proxies `/api` to `http://127.0.0.1:8787`; a matching API must be running to generate answers. Vercel development is another option. The frontend alone never produces a sample answer as a substitute for a failed provider call.

## Production setup

Deploy this `frontend` directory, not only `dist`. `vercel.json` forwards the original `/api/v2` and `/api/v3` contracts to `api/runtime.js` and supports original deep links. Keep these credentials on the server:

| Variable | Value |
| --- | --- |
| VERTEX_PROJECT_ID | Your authorized GCP project |
| VERTEX_LOCATION | global |
| VERTEX_MODEL | gemini-3.5-flash-lite |
| VERTEX_SERVICE_ACCOUNT_JSON | Dedicated inference account JSON, sensitive server variable |

`VITE_PUBLIC_BROWSER=true` explicitly selects the default browser behavior. Only an authorized native setup should set it to `false` and supply its original integration configuration. Firebase initialization, Toss tokens and native callbacks are disabled in browser mode. A browser session never claims to be a Toss login.

## Supported browser behavior

- Original home, character grids, selection, result screens and bottom navigation.
- Real Vertex advice, structured fortunes and conversations using the original API response shapes.
- Browser-only history and saved chat reopening. This history is not customer Firestore data.
- Empty ranking state with no fabricated participants, scores or personal rank.
- Keyboard activation for original interactive cards.

Native login, ads, payouts, paid tickets, account operations and real reward APIs are unavailable. The web-mode notice and existing gate/error UI explain this boundary. Provider failures display errors instead of static sample results.

## Limits and checks

Input is validated at the server, including persona allowlists and request sizes. Quotes accept 1–200 characters; chat messages accept 1–500 with at most 12 bounded prior messages. The client sends at most 8 prior messages. Vertex uses MINIMAL thinking and at most 768 output tokens with a 25-second timeout.

Requests are capped per warm function instance at 10 per IP per hour, 100 total per hour and 4 concurrent generations. These counters reset with instances and are not a hard monthly spending cap.

```sh
npm run test
npm run typecheck
npm run build
```

Unit tests use generated test RSA keys and mocked provider responses. Live model and public browser checks are separate. The existing dependency tree has 104 npm audit findings, including 5 critical; this change does not claim to resolve them.
