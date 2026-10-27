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
| `border-input` | `#8A939E` | Input outlines (3.1:1) |
| `text` | `#1A1D21` | Body text, headings |
| `text-muted` | `#5B6470` | Secondary text, captions, placeholders (6.0:1) |
| `primary` | `#15803D` | Primary buttons, links, focus ring, selected states |
| `primary-hover` | `#166534` | Pressed / hover |
| `on-primary` | `#FFFFFF` | Text on primary buttons (5.0:1) |
| `fit-great-bg` / `fit-great-text` | `#DCFCE7` / `#166534` | "Great fit" pill (6.5:1) |
| `fit-ok-bg` / `fit-ok-text` | `#FEF3C7` / `#92400E` | "OK" pill (6.4:1) |
| `fit-over-bg` / `fit-over-text` | `#FEE2E2` / `#B91C1C` | "Over budget" pill (reserved; can't happen yet) |
| `error` | `#B91C1C` | Error text and error input outline (6.5:1) |
| `error-bg` | `#FEE2E2` | Error banner background |
| `macro-protein` | `#2563EB` | Protein bar segment and dot |
| `macro-carbs` | `#EA580C` | Carbs bar segment and dot (bars only, never text) |
| `macro-fat` | `#A16207` | Fat bar segment and dot (darker gold, plain yellow is unreadable on white) |
| `macro-unknown` | `#9CA3AF` | Hatched "unknown" part of a macro bar |

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
"Over budget" (x, red; reserved). Proposed rule, needs team sign-off: every item that
`POST /recommendations` returns already fits the calorie limit, so **Great fit = top third by
`score`**, **OK = the rest**.

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
macro bar, fit pill. In recommendations, also the score: "32.5 g protein per 100 cal".

### Restaurant card
Name (`h2`), distance ("0.4 mi", `small` muted), address if not null, and a badge:
"5 options fit your goal" in `fit-great` colors.

**No nutrition data** (`chainId: null`): same card, but the badge is a neutral pill
("No nutrition data", `surface` fill, `text-muted`), there's no item count, and the card isn't
tappable.

## 5. Screens due Friday: login and register

Login and register are the first screen (course requirement). Same fields, copy and states on web
(#17) and mobile (#20).

### Log in
- Title "Log in". Fields: **Email**, **Password**. Login is by email only: `POST /auth/login`
  takes `{ email, password }`, so the label says "Email", never "Username".
- Primary button "Log in". Links: "Forgot password?" and "No account? Sign up".
- On success: store the token. If `user.profile` is `null`, go to onboarding; else go home.
- Errors (banner):
  - 401: "Invalid email or password"
  - 403: "Email not verified", with a **Resend verification email** button in the banner
    (`POST /auth/resend-verification` with the typed email). After it's sent, show:
    "If that email exists, a verification link was sent".
  - Network failure: "Can't reach the server. Check your connection and try again."

### Sign up
- Title "Create account". Fields, in this order:

| Field | Label | Client check (same as the server) | Message |
|---|---|---|---|
| `firstName` | First name | 1 to 50 characters | "First name is required" |
| `lastName` | Last name | 1 to 50 characters | "Last name is required" |
| `username` | Username | lowercase as they type; `^[a-z0-9_.]{3,30}$` | "Username: 3 to 30 letters, numbers, _ or ." |
| `email` | Email | lowercase; `^[^@\s]+@[^@\s]+\.[^@\s]+$`, max 254 | "Email: enter a valid address" |
| `password` | Password | at least 8 characters | "Password: at least 8 characters" |

- Primary button "Create account". Link: "Have an account? Log in".
- Validate on blur and on submit, not on every keystroke.
- 409 shows the server's message in the banner (email or username already taken).
- On 201: go to **Check your email**. Register does not log the user in.

### Check your email
- Title "Check your email". Body: "We sent a verification link to **{email}**. Open it, then log in."
- Primary button "Back to log in". Secondary button "Resend email" (`POST /auth/resend-verification`).
- The verification link opens the **web** page `/verify-email?token=` (#22), on both web and mobile.

### Forgot password
- Mobile and web: one Email field and a "Send reset link" button (`POST /auth/forgot-password`),
  then the same "Check your email" layout with the contract's message.
- The reset itself happens on the web page `/reset-password?token=` (#22).

## 6. Using the tokens in code

React (`web/src/styles/tokens.css`, once #15 sets up the project):

```css
:root {
  --bg: #FFFFFF; --surface: #F5F6F8; --border: #E3E6EA; --border-input: #8A939E;
  --text: #1A1D21; --text-muted: #5B6470;
  --primary: #15803D; --primary-hover: #166534; --on-primary: #FFFFFF;
  --fit-great-bg: #DCFCE7; --fit-great-text: #166534;
  --fit-ok-bg: #FEF3C7; --fit-ok-text: #92400E;
  --fit-over-bg: #FEE2E2; --fit-over-text: #B91C1C;
  --error: #B91C1C; --error-bg: #FEE2E2;
  --macro-protein: #2563EB; --macro-carbs: #EA580C; --macro-fat: #A16207; --macro-unknown: #9CA3AF;
  --radius-input: 8px; --radius-card: 12px;
  --font: "Manrope", system-ui, sans-serif;
}
```

Flutter (`mobile/lib/theme.dart`, once #20 sets up the project):

```dart
class AppColors {
  static const bg = Color(0xFFFFFFFF), surface = Color(0xFFF5F6F8);
  static const border = Color(0xFFE3E6EA), borderInput = Color(0xFF8A939E);
  static const text = Color(0xFF1A1D21), textMuted = Color(0xFF5B6470);
  static const primary = Color(0xFF15803D), primaryHover = Color(0xFF166534);
  static const fitGreatBg = Color(0xFFDCFCE7), fitGreatText = Color(0xFF166534);
  static const fitOkBg = Color(0xFFFEF3C7), fitOkText = Color(0xFF92400E);
  static const fitOverBg = Color(0xFFFEE2E2), fitOverText = Color(0xFFB91C1C);
  static const error = Color(0xFFB91C1C), errorBg = Color(0xFFFEE2E2);
  static const macroProtein = Color(0xFF2563EB), macroCarbs = Color(0xFFEA580C);
  static const macroFat = Color(0xFFA16207), macroUnknown = Color(0xFF9CA3AF);
}
```
