# Gacha browser app and source snapshot

The default page runs a standalone concern-selection, character-selection, AI advice-card and saved-history flow. It requests new answers through `/api/advice`, a server-only Google Cloud Vertex AI adapter. There is no fixed-sample fallback. It does not connect to native login, ads, payments, real rewards, analytics or original production customer data. The original integrated application runtime is loaded only when explicitly enabled.

## Local commands

Use Node.js 24 or newer and npm.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run dev
```

The Vite server binds to `127.0.0.1` and serves the UI. `npm run preview` serves the built frontend locally; neither command creates a Vertex API server. `npm run typecheck` runs strict TypeScript checks separately from the Vite build. Use Vercel development for the API or deploy from this `frontend` directory with `vercel.json`, which builds `dist` and includes `api/advice.js`. Leave `VITE_ENABLE_RUNTIME` unset.

The browser files are in `src/portfolio`. Original `Button`, `Card`, `HistoryContentCard`, character/situation data, result-history types and reading-size limits are reused. The Vertex API adapter and this standalone browser flow were added on 2026-10-10. Saving stores input and the generated answer in this browser only, with a limit of 10 entries. Saved entries can be reopened or deleted. Invalid stored data is reported and retained until the reviewer explicitly resets the collection. The new storage key is `gacha_portfolio_ai_results_v1`; earlier fixed examples are not imported as AI results.

## Vertex server configuration

Set these on the Vercel server, without a `VITE_` prefix:

- `VERTEX_PROJECT_ID`: a project authorized to use Vertex AI, with its API and billing enabled.
- `VERTEX_LOCATION=global`.
- `VERTEX_MODEL=gemini-3.5-flash-lite`, the explicitly selected model. The server has no fallback model.
- `VERTEX_SERVICE_ACCOUNT_JSON`: a service-account JSON with `project_id`, `client_email` and `private_key`, permitted to invoke Vertex AI in the target project. Never commit this value, log it, expose it to the browser or place it in a `VITE_` variable.

The server exchanges a signed service-account assertion for a short-lived OAuth access token, then calls Vertex REST `generateContent`. It returns only the validated advice and public result metadata. No request bodies, provider diagnostics, account emails, tokens or private keys are logged or returned. Missing configuration produces 503; provider failure produces a Korean error, never a sample answer.

The API accepts only same-origin JSON POST requests up to 3KB, one of the three offered characters, and a trimmed concern of 1~200 UTF-16 code units. Generation uses `maxOutputTokens: 768`, `thinkingLevel: MINIMAL` and a 25-second combined authentication/generation timeout. Only completed Korean answers of up to 250 UTF-16 code units are returned. Blocked, empty, oversized or truncated output produces an error; it is not silently clipped.

Public-compute limits are **best effort per warm server instance**: 10 accepted requests per IP per hour, 100 total per hour and four concurrent requests. Instance restart or multiple instances reset/multiply those limits. They are not a hard spending cap; use provider project quotas and hosting controls for stronger enforcement before increasing traffic. Browser inputs are transmitted to this server and Google Cloud only when the reviewer requests advice. The UI tells the reviewer this before submission; saving is a separate local-browser action.

Official references: [Vertex generation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference), [Gemini 3.5 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite), [service-account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account), [Vercel request headers](https://vercel.com/docs/headers/request-headers).

## Design and local verification, 2026-10-10

Design read: a mobile-first Gacha browser app for hiring reviewers, using the original blue/cream, hard-shadow button and reading-card language. ENERGY 2 / RHYTHM 1 / MOTION 1. Existing Korean system typography preserves the source's reading experience; a single narrow content column follows the original miniapp rather than introducing a marketing layout. The input card groups one choice, the reading card isolates the answer, and blue indicates the active view or primary action. Provider artwork is omitted; no new logo, avatar, marketing statistic or testimonial is introduced. Blue is darkened to make white button labels readable, while root dot decoration is removed to keep the focus on input and reading.

- R-02, R-17, R-18, R-23, R-36, R-38: added UI copy has no em dashes, metrics, testimonials or fictional production claims. AI answer attribution is shown only after a validated provider response. No omitted production artwork was added.
- R-03, R-25, R-32 PASS: Chrome was checked at 320, 768 and 1440 CSS pixels with no horizontal overflow. All controls were at least 44px high; the largest reading size (28px) reflowed at 320px. Tab showed a solid visible outline; Enter opened the example collection. White on primary blue measures 6.04:1; secondary text on white measures 7.11:1. Input borders and focus outlines meet non-text contrast.
- R-24, R-26, R-35: the initial browser shell was clicked through locally before the Vertex change. The updated network flow is covered by deterministic tests; public provider generation still requires a separate deployed browser check. The source link points to the public repository.
- R-27: empty saved history explains how to add an answer. Startup and generation have loading/failure text. The unit suite exercises corrupt stored history, failed writes and explicit reset; none reports a save before a successful local write or substitutes a fixture after provider failure.
- R-28, R-33, R-34 PASS: no FAQ or theme switch was introduced, and changes were made in source rather than runtime patch scripts.
- R-01, R-04, R-06, R-07, R-08, R-09, R-10, R-12, R-13, R-14, R-19, R-22, R-31, R-37 PASS: design decisions are stated above. No new gradient, illustration, glass, glow, decorative arrow or badge was introduced. The retained quote mark identifies the reading card; original hard shadows preserve the Gacha control motif. Motion is limited to existing press feedback.
- Liveliness and C-1 through C-5: the concern form and reading card are each the focal point of their screen. Spacing groups inputs and separates reading/actions. Original button shadows and reading typography retain product identity; navigation, loading, provider failure, storage failure and empty state are exercised by tests.
- R-05, R-11, R-15, R-16, R-20, R-21, R-29, R-30 PASS: the original narrow app flow and modest radii are retained. Action labels describe their effects; there is no new template landing page, buzzword marketing copy, dark theme or expanded palette.

Node.js 24.19.0 local checks: 43 tests (23 retained, 11 browser-adapter and 9 API tests), strict TypeScript checks, production frontend build, targeted TypeScript ESLint, server syntax check and `git diff --check` pass. Deterministic tests use explicitly stubbed provider responses and a generated test-only RSA key. They test real request/signature/validation/storage code, rather than proving live provider access. Live provider generation, a physical phone/on-screen keyboard and the former production service are separate checks.

## Optional runtime setup

Copy `.env.example` to `.env.local`, configure your own backend and Firebase web project, then set `VITE_ENABLE_RUNTIME=true`. The fallback backend is `http://127.0.0.1:8787`; it is not a running mock server. No original production URL or ad placement ID is supplied. Do not connect this snapshot to an existing production service for testing.

- Backend API routes and response shapes are represented by `src/shared/api/client.ts` and the feature services. The backend snapshot may also require missing private data or integrations.
- Firebase settings are public browser configuration only. Provider secrets, private keys, service-account credentials, AI API keys, token verification and mTLS belong on the backend; never add them to a `VITE_` variable.
- Native login, ad rendering, token revocation and reward fulfillment need your own provider integration. The browser callback-verification placeholder fails closed until replaced by trusted server verification.
- Portraits, promotional images, fonts and production content collections are omitted. Three imported SVGs were replaced with simple geometric placeholders. Image references in feature source document the original UI structure and may need licensed replacements.
- Weather lookups use public third-party APIs after the user requests location. Enabling the integrated runtime also enables its configured backend and Firebase paths; this snapshot is not an offline simulation.

## Scope and verification

The retained unit suite exercises point synchronization arithmetic using pure helper functions copied from the original implementation. New browser/API tests cover input boundaries, same-origin requests, OAuth signatures, configured Vertex requests, complete Korean response validation, loading, provider failures, limits, save/reload/reopen/delete, reading size, empty history, corrupted storage, failed writes, explicit reset and the 10-entry limit. These checks do not prove native authentication, rewards, billing or Firestore authorization. Original networked end-to-end tests, deployment scripts, provider certificates, data exports, local logs and Git history are excluded.

The original 2026-09-29 snapshot verification compiled both its disconnected page and explicitly enabled integration source and ran its 23 unit tests. That historical check did not run native login, production API, ads, rewards or Firestore operations. Current standalone-app checks are described above.

Dependency installation used `npm ci --ignore-scripts`. The build reports stale Browserslist data; dependency modernization and a complete application security review are outside this export. This snapshot does not claim to harden all original application logic or grant a new redistribution license.
