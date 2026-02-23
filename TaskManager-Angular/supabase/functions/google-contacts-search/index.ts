// Supabase Edge Function: Search Google Contacts via People API
// Searches both saved contacts (searchContacts) and auto-saved contacts (otherContacts)
// Deploy with: supabase functions deploy google-contacts-search

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getConnectionForUser,
  getValidAccessToken,
  validateMethod,
  errorResponse,
} from "../_shared/google-auth-helpers.ts"

interface GoogleContact {
  email: string
  displayName?: string
  photoUrl?: string
}

function extractContacts(
  results: Array<Record<string, unknown>>,
): GoogleContact[] {
  return results
    .filter((result) => result.person)
    .map((result) => {
      const person = result.person as Record<string, unknown>
      const names = person.names as Array<Record<string, string>> | undefined
      const emails = person.emailAddresses as Array<Record<string, string>> | undefined
      const photos = person.photos as Array<Record<string, string>> | undefined

      const email = emails?.[0]?.value
      if (!email) return null

      return {
        email,
        displayName: names?.[0]?.displayName,
        photoUrl: photos?.[0]?.url,
      }
    })
    .filter((c): c is GoogleContact => c !== null)
}

Deno.serve(async (req) => {
  const methodError = validateMethod(req, 'POST')
  if (methodError) return methodError

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)
    const connection = await getConnectionForUser(user.id, supabaseAdmin)
    const accessToken = await getValidAccessToken(connection, supabaseAdmin)

    const { query } = await req.json()

    if (!query || typeof query !== 'string' || query.trim().length < 1) {
      return new Response(
        JSON.stringify({ contacts: [] }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    const trimmedQuery = query.trim()
    const authHeaders = { Authorization: `Bearer ${accessToken}` }

    // Pre-warm the searchContacts index (required by Google on first use)
    // This is a fire-and-forget warmup call
    fetch(
      `https://people.googleapis.com/v1/people:searchContacts?query=&readMask=names,emailAddresses`,
      { headers: authHeaders }
    ).catch(() => { /* ignore warmup errors */ })

    // Search both endpoints in parallel:
    // 1. Saved contacts (Google Contacts)
    // 2. Other contacts (auto-saved from Gmail interactions)
    const searchContactsParams = new URLSearchParams({
      query: trimmedQuery,
      readMask: 'names,emailAddresses,photos',
      pageSize: '10',
    })

    const otherContactsParams = new URLSearchParams({
      query: trimmedQuery,
      readMask: 'names,emailAddresses,photos',
      pageSize: '10',
    })

    const [savedRes, otherRes] = await Promise.allSettled([
      fetch(
        `https://people.googleapis.com/v1/people:searchContacts?${searchContactsParams}`,
        { headers: authHeaders }
      ),
      fetch(
        `https://people.googleapis.com/v1/otherContacts:search?${otherContactsParams}`,
        { headers: authHeaders }
      ),
    ])

    const allContacts: GoogleContact[] = []
    const seenEmails = new Set<string>()

    // Process saved contacts
    if (savedRes.status === 'fulfilled' && savedRes.value.ok) {
      const data = await savedRes.value.json()
      for (const contact of extractContacts(data.results ?? [])) {
        if (!seenEmails.has(contact.email.toLowerCase())) {
          seenEmails.add(contact.email.toLowerCase())
          allContacts.push(contact)
        }
      }
    } else if (savedRes.status === 'fulfilled') {
      const errText = await savedRes.value.text()
      console.warn('[google-contacts-search] searchContacts error:', savedRes.value.status, errText)
    }

    // Process other contacts (from Gmail interactions)
    if (otherRes.status === 'fulfilled' && otherRes.value.ok) {
      const data = await otherRes.value.json()
      for (const contact of extractContacts(data.results ?? [])) {
        if (!seenEmails.has(contact.email.toLowerCase())) {
          seenEmails.add(contact.email.toLowerCase())
          allContacts.push(contact)
        }
      }
    } else if (otherRes.status === 'fulfilled') {
      const errText = await otherRes.value.text()
      console.warn('[google-contacts-search] otherContacts error:', otherRes.value.status, errText)
    }

    return new Response(
      JSON.stringify({ contacts: allContacts }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return errorResponse(500, 'Failed to search contacts', error)
  }
})
