# Building the prod APK (EAS Build)

The capture app is distributed as a **sideloadable APK** (Huawei AppGallery / direct install),
NOT via the Play Store. GMS-free. Builds run on Expo's cloud (EAS) — no local Android SDK needed.

## One-time
1. A free Expo account. `npm i -g eas-cli` (or use `npx eas-cli`).
2. `eas login`.
3. `eas build:configure` if prompted (project is already wired; `eas.json` is committed).

## Prod Supabase env (bundled at build time)
`src/config.ts` reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. For cloud
builds, set them as EAS environment variables in the **production** environment (they end up in
the APK — the anon key is publishable, not secret; never put the service-role key here):

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL  --value https://YOUR-PROD-REF.supabase.co
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR-PROD-ANON-KEY
# repeat with --environment preview for QA builds against prod (or dev)
```

Confirm prod has what the app expects: the `BOCA_ALAMO_V2` formato with a **published** form
(v8) and the `CATALOGOS_PILOTO` catalogs populated + approved (see
`../Planning/supabase/PROD_ROLLOUT.md`).

## Build
```bash
# QA build (fast to share, internal distribution)
eas build -p android --profile preview

# Pilot release APK
eas build -p android --profile production
```
Both profiles produce an **APK** with `distribution: internal`. EAS returns a download URL;
sideload it onto the tablet (or publish to AppGallery).

Bump `app.json` `expo.version` + `android.versionCode` for each new release.

## Day-0 device smoke (required before field use)
On a real Huawei tablet, per `DEVICE_TESTING.md`: real email+password login, load the form,
capture a faena **offline**, GPS/map works, then **Sincronizar** → the faena appears in the
console/DB with correct kg→gr routing. The dev "Descartar" button is hidden in production builds.
