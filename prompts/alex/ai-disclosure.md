# AI Assistance Disclosure: Alex Kemper

Format: see [`AI Disclosure Template.md`](../../AI%20Disclosure%20Template.md). One entry for each use.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code
- **Dates**: October 27, 2026
- **Scope**: The shared design spec for web and mobile (`docs/design-spec.md`, #63) and the Flutter Android app with
  its login and register screens (#67, #20), with emulator screenshots
- **Use**: Drafted the spec from the chosen visual direction (Option 1 with Option 2's macro colors) and its rules:
  4.5:1 text contrast and one look for both apps without shared code. Code generation for the Flutter screens from
  `docs/api-contract.md`. Fixes from Polter's reviews of #63 and #67 (contrast, no server IP in the API URL, the
  contract's messages, a safer resend).

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code
- **Dates**: October 28, 2026
- **Scope**: The web app setup and its login and register pages (#75, #15, #17), the review fixes in #76, the
  verify-email and reset-password pages the emailed links open (#80, #22), and the SendGrid variables in the deploy
  runbook (#81)
- **Use**: Code generation from the design spec and `docs/api-contract.md`, and fixes from Polter's review of #75.
  The runbook change came from finding that the deploy steps never set the SendGrid key, so no emails were sent.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code
- **Dates**: October 28-30, 2026
- **Scope**: Prototype frames 01-08 for web and mobile (`docs/wireframes/`, #82) and the Figma links (#92, #18)
- **Use**: Generated the frames from the design spec; each screen and its copy were reviewed. The frames were
  imported into Figma with html.to.design, with 39 click-through links and a web and a mobile prototype flow.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code
- **Dates**: November 1, 2026
- **Scope**: Mobile profile setup and editing, targets, Nearby, Best picks and Search (#94, #35); mobile login with
  an email or a username (#93, #87); a web profile fix for unit switches
- **Use**: Code generation from issue #35, prototype screens 05-08 and Richard's web pages, so both apps behave the
  same. The login fixes came from bugs found while checking the app against the live server.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code
- **Dates**: November 3, 2026
- **Scope**: The mobile class diagram (`docs/diagrams/class-mobile.puml`, #125, #38); Saved, Save on Nearby, the
  saved radius and search as you type on mobile (#130); a readable activity dropdown and a plain-words Nearby error
  (#124); the CI jobs that build the Android APK and publish it as `android-latest` (#139)
- **Use**: The class diagram was traced from `mobile/lib` and checked against the code. Code generation to
  bring mobile up to web's #104. #124 came from bugs found walking through the app built from `main`. Code
  generation for the CI jobs, which run beside the tests so the web deploy never waits on the Android build.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code
- **Dates**: November 4, 2026
- **Scope**: The mobile M6 screens: the Tracker with day and week totals, goal bars and nutrient chips (#150, #118),
  meal plans and photo logging (#151, #153, #119), and the community forms and My submissions (#154, #120); the
  deploy fix for the production 500 on `trackedNutrients` (#149)
- **Use**: Code generation from the issues, `docs/api-contract.md` and the matching web PRs, so mobile matches web.
  For #149 (production's validator predated the schema change, reported by Richard in #147): diagnosis, the fix to
  re-apply `schema.js` on every deploy, and a CI test that reproduces the old validator.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code
- **Dates**: November 5, 2026
- **Scope**: Mobile matching web on plan start, the Nearby only switch and editing matched photo items (#156);
  what's left under each Tracker bar (#157); "at least N over" for an unknown macro (#158)
- **Use**: Code generation from the differences between the two apps and from Richard's reviews of #155 and #157.
  Each change has widget tests, and `flutter test` passed before each PR.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code in the Claude desktop app
- **Dates**: November 14-15, 2026
- **Scope**: Reviews of PRs #165, #166, #167, #168 and #170; the final presentation slides (not in the repo): the
  mobile class diagram split into two readable slides plus a backup slide, the test results slide, and the speaker
  notes
- **Use**: Code review comments on PRs, which I read before posting and approving. For the slides, Claude checked
  the deck against the assignment's requirements, re-ran both test suites for the current numbers, and rendered
  the class diagram from `class-mobile.puml`.

Most of these commits do not carry a `Co-Authored-By: Claude` line, so this file is the record of which work used
AI. All AI-generated code and text was reviewed, tested and edited before it was committed.
