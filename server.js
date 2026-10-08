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
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'truecrimevideosreal';

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

const tiktokClient = new TikTokLiveConnection(TIKTOK_USERNAME, {
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
