# API test results (#41)

Output of the backend test suites (`node --test --test-reporter=spec`), for the slides.

| File | What ran | How to regenerate (from `backend/`) |
|---|---|---|
| `api-unit-integration-tests.txt` | 179 unit and integration tests; models and Overpass stubbed, no database needed | `node --test --test-reporter=spec` |
| `api-db-tests.txt` | 12 end-to-end tests against MongoDB 8.0 loaded with `db/schema.js` + `db/seed.js`: auth, profile, calories, search, recommendations, favorites | `TEST_MONGODB_URI=mongodb://localhost:27017 npm run test:db` (after loading schema and seed into that database) |

The database tests also run in CI on every backend PR (`backend-mongodb` job). Never point
`TEST_MONGODB_URI` at the production database: the tests write data (and put it back).
