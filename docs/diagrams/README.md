# Diagrams

PlantUML sources, each rendered to a PNG with the same name (for the slides, #42).

| Diagram | Shows |
|---|---|
| [`use-case.puml`](use-case.puml) | What a student can do, which use cases need a login, and the outside services (SendGrid, Overpass) they use. |
| [`sequence-auth.puml`](sequence-auth.puml) | Register, verification email, verify, log in: endpoints, status codes and the "not verified" branch. |
| [`sequence-recommendations.puml`](sequence-recommendations.puml) | A logged-in student finds nearby restaurants (Overpass + chain matching), then gets recommendations for them. |
| [`activity-recommendations.puml`](activity-recommendations.puml) | How recommendations are picked and ranked: per-meal limit, protein or carb mode, score, "Great fit". |
| [`erd.puml`](erd.puml) | Database collections and relations (#39). |
| [`gantt.puml`](gantt.puml) | Project schedule (#40). |

Render (needs Java; download `plantuml.jar` from https://plantuml.com/download):

```
java -jar plantuml.jar -tpng docs/diagrams/*.puml
```
