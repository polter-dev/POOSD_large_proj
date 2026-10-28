# Prototypes (#18)

One design for both apps, built from [`docs/design-spec.md`](../design-spec.md): same tokens, type,
components and copy. Eight screens each for web (1280 x 832) and mobile (Android, 412 x 917).

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

The data is real: the numbers are seed user `janedoe` (5 ft 5 in, 160 lb, born 2006-03-14, light, lose:
maintenance 2,058, target 1,558, 519 per meal, the contract's own check), and the menu items and "options fit"
counts come from `backend/db/menu-data/chains.js`.

## Files

- `web/*.png`, `mobile/*.png`: each screen at 2x, for the slides and the report.
- `prototype.html`: the source. Open it in a browser to see every frame on one canvas. Add
  `?frame=web-login` (or `mobile-picks`, etc.) to see one frame at its exact size; buttons and tabs click
  through to the next screen, so it works as a clickable prototype on its own.

To re-export the PNGs after a change (macOS, Chrome installed), from this folder:

```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=1280,832 --virtual-time-budget=4000 \
  --screenshot="$PWD/web/01-login.png" "file://$PWD/prototype.html?frame=web-login"
```

Use `--window-size=412,917` and `?frame=mobile-...` for mobile. Frame keys: `login`, `loginError`, `signup`,
`checkEmail`, `profile`, `targets`, `nearby`, `picks`.

## Getting it into Figma

The rubric asks for Figma prototypes. The free **html.to.design** plugin turns `prototype.html` into
editable Figma frames (real text, shapes and auto layout, not screenshots):

1. In Chrome, install the **html.to.design** extension. In its extension settings, turn on
   **Allow access to file URLs**.
2. Open `docs/wireframes/prototype.html` in Chrome (drag the file into a tab).
3. Click the extension and capture the page. It saves a `.h2d` file.
4. In Figma, create a design file named **Menu Macro Fitter**, run the **html.to.design** plugin and import
   the `.h2d` file. All 16 frames land on the canvas, grouped by web and mobile.
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

Press **Present** to click through it. Share the file (view access) and add the link here once it exists.
