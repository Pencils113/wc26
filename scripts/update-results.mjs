import { createClient } from '@supabase/supabase-js'

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'API_FOOTBALL_KEY',
]

const missing = requiredEnv.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.log(`Skipping results sync. Missing env: ${missing.join(', ')}`)
  process.exit(0)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const provider = 'api-football'
const endpoint = new URL('https://v3.football.api-sports.io/fixtures')
endpoint.searchParams.set('league', process.env.API_FOOTBALL_WORLD_CUP_LEAGUE_ID ?? '1')
endpoint.searchParams.set('season', '2026')

const response = await fetch(endpoint, {
  headers: {
    'x-apisports-key': process.env.API_FOOTBALL_KEY,
  },
})

if (!response.ok) {
  const body = await response.text()
  await supabase.from('results_sync_runs').insert({
    provider,
    status: 'error',
    message: `HTTP ${response.status}: ${body.slice(0, 400)}`,
  })
  throw new Error(`API-Football request failed: ${response.status}`)
}

const payload = await response.json()
const fixtures = Array.isArray(payload.response) ? payload.response : []

const rows = fixtures.map((fixture) => ({
  id: String(fixture.fixture.id),
  stage: fixture.league.round ?? 'unknown',
  home_team_id: fixture.teams.home?.id ? String(fixture.teams.home.id) : null,
  away_team_id: fixture.teams.away?.id ? String(fixture.teams.away.id) : null,
  home_score: Number.isInteger(fixture.goals.home) ? fixture.goals.home : null,
  away_score: Number.isInteger(fixture.goals.away) ? fixture.goals.away : null,
  winner_team_id: fixture.teams.home?.winner
    ? String(fixture.teams.home.id)
    : fixture.teams.away?.winner
      ? String(fixture.teams.away.id)
      : null,
  starts_at: fixture.fixture.date,
  status: fixture.fixture.status?.short ?? 'scheduled',
  raw: fixture,
  updated_at: new Date().toISOString(),
}))

if (rows.length > 0) {
  const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

await supabase.from('results_sync_runs').insert({
  provider,
  status: 'ok',
  message: `Upserted ${rows.length} fixtures`,
})

console.log(`Upserted ${rows.length} fixtures`)
