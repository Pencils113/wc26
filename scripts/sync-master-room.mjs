import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const REQUIRED_CONFIRMATION = 'sync-master-room'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const confirmation = process.env.CONFIRM_SYNC_MASTER_ROOM
const masterRoomSlug = process.env.MASTER_ROOM_SLUG?.trim().toLowerCase() || 'master'
const masterRoomName = process.env.MASTER_ROOM_NAME?.trim() || 'Master'
const masterRoomDescription = process.env.MASTER_ROOM_DESCRIPTION?.trim() || 'Combined prediction room.'
const masterRoomLockAt = process.env.MASTER_ROOM_LOCK_AT?.trim() || '2026-06-11T18:00:00Z'
const sourceRoomSlugs = (process.env.SOURCE_ROOM_SLUGS || 'conway,larooch,sixseven')
  .split(',')
  .map((slug) => slug.trim().toLowerCase())
  .filter(Boolean)

const sourceLabels = {
  conway: 'Conway',
  larooch: 'Larooch',
  sixseven: 'Purdue',
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (confirmation !== REQUIRED_CONFIRMATION) {
  console.error(`Refusing to sync master room. Set CONFIRM_SYNC_MASTER_ROOM=${REQUIRED_CONFIRMATION}`)
  process.exit(1)
}

if (sourceRoomSlugs.length === 0) {
  console.error('SOURCE_ROOM_SLUGS must include at least one room')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const hashPicks = (picks) => crypto.createHash('sha256').update(JSON.stringify(picks)).digest('hex')
const ownerKeyFromName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase()
const copiedDisplayName = (submission) => {
  const label = sourceLabels[submission.room_slug] || submission.room_name || submission.room_slug
  return `${submission.display_name} (${label})`
}

const { data: masterRooms, error: masterRoomError } = await supabase
  .from('rooms')
  .upsert({
    slug: masterRoomSlug,
    name: masterRoomName,
    description: masterRoomDescription,
    auth_mode: 'room_password',
    email_domain: null,
    password_hash: null,
    lock_at: masterRoomLockAt,
  }, { onConflict: 'slug' })
  .select('id, slug, name')

if (masterRoomError) throw masterRoomError
const masterRoom = masterRooms?.[0]
if (!masterRoom) throw new Error(`Master room was not returned after upsert: ${masterRoomSlug}`)

const { data: sourceRows, error: sourceError } = await supabase
  .from('bracket_submissions')
  .select('id, room_slug, display_name, picks, submitted_at')
  .in('room_slug', sourceRoomSlugs)
  .order('room_slug', { ascending: true })
  .order('display_name', { ascending: true })

if (sourceError) throw sourceError
if (!sourceRows || sourceRows.length === 0) {
  throw new Error(`No source submissions found for rooms: ${sourceRoomSlugs.join(', ')}`)
}

const foundRooms = new Set(sourceRows.map((row) => row.room_slug))
const missingRooms = sourceRoomSlugs.filter((slug) => !foundRooms.has(slug))
if (missingRooms.length > 0) {
  console.warn(`No submissions found for source room(s): ${missingRooms.join(', ')}`)
}

const { data: existingRows, error: existingError } = await supabase
  .from('brackets')
  .select('id, display_name, owner_key')
  .eq('room_id', masterRoom.id)

if (existingError) throw existingError

const existingByOwnerKey = new Map((existingRows || []).map((row) => [row.owner_key, row]))
const inserted = []
const updated = []

for (const source of sourceRows) {
  const displayName = copiedDisplayName(source)
  const ownerKey = ownerKeyFromName(displayName)
  const existing = existingByOwnerKey.get(ownerKey)

  if (existing) {
    const { error: updateError } = await supabase
      .from('brackets')
      .update({
        display_name: displayName,
        picks: source.picks,
      })
      .eq('id', existing.id)

    if (updateError) throw updateError
    updated.push({ id: existing.id, displayName, hash: hashPicks(source.picks) })
    continue
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from('brackets')
    .insert({
      room_id: masterRoom.id,
      owner_key: ownerKey,
      display_name: displayName,
      picks: source.picks,
    })
    .select('id')

  if (insertError) throw insertError
  const insertedId = insertedRows?.[0]?.id
  if (!insertedId) throw new Error(`Insert did not return a bracket id for ${displayName}`)
  inserted.push({ id: insertedId, displayName, hash: hashPicks(source.picks) })
}

console.log(`Room synced: ${masterRoom.slug} / ${masterRoom.name}`)
console.log(`Source submissions: ${sourceRows.length}`)
console.log(`Inserted: ${inserted.length}`)
console.log(`Updated: ${updated.length}`)

for (const row of [...inserted, ...updated].sort((a, b) => a.displayName.localeCompare(b.displayName))) {
  console.log(`${row.displayName}: ${row.id} ${row.hash}`)
}
