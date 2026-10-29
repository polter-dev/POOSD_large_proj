# Menu Macro Fitter web app

React + TypeScript (Vite), Tailwind and React Router. Looks and copy follow
[`docs/design-spec.md`](../docs/design-spec.md); endpoints and error messages follow
[`docs/api-contract.md`](../docs/api-contract.md).

## Run it

Needs the backend running (see `backend/README.md`), by default on port 5050.

```bash
cd web
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:5050/api
npm run dev             # http://localhost:5173
```

To point at the live server instead, set `VITE_API_URL=https://<domain>/api`. The production build on the
droplet uses `VITE_API_URL=/api` (see `docs/deploy.md`).

`npm run build` typechecks and builds to `dist/`; `npm run lint` runs oxlint.

## Where things are

| Path | What |
|---|---|
| `src/api/` | The only code that calls the API: one function per contract row. Stores the JWT in `localStorage`. |
| `src/types/api.ts` | Request and response types, mirroring the contract. |
| `src/context/AuthContext.tsx` | The logged-in user (`useAuth()`). On reload it checks the stored token with `GET /users/me`. |
| `src/styles/tokens.css` | Design tokens from the spec, section 6. `index.css` maps them into Tailwind (`bg-primary`, `text-text-muted`, ...). |
| `src/components/` | `TextField`, `Button`, `Banner`, `AuthLayout`, `SegmentedControl`, `SelectField` (spec section 4), and `AppShell`, the logged-in header with the app's sections. |
| `src/pages/` | Log in (`/`), sign up, forgot password, check your email, the emailed-link pages `/verify-email` and `/reset-password` (#22), profile setup `/onboarding` and editing `/profile` (`ProfilePage`), `/targets` (#25), and a placeholder for `/home` (#34). |
| `src/units.ts` | Imperial/metric conversion and display. The API always stores inches and pounds. |
| `src/validators.ts` | Client checks and messages, same rules as the server and `mobile/lib/validators.dart`. |

After login, a user with no `profile` goes to `/onboarding`, everyone else to `/home`. Saving the profile goes
to `/targets`; `/targets` and `/profile` send a user without a profile back to `/onboarding`.
