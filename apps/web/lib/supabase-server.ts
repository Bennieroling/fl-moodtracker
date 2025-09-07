import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from './types/database'

export async function createClient() {
  const cookieStore = await cookies()
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !key) {
    console.warn('⚠️  Server: Supabase credentials missing. Using demo mode.')
  }
  
  // Provide fallback values for demo purposes
  const fallbackUrl = url || 'https://demo-project.supabase.co'
  const fallbackKey = key || 'demo-anon-key'

  return createServerClient<Database>(
    fallbackUrl,
    fallbackKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !serviceKey) {
    console.warn('⚠️  Admin: Supabase credentials missing. Using demo mode.')
  }
  
  // Provide fallback values for demo purposes
  const fallbackUrl = url || 'https://demo-project.supabase.co'
  const fallbackServiceKey = serviceKey || 'demo-service-key'
  
  return createServerClient<Database>(
    fallbackUrl,
    fallbackServiceKey,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {
          // No-op for admin client
        },
      },
    }
  )
}

// Alias for consistency with API routes
export const createServerSupabaseClient = createClient
export const createAdminSupabaseClient = createAdminClient