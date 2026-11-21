import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OAuthCallbackManager,
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  clearFirebaseCertCacheForTest,
  decodeJwtClaimsUnsafe,
  extractSessionTokenFromHeaders,
  getOAuthProvidersReadiness,
  getSessionSigningSecret,
  isDisallowedOAuthHostname,
  normalizeZohoDomain,
  renderOAuthCallbackHtml,
  resolveAppBaseUrl,
  signSessionToken,
  validateExternalOAuthUrl,
  verifyFirebaseIdToken,
  verifySessionToken,
  type FetchLike,
} from '../src/server/oauthAuthHandler';
import { ParametrixSqliteStore } from '../src/server/sqliteStore';

const tempDirs: string[] = [];

function createTempStore(): ParametrixSqliteStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parametrix-oauth-'));
  tempDirs.push(dir);
  return new ParametrixSqliteStore(path.join(dir, 'test.db'));
}

function makeSignedRs256Jwt(
  privateKey: crypto.KeyObject,
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): string {
  const h = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const p = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  signer.end();
  const sig = signer.sign(privateKey).toString('base64url');
  return `${h}.${p}.${sig}`;
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400, headers: Record<string, string> = {}) {
  return {
    ok,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  clearFirebaseCertCacheForTest();
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('oauthAuthHandler utilities', () => {
  it('resolveAppBaseUrl e getSessionSigningSecret cobrem variáveis e headers encaminhados', () => {
    expect(getSessionSigningSecret({ SESSION_SECRET: 'super-secret-key-with-min-len' })).toBe(
      'super-secret-key-with-min-len'
    );
    expect(getSessionSigningSecret({ SESSION_SECRET: 'short' }).length).toBeGreaterThanOrEqual(32);

    expect(
      resolveAppBaseUrl({}, 'http', { APP_URL: 'https://ais-dev.example.run.app/' })
    ).toBe('https://ais-dev.example.run.app');

    expect(
      resolveAppBaseUrl(
        {
          'x-forwarded-proto': ['https'],
          'x-forwarded-host': ['forwarded.example.com'],
        },
        'http',
        { APP_URL: 'MY_APP_URL' }
      )
    ).toBe('https://forwarded.example.com');

    expect(
      resolveAppBaseUrl({ host: ['local.host:3000'] }, '', {})
    ).toBe('http://local.host:3000');

    expect(resolveAppBaseUrl({}, '', {})).toBe('http://localhost:3000');
  });

  it('valida domínios Zoho, anti-SSRF e URLs HTTPS externas', () => {
    expect(normalizeZohoDomain()).toBe('accounts.zoho.com');
    expect(normalizeZohoDomain('https://accounts.zoho.eu/oauth/v2')).toBe('accounts.zoho.eu');
    expect(normalizeZohoDomain('https://localhost/evil')).toBe('accounts.zoho.com');
    expect(normalizeZohoDomain('bad host!')).toBe('accounts.zoho.com');

    expect(isDisallowedOAuthHostname('localhost')).toBe(true);
    expect(isDisallowedOAuthHostname('0.0.0.0')).toBe(true);
    expect(isDisallowedOAuthHostname('::1')).toBe(true);
    expect(isDisallowedOAuthHostname('svc.local')).toBe(true);
    expect(isDisallowedOAuthHostname('db.internal')).toBe(true);
    expect(isDisallowedOAuthHostname('10.0.0.5')).toBe(true);
    expect(isDisallowedOAuthHostname('127.0.0.1')).toBe(true);
    expect(isDisallowedOAuthHostname('169.254.169.254')).toBe(true);
    expect(isDisallowedOAuthHostname('172.16.0.10')).toBe(true);
    expect(isDisallowedOAuthHostname('192.168.1.1')).toBe(true);
    expect(isDisallowedOAuthHostname('8.8.8.8')).toBe(false);
    expect(isDisallowedOAuthHostname('identity.oraclecloud.com')).toBe(false);

    expect(() => validateExternalOAuthUrl('http://identity.oraclecloud.com')).toThrow('HTTPS');
    expect(() => validateExternalOAuthUrl('https://127.0.0.1/token')).toThrow('Host local ou privado');
    expect(validateExternalOAuthUrl('https://identity.oraclecloud.com/oauth2/v1/token').hostname).toBe(
      'identity.oraclecloud.com'
    );
  });

  it('assina e verifica tokens de sessão HMAC, extrai de Bearer/Cookie e formata cookies', () => {
    const env = { SESSION_SECRET: 'parametrix-session-secret-0123456' };
    const token = signSessionToken(
      {
        userId: 'usr-1',
        email: 'eng@parametrix.com',
        displayName: 'Engenheiro',
        provider: 'microsoft',
        role: 'cam_provider',
      },
      120,
      env
    );
    const claims = verifySessionToken(token, env);
    expect(claims?.userId).toBe('usr-1');
    expect(claims?.role).toBe('cam_provider');

    expect(verifySessionToken('invalid', env)).toBeNull();
    expect(verifySessionToken('.sig', env)).toBeNull();
    expect(verifySessionToken('payload.', env)).toBeNull();
    expect(verifySessionToken(`${token}x`, env)).toBeNull();
    expect(verifySessionToken(token, { SESSION_SECRET: 'different-secret-0123456789' })).toBeNull();

    const expiredToken = signSessionToken(
      {
        userId: 'usr-1',
        email: 'eng@parametrix.com',
        displayName: 'Engenheiro',
        provider: 'microsoft',
        role: 'client',
      },
      -10,
      env
    );
    expect(verifySessionToken(expiredToken, env)).toBeNull();

    // Valid HMAC over corrupted JSON
    const badJsonPayload = Buffer.from('{bad-json', 'utf8').toString('base64url');
    const badJsonSig = crypto
      .createHmac('sha256', env.SESSION_SECRET)
      .update(badJsonPayload)
      .digest('base64url');
    expect(verifySessionToken(`${badJsonPayload}.${badJsonSig}`, env)).toBeNull();

    expect(extractSessionTokenFromHeaders(`Bearer ${token}`)).toBe(token);
    expect(extractSessionTokenFromHeaders('Bearer   ', undefined)).toBeNull();
    expect(
      extractSessionTokenFromHeaders(
        undefined,
        `malformed; other=1; parametrix_session=${encodeURIComponent(token)}`
      )
    ).toBe(token);
    expect(extractSessionTokenFromHeaders(undefined, 'other=1')).toBeNull();

    expect(buildSessionCookieHeader('abc')).toContain('HttpOnly; Secure; SameSite=None; Partitioned');
    expect(buildClearSessionCookieHeader()).toContain('Max-Age=0');

    expect(decodeJwtClaimsUnsafe()).toBeNull();
    expect(decodeJwtClaimsUnsafe('onlyonepart')).toBeNull();
    expect(decodeJwtClaimsUnsafe('hdr.!!!bad!!!')).toBeNull();
    const validJwt = `hdr.${Buffer.from('{"email":"a@b.com"}').toString('base64url')}.sig`;
    expect(decodeJwtClaimsUnsafe(validJwt)).toEqual({ email: 'a@b.com' });
  });

  it('renderiza HTML de callback OAuth escapando tags e reportando sucesso ou erro', () => {
    const okHtml = renderOAuthCallbackHtml(
      { type: 'OAUTH_AUTH_SUCCESS', note: '</script>' },
      'https://app.example.com'
    );
    expect(okHtml).toContain('Autenticação concluída');
    expect(okHtml).toContain('\\u003c/script>');

    const errHtml = renderOAuthCallbackHtml({ type: 'OAUTH_AUTH_ERROR', error: 'Falhou' }, '');
    expect(errHtml).toContain('Falha na autenticação');
    expect(errHtml).toContain('"*"');
  });

  it('reporta readiness de provedores com e sem credenciais no .env', () => {
    const empty = getOAuthProvidersReadiness('https://app/auth/callback', {});
    expect(empty.providers.google.mode).toBe('firebase-popup');
    expect(empty.providers.microsoft.configured).toBe(false);
    expect(empty.providers.oracle.configured).toBe(false);
    expect(empty.providers.zoho.configured).toBe(false);

    const full = getOAuthProvidersReadiness('https://app/auth/callback', {
      GOOGLE_OAUTH_CLIENT_ID: 'g-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'g-sec',
      APPLE_OAUTH_CLIENT_ID: 'a-id',
      APPLE_OAUTH_CLIENT_SECRET: 'a-sec',
      MICROSOFT_OAUTH_CLIENT_ID: 'm-id',
      MICROSOFT_OAUTH_CLIENT_SECRET: 'm-sec',
      ORACLE_OAUTH_CLIENT_ID: 'o-id',
      ORACLE_OAUTH_CLIENT_SECRET: 'o-sec',
      ORACLE_OAUTH_AUTH_URL: 'https://oracle.example.com/auth',
      ORACLE_OAUTH_TOKEN_URL: 'https://oracle.example.com/token',
      ZOHO_OAUTH_CLIENT_ID: 'z-id',
      ZOHO_OAUTH_CLIENT_SECRET: 'z-sec',
    });
    expect(full.providers.google.oauthServerConfigured).toBe(true);
    expect(full.providers.apple.oauthServerConfigured).toBe(true);
    expect(full.providers.microsoft.configured).toBe(true);
    expect(full.providers.oracle.configured).toBe(true);
    expect(full.providers.zoho.configured).toBe(true);
  });
});

describe('verifyFirebaseIdToken RS256', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const projectId = 'gen-lang-client-test';

  it('valida assinatura RS256 real, utiliza cache de chaves e rejeita tokens inválidos', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const validToken = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        exp: nowSec + 600,
        iat: nowSec - 10,
        sub: 'uid-123',
        email: 'eng@parametrix.io',
        name: 'Marcos Engenharia',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }
    );

    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ 'kid-1': publicPem }, true, 200, { 'cache-control': 'public, max-age=300' })
    );

    const verified = await verifyFirebaseIdToken(validToken, projectId, fetchMock);
    expect(verified).toEqual({
      uid: 'uid-123',
      email: 'eng@parametrix.io',
      displayName: 'Marcos Engenharia',
      emailVerified: true,
      signInProvider: 'google.com',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Cached cert path + fallback name/provider
    const tokenNoName = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        exp: nowSec + 600,
        iat: nowSec - 10,
        sub: 'uid-456',
        email: 'user@parametrix.io',
      }
    );
    const verifiedCached = await verifyFirebaseIdToken(tokenNoName, projectId, fetchMock);
    expect(verifiedCached.displayName).toBe('user');
    expect(verifiedCached.signInProvider).toBe('google.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(verifyFirebaseIdToken('bad.token', projectId, fetchMock)).rejects.toThrow('malformado');
    await expect(verifyFirebaseIdToken('bad!.bad!.sig', projectId, fetchMock)).rejects.toThrow('decodificar');

    const hsToken = makeSignedRs256Jwt(privateKey, { alg: 'HS256', kid: 'kid-1' }, {});
    await expect(verifyFirebaseIdToken(hsToken, projectId, fetchMock)).rejects.toThrow('Algoritmo');

    const wrongProj = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      { aud: 'other', iss: 'other', exp: nowSec + 100, iat: nowSec, sub: 'u', email: 'a@b.com' }
    );
    await expect(verifyFirebaseIdToken(wrongProj, projectId, fetchMock)).rejects.toThrow('projeto diferente');

    const expired = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        exp: nowSec - 10,
        iat: nowSec - 100,
        sub: 'u',
        email: 'a@b.com',
      }
    );
    await expect(verifyFirebaseIdToken(expired, projectId, fetchMock)).rejects.toThrow('expirado');

    const futureIat = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        exp: nowSec + 500,
        iat: nowSec + 999,
        sub: 'u',
        email: 'a@b.com',
      }
    );
    await expect(verifyFirebaseIdToken(futureIat, projectId, fetchMock)).rejects.toThrow('iat inválido');

    const noEmail = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        exp: nowSec + 500,
        iat: nowSec,
        sub: 'u',
        email: 'invalid',
      }
    );
    await expect(verifyFirebaseIdToken(noEmail, projectId, fetchMock)).rejects.toThrow('UID ou e-mail');

    const unknownKid = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'missing-kid' },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        exp: nowSec + 500,
        iat: nowSec,
        sub: 'u',
        email: 'a@b.com',
      }
    );
    await expect(verifyFirebaseIdToken(unknownKid, projectId, fetchMock)).rejects.toThrow('Chave pública (kid)');

    const tampered = validToken.slice(0, -4) + 'AAAA';
    await expect(verifyFirebaseIdToken(tampered, projectId, fetchMock)).rejects.toThrow('Assinatura criptográfica');
  });

  it('lida com falha HTTP e cabeçalho sem max-age ao baixar certificados Firebase', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'kid-2' },
      {
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        exp: nowSec + 600,
        iat: nowSec - 5,
        sub: 'u2',
        email: 'u2@b.com',
      }
    );

    const failFetch = vi.fn<FetchLike>(async () => jsonResponse({}, false, 503));
    await expect(verifyFirebaseIdToken(token, projectId, failFetch)).rejects.toThrow('certificados públicos Firebase (503)');

    clearFirebaseCertCacheForTest();
    const noCacheHeaderFetch = vi.fn<FetchLike>(async () => jsonResponse({ 'kid-2': publicPem }, true, 200));
    const ok = await verifyFirebaseIdToken(token, projectId, noCacheHeaderFetch);
    expect(ok.uid).toBe('u2');
  });
});

describe('OAuthCallbackManager multi-provider flows', () => {
  it('normaliza provedores, limpa estados expirados e valida credenciais obrigatórias', () => {
    const mgr = new OAuthCallbackManager();
    expect(mgr.normalizeProvider(' Microsoft ')).toBe('microsoft');
    expect(mgr.normalizeProvider('oracle')).toBe('oracle');
    expect(mgr.normalizeProvider('ZOHO')).toBe('zoho');
    expect(mgr.normalizeProvider('google')).toBe('google');
    expect(mgr.normalizeProvider('apple')).toBe('apple');
    expect(mgr.normalizeProvider('unknown')).toBeNull();

    const providers = ['oracle', 'zoho', 'microsoft', 'google', 'apple'] as const;
    for (const provider of providers) {
      const missing = mgr.createAuthorizationUrl({
        provider,
        role: 'client',
        callbackUrl: 'https://app.example.com/auth/callback',
        origin: 'https://app.example.com',
        env: {},
      });
      expect(missing.configured).toBe(false);
    }

    mgr.pendingStates.set('stale-state', {
      provider: 'zoho',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app.example.com/auth/callback',
      origin: 'https://app.example.com',
      createdAt: Date.now() - 11 * 60 * 1000,
    });

    const zohoAuth = mgr.createAuthorizationUrl({
      provider: 'zoho',
      role: 'supplier',
      callbackUrl: 'https://app.example.com/auth/callback',
      origin: 'https://app.example.com',
      env: { ZOHO_OAUTH_CLIENT_ID: 'z-id', ZOHO_OAUTH_CLIENT_SECRET: 'z-sec' },
    });
    expect(zohoAuth.configured).toBe(true);
    expect(zohoAuth.url).toContain('accounts.zoho.com/oauth/v2/auth');
    expect(mgr.pendingStates.has('stale-state')).toBe(false);

    const oracleAuth = mgr.createAuthorizationUrl({
      provider: 'oracle',
      role: 'compute_node',
      callbackUrl: 'https://app.example.com/auth/callback',
      origin: 'https://app.example.com',
      env: {
        ORACLE_OAUTH_CLIENT_ID: 'o-id',
        ORACLE_OAUTH_CLIENT_SECRET: 'o-sec',
        ORACLE_OAUTH_AUTH_URL: 'https://idcs.oraclecloud.com/oauth2/v1/authorize',
        ORACLE_OAUTH_TOKEN_URL: 'https://idcs.oraclecloud.com/oauth2/v1/token',
      },
    });
    expect(oracleAuth.configured).toBe(true);
    expect(oracleAuth.url).toContain('code_challenge_method=S256');

    const msAuth = mgr.createAuthorizationUrl({
      provider: 'microsoft',
      role: 'cam_provider',
      callbackUrl: 'https://app.example.com/auth/callback',
      origin: 'https://app.example.com',
      env: { MICROSOFT_OAUTH_CLIENT_ID: 'm-id', MICROSOFT_OAUTH_CLIENT_SECRET: 'm-sec' },
    });
    expect(msAuth.url).toContain('login.microsoftonline.com/common');

    const googleAuth = mgr.createAuthorizationUrl({
      provider: 'google',
      role: 'client',
      callbackUrl: 'https://app.example.com/auth/callback',
      origin: 'https://app.example.com',
      env: { GOOGLE_OAUTH_CLIENT_ID: 'g-id', GOOGLE_OAUTH_CLIENT_SECRET: 'g-sec' },
    });
    expect(googleAuth.url).toContain('accounts.google.com/o/oauth2/v2/auth');

    const appleAuth = mgr.createAuthorizationUrl({
      provider: 'apple',
      role: 'client',
      callbackUrl: 'https://app.example.com/auth/callback',
      origin: 'https://app.example.com',
      env: { APPLE_OAUTH_CLIENT_ID: 'a-id', APPLE_OAUTH_CLIENT_SECRET: 'a-sec' },
    });
    expect(appleAuth.url).toContain('response_mode=form_post');
  });

  it('executa callback Microsoft (Graph / id_token fallback / erros)', async () => {
    const store = createTempStore();
    const env = {
      MICROSOFT_OAUTH_CLIENT_ID: 'm-id',
      MICROSOFT_OAUTH_CLIENT_SECRET: 'm-sec',
      MICROSOFT_OAUTH_TENANT: 'contoso.onmicrosoft.com',
      SESSION_SECRET: 'test-session-secret-0123456789abcdef',
    };

    const fetchOk = vi.fn<FetchLike>(async (url) => {
      if (String(url).includes('/token')) {
        return jsonResponse({ access_token: 'ms-tok' });
      }
      return jsonResponse({ mail: 'eng@contoso.com', displayName: 'Eng Contoso' });
    });
    const mgr = new OAuthCallbackManager(fetchOk);
    const { url } = mgr.createAuthorizationUrl({
      provider: 'microsoft',
      role: 'cam_provider',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      env,
    });
    const state = new URL(url!).searchParams.get('state')!;
    const res = await mgr.handleCallback({ state, code: 'code-1', store, env });
    expect(res.profile.email).toBe('eng@contoso.com');
    expect(res.profile.role).toBe('cam_provider');
    expect(verifySessionToken(res.sessionToken, env)?.provider).toBe('microsoft');

    // Fallback to id_token claims when /me is unavailable
    const idJwt = `h.${Buffer.from(
      JSON.stringify({ preferred_username: 'fallback@contoso.com', name: 'MS Fallback' })
    ).toString('base64url')}.s`;
    const fetchFallback = vi.fn<FetchLike>(async (url) => {
      if (String(url).includes('/token')) return jsonResponse({ access_token: 'ms-tok-2', id_token: idJwt });
      return jsonResponse({}, false, 403);
    });
    const mgrFallback = new OAuthCallbackManager(fetchFallback);
    const st2 = new URL(
      mgrFallback.createAuthorizationUrl({
        provider: 'microsoft',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: { MICROSOFT_OAUTH_CLIENT_ID: 'm-id', MICROSOFT_OAUTH_CLIENT_SECRET: 'm-sec' },
      }).url!
    ).searchParams.get('state')!;
    const res2 = await mgrFallback.handleCallback({
      state: st2,
      code: 'code-2',
      store,
      env: { MICROSOFT_OAUTH_CLIENT_ID: 'm-id', MICROSOFT_OAUTH_CLIENT_SECRET: 'm-sec' },
    });
    expect(res2.profile.email).toBe('fallback@contoso.com');

    // Token error branch
    const mgrErr = new OAuthCallbackManager(async () => jsonResponse({ error_description: 'Bad code' }, false, 400));
    const stErr = new URL(
      mgrErr.createAuthorizationUrl({
        provider: 'microsoft',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env,
      }).url!
    ).searchParams.get('state')!;
    await expect(mgrErr.handleCallback({ state: stErr, code: 'c', store, env })).rejects.toThrow('Bad code');
  });

  it('executa callback Zoho, Oracle, Google e Apple (incluindo form_post userJson e falhas)', async () => {
    const store = createTempStore();

    // Common error cases
    const mgrBase = new OAuthCallbackManager();
    await expect(
      mgrBase.handleCallback({ state: '', code: '', providerError: 'access_denied', store })
    ).rejects.toThrow('recusou');
    await expect(mgrBase.handleCallback({ state: 'missing', code: 'c', store })).rejects.toThrow('inválida');

    // Zoho
    const zohoFetch = vi.fn<FetchLike>(async (url) => {
      if (String(url).includes('/oauth/v2/token')) return jsonResponse({ access_token: 'z-tok' });
      return jsonResponse({ Email: 'ops@zoho.com', First_Name: 'ZohoUser' });
    });
    const zohoMgr = new OAuthCallbackManager(zohoFetch);
    const zohoEnv = { ZOHO_OAUTH_CLIENT_ID: 'zid', ZOHO_OAUTH_CLIENT_SECRET: 'zsec' };
    const zohoState = new URL(
      zohoMgr.createAuthorizationUrl({
        provider: 'zoho',
        role: 'logistics',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: zohoEnv,
      }).url!
    ).searchParams.get('state')!;
    const zohoRes = await zohoMgr.handleCallback({ state: zohoState, code: 'zc', store, env: zohoEnv });
    expect(zohoRes.profile.email).toBe('ops@zoho.com');

    const zohoFailMgr = new OAuthCallbackManager(async () => jsonResponse({ error: 'zoho_err' }, false, 400));
    const zohoFailSt = new URL(
      zohoFailMgr.createAuthorizationUrl({
        provider: 'zoho',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: zohoEnv,
      }).url!
    ).searchParams.get('state')!;
    await expect(zohoFailMgr.handleCallback({ state: zohoFailSt, code: 'c', store, env: zohoEnv })).rejects.toThrow(
      'zoho_err'
    );

    // Oracle with userinfo endpoint and without userinfo endpoint
    const oracleEnv = {
      ORACLE_OAUTH_CLIENT_ID: 'oid',
      ORACLE_OAUTH_CLIENT_SECRET: 'osec',
      ORACLE_OAUTH_AUTH_URL: 'https://idcs.oraclecloud.com/oauth2/v1/authorize',
      ORACLE_OAUTH_TOKEN_URL: 'https://idcs.oraclecloud.com/oauth2/v1/token',
      ORACLE_OAUTH_USERINFO_URL: 'https://idcs.oraclecloud.com/oauth2/v1/userinfo',
    };
    const oracleFetch = vi.fn<FetchLike>(async (url) => {
      if (String(url).includes('/token')) return jsonResponse({ access_token: 'o-tok' });
      return jsonResponse({ preferred_username: 'dba@oracle.com', name: 'Oracle Admin' });
    });
    const oracleMgr = new OAuthCallbackManager(oracleFetch);
    const oSt = new URL(
      oracleMgr.createAuthorizationUrl({
        provider: 'oracle',
        role: 'compute_node',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: oracleEnv,
      }).url!
    ).searchParams.get('state')!;
    const oracleRes = await oracleMgr.handleCallback({ state: oSt, code: 'oc', store, env: oracleEnv });
    expect(oracleRes.profile.email).toBe('dba@oracle.com');

    // Oracle fallback without userinfo endpoint -> id_token
    const oracleEnvNoUserinfo = { ...oracleEnv, ORACLE_OAUTH_USERINFO_URL: '' };
    const oracleIdJwt = `h.${Buffer.from(JSON.stringify({ email: 'jwt@oracle.com', name: 'JWT Oracle' })).toString('base64url')}.s`;
    const oracleNoUiMgr = new OAuthCallbackManager(async () =>
      jsonResponse({ access_token: 'o2', id_token: oracleIdJwt })
    );
    const oSt2 = new URL(
      oracleNoUiMgr.createAuthorizationUrl({
        provider: 'oracle',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: oracleEnvNoUserinfo,
      }).url!
    ).searchParams.get('state')!;
    const oracleRes2 = await oracleNoUiMgr.handleCallback({
      state: oSt2,
      code: 'oc2',
      store,
      env: oracleEnvNoUserinfo,
    });
    expect(oracleRes2.profile.email).toBe('jwt@oracle.com');

    // Oracle token error
    const oracleErrMgr = new OAuthCallbackManager(async () => jsonResponse({}, false, 401));
    const oStErr = new URL(
      oracleErrMgr.createAuthorizationUrl({
        provider: 'oracle',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: oracleEnv,
      }).url!
    ).searchParams.get('state')!;
    await expect(
      oracleErrMgr.handleCallback({ state: oStErr, code: 'oc3', store, env: oracleEnv })
    ).rejects.toThrow('token Oracle');

    // Google OAuth2
    const googleEnv = { GOOGLE_OAUTH_CLIENT_ID: 'gid', GOOGLE_OAUTH_CLIENT_SECRET: 'gsec' };
    const googleMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token')
        ? jsonResponse({ access_token: 'g-tok' })
        : jsonResponse({ email: 'eng@gmail.com', name: 'Google Eng' })
    );
    const gSt = new URL(
      googleMgr.createAuthorizationUrl({
        provider: 'google',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: googleEnv,
      }).url!
    ).searchParams.get('state')!;
    const googleRes = await googleMgr.handleCallback({ state: gSt, code: 'gc', store, env: googleEnv });
    expect(googleRes.profile.email).toBe('eng@gmail.com');

    const googleErrMgr = new OAuthCallbackManager(async () => jsonResponse({}, false, 400));
    const gStErr = new URL(
      googleErrMgr.createAuthorizationUrl({
        provider: 'google',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: googleEnv,
      }).url!
    ).searchParams.get('state')!;
    await expect(
      googleErrMgr.handleCallback({ state: gStErr, code: 'gc2', store, env: googleEnv })
    ).rejects.toThrow('token Google');

    // Apple Sign In form_post with user JSON + malformed user JSON + missing email
    const appleEnv = { APPLE_OAUTH_CLIENT_ID: 'aid', APPLE_OAUTH_CLIENT_SECRET: 'asec' };
    const appleIdJwt = `h.${Buffer.from(JSON.stringify({ email: 'apple@icloud.com' })).toString('base64url')}.s`;
    const appleMgr = new OAuthCallbackManager(async () => jsonResponse({ id_token: appleIdJwt }));
    const aSt = new URL(
      appleMgr.createAuthorizationUrl({
        provider: 'apple',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: appleEnv,
      }).url!
    ).searchParams.get('state')!;
    const appleRes = await appleMgr.handleCallback({
      state: aSt,
      code: 'ac',
      userJson: JSON.stringify({ name: { firstName: 'Tim', lastName: 'Cook' } }),
      store,
      env: appleEnv,
    });
    expect(appleRes.profile.displayName).toBe('Tim Cook');

    const aStBadJson = new URL(
      appleMgr.createAuthorizationUrl({
        provider: 'apple',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: appleEnv,
      }).url!
    ).searchParams.get('state')!;
    const appleResFallbackName = await appleMgr.handleCallback({
      state: aStBadJson,
      code: 'ac2',
      userJson: '{not-json',
      store,
      env: appleEnv,
    });
    expect(appleResFallbackName.profile.displayName).toBe('Tim Cook');

    const appleErrMgr = new OAuthCallbackManager(async () => jsonResponse({ error: 'invalid_client' }, false, 400));
    const aStErr = new URL(
      appleErrMgr.createAuthorizationUrl({
        provider: 'apple',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: appleEnv,
      }).url!
    ).searchParams.get('state')!;
    await expect(
      appleErrMgr.handleCallback({ state: aStErr, code: 'ac3', store, env: appleEnv })
    ).rejects.toThrow('invalid_client');

    // Provider returned no valid email
    const noEmailMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token') ? jsonResponse({ access_token: 'z-empty' }) : jsonResponse({})
    );
    const zEmptySt = new URL(
      noEmailMgr.createAuthorizationUrl({
        provider: 'zoho',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
        env: zohoEnv,
      }).url!
    ).searchParams.get('state')!;
    await expect(
      noEmailMgr.handleCallback({ state: zEmptySt, code: 'zc-empty', store, env: zohoEnv })
    ).rejects.toThrow('endereço de e-mail válido');
  });

  it('cobre todos os fallbacks de claims opcionais, defaults process.env e erros sem descrição', async () => {
    const store = createTempStore();
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const projectId = 'proj-edge';
    const nowSec = Math.floor(Date.now() / 1000);
    const fetchCerts = vi.fn<FetchLike>(async () => jsonResponse({ k1: publicPem }, true, 200));

    // Non-string sub and missing email in Firebase token
    const noSubTok = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'k1' },
      { aud: projectId, iss: `https://securetoken.google.com/${projectId}`, exp: nowSec + 100, iat: nowSec, sub: 123, email: 'a@b.com' }
    );
    await expect(verifyFirebaseIdToken(noSubTok, projectId, fetchCerts)).rejects.toThrow('UID ou e-mail');

    const nonStrEmailTok = makeSignedRs256Jwt(
      privateKey,
      { alg: 'RS256', kid: 'k1' },
      { aud: projectId, iss: `https://securetoken.google.com/${projectId}`, exp: nowSec + 100, iat: nowSec, sub: 'u1', email: 42 }
    );
    await expect(verifyFirebaseIdToken(nonStrEmailTok, projectId, fetchCerts)).rejects.toThrow('UID ou e-mail');

    // Default process.env in createAuthorizationUrl and handleCallback when env omitted
    const mgrDefaults = new OAuthCallbackManager(async () => jsonResponse({}, false, 400));
    expect(
      mgrDefaults.createAuthorizationUrl({
        provider: 'zoho',
        role: 'client',
        callbackUrl: 'https://app/auth/callback',
        origin: 'https://app',
      }).configured
    ).toBe(false);

    // Microsoft UPN-only without mail or displayName, plus default error string and id_token empty/email-only fallback
    const msUpnMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token')
        ? jsonResponse({ access_token: 'ms-t' })
        : jsonResponse({ userPrincipalName: 'upn@contoso.com' })
    );
    msUpnMgr.pendingStates.set('ms-upn', {
      provider: 'microsoft',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    const upnRes = await msUpnMgr.handleCallback({ state: 'ms-upn', code: 'c', store });
    expect(upnRes.profile.email).toBe('upn@contoso.com');

    const msIdEmailOnly = `h.${Buffer.from(JSON.stringify({ email: 'idmail@contoso.com' })).toString('base64url')}.s`;
    const msMeDisplayOnlyMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token')
        ? jsonResponse({ access_token: 'ms-t', id_token: msIdEmailOnly })
        : jsonResponse({ displayName: 'Display Already' })
    );
    msMeDisplayOnlyMgr.pendingStates.set('ms-disp', {
      provider: 'microsoft',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    const dispRes = await msMeDisplayOnlyMgr.handleCallback({ state: 'ms-disp', code: 'c', store });
    expect(dispRes.profile.displayName).toBe('Display Already');

    const msIdEmptyMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token')
        ? jsonResponse({ access_token: 'ms-t', id_token: `h.${Buffer.from('{}').toString('base64url')}.s` })
        : jsonResponse({})
    );
    msIdEmptyMgr.pendingStates.set('ms-empty', {
      provider: 'microsoft',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    await expect(msIdEmptyMgr.handleCallback({ state: 'ms-empty', code: 'c', store })).rejects.toThrow(
      'endereço de e-mail válido'
    );

    const msEmptyErrMgr = new OAuthCallbackManager(async () => jsonResponse({}, false, 400));
    msEmptyErrMgr.pendingStates.set('ms-err', {
      provider: 'microsoft',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    await expect(msEmptyErrMgr.handleCallback({ state: 'ms-err', code: 'c', store })).rejects.toThrow(
      'Falha ao obter token Microsoft'
    );

    // Zoho default error + Display_Name without email fallback
    const zEmptyErrMgr = new OAuthCallbackManager(async () => jsonResponse({}, false, 400));
    zEmptyErrMgr.pendingStates.set('z-err', {
      provider: 'zoho',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    await expect(zEmptyErrMgr.handleCallback({ state: 'z-err', code: 'c', store })).rejects.toThrow(
      'Falha ao trocar código Zoho'
    );

    // Oracle missing ORACLE_OAUTH_TOKEN_URL, non-ok userinfo fallback to id_token, email without name
    const oMissingUrlMgr = new OAuthCallbackManager();
    oMissingUrlMgr.pendingStates.set('o-miss', {
      provider: 'oracle',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    await expect(oMissingUrlMgr.handleCallback({ state: 'o-miss', code: 'c', store, env: {} })).rejects.toThrow();

    const oraclePrefJwt = `h.${Buffer.from(
      JSON.stringify({ preferred_username: 'pref@oracle.com' })
    ).toString('base64url')}.s`;
    const oFailUserinfoMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token')
        ? jsonResponse({ access_token: 'o-t', id_token: oraclePrefJwt })
        : jsonResponse({}, false, 500)
    );
    const oEnvFull = {
      ORACLE_OAUTH_TOKEN_URL: 'https://idcs.oraclecloud.com/token',
      ORACLE_OAUTH_USERINFO_URL: 'https://idcs.oraclecloud.com/userinfo',
    };
    oFailUserinfoMgr.pendingStates.set('o-fui', {
      provider: 'oracle',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    const oPrefRes = await oFailUserinfoMgr.handleCallback({ state: 'o-fui', code: 'c', store, env: oEnvFull });
    expect(oPrefRes.profile.email).toBe('pref@oracle.com');

    const oMailOnlyMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token')
        ? jsonResponse({ access_token: 'o-t' })
        : jsonResponse({ email: 'direct@oracle.com' })
    );
    oMailOnlyMgr.pendingStates.set('o-mail', {
      provider: 'oracle',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    const oDirectRes = await oMailOnlyMgr.handleCallback({ state: 'o-mail', code: 'c', store, env: oEnvFull });
    expect(oDirectRes.profile.email).toBe('direct@oracle.com');

    // Google without client env, missing email/name from userinfo
    const gMissingMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token') ? jsonResponse({ access_token: 'g-t' }) : jsonResponse({})
    );
    gMissingMgr.pendingStates.set('g-empty', {
      provider: 'google',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    await expect(gMissingMgr.handleCallback({ state: 'g-empty', code: 'c', store })).rejects.toThrow(
      'endereço de e-mail válido'
    );

    // Apple default error, missing email in id_token, and empty name object in userJson
    const aEmptyErrMgr = new OAuthCallbackManager(async () => jsonResponse({}, false, 400));
    aEmptyErrMgr.pendingStates.set('a-err', {
      provider: 'apple',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    await expect(aEmptyErrMgr.handleCallback({ state: 'a-err', code: 'c', store })).rejects.toThrow(
      'Falha ao validar código Apple'
    );

    const aEmptyClaimsMgr = new OAuthCallbackManager(async () =>
      jsonResponse({ id_token: 'bad.jwt' })
    );
    aEmptyClaimsMgr.pendingStates.set('a-noem', {
      provider: 'apple',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    await expect(aEmptyClaimsMgr.handleCallback({ state: 'a-noem', code: 'c', store })).rejects.toThrow(
      'endereço de e-mail válido'
    );

    const aOkNoNameMgr = new OAuthCallbackManager(async () =>
      jsonResponse({ id_token: `h.${Buffer.from('{"email":"noname@icloud.com"}').toString('base64url')}.s` })
    );
    aOkNoNameMgr.pendingStates.set('a-noname', {
      provider: 'apple',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    const aNoNameRes = await aOkNoNameMgr.handleCallback({
      state: 'a-noname',
      code: 'c',
      userJson: JSON.stringify({ name: {} }),
      store,
    });
    expect(aNoNameRes.profile.displayName).toBe('noname');

    const oEmptyBothMgr = new OAuthCallbackManager(async (url) =>
      String(url).includes('/token')
        ? jsonResponse({ access_token: 'o-t', id_token: `h.${Buffer.from('{}').toString('base64url')}.s` })
        : jsonResponse({})
    );
    oEmptyBothMgr.pendingStates.set('o-empty-both', {
      provider: 'oracle',
      role: 'client',
      codeVerifier: 'v',
      callbackUrl: 'https://app/auth/callback',
      origin: 'https://app',
      createdAt: Date.now(),
    });
    await expect(
      oEmptyBothMgr.handleCallback({ state: 'o-empty-both', code: 'c', store, env: oEnvFull })
    ).rejects.toThrow('endereço de e-mail válido');
  });
});
