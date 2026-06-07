import { createClient } from '@supabase/supabase-js'

const REQUIRED_CONFIRMATION = 'clear-world-cup-submissions'
const roomSlugs = ['conway', 'larooch']

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const confirmation = process.env.CONFIRM_CLEAR_SUBMISSIONS

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (confirmation !== REQUIRED_CONFIRMATION) {
  console.error(`Refusing to clear submissions. Set CONFIRM_CLEAR_SUBMISSIONS=${REQUIRED_CONFIRMATION}`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const { data: rooms, error: roomsError } = await supabase
  .from('rooms')
  .select('id, slug')
  .in('slug', roomSlugs)

if (roomsError) throw roomsError

const roomIds = (rooms ?? []).map((room) => room.id)
const foundSlugs = new Set((rooms ?? []).map((room) => room.slug))
const missingSlugs = roomSlugs.filter((slug) => !foundSlugs.has(slug))

if (missingSlugs.length > 0) {
  throw new Error(`Missing rooms: ${missingSlugs.join(', ')}`)
}

const { count: beforeCount, error: beforeError } = await supabase
  .from('brackets')
  .select('id', { count: 'exact', head: true })
  .in('room_id', roomIds)

if (beforeError) throw beforeError

const { data: deletedRows, error: deleteError } = await supabase
  .from('brackets')
  .delete()
  .in('room_id', roomIds)
  .select('id')

if (deleteError) throw deleteError

const { count: afterCount, error: afterError } = await supabase
  .from('brackets')
  .select('id', { count: 'exact', head: true })
  .in('room_id', roomIds)

if (afterError) throw afterError

console.log(`Submissions before clear: ${beforeCount ?? 0}`)
console.log(`Deleted submissions: ${deletedRows?.length ?? 0}`)
console.log(`Submissions after clear: ${afterCount ?? 0}`)
