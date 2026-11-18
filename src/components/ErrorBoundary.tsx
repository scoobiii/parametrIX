import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    console.error('ErrorBoundary capturou erro:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0b0e14] text-slate-100 p-6">
          <div className="max-w-lg w-full bg-[#111620] border border-rose-500/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="font-display text-base font-semibold">
                Ocorreu uma falha de sessão ou permissão
              </h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed break-words font-mono bg-[#0c1017] p-3 rounded-lg border border-white/10 max-h-40 overflow-y-auto">
              {this.state.message}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tentar Novamente
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-xs font-medium bg-[#0c1017] border border-white/12 text-slate-200 rounded-lg hover:border-white/25 transition-colors cursor-pointer"
              >
                Recarregar Página
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
