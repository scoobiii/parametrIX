import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type AuthProvider as FirebaseAuthProvider,
  type User,
} from 'firebase/auth';
import { appleProvider, auth, googleProvider, microsoftProvider } from '../firebase';
import { ensureUserProfile } from '../services/userWorkspaceStore';
import type { AuthUserProfile, EcosystemRole } from '../types/cad';

export type ServerOAuthProviderId = 'microsoft' | 'oracle' | 'zoho' | 'google' | 'apple';

export interface OAuthProviderReadinessEntry {
  mode: string;
  configured: boolean;
  oauthServerConfigured: boolean;
}

export type OAuthProvidersMap = Record<
  'google' | 'email' | 'apple' | 'microsoft' | 'oracle' | 'zoho',
  OAuthProviderReadinessEntry
>;

interface AuthContextValue {
  user: User | null;
  backendProfile: AuthUserProfile | null;
  sessionToken: string | null;
  googleAccessToken: string | null;
  oauthProviders: OAuthProvidersMap | null;
  callbackUrl: string | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  signInWithGoogle: (role?: EcosystemRole) => Promise<User | null>;
  connectGoogleDrive: () => Promise<string | null>;
  signInWithMicrosoft: (
    role?: EcosystemRole
  ) => Promise<{ user: User | null; oauthProfile?: AuthUserProfile | null }>;
  signInWithApple: (role?: EcosystemRole) => Promise<User | null>;
  signInWithEmail: (params: {
    email: string;
    password: string;
    displayName?: string;
    createAccount?: boolean;
    role?: EcosystemRole;
  }) => Promise<User | null>;
  signInWithOAuthPopup: (
    provider: ServerOAuthProviderId,
    role?: EcosystemRole
  ) => Promise<AuthUserProfile>;
  refreshBackendSession: () => Promise<AuthUserProfile | null>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(providerLabel: string, err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return `Login ${providerLabel} cancelado antes da conclusão.`;
  }
  if (code === 'auth/popup-blocked') {
    return `Pop-up bloqueado pelo navegador. Permita pop-ups para entrar com ${providerLabel}.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return `Provedor ${providerLabel} precisa ser ativado no Firebase Console (Authentication > Sign-in method) para este projeto.`;
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Credenciais inválidas para autenticação Firebase E-mail/Senha.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Este e-mail já possui conta registrada no Firebase Authentication.';
  }
  if (code === 'auth/weak-password') {
    return 'A senha deve ter pelo menos 6 caracteres no Firebase Authentication.';
  }
  return err instanceof Error
    ? `Falha na autenticação ${providerLabel}: ${err.message}`
    : `Falha ao autenticar com ${providerLabel}.`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [backendProfile, setBackendProfile] = useState<AuthUserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvidersMap | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const authenticateFirebaseWithBackend = async (
    fbUser: User,
    role: EcosystemRole = 'client'
  ): Promise<AuthUserProfile | null> => {
    try {
      const idToken = await fbUser.getIdToken();
      const resp = await fetch('/api/auth/firebase-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, role }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        profile?: AuthUserProfile;
        sessionToken?: string;
      };
      if (data.profile) {
        setBackendProfile(data.profile);
        setSessionToken(data.sessionToken ?? data.profile.sessionToken ?? null);
        return data.profile;
      }
      return null;
    } catch {
      return null;
    }
  };

  const refreshBackendSession = async (bearerToken?: string): Promise<AuthUserProfile | null> => {
    try {
      const headers: Record<string, string> = {};
      const tokenToSend = bearerToken ?? sessionToken;
      if (tokenToSend) {
        headers.Authorization = `Bearer ${tokenToSend}`;
      }
      const resp = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        authenticated?: boolean;
        profile?: AuthUserProfile | null;
      };
      if (data.authenticated && data.profile) {
        setBackendProfile(data.profile);
        setSessionToken(data.profile.sessionToken ?? tokenToSend ?? null);
        return data.profile;
      }
      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    let onlineRetryHandler: (() => void) | null = null;

    const cleanupRetry = () => {
      if (onlineRetryHandler) {
        window.removeEventListener('online', onlineRetryHandler);
        onlineRetryHandler = null;
      }
    };

    const hydrateProvidersAndSession = async () => {
      try {
        const [provResp, sessResp] = await Promise.all([
          fetch('/api/auth/oauth/providers', { credentials: 'include' }),
          fetch('/api/auth/session', { credentials: 'include' }),
        ]);
        if (!active) return;
        if (provResp.ok) {
          const provData = (await provResp.json()) as {
            callbackUrl?: string;
            providers?: OAuthProvidersMap;
          };
          if (provData.callbackUrl) setCallbackUrl(provData.callbackUrl);
          if (provData.providers) setOauthProviders(provData.providers);
        }
        if (sessResp.ok) {
          const sessData = (await sessResp.json()) as {
            authenticated?: boolean;
            profile?: AuthUserProfile | null;
          };
          if (sessData.authenticated && sessData.profile) {
            setBackendProfile(sessData.profile);
            setSessionToken(sessData.profile.sessionToken ?? null);
          }
        }
      } catch {
        // Offline resilience
      }
    };

    void hydrateProvidersAndSession();

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      cleanupRetry();
      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        void authenticateFirebaseWithBackend(nextUser);
        try {
          await ensureUserProfile(nextUser);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('client is offline') || msg.includes('unavailable')) {
            console.warn(
              'Firestore temporariamente offline ao sincronizar perfil; aguardando reconexão.'
            );
            onlineRetryHandler = () => {
              void ensureUserProfile(nextUser).catch(() => {});
              cleanupRetry();
            };
            window.addEventListener('online', onlineRetryHandler, { once: true });
          } else {
            console.error('Erro ao inicializar perfil do usuário:', err);
          }
        }
      } else {
        setGoogleAccessToken(null);
      }
    });

    return () => {
      active = false;
      cleanupRetry();
      unsub();
    };
  }, []);

  const signInWithFirebaseProvider = async (
    provider: FirebaseAuthProvider,
    label: string,
    role: EcosystemRole = 'client'
  ): Promise<User | null> => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, provider);
      const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
      if (oauthCred?.accessToken) {
        setGoogleAccessToken(oauthCred.accessToken);
      }
      if (cred.user) {
        await ensureUserProfile(cred.user);
        await authenticateFirebaseWithBackend(cred.user, role);
      }
      return cred.user ?? null;
    } catch (err) {
      const message = mapFirebaseAuthError(label, err);
      setAuthError(message);
      throw new Error(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const connectGoogleDrive = async (): Promise<string | null> => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
      const token = oauthCred?.accessToken ?? null;
      setGoogleAccessToken(token);
      if (cred.user) {
        await ensureUserProfile(cred.user);
        await authenticateFirebaseWithBackend(cred.user);
      }
      return token;
    } catch (err) {
      const message = mapFirebaseAuthError('Google Drive', err);
      setAuthError(message);
      throw new Error(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const signInWithOAuthPopup = async (
    provider: ServerOAuthProviderId,
    role: EcosystemRole = 'client'
  ): Promise<AuthUserProfile> => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const origin = window.location.origin;
      const resp = await fetch(
        `/api/auth/oauth/url?provider=${encodeURIComponent(provider)}&role=${encodeURIComponent(role)}&origin=${encodeURIComponent(origin)}`,
        { credentials: 'include' }
      );
      const data = (await resp.json()) as {
        configured?: boolean;
        url?: string;
        callbackUrl?: string;
        requiredEnvVars?: string[];
        message?: string;
        error?: string;
      };

      if (data.callbackUrl) {
        setCallbackUrl(data.callbackUrl);
      }

      if (!resp.ok || !data.configured || !data.url) {
        const msg =
          data.message ||
          data.error ||
          `Provedor OAuth ${provider.toUpperCase()} requer credenciais server-side (${(data.requiredEnvVars ?? []).join(', ')}) e callback ${data.callbackUrl || `${origin}/auth/callback`}.`;
        setAuthError(msg);
        throw new Error(msg);
      }

      const popup = window.open(data.url, `oauth_${provider}`, 'width=600,height=700');
      if (!popup) {
        const msg = 'Pop-up OAuth bloqueado pelo navegador. Permita pop-ups para concluir o login.';
        setAuthError(msg);
        throw new Error(msg);
      }

      let expectedCallbackOrigin = origin;
      try {
        if (data.callbackUrl) {
          expectedCallbackOrigin = new URL(data.callbackUrl).origin;
        }
      } catch {
        expectedCallbackOrigin = origin;
      }

      const result = await new Promise<{ profile: AuthUserProfile; sessionToken: string | null }>(
        (resolve, reject) => {
          let settled = false;
          const cleanup = () => {
            window.removeEventListener('message', onMsg);
            window.clearInterval(closePoll);
            window.clearTimeout(timeoutId);
          };

          const onMsg = (event: MessageEvent) => {
            if (
              event.origin !== window.location.origin &&
              event.origin !== expectedCallbackOrigin &&
              !event.origin.endsWith('.run.app') &&
              !event.origin.includes('localhost')
            ) {
              return;
            }
            if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.profile) {
              settled = true;
              cleanup();
              const profile = event.data.profile as AuthUserProfile;
              const token =
                typeof event.data.sessionToken === 'string'
                  ? event.data.sessionToken
                  : profile.sessionToken ?? null;
              resolve({ profile, sessionToken: token });
            } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
              settled = true;
              cleanup();
              reject(new Error(String(event.data.error || 'Falha OAuth no callback.')));
            }
          };

          const closePoll = window.setInterval(() => {
            if (popup.closed && !settled) {
              settled = true;
              cleanup();
              reject(
                new Error(`Janela de login ${provider.toUpperCase()} fechada antes da conclusão.`)
              );
            }
          }, 400);

          const timeoutId = window.setTimeout(() => {
            if (!settled) {
              settled = true;
              cleanup();
              reject(
                new Error(`Tempo esgotado aguardando callback OAuth de ${provider.toUpperCase()}.`)
              );
            }
          }, 120_000);

          window.addEventListener('message', onMsg);
        }
      );

      setBackendProfile(result.profile);
      setSessionToken(result.sessionToken);
      const confirmed = await refreshBackendSession(result.sessionToken ?? undefined);
      return confirmed ?? result.profile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha OAuth.';
      setAuthError(msg);
      throw err instanceof Error ? err : new Error(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const signInWithGoogle = async (role: EcosystemRole = 'client'): Promise<User | null> => {
    try {
      return await signInWithFirebaseProvider(googleProvider, 'Google', role);
    } catch (fbErr) {
      const fbMsg = fbErr instanceof Error ? fbErr.message : '';
      if (
        oauthProviders?.google?.oauthServerConfigured &&
        (fbMsg.includes('Firebase Console') || fbMsg.includes('operation-not-allowed'))
      ) {
        await signInWithOAuthPopup('google', role);
        return null;
      }
      throw fbErr;
    }
  };

  const signInWithApple = async (role: EcosystemRole = 'client'): Promise<User | null> => {
    try {
      return await signInWithFirebaseProvider(appleProvider, 'Apple ID', role);
    } catch (fbErr) {
      const fbMsg = fbErr instanceof Error ? fbErr.message : '';
      if (
        oauthProviders?.apple?.oauthServerConfigured &&
        (fbMsg.includes('Firebase Console') || fbMsg.includes('operation-not-allowed'))
      ) {
        await signInWithOAuthPopup('apple', role);
        return null;
      }
      throw fbErr;
    }
  };

  const signInWithMicrosoft = async (
    role: EcosystemRole = 'client'
  ): Promise<{ user: User | null; oauthProfile?: AuthUserProfile | null }> => {
    // Prefer direct .env OAuth2 PKCE flow when server credentials are configured
    if (oauthProviders?.microsoft?.oauthServerConfigured) {
      const oauthProfile = await signInWithOAuthPopup('microsoft', role);
      return { user: null, oauthProfile };
    }

    try {
      const fbUser = await signInWithFirebaseProvider(microsoftProvider, 'Microsoft', role);
      return { user: fbUser, oauthProfile: null };
    } catch (fbErr) {
      const fbMsg = fbErr instanceof Error ? fbErr.message : '';
      if (fbMsg.includes('Firebase Console') || fbMsg.includes('operation-not-allowed')) {
        const oauthProfile = await signInWithOAuthPopup('microsoft', role);
        return { user: null, oauthProfile };
      }
      throw fbErr;
    }
  };

  const signInWithEmail = async (params: {
    email: string;
    password: string;
    displayName?: string;
    createAccount?: boolean;
    role?: EcosystemRole;
  }): Promise<User | null> => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const cleanEmail = params.email.trim();
      const cred = params.createAccount
        ? await createUserWithEmailAndPassword(auth, cleanEmail, params.password)
        : await signInWithEmailAndPassword(auth, cleanEmail, params.password);

      if (cred.user) {
        if (params.createAccount && params.displayName?.trim()) {
          await updateProfile(cred.user, { displayName: params.displayName.trim() });
        }
        if (!cred.user.emailVerified) {
          void sendEmailVerification(cred.user).catch(() => {});
        }
        await ensureUserProfile(cred.user);
        await authenticateFirebaseWithBackend(cred.user, params.role ?? 'client');
      }
      return cred.user ?? null;
    } catch (err) {
      const msg = mapFirebaseAuthError('E-mail/Senha', err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await Promise.all([
        signOut(auth).catch(() => {}),
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}),
      ]);
      setBackendProfile(null);
      setSessionToken(null);
      setGoogleAccessToken(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha ao encerrar sessão.');
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        backendProfile,
        sessionToken,
        googleAccessToken,
        oauthProviders,
        callbackUrl,
        authReady,
        authBusy,
        authError,
        signInWithGoogle,
        connectGoogleDrive,
        signInWithMicrosoft,
        signInWithApple,
        signInWithEmail,
        signInWithOAuthPopup,
        refreshBackendSession,
        logout,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  }
  return ctx;
}
