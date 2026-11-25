import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, UserPlus, WifiOff, X } from 'lucide-react';
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

const FEDERATED_ICONS: {
  id: Exclude<AuthProviderKind, 'email' | 'proprietary'>;
  label: string;
  title: string;
  bgClass: string;
  renderSvg: () => React.ReactNode;
}[] = [
  {
    id: 'google',
    label: 'Google',
    title: 'Entrar com Google (Pop-up Auth Único)',
    bgClass: 'bg-white border-slate-200 hover:border-sky-500 text-slate-900',
    renderSvg: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
        />
      </svg>
    ),
  },
  {
    id: 'apple',
    label: 'Apple',
    title: 'Entrar com Apple ID',
    bgClass: 'bg-slate-950 border-slate-900 hover:bg-slate-800 text-white',
    renderSvg: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43Zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45Z" />
      </svg>
    ),
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    title: 'Entrar com Microsoft',
    bgClass: 'bg-white border-slate-200 hover:border-sky-500 text-slate-900',
    renderSvg: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <rect x="2" y="2" width="9" height="9" fill="#F25022" />
        <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
        <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
        <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
      </svg>
    ),
  },
  {
    id: 'oracle',
    label: 'Oracle',
    title: 'Entrar com Oracle Cloud ID',
    bgClass: 'bg-[#fff5f5] border-[#f2c4c4] hover:border-[#c74634] text-[#c74634]',
    renderSvg: () => (
      <svg viewBox="0 0 28 16" className="w-6 h-4" aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="24"
          height="12"
          rx="6"
          fill="none"
          stroke="#C74634"
          strokeWidth="3.2"
        />
      </svg>
    ),
  },
  {
    id: 'zoho',
    label: 'Zoho',
    title: 'Entrar com Zoho Mail / CRM',
    bgClass: 'bg-white border-slate-200 hover:border-[#0091ff] text-slate-900',
    renderSvg: () => (
      <svg viewBox="0 0 32 16" className="w-6 h-4" aria-hidden="true">
        <rect x="1" y="3" width="7" height="9" rx="1.5" fill="none" stroke="#E42527" strokeWidth="1.8" transform="rotate(-8 4.5 7.5)" />
        <rect x="8.5" y="2.5" width="7" height="9" rx="1.5" fill="none" stroke="#089949" strokeWidth="1.8" transform="rotate(6 12 7)" />
        <rect x="16" y="3" width="7" height="9" rx="1.5" fill="none" stroke="#226DB4" strokeWidth="1.8" transform="rotate(-6 19.5 7.5)" />
        <rect x="23.5" y="2.5" width="7" height="9" rx="1.5" fill="none" stroke="#F6B21E" strokeWidth="1.8" transform="rotate(5 27 7)" />
      </svg>
    ),
  },
];

export const OfflineAuthModal: React.FC<OfflineAuthModalProps> = ({
  open,
  onClose,
  onLogin,
}) => {
  const {
    oauthProviders,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithApple,
    signInWithEmail,
    signInWithOAuthPopup,
    refreshBackendSession,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createAccount, setCreateAccount] = useState(false);
  const [role, setRole] = useState<EcosystemRole>('client');
  const [offlineMode, setOfflineMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerSqliteFallback, setOfferSqliteFallback] = useState(false);
  const [infoNote, setInfoNote] = useState<string | null>(null);

  if (!open) return null;

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

  const handleFederatedClick = async (
    selectedProvider: Exclude<AuthProviderKind, 'email' | 'proprietary'>
  ) => {
    setBusy(true);
    setError(null);
    setOfferSqliteFallback(false);
    setInfoNote(null);

    try {
      if (offlineMode) {
        await syncRoleProfileToSqlite({
          email: email.trim() || `engenheiro.${selectedProvider}@parametrix.local`,
          displayName: displayName.trim() || `Operador ${selectedProvider.toUpperCase()}`,
          provider: selectedProvider,
          isOffline: true,
        });
        onClose();
        return;
      }

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

      const profile = await signInWithOAuthPopup(selectedProvider, role);
      await syncRoleProfileToSqlite({
        email: profile.email,
        displayName: profile.displayName,
        provider: selectedProvider,
        isOffline: false,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir o login externo. Utilize e-mail e senha acima para entrar imediatamente.'
      );
      setOfferSqliteFallback(true);
    } finally {
      setBusy(false);
    }
  };

  const handleSqliteEmailSubmit = async () => {
    const cleanEmail = email.trim() || 'engenheiro@parametrix.local';
    if (!password || password.length < 6) {
      setError('Informe uma senha com pelo menos 6 caracteres para entrar.');
      return;
    }
    setBusy(true);
    setError(null);
    setOfferSqliteFallback(false);
    try {
      await syncRoleProfileToSqlite({
        email: cleanEmail,
        displayName: displayName.trim() || cleanEmail.split('@')[0] || 'Engenheiro ParametrIX',
        provider: 'email',
        isOffline: true,
        password,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar localmente no SQLite.');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNote(null);
    setOfferSqliteFallback(false);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }
    if (!password || password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (offlineMode) {
      await handleSqliteEmailSubmit();
      return;
    }

    setBusy(true);
    try {
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
        setInfoNote('Conta criada com sucesso.');
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao autenticar via Firebase. Você pode entrar diretamente com sua sessão local abaixo.'
      );
      setOfferSqliteFallback(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-heading"
    >
      <div className="w-full max-w-[430px] bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0" aria-hidden="true">
              <rect width="32" height="32" rx="7" fill="#0f172a" />
              <path
                d="M10 8h8.5c3.2 0 5.5 2.1 5.5 5.1s-2.3 5.1-5.5 5.1H14v5.8h-4V8Zm4 3.4v3.4h4.1c1.2 0 2-.7 2-1.7s-.8-1.7-2-1.7H14Z"
                fill="#0091ff"
              />
            </svg>
            <div>
              <span className="font-display text-sm font-bold tracking-tight text-slate-900">
                ParametrIX
              </span>
              <span className="block text-[11px] text-slate-500">
                Acesso unificado · Engenharia &amp; Gestão
              </span>
            </div>
          </div>

          <button
            type="button"
            aria-label="Fechar janela de login"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          <div>
            <h3
              id="auth-modal-heading"
              className="font-display text-[22px] font-bold text-slate-950 tracking-tight leading-snug"
            >
              {createAccount ? 'Criar conta' : 'Iniciar sessão'}
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Entre com e-mail e senha ou escolha o login único com pop-up Google.
            </p>
          </div>

          {/* Unified Email & Password Form (Never trapped by external OAuth) */}
          <form onSubmit={handleEmailPasswordSubmit} className="space-y-3">
            {createAccount && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Eng. Marcos Silva"
                  className="w-full h-11 px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0091ff] focus:bg-white transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Endereço de e-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="engenheiro@empresa.com.br"
                  className="w-full h-11 pl-10 pr-3.5 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0091ff] focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full h-11 pl-10 pr-11 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0091ff] focus:bg-white transition-colors"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={offlineMode}
                  onChange={(e) => {
                    setOfflineMode(e.target.checked);
                    setError(null);
                    setOfferSqliteFallback(false);
                  }}
                  className="accent-[#0091ff] w-4 h-4 rounded"
                />
                <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                <span>Sessão SQLite offline</span>
              </label>

              <select
                aria-label="Perfil de atuação"
                value={role}
                onChange={(e) => setRole(e.target.value as EcosystemRole)}
                className="px-2.5 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-[#0091ff]"
              >
                {Object.values(ECOSYSTEM_ROLE_DEFINITIONS).map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-2">
                <p className="leading-relaxed">{error}</p>
                {offerSqliteFallback && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSqliteEmailSubmit()}
                    className="w-full min-h-[38px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md text-xs cursor-pointer transition-colors"
                  >
                    Entrar agora com E-mail &amp; Senha Local (SQLite)
                  </button>
                )}
              </div>
            )}

            {infoNote && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                {infoNote}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold bg-[#0091ff] hover:bg-[#0284c7] text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-sm"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>
                {busy
                  ? 'Autenticando...'
                  : offlineMode
                    ? 'Entrar com E-mail (SQLite Local)'
                    : createAccount
                      ? 'Criar conta e entrar'
                      : 'Seguinte'}
              </span>
            </button>
          </form>

          {/* Zoho-inspired 1-click Federated Icon Row */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-medium">Iniciar sessão com</span>
              {oauthProviders?.google?.configured && (
                <span className="text-[11px] text-slate-400">Login único em pop-up</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {FEDERATED_ICONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  title={item.title}
                  aria-label={item.title}
                  onClick={() => void handleFederatedClick(item.id)}
                  className={`min-h-[46px] min-w-[46px] flex-1 flex items-center justify-center rounded-lg border transition-all cursor-pointer disabled:opacity-50 ${item.bgClass}`}
                >
                  {item.renderSvg()}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-xs text-slate-600">
            <span>
              {createAccount ? 'Já possui uma conta?' : 'Não tem uma conta ParametrIX?'}
            </span>
            <button
              type="button"
              onClick={() => {
                setCreateAccount((v) => !v);
                setError(null);
              }}
              className="text-[#0091ff] hover:text-[#0284c7] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {createAccount ? 'Fazer login' : 'Inscrever-se agora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
