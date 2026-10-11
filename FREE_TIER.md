# Free tier: sign-in and daily limits

The `gemini` Edge Function now serves signed-in accounts only and counts
usage per account per UTC day.

| Limit | Default | Counted as |
|---|---|---|
| Conversation | 5 minutes of audio | seconds of audio in both directions; silence while reading is free |
| Page translations | 30 | each translation started, including a re-translation after a level or language change |
| Text requests | 300 | every text call (safety cap) |

Change the numbers in `saurus_limits()` in
`supabase/migrations/20261011030000_saurus_free_tier.sql` and re-run it.

## How it works

1. The extension's service worker calls `saurus_gemini_ticket()` as the
   signed-in user and gets a ten-minute pass. The session token never leaves
   the worker.
2. `backend-gemini.js` sends the pass with every call: `?ticket=` for voice,
   the `x-saurus-ticket` header for text.
3. The function resolves the pass to a user, refuses when the day's allowance
   is used up, and records usage. A pass is remembered for five seconds per
   function instance, so a page translated in several batches costs one
   lookup.
4. Voice must ask for audio replies only (`responseModalities: ["AUDIO"]`),
   because the allowance is counted in audio. Every 15 seconds of audio is
   recorded, and the answer says what is left across all of the user's
   sessions, so two tabs talking at once can't each spend the whole day.
5. A page counts once per address, language and level: the first translation
   request sends `x-saurus-page: 1`, the other batches don't.

Voice closes with code 4001 (no valid pass) or 4002 (limit reached). Text
returns 401 or 429. Saurus explains either in its speech bubble.

## Deploy, in this order

1. Run the migration (Dashboard > SQL Editor, or `supabase db push`).
2. Reload the extension from this branch and sign in.
3. Deploy the function: `supabase functions deploy gemini --no-verify-jwt`.
4. Test on a real account: talk, translate a page, then lower a limit in
   `saurus_limits()` to check the refusal messages.

Rollback without redeploying: set the function secret `SAURUS_OPEN=1`.

## Tests

`deno test --allow-net --allow-env supabase/functions/gemini/index_test.ts`
runs the function against local stand-ins for Supabase and Gemini.

## Known gaps

- The hosted demo page and the bookmarklet sign in with `web-account.js`
  (the same accounts as the extension). Without it they run on the offline
  mock.
- Usage is estimated from message sizes, not billed tokens.
- Limits are checked before a call and recorded after, so a burst of parallel
  text calls, or about 15 seconds per open voice session, can go slightly
  over the day's allowance.
