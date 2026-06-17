import type { Room } from '../types'

export const rooms: Room[] = [
  {
    slug: 'conway',
    name: 'Conway',
    description: 'Company prediction room.',
    authMode: 'room_password',
    passwordHint: 'Pass code',
    lockAt: '2026-06-11T18:00:00.000Z',
  },
  {
    slug: 'larooch',
    name: 'Larooch',
    description: 'Family prediction room.',
    authMode: 'room_password',
    passwordHint: 'Pass code',
    lockAt: '2026-06-11T18:00:00.000Z',
  },
  {
    slug: 'sixseven',
    name: 'Purdue Gooners',
    description: 'Purdue Gooners prediction room.',
    authMode: 'room_password',
    passwordHint: 'Pass code',
    lockAt: '2026-06-11T18:00:00.000Z',
  },
  {
    slug: 'master',
    name: 'Master',
    description: 'Combined prediction room.',
    authMode: 'room_password',
    passwordHint: 'Pass code',
    lockAt: '2026-06-11T18:00:00.000Z',
  },
]

export const roomBySlug = Object.fromEntries(rooms.map((room) => [room.slug, room])) as Record<
  string,
  Room
>
