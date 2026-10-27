# Menu Macro Fitter (mobile)

Flutter app, **Android only**. Same features and look as the web app: colors, type and components come from
[`docs/design-spec.md`](../docs/design-spec.md), endpoints and fields from [`docs/api-contract.md`](../docs/api-contract.md).

## Run it

Needs Flutter 3.47+ and Android Studio (for the Android SDK and an emulator).

```bash
cd mobile
flutter pub get
flutter emulators --launch Medium_Phone_API_37.0   # or any Android emulator / phone
flutter run
```

The API base URL is set at build time with `API_URL`:

| Where the API runs | Command |
|---|---|
| Local backend on this computer (default) | `flutter run` (uses `http://10.0.2.2:5050/api`, the emulator's name for the host's localhost) |
| Live server | `flutter run --dart-define=API_URL=https://<domain>/api` |

Plain `http` is allowed in debug builds only (`android/app/src/debug/AndroidManifest.xml`); release builds need https.

## Tests

```bash
flutter analyze
flutter test
```

`test/api_test.dart` checks every request against a fake server (no backend needed), `test/login_screen_test.dart`
covers the login errors (401, 403 + resend) and `test/validators_test.dart` the field rules.

## Layout

| Path | What |
|---|---|
| `lib/theme.dart` | `AppColors`, spacing, radius and the Material theme from the design spec |
| `lib/models/api_models.dart` | `User`, `Profile`, `Preferences`, `Calories`, `MenuItem`, ... from the API contract |
| `lib/services/api_client.dart` | The only HTTP code: base URL, JWT header, `{ error }` → `ApiError` |
| `lib/services/api.dart` | `Api`: one method per endpoint, named like `web/src/api/index.ts` |
| `lib/validators.dart` | Field rules, same as the server |
| `lib/widgets/` | `ErrorBanner`, `LabeledField`, `PrimaryButton`, `AuthScaffold`, `ApiScope` |
| `lib/screens/` | Log in (first screen), Sign up, Check your email, Forgot password, Home (placeholder until #35) |

Screens get the API with `ApiScope.of(context)`, never by making HTTP calls themselves.
