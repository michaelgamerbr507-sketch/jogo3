# TikTok Live Bridge para GitHub Pages

Bridge WebSocket que conecta o TikTok Live ao seu jogo hospedado no GitHub Pages.

## Deploy no Render.com (Grátis)

1. **Faça push deste repositório pro GitHub** (repo público ou privado)
2. Acesse [render.com](https://render.com) → New → Web Service
3. Conecte o repo → **Build Command:** `npm install` → **Start Command:** `npm start`
4. **Free tier** → Create Web Service
5. Anote a URL: `https://seu-bridge.onrender.com`

## Configuração no Jogo

Edite `game.js` no seu repo do jogo:

```javascript
const BRIDGE_CONFIG = {
  url: 'wss://SEU_BRIDGE.onrender.com',   // Sua URL do Render (wss://)
  tiktokUsername: 'usuario_do_streamer'    // Sem @
};
```

## Como funciona

```
GitHub Pages (jogo) ←→ WebSocket (WSS) ←→ Render (bridge) ←→ TikTok Live
```

Eventos suportados: `comment`, `gift`, `like`, `follow`, `share`

## Endpoints

- `GET /health` — health check
- `POST /connect` — `{ "username": "streamer" }` conecta no TikTok
- `POST /disconnect` — desconecta
- WebSocket em `/` — recebe eventos em tempo real

## Variáveis de ambiente (opcional)

- `PORT` — porta do servidor (Render define automaticamente)
- `NODE_VERSION` — 20 (recomendado no render.yaml)

## Limitações do Free Tier

- Dorme após 15 min sem request → o jogo reconecta automaticamente
- 750h/mês grátis
- SSL/WSS incluído (obrigatório pro GitHub Pages)