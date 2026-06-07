export const GROUP_IDS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
] as const

export type GroupId = (typeof GROUP_IDS)[number]
export type TeamId = string
export type MatchId = string

export type RoomAuthMode = 'room_password'

export interface Room {
  slug: string
  name: string
  description: string
  authMode: RoomAuthMode
  lockAt: string
  passwordHint?: string
}

export interface PlayerNote {
  name: string
  note: string
}

export interface Team {
  id: TeamId
  name: string
  shortName: string
  code: string
  countryCode: string
  group: GroupId
  confederation: string
  fifaRank: number
  appearances: number
  bestFinish: string
  recentForm: string
  style: string
  color: string
  keyPlayers: PlayerNote[]
}

export type GroupPicks = Record<GroupId, Array<TeamId | null>>

export interface BracketPicks {
  groupOrder: GroupPicks
  thirdPlaceAdvancers: GroupId[]
  knockoutWinners: Record<MatchId, TeamId>
}

export interface BracketSubmission extends BracketPicks {
  id: string
  roomSlug: string
  ownerName: string
  ownerEmail?: string
  submittedAt: string
  updatedAt: string
  source: 'local' | 'seed' | 'supabase'
}

export type EntrantSlot =
  | {
      type: 'groupRank'
      group: GroupId
      rank: 1 | 2
      label: string
    }
  | {
      type: 'thirdPlace'
      groups: GroupId[]
      label: string
    }
  | {
      type: 'matchWinner'
      matchId: MatchId
      label: string
    }

export type KnockoutRound =
  | 'round32'
  | 'round16'
  | 'quarterfinal'
  | 'semifinal'
  | 'final'

export interface KnockoutMatchDefinition {
  id: MatchId
  round: KnockoutRound
  label: string
  sortOrder: number
  slots: [EntrantSlot, EntrantSlot]
  date: string
  venue: string
  points: number
}

export interface ResolvedMatch extends KnockoutMatchDefinition {
  teams: [TeamId | null, TeamId | null]
  selectedWinner: TeamId | null
}

export interface ActualResults {
  updatedAt: string
  source: string
  groupOrder: Partial<Record<GroupId, TeamId[]>>
  thirdPlaceAdvancers: GroupId[]
  knockoutWinners: Record<MatchId, TeamId>
}

export interface MatchResult {
  id: MatchId
  stage: string
  homeTeamId?: TeamId
  awayTeamId?: TeamId
  homeScore: number | null
  awayScore: number | null
  winnerTeamId?: TeamId
  startsAt?: string
  status: string
  statusDetail?: string
  displayClock?: string
  updatedAt: string
}

export interface ScoreBreakdown {
  groupAdvancement: number
  groupPlacement: number
  knockout: number
  total: number
  possible: number
}

export interface LeaderboardEntry {
  submission: BracketSubmission
  score: ScoreBreakdown
  champion: TeamId | null
}
