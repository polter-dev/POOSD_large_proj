# Prototypes (#18, #114)

One design for both apps, built from [`docs/design-spec.md`](../design-spec.md): same tokens, type,
components and copy. Web frames are 1280 x 832, mobile (Android) 412 x 917. Screens 01-08 are the first
milestone (#18); 09-20 are the M6 screens (#114), 12 on web and 10 on mobile (the admin queue is web only).

| # | Screen | Shows |
|---|---|---|
| 01 | Log in | First screen (course requirement); login is by email |
| 02 | Log in: email not verified | 403 error banner with "Resend verification email" |
| 03 | Create account | Field error on blur (username) and focused password field |
| 04 | Check your email | After sign-up |
| 05 | Set up your profile | Height, weight, birth date, sex, activity level, goal |
| 06 | Your targets | Entered values, maintenance, target and per-meal as distinct numbers (C3) |
| 07 | Restaurants near you | Radius 5/10/15/20 mi, "N options fit your goal" badge, "No nutrition data" card |
| 08 | Best picks | High protein / high carb, macro bars, score, Great fit / OK pills |

### M6 screens (#114)

Shapes and rules from the M6 sections of [`docs/api-contract.md`](../api-contract.md); layout and copy follow
the built screens (`web/src/pages`, `mobile/lib/screens`). These frames use the M6 navigation: seven sections
on web (plus Admin for admins), six tabs on mobile.

| # | Screen | Web | Mobile | Shows |
|---|---|---|---|---|
| 09 | Tracker: day | ✓ | ✓ | Day/week toggle, nutrient chips (Carbs off), bars vs the daily goal with eaten + hatched planned, entry list with a planned row and **Ate it** |
| 10 | Tracker: week | ✓ | ✓ | Same, goal × 7 (10,906 cal), entries grouped by day |
| 11 | Add to tracker | ✓ | ✓ | Search "chicken" + servings; web is the Add food card, mobile a bottom sheet with a servings stepper |
| 12 | Plan: day or week | ✓ | ✓ | Week view, Nearby only, per-day "cal left", **Add to plan** per item and **Add whole day**, one item already in the plan |
| 13 | Photo: pick or take | ✓ | ✓ | Mobile: Take / Choose a photo. Web: the browser's file picker opens straight away, so the frame shows the dialog analyzing it |
| 14 | Photo: confirm and log | ✓ | ✓ | One matched item, two "Not on our menus" with confidence, servings, edit (web shows the edit panel open), **Log 3 items** |
| 15 | Suggest a correction | ✓ | ✓ | Prefilled form for Grilled Chicken Sandwich, calories changed; web is a dialog over Best picks |
| 16 | Add an item | ✓ | ✓ | New item for Chick-fil-A with Fat left blank (unknown); web is a dialog over Nearby |
| 17 | Add a restaurant | ✓ | ✓ | Name, nutrition page link, other names; web is a dialog over My submissions |
| 18 | My submissions | ✓ | ✓ | Status chips Applied / In review / Rejected, before vs proposed, reviewer note |
| 19 | Admin: review queue | ✓ | | Pending review: flags, the proposed values, note, **Approve** / **Reject** |
| 20 | Admin: applied changes | ✓ | | Applied filter: before (struck through) vs proposed, **Revert** |

The admin queue is two frames because the contract gives a *pending* edit only its proposed values;
`before` is recorded when a change is applied, so the before/after diff and **Revert** live on applied items.

M6 data: Jane's macro goals are the contract's lose split of 1,558 cal (35/35/30: protein 136 g, carbs 136 g,
fat 52 g); "today" is Thu, Nov 5. Menu items and their numbers are from `chains.js`. The submissions,
usernames other than `janedoe` and the photo results are made up for the frames.

The data is real: the numbers are seed user `janedoe` (5 ft 5 in, 160 lb, born 2006-03-14, light, lose:
maintenance 2,058, target 1,558, 519 per meal, the contract's own check), and the menu items and "options fit"
counts come from `backend/db/menu-data/chains.js`.

## Files

- `web/*.png`, `mobile/*.png`: each screen at 2x, for the slides and the report (web 01-20, mobile 01-18).
- `prototype.html`: the source. Open it in a browser to see every frame on one canvas. Add
  `?frame=web-login` (or `mobile-picks`, etc.) to see one frame at its exact size; buttons and tabs click
  through to the next screen, so it works as a clickable prototype on its own.

To re-export the PNGs after a change (macOS, Chrome installed), from this folder (on Windows, use Chrome's
path under `Program Files` and a `file:///C:/...` URL):

```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=1280,832 --virtual-time-budget=4000 \
  --screenshot="$PWD/web/01-login.png" "file://$PWD/prototype.html?frame=web-login"
```

Use `--window-size=412,917` and `?frame=mobile-...` for mobile. Frame keys: `login`, `loginError`, `signup`,
`checkEmail`, `profile`, `targets`, `nearby`, `picks`, then M6: `tracker`, `trackerWeek`, `addFood`, `plan`,
`photo`, `photoConfirm`, `suggest`, `addItem`, `addChain`, `submissions`, `admin`, `adminApplied` (the last
two web only).

## Figma

The Figma file is **Menu Macro Fitter**, view access for anyone with the link:

- Design file: https://www.figma.com/design/uCeypcfI3bj6y6EFCIOISn/Menu-Macro-Fitter
- Clickable prototype, web flow: https://www.figma.com/proto/uCeypcfI3bj6y6EFCIOISn/Menu-Macro-Fitter?node-id=6-152&starting-point-node-id=6%3A152&scaling=min-zoom
- Clickable prototype, mobile flow: https://www.figma.com/proto/uCeypcfI3bj6y6EFCIOISn/Menu-Macro-Fitter?node-id=6-868&starting-point-node-id=6%3A868&scaling=min-zoom

- Clickable prototype, web M6 flow (starts at Tracker): https://www.figma.com/proto/uCeypcfI3bj6y6EFCIOISn/Menu-Macro-Fitter?node-id=45-2757&starting-point-node-id=45%3A2757&scaling=min-zoom
- Clickable prototype, mobile M6 flow (starts at Tracker): https://www.figma.com/proto/uCeypcfI3bj6y6EFCIOISn/Menu-Macro-Fitter?node-id=45-1971&starting-point-node-id=45%3A1971&scaling=min-zoom

It has all 38 frames as editable layers: web 01-20 in the top row (`Web / 01 Log in` ... `Web / 20 Admin
applied`) and mobile 01-18 below (`Mobile / 01 Log in` ... `Mobile / 18 My submissions`), with the links in the
tables below. Flows: **Web** and **Mobile** start at Log in (01-08); **Web M6** and **Mobile M6** start at
Tracker; **Web Admin** starts at the review queue (19) and **Mobile Correction** at Suggest a correction (15).
The old 01-08 frames use the navigation they were exported with, so the M6 screens are their own flows.

## Getting it into Figma

How the file above was made, for redoing it after the screens change. The rubric asks for Figma prototypes. The free **html.to.design** plugin turns `prototype.html` into
editable Figma frames (real text, shapes and auto layout, not screenshots):

1. In Chrome, install the **html.to.design** extension. In its extension settings, turn on
   **Allow access to file URLs**.
2. Open `docs/wireframes/prototype.html` in Chrome (drag the file into a tab).
3. Click the extension and capture the page. It saves a `.h2d` file.
4. In Figma, create a design file named **Menu Macro Fitter**, run the **html.to.design** plugin and import
   the `.h2d` file. The whole page lands as one section holding all 38 frames (20 web, 18 mobile). Drag the
   frames you need out of it onto the canvas (each is a `Background+Shadow` layer next to its label), then
   delete the section. The plugin's import-by-URL doesn't work for this file: free hosts like githack serve
   the plugin an interstitial page instead of the prototype.
5. Rename the frames to match the PNG names (`Web / 01 Log in`, `Mobile / 01 Log in`, ...).

Fallback if the plugin isn't available: drag the PNGs from `web/` and `mobile/` into Figma. Each becomes a
frame you can wire up the same way; it just isn't editable.

### Wire the prototype in Figma

In the **Prototype** tab, add *On click → Navigate to* for each of these (same links as `prototype.html`).
Do it once for web and once for mobile, and set **Log in** as the flow's starting frame.

| From | Click | To |
|---|---|---|
| Log in | Log in button | Your targets |
| Log in | Sign up | Create account |
| Create account | Create account button | Check your email |
| Create account | Log in | Log in |
| Check your email | Back to log in | Log in |
| Set up your profile | See my targets | Your targets |
| Your targets | Edit | Set up your profile |
| Your targets | Find food near me | Restaurants near you |
| Restaurants near you | Any card with a fit badge | Best picks |
| Any app screen | Nearby / Best picks / Profile tab | That screen |
| Best picks (mobile) | Back arrow | Restaurants near you |

M6 links (frames 09-20), as wired in the Figma file:

| From | Click | To |
|---|---|---|
| Web 09-12, 18-20 | Tracker / Submissions nav | Tracker: day / My submissions |
| Tracker: day | Week segment | Tracker: week (and Day back) |
| Tracker | Plan meals | Plan |
| Tracker | Log from photo (web) / Log a photo (mobile) | Photo: pick or take |
| Tracker (mobile) | Add food button | Add to tracker |
| Add to tracker | Add | Tracker: day |
| Plan | ← Tracker / back arrow | Tracker: day |
| Photo (web) | The analyzing dialog | Photo: confirm and log |
| Photo: pick or take (mobile) | Take a photo / Choose a photo | Photo: confirm and log |
| Photo: confirm and log | Log 3 items | Tracker: day |
| Photo: confirm and log (mobile) | Back arrow | Photo: pick or take |
| Suggest a correction / Add an item / Add a restaurant | Send button | My submissions |
| Suggest a correction / Add an item (mobile) | Back arrow | Best picks / Restaurants near you (08 / 07) |
| Add a restaurant (mobile) | Back arrow | My submissions |
| My submissions | Add a restaurant | Add a restaurant |
| My submissions (mobile) | Back arrow | Tracker: day |
| Admin: review queue / applied | Show filter | The other admin frame |

Suggest a correction and Add an item open from Best picks and Nearby in the app; those screens are 07-08 here,
which keep the older navigation, so in Figma they start their own flow (or open from the canvas).

Press **Present** to click through it.
