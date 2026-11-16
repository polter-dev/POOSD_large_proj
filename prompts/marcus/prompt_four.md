## AI Assistance Disclosure

- **Tool**: Claude Fable 5.1 (Anthropic), accessed via Claude Code CLI, as
  orchestrator; implementer and reviewer subagents ran on Claude Opus 5.5
- **Dates**: November 1-5 and November 11, 2026
- **Scope**: The M6 API (meal plans #111, photo analysis #112, admin role
  #109, community submissions + auto-moderation #110), the Nearby/Overpass
  fallback and cache (#98, #99, #101) and the outage spec for MonklyS (#128),
  mobile Nearby and session fixes (#96, #102), the UML diagrams (#37, #97,
  #122, #138, #141, #146), contract and README updates (#95, #129, #136,
  #140, #144), the Android signing notes (#142), and reviews of every
  teammate PR that landed in the period (#92-#94, #104, #105, #124-#127,
  #130, #139, #143, #145, #147-#149, #152-#154, #159)
- **Use**: Code, test and docs generation through the orchestrated workflow.
  The orchestrator read GitHub issues, PRs and the codebase, planned the
  work, and prompted agents. Implementer agents wrote each change in its own
  git worktree and opened a PR into a session branch, which went to `main`
  as a rollup PR (#100, #103, #134, #137) approved by a teammate. Reviewer
  agents checked every PR (mine and teammates') against its issue and
  `docs/api-contract.md` by running the test suites and the app against a
  local seeded MongoDB; web and mobile screens were driven in a browser with
  screenshots. A reported bug had to be proven with a reproduction before an
  implementer was dispatched to fix it. Ponytail (YAGNI) rules applied to
  every change. The orchestrator posted the review evidence and merged
  teammates' PRs from my account once they were READY, or posted a
  request-changes review with the repro otherwise.

Everything the tool produced was reviewed by me before it reached the repo.
Teammate PRs were merged only after a reviewer agent's evidence was posted on
the PR; my own PRs reached `main` through rollup PRs approved by a teammate.

---

## Prompt

> Hello, you are the lead orchestrator, please read the agent notes to
> understand this role and tooling to use for our workflow. FOr this session
> I am trying to attempt and see what work can be done, for the code base
> thats labeled with me (polter-dev) on the github issues, or if theyre not
> labeled what are some tasks to be addressed

Follow-up prompts in the same sessions (Nov 1-5):

> I believe a PR landed, please follow the workflow to review this

> Okay goood, go ahead and dusoatcg a fx fir the API issues and the items
> that do need to be fixed in the repo, and address any other gh issues
> assigned to me/no one and implement that as well

> Make the API an issue to MonklyS regarding the API issue, and what needs to
> be done regarding the fix for this

> review 124 if possible
>
> For our backlog go ahead and dispatch agents for it please

> also please ensure issues are being closed when possible,
>
> Keep dispatching issues and polling PR's to review those that land, and
> review our comments that are left from others

> turn on auto polling for each pr pleas

> Are there datasets for photo evaluation?

> I mean we are using a cloud model do we really need an eval set?

> start polling again, and review pr's that get thrown up

Decisions I made when asked:
- Mobile Nearby shows "N+" fit counts when the recommendations page is full;
  missing chains show no badge.
- The Nearby outage (every public Overpass server down from the droplet) was
  waited out, then specified as issue #128 and left to MonklyS. Teammates'
  issues stay with them; agents were not used to take over #108 or #128.
- Deadlines are managed by the team and are not raised by the tool.
- Photo analysis keeps Claude Haiku 5.5 with JSON-schema output and a 502 on
  any invalid answer; no eval dataset. #113 stays open until I test it.
- The droplet IP never goes into the repo, clients, commits or PR text; tests
  never point at the production database.

## Result

- **M6 API merged to `main`** through rollups #134 and #137: `GET
  /meal-plans` (#131), `POST /photo-analyses` with Claude Haiku 5.5,
  JSON-schema output, a 20/day limit and a 3 MiB body limit (#132), the admin
  role with `requireAdmin` and the review endpoints with revert guards
  (#133), community submissions with auto-moderation flags and the no-op
  edit 400 (#135, #140). The contract was kept in sync by #129, #136, #140,
  #144. Backend tests went from 189 to 388 over the period.
- **Nearby resilience**: three-server Overpass fallback, 15 s per attempt, a
  10-minute cache and shared in-flight requests (#98, #99, #101). When every
  server stayed down, issue #128 specified the stale-cache and UCF snapshot
  fallback, which MonklyS shipped in #145 (reviewed and merged here).
- **Mobile**: expired-session redirect and trustworthy fit counts (#96,
  #102); the Android APK/release CI and signing notes (#139 reviewed, #142).
- **Diagrams**: use case, auth and recommendations sequence, recommendations
  activity, mobile class diagram, ERD, photo-log sequence and moderation
  activity, all rendered from PlantUML (#97, #125, #127, #138, #141, #146).
- **Teammate PRs reviewed and merged from my account** with posted
  evidence: Richard's web tracker, community/admin and plans/photo pages
  (#147, #148, #152); Alex's mobile tracker, plans/photo and community
  screens (#150-#154); Alex's deploy fix that re-applies `schema.js` on
  every deploy (#149); MonklyS's meal logs and Nearby snapshot (#143, #145);
  Richard's disclosure entries (#159). Proven bugs sent back before merge:
  #131 rounding before floor, #132 parallel daily-limit bypass, #133 revert
  relabelling community data, #138 missing revert 404, Alex's #124 (`&&
  e.fromApi`), #130 (semantics tap, Show more debounce), #104 (PicksPage
  mode/error, search normalize), #153 servings stepper leaving 0.25-10.
- Issues closed: #37, #109-#112, #115-#120, #122, #128 (by MonklyS).
- A production incident found by Richard (500 on saving nutrient toggles,
  caused by the droplet's stale MongoDB validator) was fixed by hand and then
  permanently by #149.
