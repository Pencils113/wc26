import { rooms } from '../data/rooms'
import type { BracketSubmission, Room } from '../types'
import { autoPickRemainingByRank, createRankedPicksByFifa } from './bracket'

const buildSubmission = (
  room: Room,
  ownerName: string,
  championId: string,
  submittedAt: string,
): BracketSubmission => {
  const picks = autoPickRemainingByRank(createRankedPicksByFifa(), championId)

  return {
    ...picks,
    id: `seed-${room.slug}-${ownerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    roomSlug: room.slug,
    ownerName,
    submittedAt,
    updatedAt: submittedAt,
    source: 'seed',
  }
}

export const sampleSubmissions = rooms.flatMap((room) => [
  buildSubmission(room, 'Chalk Bot', 'france', '2026-06-01T16:00:00.000Z'),
  buildSubmission(room, 'Chaos Bot', 'brazil', '2026-06-02T17:30:00.000Z'),
  buildSubmission(room, 'Host Bot', room.slug === 'conway' ? 'united-states' : 'argentina', '2026-06-03T19:45:00.000Z'),
])
