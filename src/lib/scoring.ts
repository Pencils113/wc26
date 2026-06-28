import { knockoutMatches } from '../data/bracket'
import { GROUP_IDS, type ActualResults, type BracketPicks, type BracketSubmission, type LeaderboardEntry, type MatchResult, type ScoreBreakdown, type TeamId } from '../types'
import { buildResolvedBracket, getChampion } from './bracket'

const GROUP_ADVANCER_POINTS = 2
const GROUP_WINNER_POINTS = 3
const GROUP_RUNNER_UP_POINTS = 2
const GROUP_THIRD_POINTS = 1

const MAX_GROUP_POINTS = 64 + 36 + 24 + 12
const MAX_KNOCKOUT_POINTS = knockoutMatches.reduce((sum, match) => sum + match.points, 0)
export const MAX_TOTAL_POINTS = MAX_GROUP_POINTS + MAX_KNOCKOUT_POINTS
const ROUND_OF_32_MATCH_IDS = new Set(knockoutMatches.filter((match) => match.round === 'round32').map((match) => match.id))

export const scoreSubmission = (
  submission: BracketSubmission,
  actualResults: ActualResults,
  matchResults: MatchResult[] = [],
): ScoreBreakdown => {
  let groupAdvancement = 0
  let groupPlacement = 0
  let knockout = 0
  const matchResultsById = new Map(matchResults.map((matchResult) => [matchResult.id, matchResult]))

  for (const group of GROUP_IDS) {
    const actualOrder = actualResults.groupOrder[group]
    if (!actualOrder || actualOrder.length < 4) continue

    const predictedOrder = submission.groupOrder[group]
    const actualAdvancers = new Set([actualOrder[0], actualOrder[1]])

    if (actualResults.thirdPlaceAdvancers.includes(group)) {
      actualAdvancers.add(actualOrder[2])
    }

    const predictedAdvancers = [predictedOrder[0], predictedOrder[1]].filter(
      (teamId): teamId is string => Boolean(teamId),
    )

    if (submission.thirdPlaceAdvancers.includes(group)) {
      const thirdTeamId = predictedOrder[2]
      if (thirdTeamId) predictedAdvancers.push(thirdTeamId)
    }

    for (const teamId of predictedAdvancers) {
      if (actualAdvancers.has(teamId)) groupAdvancement += GROUP_ADVANCER_POINTS
    }

    if (predictedOrder[0] === actualOrder[0]) groupPlacement += GROUP_WINNER_POINTS
    if (predictedOrder[1] === actualOrder[1]) groupPlacement += GROUP_RUNNER_UP_POINTS
    if (predictedOrder[2] === actualOrder[2]) groupPlacement += GROUP_THIRD_POINTS
  }

  for (const match of knockoutMatches) {
    const actualWinner = getActualKnockoutWinner(match.id, actualResults, matchResultsById)
    if (!actualWinner) continue
    if (submission.knockoutWinners[match.id] === actualWinner) knockout += match.points
  }

  const total = groupAdvancement + groupPlacement + knockout

  return {
    groupAdvancement,
    groupPlacement,
    knockout,
    total,
    possible: estimatePossible(submission, total, actualResults, matchResultsById),
  }
}

const estimatePossible = (
  submission: BracketSubmission,
  currentScore: number,
  actualResults: ActualResults,
  matchResultsById: Map<string, MatchResult>,
) => {
  const thirdPlaceTableResolved = actualResults.thirdPlaceAdvancers.length === 8
  const completedGroupPoints = GROUP_IDS.reduce((sum, group) => {
    const complete = (actualResults.groupOrder[group]?.length ?? 0) >= 4
    if (!complete) return sum

    const thirdPlacePoints = thirdPlaceTableResolved && actualResults.thirdPlaceAdvancers.includes(group) ? 2 : 0
    return sum + 10 + thirdPlacePoints
  }, 0)
  const unresolvedGroupPoints = Math.max(0, MAX_GROUP_POINTS - completedGroupPoints)
  const roundOf32KnownSlots = countKnownRoundOf32TeamSlots(matchResultsById)

  if (roundOf32KnownSlots < 32) {
    const completedKnockoutPoints = knockoutMatches.reduce((sum, match) => {
      return sum + (getActualKnockoutWinner(match.id, actualResults, matchResultsById) ? match.points : 0)
    }, 0)
    const unresolvedPoints = MAX_TOTAL_POINTS - completedGroupPoints - completedKnockoutPoints
    return Math.max(currentScore, currentScore + unresolvedPoints)
  }

  const possibleTeamsByMatch = buildPossibleTeamsByMatch(actualResults, matchResultsById)
  const remainingKnockoutPoints = knockoutMatches.reduce((sum, match) => {
    if (getActualKnockoutWinner(match.id, actualResults, matchResultsById)) return sum

    const pickedWinner = submission.knockoutWinners[match.id]
    const possibleTeams = possibleTeamsByMatch.get(match.id)
    return pickedWinner && possibleTeams?.has(pickedWinner) ? sum + match.points : sum
  }, 0)

  return Math.max(currentScore, currentScore + unresolvedGroupPoints + remainingKnockoutPoints)
}

const countKnownRoundOf32TeamSlots = (matchResultsById: Map<string, MatchResult>) =>
  Array.from(ROUND_OF_32_MATCH_IDS).reduce((count, matchId) => {
    const matchResult = matchResultsById.get(matchId)
    return count + (matchResult?.homeTeamId ? 1 : 0) + (matchResult?.awayTeamId ? 1 : 0)
  }, 0)

const buildPossibleTeamsByMatch = (
  actualResults: ActualResults,
  matchResultsById: Map<string, MatchResult>,
) => {
  const possibleTeamsByMatch = new Map<string, Set<TeamId>>()
  const fallbackMatchesById = new Map(buildResolvedBracket(buildActualPicks(actualResults)).map((match) => [match.id, match]))

  for (const match of knockoutMatches) {
    const actualWinner = getActualKnockoutWinner(match.id, actualResults, matchResultsById)
    if (actualWinner) {
      possibleTeamsByMatch.set(match.id, new Set([actualWinner]))
      continue
    }

    const matchResult = matchResultsById.get(match.id)
    const possibleTeams = new Set<TeamId>()

    if (match.round === 'round32') {
      if (matchResult?.homeTeamId) possibleTeams.add(matchResult.homeTeamId)
      if (matchResult?.awayTeamId) possibleTeams.add(matchResult.awayTeamId)
    } else {
      for (const slot of match.slots) {
        if (slot.type !== 'matchWinner') continue

        const sourceTeams = possibleTeamsByMatch.get(slot.matchId)
        sourceTeams?.forEach((teamId) => possibleTeams.add(teamId))
      }
    }

    if (possibleTeams.size === 0) {
      if (matchResult?.homeTeamId) possibleTeams.add(matchResult.homeTeamId)
      if (matchResult?.awayTeamId) possibleTeams.add(matchResult.awayTeamId)
    }

    if (possibleTeams.size === 0) {
      const fallbackMatch = fallbackMatchesById.get(match.id)
      fallbackMatch?.teams.forEach((teamId) => {
        if (teamId) possibleTeams.add(teamId)
      })
    }

    possibleTeamsByMatch.set(match.id, possibleTeams)
  }

  return possibleTeamsByMatch
}

const buildActualPicks = (actualResults: ActualResults): BracketPicks => {
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

  return {
    groupOrder,
    thirdPlaceAdvancers: actualResults.thirdPlaceAdvancers,
    knockoutWinners: actualResults.knockoutWinners,
  }
}

const getActualKnockoutWinner = (
  matchId: string,
  actualResults: ActualResults,
  matchResultsById: Map<string, MatchResult>,
) => actualResults.knockoutWinners[matchId] ?? matchResultsById.get(matchId)?.winnerTeamId

export const buildLeaderboard = (
  submissions: BracketSubmission[],
  actualResults: ActualResults,
  matchResults: MatchResult[] = [],
): LeaderboardEntry[] =>
  submissions
    .map((submission) => ({
      submission,
      score: scoreSubmission(submission, actualResults, matchResults),
      champion: getChampion(submission),
    }))
    .sort((left, right) => {
      if (right.score.total !== left.score.total) return right.score.total - left.score.total
      if (right.score.possible !== left.score.possible) return right.score.possible - left.score.possible
      return left.submission.submittedAt.localeCompare(right.submission.submittedAt)
    })
