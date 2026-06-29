import { teams } from '../data/teams'
import { knockoutMatches } from '../data/bracket'
import { GROUP_IDS, type ActualResults, type BracketPicks, type BracketSubmission, type KnockoutRound, type MatchResult, type TeamId } from '../types'
import { buildResolvedBracket, getStoredChampion } from './bracket'

export type MapStage =
  | 'field'
  | 'round32'
  | 'round16'
  | 'quarterfinal'
  | 'semifinal'
  | 'finalist'
  | 'champion'

export type TeamMapStages = Record<TeamId, MapStage>

export interface TeamMapInsight {
  entryCount: number
  furthestStage: MapStage
  furthestOwners: string[]
  earliestStage: MapStage
  earliestOwners: string[]
}

export const mapStageLabels: Record<MapStage, string> = {
  field: 'Field',
  round32: 'R32',
  round16: 'R16',
  quarterfinal: 'QF',
  semifinal: 'SF',
  finalist: 'Final',
  champion: 'Champ',
}

export const mapStageRank: Record<MapStage, number> = {
  field: 0,
  round32: 1,
  round16: 2,
  quarterfinal: 3,
  semifinal: 4,
  finalist: 5,
  champion: 6,
}

const roundStage: Record<KnockoutRound, MapStage> = {
  round32: 'round32',
  round16: 'round16',
  quarterfinal: 'quarterfinal',
  semifinal: 'semifinal',
  final: 'finalist',
}

const baseStages = (): TeamMapStages =>
  Object.fromEntries(teams.map((team) => [team.id, 'field'])) as TeamMapStages

const promote = (stages: TeamMapStages, teamId: TeamId | null, stage: MapStage) => {
  if (!teamId) return
  if (mapStageRank[stage] > mapStageRank[stages[teamId]]) {
    stages[teamId] = stage
  }
}

export const getPredictionTeamMapStages = (picks: BracketPicks): TeamMapStages => {
  const stages = baseStages()

  for (const match of buildResolvedBracket(picks)) {
    for (const teamId of match.teams) {
      promote(stages, teamId, roundStage[match.round])
    }
  }

  promote(stages, getStoredChampion(picks), 'champion')
  return stages
}

const getLiveKnockoutWinners = (matchResults: MatchResult[]) => {
  const matchResultsById = new Map(matchResults.map((matchResult) => [matchResult.id, matchResult]))

  return Object.fromEntries(
    knockoutMatches.flatMap((match) => {
      const winner = matchResultsById.get(match.id)?.winnerTeamId
      return winner ? [[match.id, winner]] : []
    }),
  ) as BracketPicks['knockoutWinners']
}

export const getActualTeamMapStages = (actualResults: ActualResults, matchResults: MatchResult[] = []): TeamMapStages => {
  const groupOrder = GROUP_IDS.reduce(
    (order, group) => {
      const actualOrder = actualResults.groupOrder[group] ?? []
      order[group] = [
        actualOrder[0] ?? null,
        actualOrder[1] ?? null,
        actualOrder[2] ?? null,
        actualOrder[3] ?? null,
      ]
      return order
    },
    {} as BracketPicks['groupOrder'],
  )
  const liveKnockoutWinners = getLiveKnockoutWinners(matchResults)

  return getPredictionTeamMapStages({
    groupOrder,
    thirdPlaceAdvancers: actualResults.thirdPlaceAdvancers,
    knockoutWinners: {
      ...actualResults.knockoutWinners,
      ...liveKnockoutWinners,
    },
  })
}

export const getBestMapStage = (stages: MapStage[]) =>
  stages.reduce<MapStage>((best, stage) => (mapStageRank[stage] > mapStageRank[best] ? stage : best), 'field')

export const buildTeamMapInsights = (submissions: BracketSubmission[]) => {
  const insights: Partial<Record<TeamId, TeamMapInsight>> = {}

  for (const submission of submissions) {
    const submissionStages = getPredictionTeamMapStages(submission)

    for (const team of teams) {
      const stage = submissionStages[team.id] ?? 'field'
      const existing = insights[team.id]

      if (!existing) {
        insights[team.id] = {
          entryCount: 1,
          furthestStage: stage,
          furthestOwners: [submission.ownerName],
          earliestStage: stage,
          earliestOwners: [submission.ownerName],
        }
        continue
      }

      existing.entryCount += 1

      if (mapStageRank[stage] > mapStageRank[existing.furthestStage]) {
        existing.furthestStage = stage
        existing.furthestOwners = [submission.ownerName]
      } else if (stage === existing.furthestStage) {
        existing.furthestOwners.push(submission.ownerName)
      }

      if (mapStageRank[stage] < mapStageRank[existing.earliestStage]) {
        existing.earliestStage = stage
        existing.earliestOwners = [submission.ownerName]
      } else if (stage === existing.earliestStage) {
        existing.earliestOwners.push(submission.ownerName)
      }
    }
  }

  return insights
}
