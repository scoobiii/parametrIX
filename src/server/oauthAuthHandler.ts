import crypto from 'node:crypto';
import type { ParametrixSqliteStore } from './sqliteStore';
import type { AuthUserProfile, EcosystemRole } from '../types/cad';

export type ServerOAuthProvider = 'microsoft' | 'oracle' | 'zoho' | 'google' | 'apple';

export interface PendingOAuthSession {
  provider: ServerOAuthProvider;
  role: EcosystemRole;
  codeVerifier: string;
  callbackUrl: string;
  origin: string;
  createdAt: number;
}

export interface SignedSessionClaims {
  userId: string;
  email: string;
  displayName: string;
  provider: string;
  role: EcosystemRole;
  exp: number;
}

export interface FirebaseIdTokenVerificationResult {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  signInProvider: string;
}

export type FetchLike = typeof fetch;

const DEFAULT_FALLBACK_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

export function getSessionSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.SESSION_SECRET?.trim();
  return fromEnv && fromEnv.length >= 16 ? fromEnv : DEFAULT_FALLBACK_SESSION_SECRET;
}

export function resolveAppBaseUrl(
  headers: Record<string, string | string[] | undefined>,
  protocol: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const fromEnv = (env.APP_URL || '').trim().replace(/\/$/, '');
  if (fromEnv && /^https?:\/\//i.test(fromEnv) && !fromEnv.includes('MY_APP_URL')) {
    return fromEnv;
  }
  const fwdProtoRaw = headers['x-forwarded-proto'];
  const fwdHostRaw = headers['x-forwarded-host'];
  const hostRaw = headers.host;
  const proto = (Array.isArray(fwdProtoRaw) ? fwdProtoRaw[0] : fwdProtoRaw) || protocol || 'http';
  const host =
    (Array.isArray(fwdHostRaw) ? fwdHostRaw[0] : fwdHostRaw) ||
    (Array.isArray(hostRaw) ? hostRaw[0] : hostRaw) ||
    'localhost:3000';
  return `${proto}://${host}`.replace(/\/$/, '');
}

export function normalizeZohoDomain(raw?: string): string {
  const cleaned = (raw || 'accounts.zoho.com')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (!cleaned || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleaned) || isDisallowedOAuthHostname(cleaned)) {
    return 'accounts.zoho.com';
  }
  return cleaned;
}

export function isDisallowedOAuthHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function validateExternalOAuthUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'https:') {
    throw new Error('URL do provedor OAuth deve usar HTTPS.');
  }
  if (isDisallowedOAuthHostname(parsed.hostname)) {
    throw new Error('Host local ou privado não é permitido para endpoints OAuth.');
  }
  return parsed;
}

export function signSessionToken(
  claims: Omit<SignedSessionClaims, 'exp'>,
  ttlSeconds = 86_400,
  env: NodeJS.ProcessEnv = process.env
): string {
  const payload: SignedSessionClaims = {
    ...claims,
    exp: Date.now() + ttlSeconds * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSigningSecret(env))
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

export function verifySessionToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): SignedSessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, sig] = parts;
  if (!encodedPayload || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSigningSecret(env))
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as SignedSessionClaims;
    if (!parsed.userId || !parsed.email || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractSessionTokenFromHeaders(
  authorizationHeader?: string,
  cookieHeader?: string
): string | null {
  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    const token = authorizationHeader.slice(7).trim();
    if (token) return token;
  }
  if (cookieHeader) {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      if (key === 'parametrix_session' && val) {
        return decodeURIComponent(val);
      }
    }
  }
  return null;
}

export function buildSessionCookieHeader(token: string, maxAgeSeconds = 86_400): string {
  return `parametrix_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function buildClearSessionCookieHeader(): string {
  return 'parametrix_session=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0';
}

export function decodeJwtClaimsUnsafe(jwtToken?: string): Record<string, unknown> | null {
  if (!jwtToken || typeof jwtToken !== 'string') return null;
  const parts = jwtToken.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

let firebaseCertCache: { certs: Record<string, string>; expiresAtMs: number } | null = null;

export function clearFirebaseCertCacheForTest(): void {
  firebaseCertCache = null;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  expectedProjectId: string,
  fetchImpl: FetchLike = fetch
): Promise<FirebaseIdTokenVerificationResult> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Firebase ID token malformado.');
  }
  const [rawHeader, rawPayload, rawSig] = parts;

  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    claims = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error('Não foi possível decodificar cabeçalho/claims do token Firebase.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Algoritmo ou kid inválido no token Firebase.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
  if (claims.aud !== expectedProjectId || claims.iss !== expectedIssuer) {
    throw new Error('Token Firebase emitido para projeto diferente.');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) {
    throw new Error('Token Firebase expirado.');
  }
  if (typeof claims.iat !== 'number' || claims.iat > nowSec + 300) {
    throw new Error('Timestamp iat inválido no token Firebase.');
  }
  const uid = typeof claims.sub === 'string' ? claims.sub : '';
  const email = typeof claims.email === 'string' ? claims.email : '';
  if (!uid || !email || !email.includes('@')) {
    throw new Error('Token Firebase sem UID ou e-mail válido.');
  }

  if (!firebaseCertCache || firebaseCertCache.expiresAtMs <= Date.now()) {
    const resp = await fetchImpl(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
    );
    if (!resp.ok) {
      throw new Error(`Falha ao obter certificados públicos Firebase (${resp.status}).`);
    }
    const certs = (await resp.json()) as Record<string, string>;
    const cc = resp.headers.get('cache-control') || '';
    const maxAgeMatch = /max-age=(\d+)/i.exec(cc);
    const ttlSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
    firebaseCertCache = { certs, expiresAtMs: Date.now() + ttlSec * 1000 };
  }

  const pem = firebaseCertCache.certs[header.kid];
  if (!pem) {
    throw new Error('Chave pública (kid) não encontrada nos certificados Firebase.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${rawHeader}.${rawPayload}`);
  verifier.end();
  const validSig = verifier.verify(pem, Buffer.from(rawSig, 'base64url'));
  if (!validSig) {
    throw new Error('Assinatura criptográfica RS256 do token Firebase inválida.');
  }

  const firebaseMeta = (claims.firebase as { sign_in_provider?: string } | undefined) ?? {};
  return {
    uid,
    email,
    displayName:
      (typeof claims.name === 'string' && claims.name.trim()) || email.split('@')[0],
    emailVerified: Boolean(claims.email_verified),
    signInProvider: firebaseMeta.sign_in_provider || 'google.com',
  };
}

export function getOAuthProvidersReadiness(
  callbackUrl: string,
  env: NodeJS.ProcessEnv = process.env
) {
  return {
    callbackUrl,
    providers: {
      google: {
        mode: env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET ? 'firebase-or-oauth2' : 'firebase-popup',
        configured: true,
        oauthServerConfigured: Boolean(
          env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
        ),
      },
      email: {
        mode: 'firebase-password',
        configured: true,
        oauthServerConfigured: false,
      },
      apple: {
        mode: env.APPLE_OAUTH_CLIENT_ID && env.APPLE_OAUTH_CLIENT_SECRET ? 'firebase-or-oauth2' : 'firebase-popup',
        configured: true,
        oauthServerConfigured: Boolean(
          env.APPLE_OAUTH_CLIENT_ID?.trim() && env.APPLE_OAUTH_CLIENT_SECRET?.trim()
        ),
      },
      microsoft: {
        mode: 'firebase-or-oauth2',
        configured: Boolean(
          env.MICROSOFT_OAUTH_CLIENT_ID?.trim() && env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim()
        ),
        oauthServerConfigured: Boolean(
          env.MICROSOFT_OAUTH_CLIENT_ID?.trim() && env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim()
        ),
      },
      oracle: {
        mode: 'oauth2-pkce',
        configured: Boolean(
          env.ORACLE_OAUTH_CLIENT_ID?.trim() &&
            env.ORACLE_OAUTH_CLIENT_SECRET?.trim() &&
            env.ORACLE_OAUTH_AUTH_URL?.trim() &&
            env.ORACLE_OAUTH_TOKEN_URL?.trim()
        ),
        oauthServerConfigured: Boolean(
          env.ORACLE_OAUTH_CLIENT_ID?.trim() &&
            env.ORACLE_OAUTH_CLIENT_SECRET?.trim() &&
            env.ORACLE_OAUTH_AUTH_URL?.trim() &&
            env.ORACLE_OAUTH_TOKEN_URL?.trim()
        ),
      },
      zoho: {
        mode: 'oauth2-pkce',
        configured: Boolean(
          env.ZOHO_OAUTH_CLIENT_ID?.trim() && env.ZOHO_OAUTH_CLIENT_SECRET?.trim()
        ),
        oauthServerConfigured: Boolean(
          env.ZOHO_OAUTH_CLIENT_ID?.trim() && env.ZOHO_OAUTH_CLIENT_SECRET?.trim()
        ),
      },
    },
  };
}

export function renderOAuthCallbackHtml(
  payload: Record<string, unknown>,
  targetOrigin: string
): string {
  const safePayloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const safeOriginJson = JSON.stringify(targetOrigin || '*').replace(/</g, '\\u003c');
  const isError = payload.type === 'OAUTH_AUTH_ERROR';
  const heading = isError ? 'Falha na autenticação' : 'Autenticação concluída';
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><title>Parametrix OAuth Callback</title></head>
<body style="background:#0b0e14;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center;max-width:420px;padding:24px;border:1px solid #334155;border-radius:12px;background:#111620">
    <h2 style="margin:0 0 8px;font-size:16px">${heading}</h2>
    <p style="margin:0;font-size:13px;color:#94a3b8">Você pode fechar esta janela caso não feche automaticamente.</p>
  </div>
  <script>
    (function () {
      var payload = ${safePayloadJson};
      var origin = ${safeOriginJson};
      if (window.opener) {
        try {
          window.opener.postMessage(payload, origin === 'null' ? '*' : origin);
        } catch (err) {
          window.opener.postMessage(payload, '*');
        }
        window.setTimeout(function () { window.close(); }, 300);
      } else {
        window.setTimeout(function () { window.location.replace('/'); }, 400);
      }
    })();
  </script>
</body>
</html>`;
}

export class OAuthCallbackManager {
  public readonly pendingStates = new Map<string, PendingOAuthSession>();
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  public normalizeProvider(raw: string): ServerOAuthProvider | null {
    const clean = raw.trim().toLowerCase();
    if (
      clean === 'microsoft' ||
      clean === 'oracle' ||
      clean === 'zoho' ||
      clean === 'google' ||
      clean === 'apple'
    ) {
      return clean;
    }
    return null;
  }

  public createAuthorizationUrl(params: {
    provider: ServerOAuthProvider;
    role: EcosystemRole;
    callbackUrl: string;
    origin: string;
    env?: NodeJS.ProcessEnv;
  }): {
    configured: boolean;
    url?: string;
    callbackUrl: string;
    requiredEnvVars?: string[];
    message?: string;
  } {
    const env = params.env ?? process.env;
    const now = Date.now();
    for (const [key, sess] of this.pendingStates.entries()) {
      if (now - sess.createdAt > 10 * 60 * 1000) this.pendingStates.delete(key);
    }

    const state = crypto.randomBytes(24).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    let authUrlObj: URL;

    if (params.provider === 'oracle') {
      const clientId = env.ORACLE_OAUTH_CLIENT_ID?.trim();
      const clientSecret = env.ORACLE_OAUTH_CLIENT_SECRET?.trim();
      const authEndpoint = env.ORACLE_OAUTH_AUTH_URL?.trim();
      const tokenEndpoint = env.ORACLE_OAUTH_TOKEN_URL?.trim();
      if (!clientId || !clientSecret || !authEndpoint || !tokenEndpoint) {
        return {
          configured: false,
          callbackUrl: params.callbackUrl,
          requiredEnvVars: [
            'ORACLE_OAUTH_CLIENT_ID',
            'ORACLE_OAUTH_CLIENT_SECRET',
            'ORACLE_OAUTH_AUTH_URL',
            'ORACLE_OAUTH_TOKEN_URL',
            'ORACLE_OAUTH_USERINFO_URL',
          ],
          message: `Oracle ID OAuth2 requer ORACLE_OAUTH_CLIENT_ID, ORACLE_OAUTH_CLIENT_SECRET, ORACLE_OAUTH_AUTH_URL e ORACLE_OAUTH_TOKEN_URL nos Secrets e callback ${params.callbackUrl}.`,
        };
      }
      authUrlObj = validateExternalOAuthUrl(authEndpoint);
      validateExternalOAuthUrl(tokenEndpoint);
      authUrlObj.searchParams.set('client_id', clientId);
      authUrlObj.searchParams.set('response_type', 'code');
      authUrlObj.searchParams.set('scope', 'openid profile email');
      authUrlObj.searchParams.set('redirect_uri', params.callbackUrl);
      authUrlObj.searchParams.set('state', state);
      authUrlObj.searchParams.set('code_challenge', codeChallenge);
      authUrlObj.searchParams.set('code_challenge_method', 'S256');
    } else if (params.provider === 'zoho') {
      const clientId = env.ZOHO_OAUTH_CLIENT_ID?.trim();
      const clientSecret = env.ZOHO_OAUTH_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        return {
          configured: false,
          callbackUrl: params.callbackUrl,
          requiredEnvVars: ['ZOHO_OAUTH_CLIENT_ID', 'ZOHO_OAUTH_CLIENT_SECRET', 'ZOHO_OAUTH_DOMAIN'],
          message: `Zoho Mail OAuth2 requer ZOHO_OAUTH_CLIENT_ID e ZOHO_OAUTH_CLIENT_SECRET nos Secrets e Redirect URI ${params.callbackUrl}.`,
        };
      }
      const domain = normalizeZohoDomain(env.ZOHO_OAUTH_DOMAIN);
      authUrlObj = new URL(`https://${domain}/oauth/v2/auth`);
      authUrlObj.searchParams.set('client_id', clientId);
      authUrlObj.searchParams.set('response_type', 'code');
      authUrlObj.searchParams.set('scope', 'AaaServer.profile.READ');
      authUrlObj.searchParams.set('redirect_uri', params.callbackUrl);
      authUrlObj.searchParams.set('access_type', 'online');
      authUrlObj.searchParams.set('state', state);
    } else if (params.provider === 'microsoft') {
      const clientId = env.MICROSOFT_OAUTH_CLIENT_ID?.trim();
      const clientSecret = env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        return {
          configured: false,
          callbackUrl: params.callbackUrl,
          requiredEnvVars: ['MICROSOFT_OAUTH_CLIENT_ID', 'MICROSOFT_OAUTH_CLIENT_SECRET'],
          message: `Microsoft Entra OAuth2 requer MICROSOFT_OAUTH_CLIENT_ID e MICROSOFT_OAUTH_CLIENT_SECRET nos Secrets com Redirect URI ${params.callbackUrl}.`,
        };
      }
      const tenant = (env.MICROSOFT_OAUTH_TENANT || 'common').trim();
      authUrlObj = new URL(
        `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`
      );
      authUrlObj.searchParams.set('client_id', clientId);
      authUrlObj.searchParams.set('response_type', 'code');
      authUrlObj.searchParams.set('scope', 'openid profile email User.Read');
      authUrlObj.searchParams.set('redirect_uri', params.callbackUrl);
      authUrlObj.searchParams.set('state', state);
      authUrlObj.searchParams.set('code_challenge', codeChallenge);
      authUrlObj.searchParams.set('code_challenge_method', 'S256');
    } else if (params.provider === 'google') {
      const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
      const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        return {
          configured: false,
          callbackUrl: params.callbackUrl,
          requiredEnvVars: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
          message: `Google OAuth2 direto requer GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET nos Secrets (ou use Firebase Popup já ativo) com callback ${params.callbackUrl}.`,
        };
      }
      authUrlObj = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrlObj.searchParams.set('client_id', clientId);
      authUrlObj.searchParams.set('response_type', 'code');
      authUrlObj.searchParams.set('scope', 'openid email profile');
      authUrlObj.searchParams.set('redirect_uri', params.callbackUrl);
      authUrlObj.searchParams.set('prompt', 'select_account');
      authUrlObj.searchParams.set('state', state);
      authUrlObj.searchParams.set('code_challenge', codeChallenge);
      authUrlObj.searchParams.set('code_challenge_method', 'S256');
    } else {
      const clientId = env.APPLE_OAUTH_CLIENT_ID?.trim();
      const clientSecret = env.APPLE_OAUTH_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        return {
          configured: false,
          callbackUrl: params.callbackUrl,
          requiredEnvVars: ['APPLE_OAUTH_CLIENT_ID', 'APPLE_OAUTH_CLIENT_SECRET'],
          message: `Apple Sign In OAuth2 requer APPLE_OAUTH_CLIENT_ID e APPLE_OAUTH_CLIENT_SECRET nos Secrets (ou Apple ativado no Firebase Console) com callback ${params.callbackUrl}.`,
        };
      }
      authUrlObj = new URL('https://appleid.apple.com/auth/authorize');
      authUrlObj.searchParams.set('client_id', clientId);
      authUrlObj.searchParams.set('response_type', 'code');
      authUrlObj.searchParams.set('response_mode', 'form_post');
      authUrlObj.searchParams.set('scope', 'name email');
      authUrlObj.searchParams.set('redirect_uri', params.callbackUrl);
      authUrlObj.searchParams.set('state', state);
    }

    this.pendingStates.set(state, {
      provider: params.provider,
      role: params.role,
      codeVerifier,
      callbackUrl: params.callbackUrl,
      origin: params.origin,
      createdAt: now,
    });

    return {
      configured: true,
      url: authUrlObj.toString(),
      callbackUrl: params.callbackUrl,
    };
  }

  public async handleCallback(params: {
    state: string;
    code: string;
    providerError?: string;
    userJson?: string;
    store: ParametrixSqliteStore;
    env?: NodeJS.ProcessEnv;
  }): Promise<{
    profile: AuthUserProfile;
    sessionToken: string;
    provider: ServerOAuthProvider;
    origin: string;
  }> {
    const env = params.env ?? process.env;
    const session = params.state ? this.pendingStates.get(params.state) : undefined;
    if (params.state) this.pendingStates.delete(params.state);

    if (params.providerError) {
      throw new Error('Provedor OAuth recusou ou cancelou a autorização.');
    }
    if (!session || !params.code) {
      throw new Error('Sessão OAuth inválida ou expirada. Tente novamente.');
    }

    let email = '';
    let displayName = '';

    if (session.provider === 'microsoft') {
      const tenant = (env.MICROSOFT_OAUTH_TENANT || 'common').trim();
      const tokenResp = await this.fetchImpl(
        `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: env.MICROSOFT_OAUTH_CLIENT_ID || '',
            client_secret: env.MICROSOFT_OAUTH_CLIENT_SECRET || '',
            code: params.code,
            redirect_uri: session.callbackUrl,
            grant_type: 'authorization_code',
            code_verifier: session.codeVerifier,
          }),
        }
      );
      const tokenJson = (await tokenResp.json()) as {
        access_token?: string;
        id_token?: string;
        error_description?: string;
      };
      if (!tokenResp.ok || !tokenJson.access_token) {
        throw new Error(tokenJson.error_description || 'Falha ao obter token Microsoft.');
      }
      const idClaims = decodeJwtClaimsUnsafe(tokenJson.id_token);
      const meResp = await this.fetchImpl('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (meResp.ok) {
        const me = (await meResp.json()) as {
          mail?: string;
          userPrincipalName?: string;
          displayName?: string;
        };
        email = me.mail || me.userPrincipalName || '';
        displayName = me.displayName || '';
      }
      if (!email && idClaims) {
        email = String(idClaims.email || idClaims.preferred_username || '');
        displayName = displayName || String(idClaims.name || '');
      }
    } else if (session.provider === 'zoho') {
      const domain = normalizeZohoDomain(env.ZOHO_OAUTH_DOMAIN);
      const tokenResp = await this.fetchImpl(`https://${domain}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.ZOHO_OAUTH_CLIENT_ID || '',
          client_secret: env.ZOHO_OAUTH_CLIENT_SECRET || '',
          code: params.code,
          redirect_uri: session.callbackUrl,
          grant_type: 'authorization_code',
        }),
      });
      const tokenJson = (await tokenResp.json()) as { access_token?: string; error?: string };
      if (!tokenResp.ok || !tokenJson.access_token) {
        throw new Error(tokenJson.error || 'Falha ao trocar código Zoho OAuth2.');
      }
      const meResp = await this.fetchImpl(`https://${domain}/oauth/user/info`, {
        headers: { Authorization: `Zoho-oauthtoken ${tokenJson.access_token}` },
      });
      const me = (await meResp.json()) as {
        Email?: string;
        Display_Name?: string;
        First_Name?: string;
      };
      email = me.Email || '';
      displayName = me.Display_Name || me.First_Name || '';
    } else if (session.provider === 'oracle') {
      const tokenEndpoint = validateExternalOAuthUrl(env.ORACLE_OAUTH_TOKEN_URL || '').toString();
      const userinfoRaw = env.ORACLE_OAUTH_USERINFO_URL?.trim();
      const tokenResp = await this.fetchImpl(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.ORACLE_OAUTH_CLIENT_ID || '',
          client_secret: env.ORACLE_OAUTH_CLIENT_SECRET || '',
          code: params.code,
          redirect_uri: session.callbackUrl,
          grant_type: 'authorization_code',
          code_verifier: session.codeVerifier,
        }),
      });
      const tokenJson = (await tokenResp.json()) as {
        access_token?: string;
        id_token?: string;
        error_description?: string;
      };
      if (!tokenResp.ok || !tokenJson.access_token) {
        throw new Error(tokenJson.error_description || 'Falha ao obter token Oracle OAuth2.');
      }
      if (userinfoRaw) {
        const userinfoUrl = validateExternalOAuthUrl(userinfoRaw).toString();
        const meResp = await this.fetchImpl(userinfoUrl, {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        });
        if (meResp.ok) {
          const me = (await meResp.json()) as {
            email?: string;
            preferred_username?: string;
            name?: string;
          };
          email = me.email || me.preferred_username || '';
          displayName = me.name || '';
        }
      }
      const idClaims = decodeJwtClaimsUnsafe(tokenJson.id_token);
      if (!email && idClaims) {
        email = String(idClaims.email || idClaims.preferred_username || '');
        displayName = displayName || String(idClaims.name || '');
      }
    } else if (session.provider === 'google') {
      const tokenResp = await this.fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_OAUTH_CLIENT_ID || '',
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET || '',
          code: params.code,
          redirect_uri: session.callbackUrl,
          grant_type: 'authorization_code',
          code_verifier: session.codeVerifier,
        }),
      });
      const tokenJson = (await tokenResp.json()) as {
        access_token?: string;
        error_description?: string;
      };
      if (!tokenResp.ok || !tokenJson.access_token) {
        throw new Error(tokenJson.error_description || 'Falha ao obter token Google OAuth2.');
      }
      const meResp = await this.fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const me = (await meResp.json()) as { email?: string; name?: string };
      email = me.email || '';
      displayName = me.name || '';
    } else {
      const tokenResp = await this.fetchImpl('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.APPLE_OAUTH_CLIENT_ID || '',
          client_secret: env.APPLE_OAUTH_CLIENT_SECRET || '',
          code: params.code,
          redirect_uri: session.callbackUrl,
          grant_type: 'authorization_code',
        }),
      });
      const tokenJson = (await tokenResp.json()) as { id_token?: string; error?: string };
      if (!tokenResp.ok || !tokenJson.id_token) {
        throw new Error(tokenJson.error || 'Falha ao validar código Apple Sign In.');
      }
      const idClaims = decodeJwtClaimsUnsafe(tokenJson.id_token);
      email = String(idClaims?.email || '');
      if (params.userJson) {
        try {
          const parsedUser = JSON.parse(params.userJson) as {
            name?: { firstName?: string; lastName?: string };
          };
          const full = `${parsedUser.name?.firstName || ''} ${parsedUser.name?.lastName || ''}`.trim();
          if (full) displayName = full;
        } catch {
          // Ignore optional user JSON parse failure
        }
      }
    }

    if (!email || !email.includes('@')) {
      throw new Error('O provedor OAuth não retornou um endereço de e-mail válido.');
    }

    const cleanName = displayName.trim() || email.split('@')[0];
    const profile = params.store.loginOrRegister({
      email,
      displayName: cleanName,
      provider: session.provider,
      role: session.role,
      offlineMode: false,
    });

    params.store.recordVucProof(
      'OAUTH_CALLBACK_VERIFIED',
      `Login OAuth2 ${session.provider}: ${email}`,
      {
        provider: session.provider,
        userId: profile.id,
        role: profile.role,
      }
    );

    const sessionToken = signSessionToken(
      {
        userId: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        provider: profile.provider,
        role: profile.role,
      },
      86_400,
      env
    );

    return {
      profile: { ...profile, sessionToken },
      sessionToken,
      provider: session.provider,
      origin: session.origin,
    };
  }
}
