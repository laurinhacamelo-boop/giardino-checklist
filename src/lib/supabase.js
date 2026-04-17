import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://byfytrhzpmlqfrfxvjdl.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_r4qkyxrJmIHvzcmgEW7gjg_iojgX7_O'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function uploadFile(bucket, path, file) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
  return urlData.publicUrl
}

export function storagePath(prefix, ext) {
  return `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
}
