import type { MatchResult, TeamId } from '../types'

const endpoint = new URL('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard')
endpoint.searchParams.set('dates', '20260611-20260719')
endpoint.searchParams.set('limit', '300')

const teamNameToId: Record<string, TeamId> = {
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

const teamAliasToId: Record<string, TeamId> = {
  ...teamNameToId,
  USA: 'united-states',
  CAN: 'canada',
  BIH: 'bosnia-herzegovina',
  BRA: 'brazil',
  MAR: 'morocco',
  ESP: 'spain',
  CIV: 'cote-divoire',
  CPV: 'cabo-verde',
  COD: 'congo-dr',
  ALG: 'algeria',
  AUT: 'austria',
}

const teamGroup: Record<TeamId, string> = {
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

const groupMatchIds = Array.from({ length: 72 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`)
const knockoutMatchIds = Array.from({ length: 32 }, (_, index) => `M${index + 73}`)
const internalMatchIds = [...groupMatchIds, ...knockoutMatchIds]

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
) as Record<string, string>

interface EspnScoreboardPayload {
  events?: EspnEvent[]
}

interface EspnEvent {
  id?: string | number
  date?: string
  status?: EspnStatus
  competitions?: EspnCompetition[]
}

interface EspnCompetition {
  date?: string
  startDate?: string
  status?: EspnStatus
  competitors?: EspnCompetitor[]
}

interface EspnStatus {
  displayClock?: string
  type?: {
    state?: string
    completed?: boolean
    name?: string
    shortDetail?: string
    description?: string
  }
}

interface EspnCompetitor {
  homeAway?: string
  score?: string | number
  winner?: boolean
  team?: {
    displayName?: string
    shortDisplayName?: string
    name?: string
    abbreviation?: string
  }
}

export const fetchEspnScoreboardMatches = async (signal?: AbortSignal): Promise<MatchResult[]> => {
  const response = await fetch(endpoint, { signal })

  if (!response.ok) {
    throw new Error(`ESPN scoreboard request failed: ${response.status}`)
  }

  const payload = await response.json() as EspnScoreboardPayload
  const events = Array.isArray(payload.events)
    ? payload.events
        .slice()
        .sort((left, right) => Date.parse(left.date ?? '') - Date.parse(right.date ?? ''))
    : []

  return events
    .slice(0, internalMatchIds.length)
    .map(mapEventToMatchResult)
}

export const mergeMatchResults = (
  persistedMatches: MatchResult[],
  browserMatches: MatchResult[],
): MatchResult[] => {
  const merged = new Map<string, MatchResult>()

  persistedMatches.forEach((match) => merged.set(match.id, match))
  browserMatches.forEach((browserMatch) => {
    const persistedMatch = merged.get(browserMatch.id)
    merged.set(browserMatch.id, chooseFresherMatchResult(persistedMatch, browserMatch))
  })

  return Array.from(merged.values()).sort((left, right) => {
    const timeDelta = Date.parse(left.startsAt ?? '') - Date.parse(right.startsAt ?? '')
    if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta
    return left.id.localeCompare(right.id)
  })
}

function chooseFresherMatchResult(persistedMatch: MatchResult | undefined, browserMatch: MatchResult) {
  if (!persistedMatch) return browserMatch

  const persistedPriority = statusPriority(persistedMatch.status)
  const browserPriority = statusPriority(browserMatch.status)

  if (browserPriority > persistedPriority) return browserMatch
  if (browserPriority < persistedPriority) return persistedMatch

  const browserHasScore = typeof browserMatch.homeScore === 'number' && typeof browserMatch.awayScore === 'number'
  const persistedHasScore = typeof persistedMatch.homeScore === 'number' && typeof persistedMatch.awayScore === 'number'

  if (browserHasScore && !persistedHasScore) return browserMatch
  if (!browserHasScore && persistedHasScore) return persistedMatch

  return Date.parse(browserMatch.updatedAt) >= Date.parse(persistedMatch.updatedAt)
    ? browserMatch
    : persistedMatch
}

function statusPriority(status: string) {
  const normalized = status.toLowerCase()
  if (['final', 'ft', 'aet', 'pen', 'post', 'completed'].includes(normalized)) return 2
  if (['live', 'in', 'in_progress', '1h', '2h', 'ht', 'et', 'p'].includes(normalized)) return 1
  return 0
}

function mapEventToMatchResult(event: EspnEvent, index: number): MatchResult {
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
  const winner = competitors.find((competitor) => competitor.winner)

  return {
    id,
    stage: id.startsWith('G')
      ? `Group ${homeTeamId ? teamGroup[homeTeamId] : awayTeamId ? teamGroup[awayTeamId] : 'Stage'}`
      : knockoutStageById[id] ?? 'Knockout',
    homeTeamId,
    awayTeamId,
    homeScore: showScore ? parseScore(home?.score) : null,
    awayScore: showScore ? parseScore(away?.score) : null,
    winnerTeamId: completed ? getTeamId(winner) : undefined,
    startsAt: competition.startDate ?? competition.date ?? event.date,
    status: matchStatus,
    statusDetail: status.type?.shortDetail ?? status.type?.description,
    displayClock: status.displayClock,
    updatedAt: new Date().toISOString(),
  }
}

function getTeamId(competitor: EspnCompetitor | undefined) {
  const team = competitor?.team
  const candidates = [team?.displayName, team?.shortDisplayName, team?.name, team?.abbreviation]
  const match = candidates.find((candidate): candidate is string => Boolean(candidate && teamAliasToId[candidate]))

  return match ? teamAliasToId[match] : undefined
}

function parseScore(score: string | number | undefined) {
  const value = Number(score)
  return Number.isFinite(value) ? value : null
}
