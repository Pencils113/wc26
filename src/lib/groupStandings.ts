import { teamsByGroup, teamsById } from '../data/teams'
import { GROUP_IDS, type ActualResults, type GroupId, type MatchResult, type TeamId } from '../types'

export interface GroupStanding {
  group: GroupId
  teamId: TeamId
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  seedIndex: number
}

export interface CurrentGroupTable {
  group: GroupId
  countedMatches: number
  standings: GroupStanding[]
}

export const buildCurrentGroupTables = (matchResults: MatchResult[]): CurrentGroupTable[] => {
  const tables = createEmptyTables()

  matchResults.forEach((match) => {
    if (!match.id.startsWith('G')) return
    if (!isCountableGroupMatch(match)) return
    if (!match.homeTeamId || !match.awayTeamId) return

    const homeTeam = teamsById[match.homeTeamId]
    const awayTeam = teamsById[match.awayTeamId]
    if (!homeTeam || !awayTeam || homeTeam.group !== awayTeam.group) return

    const table = tables[homeTeam.group]
    const home = table.standingsByTeam[match.homeTeamId]
    const away = table.standingsByTeam[match.awayTeamId]
    if (!home || !away) return

    applyScore(home, away, match.homeScore ?? 0, match.awayScore ?? 0)
    table.countedMatches += 1
  })

  return GROUP_IDS.map((group) => {
    const table = tables[group]
    return {
      group,
      countedMatches: table.countedMatches,
      standings: sortStandings(Object.values(table.standingsByTeam)),
    }
  })
}

export const buildProvisionalActualResults = (
  actualResults: ActualResults,
  currentTables: CurrentGroupTable[],
): ActualResults => {
  const groupOrder = { ...actualResults.groupOrder }
  const startedTables = currentTables.filter((table) => table.countedMatches > 0)

  startedTables.forEach((table) => {
    groupOrder[table.group] = table.standings.map((standing) => standing.teamId)
  })

  const thirdPlaceAdvancers = sortStandings(startedTables.map((table) => table.standings[2]).filter(Boolean))
    .slice(0, 8)
    .map((standing) => standing.group)

  return {
    ...actualResults,
    source: startedTables.length > 0 ? 'provisional' : actualResults.source,
    groupOrder,
    thirdPlaceAdvancers: thirdPlaceAdvancers.length > 0
      ? thirdPlaceAdvancers
      : actualResults.thirdPlaceAdvancers,
  }
}

const createEmptyTables = () =>
  GROUP_IDS.reduce(
    (tables, group) => {
      tables[group] = {
        countedMatches: 0,
        standingsByTeam: Object.fromEntries(
          teamsByGroup[group].map((team, index) => [
            team.id,
            {
              group,
              teamId: team.id,
              played: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              goalsFor: 0,
              goalsAgainst: 0,
              goalDifference: 0,
              points: 0,
              seedIndex: index,
            },
          ]),
        ) as Record<TeamId, GroupStanding>,
      }
      return tables
    },
    {} as Record<GroupId, { countedMatches: number; standingsByTeam: Record<TeamId, GroupStanding> }>,
  )

const isCountableGroupMatch = (match: MatchResult) => {
  const status = match.status.toLowerCase()
  const hasScore = typeof match.homeScore === 'number' && typeof match.awayScore === 'number'
  return hasScore && ['final', 'completed', 'live', 'in', 'in_progress'].includes(status)
}

const applyScore = (home: GroupStanding, away: GroupStanding, homeScore: number, awayScore: number) => {
  home.played += 1
  away.played += 1
  home.goalsFor += homeScore
  home.goalsAgainst += awayScore
  away.goalsFor += awayScore
  away.goalsAgainst += homeScore
  home.goalDifference = home.goalsFor - home.goalsAgainst
  away.goalDifference = away.goalsFor - away.goalsAgainst

  if (homeScore > awayScore) {
    home.wins += 1
    away.losses += 1
    home.points += 3
  } else if (awayScore > homeScore) {
    away.wins += 1
    home.losses += 1
    away.points += 3
  } else {
    home.draws += 1
    away.draws += 1
    home.points += 1
    away.points += 1
  }
}

const sortStandings = <T extends Pick<GroupStanding, 'points' | 'goalDifference' | 'goalsFor' | 'wins' | 'seedIndex'>>(standings: T[]) =>
  standings.slice().sort((left, right) => {
    const pointsDelta = right.points - left.points
    if (pointsDelta !== 0) return pointsDelta

    const goalDifferenceDelta = right.goalDifference - left.goalDifference
    if (goalDifferenceDelta !== 0) return goalDifferenceDelta

    const goalsForDelta = right.goalsFor - left.goalsFor
    if (goalsForDelta !== 0) return goalsForDelta

    const winsDelta = right.wins - left.wins
    if (winsDelta !== 0) return winsDelta

    return left.seedIndex - right.seedIndex
  })
