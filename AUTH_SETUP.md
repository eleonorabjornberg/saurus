# Saurus accounts

Account sign-in is by Mahdi Yusuf. In the Chrome extension, Saurus asks you
to sign in first. The public demo page (`demo.html`, GitHub Pages, phones) has
no sign-in and keeps the anonymous per-browser memory.

## How it works

- **Sign in:** click the Saurus icon in Chrome's toolbar. The popup lets you
  create an account (email and password) or log in, then pick a language.
  Pressing ⌥S / Alt+S while signed out opens that popup instead of Saurus. To
  sign out or switch accounts, right-click the icon → **Options**.
- **Only the background worker holds the session.** `background.js` runs
  Supabase Auth (the bundled `vendor/supabase.js`, MIT) through
  `auth-service.js`. The popup and content scripts (`auth-bridge.js`) only
  ever receive user and profile data, never tokens. Logging in, signing up and
  signing out are only accepted from the popup.
- **Your own memory.** Signed in, level per language, struggle words, answer
  history, session summaries and your language go to your account through one
  function, `saurus_account_memory`. It runs as you (`SECURITY INVOKER`) and
  RLS limits every table to `auth.uid()`, so nobody can read or write another
  user's data. Your progress follows you to any computer where you sign in.
- **Gemini** still goes through the `gemini` Edge Function. Signing in doesn't
  change it.

## Setup (Supabase dashboard)

1. **SQL Editor:** run `supabase/migrations/20261010220000_saurus_accounts.sql`.
   It creates the account tables, policies and function, adds Hindi, and
   re-grants the demo page's anonymous functions (an earlier version of the
   account migration revoked them, which caused "permission denied for
   function saurus_memory"). Safe to re-run.
2. **Authentication → Sign In / Providers:** Email enabled, "Allow new users
   to sign up" on. For a live demo, turn **Confirm email** off so new accounts
   can log in immediately; with it on, people must click the link in the
   confirmation email first.
3. Reload the extension in `chrome://extensions` and click the Saurus icon.

## Tables

| Table | What |
|---|---|
| `saurus_accounts` | language, onboarded, preferences (corner) |
| `saurus_account_progress` | level 1–4 per language |
| `saurus_account_words` | words with misses, correct answers and mastery |
| `saurus_account_history` | every answer |
| `saurus_account_sessions` | session summaries for the handoff |

The anonymous `saurus_*` tables stay for the demo page.
