// Shared helpers for Google Calendar Edge Functions
// Handles token encryption/decryption, refresh, and JWT state management

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const GOOGLE_CLIENT_ID = requireEnv('GOOGLE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = requireEnv('GOOGLE_CLIENT_SECRET')
const GOOGLE_REDIRECT_URI = requireEnv('GOOGLE_REDIRECT_URI')
const TOKEN_ENCRYPTION_KEY = requireEnv('TOKEN_ENCRYPTION_KEY')
if (TOKEN_ENCRYPTION_KEY.length !== 64 || !/^[0-9a-fA-F]+$/.test(TOKEN_ENCRYPTION_KEY)) {
  throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes for AES-256)')
}

export interface GoogleCalendarConnection {
  id: string
  user_id: string
  google_email: string
  access_token_encrypted: string
  refresh_token_encrypted: string
  token_expires_at: string
  created_at: string
  updated_at: string
}

// --- CORS ---

const ALLOWED_ORIGIN = requireEnv('ALLOWED_ORIGIN')
export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// --- Supabase Admin Client ---

export function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  )
}

// --- User Authentication ---

export async function authenticateUser(req: Request, supabaseAdmin: SupabaseClient): Promise<{ id: string; email: string }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    throw new Error('Invalid or expired token')
  }

  return { id: user.id, email: user.email ?? '' }
}

// --- AES-256-GCM Encryption ---

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(
    TOKEN_ENCRYPTION_KEY.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
  )
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export async function encryptToken(token: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(token)

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  // AES-GCM appends the 16-byte auth tag to the ciphertext
  const cipherBytes = new Uint8Array(cipherBuffer)
  const ciphertext = cipherBytes.slice(0, cipherBytes.length - 16)
  const tag = cipherBytes.slice(cipherBytes.length - 16)

  return `${toBase64(iv)}:${toBase64(ciphertext)}:${toBase64(tag)}`
}

export async function decryptToken(encrypted: string): Promise<string> {
  const key = await getEncryptionKey()
  const [ivB64, ciphertextB64, tagB64] = encrypted.split(':')

  const iv = fromBase64(ivB64)
  const ciphertext = fromBase64(ciphertextB64)
  const tag = fromBase64(tagB64)

  // Reconstruct the buffer: ciphertext + tag (AES-GCM format)
  const combined = new Uint8Array(ciphertext.length + tag.length)
  combined.set(ciphertext)
  combined.set(tag, ciphertext.length)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    combined
  )

  return new TextDecoder().decode(decrypted)
}

// --- Token Refresh ---

export async function refreshGoogleToken(
  refreshTokenEncrypted: string,
  connectionId: string,
  supabaseAdmin: SupabaseClient
): Promise<string> {
  const refreshToken = await decryptToken(refreshTokenEncrypted)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to refresh Google token: ${errorText}`)
  }

  const data = await response.json()
  const newAccessToken: string = data.access_token
  const expiresIn: number = data.expires_in

  const encryptedAccessToken = await encryptToken(newAccessToken)
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  const { error } = await supabaseAdmin
    .from('google_calendar_connections')
    .update({
      access_token_encrypted: encryptedAccessToken,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)

  if (error) {
    throw new Error(`Failed to update connection: ${error.message}`)
  }

  return newAccessToken
}

export async function getValidAccessToken(
  connection: GoogleCalendarConnection,
  supabaseAdmin: SupabaseClient
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at)
  // Refresh 60 seconds before actual expiry
  const now = new Date(Date.now() + 60_000)

  if (expiresAt > now) {
    return decryptToken(connection.access_token_encrypted)
  }

  return refreshGoogleToken(
    connection.refresh_token_encrypted,
    connection.id,
    supabaseAdmin
  )
}

// --- JWT State (HMAC-SHA256 based) ---

export async function createStateJwt(userId: string, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    user_id: userId,
    timestamp: Date.now(),
    exp: Math.floor(Date.now() / 1000) + 600, // 10 min expiry
  }

  const encode = (obj: Record<string, unknown>): string => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj))
    return toBase64(bytes.buffer as ArrayBuffer).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  const headerB64 = encode(header)
  const payloadB64 = encode(payload)
  const signingInput = `${headerB64}.${payloadB64}`

  const keyData = new TextEncoder().encode(secret)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signingInput))
  const signatureB64 = toBase64(signature).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${signingInput}.${signatureB64}`
}

export async function verifyStateJwt(state: string, secret: string): Promise<{ user_id: string }> {
  const parts = state.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid state JWT format')
  }

  const [headerB64, payloadB64, signatureB64] = parts
  const signingInput = `${headerB64}.${payloadB64}`

  const keyData = new TextEncoder().encode(secret)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  // Restore base64 padding
  const signatureRestored = signatureB64.replace(/-/g, '+').replace(/_/g, '/')
  const paddedSignature = signatureRestored + '='.repeat((4 - (signatureRestored.length % 4)) % 4)
  const signatureBytes = fromBase64(paddedSignature)

  const valid = await crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    signatureBytes,
    new TextEncoder().encode(signingInput)
  )

  if (!valid) {
    throw new Error('Invalid state JWT signature')
  }

  // Restore base64 padding for payload
  const payloadRestored = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
  const paddedPayload = payloadRestored + '='.repeat((4 - (payloadRestored.length % 4)) % 4)
  const payload = JSON.parse(atob(paddedPayload))

  // Check expiry
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('State JWT has expired')
  }

  return { user_id: payload.user_id }
}

// --- Helper: Get connection for user ---

export async function getConnectionForUser(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<GoogleCalendarConnection> {
  const { data, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw new Error('No Google Calendar connection found for this user')
  }

  return data as GoogleCalendarConnection
}

// --- Error Handling Helpers ---

export function errorResponse(
  statusCode: number,
  publicMessage: string,
  internalError?: unknown,
): Response {
  if (internalError) {
    console.error(`[Edge Function Error] ${publicMessage}:`, internalError)
  }
  return new Response(
    JSON.stringify({ error: publicMessage }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: statusCode,
    }
  )
}

export function validateMethod(req: Request, allowed: string): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== allowed) {
    return errorResponse(405, `Method ${req.method} not allowed`)
  }
  return null
}

// --- Fetch with Exponential Backoff ---

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options)
    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
    }
    return response
  }
  throw new Error('fetchWithRetry: should not reach here')
}
