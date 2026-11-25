export type ComputeBackend = 'gpu' | 'tpu' | 'npu' | 'cpu' | 'wasm';

export interface RuntimeCapability {
  id: string;
  available: boolean;
  backend: ComputeBackend;
  evidence?: string;
}

export interface ParametrixOperation<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  argsSchema: Record<string, unknown>;
  execute(args: TArgs): Promise<TResult> | TResult;
}

export interface ExecutionEvidence {
  executed: boolean;
  claim: 'executed' | 'not_executed' | 'deterministic_fixture';
  source: 'parametrix-kernel' | 'external-adapter' | 'test-fixture';
  vucId?: string;
  details?: Record<string, unknown>;
}

export interface ParametrixAdapter {
  id: string;
  provider: 'mcp' | 'claude' | 'openai' | 'generic';
  version: string;
  capabilities(): Promise<RuntimeCapability[]> | RuntimeCapability[];
  invoke(operation: string, args: unknown): Promise<{ result: unknown; evidence: ExecutionEvidence }>;
}

export const ARCHITECTURE_LAYERS = Object.freeze({
  core: 'Deterministic CAD/CAE/CAM/VUC contracts and kernels',
  adapters: 'MCP/STDIO/HTTP and provider-specific client profiles',
  installers: 'Bounded environment detection and reproducible bootstrap',
  surfaces: 'React Studio, CLI, GitHub Actions, desktop/mobile/VM hosts',
});
