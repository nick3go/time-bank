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
- Per-bank dated credit exceptions appear in the ledger. For `nickk`, Monday 16 November 2026 is skipped while the original starting week's 10 hours are retained. The next credit is Monday 23 November.
- Dependency-free frontend; integer-minute arithmetic and automated calculation tests.

## Username-only access

Enter a username and choose **Open time bank**. There is no password, email verification or separate registration. A new username gets a new bank; an existing username opens the same saved bank. Usernames are case-insensitive, 3–30 characters, with letters, numbers, underscores and hyphens, starting with a letter or number.

**Anyone who knows a username can view and change its time bank.** This is intentional and requested; usernames are identifiers, not private authentication credentials.

The app uses the existing Supabase project `ngtkrtabbxrwduleenwn` and the dedicated `time_bank` schema. Existing balances and entries remain attached to the same internal identities.

## Run locally

Requires Node 22+; no dependencies to install.

```sh
npm start
# Open http://localhost:8080
node --test
```

Serve the files over HTTP, rather than opening index.html directly. No install or build step is required.

## Backend implementation

`supabase/setup.sql` records the database setup already applied. Do not rerun it on the configured project. For a new project, run it once, update `config.js`, then deploy `supabase/functions/time-bank-open` with its public-key allowlist updated for that project. Never expose a service-role key to the frontend.

The username-only Edge Function validates the app key and username, then generates and exchanges a session for that app-specific internal identity (`<username>@users.time-bank.invalid`). No email is sent. Only identities in this fixed namespace can be opened. The admin key remains server-side. Gateway JWT verification is disabled because a username can be opened before a session exists. The resulting normal Supabase session supports reloads, refresh and switching usernames, while allowing the database's existing owner-scoped RPC functions and RLS to keep banks separate.

This session mechanism **does not provide password protection**: any caller knowing a username can obtain that bank's session through the intentional public endpoint. No authentication settings for other applications have been changed.

The old username/password signup source, password adapter and signup-limiter migration are retained as historical implementation records; the current frontend does not call them. They are not required for a new username-only installation.

`supabase/verify.sql` checks the existing RPC/data policies using rolled-back fixtures. Automated frontend and endpoint tests cover normalization, session storage and refresh, opening without a password, malformed requests and backend errors. All hour calculations and entry controls are unchanged.

If URL/key configuration is cleared for local development, the app visibly uses browser-only storage. Local records stay separate from cloud records; automatic import is not implemented.

## GitHub Pages

The app is a static website. In repository **Settings → Pages**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**. All asset links are relative and work under `/time-bank/`. The repository does not require a build pipeline. The existing custom domain `time.nickg.si` in `CNAME` is preserved. Pages activation and domain DNS are managed in repository settings.

## Calculation rules

All amounts use whole minutes. The starting Monday receives 600 minutes immediately; every elapsed Monday contributes another 600. Opening minutes are added once. Credits and spending are sorted by calendar date; opening balance and weekly credit come before spending on the same date. Timed spending uses start time within a date; duration-only spending follows timed entries. The list is a daily accounting ledger, not a claim about the exact intraday order of duration-only entries.

`supabase/credit_adjustment.sql` records the one-off exception on `nickk`'s profile. It has already been applied; do not rerun it on the configured project. The exception has zero minutes in the visible history and does not affect other time banks or later Mondays.

From/to duration is elapsed wall-clock time, not timezone-adjusted stopwatch time. Mark `Ends next day` for overnight outings. An outing can last up to 24 hours. Dates before the start week and future dates are rejected. Editing the starting week cannot place existing records before the start. The full 10h weekly allowance applies even if you begin using the app midway through the starting week.
