import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-browser'

export async function GET() {
  try {
    const supabase = createClient()
    
    // Test basic connection
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      return NextResponse.json({
        error: 'Auth error',
        details: authError.message,
        code: authError.code
      }, { status: 401 })
    }

    if (!user) {
      return NextResponse.json({
        error: 'No authenticated user',
        message: 'Please login first'
      }, { status: 401 })
    }

    // Test if tables exist
    const { error: tablesError } = await supabase
      .from('mood_entries')
      .select('count')
      .limit(1)

    if (tablesError) {
      return NextResponse.json({
        error: 'Tables error',
        details: tablesError.message,
        code: tablesError.code,
        hint: tablesError.hint
      }, { status: 500 })
    }

    // Test the function directly
    try {
      const testDate = new Date()
      const startDate = new Date(testDate.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      const { data: functionResult, error: functionError } = await (supabase as unknown as { rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> })
        .rpc('calculate_weekly_metrics', {
          user_uuid: user.id,
          start_date: startDate.toISOString().split('T')[0],
          end_date: testDate.toISOString().split('T')[0]
        })

      if (functionError) {
        return NextResponse.json({
          error: 'Function error',
          details: (functionError as { message?: string }).message || 'Unknown error',
          code: (functionError as { code?: string }).code,
          hint: (functionError as { hint?: string }).hint,
          function_name: 'calculate_weekly_metrics'
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        user_id: user.id,
        tables_accessible: true,
        function_result: functionResult,
        message: 'Database connection and function working correctly'
      })

    } catch (funcError) {
      return NextResponse.json({
        error: 'Function execution error',
        details: funcError instanceof Error ? funcError.message : 'Unknown error',
        user_id: user.id
      }, { status: 500 })
    }

  } catch (error) {
    return NextResponse.json({
      error: 'General error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}