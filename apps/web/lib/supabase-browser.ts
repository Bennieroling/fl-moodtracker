import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types/database'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !key) {
    console.warn('⚠️  Supabase credentials missing. Using demo mode.')
    console.warn('   Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
    console.warn('   Some features may not work without a real Supabase project.')
  }
  
  // Provide fallback values for demo purposes
  const fallbackUrl = url || 'https://demo-project.supabase.co'
  const fallbackKey = key || 'demo-anon-key'
  
  return createBrowserClient<Database>(fallbackUrl, fallbackKey)
}