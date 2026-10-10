# Saurus accounts: deployment and test guide

## What is implemented

The toolbar popup provides welcome, signup, login, email-confirmation guidance,
four-language onboarding, launch, and explicit sign-out. Existing dinosaur art
is reused; onboarding starts at age 1, and the existing ages 1–4 and shortcuts
remain available. Returning accounts launch the tutor without an auth form.
To manage an account or sign out, right-click the extension icon → **Options**.

Only the MV3 background worker instantiates Supabase Auth. The locally bundled
Supabase JS SDK (2.117.3, copied from the existing backend dependency) uses an
async `chrome.storage.local` adapter with `persistSession` and automatic refresh.
Storage is restricted to `TRUSTED_CONTEXTS` before the client initializes.
Chrome alarms and request-time session checks handle worker wake-up and expiry.
Popup/content messages return sanitized user/profile data, never tokens.
Credentials are sent only from the extension popup; there is no webpage message
bridge. Session storage is specific to the installed extension and Chrome profile.
Keep the same unpacked extension path/ID when testing; removing the extension or
clearing its storage removes the local session.

Authenticated Gemini memory calls use a worker-owned JWT client and a single
`SECURITY INVOKER` RPC. `auth.uid()` determines ownership; a caller cannot select
another learner. Four new tables store profile/preferences, per-language age,
vocabulary mastery, and answer history. Adaptive recommendations are derived
from those words. Selected language and dinosaur corner are cloud preferences.
Existing shared demo data is preserved but is not assigned to new accounts.

Account-specific profile/memory caches support temporary memory-service outages.
Failed writes display an error and do **not** falsely report success. There is
currently no offline write queue: retry practice when online. An expired token
that cannot refresh while offline can temporarily prevent opening the tutor;
the saved session is retained, and reconnecting allows recovery.

The existing optional Fastify server has a fixed demo learner. Its demo practice
path remains available for standalone use, but authenticated extension sessions
do not send learning data to that shared identity. Gemini Live and translation
continue through the existing Edge Function. Its pre-existing publishable-key
gate is unchanged; tightening model endpoint billing/access requires a separate
authenticated WebSocket design. No private Gemini or Supabase service key is
bundled in the extension.

## Required deployment (not performed)

1. Review `supabase/migrations/20261010200000_saurus_accounts.sql`. It adds four
   tables with RLS, ownership policies, and an authenticated memory RPC. It also
   revokes the legacy anonymous/shared-learner RPC grants. Old standalone shared
   demo clients will no longer have cloud memory after this change. Approve this
   migration before running it in the shared project. No shared records are
   deleted or copied.
2. After approval, apply the migrations in order through the Supabase SQL Editor
   (or your normal migration deployment). The first two existing migrations must
   already be applied before the new account migration. Do not rerun an already
   applied account migration; table creation is intentionally not a reset.
3. In Supabase Authentication, enable email/password signups. Choose whether
   confirmation emails are required. With confirmation enabled, users follow the
   email link and then return to the extension to log in. Configure the Auth Site
   URL to a working destination; no tokens are consumed from a webpage redirect.
   Use working SMTP for the presentation. Duplicate signup responses may be
   deliberately generic because Supabase protects account enumeration.
4. Configure a minimum 8-character password policy to match the UI. Avoid short
   inactivity/time-box limits if you want long-lived sessions; revoked sessions
   still require login. Keep refresh-token rotation enabled.
5. `supabase-config.js` contains only the project URL and public publishable key.
   If changing projects, update the exact project host in `manifest.json` too.
   Keep all private keys in server/Edge Function secrets.
6. Open `chrome://extensions`, enable Developer mode, load this repository (or
   reload the existing unpacked extension), and refresh the target webpage.
   The extension needs access to the configured Supabase host. Fastify is not
   required for this authenticated flow.
7. Click the toolbar dinosaur/Saurus icon, create an account, confirm email if
   requested, and choose a language. Choose **Launch Saurus** on a normal webpage.
   Chrome internal pages cannot run content scripts. Use **Option+S / Alt+S** to
   show/hide the dinosaur afterward.

## Tests performed

`npm run test:all` runs the extension contracts/auth tests and backend suite.
Auth tests use the real Supabase SDK and mocked HTTP responses. They cover signup
with/without verification, persistent adapter storage, worker recreation, expiry
refresh, temporary memory outages, stale-account write rejection, and logout.

Two optional browser scripts use Playwright:

```sh
SAURUS_PLAYWRIGHT=/absolute/path/to/playwright node test/popup-browser.cjs
SAURUS_PLAYWRIGHT=/absolute/path/to/playwright node test/extension-browser.cjs
```

The popup script uses installed Chrome and mock auth. It checks validation,
password visibility, signup, language choice, and confirmation screens. The
extension script uses Playwright Chromium, a fresh temporary profile, the actual
MV3 worker and Chrome storage, and a localhost mock Supabase service. It verifies
browser close/relaunch persistence, expired-token refresh, forced service-worker
suspension/wake-up, and logout. It never contacts the configured shared project.
Temporary browser profiles are retained under the OS temporary directory.

The SQL migrations were executed on isolated local PostgreSQL 16 with a minimal
Auth schema. `test/accounts-rls.sql` verifies cross-account read/write denial,
forged identity rejection, persisted age/mistakes/history, repeated-onboarding
safety, and denial of anonymous/legacy memory calls. The production project's
actual schema/policies were **not** queried or modified. Supabase PostgreSQL 17
deployment still needs validation in the target environment.

## Live acceptance checklist (still to perform after deployment)

1. Create account A. Confirm its email if enabled. Choose Spanish and launch.
   Verify translation, word explanations, live microphone/audio, and Alt+S.
2. Use Alt+1/2/3/4 to switch French/German/Spanish/Swedish. Use Alt+Up/Down for
   ages 1–4. Make a vocabulary mistake and then answer correctly. Move the dino.
3. Hide/reopen the dinosaur, close/reopen the popup and tab, and open a second
   website. Check language, age, corner, and adaptive recall are restored.
4. Fully quit Chrome and reopen it, then repeat after a laptop restart. No login
   or onboarding should be requested. This has not been tested on your live
   account or after a physical laptop restart.
5. Stop the service worker in extension developer tools; reopen Saurus. Repeat
   after the access token naturally expires. Never copy/log refresh tokens.
6. Disconnect the network. Confirm existing data/session are not erased, and a
   friendly retry error appears for unavailable operations. Reconnect and retry.
7. Right-click extension → Options → Sign out. Verify active tutors close. Sign
   in as account B; account A's words, language and age must not appear. Sign back
   in as A and verify recovery. Run equivalent RLS checks with two real test users
   in a non-production test project before declaring production isolation tested.
8. Install on another Chrome profile/computer. Log into A once. Verify the same
   cloud language, age, vocabulary and preferences, without onboarding again.

Live signup/mail delivery, two real accounts, a second computer, real Gemini
voice/translation after deployment, and physical laptop restart remain unverified.

References: [Supabase custom Auth storage](https://supabase.com/docs/reference/javascript/auth),
[Supabase session lifetime](https://supabase.com/docs/guides/auth/sessions),
[Chrome storage access levels](https://developer.chrome.com/docs/extensions/reference/api/storage).
