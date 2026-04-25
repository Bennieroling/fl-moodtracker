declare module '@/lib/supabase-browser' {
  import type { SupabaseClient } from '@supabase/supabase-js'
  import type { Database } from '@/lib/types/database'

  export function createClient(): SupabaseClient<Database>
}
