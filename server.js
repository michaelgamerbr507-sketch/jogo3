import { TikTokLiveConnection } from 'tiktok-live-connector';
import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

let tiktokClient = null;
const clients = new Set();

function broadcast(event) {
  const msg = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
  console.log('[BRIDGE] Broadcast:', event.type, event.nickname || '');
}

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[BRIDGE] Cliente conectado. Total:', clients.size);

  ws.on('close', () => {
    clients.delete(ws);
    console.log('[BRIDGE] Cliente desconectado. Total:', clients.size);
  });

  ws.on('error', (err) => {
    console.error('[BRIDGE] Erro no cliente:', err.message);
    clients.delete(ws);
  });
});

async function connectTikTok(username) {
  if (tiktokClient) {
    try { await tiktokClient.disconnect(); } catch {}
    tiktokClient = null;
  }

  const cleanUsername = username.replace('@', '').trim();
  if (!cleanUsername) throw new Error('Username vazio');

  console.log('[BRIDGE] Conectando ao TikTok:', cleanUsername);
  tiktokClient = new TikTokLiveConnection(cleanUsername, {
    fetchRoomInfoOnConnect: false,
    processInitialData: false
  });

  tiktokClient.on('connected', () => {
    console.log('[BRIDGE] Conectado ao TikTok Live:', cleanUsername);
    broadcast({ type: 'bridge_status', status: 'connected', username: cleanUsername });
  });

  tiktokClient.on('disconnected', (reason) => {
    console.log('[BRIDGE] Desconectado:', reason);
    broadcast({ type: 'bridge_status', status: 'disconnected', reason });
  });

  tiktokClient.on('error', (err) => {
    console.error('[BRIDGE] Erro TikTok:', err.message);
    broadcast({ type: 'bridge_status', status: 'error', error: err.message });
  });

tiktokClient.on('chat', (data) => {
  console.log('[BRIDGE] Chat data completo:', JSON.stringify(data, null, 2));

  // TikTok envia dados aninhados - tenta mÃºltiplos caminhos
  const user = data.user || data.sender || data.profile || data.data || data;

  const nickname = user.uniqueId || user.nickname || user.unique_id || user.userName || user.name || 'Anonimo';
  const comment = data.text || data.comment || data.content || user.comment || '';

  // Avatar: TikTok usa avatarThumb, avatarMedium, avatarLarge, avatarUrl, profilePictureUrl
  const avatar = user.avatarThumb
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
  tiktokClient.on('gift', (data) => {
    broadcast({
      type: 'gift',
      nickname: data.uniqueId || data.nickname || 'Anonimo',
      giftName: data.giftName || data.extendedGiftInfo?.name || 'Presente',
      giftId: data.giftId,
      count: data.repeatCount || data.comboCount || 1,
      diamondCount: data.diamondCount || 0,
      avatar: data.profilePictureUrl || ''
    });
  });

  tiktokClient.on('like', (data) => {
    broadcast({
      type: 'like',
      nickname: data.uniqueId || data.nickname || 'Anonimo',
      count: data.likeCount || 1,
      avatar: data.profilePictureUrl || ''
    });
  });

  tiktokClient.on('member', (data) => {
    broadcast({
      type: 'follow',
      nickname: data.uniqueId || data.nickname || 'Anonimo',
      avatar: data.profilePictureUrl || ''
    });
  });

  tiktokClient.on('share', (data) => {
    broadcast({
      type: 'share',
      nickname: data.uniqueId || data.nickname || 'Anonimo',
      avatar: data.profilePictureUrl || ''
    });
  });

  await tiktokClient.connect();
}

app.post('/connect', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username obrigatorio' });

  try {
    await connectTikTok(username);
    res.json({ success: true, message: 'Conectado a @' + username.replace('@', '') });
  } catch (err) {
    console.error('[BRIDGE] Falha ao conectar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/disconnect', async (req, res) => {
  if (tiktokClient) {
    await tiktokClient.disconnect();
    tiktokClient = null;
  }
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  let connected = false;
  if (tiktokClient) {
    try { connected = tiktokClient.state === 'CONNECTED' || tiktokClient._connectState === 'CONNECTED'; } catch {}
  }
  res.json({
    ok: true,
    tiktokConnected: connected,
    clients: clients.size,
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('[BRIDGE] Servidor rodando na porta ' + PORT);
  console.log('[BRIDGE] Health: http://localhost:' + PORT + '/health');
  console.log('[BRIDGE] WebSocket: ws://localhost:' + PORT + '/');
});
