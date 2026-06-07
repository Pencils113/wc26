import { knockoutMatches } from '../data/bracket'
import type { KnockoutMatchDefinition, KnockoutRound, MatchId } from '../types'

export const KNOCKOUT_ROUND_ORDER = ['round32', 'round16', 'quarterfinal', 'semifinal', 'final'] as const satisfies KnockoutRound[]

const ROW_SPAN = 4
const LEAF_ROW_SPACING = 4
const FIRST_ROW = 1

export interface KnockoutMatchLayout {
  column: number
  row: number
  rowSpan: number
}

const getSourceMatchIds = (match: KnockoutMatchDefinition) =>
  match.slots.flatMap((slot) => (slot.type === 'matchWinner' ? [slot.matchId] : []))

export const buildKnockoutLayout = (matches: KnockoutMatchDefinition[] = knockoutMatches): Record<MatchId, KnockoutMatchLayout> => {
  const matchesById = new Map(matches.map((match) => [match.id, match]))
  const finalMatch = matches.find((match) => match.round === 'final')

  if (!finalMatch) return {}

  const leafOrder: MatchId[] = []

  const visitLeaves = (matchId: MatchId) => {
    const match = matchesById.get(matchId)
    if (!match) return

    const sourceIds = getSourceMatchIds(match)
    if (sourceIds.length === 0) {
      leafOrder.push(match.id)
      return
    }

    sourceIds.forEach(visitLeaves)
  }

  visitLeaves(finalMatch.id)

  const layout: Record<MatchId, KnockoutMatchLayout> = {}
  leafOrder.forEach((matchId, index) => {
    const match = matchesById.get(matchId)
    if (!match) return

    layout[matchId] = {
      column: KNOCKOUT_ROUND_ORDER.indexOf(match.round) + 1,
      row: FIRST_ROW + index * LEAF_ROW_SPACING,
      rowSpan: ROW_SPAN,
    }
  })

  const resolveRow = (matchId: MatchId): number => {
    const existing = layout[matchId]
    if (existing) return existing.row

    const match = matchesById.get(matchId)
    if (!match) return FIRST_ROW

    const sourceIds = getSourceMatchIds(match)
    const sourceCenters = sourceIds.map((sourceId) => resolveRow(sourceId) + ROW_SPAN / 2)
    const center = sourceCenters.length > 0
      ? sourceCenters.reduce((sum, value) => sum + value, 0) / sourceCenters.length
      : FIRST_ROW + ROW_SPAN / 2

    layout[matchId] = {
      column: KNOCKOUT_ROUND_ORDER.indexOf(match.round) + 1,
      row: Math.round(center - ROW_SPAN / 2),
      rowSpan: ROW_SPAN,
    }

    return layout[matchId].row
  }

  matches.forEach((match) => resolveRow(match.id))

  return layout
}

export const knockoutLayout = buildKnockoutLayout()
