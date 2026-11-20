import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
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

const OFFLINE_PROVIDERS: { id: AuthProviderKind; label: string }[] = [
  { id: 'google', label: 'Google (Offline)' },
  { id: 'microsoft', label: 'Microsoft (Offline)' },
  { id: 'oracle', label: 'Oracle ID (Offline)' },
  { id: 'zoho', label: 'Zoho Mail (Offline)' },
  { id: 'apple', label: 'Apple ID (Offline)' },
  { id: 'email', label: 'E-mail Genérico' },
];

export const OfflineAuthModal: React.FC<OfflineAuthModalProps> = ({
  open,
  onClose,
  onLogin,
}) => {
  const [provider, setProvider] = useState<AuthProviderKind>('proprietary');
  const [email, setEmail] = useState('engenheiro@parametrix.local');
  const [displayName, setDisplayName] = useState('Operador Local');
  const [password, setPassword] = useState('parametrix123');
  const [role, setRole] = useState<EcosystemRole>('client');
  const [offlineMode, setOfflineMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submitProvider = async (selectedProvider: AuthProviderKind) => {
    setBusy(true);
    setError(null);
    try {
      const roleDef = ECOSYSTEM_ROLE_DEFINITIONS[role];
      await onLogin({
        email: email.trim() || `user.${selectedProvider}@parametrix.local`,
        displayName: displayName.trim() || `Usuário ${selectedProvider}`,
        provider: selectedProvider,
        role,
        password: selectedProvider === 'proprietary' ? password : undefined,
        handleAt: roleDef.defaultHandle,
        phone: roleDef.defaultPhone,
        address: roleDef.defaultAddress,
        offlineMode,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na autenticação SQLite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg bg-[#111620] border border-white/15 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="font-display text-base font-bold text-slate-100">
              Auth Proprietário SQLite + Acesso Offline Multi-Provedor
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Nome Exibição</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">E-mail (Proprietário / Offline)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Senha SQLite Local (opcional para offline)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
            />
          </div>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={offlineMode}
              onChange={(e) => setOfflineMode(e.target.checked)}
              className="accent-sky-400"
            />
            Operar 100% em modo Localhost / Offline SQLite (contribui 20% GPU/CPU no nó local)
          </label>

          {error && (
            <div className="p-2.5 bg-rose-500/15 border border-rose-500/40 rounded-lg text-rose-200">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void submitProvider('proprietary')}
            className="w-full min-h-[42px] px-4 py-2 font-semibold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 transition-colors cursor-pointer"
          >
            {busy ? 'Autenticando no SQLite...' : 'Entrar / Registrar Conta Proprietária SQLite'}
          </button>

          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="text-[11px] text-slate-400">
              Login Offline 1-Clique Aceito no Localhost:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {OFFLINE_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setProvider(p.id);
                    void submitProvider(p.id);
                  }}
                  className={`min-h-[38px] px-2.5 py-2 rounded-lg border text-left font-medium transition-colors cursor-pointer ${
                    provider === p.id
                      ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                      : 'border-white/10 bg-[#0c1017] text-slate-300 hover:border-white/25'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
