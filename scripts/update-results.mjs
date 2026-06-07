import { createClient } from '@supabase/supabase-js'

const dryRun = process.env.DRY_RUN === '1'
const requiredEnv = dryRun ? [] : ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const missing = requiredEnv.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.log(`Skipping results sync. Missing env: ${missing.join(', ')}`)
  process.exit(0)
}

const supabase = dryRun
  ? null
  : createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

const provider = 'espn'
const endpoint = new URL('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard')
endpoint.searchParams.set('dates', '20260611-20260719')
endpoint.searchParams.set('limit', '300')

const teamNameToId = {
  Mexico: 'mexico',
  'South Africa': 'south-africa',
  'South Korea': 'korea-republic',
  Czechia: 'czechia',
  Canada: 'canada',
  'Bosnia-Herzegovina': 'bosnia-herzegovina',
  Qatar: 'qatar',
  Switzerland: 'switzerland',
  Brazil: 'brazil',
  Morocco: 'morocco',
  Haiti: 'haiti',
  Scotland: 'scotland',
  'United States': 'united-states',
  Paraguay: 'paraguay',
  Australia: 'australia',
  Türkiye: 'turkiye',
  Germany: 'germany',
  Curaçao: 'curacao',
  'Ivory Coast': 'cote-divoire',
  Ecuador: 'ecuador',
  Netherlands: 'netherlands',
  Japan: 'japan',
  Sweden: 'sweden',
  Tunisia: 'tunisia',
  Spain: 'spain',
  'Cape Verde': 'cabo-verde',
  Belgium: 'belgium',
  Egypt: 'egypt',
  'Saudi Arabia': 'saudi-arabia',
  Uruguay: 'uruguay',
  Iran: 'iran',
  'New Zealand': 'new-zealand',
  France: 'france',
  Senegal: 'senegal',
  Iraq: 'iraq',
  Norway: 'norway',
  Argentina: 'argentina',
  Algeria: 'algeria',
  Austria: 'austria',
  Jordan: 'jordan',
  Portugal: 'portugal',
  'Congo DR': 'congo-dr',
  England: 'england',
  Croatia: 'croatia',
  Ghana: 'ghana',
  Panama: 'panama',
  Uzbekistan: 'uzbekistan',
  Colombia: 'colombia',
}

const teamGroup = {
  mexico: 'A',
  'south-africa': 'A',
  'korea-republic': 'A',
  czechia: 'A',
  canada: 'B',
  'bosnia-herzegovina': 'B',
  qatar: 'B',
  switzerland: 'B',
  brazil: 'C',
  morocco: 'C',
  haiti: 'C',
  scotland: 'C',
  'united-states': 'D',
  paraguay: 'D',
  australia: 'D',
  turkiye: 'D',
  germany: 'E',
  curacao: 'E',
  'cote-divoire': 'E',
  ecuador: 'E',
  netherlands: 'F',
  japan: 'F',
  tunisia: 'F',
  sweden: 'F',
  belgium: 'G',
  egypt: 'G',
  iran: 'G',
  'new-zealand': 'G',
  spain: 'H',
  'cabo-verde': 'H',
  'saudi-arabia': 'H',
  uruguay: 'H',
  france: 'I',
  senegal: 'I',
  iraq: 'I',
  norway: 'I',
  argentina: 'J',
  algeria: 'J',
  austria: 'J',
  jordan: 'J',
  portugal: 'K',
  uzbekistan: 'K',
  colombia: 'K',
  'congo-dr': 'K',
  england: 'L',
  croatia: 'L',
  ghana: 'L',
  panama: 'L',
}

const groups = Object.entries(teamGroup).reduce((acc, [teamId, group]) => {
  acc[group] ??= []
  acc[group].push(teamId)
  return acc
}, {})

const groupMatchIds = Array.from({ length: 72 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`)
const knockoutMatchIds = Array.from({ length: 32 }, (_, index) => `M${index + 73}`)
const internalMatchIds = [...groupMatchIds, ...knockoutMatchIds]
const bracketMatchIds = new Set(knockoutMatchIds.filter((id) => id !== 'M103'))

const knockoutStageById = Object.fromEntries(
  knockoutMatchIds.map((id) => {
    const number = Number(id.slice(1))
    if (number <= 88) return [id, 'Round of 32']
    if (number <= 96) return [id, 'Round of 16']
    if (number <= 100) return [id, 'Quarter-final']
    if (number <= 102) return [id, 'Semi-final']
    if (number === 103) return [id, 'Third-place']
    return [id, 'Final']
  }),
)

const response = await fetch(endpoint)

if (!response.ok) {
  const body = await response.text()
  await logRun('error', `HTTP ${response.status}: ${body.slice(0, 400)}`)
  throw new Error(`ESPN scoreboard request failed: ${response.status}`)
}

const payload = await response.json()
const events = Array.isArray(payload.events)
  ? payload.events
      .slice()
      .sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
  : []

if (events.length < internalMatchIds.length) {
  await logRun('error', `Expected at least ${internalMatchIds.length} events, received ${events.length}`)
  throw new Error(`ESPN scoreboard returned too few events: ${events.length}`)
}

const rows = events.slice(0, internalMatchIds.length).map(mapEventToRow)

if (dryRun) {
  console.log(`Dry run normalized ${rows.length} matches`)
  console.log(rows.slice(0, 5).map((row) => {
    const score = row.home_score === null || row.away_score === null
      ? 'vs'
      : `${row.home_score}-${row.away_score}`
    return `${row.id} ${row.starts_at} ${row.home_team_id ?? 'TBD'} ${score} ${row.away_team_id ?? 'TBD'} ${row.status}`
  }).join('\n'))
  process.exit(0)
}

const { error: matchesError } = await supabase
  .from('matches')
  .upsert(rows, { onConflict: 'id' })

if (matchesError) throw matchesError

await updateActualResults(rows)
await logRun('ok', `Upserted ${rows.length} matches`)
console.log(`Upserted ${rows.length} matches`)

function mapEventToRow(event, index) {
  const id = internalMatchIds[index]
  const competition = event.competitions?.[0] ?? {}
  const competitors = competition.competitors ?? []
  const home = competitors.find((competitor) => competitor.homeAway === 'home') ?? competitors[0]
  const away = competitors.find((competitor) => competitor.homeAway === 'away') ?? competitors[1]
  const homeTeamId = getTeamId(home)
  const awayTeamId = getTeamId(away)
  const status = competition.status ?? event.status ?? {}
  const state = status.type?.state ?? 'pre'
  const completed = Boolean(status.type?.completed)
  const matchStatus = completed ? 'final' : state === 'in' ? 'live' : 'scheduled'
  const showScore = completed || state === 'in'
  const homeScore = showScore ? parseScore(home?.score) : null
  const awayScore = showScore ? parseScore(away?.score) : null
  const winner = competitors.find((competitor) => competitor.winner)

  return {
    id,
    stage: id.startsWith('G')
      ? `Group ${homeTeamId ? teamGroup[homeTeamId] : awayTeamId ? teamGroup[awayTeamId] : 'Stage'}`
      : knockoutStageById[id] ?? 'Knockout',
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_score: homeScore,
    away_score: awayScore,
    winner_team_id: completed ? getTeamId(winner) : null,
    starts_at: competition.startDate ?? competition.date ?? event.date ?? null,
    status: matchStatus,
    raw: {
      providerEventId: String(event.id),
      providerStatus: status.type?.name ?? null,
      statusDetail: status.type?.shortDetail ?? status.type?.description ?? null,
      displayClock: status.displayClock ?? null,
      state,
      completed,
    },
    updated_at: new Date().toISOString(),
  }
}

function getTeamId(competitor) {
  const displayName = competitor?.team?.displayName
  return displayName ? teamNameToId[displayName] ?? null : null
}

function parseScore(score) {
  const value = Number(score)
  return Number.isFinite(value) ? value : null
}

async function updateActualResults(rows) {
  const { data: current, error: fetchError } = await supabase
    .from('actual_results')
    .select('group_order, third_place_advancers, knockout_winners')
    .eq('id', 1)
    .maybeSingle()

  if (fetchError) throw fetchError

  const derived = deriveActualResults(rows)
  const nextGroupOrder = {
    ...(current?.group_order ?? {}),
    ...derived.groupOrder,
  }
  const nextKnockoutWinners = {
    ...(current?.knockout_winners ?? {}),
    ...derived.knockoutWinners,
  }

  const { error: upsertError } = await supabase
    .from('actual_results')
    .upsert({
      id: 1,
      group_order: nextGroupOrder,
      third_place_advancers: derived.thirdPlaceAdvancers.length > 0
        ? derived.thirdPlaceAdvancers
        : current?.third_place_advancers ?? [],
      knockout_winners: nextKnockoutWinners,
      source: provider,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

  if (upsertError) throw upsertError
}

function deriveActualResults(rows) {
  const groupStandings = Object.fromEntries(
    Object.entries(groups).map(([group, teamIds]) => [
      group,
      Object.fromEntries(teamIds.map((teamId) => [
        teamId,
        { teamId, group, points: 0, goalsFor: 0, goalsAgainst: 0, played: 0 },
      ])),
    ]),
  )
  const completedGroupRowsByGroup = {}
  const knockoutWinners = {}

  for (const row of rows) {
    if (row.id.startsWith('G')) {
      if (!isFinalRow(row) || !row.home_team_id || !row.away_team_id) continue

      const group = teamGroup[row.home_team_id] ?? teamGroup[row.away_team_id]
      if (!group || group !== teamGroup[row.away_team_id]) continue

      completedGroupRowsByGroup[group] ??= 0
      completedGroupRowsByGroup[group] += 1

      const home = groupStandings[group][row.home_team_id]
      const away = groupStandings[group][row.away_team_id]
      home.played += 1
      away.played += 1
      home.goalsFor += row.home_score
      home.goalsAgainst += row.away_score
      away.goalsFor += row.away_score
      away.goalsAgainst += row.home_score

      if (row.home_score > row.away_score) {
        home.points += 3
      } else if (row.away_score > row.home_score) {
        away.points += 3
      } else {
        home.points += 1
        away.points += 1
      }
    } else if (bracketMatchIds.has(row.id) && isFinalRow(row) && row.winner_team_id) {
      knockoutWinners[row.id] = row.winner_team_id
    }
  }

  const groupOrder = {}
  const thirdPlaceCandidates = []

  for (const group of Object.keys(groups)) {
    if ((completedGroupRowsByGroup[group] ?? 0) < 6) continue

    const ordered = sortStandings(Object.values(groupStandings[group]))
    groupOrder[group] = ordered.map((standing) => standing.teamId)
    thirdPlaceCandidates.push(ordered[2])
  }

  const thirdPlaceAdvancers = Object.keys(groupOrder).length === 12
    ? sortStandings(thirdPlaceCandidates).slice(0, 8).map((standing) => standing.group)
    : []

  return {
    groupOrder,
    thirdPlaceAdvancers,
    knockoutWinners,
  }
}

function sortStandings(standings) {
  return standings.slice().sort((left, right) => {
    const pointsDelta = right.points - left.points
    if (pointsDelta !== 0) return pointsDelta

    const goalDifferenceDelta =
      (right.goalsFor - right.goalsAgainst) - (left.goalsFor - left.goalsAgainst)
    if (goalDifferenceDelta !== 0) return goalDifferenceDelta

    const goalsForDelta = right.goalsFor - left.goalsFor
    if (goalsForDelta !== 0) return goalsForDelta

    return left.teamId.localeCompare(right.teamId)
  })
}

function isFinalRow(row) {
  return row.status === 'final' &&
    Number.isInteger(row.home_score) &&
    Number.isInteger(row.away_score)
}

async function logRun(status, message) {
  const { error } = await supabase.from('results_sync_runs').insert({
    provider,
    status,
    message,
  })

  if (error) {
    console.error('Failed to log sync run:', error.message)
  }
}
