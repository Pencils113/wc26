import { emptyActualResults } from '../data/results'
import type { ActualResults, BracketPicks, BracketSubmission, Room } from '../types'
import { hasSupabaseConfig, requireSupabase, supabase } from './supabaseClient'

interface BracketSubmissionRow {
  id: string
  room_slug: string
  owner_email: string | null
  display_name: string
  picks: BracketPicks
  submitted_at: string
  updated_at: string
}

interface ActualResultsRow {
  group_order: ActualResults['groupOrder']
  third_place_advancers: string[]
  knockout_winners: ActualResults['knockoutWinners']
  source: string
  updated_at: string
}

export interface RemoteSubmitInput {
  picks: BracketPicks
  room: Room
  roomPasscode: string
  session: {
    ownerName: string
    ownerEmail?: string
  }
}

export const fetchRemoteSubmissions = async (roomSlug: string): Promise<BracketSubmission[]> => {
  const client = requireSupabase()
  const { data, error } = await client
    .from('bracket_submissions')
    .select('*')
    .eq('room_slug', roomSlug)
    .order('submitted_at', { ascending: true })

  if (error) throw error

  return ((data ?? []) as BracketSubmissionRow[]).map(mapSubmissionRow)
}

export const fetchRemoteActualResults = async (): Promise<ActualResults> => {
  const client = requireSupabase()
  const { data, error } = await client
    .from('actual_results')
    .select('group_order, third_place_advancers, knockout_winners, source, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error
  if (!data) return emptyActualResults

  return mapActualResultsRow(data as ActualResultsRow)
}

export const submitRemoteBracket = async ({
  picks,
  room,
  roomPasscode,
  session,
}: RemoteSubmitInput) => {
  const client = requireSupabase()

  const { error } = await client.rpc('submit_password_room_bracket', {
    room_slug: room.slug,
    room_password: roomPasscode,
    display_name: session.ownerName,
    picks,
  })

  if (error) throw error
}

export const subscribeToRemotePoolUpdates = (onUpdate: () => void) => {
  if (!hasSupabaseConfig || !supabase) return () => undefined

  const client = supabase
  const channel = client
    .channel('world-cup-pool-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'brackets' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'actual_results' }, onUpdate)
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}

const mapSubmissionRow = (row: BracketSubmissionRow): BracketSubmission => ({
  id: row.id,
  roomSlug: row.room_slug,
  ownerEmail: row.owner_email ?? undefined,
  ownerName: row.display_name,
  submittedAt: row.submitted_at,
  updatedAt: row.updated_at,
  source: 'supabase',
  groupOrder: row.picks.groupOrder,
  thirdPlaceAdvancers: row.picks.thirdPlaceAdvancers,
  knockoutWinners: row.picks.knockoutWinners,
})

const mapActualResultsRow = (row: ActualResultsRow): ActualResults => ({
  groupOrder: row.group_order ?? {},
  thirdPlaceAdvancers: row.third_place_advancers as ActualResults['thirdPlaceAdvancers'],
  knockoutWinners: row.knockout_winners ?? {},
  source: row.source,
  updatedAt: row.updated_at,
})
