import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { createProxyMiddleware } from 'http-proxy-middleware';

const PORT = Number(process.env.PORT) || 3001;
const upstream = (process.env.FASTAPI_UPSTREAM || 'http://127.0.0.1:8001').replace(/\/$/, '');
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const frontendOrigin = (process.env.FRONTEND_URL || corsOrigins[0] || 'http://localhost:5173').replace(/\/$/, '');
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const googleRedirectUri =
  process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;
const googleScope = process.env.GOOGLE_OAUTH_SCOPE || 'openid email profile';
const authBffSharedSecret = process.env.AUTH_BFF_SHARED_SECRET || '';
const stateCookieName = 'kai_google_oauth_state';
const sessionCookieName = 'kai_auth_token';
const secureCookies =
  process.env.COOKIE_SECURE === 'true' ||
  googleRedirectUri.startsWith('https://') ||
  frontendOrigin.startsWith('https://');

const app = express();

app.disable('x-powered-by');

app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Kai-Session', 'Accept'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
  }),
);

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return cookies;
      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function getCookie(req, name) {
  return parseCookies(req.headers.cookie || '')[name] || null;
}

function getSessionToken(req) {
  const authorization = req.headers.authorization;
  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length);
  }
  return getCookie(req, sessionCookieName);
}

function buildFrontendRedirect(params = {}) {
  const url = new URL(frontendOrigin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'kai-auth-bff' });
});

app.get('/auth/providers', (_req, res) => {
  res.json({
    google: Boolean(googleClientId && googleClientSecret && authBffSharedSecret),
  });
});

app.get('/auth/google', (req, res) => {
  if (!googleClientId || !googleClientSecret || !authBffSharedSecret) {
    return res.redirect(buildFrontendRedirect({ auth_error: 'google_not_configured' }));
  }

  const state = randomUUID();
  res.setHeader(
    'Set-Cookie',
    serializeCookie(stateCookieName, state, {
      maxAge: 10 * 60,
      path: '/auth/google',
      sameSite: 'Lax',
      secure: secureCookies,
    }),
  );

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', googleClientId);
  googleUrl.searchParams.set('redirect_uri', googleRedirectUri);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', googleScope);
  googleUrl.searchParams.set('state', state);
  googleUrl.searchParams.set('include_granted_scopes', 'true');

  return res.redirect(googleUrl.toString());
});

app.get('/auth/google/callback', async (req, res) => {
  const clearStateCookie = serializeCookie(stateCookieName, '', {
    maxAge: 0,
    path: '/auth/google',
    sameSite: 'Lax',
    secure: secureCookies,
  });

  const redirectWithError = (code) => {
    res.setHeader('Set-Cookie', clearStateCookie);
    return res.redirect(buildFrontendRedirect({ auth_error: code }));
  };

  const stateFromCookie = getCookie(req, stateCookieName);
  const stateFromQuery = typeof req.query.state === 'string' ? req.query.state : '';
  const authorizationCode = typeof req.query.code === 'string' ? req.query.code : '';
  const googleError = typeof req.query.error === 'string' ? req.query.error : '';

  if (googleError) {
    return redirectWithError(googleError === 'access_denied' ? 'google_access_denied' : 'google_callback_failed');
  }

  if (!stateFromCookie || !stateFromQuery || stateFromCookie !== stateFromQuery) {
    return redirectWithError('google_invalid_state');
  }

  if (!authorizationCode) {
    return redirectWithError('google_missing_code');
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: authorizationCode,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      return redirectWithError('google_token_exchange_failed');
    }

    const tokenPayload = await readJsonSafe(tokenResponse);
    const googleAccessToken = tokenPayload?.access_token;
    if (!googleAccessToken) {
      return redirectWithError('google_missing_access_token');
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!profileResponse.ok) {
      return redirectWithError('google_profile_failed');
    }

    const profile = await readJsonSafe(profileResponse);
    if (!profile?.email || !profile?.sub) {
      return redirectWithError('google_profile_incomplete');
    }

    if (profile.email_verified !== true) {
      return redirectWithError('google_email_not_verified');
    }

    const kaiResponse = await fetch(`${upstream}/v1/auth/oauth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Bff-Secret': authBffSharedSecret,
      },
      body: JSON.stringify({
        email: profile.email,
        email_verified: profile.email_verified,
        display_name: profile.name,
        google_sub: profile.sub,
        avatar_url: profile.picture,
      }),
    });

    if (!kaiResponse.ok) {
      return redirectWithError('kai_oauth_failed');
    }

    const kaiToken = await readJsonSafe(kaiResponse);
    if (!kaiToken?.access_token) {
      return redirectWithError('kai_token_missing');
    }

    res.setHeader('Set-Cookie', [
      clearStateCookie,
      serializeCookie(sessionCookieName, kaiToken.access_token, {
        maxAge: kaiToken.expires_in || 60 * 60,
        path: '/auth',
        sameSite: 'Lax',
        secure: secureCookies,
      }),
    ]);

    return res.redirect(buildFrontendRedirect({ auth: 'google' }));
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return redirectWithError('google_callback_failed');
  }
});

app.get('/auth/session', (req, res) => {
  const token = getCookie(req, sessionCookieName);
  if (!token) {
    return res.status(401).json({ detail: 'No active auth session' });
  }

  return res.json({
    access_token: token,
    token_type: 'bearer',
    expires_in: 0,
  });
});

app.delete('/auth/session', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(sessionCookieName, '', {
      maxAge: 0,
      path: '/auth',
      sameSite: 'Lax',
      secure: secureCookies,
    }),
  );
  res.status(204).end();
});

const authProxy = createProxyMiddleware({
  pathFilter: (pathname) => pathname === '/auth' || pathname.startsWith('/auth/'),
  target: upstream,
  changeOrigin: true,
  pathRewrite: { '^/auth': '/v1/auth' },
  on: {
    proxyReq(proxyReq, req) {
      const token = getSessionToken(req);
      if (token && !req.headers.authorization) {
        proxyReq.setHeader('Authorization', `Bearer ${token}`);
      }
    },
    error(_err, _req, res) {
      if (res.headersSent) return;
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          detail: `Auth upstream unavailable (${upstream}). Start FastAPI or set FASTAPI_UPSTREAM.`,
        }),
      );
    },
  },
});

app.use(authProxy);

app.use((_req, res) => {
  res.status(404).json({ detail: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`kai-auth-bff http://127.0.0.1:${PORT}  ->  ${upstream}/v1/auth/*`);
});
