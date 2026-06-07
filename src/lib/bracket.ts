import { knockoutMatches } from '../data/bracket'
import { teams, teamsByGroup, teamsById } from '../data/teams'
import { GROUP_IDS, type BracketPicks, type EntrantSlot, type GroupId, type ResolvedMatch, type TeamId } from '../types'

export const roundLabels = {
  round32: 'Round of 32',
  round16: 'Round of 16',
  quarterfinal: 'Quarter-finals',
  semifinal: 'Semi-finals',
  final: 'Final',
} as const

export const getFlagUrl = (countryCode: string) => `https://flagcdn.com/${countryCode}.svg`

export const formatEmailName = (email: string) => {
  const localPart = email.split('@')[0] ?? email
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export const createInitialPicks = (): BracketPicks => {
  const groupOrder = GROUP_IDS.reduce(
    (order, group) => {
      order[group] = [null, null, null, null]
      return order
    },
    {} as BracketPicks['groupOrder'],
  )

  return {
    groupOrder,
    thirdPlaceAdvancers: [],
    knockoutWinners: {},
  }
}

export const createRankedPicksByFifa = (): BracketPicks => {
  const groupOrder = GROUP_IDS.reduce(
    (order, group) => {
      order[group] = [...teamsByGroup[group]]
        .sort((left, right) => left.fifaRank - right.fifaRank)
        .map((item) => item.id)
      return order
    },
    {} as BracketPicks['groupOrder'],
  )

  const thirdPlaceAdvancers = GROUP_IDS.map((group) => ({
    group,
    teamId: groupOrder[group][2],
  }))
    .filter((item): item is { group: GroupId; teamId: TeamId } => Boolean(item.teamId))
    .sort((left, right) => teamsById[left.teamId].fifaRank - teamsById[right.teamId].fifaRank)
    .slice(0, 8)
    .map((item) => item.group)

  return {
    groupOrder,
    thirdPlaceAdvancers,
    knockoutWinners: {},
  }
}

const resolveThirdPlaceAssignments = (picks: BracketPicks) => {
  const assignments = new Map<string, GroupId>()
  const used = new Set<GroupId>()
  const selected = picks.thirdPlaceAdvancers

  for (const match of knockoutMatches.filter((item) => item.round === 'round32')) {
    match.slots.forEach((slot, slotIndex) => {
      if (slot.type !== 'thirdPlace') return

      const eligible = selected.find((group) => slot.groups.includes(group) && !used.has(group))
      const fallback = selected.find((group) => !used.has(group))
      const assigned = eligible ?? fallback

      if (assigned) {
        used.add(assigned)
        assignments.set(`${match.id}:${slotIndex}`, assigned)
      }
    })
  }

  return assignments
}

const resolveSlot = (
  slot: EntrantSlot,
  slotKey: string,
  picks: BracketPicks,
  winners: Record<string, TeamId | null>,
  thirdAssignments: Map<string, GroupId>,
): TeamId | null => {
  if (slot.type === 'groupRank') {
    const teamId = picks.groupOrder[slot.group][slot.rank - 1]
    return teamId ?? null
  }

  if (slot.type === 'thirdPlace') {
    const group = thirdAssignments.get(slotKey)
    const teamId = group ? picks.groupOrder[group][2] : null
    return teamId ?? null
  }

  return winners[slot.matchId] ?? null
}

export const buildResolvedBracket = (picks: BracketPicks): ResolvedMatch[] => {
  const winners: Record<string, TeamId | null> = {}
  const thirdAssignments = resolveThirdPlaceAssignments(picks)

  return knockoutMatches.map((match) => {
    const teamsForMatch = match.slots.map((slot, slotIndex) =>
      resolveSlot(slot, `${match.id}:${slotIndex}`, picks, winners, thirdAssignments),
    ) as [TeamId | null, TeamId | null]

    const selected = picks.knockoutWinners[match.id] ?? null
    const selectedWinner = selected && teamsForMatch.includes(selected) ? selected : null
    winners[match.id] = selectedWinner

    return {
      ...match,
      teams: teamsForMatch,
      selectedWinner,
    }
  })
}

export const isBracketComplete = (picks: BracketPicks) => {
  if (!isGroupStageComplete(picks)) return false
  if (picks.thirdPlaceAdvancers.length !== 8) return false

  const matches = buildResolvedBracket(picks)
  return matches.every((match) => match.teams.every(Boolean) && Boolean(match.selectedWinner))
}

export const isGroupStageComplete = (picks: BracketPicks) =>
  GROUP_IDS.every((group) => picks.groupOrder[group].filter(Boolean).length === 4)

export const getChampion = (picks: BracketPicks) => {
  const final = buildResolvedBracket(picks).find((match) => match.id === 'M104')
  return final?.selectedWinner ?? null
}

export const setWinner = (picks: BracketPicks, matchId: string, winnerId: TeamId): BracketPicks => ({
  ...picks,
  knockoutWinners: {
    ...picks.knockoutWinners,
    [matchId]: winnerId,
  },
})

export const placeTeamInGroup = (
  picks: BracketPicks,
  group: GroupId,
  teamId: TeamId,
  targetIndex: number,
): BracketPicks => {
  const current = picks.groupOrder[group]
  const nextOrder = [...current]
  const sourceIndex = nextOrder.indexOf(teamId)
  const targetTeam = nextOrder[targetIndex] ?? null

  if (sourceIndex >= 0) {
    nextOrder[sourceIndex] = targetTeam
  }

  nextOrder[targetIndex] = teamId

  return {
    ...picks,
    groupOrder: {
      ...picks.groupOrder,
      [group]: nextOrder,
    },
    thirdPlaceAdvancers: picks.thirdPlaceAdvancers.filter((item) => {
      if (item !== group) return true
      return Boolean(nextOrder[2])
    }),
    knockoutWinners: {},
  }
}

export const removeTeamFromGroup = (
  picks: BracketPicks,
  group: GroupId,
  teamId: TeamId,
): BracketPicks => {
  const nextOrder = picks.groupOrder[group].map((item) => (item === teamId ? null : item))

  return {
    ...picks,
    groupOrder: {
      ...picks.groupOrder,
      [group]: nextOrder,
    },
    thirdPlaceAdvancers: picks.thirdPlaceAdvancers.filter((item) => item !== group),
    knockoutWinners: {},
  }
}

export const toggleThirdPlace = (picks: BracketPicks, group: GroupId): BracketPicks => {
  const selected = picks.thirdPlaceAdvancers.includes(group)

  if (!selected && picks.thirdPlaceAdvancers.length >= 8) return picks

  return {
    ...picks,
    thirdPlaceAdvancers: selected
      ? picks.thirdPlaceAdvancers.filter((item) => item !== group)
      : [...picks.thirdPlaceAdvancers, group],
    knockoutWinners: {},
  }
}

export const autoPickRemainingByRank = (picks: BracketPicks, preferredChampion?: TeamId): BracketPicks => {
  let next = {
    ...picks,
    knockoutWinners: { ...picks.knockoutWinners },
  }
  let changed = true

  while (changed) {
    changed = false

    for (const match of buildResolvedBracket(next)) {
      const [left, right] = match.teams
      if (!left || !right || match.selectedWinner) continue

      if (preferredChampion && match.teams.includes(preferredChampion)) {
        next = setWinner(next, match.id, preferredChampion)
        changed = true
        continue
      }

      const winner = teamsById[left].fifaRank <= teamsById[right].fifaRank ? left : right
      next = setWinner(next, match.id, winner)
      changed = true
    }
  }

  return next
}

export const getTeamSeedLabel = (teamId: TeamId) => {
  const team = teamsById[teamId]
  if (!team) return ''

  return `Group ${team.group} - FIFA ${team.fifaRank}`
}

export const getGroupWinners = (picks: BracketPicks) =>
  GROUP_IDS.map((group) => picks.groupOrder[group][0]).filter((teamId): teamId is TeamId => Boolean(teamId))

export const getAllTeamIds = () => teams.map((team) => team.id)
