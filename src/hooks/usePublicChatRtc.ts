/**
 * @gos7-header v1.0
 * arquivo: src/hooks/usePublicChatRtc.ts
 * responsabilidade: Hook WebRTC full-duplex (voz, vídeo e compartilhamento de tela/módulo em tempo real) sinalizado via /ws.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { removeRtcPeer } from '../kernel/publicChatSignaling';
import type { AuthUserProfile, RtcPeerPresence } from '../types/cad';

export interface RemoteRtcStreamEntry {
  peerId: string;
  stream: MediaStream;
  kind: 'camera-audio' | 'screen';
}

interface UsePublicChatRtcOptions {
  wsRef: React.RefObject<WebSocket | null>;
  profile: AuthUserProfile;
  room: string;
  processUrl: string;
  isRegistered: boolean;
  onRequireAuth: () => void;
  onRecordAction?: (detail: string) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function usePublicChatRtc({
  wsRef,
  profile,
  room,
  processUrl,
  isRegistered,
  onRequireAuth,
  onRecordAction,
}: UsePublicChatRtcOptions) {
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);
  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);
  const [peers, setPeers] = useState<RtcPeerPresence[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<RemoteRtcStreamEntry[]>([]);
  const [localMediaStream, setLocalMediaStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [rtcError, setRtcError] = useState<string | null>(null);

  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localMediaRef = useRef<MediaStream | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);
  const selfPeerIdRef = useRef<string | null>(null);
  const joinedRoomRef = useRef<string | null>(null);

  const sendWs = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return false;
      }
      ws.send(JSON.stringify({ type, payload }));
      return true;
    },
    [wsRef]
  );

  const closePeerConnection = useCallback((peerId: string) => {
    const pc = pcMapRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      pcMapRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => prev.filter((s) => s.peerId !== peerId));
  }, []);

  const syncLocalTracksToAllPeers = useCallback(() => {
    const activeTracks: MediaStreamTrack[] = [];
    if (localMediaRef.current) {
      for (const tr of localMediaRef.current.getTracks()) activeTracks.push(tr);
    }
    if (localScreenRef.current) {
      for (const tr of localScreenRef.current.getTracks()) activeTracks.push(tr);
    }

    for (const pc of pcMapRef.current.values()) {
      const senders = pc.getSenders();
      for (const sender of senders) {
        if (sender.track && !activeTracks.includes(sender.track)) {
          try {
            pc.removeTrack(sender);
          } catch {
            // Ignore closed pc
          }
        }
      }
      for (const track of activeTracks) {
        if (!senders.some((s) => s.track === track)) {
          const stream =
            localScreenRef.current?.getTracks().includes(track) && localScreenRef.current
              ? localScreenRef.current
              : localMediaRef.current!;
          pc.addTrack(track, stream);
        }
      }
    }
  }, []);

  const getOrCreatePeerConnection = useCallback(
    (remotePeerId: string, activeRoom: string): RTCPeerConnection => {
      const existing = pcMapRef.current.get(remotePeerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendWs('rtc:ice', {
            room: activeRoom,
            targetPeerId: remotePeerId,
            candidate: ev.candidate,
          });
        }
      };

      pc.ontrack = (ev) => {
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        const isScreen =
          ev.track.kind === 'video' &&
          (ev.track.label.toLowerCase().includes('screen') ||
            ev.track.label.toLowerCase().includes('window'));
        setRemoteStreams((prev) => {
          const next = prev.filter((item) => item.peerId !== remotePeerId);
          return [
            ...next,
            { peerId: remotePeerId, stream, kind: isScreen ? 'screen' : 'camera-audio' },
          ];
        });
      };

      pcMapRef.current.set(remotePeerId, pc);
      syncLocalTracksToAllPeers();
      return pc;
    },
    [sendWs, syncLocalTracksToAllPeers]
  );

  const leaveCall = useCallback(() => {
    for (const peerId of Array.from(pcMapRef.current.keys())) {
      closePeerConnection(peerId);
    }
    if (localMediaRef.current) {
      for (const tr of localMediaRef.current.getTracks()) tr.stop();
      localMediaRef.current = null;
      setLocalMediaStream(null);
    }
    if (localScreenRef.current) {
      for (const tr of localScreenRef.current.getTracks()) tr.stop();
      localScreenRef.current = null;
      setLocalScreenStream(null);
    }
    setAudioEnabled(false);
    setVideoEnabled(false);
    setScreenEnabled(false);
    setJoinedRoom(null);
    joinedRoomRef.current = null;
    setSelfPeerId(null);
    selfPeerIdRef.current = null;
    setPeers([]);
    setRemoteStreams([]);
    sendWs('rtc:leave', {});
    onRecordAction?.('Encerrou chamada WebRTC');
  }, [closePeerConnection, onRecordAction, sendWs]);

  const joinRoomIfNeeded = useCallback(
    (nextAudio: boolean, nextVideo: boolean, nextScreen: boolean) => {
      if (!isRegistered) {
        setRtcError(
          'Apenas usuários cadastrados no Parametrix podem entrar em chamadas de voz, vídeo ou compartilhamento de tela.'
        );
        onRequireAuth();
        return false;
      }
      setRtcError(null);
      const sent = sendWs('rtc:join', {
        room,
        userId: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        role: profile.role,
        audioEnabled: nextAudio,
        videoEnabled: nextVideo,
        screenEnabled: nextScreen,
        processUrl,
      });
      if (!sent) {
        setRtcError('WebSocket /ws desconectado no momento. Aguarde reconexão para WebRTC real.');
        return false;
      }
      setJoinedRoom(room);
      joinedRoomRef.current = room;
      return true;
    },
    [isRegistered, onRequireAuth, processUrl, profile.displayName, profile.email, profile.id, profile.role, room, sendWs]
  );

  const broadcastMediaState = useCallback(
    (nextAudio: boolean, nextVideo: boolean, nextScreen: boolean) => {
      if (!joinedRoomRef.current) return;
      sendWs('rtc:media-state', {
        room: joinedRoomRef.current,
        audioEnabled: nextAudio,
        videoEnabled: nextVideo,
        screenEnabled: nextScreen,
        processUrl,
      });
    },
    [processUrl, sendWs]
  );

  const toggleVoiceOrVideo = useCallback(
    async (wantAudio: boolean, wantVideo: boolean) => {
      if (!isRegistered) {
        setRtcError('Faça login ou cadastre-se para usar voz e vídeo full-duplex.');
        onRequireAuth();
        return;
      }
      setRtcError(null);

      if (!wantAudio && !wantVideo) {
        if (localMediaRef.current) {
          for (const tr of localMediaRef.current.getTracks()) tr.stop();
          localMediaRef.current = null;
          setLocalMediaStream(null);
        }
        setAudioEnabled(false);
        setVideoEnabled(false);
        syncLocalTracksToAllPeers();
        broadcastMediaState(false, false, screenEnabled);
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setRtcError('API navigator.mediaDevices.getUserMedia indisponível neste navegador/contexto.');
        return;
      }

      try {
        if (localMediaRef.current) {
          for (const tr of localMediaRef.current.getTracks()) tr.stop();
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: wantAudio ? { echoCancellation: true, noiseSuppression: true } : false,
          video: wantVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
        localMediaRef.current = stream;
        setLocalMediaStream(stream);
        setAudioEnabled(wantAudio);
        setVideoEnabled(wantVideo);
        joinRoomIfNeeded(wantAudio, wantVideo, screenEnabled);
        syncLocalTracksToAllPeers();
        broadcastMediaState(wantAudio, wantVideo, screenEnabled);
        onRecordAction?.(
          `WebRTC mídia ativa (${wantAudio ? 'voz ' : ''}${wantVideo ? 'vídeo' : ''}) em #${room}`
        );
      } catch (err) {
        setRtcError(
          `Dispositivo de áudio/vídeo não autorizado ou ausente: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    },
    [
      broadcastMediaState,
      isRegistered,
      joinRoomIfNeeded,
      onRecordAction,
      onRequireAuth,
      room,
      screenEnabled,
      syncLocalTracksToAllPeers,
    ]
  );

  const toggleScreenShare = useCallback(async () => {
    if (!isRegistered) {
      setRtcError('Compartilhamento de tela em tempo real exige usuário cadastrado.');
      onRequireAuth();
      return;
    }
    setRtcError(null);

    if (screenEnabled && localScreenRef.current) {
      for (const tr of localScreenRef.current.getTracks()) tr.stop();
      localScreenRef.current = null;
      setLocalScreenStream(null);
      setScreenEnabled(false);
      syncLocalTracksToAllPeers();
      broadcastMediaState(audioEnabled, videoEnabled, false);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setRtcError('getDisplayMedia indisponível neste navegador para captura de tela/módulo.');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const vTrack = screenStream.getVideoTracks()[0];
      if (vTrack) {
        vTrack.onended = () => {
          localScreenRef.current = null;
          setLocalScreenStream(null);
          setScreenEnabled(false);
          syncLocalTracksToAllPeers();
          broadcastMediaState(audioEnabled, videoEnabled, false);
        };
      }
      localScreenRef.current = screenStream;
      setLocalScreenStream(screenStream);
      setScreenEnabled(true);
      joinRoomIfNeeded(audioEnabled, videoEnabled, true);
      syncLocalTracksToAllPeers();
      broadcastMediaState(audioEnabled, videoEnabled, true);
      onRecordAction?.(`Compartilhamento de tela/processo iniciado em #${room}`);
    } catch (err) {
      setRtcError(
        `Compartilhamento de tela cancelado ou bloqueado: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }, [
    audioEnabled,
    broadcastMediaState,
    isRegistered,
    joinRoomIfNeeded,
    onRecordAction,
    onRequireAuth,
    room,
    screenEnabled,
    syncLocalTracksToAllPeers,
    videoEnabled,
  ]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    const onMessage = async (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { type?: string; payload?: Record<string, unknown> };
        if (!msg.payload) return;

        if (msg.type === 'rtc:error') {
          setRtcError(String(msg.payload.reason || 'Erro WebRTC no servidor.'));
        } else if (msg.type === 'rtc:joined') {
          const peerId = String(msg.payload.peerId || '');
          selfPeerIdRef.current = peerId;
          setSelfPeerId(peerId);
        } else if (msg.type === 'rtc:peers') {
          const list = Array.isArray(msg.payload.peers)
            ? (msg.payload.peers as RtcPeerPresence[])
            : [];
          const eventRoom = String(msg.payload.room || room);
          setPeers(list);
          const myId = selfPeerIdRef.current;
          const activePeerIds = new Set(list.map((p) => p.peerId));
          for (const oldId of Array.from(pcMapRef.current.keys())) {
            if (!activePeerIds.has(oldId)) {
              closePeerConnection(oldId);
            }
          }
          if (myId && joinedRoomRef.current === eventRoom) {
            for (const p of list) {
              if (p.peerId !== myId && myId < p.peerId && !pcMapRef.current.has(p.peerId)) {
                const pc = getOrCreatePeerConnection(p.peerId, eventRoom);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendWs('rtc:offer', {
                  room: eventRoom,
                  targetPeerId: p.peerId,
                  sdp: offer,
                });
              }
            }
          }
        } else if (msg.type === 'rtc:offer') {
          const fromPeerId = String(msg.payload.fromPeerId || '');
          const eventRoom = String(msg.payload.room || room);
          if (!fromPeerId || !msg.payload.sdp) return;
          const pc = getOrCreatePeerConnection(fromPeerId, eventRoom);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWs('rtc:answer', {
            room: eventRoom,
            targetPeerId: fromPeerId,
            sdp: answer,
          });
        } else if (msg.type === 'rtc:answer') {
          const fromPeerId = String(msg.payload.fromPeerId || '');
          const pc = pcMapRef.current.get(fromPeerId);
          if (pc && msg.payload.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp as RTCSessionDescriptionInit));
          }
        } else if (msg.type === 'rtc:ice') {
          const fromPeerId = String(msg.payload.fromPeerId || '');
          const pc = pcMapRef.current.get(fromPeerId);
          if (pc && msg.payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate as RTCIceCandidateInit));
          }
        }
      } catch {
        // Ignore malformed WebRTC signaling frame
      }
    };

    ws.addEventListener('message', onMessage);
    return () => {
      ws.removeEventListener('message', onMessage);
    };
  }, [closePeerConnection, getOrCreatePeerConnection, room, sendWs, wsRef]);

  useEffect(() => {
    return () => {
      leaveCall();
    };
  }, [leaveCall]);

  return {
    joinedRoom,
    selfPeerId,
    peers: removeRtcPeer(peers, selfPeerId ?? ''),
    allPeers: peers,
    remoteStreams,
    localMediaStream,
    localScreenStream,
    audioEnabled,
    videoEnabled,
    screenEnabled,
    rtcError,
    setRtcError,
    toggleVoiceOrVideo,
    toggleScreenShare,
    joinRoomOnly: () => joinRoomIfNeeded(audioEnabled, videoEnabled, screenEnabled),
    leaveCall,
  };
}
