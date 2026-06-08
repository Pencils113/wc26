import { createClient } from '@supabase/supabase-js'

const REQUIRED_CONFIRMATION = 'upsert-room-and-port-submission'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const confirmation = process.env.CONFIRM_UPSERT_ROOM
const targetRoomSlug = process.env.TARGET_ROOM_SLUG?.trim().toLowerCase()
const targetRoomName = process.env.TARGET_ROOM_NAME?.trim()
const targetRoomDescription = process.env.TARGET_ROOM_DESCRIPTION?.trim() ?? ''
const targetRoomLockAt = process.env.TARGET_ROOM_LOCK_AT?.trim() ?? '2026-06-11T18:00:00Z'
const sourceRoomSlug = process.env.SOURCE_ROOM_SLUG?.trim().toLowerCase()
const sourceDisplayName = process.env.SOURCE_DISPLAY_NAME?.trim()

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (confirmation !== REQUIRED_CONFIRMATION) {
  console.error(`Refusing to upsert room. Set CONFIRM_UPSERT_ROOM=${REQUIRED_CONFIRMATION}`)
  process.exit(1)
}

if (!targetRoomSlug || !targetRoomName || !sourceRoomSlug || !sourceDisplayName) {
  console.error('Missing TARGET_ROOM_SLUG, TARGET_ROOM_NAME, SOURCE_ROOM_SLUG, or SOURCE_DISPLAY_NAME')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const { data: sourceRows, error: sourceError } = await supabase
  .from('bracket_submissions')
  .select('id, room_slug, display_name, picks')
  .eq('room_slug', sourceRoomSlug)
  .eq('display_name', sourceDisplayName)

if (sourceError) throw sourceError
if (!sourceRows || sourceRows.length === 0) {
  throw new Error(`Source submission not found: ${sourceRoomSlug} / ${sourceDisplayName}`)
}
if (sourceRows.length > 1) {
  throw new Error(`Found ${sourceRows.length} source submissions for ${sourceRoomSlug} / ${sourceDisplayName}`)
}

const source = sourceRows[0]

const { data: roomRows, error: roomError } = await supabase
  .from('rooms')
  .upsert({
    slug: targetRoomSlug,
    name: targetRoomName,
    description: targetRoomDescription,
    auth_mode: 'room_password',
    email_domain: null,
    password_hash: null,
    lock_at: targetRoomLockAt,
  }, { onConflict: 'slug' })
  .select('id, slug, name')

if (roomError) throw roomError
const targetRoom = roomRows?.[0]
if (!targetRoom) throw new Error(`Target room was not returned after upsert: ${targetRoomSlug}`)

const { data: existingTargetRows, error: existingTargetError } = await supabase
  .from('bracket_submissions')
  .select('id, room_slug, display_name')
  .eq('room_slug', targetRoomSlug)
  .eq('display_name', sourceDisplayName)

if (existingTargetError) throw existingTargetError

if (existingTargetRows && existingTargetRows.length > 0) {
  console.log(`Room upserted: ${targetRoom.slug} / ${targetRoom.name}`)
  console.log(`Submission already exists: ${targetRoomSlug} / ${sourceDisplayName}`)
  process.exit(0)
}

const { data: bracketId, error: submitError } = await supabase.rpc('submit_password_room_bracket', {
  room_slug: targetRoomSlug,
  room_password: targetRoomSlug,
  display_name: source.display_name,
  picks: source.picks,
})

if (submitError) throw submitError

console.log(`Room upserted: ${targetRoom.slug} / ${targetRoom.name}`)
console.log(`Copied submission from ${sourceRoomSlug} / ${sourceDisplayName}`)
console.log(`New bracket id: ${bracketId}`)
