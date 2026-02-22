/**
 * OAuth 2.0 Routes
 *
 * Handles OAuth 2.0 Authorization Code flow with PKCE
 * for Claude Desktop MCP integration.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '../services/logger.js';
import {
  getOAuthMetadata,
  getClient,
  validateRedirectUri,
  createAuthorizationCode,
  exchangeCodeForToken,
  refreshAccessToken,
  authenticateOAuthUser,
  registerClient,
} from '../services/oauth.js';

// ============================================================================
// Utility Functions
// ============================================================================

function parseUrl(req: IncomingMessage): URL {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function parseFormData(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function getBaseUrl(req: IncomingMessage): string {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
}

// ============================================================================
// Login Page HTML
// ============================================================================

function getLoginPageHtml(params: {
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  error?: string;
}): string {
  const errorHtml = params.error
    ? `<div class="error">${escapeHtml(params.error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kodo MCP - Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      width: 100%;
      max-width: 400px;
    }
    .logo {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo h1 {
      font-size: 28px;
      color: #333;
      margin-bottom: 8px;
    }
    .logo p {
      color: #666;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 500;
    }
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e1e1e1;
      border-radius: 10px;
      font-size: 16px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    .error {
      background: #fee2e2;
      color: #dc2626;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .info {
      text-align: center;
      margin-top: 20px;
      font-size: 13px;
      color: #888;
    }
    .client-info {
      background: #f3f4f6;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #666;
    }
    .client-info strong {
      color: #333;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>Kodo MCP</h1>
      <p>Connect to your task management</p>
    </div>

    <div class="client-info">
      <strong>Application:</strong> ${escapeHtml(params.client_id)}<br>
      <strong>Permissions:</strong> ${escapeHtml(params.scope || 'mcp')}
    </div>

    ${errorHtml}

    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(params.client_id)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirect_uri)}">
      <input type="hidden" name="state" value="${escapeHtml(params.state || '')}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.code_challenge || '')}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.code_challenge_method || 'S256')}">
      <input type="hidden" name="scope" value="${escapeHtml(params.scope || 'mcp')}">

      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email" placeholder="your@email.com">
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Your password">
      </div>

      <button type="submit">Authorize</button>
    </form>

    <p class="info">
      By authorizing, you allow this application to access your Kodo data.
    </p>
  </div>
</body>
</html>`;
}

function getSuccessPageHtml(params: {
  redirectUrl: string;
  userEmail: string;
  delaySeconds: number;
}): string {
  const { redirectUrl, userEmail, delaySeconds } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="${delaySeconds};url=${escapeHtml(redirectUrl)}">
  <title>Kodo MCP - Authorization Successful</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    .success-icon {
      margin-bottom: 24px;
    }
    .success-icon svg {
      width: 72px;
      height: 72px;
    }
    h1 {
      font-size: 24px;
      color: #333;
      margin-bottom: 8px;
    }
    .user-email {
      color: #666;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .countdown-text {
      color: #888;
      font-size: 14px;
      margin-bottom: 12px;
    }
    .progress-bar-container {
      width: 100%;
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    .progress-bar {
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 3px;
      width: 0%;
      transition: width 0.1s linear;
    }
    .btn-continue {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-continue:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }
    .btn-continue:active {
      transform: translateY(0);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="36" cy="36" r="36" fill="#dcfce7"/>
        <circle cx="36" cy="36" r="28" fill="#bbf7d0"/>
        <path d="M24 36l8 8 16-16" stroke="#16a34a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1>Authorization Successful</h1>
    <p class="user-email">Signed in as <strong>${escapeHtml(userEmail)}</strong></p>
    <p class="countdown-text">Redirecting in <span id="countdown">${delaySeconds}</span> seconds...</p>
    <div class="progress-bar-container">
      <div class="progress-bar" id="progressBar"></div>
    </div>
    <a href="${escapeHtml(redirectUrl)}" class="btn-continue">Continue Now</a>
  </div>
  <script>
    (function() {
      var total = ${delaySeconds} * 1000;
      var start = Date.now();
      var countdownEl = document.getElementById('countdown');
      var progressBar = document.getElementById('progressBar');
      var redirectUrl = ${JSON.stringify(redirectUrl)};

      function tick() {
        var elapsed = Date.now() - start;
        var remaining = Math.max(0, total - elapsed);
        var pct = Math.min(100, (elapsed / total) * 100);

        countdownEl.textContent = Math.ceil(remaining / 1000);
        progressBar.style.width = pct + '%';

        if (remaining <= 0) {
          window.location.href = redirectUrl;
        } else {
          requestAnimationFrame(tick);
        }
      }

      requestAnimationFrame(tick);
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Handle OAuth metadata request
 * GET /.well-known/oauth-authorization-server
 */
export async function handleOAuthMetadata(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const baseUrl = getBaseUrl(req);
  const metadata = getOAuthMetadata(baseUrl);

  setCorsHeaders(res);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(metadata, null, 2));
}

/**
 * Handle authorization request
 * GET /authorize - Show login page
 * POST /authorize - Process login and redirect with code
 */
export async function handleAuthorize(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = parseUrl(req);
  const method = req.method || 'GET';

  setCorsHeaders(res);

  if (method === 'GET') {
    // Extract OAuth parameters from query string
    const client_id = url.searchParams.get('client_id') || '';
    const redirect_uri = url.searchParams.get('redirect_uri') || '';
    const state = url.searchParams.get('state') || '';
    const code_challenge = url.searchParams.get('code_challenge') || '';
    const code_challenge_method = url.searchParams.get('code_challenge_method') || 'S256';
    const scope = url.searchParams.get('scope') || 'mcp';

    // Validate required parameters
    if (!client_id || !redirect_uri) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id and redirect_uri',
      }));
      return;
    }

    // Validate client
    const client = getClient(client_id);
    if (!client) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_client',
        error_description: 'Unknown client_id',
      }));
      return;
    }

    // Validate redirect_uri
    if (!validateRedirectUri(client, redirect_uri)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri for this client',
      }));
      return;
    }

    // Show login page
    const html = getLoginPageHtml({
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      scope,
    });

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (method === 'POST') {
    // Process login form submission
    const body = await readBody(req);
    const formData = parseFormData(body);

    const {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      scope,
      email,
      password,
    } = formData;

    // Validate required parameters
    if (!client_id || !redirect_uri || !email || !password) {
      const html = getLoginPageHtml({
        client_id: client_id || '',
        redirect_uri: redirect_uri || '',
        state,
        code_challenge,
        code_challenge_method,
        scope,
        error: 'Please fill in all fields',
      });
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Authenticate user
    const user = await authenticateOAuthUser(email, password);

    if (!user) {
      logger.warn({ email }, 'OAuth login failed - invalid credentials');
      const html = getLoginPageHtml({
        client_id,
        redirect_uri,
        state,
        code_challenge,
        code_challenge_method,
        scope,
        error: 'Invalid email or password',
      });
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Create authorization code
    const code = createAuthorizationCode({
      client_id,
      user_id: user.user_id,
      user_email: user.email,
      redirect_uri,
      code_challenge: code_challenge || undefined,
      code_challenge_method: (code_challenge_method as 'S256' | 'plain') || undefined,
      scope,
    });

    // Build redirect URL with code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    logger.info({ client_id, user_id: user.user_id }, 'OAuth authorization successful, showing success page');

    // Show success page with delayed client-side redirect
    const html = getSuccessPageHtml({
      redirectUrl: redirectUrl.toString(),
      userEmail: user.email,
      delaySeconds: 3,
    });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Method not allowed
  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

/**
 * Handle token request
 * POST /token - Exchange code for access token or refresh token
 */
export async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCorsHeaders(res);

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  const body = await readBody(req);
  const params = parseFormData(body);

  const grant_type = params.grant_type;

  if (grant_type === 'authorization_code') {
    // Exchange authorization code for access token
    const { code, client_id, redirect_uri, code_verifier } = params;

    if (!code || !client_id || !redirect_uri) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      }));
      return;
    }

    const result = exchangeCodeForToken({
      code,
      client_id,
      redirect_uri,
      code_verifier,
    });

    if ('error' in result) {
      logger.warn({ client_id, error: result.error }, 'Token exchange failed');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    logger.info({ client_id, user_id: result.user_id }, 'Token exchange successful');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      access_token: result.access_token,
      token_type: result.token_type,
      expires_in: result.expires_in,
      refresh_token: result.refresh_token,
      scope: result.scope,
    }));
    return;
  }

  if (grant_type === 'refresh_token') {
    // Refresh access token
    const { refresh_token } = params;

    if (!refresh_token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing refresh_token',
      }));
      return;
    }

    const result = refreshAccessToken(refresh_token);

    if ('error' in result) {
      logger.warn({ error: result.error }, 'Token refresh failed');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    logger.info({ user_id: result.user_id }, 'Token refresh successful');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      access_token: result.access_token,
      token_type: result.token_type,
      expires_in: result.expires_in,
      refresh_token: result.refresh_token,
      scope: result.scope,
    }));
    return;
  }

  // Unsupported grant type
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'unsupported_grant_type',
    error_description: 'Only authorization_code and refresh_token grants are supported',
  }));
}

/**
 * Handle client registration
 * POST /register - Dynamic client registration
 */
export async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCorsHeaders(res);

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  const body = await readBody(req);
  let params: Record<string, unknown>;

  try {
    params = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'invalid_request',
      error_description: 'Invalid JSON body',
    }));
    return;
  }

  const redirect_uris = params.redirect_uris as string[] | undefined;
  const client_name = params.client_name as string | undefined;

  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'invalid_request',
      error_description: 'redirect_uris is required',
    }));
    return;
  }

  const client = registerClient({
    redirect_uris,
    client_name,
  });

  logger.info({ client_id: client.client_id }, 'OAuth client registered');

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uris: client.redirect_uris,
    client_name: client.client_name,
    token_endpoint_auth_method: 'client_secret_post',
  }));
}
