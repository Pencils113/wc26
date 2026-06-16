import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const REQUIRED_CONFIRMATION = 'add-one-submission'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const confirmation = process.env.CONFIRM_ADD_SUBMISSION
const roomSlug = process.env.ADD_ROOM_SLUG?.trim().toLowerCase()
const displayName = process.env.ADD_DISPLAY_NAME?.trim()
const picksJson = process.env.ADD_PICKS_JSON

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (confirmation !== REQUIRED_CONFIRMATION) {
  console.error(`Refusing to add submission. Set CONFIRM_ADD_SUBMISSION=${REQUIRED_CONFIRMATION}`)
  process.exit(1)
}

if (!roomSlug || !displayName || !picksJson) {
  console.error('Missing ADD_ROOM_SLUG, ADD_DISPLAY_NAME, or ADD_PICKS_JSON')
  process.exit(1)
}

const ownerKeyFromName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase()
const hashPicks = (picks) => crypto.createHash('sha256').update(JSON.stringify(picks)).digest('hex')

let picks
try {
  picks = JSON.parse(picksJson)
} catch (error) {
  throw new Error(`ADD_PICKS_JSON is not valid JSON: ${error.message}`)
}

validatePicks(picks)

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

const ownerKey = ownerKeyFromName(displayName)

const { data: collisions, error: collisionError } = await supabase
  .from('brackets')
  .select('id, display_name, owner_key')
  .eq('room_id', room.id)
  .or(`display_name.eq.${displayName},owner_key.eq.${ownerKey}`)

if (collisionError) throw collisionError
if (collisions && collisions.length > 0) {
  throw new Error(`Refusing to add; target name/key already exists in ${roomSlug}: ${JSON.stringify(collisions)}`)
}

const { data: insertedRows, error: insertError } = await supabase
  .from('brackets')
  .insert({
    room_id: room.id,
    owner_key: ownerKey,
    display_name: displayName,
    picks,
  })
  .select('id, display_name, owner_key, picks')

if (insertError) throw insertError

const inserted = insertedRows?.[0]
if (!inserted) throw new Error('Insert did not return a row')

console.log(`Added ${roomSlug} / ${displayName}`)
console.log(`Bracket id: ${inserted.id}`)
console.log(`Picks hash: ${hashPicks(inserted.picks)}`)

function validatePicks(candidate) {
  const groups = candidate?.groupOrder
  const thirds = candidate?.thirdPlaceAdvancers
  const knockout = candidate?.knockoutWinners
  const groupIds = 'ABCDEFGHIJKL'.split('')

  if (!groups || typeof groups !== 'object') throw new Error('picks.groupOrder must be an object')
  if (!Array.isArray(thirds)) throw new Error('picks.thirdPlaceAdvancers must be an array')
  if (!knockout || typeof knockout !== 'object') throw new Error('picks.knockoutWinners must be an object')

  for (const group of groupIds) {
    const order = groups[group]
    if (!Array.isArray(order) || order.length !== 4) {
      throw new Error(`Group ${group} must have exactly four teams`)
    }
    if (new Set(order).size !== 4) {
      throw new Error(`Group ${group} has duplicate teams`)
    }
  }

  if (thirds.length !== 8) throw new Error('thirdPlaceAdvancers must have exactly eight groups')
  if (Object.keys(knockout).length !== 31) throw new Error('knockoutWinners must have exactly 31 matches')
}
