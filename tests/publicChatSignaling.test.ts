import { describe, expect, it } from 'vitest';
import {
  PUBLIC_CHAT_RULES,
  PUBLIC_CHAT_THEMES,
  buildProcessShareUrl,
  isRegisteredEcosystemUser,
  normalizeChatRoomTheme,
  parseProcessShareUrl,
  removeRtcPeer,
  summarizeRtcRoomMedia,
  upsertRtcPeer,
  validatePublicChatMessage,
} from '../src/kernel/publicChatSignaling';

describe('publicChatSignaling kernel', () => {
  it('exposes rules and themes and validates registered users strictly', () => {
    expect(PUBLIC_CHAT_THEMES.length).toBeGreaterThanOrEqual(6);
    expect(PUBLIC_CHAT_RULES.length).toBe(5);

    expect(isRegisteredEcosystemUser({ isAgent: true })).toBe(true);
    expect(isRegisteredEcosystemUser({ userId: 'usr-1', email: 'a@b.com', dbRegistered: false })).toBe(
      false
    );
    expect(isRegisteredEcosystemUser({ userId: 'local-default-op', email: 'a@b.com' })).toBe(false);
    expect(isRegisteredEcosystemUser({ userId: 'anon', email: 'a@b.com' })).toBe(false);
    expect(isRegisteredEcosystemUser({ userId: '', email: 'a@b.com' })).toBe(false);
    expect(isRegisteredEcosystemUser({ userId: 'usr-1', email: 'invalid-email' })).toBe(false);
    expect(isRegisteredEcosystemUser({})).toBe(false);
    expect(isRegisteredEcosystemUser({ userId: 'usr-1', email: 'eng@parametrix.local' })).toBe(true);
    expect(
      isRegisteredEcosystemUser({
        userId: 'usr-1',
        email: 'eng@parametrix.local',
        dbRegistered: true,
      })
    ).toBe(true);
  });

  it('normalizes themes and validates messages against empty, oversized, secret-leaking, or guest inputs', () => {
    expect(normalizeChatRoomTheme(undefined)).toBe('geral');
    expect(normalizeChatRoomTheme('unknown-room')).toBe('geral');
    expect(normalizeChatRoomTheme('CAM-CNC')).toBe('cam-cnc');

    const guestDenied = validatePublicChatMessage({
      senderId: 'local-default-op',
      senderEmail: 'eng@parametrix.local',
      room: 'cam-cnc',
      content: 'olá',
    });
    expect(guestDenied.ok).toBe(false);
    expect(guestDenied.reason).toContain('cadastrados');

    const emptyDenied = validatePublicChatMessage({
      senderId: 'usr-1',
      senderEmail: 'eng@parametrix.local',
      dbRegistered: true,
      room: 'cad-nurbs',
      content: '   ',
    });
    expect(emptyDenied.ok).toBe(false);
    expect(emptyDenied.reason).toContain('vazia');

    const missingFieldsDenied = validatePublicChatMessage({});
    expect(missingFieldsDenied.ok).toBe(false);

    const tooLongDenied = validatePublicChatMessage({
      senderId: 'usr-1',
      senderEmail: 'eng@parametrix.local',
      dbRegistered: true,
      room: 'geral',
      content: 'x'.repeat(2005),
    });
    expect(tooLongDenied.ok).toBe(false);
    expect(tooLongDenied.content).toHaveLength(2000);

    const secretDenied = validatePublicChatMessage({
      senderId: 'usr-1',
      senderEmail: 'eng@parametrix.local',
      dbRegistered: true,
      room: 'vuc-devops',
      content: 'Segue minha chave ghp_123456789012345678901234',
    });
    expect(secretDenied.ok).toBe(false);
    expect(secretDenied.reason).toContain('segredos');

    const okMsg = validatePublicChatMessage({
      senderId: 'usr-1',
      senderEmail: 'eng@parametrix.local',
      dbRegistered: true,
      room: 'cam-cnc',
      content: 'Rodando coldplate CNC 5-eixos',
    });
    expect(okMsg.ok).toBe(true);
    expect(okMsg.room).toBe('cam-cnc');
  });

  it('builds and parses shareable per-session process URLs', () => {
    const fullUrl = buildProcessShareUrl({
      origin: 'https://parametrix.app/',
      tab: 'cam',
      subTab: 'chat',
      room: 'cam-cnc',
      processMachine: 'powder-metal',
      displayMode: 'component-pbr',
      componentId: 'comp-gear-1',
      sessionId: 'sess-99',
      sharedBy: '@eng',
    });
    expect(fullUrl).toContain('https://parametrix.app/?');
    const parsedFull = parseProcessShareUrl(fullUrl);
    expect(parsedFull).toEqual({
      tab: 'cam',
      subTab: 'chat',
      room: 'cam-cnc',
      processMachine: 'powder-metal',
      displayMode: 'component-pbr',
      componentId: 'comp-gear-1',
      sessionId: 'sess-99',
      sharedBy: '@eng',
    });

    const minimalUrl = buildProcessShareUrl({
      origin: 'http://localhost:3000',
      tab: 'viewport',
    });
    expect(minimalUrl).toBe('http://localhost:3000/?tab=viewport');

    const parsedNoQueryMark = parseProcessShareUrl('tab=viewport&room=geral');
    expect(parsedNoQueryMark.tab).toBe('viewport');

    const parsedInvalid = parseProcessShareUrl('?tab=nope&process=bad&mode=invalid');
    expect(parsedInvalid.tab).toBeUndefined();
    expect(parsedInvalid.processMachine).toBeUndefined();
    expect(parsedInvalid.displayMode).toBeUndefined();
    expect(parsedInvalid.room).toBeUndefined();
  });

  it('manages sorted WebRTC peer presence and room media stats', () => {
    let peers = upsertRtcPeer([], {
      peerId: 'p-b',
      room: 'geral',
      userId: 'u2',
      displayName: 'Bob',
      role: 'client',
      audioEnabled: true,
      videoEnabled: false,
      screenEnabled: false,
      joinedAt: '2026-11-23T12:00:00.000Z',
    });
    peers = upsertRtcPeer(peers, {
      peerId: 'p-a',
      room: 'geral',
      userId: 'u1',
      displayName: 'Alice',
      role: 'cam_provider',
      audioEnabled: false,
      videoEnabled: true,
      screenEnabled: true,
      joinedAt: '2026-11-23T12:00:01.000Z',
    });
    peers = upsertRtcPeer(peers, {
      peerId: 'p-b',
      room: 'geral',
      userId: 'u2',
      displayName: 'Bob Atualizado',
      role: 'client',
      audioEnabled: true,
      videoEnabled: true,
      screenEnabled: false,
      joinedAt: '2026-11-23T12:00:02.000Z',
    });
    peers = upsertRtcPeer(peers, {
      peerId: 'p-c',
      room: 'geral',
      userId: 'u3',
      displayName: 'Carlos Audio',
      role: 'logistics',
      audioEnabled: false,
      videoEnabled: false,
      screenEnabled: false,
      joinedAt: '2026-11-23T12:00:03.000Z',
    });
    expect(peers.map((p) => p.peerId)).toEqual(['p-a', 'p-b', 'p-c']);
    expect(summarizeRtcRoomMedia(peers)).toEqual({
      totalPeers: 3,
      voiceActiveCount: 1,
      videoActiveCount: 2,
      screenSharingCount: 1,
    });

    const afterRemove = removeRtcPeer(peers, 'p-a');
    expect(afterRemove).toHaveLength(2);
    expect(afterRemove[0].peerId).toBe('p-b');
  });
});
