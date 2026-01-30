# Discord Join Tracker Bot

A Discord bot that tracks member joins/leaves and sends daily reports. Works across multiple servers with per-server configuration.

## Features

- 📊 **Daily Reports** — Automated reports at a configurable time per server
- 📈 **Statistics** — View today, yesterday, week, or month stats  
- 🌍 **Multi-Server** — Works in multiple servers with individual settings
- ⚙️ **Slash Command Config** — Configure everything via `/setup`
- 💾 **Persistent Storage** — SQLite database for historical data
- 🚀 **Railway Ready** — Easy deployment to Railway

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to **Bot** section and click "Reset Token" to get your token
4. Enable these **Privileged Gateway Intents**:
   - ✅ Server Members Intent (required for tracking joins/leaves)
5. Copy your **Bot Token**

### 2. Invite the Bot

1. Go to **OAuth2** → **URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select permissions:
   - View Channels
   - Send Messages
   - Embed Links
4. Copy the URL and open it to invite the bot to your server(s)

### 3. Install & Run

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and add your DISCORD_TOKEN

# Deploy slash commands (run once)
npm run deploy-commands

# Start the bot
npm start
```

### 4. Configure via Discord

Once the bot is running, use these commands in your server:

```
/setup channel #your-channel   → Set where reports are sent
/setup time 10:00              → Set daily report time (24h format)
/setup timezone                → Set your timezone
/setup view                    → View current settings
```

## Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/stats` | View join/leave statistics | Everyone |
| `/stats today` | Today's stats | Everyone |
| `/stats yesterday` | Yesterday's stats | Everyone |
| `/stats week` | Last 7 days | Everyone |
| `/stats month` | Last 30 days | Everyone |
| `/setup channel` | Set report channel | Admin |
| `/setup time` | Set report time | Admin |
| `/setup timezone` | Set timezone | Admin |
| `/setup enable` | Enable daily reports | Admin |
| `/setup disable` | Disable daily reports | Admin |
| `/setup view` | View configuration | Admin |
| `/report` | Manually trigger report | Admin |

## Railway Deployment

1. Push your code to GitHub.
2. Create a new project in Railway and connect your repo.
3. Add environment variable: `DISCORD_TOKEN`.

### 💾 Persistence (Railway Volumes)

By default, Railway's filesystem is ephemeral (wiped on redeploy). To keep your settings and stats:

1. In your Railway project, click **New** → **Volume**.
2. Set the **Mount Path** to `/data`.
3. Go to your bot's **Variables** and add:
   - `DATABASE_PATH` = `/data/tracker.db`

Railway will now store your database in the persistent volume.

## Daily Report Example

```
📊 Daily Join Report — Friday, January 30, 2026

✅ Joined: 15
❌ Left: 3
📈 Net Change: +12

👥 Total Members: 1,247
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Your bot token from Discord Developer Portal |
| `DATABASE_PATH` | ❌ | Custom path for SQLite database (default: `./data/tracker.db`) |

## File Structure

```
join-tracker/
├── src/
│   ├── index.js              # Bot entry point
│   ├── database.js           # SQLite database (multi-server)
│   ├── scheduler.js          # Daily report scheduler
│   ├── deploy-commands.js    # Command deployment script
│   ├── events/
│   │   ├── guildMemberAdd.js
│   │   └── guildMemberRemove.js
│   └── commands/
│       ├── stats.js
│       ├── setup.js
│       └── report.js
├── data/
│   └── tracker.db            # SQLite database (auto-created)
├── .env
├── .env.example
├── package.json
├── Procfile
└── README.md
```

## License

MIT
