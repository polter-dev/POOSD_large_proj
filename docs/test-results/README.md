# API test results (#41)

Output of the backend test suites (`node --test --test-reporter=spec`), with screenshots for the slides.
Captured 2026-11-11 with Node 26 and MongoDB 8.0.4 (production's major version).

| Screenshot | Text | What ran |
|---|---|---|
| [`api-db-tests.png`](api-db-tests.png) | [`api-db-tests.txt`](api-db-tests.txt) | 20 end-to-end tests against a real MongoDB loaded with `db/schema.js` + `db/seed.js`, nothing stubbed: auth, profile and calories, menu search, recommendations, favorites, meal logs, meal plans, submissions, admin review |
| [`api-unit-integration-tests.png`](api-unit-integration-tests.png) | [`api-unit-integration-tests.txt`](api-unit-integration-tests.txt) | 388 unit and integration tests (every endpoint, incl. auth and search) with the models, SendGrid, Overpass and Claude stubbed; no database needed. The screenshot shows the end of the run and the totals; the `.txt` has every test |

Both suites pass with 0 failures. The database tests also run in CI on every backend PR (`backend-mongodb` job,
against `mongo:7`).

## Regenerating

From `backend/`. The `sed` drops per-test timings and the API's own `[email]`/`[photo]` log lines, so reruns
diff cleanly:

```bash
CLEAN='/^\[(email|photo)\] /d; /^ℹ duration_ms /d; s/ \([0-9.]+ms\)//'
node --test --test-reporter=spec 2>&1 | sed -E "$CLEAN" > ../docs/test-results/api-unit-integration-tests.txt

# a throwaway local MongoDB, never production: the tests write data (and put it back)
SEED_ADMIN=1 mongosh "mongodb://localhost:27017" db/schema.js db/seed.js
TEST_MONGODB_URI=mongodb://localhost:27017 npm run test:db 2>&1 | sed -E "$CLEAN" > ../docs/test-results/api-db-tests.txt

node ../docs/test-results/render.js   # the .png files, with headless Chrome or Edge (set CHROME if not found)
```

Reseed before rerunning the database tests: the meal-log tests read janedoe's seeded "yesterday" and "today",
which are the days `seed.js` ran.
