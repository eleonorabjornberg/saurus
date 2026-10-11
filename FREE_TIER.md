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
   is used up, and records usage.

Voice closes with code 4001 (no valid pass) or 4002 (limit reached). Text
returns 401 or 429. Saurus explains either in its speech bubble.

## Deploy, in this order

1. Run the migration (Dashboard > SQL Editor, or `supabase db push`).
2. Reload the extension from this branch and sign in.
3. Deploy the function: `supabase functions deploy gemini --no-verify-jwt`.
4. Test on a real account: talk, translate a page, then lower a limit in
   `saurus_limits()` to check the refusal messages.

Rollback without redeploying: set the function secret `SAURUS_OPEN=1`.

## Known gaps

- The hosted demo page and the bookmarklet have no sign-in, so they now run
  on the offline mock. They need a web sign-in to use the live tutor.
- Usage is estimated from message sizes, not billed tokens.
