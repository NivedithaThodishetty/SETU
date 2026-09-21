# SETU — MongoDB Database Integration Guide

SETU features cloud & local data persistence powered by **MongoDB** (via Mongoose ODM). It saves user accessibility settings, reading profiles, AI-generated mindmaps, summaries, and session logs.

---

## ⚡ Zero-Friction Local & Offline Mode (Graceful Fallback)
If `MONGODB_URI` is not set or the database is currently unreachable:
- SETU backend detects this automatically and logs the state cleanly.
- The web application seamlessly falls back to its deterministic, high-performance browser LocalStorage layer (`setu.maps.v1`, `setu.prefs.v1`).
- **Users and reviewers can run 100% of the application features without needing a running database.**

---

## 🚀 Setting Up MongoDB

You can use a local MongoDB server or a free cloud MongoDB Atlas cluster:

### Option A: Local MongoDB (Docker or Native)
Run with Docker:
```bash
docker run -d -p 27017:27017 --name setu-mongo mongo:latest
```
Or start your local MongoDB service:
```bash
# Default connection string:
MONGODB_URI=mongodb://127.0.0.1:27017/setu
```

### Option B: Cloud MongoDB Atlas
1. Sign in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free M0 cluster.
3. In **Database Access**, create a user with read/write permissions.
4. In **Network Access**, allow access from your IP (or `0.0.0.0/0` for production deployments).
5. Copy the connection string and set `MONGODB_URI`:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/setu?retryWrites=true&w=majority
```

---

## 🔧 Environment Configuration

Add the following to your root `.env` or `backend/.env`:

```env
# MongoDB Connection String
MONGODB_URI=mongodb://127.0.0.1:27017/setu

# AI Providers
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 📊 Database Collections & Schemas

| Collection | Model | Purpose | Key Fields |
|---|---|---|---|
| `mindmaps` | `MindMap` | Hierarchical mind map trees, topics, key facts, sources | `id`, `userId`, `title`, `topic`, `summary`, `root`, `keyFacts`, `sources`, `isLensHandoff` |
| `savedsummaries` | `SavedSummary` | Mode outputs (Simplify, Meet, Write, etc.) | `id`, `userId`, `title`, `content`, `summaryPoints`, `mode`, `resultData` |
| `usersettings` | `UserSettings` | Accessibility preferences, typeface, size, motion | `userId`, `profile`, `font`, `textSize`, `motion`, `onboardingDone` |
| `sessionlogs` | `SessionLog` | Audit records and user action tracking | `userId`, `action`, `details`, `timestamp` |
