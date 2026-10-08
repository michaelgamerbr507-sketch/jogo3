import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import * as tiktok from 'tiktok-live-connector';

console.log('[BRIDGE] Exports do tiktok-live-connector:', Object.keys(tiktok));

const TikTokLiveConnection =
  tiktok.TikTokLiveConnection ||
  tiktok.TikTokLiveConnector ||
  tiktok.TikTokLiveClient ||
  tiktok.TikTokLive ||
  tiktok.LiveConnector ||
  tiktok.Connector ||
  tiktok.default ||
  tiktok;

if (!TikTokLiveConnection || typeof TikTokLiveConnection !== 'function') {
  console.error('[BRIDGE] ERRO: Não encontrou classe construtora nos exports');
  console.error('[BRIDGE] Exports completos (primeiros 20):', Object.keys(tiktok).slice(0, 20));
  process.exit(1);
}

console.log('[BRIDGE] Usando construtor:', TikTokLiveConnection.name || 'anonymous');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 10000;

let clients = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[BRIDGE] Cliente conectado. Total:', clients.size);
  ws.send(JSON.stringify({ type: 'bridge_status', connected: true }));
  ws.on('close', () => {
    clients.delete(ws);
    console.log('[BRIDGE] Cliente desconectado. Total:', clients.size);
  });
});

app.get('/health', (req, res) => res.json({ ok: true, clients: clients.size }));

// ==================== PORT BIND PRIMEIRO (Render requirement) ====================
server.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('[BRIDGE] ❌ ERRO PORT BIND:', err.message);
    process.exit(1);
  }
  console.log('[BRIDGE] ✅ HTTP/WS listening on 0.0.0.0:' + PORT);
  console.log('[BRIDGE] Health: http://0.0.0.0:' + PORT + '/health');
  console.log('[BRIDGE] WebSocket: ws://0.0.0.0:' + PORT + '/');
  
  // TikTok connect DEPOIS do bind
  const tiktokClient = new TikTokLiveConnection('truecrimevideosreal', {
    processInitialData: true
  });

  console.log('[BRIDGE] Conectando ao TikTok: truecrimevideosreal');

  tiktokClient.connect().then(() => {
    console.log('[BRIDGE] Conectado ao TikTok Live: truecrimevideosreal');
    broadcast({ type: 'bridge_status', connected: true });
  }).catch(err => {
    console.error('[BRIDGE] Erro ao conectar:', err.message);
    broadcast({ type: 'bridge_status', connected: false, error: err.message });
  });

  tiktokClient.on('*', (eventName, data) => {
    console.log('[BRIDGE DEBUG] Evento:', eventName, JSON.stringify(data).slice(0, 300));
  });

  function extractAvatarUrl(user) {
    if (!user) return '';
    const avatarSources = [
      user.avatarThumb,
      user.avatarMedium,
      user.avatarLarge,
      user.profilePictureUrl
    ];
    for (const source of avatarSources) {
      if (!source) continue;
      if (source.urlList && Array.isArray(source.urlList) && source.urlList.length > 0) {
        return source.urlList[0];
      }
      if (typeof source === 'string' && source.startsWith('http')) {
        return source;
      }
      if (source.url) return source.url;
      if (source.uri) return source.uri;
    }
    return '';
  }

  tiktokClient.on('chat', (data) => {
    console.log('[BRIDGE] Chat data completo:', JSON.stringify(data, null, 2));
    const user = data.user || data.sender || data.profile || data.data || data;
    const nickname = user.uniqueId || user.nickname || user.unique_id || user.userName || user.name || user.displayId || 'Anonimo';
    const comment = data.text || data.comment || data.content || user.comment || '';
    const avatar = extractAvatarUrl(user);
    const userId = user.userId || user.id || user.user_id || user.idStr || data.userId || '';
    console.log('[BRIDGE] Enviando:', { type: 'comment', nickname, comment, avatar: avatar ? 'OK' : 'VAZIO' });
    broadcast({ type: 'comment', nickname, comment, avatar, userId });
  });
});