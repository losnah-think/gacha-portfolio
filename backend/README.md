# Backend source snapshot

Node.js 22 / ES modules, Express, Firebase Admin and Gemini. This is an application-source portfolio snapshot, not a ready-to-deploy service. Existing routes show content generation, user state, commerce, rewards and recommendation logic.

## Offline review

```sh
npm test
npm run check
```

Both commands use Node's built-in tools. They do not install dependencies, import the server, open a port, run scheduled jobs or contact Firebase, Toss or Gemini. The tests cover pure nickname and persona-visibility helpers; the source check parses JavaScript and checks relative import paths.

## Integration requirements

A complete application run requires your own isolated Firebase project or emulators, Firestore documents/Storage assets, Firebase authentication setup, Gemini API key and Apps in Toss partner configuration. None of the original records, images, service accounts, certificates or deployed settings are included. Copy `.env.example` to an ignored `.env` only when preparing your own integration. The placeholder project name is not an included emulator setup.

The app's dependencies are recorded in `package-lock.json`; `npm ci` is the intended install command. After your own integration is configured, `npm start` explicitly starts a listener bound to `127.0.0.1`. Requests can write to the configured database and invoke configured AI/payment providers. The full runtime and authenticated flows have not been tested in this snapshot.

`TOSS_API_BASE_URL`, client credentials, certificate/key paths or secret-injected PEM values, and decryption settings must come from your own integration. Promotion identifiers are configured with the `TOSS_PROMO_*` environment variables in `src/config/promotion.js`. Product and ad identifiers are examples; replace their mappings when integrating your own products. Legacy CSV generation additionally requires an explicitly selected `CONTENT_SEED_CSV_PATH`; no content seed is distributed.

Operations/admin routes, cron schedules, scheduled Cloud Function exports, automatic preload, deployment configuration, operational scripts, original tests/fixtures, private content/data, logs and Git history are excluded. Syntax and pure-function checks do not establish production security or payment correctness. All source retains its original application structure except targeted publication sanitization and the removal of excluded entry points.

No open-source license grant is provided (`UNLICENSED`).
