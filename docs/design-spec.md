# Shared Design Spec (web + mobile)

One look for both apps: the React web app (`web/`) and the Flutter app (`mobile/`) each build these
tokens and components once, so they feel like one product without sharing code. Visual direction is
**Option 1, Fresh and clean** (white background, green = fits your goal), with Option 2's macro
colors for the macro bars. Figma (#18) uses the same values.

Field names, rules and error messages come from [`docs/api-contract.md`](api-contract.md). If the two
disagree, the contract wins and this file gets fixed.

## 1. Colors

Every text color below has at least 4.5:1 contrast on its background (WCAG AA); bar and border
colors have at least 3:1.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FFFFFF` | Page / screen background |
| `surface` | `#F5F6F8` | Section backgrounds, input fill on mobile |
| `border` | `#E3E6EA` | Card and divider lines (decorative) |
| `border-input` | `#858E99` | Input outlines (3.3:1 on `bg`, 3.1:1 on `surface`) |
| `text` | `#1A1D21` | Body text, headings |
| `text-muted` | `#5B6470` | Secondary text, captions, placeholders (6.0:1) |
| `primary` | `#15803D` | Primary buttons, links, focus ring, selected states |
| `primary-hover` | `#166534` | Pressed / hover |
| `on-primary` | `#FFFFFF` | Text on primary buttons (5.0:1) |
| `fit-great-bg` / `fit-great-text` | `#DCFCE7` / `#166534` | "Great fit" pill (6.5:1) |
| `fit-ok-bg` / `fit-ok-text` | `#FEF3C7` / `#92400E` | "OK" pill (6.4:1) |
| `fit-over-bg` / `fit-over-text` | `#FEE2E2` / `#B91C1C` | "Over budget" pill (reserved: recommendations never return over-limit items) |
| `error` | `#B91C1C` | Error text and error input outline (6.5:1) |
| `error-bg` | `#FEE2E2` | Error banner background |
| `macro-protein` | `#2563EB` | Protein bar segment and dot |
| `macro-carbs` | `#EA580C` | Carbs bar segment and dot (bars only, never text) |
| `macro-fat` | `#A16207` | Fat bar segment and dot (darker gold, plain yellow is unreadable on white) |
| `macro-unknown` | `#808994` | Hatched "unknown" part of a macro bar (3.6:1 on `bg`, 3.3:1 on `surface`) |

Fit colors are **never the only signal**: every fit pill also has its text ("Great fit", "OK") and an
icon (check for Great fit, dash for OK).

## 2. Type

Font: **Manrope** (Google Fonts on web; `GoogleFonts.manrope()` from the `google_fonts` package in Flutter). Fallback: system sans.

| Style | Size / weight / line height | Use |
|---|---|---|
| `display` | 40 / 700 / 1.1 | The big calorie number on Calorie Results |
| `h1` | 28 / 700 / 1.2 | Screen titles ("Log in", "Your targets") |
| `h2` | 20 / 600 / 1.3 | Section titles, card titles |
| `body` | 16 / 400 / 1.5 | Default text, inputs, buttons (buttons use 600) |
| `small` | 14 / 400 / 1.4 | Secondary text, macro labels, error text under inputs |
| `caption` | 12 / 500 / 1.3 | Pills, badges, units |

Numbers that line up in columns (calories, grams) use tabular figures
(`font-variant-numeric: tabular-nums`; Flutter `FontFeature.tabularFigures()`).

## 3. Spacing, shape, elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48. Screen side padding 16 on mobile, 24 on web.
- Radius: inputs and buttons 8, cards 12, pills 999 (fully round).
- Cards: `bg` fill, 1px `border`, shadow `0 1px 2px rgba(0,0,0,0.06)`. No heavy shadows.
- Tap targets at least 44 x 44 on mobile. Buttons 48 tall.
- Web forms max 400 wide, centered. Web content max 1040 wide.
- Focus: 2px `primary` ring with 2px offset on every focusable element.

## 4. Components

### Buttons
- **Primary**: `primary` fill, `on-primary` text, 600 weight, full width in forms.
  Loading: label swaps to a spinner, button disabled, same width.
- **Secondary**: `bg` fill, 1px `border-input`, `text` color.
- **Text link**: `primary`, underlined on hover (web).

### Text input
- Label above (`small`, 600, `text`), never placeholder-only.
- 48 tall, 1px `border-input`, radius 8; focus = 2px `primary`.
- Error: outline `error`, message below in `small` `error`, starting with the field name.
- Password has a show/hide toggle.

### Error banner
Top of a form, for server errors: `error-bg` fill, `error` text, radius 8, an alert icon. Holds the
server's `error` message as-is (the API's messages are written for users). Optional action button
inside (for example "Resend verification email").

### Fit pill
`caption` text in a round pill: icon + label. "Great fit" (check, green), "OK" (dash, amber),
"Over budget" (x, red; reserved). **Only on recommendation results**, because the rule needs
`score`, which only `POST /recommendations` returns. Search results get no fit pill.

Rule (needs team sign-off): every recommended item already fits the calorie limit, so the first
`ceil(n / 3)` items by `score` are **Great fit** and the rest are **OK** (10 items: 4 and 6). The rule is
relative: the best item in a weak list is still "Great fit". "Over budget" stays reserved, since
recommendations never return items over the limit.

### Macro bar
One horizontal bar, 8 tall, radius 4, showing how an item's calories split between protein, carbs and
fat (protein and carbs 4 kcal/g, fat 9 kcal/g). With all three known, each segment's width is its
share of the three together, so the bar is always full. Underneath, in `small`: `● P 32g  ● C 45g  ● F 12g` with dots in the macro
colors.

**Unknown state.** `proteinG`, `carbsG` or `fatG` can be `null`, which means unknown: never draw
it as 0.
- Some null: each known segment's width is its calories divided by the item's `calories` (capped so
  the bar never overflows); fill the rest with `macro-unknown` diagonal hatching.
  The label shows `?` for the unknown one (`● F ?`).
- All null: the whole bar is hatched and the label says "Macros unknown".

### Menu item card
Item name (`h2`), restaurant name (`small` muted), calories (`body` 600, tabular) on the right,
then the macro bar.
- **In recommendations:** also the score and the fit pill. The score label follows the response's
  `mode`: "8.5 g protein per 100 cal" for `protein`, "11.9 g carbs per 100 cal" for `carb`.
- **In search results:** no score and no fit pill. Search isn't ranked by goal and has no calorie limit.

### Restaurant card
Name (`h2`), distance ("0.4 mi", `small` muted), address when there is one, and a badge:
"5 options fit your goal" in `fit-great` colors.

The count needs one extra call, not one per card: after `POST /restaurants/nearby`, send one
`POST /recommendations` with `chainIds` = every non-null `chainId` in the results and `limit: 50`,
then count the returned items per `chainId`. 50 is the contract's maximum, so a restaurant can be
undercounted when many fit; see Open questions.

**No nutrition data** (`chainId: null`): same card, but the badge is a neutral pill
("No nutrition data", `surface` fill, `text-muted`), there's no item count, and the card isn't
tappable.

## 5. Screens due Friday: login and register

Login and register are the first screen (course requirement). Same fields, copy and states on web
(#17) and mobile (#20).

### Log in
- Title "Log in". Fields: **Email or username**, **Password**. `POST /auth/login` takes
  `{ login, password }`; a value with `@` is an email, anything else a username. Empty shows
  "Email or username is required"; otherwise the email or username rule from Sign up applies.
- Primary button "Log in". Links: "Forgot password?" and "No account? Sign up".
- On success: store the token. If `user.profile` is `null`, go to onboarding; else go home.
- Errors (banner):
  - 401: "Invalid email/username or password"
  - 403: "Email not verified", with a **Resend verification email** button in the banner
    (`POST /auth/resend-verification` with `{ login }`, the typed email or username). After it's
    sent, show: "If that account exists, a verification link was sent".
  - Network failure: "Can't reach the server. Check your connection and try again."

### Sign up
- Title "Create account". Fields, in this order:

| Field | Label | Client check (same as the server) | Message |
|---|---|---|---|
| `firstName` | First name | 1 to 50 characters | empty: "First name is required"; over 50: "First name: 50 characters max" |
| `lastName` | Last name | 1 to 50 characters | empty: "Last name is required"; over 50: "Last name: 50 characters max" |
| `username` | Username | lowercase as they type; `^[a-z0-9_.]{3,30}$` | "Username: 3 to 30 letters, numbers, _ or ." |
| `email` | Email | lowercase; `^[^@\s]+@[^@\s]+\.[^@\s]+$`, max 254 | "Email: enter a valid address" |
| `password` | Password | at least 8 characters | "Password: at least 8 characters" |

- Primary button "Create account". Link: "Have an account? Log in".
- Validate on blur and on submit, not on every keystroke.
- 400 (a field the server rejected) and 409 (email or username already taken) show the server's
  message in the banner.
- On 201: go to **Check your email**. Register does not log the user in.

### Check your email
Two versions of the same layout: title "Check your email", primary button "Back to log in",
secondary button "Resend email".

| | After sign up | After forgot password |
|---|---|---|
| Body | "We sent a verification link to **{email}**. Open it, then log in." | The server's message, then: "If that email exists, a reset link was sent. Check **{email}** and open the link to choose a new password." |
| Resend email calls | `POST /auth/resend-verification` | `POST /auth/forgot-password` |
| The emailed link opens | web page `/verify-email?token=` (#22) | web page `/reset-password?token=` (#22) |

Forgot password never says whether the email exists, so the body shows the contract's message rather
than "we sent". Both links open the **web** site, on web and mobile.

### Forgot password
- Mobile and web: title "Reset your password", one Email field and a "Send reset link" button
  (`POST /auth/forgot-password`), then the forgot-password version of **Check your email**.

## 6. Using the tokens in code

React (`web/src/styles/tokens.css`; Tailwind reads these variables, see `web/src/styles/index.css`):

```css
:root {
  --bg: #FFFFFF; --surface: #F5F6F8; --border: #E3E6EA; --border-input: #858E99;
  --text: #1A1D21; --text-muted: #5B6470;
  --primary: #15803D; --primary-hover: #166534; --on-primary: #FFFFFF;
  --fit-great-bg: #DCFCE7; --fit-great-text: #166534;
  --fit-ok-bg: #FEF3C7; --fit-ok-text: #92400E;
  --fit-over-bg: #FEE2E2; --fit-over-text: #B91C1C;
  --error: #B91C1C; --error-bg: #FEE2E2;
  --macro-protein: #2563EB; --macro-carbs: #EA580C; --macro-fat: #A16207; --macro-unknown: #808994;
  --radius-input: 8px; --radius-card: 12px;
  --font: "Manrope", system-ui, sans-serif;
}
```

Flutter (`mobile/lib/theme.dart`):

```dart
class AppColors {
  static const bg = Color(0xFFFFFFFF), surface = Color(0xFFF5F6F8);
  static const border = Color(0xFFE3E6EA), borderInput = Color(0xFF858E99);
  static const text = Color(0xFF1A1D21), textMuted = Color(0xFF5B6470);
  static const primary = Color(0xFF15803D), primaryHover = Color(0xFF166534);
  static const onPrimary = Color(0xFFFFFFFF);
  static const fitGreatBg = Color(0xFFDCFCE7), fitGreatText = Color(0xFF166534);
  static const fitOkBg = Color(0xFFFEF3C7), fitOkText = Color(0xFF92400E);
  static const fitOverBg = Color(0xFFFEE2E2), fitOverText = Color(0xFFB91C1C);
  static const error = Color(0xFFB91C1C), errorBg = Color(0xFFFEE2E2);
  static const macroProtein = Color(0xFF2563EB), macroCarbs = Color(0xFFEA580C);
  static const macroFat = Color(0xFFA16207), macroUnknown = Color(0xFF808994);
}
```

## 7. Open questions

- **Fit rule** (section 4, Fit pill): top `ceil(n / 3)` by `score` = Great fit. Needs team sign-off.
- **"N options fit your goal" count** (section 4, Restaurant card): one recommendations call with
  `limit: 50` can undercount when many items fit. Fine for the demo; a per-chain count from the
  API would be exact.
- **Restaurant `address`**: the contract and `web/src/types/api.ts` say string, but the Overpass
  client (#61) returns `null` when OpenStreetMap has no address (17 of 121 in its live check). The
  card handles a missing address; the contract should say `string | null`.
