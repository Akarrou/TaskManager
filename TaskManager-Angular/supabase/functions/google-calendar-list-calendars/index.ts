// Supabase Edge Function: List user's Google Calendars
// Deploy with: supabase functions deploy google-calendar-list-calendars

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getConnectionForUser,
  getValidAccessToken,
} from "../_shared/google-auth-helpers.ts"

interface GoogleCalendarListItem {
  id: string
  summary: string
  backgroundColor: string
  primary: boolean
  accessRole: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)
    const connection = await getConnectionForUser(user.id, supabaseAdmin)
    const accessToken = await getValidAccessToken(connection, supabaseAdmin)

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google Calendar API error: ${errorText}`)
    }

    const data = await response.json()

    const calendars: GoogleCalendarListItem[] = (data.items ?? []).map(
      (item: Record<string, unknown>) => ({
        id: item.id,
        summary: item.summary,
        backgroundColor: item.backgroundColor,
        primary: item.primary ?? false,
        accessRole: item.accessRole,
      })
    )

    return new Response(
      JSON.stringify({ calendars }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error listing calendars:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
