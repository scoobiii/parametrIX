import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.PARAMETRIX_URL || 'http://127.0.0.1:3000';
const WS_URL = BASE_URL.replace(/^http/i, 'ws') + '/ws';

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 10 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const statusRes = http.get(`${BASE_URL}/api/claw/status`);
  check(statusRes, {
    'claw status 200': (r) => r.status === 200,
    'readyForClaw true': (r) => r.json('readyForClaw') === true,
  });

  const bboxRes = http.post(
    `${BASE_URL}/api/mcp`,
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'cad_get_bbox', arguments: { spanX: 210, spanY: 145, archHeight: 52 } },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(bboxRes, {
    'mcp cad_get_bbox 200': (r) => r.status === 200,
    'bbox returns VUC': (r) => Boolean(r.json('result.structuredContent.formalVuc.vuc_id')),
  });

  const searchRes = http.post(
    `${BASE_URL}/api/hermes/search`,
    JSON.stringify({ query: 'engrenagem M2 Z24', includeWeb: false, maxResults: 3 }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(searchRes, {
    'hermes search 200': (r) => r.status === 200,
    'search VUC signed': (r) => Boolean(r.json('vucCertificate.assinatura_ed25519')),
  });

  const wsRes = ws.connect(WS_URL, {}, function (socket) {
    let sawSync = false;
    let sawPong = false;

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'mcp:bridge_ready',
          payload: { ready: true, protocol: '2024-11-05' },
        })
      );
      socket.send(JSON.stringify({ type: 'ping' }));
    });

    socket.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'ecosystem:sync') sawSync = true;
      if (msg.type === 'pong') {
        sawPong = true;
        socket.close();
      }
      if (msg.type === 'mcp:rpc_request' && msg.payload && msg.payload.requestId) {
        socket.send(
          JSON.stringify({
            type: 'mcp:rpc_response',
            payload: {
              requestId: msg.payload.requestId,
              ok: true,
              log: { status: 'ok', responseJson: '{"ok":true}' },
            },
          })
        );
      }
    });

    socket.setTimeout(() => {
      socket.close();
    }, 2500);

    socket.on('close', () => {
      check({ sawSync, sawPong }, {
        'ws received ecosystem:sync': (s) => s.sawSync,
        'ws received pong keepalive': (s) => s.sawPong,
      });
    });
  });

  check(wsRes, {
    'ws upgrade 101': (r) => r && r.status === 101,
  });

  sleep(0.25);
}
