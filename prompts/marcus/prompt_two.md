## AI Assistance Disclosure

- **Tool**: Claude Fable 5.1 (Anthropic), accessed via Claude Code CLI;
  implementer and reviewer subagents ran on Claude Opus 5.5
- **Date**: October 27, 2026
- **Scope**: API contract, Express server skeleton (#10), email stub (#11),
  typed web API client (#16), SwaggerHub spec (#36), first-draft PlantUML
  diagrams (#37, later reverted), issue triage, branch protection (#4)
- **Use**: Code and docs generation through an orchestrated workflow. The
  orchestrator only read GitHub issues and prompted agents. Implementer
  agents wrote each change in its own git worktree and opened a PR into a
  session branch. Reviewer agents checked each PR against its issue and the
  contract, and had to prove any reported bug with a runnable scenario
  before it went back to an implementer. Ponytail (YAGNI) rules applied to
  every change.

Everything the tool produced was reviewed by me before it reached the repo.
PR #55 (session branch to main) is additionally reviewed by a teammate
before merge.

---

## Prompt

> You are a lead orchestrator in project we are developing for a large
> project me and a group wanted to work on collaboratively. The goal for this
> session is to address any GH issues addressed to polter-dev (me).
>
> The orchestrator dispatches 2 types of agents: implementers and reviewers.
> Implementers take a prompt, implement the tagged feature in their own
> working tree, and submit a PR (main - session - worker's trees). Reviewers
> ensure the features implemented are working and correspond to the changes
> that must be implemented. The orchestrator will not review, write or do
> anything to the code base besides read GitHub issues and prompt each agent.
> If a reviewer finds an issue or bug, it must prove it is real using a
> dynamic workflow that can spawn agents to make a test scenario; only then
> does the orchestrator dispatch an implementer to fix it.
>
> Goal: dispatch PRs until we reach blocking work, consistently producing
> code with the ponytail skill (YAGNI). API contracts need to be created so
> teams can take clean agentic workflows. If you have any questions ask,
> don't assume. All agents should be in Opus 5.5.

Follow-up decisions I made when asked: unassigned API issues go to MonklyS
and #10 is taken here since it blocks everything; PRs go into a session
branch, then one PR to main for teammates; email provider stubbed and
tracked in a new issue (#49); PR #48 already merged so build on chains /
favorites; node:test instead of Jest after discussing tradeoffs; 300 kcal
recommendation floor; single "Set your profile first" 400; enable branch
protection; revert the diagrams PR and leave #37 for last so they can be
redone in a presentation-oriented style.

## Result

Session branch `session/api-foundation` with four reviewed PRs merged in,
then PR #55 to main:

- #50 `docs/api-contract.md`: every endpoint, shared objects, error shape,
  backend conventions. Review found 11 contradictions with the issues and
  schema (verify-email method, goal method, calorie floor, token expiry,
  estimates filter, score, age bound, search scope); all fixed.
- #51 Express 5 + Mongoose skeleton, `/api/health`, single error middleware,
  CORS, `.env.example`, email stub, 4 `node:test` tests. Review proved
  duplicate-key errors returned 500 instead of 409; fixed.
- #52 OpenAPI 3.0.3 spec for menu search and calories; lints clean, examples
  verified against seed data.
- #54 Typed web client, 17 functions plus `logout()`. Review proved two
  runtime bugs (network failures bypassed `ApiError`; an empty 200 body
  stored "undefined" as the JWT); fixed.
- #53 PlantUML diagrams: merged, then reverted at my request; #37 stays open.

Admin: API issues assigned to MonklyS, #49 opened for the email provider,
decisions recorded as comments on #16, #24, #32, #41, #37, main branch
protected with one required review (#4 closed).
