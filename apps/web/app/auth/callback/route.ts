import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')

  if (error) {
    console.error('OAuth error:', error)
    return NextResponse.redirect(`${requestUrl.origin}/login?error=${error}`)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch (error) {
              console.error('Error setting cookies:', error)
            }
          },
        },
      }
    )

    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('Auth exchange error:', error)
        return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_failed`)
      }

      if (data.session) {
        console.log('User authenticated successfully:', data.user?.email)
        return NextResponse.redirect(`${requestUrl.origin}/dashboard`)
      }
    } catch (error) {
      console.error('Exception during auth exchange:', error)
      return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_exception`)
    }
  }

  // No code parameter
  return NextResponse.redirect(`${requestUrl.origin}/login?error=no_code`)
}