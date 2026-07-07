# Wanted AI Studio

An AI-powered streaming operating system that automates your live stream with 15 specialized AI agents. Manage OBS, moderate chat, generate clips, publish to YouTube/TikTok, analyze performance, and more — all from a single desktop app.

## Features

- **15 AI Agents** running in parallel during your stream
- **Real-time dashboard** with live metrics, agent status, and chat monitoring
- **Automatic clip detection** and publishing pipeline (Twitch → YouTube Shorts / TikTok)
- **Multi-platform support**: Twitch, YouTube, TikTok, Discord
- **Desktop app** (Windows/macOS/Linux) with bundled server — one click to launch
- **Voice synthesis** for automated TTS announcements
- **Analytics** with per-session breakdowns and trend tracking

## AI Agents

| Agent | Role |
|---|---|
| CEO | Orchestrates all other agents and makes high-level decisions |
| Producer | Manages stream layout and scene switching in OBS |
| OBS | Controls OBS WebSocket — scenes, sources, transitions |
| Moderator | Monitors chat, auto-bans, enforces rules |
| Analytics | Captures viewer stats and stream metrics in real time |
| Clip | Detects highlight moments and queues clips for processing |
| YouTube | Uploads processed clips and VODs to YouTube |
| Shorts | Formats clips as YouTube Shorts with auto-generated titles |
| TikTok | Publishes short-form clips to TikTok |
| Thumbnail | Generates thumbnails for uploaded content |
| Sponsor | Tracks and announces sponsorship segments |
| Community | Engages with chat, runs polls and giveaways |
| Trend | Monitors trending topics to keep content relevant |
| Memory | Stores and recalls context across stream sessions |
| Revenue | Tracks donations, subscriptions, and revenue events |

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Backend**: Fastify, Prisma, PostgreSQL, WebSocket
- **Frontend**: React, TanStack Query, Zustand, Tailwind CSS, React Router
- **Desktop**: Electron + electron-builder
- **AI**: OpenAI API (GPT-4, TTS, Whisper)
- **Streaming**: OBS WebSocket v5, Twitch API, YouTube Data API v3, TikTok API

## Project Structure

```
wanted-ai-studio/
├── apps/
│   ├── dashboard/     # React web dashboard
│   ├── server/        # Fastify API server
│   └── desktop/       # Electron desktop app
└── packages/
    ├── agent-core/    # AI agent framework + all 15 agents
    ├── shared/        # Types, events, utilities
    ├── database/      # Prisma schema + client
    ├── integrations/  # Twitch, YouTube, TikTok, Discord clients
    ├── obs/           # OBS WebSocket client
    ├── clips/         # Clip detection + FFmpeg processing
    ├── analytics/     # Session analysis
    ├── memory/        # Vector store + conversation history
    ├── voice/         # TTS + Whisper transcription
    └── skills/        # Shared agent skills (SEO, prompts, notifications)
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- OBS Studio with WebSocket plugin enabled
- FFmpeg (for clip processing)

### Installation

```bash
git clone https://github.com/jvega48/wanted-ai-studio.git
cd wanted-ai-studio
pnpm install
```

### Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Required credentials:
- **Twitch**: Client ID, Client Secret, Access Token, Channel name
- **YouTube**: OAuth Client ID + Secret, Refresh Token
- **TikTok**: Client Key + Secret
- **OpenAI**: API Key
- **OBS**: Host, port (default 4455), password
- **Discord**: Webhook URLs (optional)

You can also configure credentials through the Settings page in the dashboard after startup.

### Database Setup

```bash
pnpm --filter @wanted/database db:push
```

### Development

Start all services in parallel:

```bash
pnpm dev
```

This starts:
- Dashboard at `http://localhost:5173`
- API server at `http://localhost:3001`
- Electron app (connects to the dev server)

### Build Desktop App

Generate app icons first (requires `sharp`):

```bash
pnpm --filter @wanted/desktop icons
```

Then build the installer:

```bash
pnpm --filter @wanted/desktop build
```

Output is in `apps/desktop/release/`.

## Dashboard Pages

| Page | Description |
|---|---|
| Dashboard | Overview — live stats, agent status, recent sessions |
| Agents | Start/stop/restart individual agents, view health metrics |
| Stream | Stream control, OBS scene switcher, live chat panel |
| Clips | Clip queue — approve, reject, download, publish |
| Analytics | Per-session metrics, viewer timeline, trend charts |
| Content | Upload queue with platform filter and retry controls |
| Settings | API credentials, OBS config, OpenAI settings |

## License

MIT
