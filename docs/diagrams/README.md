# Diagrams

PlantUML sources, each rendered to a PNG with the same name (for the slides, #42).

| Diagram | Shows |
|---|---|
| [`use-case.puml`](use-case.puml) | What a student and an admin can do (M6 adds meal tracking, plans, photo logging, community submissions and their review), which use cases need a login, and the outside services (SendGrid, Overpass, Claude vision) they use. |
| [`sequence-auth.puml`](sequence-auth.puml) | Register, verification email, verify, log in: endpoints, status codes and the "not verified" branch. |
| [`sequence-recommendations.puml`](sequence-recommendations.puml) | A logged-in student finds nearby restaurants (Overpass + chain matching; when every server fails, a cached answer or the UCF snapshot, #128), then gets recommendations for them. |
| [`activity-recommendations.puml`](activity-recommendations.puml) | How recommendations are picked and ranked: per-meal limit, protein or carb mode, score, "Great fit". |
| [`sequence-photo-log.puml`](sequence-photo-log.puml) | Log a meal from a photo (#122): `POST /photo-analyses` limits and errors, the Claude call, the DB-trust step, then the confirm screen and `POST /meal-logs`. |
| [`activity-moderation.puml`](activity-moderation.puml) | A community submission (#122): submit-time checks, auto-moderation flags, `auto_applied` or `pending`, and the admin's approve / reject / revert with their 404/409 guards. |
| [`class-mobile.puml`](class-mobile.puml) | The Flutter app's classes: screens and how each opens the next, the Api and location services behind `ApiScope`, and the API models (#38). |
| [`erd.puml`](erd.puml) | Database collections and relations (#39, #121): users, favorites, chains, menu items, and the M6 meal logs and community submissions, with `users.role` and `preferences.trackedNutrients`. |
| [`gantt.puml`](gantt.puml) | Project schedule (#40). |

Render (needs Java; download `plantuml.jar` from https://plantuml.com/download):

```
java -jar plantuml.jar -tpng docs/diagrams/*.puml
```
