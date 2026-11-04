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

The API base URL is set at build time with `API_URL`. Clients use a domain name, never an IP (#19).

| Where the API runs | Command |
|---|---|
| Local backend on this computer (debug default) | `adb reverse tcp:5050 tcp:5050` once per emulator boot, then `flutter run`. The app calls `http://localhost:5050/api`, which `adb reverse` forwards to this computer. |
| Live server | `flutter run --dart-define=API_URL=https://<domain>/api` |
| Release build | `flutter build apk --dart-define=API_URL=https://<domain>/api`. Without it, release builds use `productionApiUrl` in `lib/services/api_client.dart` (`https://cop4331ruth.lol/api`). |

Plain `http` is allowed in debug builds only (`android/app/src/debug/AndroidManifest.xml`); release builds need https.
Port 5050, not 5000: macOS AirPlay Receiver takes 5000 (#66).

Needs Flutter 3.47 or newer: the packages in `pubspec.lock` need Dart 3.13, which Flutter 3.44 doesn't have (tested on 3.47.8). Check with `flutter --version`.

## CI builds

CI builds the release APK whenever `mobile/` or `.github/workflows/ci.yml` changes (`android-apk` in `.github/workflows/ci.yml`):

- **On a PR:** the APK is attached to the run as the `menu-macro-fitter-apk` artifact (kept 14 days), so you can install a PR on a phone before it merges.
- **On `main`:** the APK also replaces the [`android-latest`](https://github.com/polter-dev/POOSD_large_proj/releases/tag/android-latest) pre-release. Its link is always the same: https://github.com/polter-dev/POOSD_large_proj/releases/download/android-latest/menu-macro-fitter.apk.

Release builds call the live API, so this APK matches what the web deploy serves. The build number is the CI run number, so each APK is newer than the last.

For a new APK to install over the previous one, every build has to be signed with the same key. CI reads that key from four repository secrets (only a repo admin can add them):

```bash
keytool -genkeypair -v -keystore release.jks -alias menu-macro-fitter -keyalg RSA -keysize 2048 -validity 10000
base64 -i release.jks | pbcopy   # paste as ANDROID_KEYSTORE_BASE64
```

Then add `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`menu-macro-fitter`) and `ANDROID_KEY_PASSWORD`. That command makes a PKCS12 keystore, which has one password, so `ANDROID_KEY_PASSWORD` is the same value as `ANDROID_KEYSTORE_PASSWORD`. Keep `release.jks` out of git.

Without these secrets, main's APK is signed with a one-off debug key: uninstall the old app before installing a new one. Local builds and PR builds always use the debug key (`android/app/build.gradle.kts`).

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
| `lib/screens/` | Log in (first screen), Sign up, Check your email, Forgot password, profile setup and editing, and the tabs: Nearby, Picks, Search, Saved, Tracker, Profile (Your targets) |

Screens get the API with `ApiScope.of(context)`, never by making HTTP calls themselves.
