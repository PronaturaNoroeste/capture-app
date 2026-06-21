# capture-app — Pronatura Noroeste fisheries field-capture

Offline-first **Expo / React Native** app that renders the admin-published form-definition,
captures a fishing trip (`faena → captura → medición …`) **offline**, and syncs it atomically
to Supabase via the `crear_faena_completa` RPC. **GMS-free** for Huawei tablets.

Design: `../Planning/AppDashboardSpec/` (07 plan, 08 form builder, 09 form). Backend:
`../Planning/supabase/`.

## Architecture (the offline round-trip)

```
published form-definition (formulario.definicion)  ─pull→  cached on device
        │
   renderer (src/ui)  ──collect answers──►  engine (visible_si / validation)
        │
   buildPayload (src/forms)  ──route core|child|custom|ui, kg→gr──►  RPC payload
        │
   outbox (src/sync, SQLite)  ──offline queue, retry──►  syncFaena → crear_faena_completa
```
All ids are **client-generated UUIDs**; the RPC is **idempotent**, so the outbox only needs
at-least-once delivery (re-sending after a crash never duplicates).

## Layout

```
src/forms/   types.ts · buildPayload.ts (answers→RPC payload) · engine.ts (visibility/validation)
src/sync/    outbox.ts (offline queue) · supabaseClient.ts (initSupabase, syncFaena)
src/db/      (todo) expo-sqlite OutboxStore + catalog mirror + autocomplete
src/catalog/ (todo) local catalog search/autocomplete
src/ui/      (todo) dynamic renderer screens (sections, repeating groups, map pin, photo)
test/        node --test unit tests (pure logic)
scripts/     build_payload_cli.mjs (bridge used by the backend integration check)
```

## Tests

Pure logic is unit-tested in Node (no device needed):
```bash
npm test          # node --experimental-strip-types --test test/*.test.mjs
```
Covers: payload routing (faena / child / singleton like especie_objetivo / custom / ui-dropped),
kg→gr transform, empty-instance dropping; the engine (branch-by-gear visibility, carnada-skip,
conditional-required, range validation, gated sections); the outbox (success, retry-on-failure,
no-duplicate-resend, re-enqueue).

**Proven end-to-end against the live dev DB** (in `../Planning/supabase`): the real published
form-definition → `buildPayload` → real `crear_faena_completa` → correct graph, kg→gr, idempotent
re-sync, cascade cleanup.

## Status (M1)

| Piece | State |
|-------|-------|
| Form types + payload mapper + engine | ✅ built + unit-tested |
| Outbox (queue/retry/idempotent) | ✅ built + unit-tested (in-memory store) |
| App→RPC contract | ✅ proven on dev DB |
| Supabase client + sync call | ✅ written |
| expo-sqlite OutboxStore + catalog mirror | ⏳ |
| Dynamic renderer UI (screens) | ⏳ |
| MapLibre pin + expo-location (GMS-free) | ⏳ |
| Auth (Supabase) | ⏳ (M2) |

## Device notes (GMS-free / Huawei)

- Maps: **MapLibre + OSM tiles** (pre-cache for offline) — NOT Google Maps SDK.
- Location: **expo-location** (OS GNSS) — NOT Google fused-location.
- Distribution: **APK sideload / Huawei AppGallery** — NOT Play Store. No FCM.
- A **Day-0 smoke test on a real Huawei tablet** is a plan prerequisite (Expo build + map + GPS).

## Setup (when building the UI)

```bash
npm install
cp .env.example .env   # set EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (dev project)
npm start
```
