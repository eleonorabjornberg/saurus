# Morning report

All four tasks are done. Nothing was deployed, no real database was touched,
no secret was changed, and no pull request was merged.

| Task | Status | PR | Branch (based on) |
|---|---|---|---|
| 1. Review the free tier | Done | [#25](https://github.com/eleonorabjornberg/saurus/pull/25) | `free-tier-review` (`free-tier`) |
| 2. Sign-in on the web | Done | [#26](https://github.com/eleonorabjornberg/saurus/pull/26) | `web-signin` (`free-tier-review`) |
| 3. Three more languages | Done | [#27](https://github.com/eleonorabjornberg/saurus/pull/27) | `more-languages` (`web-signin`) |
| 4. Show the allowance | Done | [#28](https://github.com/eleonorabjornberg/saurus/pull/28) | `allowance-ui` (`more-languages`) |

The top branch, `allowance-ui`, contains everything. When you are happy with
the stack, the simplest way in is one PR from `allowance-ui` to `main`. You can
also merge #25 → #28 in order.

## Task 1: free-tier review (#25)

Fixed:
- **Function: parallel voice sessions.** Each connection checked the allowance
  only when it opened, so two tabs could each use the whole day.
  `saurus_usage_add` now returns what is left. Every 15-second flush updates
  the session's budget and closes with 4002 when the day is used up.
- **Function: text-only Live sessions were free.** Usage is counted in audio,
  so the setup must now ask for `responseModalities: ["AUDIO"]` (Saurus already
  does). Binary client frames are now counted too.
- **Function: wrong 429 message.** The message for the text-call cap said
  "page translations"; it now names the limit actually reached.
- **Function: speed.** The pass check is cached for 5 seconds per instance,
  with local usage subtracted.
- **Migration:** `saurus_usage_add` returns jsonb. It is dropped and recreated,
  so re-running over the earlier draft works. `saurus_limits()` is now `stable`
  instead of `immutable`, so an edited limit can't be stuck in a cached plan.
- **Client: page over-counting.** One page counted about 20 times (once per
  4–8-block batch). It now counts once per address, language and level.
- **Client: one shared pass request.** Parallel calls each fetched their own
  pass; they now share one.
- **Client: stale pass.** A 401 now fetches a new pass and retries once.
- **Client: refusal messages.** The function's own 401 and 429 messages are
  shown as written, not as "Gemini 429: …".

Checked and left as is:
- Close codes: Deno does allow server-side 1008 and 1011.
- Grants: `authenticated` gets only `saurus_gemini_ticket()`; the usage
  functions are service-role only.
- The pass needs `require()` to have run first, and the token stays in the
  worker.
- The `LIMIT` check in `reconnect()` is not dead code. I said it was in my
  earlier review, and that was wrong: a refused refresh or reconnect rejects
  with exactly that message.

Tests added: `supabase/functions/gemini/index_test.ts` (6 tests, run against
local stand-ins).

## Task 2: web sign-in (#26)

`web-account.js` provides the same `window.SaurusAccount` as `auth-bridge.js`
and runs `auth-service.js` in the page. The sign-in panel in Saurus's style
has:
- log in and sign up
- "check your email"
- the popup's first-language choice
- an account view with sign-out

It is a bottom sheet on phones. `demo.html` (with a new **Account** button) and
the bookmarklet load it.

## Task 3: languages (#27)

Italian, Brazilian Portuguese and Mandarin were already built, following
Hindi, and merged to `main` in #23. That covers every list, Alt+6/7/8, the
migration, Mandarin pinyin at levels 1–2, and Mandarin rather than Cantonese
for the voice. This PR merges `main` into the stack (two conflicts, both sides
kept), adds the 8 languages to the web onboarding, and brings in the real pet
art (also open as #24).

## Task 4: allowance (#28)

When it stays open (the account view, or a page where Saurus can't launch),
the extension popup shows "Left today: 4 min of conversation · 1 page
translation". The values come from `saurus_gemini_ticket()`. The line is hidden
when the free-tier migration isn't applied.

## Assumptions

1. Your "Done" reply to "caching the pass check … if you want speed" meant
   "do it", so I added the 5-second cache.
2. Task 3's spec (SVG costumes, "art is not ready") predates the work already
   on `main`. I merged that work rather than building it again. I also used the
   Nano Banana art, because you rejected drawn costumes and sent the sheets.
   Languages without a picture fall back to the plain Saurus.
3. PR bases follow the stack: #25 → `free-tier`, #26 → `free-tier-review`,
   #27 → `web-signin`, #28 → `more-languages`.
4. On the web, the session is saved in localStorage only on Saurus's own site
   (the demo page). On other sites (the bookmarklet) it lives in memory for
   that tab, so it's gone after a reload there, and nothing is left in the
   site's storage.
5. Signing out on the web reloads the page, which drops the running tutor.
6. Voice sessions must ask for audio replies only. Saurus already does.
7. The account panel uses an open shadow root, like Saurus's own widget. Since
   it runs in the page's world anyway, a closed root would add no protection.
8. Merging `main` brought in `main`'s own change to `config.js` (a comment
   listing the eight languages). I didn't edit `config.js`.

## Not tested, and how to test it

The sandbox can't reach Supabase, GitHub Pages or Gemini, so everything was
tested against local stand-ins and local Postgres. On the real project:

1. **Migration.** In the SQL Editor, run
   `supabase/migrations/20261011030000_saurus_free_tier.sql`, then run it
   again: the second run must also succeed. Check:
   `select public.saurus_limits();`
2. **Function tests** (needs Deno):
   `deno test --allow-net --allow-env supabase/functions/gemini/index_test.ts`
3. **Extension.**
   1. Reload the extension, sign in, open Saurus on an article and talk for a
      minute.
   2. Right-click the icon → Options. The popup should show the allowance going
      down: about 1 minute of conversation and 1 page per new page, language or
      level.
4. **Limits.**
   1. In `saurus_limits()` set `voice_seconds` to 30 and `pages` to 1, then
      re-run the migration.
   2. Talk until Saurus says "You've used today's free conversation time…".
   3. Open a second article, or change the level: you should see "You've used
      today's free page translations…".
   4. Open two tabs and talk in both at once: the second should be cut off
      within about 15 seconds of the first using the day up.
   5. Put the limits back.
5. **Web sign-in, laptop.**
   1. On the deployed demo page, click Try Saurus and create an account.
   2. With "Confirm email" on you should see "Check your email." Follow the
      link, come back and log in.
   3. Choose a language; Saurus opens.
   4. Reload: you're still signed in. Account → Sign out.
6. **Web sign-in, phone.** Do the same through the QR code on iPhone Safari and
   on Android Chrome. Check that the keyboard doesn't zoom the page and that
   the sheet can be scrolled.
7. **Bookmarklet.** On a news site, click the bookmarklet, sign in, and check
   that the page is translated. After a reload there, you should be asked to
   sign in again.
8. **Voice in the new languages.** Talk in Mandarin at level 1 and check for
   pinyin and Putonghua. Spot-check Italian and Portuguese.

## Deploy, in this order

1. **Database, SQL Editor:** run, in this order, whichever you haven't run yet:
   1. `20261010220000_saurus_accounts.sql`
   2. `20261011100000_saurus_more_languages.sql`
   3. `20261011030000_saurus_free_tier.sql`

   Each is safe to re-run.
2. **Authentication → URL Configuration:** set the Site URL to the demo page,
   so confirmation links land there.
3. **Merge to `main`.** GitHub Pages then serves the demo page and bookmarklet
   with sign-in. The current function ignores the pass, so this is safe before
   step 5.
4. **Reload the extension** from `main` in `chrome://extensions`.
5. **Deploy the function:** `supabase functions deploy gemini --no-verify-jwt`.
   From this moment, any client without a pass gets 401 or close code 4001.
   That includes an un-reloaded extension and an old demo page.
6. **Rollback** without redeploying: set the function secret `SAURUS_OPEN=1`.

## Worries

- **Bookmarklet passwords.** The password is typed into a panel inside someone
  else's website, and that site's scripts could read it. A safer design: the
  sign-in in an iframe served from Saurus's own origin, which hands the page
  only short-lived passes. That would be a separate change.
- **Page count is client-reported.** `x-saurus-page` comes from the client, so
  a modified client can skip the page count. The 300-calls-a-day cap still
  holds.
- **Pass in the URL.** Voice sends the pass in the WebSocket URL, so it may
  appear in function logs. It is a 10-minute bearer pass, never the session
  token.
- **Usage is estimated** from message sizes, not billed tokens. A burst can go
  slightly over a limit, up to about 15 seconds per open voice session.
- **Extension plus demo page.** With the extension installed, the demo page
  runs whichever Saurus loads first. The page's Account button always manages a
  separate web session, which may confuse.
- **Microphone after the voice limit.** When the voice limit ends a
  conversation, the extension's microphone may stay on until its 15-second
  idle release.
