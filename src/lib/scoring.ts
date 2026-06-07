import { knockoutMatches } from '../data/bracket'
import { GROUP_IDS, type ActualResults, type BracketSubmission, type LeaderboardEntry, type ScoreBreakdown } from '../types'
import { getChampion } from './bracket'

const GROUP_ADVANCER_POINTS = 2
const GROUP_WINNER_POINTS = 3
const GROUP_RUNNER_UP_POINTS = 2
const GROUP_THIRD_POINTS = 1

const MAX_GROUP_POINTS = 64 + 36 + 24 + 12
const MAX_KNOCKOUT_POINTS = knockoutMatches.reduce((sum, match) => sum + match.points, 0)
export const MAX_TOTAL_POINTS = MAX_GROUP_POINTS + MAX_KNOCKOUT_POINTS

export const scoreSubmission = (
  submission: BracketSubmission,
  actualResults: ActualResults,
): ScoreBreakdown => {
  let groupAdvancement = 0
  let groupPlacement = 0
  let knockout = 0

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
    const actualWinner = actualResults.knockoutWinners[match.id]
    if (!actualWinner) continue
    if (submission.knockoutWinners[match.id] === actualWinner) knockout += match.points
  }

  const total = groupAdvancement + groupPlacement + knockout

  return {
    groupAdvancement,
    groupPlacement,
    knockout,
    total,
    possible: estimatePossible(total, actualResults),
  }
}

const estimatePossible = (currentScore: number, actualResults: ActualResults) => {
  const completedGroupPoints = GROUP_IDS.reduce((sum, group) => {
    const complete = (actualResults.groupOrder[group]?.length ?? 0) >= 4
    return sum + (complete ? 12 : 0)
  }, 0)
  const completedKnockoutPoints = knockoutMatches.reduce((sum, match) => {
    return sum + (actualResults.knockoutWinners[match.id] ? match.points : 0)
  }, 0)

  const unresolvedPoints = MAX_TOTAL_POINTS - completedGroupPoints - completedKnockoutPoints
  return currentScore + unresolvedPoints
}

export const buildLeaderboard = (
  submissions: BracketSubmission[],
  actualResults: ActualResults,
): LeaderboardEntry[] =>
  submissions
    .map((submission) => ({
      submission,
      score: scoreSubmission(submission, actualResults),
      champion: getChampion(submission),
    }))
    .sort((left, right) => {
      if (right.score.total !== left.score.total) return right.score.total - left.score.total
      if (right.score.possible !== left.score.possible) return right.score.possible - left.score.possible
      return left.submission.submittedAt.localeCompare(right.submission.submittedAt)
    })
