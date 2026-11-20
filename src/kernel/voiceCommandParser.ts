import type { VoiceActionIntent } from '../types/cad';

/**
 * Deterministic voice & text CAM command interpreter (Portuguese & English)
 * enabling full hands-free control over CAM restart, all 8 manufacturing modes,
 * Datacenter/Humanoid programs, remote G-code/MQTT dispatch, formal VUC proof,
 * presets, FEA, curvature optimization, agent Q&A routing, and exports.
 */
export function parseVoiceCommand(rawTranscript: string): VoiceActionIntent {
  const transcript = rawTranscript.trim();
  const q = transcript
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!q) {
    return {
      transcript,
      matched: false,
      action: 'unknown',
      feedbackText: 'Comando de voz vazio.',
    };
  }

  if (/(^(agente|perguntar|explique|como esta|qual|quais|status)\b|\?$)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'agent-query',
      param: transcript,
      feedbackText: 'Consultando agente CAM com Olho MCP e prova VUC.',
    };
  }

  if (/(reiniciar|recomecar|restart|resetar).*(cam|processo|simulacao|maquina)|^reiniciar$/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'restart-cam',
      feedbackText: 'Reiniciando processo produtivo CAM do zero com verificação VUC.',
    };
  }

  if (/(pausar|parar|pause|stop).*(cam|simulacao)?/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'pause-cam',
      feedbackText: 'Simulação CAM pausada.',
    };
  }

  if (/(iniciar|simular|play|rodar).*(cam|simulacao|usinagem|impressao)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'play-cam',
      feedbackText: 'Iniciando simulação CAM em tempo real.',
    };
  }

  if (/(cold ?plate|liquid cooling|trocador)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'select-program',
      param: 'dc-coldplate',
      feedbackText: 'Carregando programa CAM Cold-Plate Liquid Cooling do Datacenter.',
    };
  }

  if (/(manifold|engate rapido)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'select-program',
      param: 'dc-manifold',
      feedbackText: 'Carregando programa CAM Manifold LPBF em pó metálico.',
    };
  }

  if (/(torso|humanoide|endo ?esqueleto)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'select-program',
      param: 'hum-torso',
      feedbackText: 'Carregando programa CAM Endoesqueleto Torácico do Robô Humanoide.',
    };
  }

  if (/(atuador|harmonico|junta)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'select-program',
      param: 'hum-actuator',
      feedbackText: 'Carregando programa CAM Atuador Harmônico 5-eixos.',
    };
  }

  if (/(po metal|metalica|lpbf|slm|sinteriz)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'set-process',
      param: 'powder-metal',
      feedbackText: 'Modo CAM alterado para Impressão 3D em Pó Metálico (LPBF).',
    };
  }

  if (/(resina|sla|dlp|uv)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'set-process',
      param: 'resin-sla',
      feedbackText: 'Modo CAM alterado para Impressão em Resina UV (SLA).',
    };
  }

  if (/(solda|weld|mig|tig)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'set-process',
      param: 'robot-weld',
      feedbackText: 'Modo CAM alterado para Robô de Solda com fio e arco visíveis.',
    };
  }

  if (/(laser|raio)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'set-process',
      param: 'laser-cut',
      feedbackText: 'Modo CAM alterado para Corte / Sinterização a Laser.',
    };
  }

  if (/(5 eixos|cinco eixos|cnc 5)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'set-process',
      param: 'cnc-5axis',
      feedbackText: 'Modo CAM alterado para Centro CNC 5-Eixos Simultâneo.',
    };
  }

  if (/(3 eixos|tres eixos|cnc 3|fresadora)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'set-process',
      param: 'cnc-3axis',
      feedbackText: 'Modo CAM alterado para Fresadora CNC 3-Eixos.',
    };
  }

  if (/(kuka|6 eixos|seis eixos|braco robo)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'set-process',
      param: 'robot-6axis',
      feedbackText: 'Modo CAM alterado para Robô Industrial KUKA 6-Eixos.',
    };
  }

  if (/(usinagem manual|modo manual|dro)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'set-process',
      param: 'manual',
      feedbackText: 'Modo CAM alterado para Usinagem Manual / DRO.',
    };
  }

  if (/(enviar codigo g|despachar maquina|despacho remoto|mqtt)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'dispatch-remote',
      feedbackText: 'Despachando código G e telemetria MQTT para máquina remota.',
    };
  }

  if (/(prova vuc|certificado vuc|hash vuc|assinar vuc|ed25519)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'verify-vuc',
      feedbackText: 'Gerando prova formal VUC SHA-256 com assinatura Ed25519.',
    };
  }

  if (/(frostbite|nvidia|rack|800v|800 v|1mw|1 mw)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'open-tab',
      param: 'frostbite',
      feedbackText: 'Abrindo comparativo Rack FrostbiteEngine vs NVIDIA 1MW 800VDC.',
    };
  }

  if (/(ecossistema|chat|logistica|erp|crm|foxconn|ifood|entregador)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'open-tab',
      param: 'ecosystem',
      feedbackText: 'Abrindo Ecossistema: Chat, Logística 4-Modais e ERP/CRM.',
    };
  }

  if (/(novo projeto|assistente|do zero|new project|wizard)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'start-wizard',
      feedbackText: 'Abrindo assistente interativo de novo projeto do zero.',
    };
  }

  if (/(fea|estresse|stress|calor|tensao)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'run-fea',
      feedbackText: 'Executando análise estrutural FEA com mapa de calor.',
    };
  }

  if (/(otimizar|curvatura|reduzir peso|aliviar)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'optimize-curvature',
      feedbackText: 'Otimizando curvatura NURBS para redução de massa.',
    };
  }

  if (/(explodir|explode|vista explodida)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'toggle-explode',
      feedbackText: 'Alternando vista explodida do conjunto.',
    };
  }

  if (/(exportar|baixar).*(stl|3dm|dxf|nc)?/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'export-stl',
      feedbackText: 'Exportando modelo STL verificado.',
    };
  }

  if (/(soc|chip|silicio|optico|hibrido)/.test(q)) {
    return {
      transcript,
      matched: true,
      action: 'load-preset',
      param: 'preset-soc-hybrid',
      feedbackText: 'Carregando projeto SoC Silício / Óptico Híbrido.',
    };
  }

  return {
    transcript,
    matched: false,
    action: 'unknown',
    feedbackText: `Comando não reconhecido: "${transcript}". Tente "reiniciar CAM", "modo pó metálico", "coldplate", "prova VUC" ou "agente ...?".`,
  };
}
