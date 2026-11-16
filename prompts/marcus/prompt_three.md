## AI Assistance Disclosure

- **Tool**: Claude Opus 5.5 (Anthropic), accessed via Claude Code CLI;
  implementer and reviewer subagents also ran on Claude Opus 5.5
- **Date**: November 3, 2026
- **Scope**: Feature planning for milestone M6 (meal tracker, meal plans,
  photo logging, community edits with admin review), GitHub issues #106-#122,
  and the M6 API + data contract in `docs/api-contract.md` (PR #123)
- **Use**: Planning, requirements check against the course spec and rubric,
  issue writing, and docs generation through the orchestrated workflow. The
  orchestrator read the codebase and GitHub, wrote the plan and issue bodies,
  and prompted agents. One implementer agent wrote the contract PR in its own
  git worktree. A reviewer agent checked it line by line against the issue
  and every decision comment. Ponytail (YAGNI) rules applied.

Everything the tool produced was reviewed by me before it reached the repo.
PR #123 was also reviewed by two teammates (Richard and Alex), whose points
were folded in before Richard approved and merged it.

---

## Prompt

> For this session, I want to focus on implementing new features to our
> mobile and web page, help me plan, architect and construct the following
> features, alongside make team member assignments for these features
> utilizing github issues.
>
> - community driven additions: users can help updating calorie contents,
>   food items, and select items, this system should try to be autonomous
>   alongside have fallbacks in case someone tries to malicously modify food
>   items. Users can also add resturants and add items and this can also be
>   semi-autonomous, where if something is questionable we can review it
>   ourselves with, most likely with a developer login.
> - if the developer login is an addition, then this should also be planned.
> - Calorie tracking / meal planning: users will be allowed to add items into
>   a meal tracker, so they can hit their intake goals, or make sure theyre
>   not going over calories. this can be sorted by week and by day [...]
>   users [choose] which goals they want to see, such as protein, calories,
>   fats, etc. This can be toggleable [...] optimal meal plans can also be
>   used from resturants such as: suggested food items for the day [...] If
>   they opt in for this meal on the page, the corresponding information
>   about their user is also updated.
> - Photo / Image classification for meals: [...] if cheap enough id like to
>   have a feature where a user can submit a photo and this automatically
>   updates the calorie tracking and or meal planning information. For
>   scalability reasons dont worry and expect 1-10 users at most.
>
> if any of these features seem ambigous, or you are unsure of what I want
> please ask questions to properly tailor this to the project.

Follow-up decisions I made when asked:
- Deadlines are managed by the team.
- Opting in to a suggested meal adds it as a "planned" entry that the user
  checks off as eaten.
- Photo analysis uses Claude Haiku 5.5 (about $0.001 per photo) with a confirm
  screen. A Haiku vs Opus eval (#113) checks reliability before we rely on it.
- Assignments are by layer, following our roles.
- Every endpoint is REST, with no action URLs.
- Every issue is a self-contained ticket so agents aren't unsure of the task.
- The contract is written and merged before any code.
- The plan was checked against the course technical requirements and grading
  rubric.

## Result

- Milestone **M6: Tracking, plans, photo, community** with 17 issues:

  | Issues | Owner | Work |
  |---|---|---|
  | #106 #109-#113 #122 | polter-dev | contract, admin, submissions + moderation, meal plans, photo, photo eval, UML |
  | #107 #115-#117 #121 | Richard | DB, web pages, ERD |
  | #108 | MonklyS | meal-log endpoints |
  | #118-#120 | Alex | mobile screens |
  | #114 | Alex + Richard | prototypes |

- **PR #123** (merged): the M6 contract covers the data model, `User`/`Calories`
  additions, meal logs, meal plans, photo analysis, community submissions with
  auto-moderation flags, admin review, error codes and client function names.
  The contract went through three review rounds:
  - **Coordinator decisions (9):** returned fields, null handling, duplicate
    names, revert conflicts, oversized photos, admin responses, stored
    defaults.
  - **Richard's DB review (5):** found that a documented seed admin would be an
    admin on the live site; the seed admin is now created only with
    `SEED_ADMIN=1`. Also exact reverts, dangling `menuItemId`, photo limit
    storage, real-date checks.
  - **Richard and Alex's PR review:** reverting deleted or renamed targets,
    photo confirm editing, the 3 MiB limit, hiding moderation flags from
    users, meal-plan edge cases.
- The README pitch no longer says "No meal logging"; design-spec §8 lists the
  M6 screens.
