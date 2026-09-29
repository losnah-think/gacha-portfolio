# Frontend source snapshot

Selected React/TypeScript application source for code review. This is not a complete service demo or a production deployment template. The default page stays disconnected and explains the integration boundary; the application runtime is loaded only when explicitly enabled.

## Local commands

Use Node.js 24 or newer and npm.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run dev
```

The development server binds to `127.0.0.1`. `npm run preview` serves the built snapshot locally. `npm run typecheck` runs the original strict TypeScript checks separately from the Vite build.

## Optional runtime setup

Copy `.env.example` to `.env.local`, configure your own backend and Firebase web project, then set `VITE_ENABLE_RUNTIME=true`. The fallback backend is `http://127.0.0.1:8787`; it is not a running mock server. No original production URL or ad placement ID is supplied. Do not connect this snapshot to an existing production service for testing.

- Backend API routes and response shapes are represented by `src/shared/api/client.ts` and the feature services. The backend snapshot may also require missing private data or integrations.
- Firebase settings are public browser configuration only. Provider secrets, private keys, service-account credentials, AI API keys, token verification and mTLS belong on the backend; never add them to a `VITE_` variable.
- Native login, ad rendering, token revocation and reward fulfillment need your own provider integration. The browser callback-verification placeholder fails closed until replaced by trusted server verification.
- Portraits, promotional images, fonts and production content collections are omitted. Three imported SVGs were replaced with simple geometric placeholders. Image references in feature source document the original UI structure and may need licensed replacements.
- Weather lookups use public third-party APIs after the user requests location. Enabling the integrated runtime also enables its configured backend and Firebase paths; this snapshot is not an offline simulation.

## Scope and verification

The retained unit suite exercises point synchronization arithmetic using pure helper functions copied from the original implementation. It does not prove production authentication, rewards, billing, Firestore authorization or the full UI flow. Original networked end-to-end tests, deployment scripts, provider certificates, data exports, local logs and Git history are excluded.

Verified with Node.js 24.19.0: the existing 23 unit tests pass, strict TypeScript checking passes, and both the disconnected default build and the explicitly enabled runtime build compile successfully. The latter was compiled only; no provider login, production API, ad, reward or Firestore operation was run.

Dependency installation used `npm ci --ignore-scripts`. The build reports stale Browserslist data; dependency modernization and a complete application security review are outside this export. This snapshot does not claim to harden all original application logic or grant a new redistribution license.
