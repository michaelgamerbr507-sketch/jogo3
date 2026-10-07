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
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'ilustramichael';

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

const tiktokClient = new TikTokLiveConnection({
  username: TIKTOK_USERNAME,
  processInitialData: true
});

console.log('[BRIDGE] Conectando ao TikTok:', TIKTOK_USERNAME);

tiktokClient.connect().then(() => {
  console.log('[BRIDGE] Conectado ao TikTok Live:', TIKTOK_USERNAME);
  broadcast({ type: 'bridge_status', connected: true });
}).catch(err => {
  console.error('[BRIDGE] Erro ao conectar:', err.message);
  broadcast({ type: 'bridge_status', connected: false, error: err.message });
});

tiktokClient.on('*', (eventName, data) => {
  console.log('[BRIDGE DEBUG] Evento:', eventName, JSON.stringify(data).slice(0, 300));
});

tiktokClient.on('chat', (data) => {
  console.log('[BRIDGE] Chat data completo:', JSON.stringify(data, null, 2));

  const user = data.user || data.sender || data.profile || data.data || data;

  const nickname = user.uniqueId || user.nickname || user.unique_id || user.userName || user.name || 'Anonimo';
  const comment = data.text || data.comment || data.content || user.comment || '';

  const rawAvatar = user.avatarThumb
    || user.avatarMedium
    || user.avatarLarge
    || user.avatarUrl
    || user.profilePictureUrl
    || user.avatar
    || user.profilePicture
    || (user.profile && user.profile.avatarThumb)
    || (user.profile && user.profile.avatarMedium)
    || (user.profile && user.profile.avatarUrl)
    || '';

  const avatar = typeof rawAvatar === 'string' ? rawAvatar
    : (rawAvatar?.url || rawAvatar?.uri || rawAvatar?.href || rawAvatar?.download_url || '');

  const userId = user.userId || user.id || user.user_id || data.userId || '';

  console.log('[BRIDGE] Enviando:', { type: 'comment', nickname, comment, avatar });

  broadcast({
    type: 'comment',
    nickname,
    comment,
    avatar,
    userId
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[BRIDGE] Servidor rodando na porta', PORT);
  console.log('[BRIDGE] Health: http://localhost:' + PORT + '/health');
  console.log('[BRIDGE] WebSocket: ws://localhost:' + PORT + '/');
});
