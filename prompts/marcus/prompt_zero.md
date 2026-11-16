## AI Assistance Disclosure

- **Tool**: Claude Fable 5.1 (Anthropic), accessed via Claude Code CLI
- **Date**: October 21, 2026
- **Scope**: Project specification review
- **Use**: Planning review only; no application code generated.

Everything the tool produced was reviewed by me before it reached the repo.

---

## Prompt

> I want you to pull this artifact and this plan, grill me on the information
> on here, then help disperse github issues to the github this repo is linked
> to for me and my 3 other team members.
>
> <|project specification paste|>
>
> <|course assignment description paste|>

## Result

A list of contradictions between the spec and the committed MongoDB schema
(username, age vs. birth date, missing preferences, restaurants vs. chains,
goal adjustment) and the open decisions (hosting, Places API, email provider,
mobile target) that had to be settled before issues could be created.
