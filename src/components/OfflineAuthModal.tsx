import React, { useState } from 'react';
import { Globe, KeyRound, ShieldCheck, WifiOff, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ECOSYSTEM_ROLE_DEFINITIONS } from '../kernel/ecosystemErpLogistics';
import type { AuthProviderKind, EcosystemRole } from '../types/cad';

interface OfflineAuthModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (payload: {
    email: string;
    displayName: string;
    provider: AuthProviderKind;
    role: EcosystemRole;
    password?: string;
    handleAt?: string;
    phone?: string;
    address?: string;
    offlineMode: boolean;
  }) => Promise<void>;
}

const AUTH_PROVIDERS: { id: AuthProviderKind; label: string; realTag: string }[] = [
  { id: 'google', label: 'Google', realTag: 'Firebase Popup' },
  { id: 'microsoft', label: 'Microsoft', realTag: 'Firebase / OAuth2' },
  { id: 'oracle', label: 'Oracle ID', realTag: 'OAuth2 PKCE' },
  { id: 'zoho', label: 'Zoho Mail', realTag: 'OAuth2 PKCE' },
  { id: 'apple', label: 'Apple ID', realTag: 'Firebase Popup' },
  { id: 'email', label: 'E-mail & Senha', realTag: 'Firebase Auth' },
];

export const OfflineAuthModal: React.FC<OfflineAuthModalProps> = ({
  open,
  onClose,
  onLogin,
}) => {
  const {
    oauthProviders,
    callbackUrl,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithApple,
    signInWithEmail,
    signInWithOAuthPopup,
    refreshBackendSession,
  } = useAuth();

  const [provider, setProvider] = useState<AuthProviderKind>('google');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [createAccount, setCreateAccount] = useState(false);
  const [role, setRole] = useState<EcosystemRole>('client');
  const [offlineMode, setOfflineMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoNote, setInfoNote] = useState<string | null>(null);

  if (!open) return null;

  const getProviderTag = (id: AuthProviderKind, fallback: string): string => {
    if (!oauthProviders) return fallback;
    if (id === 'microsoft') {
      return oauthProviders.microsoft?.oauthServerConfigured ? 'OAuth2 .env Ativo' : 'Firebase / .env';
    }
    if (id === 'oracle' || id === 'zoho') {
      return oauthProviders[id]?.oauthServerConfigured ? 'OAuth2 .env Ativo' : 'Requer .env OAuth';
    }
    if (id === 'google' || id === 'apple') {
      return oauthProviders[id]?.oauthServerConfigured ? 'Firebase / OAuth2' : 'Firebase Popup';
    }
    return fallback;
  };

  const syncRoleProfileToSqlite = async (params: {
    email: string;
    displayName: string;
    provider: AuthProviderKind;
    isOffline: boolean;
    password?: string;
  }) => {
    const roleDef = ECOSYSTEM_ROLE_DEFINITIONS[role];
    await onLogin({
      email: params.email,
      displayName: params.displayName,
      provider: params.provider,
      role,
      password: params.password,
      handleAt: roleDef.defaultHandle,
      phone: roleDef.defaultPhone,
      address: roleDef.defaultAddress,
      offlineMode: params.isOffline,
    });
  };

  const handleRealLogin = async (selectedProvider: AuthProviderKind) => {
    setBusy(true);
    setError(null);
    setInfoNote(null);
    setProvider(selectedProvider);
    try {
      if (selectedProvider === 'google') {
        const fbUser = await signInWithGoogle(role);
        if (fbUser?.email) {
          await syncRoleProfileToSqlite({
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email.split('@')[0],
            provider: 'google',
            isOffline: false,
          });
        } else {
          const oauthProf = await refreshBackendSession();
          if (oauthProf) {
            await syncRoleProfileToSqlite({
              email: oauthProf.email,
              displayName: oauthProf.displayName,
              provider: 'google',
              isOffline: false,
            });
          }
        }
        onClose();
        return;
      }

      if (selectedProvider === 'microsoft') {
        const res = await signInWithMicrosoft(role);
        if (res.user?.email) {
          await syncRoleProfileToSqlite({
            email: res.user.email,
            displayName: res.user.displayName || res.user.email.split('@')[0],
            provider: 'microsoft',
            isOffline: false,
          });
        } else if (res.oauthProfile) {
          await syncRoleProfileToSqlite({
            email: res.oauthProfile.email,
            displayName: res.oauthProfile.displayName,
            provider: 'microsoft',
            isOffline: false,
          });
        }
        onClose();
        return;
      }

      if (selectedProvider === 'apple') {
        const fbUser = await signInWithApple(role);
        if (fbUser?.email) {
          await syncRoleProfileToSqlite({
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email.split('@')[0],
            provider: 'apple',
            isOffline: false,
          });
        } else {
          const oauthProf = await refreshBackendSession();
          if (oauthProf) {
            await syncRoleProfileToSqlite({
              email: oauthProf.email,
              displayName: oauthProf.displayName,
              provider: 'apple',
              isOffline: false,
            });
          }
        }
        onClose();
        return;
      }

      if (selectedProvider === 'oracle' || selectedProvider === 'zoho') {
        const profile = await signInWithOAuthPopup(selectedProvider, role);
        await syncRoleProfileToSqlite({
          email: profile.email,
          displayName: profile.displayName,
          provider: selectedProvider,
          isOffline: false,
        });
        onClose();
        return;
      }

      // Real Email & Password via Firebase Authentication
      const cleanEmail = email.trim();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Informe um e-mail válido para entrar ou criar conta.');
      }
      if (!password || password.length < 6) {
        throw new Error('Informe uma senha com pelo menos 6 caracteres.');
      }
      const fbUser = await signInWithEmail({
        email: cleanEmail,
        password,
        displayName: displayName.trim() || undefined,
        createAccount,
        role,
      });
      if (fbUser?.email) {
        await syncRoleProfileToSqlite({
          email: fbUser.email,
          displayName: fbUser.displayName || displayName.trim() || fbUser.email.split('@')[0],
          provider: 'email',
          isOffline: false,
          password,
        });
      }
      if (createAccount) {
        setInfoNote('Conta criada no Firebase Authentication. Verifique sua caixa de entrada.');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação real.');
    } finally {
      setBusy(false);
    }
  };

  const handleOfflineSqliteLogin = async (selectedProvider: AuthProviderKind) => {
    setBusy(true);
    setError(null);
    setInfoNote(null);
    setProvider(selectedProvider);
    try {
      const cleanEmail =
        email.trim() || `engenheiro.${selectedProvider}@parametrix.local`;
      if (
        (selectedProvider === 'proprietary' || selectedProvider === 'email') &&
        !password.trim()
      ) {
        throw new Error('Informe uma senha para autenticar na conta SQLite local.');
      }
      await syncRoleProfileToSqlite({
        email: cleanEmail,
        displayName: displayName.trim() || `Operador ${selectedProvider}`,
        provider: selectedProvider,
        isOffline: true,
        password:
          selectedProvider === 'proprietary' || selectedProvider === 'email'
            ? password
            : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na autenticação SQLite.');
    } finally {
      setBusy(false);
    }
  };

  const handleProviderClick = (selectedProvider: AuthProviderKind) => {
    if (offlineMode) {
      void handleOfflineSqliteLogin(selectedProvider);
    } else {
      void handleRealLogin(selectedProvider);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg bg-[#111620] border border-white/15 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="font-display text-base font-bold text-slate-100">
              Login Real Multi-Provedor + Sessão SQLite Local
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Mode Switcher: Real Cloud Auth vs Offline Localhost SQLite */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#090c11] border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setOfflineMode(false);
                setError(null);
              }}
              className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                !offlineMode
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Auth Real (Firebase / OAuth2)
            </button>
            <button
              type="button"
              onClick={() => {
                setOfflineMode(true);
                setError(null);
                if (!email) setEmail('engenheiro@parametrix.local');
                if (!displayName) setDisplayName('Operador Local');
              }}
              className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                offlineMode
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <WifiOff className="w-3.5 h-3.5" />
              Modo Offline (SQLite Local)
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-400 font-medium">
              Perfil no Ecossistema Parametrix
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as EcosystemRole)}
              className="w-full px-3 py-2.5 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
            >
              {Object.values(ECOSYSTEM_ROLE_DEFINITIONS).map((r) => (
                <option key={r.role} value={r.role}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* 1-Click Real Provider Buttons */}
          <div className="space-y-2">
            <div className="text-[11px] text-slate-400">
              {offlineMode
                ? 'Entrar em Modo Offline Localhost (SQLite + scrypt):'
                : 'Entrar com Provedor Real (Firebase Auth Pop-up / OAuth 2.0 PKCE):'}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AUTH_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleProviderClick(p.id)}
                  className={`min-h-[44px] px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-50 ${
                    provider === p.id
                      ? 'border-sky-400 bg-sky-500/15 text-sky-100'
                      : 'border-white/10 bg-[#0c1017] text-slate-200 hover:border-sky-400/60'
                  }`}
                >
                  <div className="font-semibold text-[11px]">{p.label}</div>
                  <div className="text-[9px] text-slate-400 font-mono-tabular">
                    {offlineMode ? 'SQLite Offline' : getProviderTag(p.id, p.realTag)}
                  </div>
                </button>
              ))}
            </div>
            {!offlineMode && callbackUrl && (
              <div className="text-[10px] text-slate-400 font-mono-tabular truncate bg-[#090c11] border border-white/8 rounded px-2.5 py-1.5">
                Redirect URI: {callbackUrl}
              </div>
            )}
          </div>

          {/* Email & Password Form */}
          <div className="pt-2 border-t border-white/10 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Nome Exibição</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Eng. Marcos / Operador"
                  className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Senha (mín. 6 caracteres)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
              />
            </div>

            {!offlineMode && (
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAccount}
                  onChange={(e) => setCreateAccount(e.target.checked)}
                  className="accent-sky-400"
                />
                Criar nova conta Firebase com este e-mail e senha
              </label>
            )}

            {error && (
              <div className="p-2.5 bg-rose-500/15 border border-rose-500/40 rounded-lg text-rose-200 leading-relaxed">
                {error}
              </div>
            )}

            {infoNote && (
              <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/40 rounded-lg text-emerald-200">
                {infoNote}
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                offlineMode
                  ? void handleOfflineSqliteLogin('proprietary')
                  : void handleRealLogin('email')
              }
              className="w-full min-h-[42px] px-4 py-2 font-semibold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {busy
                ? 'Autenticando...'
                : offlineMode
                  ? 'Entrar / Registrar no SQLite Local (Offline)'
                  : createAccount
                    ? 'Criar Conta Real via E-mail (Firebase)'
                    : 'Entrar com E-mail & Senha (Firebase Real)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
