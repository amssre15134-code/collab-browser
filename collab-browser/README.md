# 🌐 CollabBrowser

Real-time collaborative browser for 2 people — browse the same site together, video call, text chat, and stream your screen at **1080p 60fps**. Works across the internet with built-in TURN relay servers.

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🖥️ Shared Browsing | Both users navigate the same URL in sync |
| 📺 Screen/Tab Share | 1080p 60fps via WebRTC |
| 📹 Video Chat | Camera + mic, peer-to-peer |
| 💬 Text Chat | Real-time with history |
| 🌍 Works anywhere | TURN servers included for internet use |

---

## 🚀 Deploy Online FREE (Recommended for remote friends)

### Option A: Railway (easiest — 5 minutes)

1. Create a free account at **https://railway.app**
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Push this folder to a GitHub repo first (or use Railway CLI):
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```
4. Railway gives you a URL like `https://your-app.railway.app`
5. Share that URL with your friend — done! ✅

### Option B: Render (also free)

1. Push folder to GitHub
2. Go to **https://render.com** → New → Web Service
3. Connect your repo
4. Set: **Build command** = `npm install`, **Start command** = `node server.js`
5. Click Deploy → get your public URL

### Option C: Glitch (no GitHub needed — instant)

1. Go to **https://glitch.com/new**
2. Click **"Import from GitHub"** or drag-drop the files
3. It auto-runs — click **"Show → In a New Window"** for the live URL

---

## 🏠 Run Locally

```bash
npm install
npm start
# → http://localhost:3000
```

### Make it accessible from internet (quick test):
```bash
npm start
# In another terminal:
npx localtunnel --port 3000
# OR
npx ngrok http 3000
# Share the https://... URL with your friend
```

---

## 👥 How to Use

1. **You** open the app URL, enter your name → **Create New Room**
2. A **6-digit code** appears — send it to your friend via WhatsApp/text/etc.
3. **Friend** opens same URL, enters their name + your code → **Join Room**
4. Connected! 🎉

### Controls:
| Button | Action |
|--------|--------|
| 🎙️ | Mute/unmute mic |
| 📷 | Toggle camera |
| 🖥️ | Share screen/tab at 1080p 60fps |
| 🔗 | Copy room code |
| ⊞ PiP | Picture-in-Picture for remote video |
| URL bar | Navigate both browsers to same URL |

---

## 📁 File Structure

```
collab-browser/
├── server.js        ← Node.js + Socket.io backend
├── package.json
├── Procfile         ← For Railway/Render deployment
├── railway.json     ← Railway config
└── public/
    ├── index.html
    ├── style.css
    └── app.js       ← WebRTC + chat + TURN servers
```

---

## ⚠️ Notes

- **Some websites block iframes** (Google, YouTube, etc.) — use 🖥️ Screen Share for those
- **HTTPS required** for camera/screen share in Chrome/Firefox — Railway/Render give you HTTPS automatically
- **Max 2 users** per room
