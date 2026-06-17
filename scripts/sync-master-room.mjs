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
const displayNameFromSource = (submission) => submission.display_name.trim().replace(/\s+/g, ' ')

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

const orderedSourceRows = [...sourceRows].sort((a, b) => {
  const roomOrder = sourceRoomSlugs.indexOf(a.room_slug) - sourceRoomSlugs.indexOf(b.room_slug)
  if (roomOrder !== 0) return roomOrder
  return a.display_name.localeCompare(b.display_name)
})
const desiredByOwnerKey = new Map()
const skippedDuplicates = []

for (const source of orderedSourceRows) {
  const displayName = displayNameFromSource(source)
  const ownerKey = ownerKeyFromName(displayName)
  const hash = hashPicks(source.picks)
  const existingDesired = desiredByOwnerKey.get(ownerKey)

  if (existingDesired) {
    if (existingDesired.hash === hash) {
      skippedDuplicates.push({
        displayName,
        roomSlug: source.room_slug,
        keptRoomSlug: existingDesired.roomSlug,
        hash,
      })
      continue
    }

    throw new Error(
      `Duplicate display name with different picks: ${displayName} (${existingDesired.roomSlug}, ${source.room_slug})`,
    )
  }

  desiredByOwnerKey.set(ownerKey, {
    displayName,
    hash,
    ownerKey,
    picks: source.picks,
    roomSlug: source.room_slug,
  })
}

const existingByOwnerKey = new Map((existingRows || []).map((row) => [row.owner_key, row]))
const inserted = []
const updated = []
const deleted = []

for (const row of existingRows || []) {
  if (desiredByOwnerKey.has(row.owner_key)) continue

  const { error: deleteError } = await supabase
    .from('brackets')
    .delete()
    .eq('id', row.id)

  if (deleteError) throw deleteError
  deleted.push({ id: row.id, displayName: row.display_name })
}

for (const source of desiredByOwnerKey.values()) {
  const existing = existingByOwnerKey.get(source.ownerKey)

  if (existing) {
    const { error: updateError } = await supabase
      .from('brackets')
      .update({
        display_name: source.displayName,
        picks: source.picks,
      })
      .eq('id', existing.id)

    if (updateError) throw updateError
    updated.push({ id: existing.id, displayName: source.displayName, hash: source.hash })
    continue
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from('brackets')
    .insert({
      room_id: masterRoom.id,
      owner_key: source.ownerKey,
      display_name: source.displayName,
      picks: source.picks,
    })
    .select('id')

  if (insertError) throw insertError
  const insertedId = insertedRows?.[0]?.id
  if (!insertedId) throw new Error(`Insert did not return a bracket id for ${source.displayName}`)
  inserted.push({ id: insertedId, displayName: source.displayName, hash: source.hash })
}

console.log(`Room synced: ${masterRoom.slug} / ${masterRoom.name}`)
console.log(`Source submissions: ${sourceRows.length}`)
console.log(`Unique submissions: ${desiredByOwnerKey.size}`)
console.log(`Skipped duplicate names: ${skippedDuplicates.length}`)
console.log(`Inserted: ${inserted.length}`)
console.log(`Updated: ${updated.length}`)
console.log(`Deleted: ${deleted.length}`)

for (const row of skippedDuplicates.sort((a, b) => a.displayName.localeCompare(b.displayName))) {
  console.log(`Skipped duplicate ${row.displayName}: kept ${row.keptRoomSlug}, skipped ${row.roomSlug} ${row.hash}`)
}

for (const row of [...inserted, ...updated].sort((a, b) => a.displayName.localeCompare(b.displayName))) {
  console.log(`${row.displayName}: ${row.id} ${row.hash}`)
}

for (const row of deleted.sort((a, b) => a.displayName.localeCompare(b.displayName))) {
  console.log(`Deleted stale ${row.displayName}: ${row.id}`)
}
