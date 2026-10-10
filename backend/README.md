# Saurus backend

Minimal local Fastify API for an adaptive Spanish-learning prototype. It uses Gemini for structured adaptation/recall evaluation and Supabase for the demo learner's vocabulary memory.

## Requirements and setup

- Node.js 22+
- Existing Supabase tables `learner_profiles` and `vocabulary` with the columns described below
- At least one `learner_profiles` row whose `target_language` is `Spanish`

```bash
npm install
cp .env.example .env
# Fill in the existing server-side credentials, then:
npm test
npm start
```

The server listens only on `127.0.0.1:3000` by default. Keep `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` in `.env`; never expose them to extension code. Set `ALLOWED_ORIGINS` to the exact Chrome extension origin when it is known. Requests with no `Origin` (such as curl) are allowed; browser origins not on the list are rejected by CORS. The model-backed POST routes additionally reject non-loopback clients.

No migration is required. The backend uses only:

- `learner_profiles`: `id`, `target_language`, `cefr_level`, `created_at`
- `vocabulary`: `id`, `learner_id`, `word`, `translation`, `mastery_score`, `incorrect_recalls`, `correct_recalls`, `created_at`

For the hackathon, the oldest Spanish learner is the fixed demo learner. Authentication and public/multi-user access are deliberately out of scope.

## API examples

```bash
curl http://127.0.0.1:3000/health

curl http://127.0.0.1:3000/api/learner

curl -X POST http://127.0.0.1:3000/api/reading/adapt \
  -H 'content-type: application/json' \
  -d '{"articleText":"Aunque llueve, los estudiantes caminan a la biblioteca para estudiar juntos."}'

# Replace the UUID with the id returned by /api/learner.
curl -X POST http://127.0.0.1:3000/api/vocabulary/recall \
  -H 'content-type: application/json' \
  -d '{"learnerId":"11111111-1111-4111-8111-111111111111","word":"aunque","answer":"although"}'

curl http://127.0.0.1:3000/api/vocabulary/struggles
curl http://127.0.0.1:3000/api/learning/next-action
curl http://127.0.0.1:3000/api/learning/progress
```

## End-to-end demo flow

1. Adapt Article A.
2. Submit an incorrect recall. Gemini evaluates it; the server—not the client—updates recall counters and mastery.
3. Adapt Article B. Stored difficult vocabulary is included as bounded model context.
4. Submit a correct recall and inspect progress or the next action.

Mastery changes by `+15` for a correct recall and `-10` for an incorrect recall, clamped to 0–100. A word is learned at mastery 70+ with more correct than incorrect recalls. A word is struggling after at least one incorrect recall when it is below that learned threshold. Avatar stages are derived from learned-word count: `egg`, `hatchling` (3), `explorer` (10), and `language-saurus` (20).

## Tests

`npm test` uses Node's test runner with mocked Gemini and Supabase-style store services. It does not spend model tokens or modify the database. The existing `test-gemini.mjs`, `test-supabase.mjs`, `test-memory.mjs`, and `test-adaptive.mjs` remain available as manual live integration checks.
