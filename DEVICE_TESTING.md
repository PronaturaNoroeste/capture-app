# Device testing — M1 offline round-trip

Goal: prove on a real device that you can **capture a faena offline → reconnect → sync it
idempotently** to the dev Supabase. Order matters: get it running on the easiest target first,
then test offline, then the Huawei tablet.

## 0. Prerequisites (on your dev PC)

- Node 18+ and npm (you have them).
- The **Supabase anon key**: Supabase dashboard → your DEV project → Settings → API →
  Project URL + `anon` `public` key.
- A phone/tablet with **Expo Go** installed (Android: Play Store or, for Huawei, AppGallery /
  APK from expo.dev), on the **same Wi-Fi** as the PC.

## 1. Configure + install

```bash
cd D:/Victus/Documents/Servicio/capture-app
cp .env.example .env
#  edit .env:
#    EXPO_PUBLIC_SUPABASE_URL=https://<your-dev-ref>.supabase.co
#    EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
npm install            # first time; pulls Expo + RN (a few minutes)
npx expo start         # opens Metro; a QR code appears in the terminal
```

If `npm install` complains about versions, run `npx expo install --fix` then `npx expo start`.

## 2. First run — ONLINE (so it can cache catalogs + the form)

1. Open **Expo Go** on the device → scan the QR (Android: in-app scanner; same Wi-Fi).
2. The app shows "Descargando catálogos…/formulario…" then "Listo" and the **Boca del Álamo**
   form. (This first load needs internet; it caches everything locally.)
3. Sanity check: tap **"¿Qué fuiste a pescar?"** — autocomplete should list species, with
   **Huachinango / Pargo amarillo / Cabrilla / Jurel** as quick chips. Type "hua" → filters.

✅ Pass = the dynamic form rendered from the DB definition, catalogs searchable.

## 3. The core test — OFFLINE capture → sync

1. Put the device in **Airplane mode** (kill Wi-Fi + data). The app keeps working (it's cached).
2. Fill a faena:
   - Fecha (AAAA-MM-DD, e.g. today), Comunidad, Técnico, Capitán, **¿Qué fuiste a pescar?**
     (Huachinango), Sitio, Tiempo (e.g. 4.5), pescadores, gasolina.
   - **Arte de pesca = Piola** → confirm the Piola fields appear (Método, Número de piola,
     anzuelos) and Chinchorro/Trampa fields do NOT (branching works).
   - **¿Vas a monitorear tallas? = Sí** → the Talla section appears; add 2 tallas (especie +
     longitud + peso). (peso is captured in **kg**; it's stored as grams on sync.)
   - Add a captura (especie + kg). Optionally a gasto.
3. Tap **Guardar faena** → "✓ Faena guardada en el dispositivo", and the top bar shows
   **Sincronizar (1)**. ← it's queued in local SQLite, fully offline.
4. (Optional) capture a 2nd faena offline → counter shows **(2)**.
5. **Turn Airplane mode OFF.** Wait for Wi-Fi.
6. Tap **Sincronizar (n)** → status shows "Sync: n ok, 0 pendiente(s)" and the counter → 0.

✅ Pass = captured offline, synced on reconnect, counter reaches 0.

## 4. Verify in the database + idempotency

Tell me when you've synced — I'll run a read-only check on the dev DB to confirm the faena
graph landed (faena + capturas + the 2 tallas with peso in **grams**), and that a second
**Sincronizar** tap inserts **0 duplicates** (idempotency). You can also force it: tap
Sincronizar again with 0 pending — nothing should change in the DB.

(If you want to self-check: Supabase dashboard → Table editor → `faena`, filter
`created_by = huawei-pilot-01`.)

## 5. Huawei tablet (the GMS-free target)

Repeat steps 2–3 on the Huawei tablet:
- Install **Expo Go** from **AppGallery** (or sideload the APK from expo.dev).
- Same Wi-Fi, scan the QR. Everything above should behave identically.
- This run validates the **GMS-free** path (no Google Play Services). Map/photo fields are
  stubbed in M1, so nothing here needs Google libraries yet.

✅ Pass = the full offline→sync flow works on the Huawei tablet.

## What to report back to me

For each step, just say what you saw (or paste any red error screen text). Most useful:
- Did first load reach "Listo" and render the form? (step 2)
- Did Piola branching + tallas section behave? (step 3)
- Did Sincronizar drive the counter to 0? (step 3.6)
- Any red Metro/JS error — copy the top 2–3 lines.

I'll fix issues as they come and re-verify the DB side.

## Common snags (and fixes)

| Symptom | Likely cause / fix |
|--------|--------------------|
| QR won't connect | Device + PC not on same Wi-Fi; try `npx expo start --tunnel` |
| Stuck on "Iniciando…/Descargando" then Error | Wrong URL/anon key in `.env`; or no internet on first load |
| "No hay formulario publicado" | The seeded form isn't on the project `.env` points to — confirm it's the DEV project |
| Sync says "fail" | Offline still, or anon key wrong; check the error text |
| `npm install` peer errors | `npx expo install --fix` |

## Prod testing & cleaning up test data

Prod holds real historical data, so keep test captures separable and purge them afterwards.

**Rule:** for any test against the **prod** APK, log in as a test account — **`Test`** or
**`Test_07072026`**. Both are linked to a dedicated `cat_tecnico` **"PRUEBAS — no usar en campo"**
(`95ab1dd0-0661-4961-b7bc-ff0a1b640875`), so every faena they capture is tagged with that técnico and
never mixes with real field data. Do **not** test under a real técnico account.

**Clean up** (from `Planning/supabase`, prod DSN in `.env` as `PROD_DATABASE_URL`):
```bash
# preview (read-only) — lists the faenas + child rows that would be deleted
python scripts/purge_test_faenas.py --tecnico-id 95ab1dd0-0661-4961-b7bc-ff0a1b640875
# delete them (cascades captura/medicion/faena_arte/…)
python scripts/purge_test_faenas.py --tecnico-id 95ab1dd0-0661-4961-b7bc-ff0a1b640875 --apply
```
Single stray faena: `--faena-id <uuid>` (repeatable). The script previews by default, never prints
the DSN, and refuses to delete more than 50 faenas without `--force` — so a wrong id can't wipe
real history.
