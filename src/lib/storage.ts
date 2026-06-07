import type { BracketSubmission } from '../types'

const STORAGE_KEY = 'world-cup-26-brackets:v1'
const SESSION_KEY = 'world-cup-26-session:v1'

export interface StoredRoomSession {
  roomSlug: string
  ownerName: string
  ownerEmail?: string
}

export const loadLocalSubmissions = (): BracketSubmission[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveLocalSubmissions = (submissions: BracketSubmission[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions))
}

export const upsertLocalSubmission = (
  submissions: BracketSubmission[],
  nextSubmission: BracketSubmission,
) => {
  const existingIndex = submissions.findIndex((submission) => submission.id === nextSubmission.id)

  if (existingIndex === -1) return [...submissions, nextSubmission]

  return submissions.map((submission, index) => (index === existingIndex ? nextSubmission : submission))
}

export const loadStoredRoomSession = (roomSlug: string): StoredRoomSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<Record<string, StoredRoomSession>>
    return parsed[roomSlug] ?? null
  } catch {
    return null
  }
}

export const saveStoredRoomSession = (session: StoredRoomSession) => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Record<string, StoredRoomSession>>) : {}
    parsed[session.roomSlug] = session
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(parsed))
  } catch {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ [session.roomSlug]: session }))
  }
}
