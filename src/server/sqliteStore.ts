import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ECOSYSTEM_ROLE_DEFINITIONS,
  buildUserProfileWithRole,
  createDefaultAgentForRole,
} from '../kernel/ecosystemErpLogistics';
import { computeDeterministicVucHash } from '../kernel/vucHash';
import type {
  AuthProviderKind,
  AuthUserProfile,
  ComputeShareNode,
  EcosystemChatMessage,
  EcosystemRole,
  ErpCrmRecord,
  LogisticsModal,
  LogisticsTelemetryNode,
  MachineType,
  RemoteMachineTarget,
} from '../types/cad';

export interface SavedSqliteProject {
  id: string;
  ownerId: string;
  name: string;
  presetId: string;
  segment: string;
  paramsJson: string;
  camJson: string;
  vucHash: string;
  updatedAt: string;
}

export interface VucLedgerEntry {
  vucHash: string;
  domain: string;
  summary: string;
  payloadJson: string;
  sha256Hex: string;
  createdAt: string;
}

function hashPassword(raw: string): string {
  const salt = 'parametrix_vuc_local_salt_v1';
  return crypto.scryptSync(raw, salt, 32).toString('hex');
}

export class ParametrixSqliteStore {
  public readonly db: DatabaseSync;

  constructor(dbPath?: string) {
    const resolved =
      dbPath ??
      process.env.PARAMETRIX_DB_PATH ??
      path.resolve(process.cwd(), 'data', 'parametrix.sqlite');

    if (resolved !== ':memory:') {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
    }
    this.db = new DatabaseSync(resolved);
    this.initSchema();
    this.seedIfEmpty();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        auth_provider TEXT NOT NULL,
        role TEXT NOT NULL,
        handle_at TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        compute_share_pct REAL NOT NULL DEFAULT 20,
        agent_config_json TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        session_token TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        preset_id TEXT NOT NULL,
        segment TEXT NOT NULL,
        params_json TEXT NOT NULL,
        cam_json TEXT NOT NULL,
        vuc_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS erp_records (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        party_name TEXT NOT NULL,
        segment TEXT NOT NULL,
        amount_brl REAL NOT NULL,
        modal TEXT,
        owner_role TEXT NOT NULL,
        vuc_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        room TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_role TEXT NOT NULL,
        is_agent INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        lat REAL,
        lng REAL,
        vuc_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logistics_nodes (
        id TEXT PRIMARY KEY,
        driver_name TEXT NOT NULL,
        service_tag TEXT NOT NULL,
        modal TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        status TEXT NOT NULL,
        route_label TEXT NOT NULL,
        speed_kmh REAL NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS compute_nodes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        label TEXT NOT NULL,
        os_name TEXT NOT NULL,
        cpu_cores INTEGER NOT NULL,
        gpu_name TEXT NOT NULL,
        share_pct REAL NOT NULL,
        tflops_est REAL NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS remote_machines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        machine_type TEXT NOT NULL,
        protocol TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        status TEXT NOT NULL,
        last_job_vuc TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vuc_ledger (
        vuc_hash TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        sha256_hex TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  private seedIfEmpty(): void {
    const now = new Date().toISOString();

    const erpCount = (this.db.prepare('SELECT COUNT(*) as c FROM erp_records').get() as { c: number }).c;
    if (erpCount === 0) {
      const seeds: ErpCrmRecord[] = [
        {
          id: 'erp-1',
          kind: 'order',
          title: 'Lote 24× Chassis Rack 800VDC Frostbite / Busbar Cu',
          status: 'em-producao',
          partyName: 'Foxconn Hub Jundiaí CAM',
          segment: 'robotica',
          amountBrl: 48600,
          modal: 'road',
          ownerRole: 'cam_provider',
          vucHash: computeDeterministicVucHash('ERP_SEED', 'erp-1'),
          updatedAt: now,
        },
        {
          id: 'erp-2',
          kind: 'inventory',
          title: 'Pó Metálico Ti-6Al-4V Grau 23 (120 kg) + Resina SLA 405nm',
          status: 'aberto',
          partyName: 'Insumos Ligas Piracicaba',
          segment: 'aeroespacial',
          amountBrl: 29400,
          modal: 'rail',
          ownerRole: 'supplier',
          vucHash: computeDeterministicVucHash('ERP_SEED', 'erp-2'),
          updatedAt: now,
        },
        {
          id: 'erp-3',
          kind: 'shipment',
          title: 'Frete Multimodal Viracopos -> Porto Santos -> Manaus',
          status: 'em-transito',
          partyName: 'Hub Multimodal 99/iFood + Ferro/Aero/Fluvial',
          segment: 'industrial-cnc',
          amountBrl: 6250,
          modal: 'air',
          ownerRole: 'logistics',
          vucHash: computeDeterministicVucHash('ERP_SEED', 'erp-3'),
          updatedAt: now,
        },
        {
          id: 'erp-4',
          kind: 'lead',
          title: 'Célula SoC Silício + Interposer Óptico (Orçamento Aberto)',
          status: 'aberto',
          partyName: 'Cliente Engenharia Campinas',
          segment: 'aeroespacial',
          amountBrl: 112000,
          modal: 'river',
          ownerRole: 'client',
          vucHash: computeDeterministicVucHash('ERP_SEED', 'erp-4'),
          updatedAt: now,
        },
      ];
      const stmt = this.db.prepare(
        `INSERT INTO erp_records (id, kind, title, status, party_name, segment, amount_brl, modal, owner_role, vuc_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const s of seeds) {
        stmt.run(
          s.id,
          s.kind,
          s.title,
          s.status,
          s.partyName,
          s.segment,
          s.amountBrl,
          s.modal!,
          s.ownerRole,
          s.vucHash,
          s.updatedAt
        );
      }
    }

    const logCount = (this.db.prepare('SELECT COUNT(*) as c FROM logistics_nodes').get() as { c: number }).c;
    if (logCount === 0) {
      const nodes: LogisticsTelemetryNode[] = [
        {
          id: 'log-ifood-1',
          driverName: 'Carlos M. (Moto Express)',
          serviceTag: 'iFood',
          modal: 'road',
          lat: -23.5505,
          lng: -46.6333,
          status: 'em-rota',
          routeLabel: 'Oficina CNC Mooca -> Cliente Paulista',
          speedKmh: 44,
          updatedAt: now,
        },
        {
          id: 'log-99-2',
          driverName: 'Ana P. (Utilitário Carga)',
          serviceTag: '99',
          modal: 'road',
          lat: -23.1865,
          lng: -46.8845,
          status: 'coletando',
          routeLabel: 'Foxconn Jundiaí -> Hub Viracopos',
          speedKmh: 62,
          updatedAt: now,
        },
        {
          id: 'log-rail-3',
          driverName: 'Composição Rumo MRS-08',
          serviceTag: 'Ferrovia',
          modal: 'rail',
          lat: -23.82,
          lng: -46.48,
          status: 'em-rota',
          routeLabel: 'Campinas -> Terminal Ferroviário Santos',
          speedKmh: 68,
          updatedAt: now,
        },
        {
          id: 'log-air-4',
          driverName: 'Cargueiro VCP-Cargo 737F',
          serviceTag: 'Aéreo',
          modal: 'air',
          lat: -23.0074,
          lng: -47.1345,
          status: 'hub-aguardando',
          routeLabel: 'Viracopos (VCP) -> Polo Industrial Manaus',
          speedKmh: 720,
          updatedAt: now,
        },
        {
          id: 'log-river-5',
          driverName: 'Barcaça Hidrovia Tietê-Paraná',
          serviceTag: 'Fluvial',
          modal: 'river',
          lat: -22.52,
          lng: -48.56,
          status: 'em-rota',
          routeLabel: 'Terminal Fluvial Jaú -> Retroporto Paraná',
          speedKmh: 24,
          updatedAt: now,
        },
      ];
      const stmt = this.db.prepare(
        `INSERT INTO logistics_nodes (id, driver_name, service_tag, modal, lat, lng, status, route_label, speed_kmh, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const n of nodes) {
        stmt.run(
          n.id,
          n.driverName,
          n.serviceTag,
          n.modal,
          n.lat,
          n.lng,
          n.status,
          n.routeLabel,
          n.speedKmh,
          n.updatedAt
        );
      }
    }

    const compCount = (this.db.prepare('SELECT COUNT(*) as c FROM compute_nodes').get() as { c: number }).c;
    if (compCount === 0) {
      const localCores = Math.max(2, os.cpus().length);
      const stmt = this.db.prepare(
        `INSERT INTO compute_nodes (id, user_id, label, os_name, cpu_cores, gpu_name, share_pct, tflops_est, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      stmt.run(
        'node-host-local',
        'system-host',
        'Host Servidor Localhost SQLite',
        `${os.platform()} ${os.arch()}`,
        localCores,
        'WebGL / Compute Runtime Node',
        20,
        Number((localCores * 0.45).toFixed(2)),
        1,
        now
      );
      stmt.run(
        'node-foxconn-edge',
        'provider-foxconn',
        'Estação CAM Foxconn Hub (20%)',
        'Linux x64',
        32,
        'RTX Workstation 24GB',
        20,
        28.4,
        1,
        now
      );
    }

    const machCount = (this.db.prepare('SELECT COUNT(*) as c FROM remote_machines').get() as { c: number }).c;
    if (machCount === 0) {
      const machines: RemoteMachineTarget[] = [
        {
          id: 'mach-cnc-5x',
          name: 'Centro CNC 5-Eixos DMG Mori (Hub Jundiaí)',
          machineType: 'cnc-5axis',
          protocol: 'OPC-UA',
          endpointUrl: 'opc.tcp://cnc5x.local:4840/parametrix',
          status: 'online',
          lastJobVuc: computeDeterministicVucHash('MACHINE_INIT', 'mach-cnc-5x'),
          updatedAt: now,
        },
        {
          id: 'mach-lpbf-1',
          name: 'EOS M290 Pó Metálico Ti-6Al-4V (LPBF)',
          machineType: 'powder-metal',
          protocol: 'HTTP-Moonraker',
          endpointUrl: 'http://lpbf-eos.local:7125/printer/gcode',
          status: 'online',
          lastJobVuc: computeDeterministicVucHash('MACHINE_INIT', 'mach-lpbf-1'),
          updatedAt: now,
        },
        {
          id: 'mach-sla-uv',
          name: 'Formlabs Industrial Resina UV 405nm',
          machineType: 'resin-sla',
          protocol: 'HTTP-Moonraker',
          endpointUrl: 'http://sla-uv.local:7126/api/jobs',
          status: 'standby',
          lastJobVuc: computeDeterministicVucHash('MACHINE_INIT', 'mach-sla-uv'),
          updatedAt: now,
        },
        {
          id: 'mach-kuka-weld',
          name: 'Robô KUKA KR210 Solda MIG/TIG',
          machineType: 'robot-weld',
          protocol: 'SSH-KUKA-Bridge',
          endpointUrl: 'ssh://kuka-cell04.local:22/krl/deploy',
          status: 'online',
          lastJobVuc: computeDeterministicVucHash('MACHINE_INIT', 'mach-kuka-weld'),
          updatedAt: now,
        },
      ];
      const stmt = this.db.prepare(
        `INSERT INTO remote_machines (id, name, machine_type, protocol, endpoint_url, status, last_job_vuc, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const m of machines) {
        stmt.run(m.id, m.name, m.machineType, m.protocol, m.endpointUrl, m.status, m.lastJobVuc, m.updatedAt);
      }
    }

    const chatCount = (this.db.prepare('SELECT COUNT(*) as c FROM chat_messages').get() as { c: number }).c;
    if (chatCount === 0) {
      this.appendChatMessage({
        room: 'geral',
        senderId: 'agent-cam-foxconn',
        senderName: 'Agente Orquestrador CNC/Foxconn',
        senderRole: 'cam_provider',
        isAgent: true,
        content:
          'Célula Foxconn online (@foxconn.cam.br). Pronto para receber arquivos .STL/.NC/.SRC com prova VUC e despachar via iFood/99 ou modal Rodo-Ferro-Aero-Fluvial.',
      });
    }
  }

  public loginOrRegister(input: {
    email: string;
    displayName?: string;
    provider: AuthProviderKind;
    role?: EcosystemRole;
    password?: string;
    handleAt?: string;
    phone?: string;
    address?: string;
    offlineMode?: boolean;
  }): AuthUserProfile {
    const cleanEmail = input.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Informe um e-mail válido para autenticar.');
    }

    const existing = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(cleanEmail) as Record<string, unknown> | undefined;

    const token = crypto.randomBytes(24).toString('hex');

    if (existing) {
      if (input.provider === 'proprietary' && input.password) {
        const expectedHash = hashPassword(input.password);
        if (existing.password_hash !== expectedHash) {
          throw new Error('Senha incorreta para a conta proprietária SQLite.');
        }
      }
      this.db
        .prepare('UPDATE users SET session_token = ?, auth_provider = ? WHERE id = ?')
        .run(token, input.provider, String(existing.id));

      return {
        id: String(existing.id),
        email: String(existing.email),
        displayName: String(existing.display_name),
        provider: input.provider,
        role: existing.role as EcosystemRole,
        handleAt: String(existing.handle_at),
        phone: String(existing.phone),
        address: String(existing.address),
        computeSharePct: Number(existing.compute_share_pct),
        offlineMode: Boolean(input.offlineMode),
        agentConfig: JSON.parse(String(existing.agent_config_json)),
        sessionToken: token,
      };
    }

    const role: EcosystemRole = input.role ?? 'client';
    const def = ECOSYSTEM_ROLE_DEFINITIONS[role];
    const id = `usr-${crypto.randomBytes(6).toString('hex')}`;
    const displayName =
      input.displayName?.trim() || cleanEmail.split('@')[0] || 'Engenheiro Parametrix';
    const handleAt =
      input.handleAt?.trim() || `@${displayName.toLowerCase().replace(/[^a-z0-9]/g, '') || def.shortTag.toLowerCase()}`;
    const phone = input.phone?.trim() || def.defaultPhone;
    const address = input.address?.trim() || def.defaultAddress;
    const agentConfig = createDefaultAgentForRole(role, {
      handleAt,
      phone,
      address,
    });
    const pwHash = hashPassword(input.password || `${input.provider}:${cleanEmail}`);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO users (id, email, display_name, auth_provider, role, handle_at, phone, address, compute_share_pct, agent_config_json, password_hash, session_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        cleanEmail,
        displayName,
        input.provider,
        role,
        handleAt,
        phone,
        address,
        20,
        JSON.stringify(agentConfig),
        pwHash,
        token,
        now
      );

    // Also register the user's 20% shared compute node automatically in SQLite
    this.upsertComputeNode({
      id: `node-${id}`,
      userId: id,
      label: `${displayName} (20% Edge)`,
      osName: `${os.platform()} · Browser/Client`,
      cpuCores: Math.max(2, os.cpus().length),
      gpuName: 'Shared 20% WebGL Node',
      sharePct: 20,
      tflopsEst: 4.2,
      active: true,
    });

    return buildUserProfileWithRole(
      {
        id,
        email: cleanEmail,
        displayName,
        provider: input.provider,
        offlineMode: Boolean(input.offlineMode),
      },
      role,
      agentConfig
    );
  }

  public updateUserProfile(input: {
    userId: string;
    role: EcosystemRole;
    handleAt: string;
    phone: string;
    address: string;
    computeSharePct: number;
    agentConfig: AuthUserProfile['agentConfig'];
  }): AuthUserProfile | null {
    const existing = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(input.userId) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const share = Math.max(0, Math.min(50, Number(input.computeSharePct) || 20));
    this.db
      .prepare(
        `UPDATE users SET role = ?, handle_at = ?, phone = ?, address = ?, compute_share_pct = ?, agent_config_json = ?
         WHERE id = ?`
      )
      .run(
        input.role,
        input.handleAt,
        input.phone,
        input.address,
        share,
        JSON.stringify(input.agentConfig),
        input.userId
      );

    this.db
      .prepare('UPDATE compute_nodes SET share_pct = ?, updated_at = ? WHERE user_id = ?')
      .run(share, new Date().toISOString(), input.userId);

    return {
      id: String(existing.id),
      email: String(existing.email),
      displayName: String(existing.display_name),
      provider: existing.auth_provider as AuthProviderKind,
      role: input.role,
      handleAt: input.handleAt,
      phone: input.phone,
      address: input.address,
      computeSharePct: share,
      offlineMode: true,
      agentConfig: input.agentConfig,
      sessionToken: String(existing.session_token),
    };
  }

  public getUserCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  }

  public saveProject(input: {
    id?: string;
    ownerId: string;
    name: string;
    presetId: string;
    segment: string;
    paramsJson: string;
    camJson: string;
  }): SavedSqliteProject {
    const id = input.id || `proj-${Date.now()}`;
    const updatedAt = new Date().toISOString();
    const vucHash = computeDeterministicVucHash('SQLITE_PROJECT', {
      id,
      name: input.name,
      presetId: input.presetId,
      paramsJson: input.paramsJson,
      camJson: input.camJson,
    });
    this.db
      .prepare(
        `INSERT INTO projects (id, owner_id, name, preset_id, segment, params_json, cam_json, vuc_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, preset_id=excluded.preset_id, segment=excluded.segment,
           params_json=excluded.params_json, cam_json=excluded.cam_json, vuc_hash=excluded.vuc_hash, updated_at=excluded.updated_at`
      )
      .run(
        id,
        input.ownerId,
        input.name,
        input.presetId,
        input.segment,
        input.paramsJson,
        input.camJson,
        vucHash,
        updatedAt
      );
    this.recordVucProof('PROJECT_SAVE', `Projeto salvo: ${input.name}`, { id, vucHash });
    return {
      id,
      ownerId: input.ownerId,
      name: input.name,
      presetId: input.presetId,
      segment: input.segment,
      paramsJson: input.paramsJson,
      camJson: input.camJson,
      vucHash,
      updatedAt,
    };
  }

  public listProjects(): SavedSqliteProject[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 50')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      ownerId: String(r.owner_id),
      name: String(r.name),
      presetId: String(r.preset_id),
      segment: String(r.segment),
      paramsJson: String(r.params_json),
      camJson: String(r.cam_json),
      vucHash: String(r.vuc_hash),
      updatedAt: String(r.updated_at),
    }));
  }

  public listErpRecords(): ErpCrmRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM erp_records ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      kind: r.kind as ErpCrmRecord['kind'],
      title: String(r.title),
      status: r.status as ErpCrmRecord['status'],
      partyName: String(r.party_name),
      segment: r.segment as ErpCrmRecord['segment'],
      amountBrl: Number(r.amount_brl),
      modal: (r.modal ? String(r.modal) : 'road') as LogisticsModal,
      ownerRole: r.owner_role as EcosystemRole,
      vucHash: String(r.vuc_hash),
      updatedAt: String(r.updated_at),
    }));
  }

  public createErpRecord(
    input: Omit<ErpCrmRecord, 'id' | 'vucHash' | 'updatedAt'>
  ): ErpCrmRecord {
    const id = `erp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const updatedAt = new Date().toISOString();
    const vucHash = computeDeterministicVucHash('ERP_RECORD', { id, ...input });
    this.db
      .prepare(
        `INSERT INTO erp_records (id, kind, title, status, party_name, segment, amount_brl, modal, owner_role, vuc_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.kind,
        input.title,
        input.status,
        input.partyName,
        input.segment,
        input.amountBrl,
        input.modal ?? 'road',
        input.ownerRole,
        vucHash,
        updatedAt
      );
    this.recordVucProof('ERP_CRM', `${input.kind.toUpperCase()}: ${input.title}`, { id, vucHash });
    return { ...input, id, vucHash, updatedAt };
  }

  public appendChatMessage(
    input: Omit<EcosystemChatMessage, 'id' | 'vucHash' | 'createdAt'>
  ): EcosystemChatMessage {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = new Date().toISOString();
    const vucHash = computeDeterministicVucHash('ECOSYSTEM_CHAT', {
      room: input.room,
      senderId: input.senderId,
      content: input.content,
      createdAt,
    });
    this.db
      .prepare(
        `INSERT INTO chat_messages (id, room, sender_id, sender_name, sender_role, is_agent, content, lat, lng, vuc_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.room,
        input.senderId,
        input.senderName,
        input.senderRole,
        input.isAgent ? 1 : 0,
        input.content,
        input.lat ?? null,
        input.lng ?? null,
        vucHash,
        createdAt
      );
    return { ...input, id, vucHash, createdAt };
  }

  public listChatMessages(room?: string): EcosystemChatMessage[] {
    const rows = (room
      ? this.db
          .prepare('SELECT * FROM chat_messages WHERE room = ? ORDER BY created_at DESC LIMIT 80')
          .all(room)
      : this.db
          .prepare('SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 80')
          .all()) as Record<string, unknown>[];
    return rows.reverse().map((r) => ({
      id: String(r.id),
      room: String(r.room),
      senderId: String(r.sender_id),
      senderName: String(r.sender_name),
      senderRole: r.sender_role as EcosystemRole,
      isAgent: Boolean(r.is_agent),
      content: String(r.content),
      lat: r.lat !== null && r.lat !== undefined ? Number(r.lat) : undefined,
      lng: r.lng !== null && r.lng !== undefined ? Number(r.lng) : undefined,
      vucHash: String(r.vuc_hash),
      createdAt: String(r.created_at),
    }));
  }

  public listLogisticsNodes(): LogisticsTelemetryNode[] {
    const rows = this.db
      .prepare('SELECT * FROM logistics_nodes ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      driverName: String(r.driver_name),
      serviceTag: r.service_tag as LogisticsTelemetryNode['serviceTag'],
      modal: r.modal as LogisticsModal,
      lat: Number(r.lat),
      lng: Number(r.lng),
      status: r.status as LogisticsTelemetryNode['status'],
      routeLabel: String(r.route_label),
      speedKmh: Number(r.speed_kmh),
      updatedAt: String(r.updated_at),
    }));
  }

  public upsertLogisticsNode(
    node: Omit<LogisticsTelemetryNode, 'updatedAt'>
  ): LogisticsTelemetryNode {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO logistics_nodes (id, driver_name, service_tag, modal, lat, lng, status, route_label, speed_kmh, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           driver_name=excluded.driver_name, service_tag=excluded.service_tag, modal=excluded.modal,
           lat=excluded.lat, lng=excluded.lng, status=excluded.status, route_label=excluded.route_label,
           speed_kmh=excluded.speed_kmh, updated_at=excluded.updated_at`
      )
      .run(
        node.id,
        node.driverName,
        node.serviceTag,
        node.modal,
        node.lat,
        node.lng,
        node.status,
        node.routeLabel,
        node.speedKmh,
        updatedAt
      );
    return { ...node, updatedAt };
  }

  public listComputeNodes(): ComputeShareNode[] {
    const rows = this.db
      .prepare('SELECT * FROM compute_nodes ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      label: String(r.label),
      osName: String(r.os_name),
      cpuCores: Number(r.cpu_cores),
      gpuName: String(r.gpu_name),
      sharePct: Number(r.share_pct),
      tflopsEst: Number(r.tflops_est),
      active: Boolean(r.active),
      updatedAt: String(r.updated_at),
    }));
  }

  public upsertComputeNode(node: Omit<ComputeShareNode, 'updatedAt'>): ComputeShareNode {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO compute_nodes (id, user_id, label, os_name, cpu_cores, gpu_name, share_pct, tflops_est, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           label=excluded.label, os_name=excluded.os_name, cpu_cores=excluded.cpu_cores,
           gpu_name=excluded.gpu_name, share_pct=excluded.share_pct, tflops_est=excluded.tflops_est,
           active=excluded.active, updated_at=excluded.updated_at`
      )
      .run(
        node.id,
        node.userId,
        node.label,
        node.osName,
        node.cpuCores,
        node.gpuName,
        node.sharePct,
        node.tflopsEst,
        node.active ? 1 : 0,
        updatedAt
      );
    return { ...node, updatedAt };
  }

  public listRemoteMachines(): RemoteMachineTarget[] {
    const rows = this.db
      .prepare('SELECT * FROM remote_machines ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      machineType: r.machine_type as MachineType,
      protocol: r.protocol as RemoteMachineTarget['protocol'],
      endpointUrl: String(r.endpoint_url),
      status: r.status as RemoteMachineTarget['status'],
      lastJobVuc: String(r.last_job_vuc),
      updatedAt: String(r.updated_at),
    }));
  }

  public dispatchRemoteMachineJob(
    machineId: string,
    projectName: string,
    postCodeSnippet: string
  ): RemoteMachineTarget | null {
    const row = this.db
      .prepare('SELECT * FROM remote_machines WHERE id = ?')
      .get(machineId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const now = new Date().toISOString();
    const vucHash = computeDeterministicVucHash('REMOTE_MACHINE_DISPATCH', {
      machineId,
      projectName,
      snippetLen: postCodeSnippet.length,
      now,
    });
    this.db
      .prepare('UPDATE remote_machines SET status = ?, last_job_vuc = ?, updated_at = ? WHERE id = ?')
      .run('executando', vucHash, now, machineId);
    this.recordVucProof('REMOTE_EXEC', `Despacho remoto -> ${String(row.name)} (${projectName})`, {
      machineId,
      endpointUrl: row.endpoint_url,
      vucHash,
    });

    return {
      id: String(row.id),
      name: String(row.name),
      machineType: row.machine_type as MachineType,
      protocol: row.protocol as RemoteMachineTarget['protocol'],
      endpointUrl: String(row.endpoint_url),
      status: 'executando',
      lastJobVuc: vucHash,
      updatedAt: now,
    };
  }

  public recordVucProof(domain: string, summary: string, payload: unknown): VucLedgerEntry {
    const createdAt = new Date().toISOString();
    const payloadJson = JSON.stringify(payload);
    const vucHash = computeDeterministicVucHash(domain, payload);
    const sha256Hex = crypto
      .createHash('sha256')
      .update(`${domain}:${summary}:${payloadJson}`)
      .digest('hex')
      .toUpperCase();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO vuc_ledger (vuc_hash, domain, summary, payload_json, sha256_hex, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(vucHash, domain, summary, payloadJson, sha256Hex, createdAt);

    return {
      vucHash,
      domain,
      summary,
      payloadJson,
      sha256Hex,
      createdAt,
    };
  }

  public listVucLedger(): VucLedgerEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM vuc_ledger ORDER BY created_at DESC LIMIT 40')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      vucHash: String(r.vuc_hash),
      domain: String(r.domain),
      summary: String(r.summary),
      payloadJson: String(r.payload_json),
      sha256Hex: String(r.sha256_hex),
      createdAt: String(r.created_at),
    }));
  }
}
