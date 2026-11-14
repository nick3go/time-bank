# Time Bank

A small, responsive time allowance tracker: receive **10 hours every Monday**, spend them your way, and carry every unused minute into the following week.

## Features

- Prominent current balance, this week's spending, and lifetime totals.
- Log a duration in hours and minutes, or enter start/end times.
- Explicit overnight option; optional notes and backdated spending.
- Full chronological calculation of opening balance, weekly +10h credits, spending and running balances. Displayed newest first.
- Edit entries; remove them with a soft delete and undo.
- Select the starting Monday and an opening balance. The starting week receives its own 10h credit.
- No rollover limit. Negative balances remain visible and are covered by future credits.
- JSON export includes settings, records and the calculated ledger.
- Ljubljana calendar dates; Monday credit is independent of daylight saving time. Weekly credits accumulate even while the app is closed.
- Dependency-free frontend; integer-minute arithmetic and automated calculation tests.

## Backend connection

Connected to the existing Supabase project `ngtkrtabbxrwduleenwn`, identified by its `g4a_private` and `timeline_private` application schemas. A dedicated **time_bank** schema has been created. Existing application tables and shared Auth settings were preserved.

The frontend uses Supabase email/password accounts. Each account has its own settings and spending records, protected with row level security. Create an account, confirm the email, then return to this app and sign in. An existing account in this Supabase project can also sign in. Account confirmation is enabled on the project; its existing confirmation redirect settings have been preserved.

## Run locally

Requires Node 22+; no dependencies to install.

```sh
npm start
# Open http://localhost:8080
node --test
```

Serve the files over HTTP, rather than opening index.html directly. No install or build step is required.

## Backend implementation

`supabase/setup.sql` records the setup already applied to the project. **Do not rerun it on the configured project.** For a new project, run it once and replace the public URL/key in `config.js`. Never put service-role or secret credentials in frontend code.

The schema stays outside the Data API's exposed-schema list. Four owner-scoped `public.time_bank_*` RPC functions use caller privileges (`SECURITY INVOKER`), with access granted only to authenticated users. Table RLS independently restricts reads and writes to the current user. Removing an entry is a soft delete; clients have no DELETE permission. Weekly credits are derived, so reloads and multiple devices cannot create duplicate allowances.

`supabase/verify.sql` runs transactional integration checks: it creates two temporary fixture users and verifies persistence, input constraints, cross-user read/write isolation, and denied anonymous RPC access. It rolls back all fixture records. These checks have passed on the connected project. The security advisor reported no findings for the new Time Bank tables or functions.

A real email-confirmation/sign-in flow has not been completed with the owner's account. UI spending/edit/remove/undo was exercised in browser-only mode before cloud configuration; auth transport has separate mocked tests. The live Auth settings, invalid-login UI feedback and anonymous RPC denial were also checked. End-to-end sync across two signed-in devices remains a user acceptance check.

If URL/key configuration is intentionally cleared for local development, the app visibly falls back to browser-only storage. Local records stay separate from cloud records. Export them before switching; automatic import is not implemented.

## GitHub Pages

The app is a static website. In repository **Settings → Pages**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**. All asset links are relative and work under `/time-bank/`. The repository does not require a build pipeline. The existing custom domain `time.nickg.si` in `CNAME` is preserved. Pages activation and domain DNS are managed in repository settings.

## Calculation rules

All amounts use whole minutes. The starting Monday receives 600 minutes immediately; every elapsed Monday contributes another 600. Opening minutes are added once. Credits and spending are sorted by calendar date; opening balance and weekly credit come before spending on the same date. Timed spending uses start time within a date; duration-only spending follows timed entries. The list is a daily accounting ledger, not a claim about the exact intraday order of duration-only entries.

From/to duration is elapsed wall-clock time, not timezone-adjusted stopwatch time. Mark `Ends next day` for overnight outings. An outing can last up to 24 hours. Dates before the start week and future dates are rejected. Editing the starting week cannot place existing records before the start. The full 10h weekly allowance applies even if you begin using the app midway through the starting week.
