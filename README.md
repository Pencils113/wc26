# World Cup 26 Pool

A small, static World Cup bracket pool for friends, family, and the Conway room.

The frontend is a Vite + React + TypeScript app that can be hosted on GitHub Pages. It runs with local mock storage when Supabase credentials are absent, and switches to Supabase for submissions, Conway email OTP, results, and realtime leaderboard refresh when credentials are configured.

## Local Development

```bash
npm install
npm run dev
```

The dev server is configured with relaxed Vite filesystem checks because this local workspace path contains a colon.

To test against Supabase locally, copy `.env.example` to `.env.local` and fill:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Checks

```bash
npm run lint
npm run build
```

The npm scripts call package entrypoints directly because this local npm shell was not prepending `node_modules/.bin`.

## Current App Behavior

- Pass code `conway` routes to the Conway email-code flow.
- Pass code `larooch` routes to the family name-pick flow.
- Conway room uses Supabase email OTP for `@conway.ai` when configured; otherwise it uses the local mock email-code flow.
- Larooch uses the passcode/name flow. With Supabase configured, the passcode is checked by the `submit_password_room_bracket` RPC.
- Room identity is saved to browser `localStorage`.
- Bracket submissions are saved to Supabase when configured, otherwise to browser `localStorage`.
- Returning users with a saved submission land on their frozen bracket after entering the pass code.
- The leaderboard is hidden until the current user has submitted.
- The leaderboard includes seed demo brackets plus submitted room brackets.
- Scores are zero before real results are written into Supabase or demo-live mode is enabled.
- Team stat cards show on hover/focus of the info button.

## Supabase Setup

Supabase artifacts live in `supabase/`. For the Supabase SQL editor, run these files in order:

1. `supabase/01_tables.sql`
2. `supabase/02a_security_and_view.sql`
3. `supabase/02b_conway_rpc.sql`
4. `supabase/02c_larooch_rpc.sql`
5. `supabase/02d_grants.sql`
6. `supabase/03_seed_and_realtime.sql`

`supabase/schema.sql` and `supabase/02_security_and_api.sql` contain combined setup for CLI-style workflows, but the split-file path is safer in the Supabase SQL editor.

The schema creates:

- `rooms`
- `brackets`
- `matches`
- `actual_results`
- `results_sync_runs`
- `bracket_submissions` read view
- RPCs for `submit_conway_bracket` and `submit_password_room_bracket`
- Realtime publication entries for brackets/results

After applying the schema:

1. In Supabase Auth, enable email OTP.
2. Add your GitHub Pages URL to Auth redirect URLs.
3. Confirm the seeded `conway` and `larooch` rooms have the passcodes/domains you want.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in GitHub repository secrets.

Required GitHub secrets for deploy/update workflows:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_FOOTBALL_KEY`
- `API_FOOTBALL_WORLD_CUP_LEAGUE_ID` optional, defaults to `1`

## Deployment

`.github/workflows/deploy-pages.yml` builds `dist/` and deploys it to GitHub Pages.

`.github/workflows/update-results.yml` is scheduled every 30 minutes and can also be run manually.

The Vite config uses `base: './'`, so the built app works on either a custom domain or a repo-path GitHub Pages URL.
