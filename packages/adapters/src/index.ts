import type { ExecutionEvidence, ParametrixAdapter, RuntimeCapability } from '../../core/src/index.js';

export * from './open-source-engines.js';

export interface McpTransport {
  request(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class ParametrixMcpAdapter implements ParametrixAdapter {
  readonly id = 'parametrix-mcp';
  readonly provider = 'mcp' as const;
  readonly version = '1.0.0';

  constructor(private readonly transport: McpTransport) {}

  async capabilities(): Promise<RuntimeCapability[]> {
    const response = await this.transport.request({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const tools = ((response.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? []).map((tool) => tool.name);
    return [{ id: 'mcp-tools', available: true, backend: 'cpu', evidence: tools.join(',') }];
  }

  async invoke(operation: string, args: unknown): Promise<{ result: unknown; evidence: ExecutionEvidence }> {
    const response = await this.transport.request({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: operation, arguments: args ?? {} },
    });
    const result = response.result ?? response.error ?? response;
    return {
      result,
      evidence: {
        executed: !response.error,
        claim: response.error ? 'not_executed' : 'executed',
        source: 'external-adapter',
        details: { adapter: this.id, operation },
      },
    };
  }
}

export function createHttpMcpTransport(baseUrl: string, token = ''): McpTransport {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/mcp`;
  return {
    async request(payload) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(`Parametrix MCP HTTP ${response.status}: ${JSON.stringify(body)}`);
      return body;
    },
  };
}
