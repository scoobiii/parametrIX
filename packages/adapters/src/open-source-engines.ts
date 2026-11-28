import type { ExecutionEvidence } from '../../core/src/index.js';

export type ExternalEngineId = 'erpnext' | 'twenty' | 'metabase' | 'medusa';
export type ExternalExecutionClaim = ExecutionEvidence['claim'];

export interface EngineHealth {
  engine: ExternalEngineId;
  available: boolean;
  status: number;
  latencyMs: number;
  details?: Record<string, unknown>;
}

export interface ExternalProduct {
  externalId?: string;
  sku: string;
  name: string;
  revision?: string;
  sourceArea?: 'CAD' | 'CAE' | 'CAM';
  quantity?: number;
  unitPrice?: number;
  stockQuantity?: number;
  metadata?: Record<string, unknown>;
}

export interface ExternalBom {
  externalId?: string;
  productSku: string;
  revision: string;
  lines: Array<{ sku: string; quantity: number; unit?: string }>;
  source: 'CAD' | 'CAE' | 'CAM';
}

export interface ExternalProductionOrder {
  externalId?: string;
  productSku: string;
  revision: string;
  quantity: number;
  status: string;
  routing?: string[];
}

export interface ExternalCustomerLead {
  externalId?: string;
  name: string;
  email?: string;
  company?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
}

export interface BiIndicatorQuery {
  name: string;
  query: string;
  parameters?: Record<string, unknown>;
}

export interface EcommerceOrder {
  externalId?: string;
  customerId: string;
  lines: Array<{ sku: string; quantity: number; unitPrice?: number }>;
  status?: string;
}

export interface AdapterResult<T> {
  result: T;
  evidence: ExecutionEvidence;
}

export interface OpenSourceEngineAdapter {
  readonly id: ExternalEngineId;
  health(): Promise<AdapterResult<EngineHealth>>;
  syncProduct(product: ExternalProduct): Promise<AdapterResult<unknown>>;
  syncBom(bom: ExternalBom): Promise<AdapterResult<unknown>>;
  syncProductionOrder(order: ExternalProductionOrder): Promise<AdapterResult<unknown>>;
  syncCustomerLead(lead: ExternalCustomerLead): Promise<AdapterResult<unknown>>;
  queryIndicator(query: BiIndicatorQuery): Promise<AdapterResult<unknown>>;
  syncEcommerceOrder(order: EcommerceOrder): Promise<AdapterResult<unknown>>;
}

export interface HttpEngineConfig {
  baseUrl: string;
  token?: string;
  apiKey?: string;
  apiSecret?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function evidence(adapter: ExternalEngineId, operation: string, executed: boolean, details: Record<string, unknown> = {}): ExecutionEvidence {
  return {
    executed,
    claim: executed ? 'executed' : 'not_executed',
    source: 'external-adapter',
    details: { adapter, operation, ...details },
  };
}

abstract class HttpEngineAdapter implements OpenSourceEngineAdapter {
  abstract readonly id: ExternalEngineId;
  protected readonly config: Required<Pick<HttpEngineConfig, 'baseUrl' | 'timeoutMs'>> & HttpEngineConfig;

  constructor(config: HttpEngineConfig) {
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, ''), timeoutMs: config.timeoutMs ?? 10_000 };
  }

  protected async request<T>(operation: string, path: string, init: RequestInit = {}): Promise<AdapterResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const started = Date.now();
    try {
      const response = await (this.config.fetchImpl ?? fetch)(`${this.config.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { accept: 'application/json', 'content-type': 'application/json', ...this.headers(), ...(init.headers ?? {}) },
      });
      const text = await response.text();
      let body: unknown = undefined;
      try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
      if (!response.ok) {
        return { result: body as T, evidence: evidence(this.id, operation, false, { status: response.status, latencyMs: Date.now() - started }) };
      }
      return { result: body as T, evidence: evidence(this.id, operation, true, { status: response.status, latencyMs: Date.now() - started }) };
    } catch (error) {
      return { result: { error: error instanceof Error ? error.message : String(error) } as T, evidence: evidence(this.id, operation, false, { status: 0, latencyMs: Date.now() - started }) };
    } finally {
      clearTimeout(timeout);
    }
  }

  protected headers(): Record<string, string> {
    return this.config.token ? { authorization: `Bearer ${this.config.token}` } : {};
  }

  abstract health(): Promise<AdapterResult<EngineHealth>>;
  abstract syncProduct(product: ExternalProduct): Promise<AdapterResult<unknown>>;
  abstract syncBom(bom: ExternalBom): Promise<AdapterResult<unknown>>;
  abstract syncProductionOrder(order: ExternalProductionOrder): Promise<AdapterResult<unknown>>;
  abstract syncCustomerLead(lead: ExternalCustomerLead): Promise<AdapterResult<unknown>>;
  abstract queryIndicator(query: BiIndicatorQuery): Promise<AdapterResult<unknown>>;
  abstract syncEcommerceOrder(order: EcommerceOrder): Promise<AdapterResult<unknown>>;
}

export class ErpNextAdapter extends HttpEngineAdapter {
  readonly id = 'erpnext' as const;
  protected headers() { return this.config.apiKey && this.config.apiSecret ? { authorization: `token ${this.config.apiKey}:${this.config.apiSecret}` } : super.headers(); }
  health() { return this.request<EngineHealth>('health', '/api/method/frappe.auth.get_logged_user').then((r) => ({ result: { engine: this.id, available: r.evidence.executed, status: Number(r.evidence.details?.status ?? 0), latencyMs: Number(r.evidence.details?.latencyMs ?? 0) }, evidence: r.evidence })); }
  syncProduct(product: ExternalProduct) { return this.request('sync-product', '/api/resource/Item', { method: 'POST', body: JSON.stringify({ item_code: product.sku, item_name: product.name, custom_parametrix_revision: product.revision, stock_uom: 'Nos', ...product.metadata }) }); }
  syncBom(bom: ExternalBom) { return this.request('sync-bom', '/api/resource/BOM', { method: 'POST', body: JSON.stringify({ item: bom.productSku, bom_no: bom.externalId, quantity: 1, items: bom.lines.map((line) => ({ item_code: line.sku, qty: line.quantity, uom: line.unit ?? 'Nos' })), custom_parametrix_revision: bom.revision }) }); }
  syncProductionOrder(order: ExternalProductionOrder) { return this.request('sync-production-order', '/api/resource/Work Order', { method: 'POST', body: JSON.stringify({ production_item: order.productSku, qty: order.quantity, bom_no: order.externalId, status: order.status, custom_parametrix_revision: order.revision }) }); }
  syncCustomerLead(lead: ExternalCustomerLead) { return this.request('sync-customer-lead', '/api/resource/Lead', { method: 'POST', body: JSON.stringify({ lead_name: lead.name, email_id: lead.email, company_name: lead.company, status: lead.stage, ...lead.metadata }) }); }
  queryIndicator(query: BiIndicatorQuery) { return this.request('query-indicator', '/api/method/frappe.desk.query_report.run', { method: 'POST', body: JSON.stringify({ report_name: query.name, filters: query.parameters ?? {} }) }); }
  syncEcommerceOrder(order: EcommerceOrder) { return this.request('sync-ecommerce-order', '/api/resource/Sales Order', { method: 'POST', body: JSON.stringify({ customer: order.customerId, items: order.lines.map((line) => ({ item_code: line.sku, qty: line.quantity, rate: line.unitPrice })), status: order.status }) }); }
}

export class TwentyAdapter extends HttpEngineAdapter {
  readonly id = 'twenty' as const;
  health() { return this.request<EngineHealth>('health', '/api/health').then((r) => ({ result: { engine: this.id, available: r.evidence.executed, status: Number(r.evidence.details?.status ?? 0), latencyMs: Number(r.evidence.details?.latencyMs ?? 0) }, evidence: r.evidence })); }
  private postObject(object: string, payload: unknown, operation: string) { return this.request(operation, `/rest/${object}`, { method: 'POST', body: JSON.stringify(payload) }); }
  syncProduct(product: ExternalProduct) { return this.postObject('products', product, 'sync-product'); }
  syncBom(bom: ExternalBom) { return this.postObject('boms', bom, 'sync-bom'); }
  syncProductionOrder(order: ExternalProductionOrder) { return this.postObject('production-orders', order, 'sync-production-order'); }
  syncCustomerLead(lead: ExternalCustomerLead) { return this.postObject('people', lead, 'sync-customer-lead'); }
  queryIndicator(query: BiIndicatorQuery) { return this.request('query-indicator', '/rest/dashboards', { method: 'POST', body: JSON.stringify(query) }); }
  syncEcommerceOrder(order: EcommerceOrder) { return this.postObject('orders', order, 'sync-ecommerce-order'); }
}

export class MetabaseAdapter extends HttpEngineAdapter {
  readonly id = 'metabase' as const;
  protected headers() { return this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : super.headers(); }
  health() { return this.request<EngineHealth>('health', '/api/health').then((r) => ({ result: { engine: this.id, available: r.evidence.executed, status: Number(r.evidence.details?.status ?? 0), latencyMs: Number(r.evidence.details?.latencyMs ?? 0) }, evidence: r.evidence })); }
  syncProduct(product: ExternalProduct) { return this.request('sync-product', '/api/card', { method: 'POST', body: JSON.stringify({ name: `ParametrIX ${product.sku}`, dataset_query: { type: 'native', native: { query: `SELECT * FROM products WHERE sku = '${product.sku.replaceAll("'", "''")}'` }, database: 1 }, display: 'table' }) }); }
  syncBom(bom: ExternalBom) { return this.request('sync-bom', '/api/card', { method: 'POST', body: JSON.stringify({ name: `ParametrIX BOM ${bom.productSku}`, description: `Revision ${bom.revision}`, dataset_query: { type: 'native', native: { query: `SELECT * FROM bom WHERE product_sku = '${bom.productSku.replaceAll("'", "''")}'` }, database: 1 }, display: 'table' }) }); }
  syncProductionOrder(order: ExternalProductionOrder) { return this.request('sync-production-order', '/api/card', { method: 'POST', body: JSON.stringify({ name: `ParametrIX Order ${order.externalId ?? order.productSku}`, dataset_query: { type: 'native', native: { query: `SELECT * FROM production_orders WHERE product_sku = '${order.productSku.replaceAll("'", "''")}'` }, database: 1 }, display: 'table' }) }); }
  syncCustomerLead(lead: ExternalCustomerLead) { return this.request('sync-customer-lead', '/api/card', { method: 'POST', body: JSON.stringify({ name: `ParametrIX Lead ${lead.name}`, dataset_query: { type: 'native', native: { query: `SELECT * FROM leads WHERE name = '${lead.name.replaceAll("'", "''")}'` }, database: 1 }, display: 'table' }) }); }
  queryIndicator(query: BiIndicatorQuery) { return this.request('query-indicator', '/api/dataset', { method: 'POST', body: JSON.stringify({ database: { id: 1 }, type: 'native', native: { query: query.query, parameters: query.parameters ?? [] } }) }); }
  syncEcommerceOrder(order: EcommerceOrder) { return this.request('sync-ecommerce-order', '/api/card', { method: 'POST', body: JSON.stringify({ name: `ParametrIX Ecommerce ${order.externalId ?? order.customerId}`, dataset_query: { type: 'native', native: { query: `SELECT * FROM ecommerce_orders WHERE external_id = '${(order.externalId ?? '').replaceAll("'", "''")}'` }, database: 1 }, display: 'table' }) }); }
}

export class MedusaAdapter extends HttpEngineAdapter {
  readonly id = 'medusa' as const;
  health() { return this.request<EngineHealth>('health', '/health').then((r) => ({ result: { engine: this.id, available: r.evidence.executed, status: Number(r.evidence.details?.status ?? 0), latencyMs: Number(r.evidence.details?.latencyMs ?? 0) }, evidence: r.evidence })); }
  syncProduct(product: ExternalProduct) { return this.request('sync-product', '/admin/products', { method: 'POST', body: JSON.stringify({ title: product.name, handle: product.sku.toLowerCase(), metadata: { parametrixSku: product.sku, revision: product.revision }, variants: [{ title: product.name, sku: product.sku, prices: product.unitPrice === undefined ? [] : [{ amount: Math.round(product.unitPrice * 100), currency_code: 'brl' }] }] }) }); }
  syncBom(bom: ExternalBom) { return this.request('sync-bom', '/admin/parametrix/boms', { method: 'POST', body: JSON.stringify(bom) }); }
  syncProductionOrder(order: ExternalProductionOrder) { return this.request('sync-production-order', '/admin/parametrix/production-orders', { method: 'POST', body: JSON.stringify(order) }); }
  syncCustomerLead(lead: ExternalCustomerLead) { return this.request('sync-customer-lead', '/admin/customers', { method: 'POST', body: JSON.stringify({ first_name: lead.name, email: lead.email, metadata: lead.metadata }) }); }
  queryIndicator(query: BiIndicatorQuery) { return this.request('query-indicator', '/admin/parametrix/indicators', { method: 'POST', body: JSON.stringify(query) }); }
  syncEcommerceOrder(order: EcommerceOrder) { return this.request('sync-ecommerce-order', '/admin/orders', { method: 'POST', body: JSON.stringify({ email: order.customerId, items: order.lines.map((line) => ({ variant_id: line.sku, quantity: line.quantity })), metadata: { parametrixExternalId: order.externalId, status: order.status } }) }); }
}

export const OPEN_SOURCE_ENGINE_FACTORIES = Object.freeze({
  erpnext: (config: HttpEngineConfig) => new ErpNextAdapter(config),
  twenty: (config: HttpEngineConfig) => new TwentyAdapter(config),
  metabase: (config: HttpEngineConfig) => new MetabaseAdapter(config),
  medusa: (config: HttpEngineConfig) => new MedusaAdapter(config),
});
