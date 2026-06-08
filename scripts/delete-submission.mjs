import { createClient } from '@supabase/supabase-js'

const REQUIRED_CONFIRMATION = 'delete-one-submission'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const confirmation = process.env.CONFIRM_DELETE_SUBMISSION
const roomSlug = process.env.DELETE_ROOM_SLUG?.trim().toLowerCase()
const displayName = process.env.DELETE_DISPLAY_NAME?.trim()

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (confirmation !== REQUIRED_CONFIRMATION) {
  console.error(`Refusing to delete submission. Set CONFIRM_DELETE_SUBMISSION=${REQUIRED_CONFIRMATION}`)
  process.exit(1)
}

if (!roomSlug || !displayName) {
  console.error('Missing DELETE_ROOM_SLUG or DELETE_DISPLAY_NAME')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const { data: room, error: roomError } = await supabase
  .from('rooms')
  .select('id, slug')
  .eq('slug', roomSlug)
  .maybeSingle()

if (roomError) throw roomError
if (!room) throw new Error(`Room not found: ${roomSlug}`)

const { data: candidates, error: candidateError } = await supabase
  .from('brackets')
  .select('id, display_name')
  .eq('room_id', room.id)
  .eq('display_name', displayName)

if (candidateError) throw candidateError

if (!candidates || candidates.length === 0) {
  console.log(`No matching submission found for ${roomSlug} / ${displayName}`)
  process.exit(0)
}

if (candidates.length > 1) {
  throw new Error(`Refusing to delete ${candidates.length} submissions for ${roomSlug} / ${displayName}`)
}

const target = candidates[0]
const { data: deletedRows, error: deleteError } = await supabase
  .from('brackets')
  .delete()
  .eq('id', target.id)
  .select('id, display_name')

if (deleteError) throw deleteError

console.log(`Deleted submissions: ${deletedRows?.length ?? 0}`)
console.log(`Deleted ${roomSlug} / ${displayName}`)
