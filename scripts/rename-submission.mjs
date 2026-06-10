import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const REQUIRED_CONFIRMATION = 'rename-one-submission'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const confirmation = process.env.CONFIRM_RENAME_SUBMISSION
const roomSlug = process.env.RENAME_ROOM_SLUG?.trim().toLowerCase()
const currentDisplayName = process.env.RENAME_CURRENT_DISPLAY_NAME?.trim()
const nextDisplayName = process.env.RENAME_NEXT_DISPLAY_NAME?.trim()

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (confirmation !== REQUIRED_CONFIRMATION) {
  console.error(`Refusing to rename submission. Set CONFIRM_RENAME_SUBMISSION=${REQUIRED_CONFIRMATION}`)
  process.exit(1)
}

if (!roomSlug || !currentDisplayName || !nextDisplayName) {
  console.error('Missing RENAME_ROOM_SLUG, RENAME_CURRENT_DISPLAY_NAME, or RENAME_NEXT_DISPLAY_NAME')
  process.exit(1)
}

const ownerKeyFromName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase()
const hashPicks = (picks) => crypto.createHash('sha256').update(JSON.stringify(picks)).digest('hex')

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

const nextOwnerKey = ownerKeyFromName(nextDisplayName)

const { data: candidates, error: candidateError } = await supabase
  .from('brackets')
  .select('id, display_name, owner_key, picks')
  .eq('room_id', room.id)
  .eq('display_name', currentDisplayName)

if (candidateError) throw candidateError

if (!candidates || candidates.length === 0) {
  throw new Error(`No matching submission found for ${roomSlug} / ${currentDisplayName}`)
}

if (candidates.length > 1) {
  throw new Error(`Refusing to rename ${candidates.length} submissions for ${roomSlug} / ${currentDisplayName}`)
}

const target = candidates[0]
const beforeHash = hashPicks(target.picks)

const { data: collisions, error: collisionError } = await supabase
  .from('brackets')
  .select('id, display_name, owner_key')
  .eq('room_id', room.id)
  .or(`display_name.eq.${nextDisplayName},owner_key.eq.${nextOwnerKey}`)
  .neq('id', target.id)

if (collisionError) throw collisionError
if (collisions && collisions.length > 0) {
  throw new Error(`Refusing to rename; target name/key already exists in ${roomSlug}: ${JSON.stringify(collisions)}`)
}

const { data: renamedRows, error: renameError } = await supabase
  .from('brackets')
  .update({
    display_name: nextDisplayName,
    owner_key: nextOwnerKey,
    updated_at: new Date().toISOString(),
  })
  .eq('id', target.id)
  .select('id, display_name, owner_key, picks')

if (renameError) throw renameError

const renamed = renamedRows?.[0]
if (!renamed) throw new Error(`Rename did not return a row for ${target.id}`)

const afterHash = hashPicks(renamed.picks)
if (beforeHash !== afterHash) {
  throw new Error(`Picks hash changed during rename: before ${beforeHash}, after ${afterHash}`)
}

console.log(`Renamed ${roomSlug} / ${currentDisplayName} -> ${nextDisplayName}`)
console.log(`Bracket id: ${renamed.id}`)
console.log(`Picks hash preserved: ${afterHash}`)
