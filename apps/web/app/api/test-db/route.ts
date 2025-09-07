import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Test basic connection - check if mood_entries table exists
    const { error } = await supabase
      .from('mood_entries')
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Database connection failed',
        details: error.message
      }, { status: 500 })
    }

    // Test if the calculate_weekly_metrics function exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: functionError } = await (supabase as any)
      .rpc('calculate_weekly_metrics', {
        user_uuid: '00000000-0000-0000-0000-000000000000',
        start_date: '2024-01-01',
        end_date: '2024-01-07'
      })

    const functionExists = !functionError || functionError.code !== '42883'

    return NextResponse.json({
      success: true,
      database_connected: true,
      function_exists: functionExists,
      tables_accessible: true,
      connection_test: 'passed'
    })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Database test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}