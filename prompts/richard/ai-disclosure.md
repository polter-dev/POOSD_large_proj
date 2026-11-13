# AI Assistance Disclosure: Richard Magiday

Format: see [`AI Disclosure Template.md`](../../AI%20Disclosure%20Template.md). One entry for each use; the prompt
logs are in this folder.

- **Tool**: Claude Opus 5.5 (Anthropic), via the Claude desktop app
- **Dates**: October 19-21, 2026
- **Scope**: Project planning documents: the write-up of two project ideas the team rejected, and the text for the
  labeled sections of the Menu Macro Fitter proposal (Google Doc)
- **Use**: Drafted the text from the lab instructions and the team's notes

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code in VS Code
- **Dates**: October 21-22, 2026
- **Scope**: The project folder structure and description, the MongoDB schema (`backend/db/schema.js`), seed data
  and demo queries, and aligning the users schema with the project spec
- **Use**: Code generation from the project spec. Those commits are marked `Co-Authored-By: Claude`.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code in VS Code and the Claude desktop app
- **Dates**: October 26-28, 2026
- **Scope**: Restaurant chains, menu items and favorites in the seed data (`chains.js`), with nutrition values
  checked against each chain's official nutrition page; seeding from any folder; removing chain aliases that
  matched unrelated restaurants
- **Use**: Read each chain's official nutrition page and filled in the values, which I then checked against those
  pages; code generation for the seed fixes. Those commits are marked `Co-Authored-By: Claude`.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code in VS Code
- **Dates**: October 29, 2026
- **Scope**: Log in with an email or a username; profile setup, profile editing and targets pages (#25); fixes
  from the #88 review (focus ring, height error link, expired session)
- **Use**: Code generation from the issues and review comments; PR titles and descriptions. Those commits are
  marked `Co-Authored-By: Claude`.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code in VS Code
- **Dates**: November 2-3, 2026
- **Scope**: Web Nearby, Best picks, Search and Saved pages (#34) and fixes for bugs reported on the live site
  (logout, favicon, Best picks mode, search queries); the M6 database changes (user role, tracked nutrients,
  `mealLogs`, `submissions`, make-admin; #107); the updated ERD (#121, #39); reviews of teammates' PRs
- **Use**: Code generation from the issues and a bug-report recording; code review comments on PRs. Those commits
  are marked `Co-Authored-By: Claude`.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code in VS Code
- **Dates**: November 4, 2026
- **Scope**: Web M6 pages: the meal tracker with day/week view and nutrient toggles (#115), community forms, My
  submissions and the admin review page (#117), and meal plans and photo logging (#116)
- **Use**: Code generation from the issues and `docs/api-contract.md`. Those commits are marked
  `Co-Authored-By: Claude`.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code in VS Code and the Claude desktop app
- **Dates**: November 5, 2026
- **Scope**: M6 prototype frames 09-20 in `docs/wireframes/prototype.html`, their PNG exports in
  `docs/wireframes/web/` and `docs/wireframes/mobile/`, the `docs/wireframes/README.md` update, and importing the
  frames into the Figma file with their prototype links (#114); reviews of PRs #156 and #157
- **Use**: Generated the frames from the built web and mobile screens, `docs/design-spec.md` and
  `docs/api-contract.md`; exported the PNGs with headless Chrome and reviewed each one. Frames 01-08 render
  pixel-identical to before. Fixed frame 12 after Alex's review. Code review comments on PRs. Those commits are
  marked `Co-Authored-By: Claude`.

All AI-generated code and text was reviewed, tested and edited before it was committed.
