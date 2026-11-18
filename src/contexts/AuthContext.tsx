import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { ensureUserProfile } from '../services/userWorkspaceStore';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let onlineRetryHandler: (() => void) | null = null;

    const cleanupRetry = () => {
      if (onlineRetryHandler) {
        window.removeEventListener('online', onlineRetryHandler);
        onlineRetryHandler = null;
      }
    };

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      cleanupRetry();
      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        try {
          await ensureUserProfile(nextUser);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('client is offline') || msg.includes('unavailable')) {
            console.warn('Firestore temporariamente offline ao sincronizar perfil; aguardando reconexão.');
            onlineRetryHandler = () => {
              void ensureUserProfile(nextUser).catch(() => {});
              cleanupRetry();
            };
            window.addEventListener('online', onlineRetryHandler, { once: true });
          } else {
            console.error('Erro ao inicializar perfil do usuário:', err);
          }
        }
      }
    });

    return () => {
      cleanupRetry();
      unsub();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        await ensureUserProfile(cred.user);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Login cancelado antes da conclusão.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Pop-up bloqueado pelo navegador. Permita pop-ups para entrar com Google.');
      } else {
        setAuthError(
          err instanceof Error
            ? `Falha na autenticação Google: ${err.message}`
            : 'Falha ao autenticar com o Google.'
        );
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signOut(auth);
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
        authReady,
        authBusy,
        authError,
        signInWithGoogle,
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
