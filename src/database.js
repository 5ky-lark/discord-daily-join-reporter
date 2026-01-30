const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'tracker.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables
db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
        guild_id TEXT PRIMARY KEY,
        report_channel_id TEXT,
        report_time TEXT DEFAULT '10:00',
        timezone TEXT DEFAULT 'UTC',
        enabled INTEGER DEFAULT 1,
        slack_webhook_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        date TEXT NOT NULL,
        joins INTEGER DEFAULT 0,
        leaves INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, date)
    );

    CREATE TABLE IF NOT EXISTS member_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT,
        event_type TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_daily_stats_guild_date ON daily_stats(guild_id, date);
    CREATE INDEX IF NOT EXISTS idx_member_events_guild ON member_events(guild_id);
    CREATE INDEX IF NOT EXISTS idx_member_events_timestamp ON member_events(timestamp);
`);

// Migration: Add slack_webhook_url column if it doesn't exist
try {
    db.exec(`ALTER TABLE guild_config ADD COLUMN slack_webhook_url TEXT`);
    console.log('[Database] Added slack_webhook_url column');
} catch (e) {
    // Column already exists, ignore error
}

// ==================== GUILD CONFIG ====================

/**
 * Get guild configuration
 */
function getGuildConfig(guildId) {
    const stmt = db.prepare(`SELECT * FROM guild_config WHERE guild_id = ?`);
    return stmt.get(guildId);
}

/**
 * Set or update guild configuration
 */
function setGuildConfig(guildId, config) {
    const existing = getGuildConfig(guildId);

    if (existing) {
        const stmt = db.prepare(`
            UPDATE guild_config 
            SET report_channel_id = COALESCE(?, report_channel_id),
                report_time = COALESCE(?, report_time),
                timezone = COALESCE(?, timezone),
                enabled = COALESCE(?, enabled),
                slack_webhook_url = COALESCE(?, slack_webhook_url),
                updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = ?
        `);
        stmt.run(
            config.reportChannelId ?? null,
            config.reportTime ?? null,
            config.timezone ?? null,
            config.enabled ?? null,
            config.slackWebhookUrl ?? null,
            guildId
        );
    } else {
        const stmt = db.prepare(`
            INSERT INTO guild_config (guild_id, report_channel_id, report_time, timezone, enabled, slack_webhook_url)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            guildId,
            config.reportChannelId || null,
            config.reportTime || '10:00',
            config.timezone || 'UTC',
            config.enabled ?? 1,
            config.slackWebhookUrl || null
        );
    }

    return getGuildConfig(guildId);
}

/**
 * Get all enabled guild configs (for scheduler)
 */
function getAllEnabledGuilds() {
    const stmt = db.prepare(`
        SELECT * FROM guild_config 
        WHERE enabled = 1 AND report_channel_id IS NOT NULL
    `);
    return stmt.all();
}

// ==================== STATS ====================

/**
 * Get today's date in YYYY-MM-DD format for a specific timezone
 */
function getDateForTimezone(timezone = 'UTC') {
    try {
        return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
    } catch {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' });
    }
}

/**
 * Ensure today's stats row exists for a guild
 */
function ensureTodayExists(guildId, timezone = 'UTC') {
    const today = getDateForTimezone(timezone);
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO daily_stats (guild_id, date, joins, leaves)
        VALUES (?, ?, 0, 0)
    `);
    stmt.run(guildId, today);
}

/**
 * Record a member join
 */
function recordJoin(guildId, userId, username) {
    const config = getGuildConfig(guildId);
    const timezone = config?.timezone || 'UTC';

    ensureTodayExists(guildId, timezone);
    const today = getDateForTimezone(timezone);

    // Update daily count
    const updateStmt = db.prepare(`
        UPDATE daily_stats SET joins = joins + 1 
        WHERE guild_id = ? AND date = ?
    `);
    updateStmt.run(guildId, today);

    // Log the event
    const insertStmt = db.prepare(`
        INSERT INTO member_events (guild_id, user_id, username, event_type)
        VALUES (?, ?, ?, 'join')
    `);
    insertStmt.run(guildId, userId, username);
}

/**
 * Record a member leave
 */
function recordLeave(guildId, userId, username) {
    const config = getGuildConfig(guildId);
    const timezone = config?.timezone || 'UTC';

    ensureTodayExists(guildId, timezone);
    const today = getDateForTimezone(timezone);

    // Update daily count
    const updateStmt = db.prepare(`
        UPDATE daily_stats SET leaves = leaves + 1 
        WHERE guild_id = ? AND date = ?
    `);
    updateStmt.run(guildId, today);

    // Log the event
    const insertStmt = db.prepare(`
        INSERT INTO member_events (guild_id, user_id, username, event_type)
        VALUES (?, ?, ?, 'leave')
    `);
    insertStmt.run(guildId, userId, username);
}

/**
 * Get today's stats for a guild
 */
function getTodayStats(guildId) {
    const config = getGuildConfig(guildId);
    const timezone = config?.timezone || 'UTC';

    ensureTodayExists(guildId, timezone);
    const today = getDateForTimezone(timezone);

    const stmt = db.prepare(`
        SELECT date, joins, leaves, (joins - leaves) as net
        FROM daily_stats WHERE guild_id = ? AND date = ?
    `);
    return stmt.get(guildId, today);
}

/**
 * Get stats for the last N days for a guild
 */
function getStatsRange(guildId, days) {
    const config = getGuildConfig(guildId);
    const timezone = config?.timezone || 'UTC';

    const endDate = getDateForTimezone(timezone);

    const startDateObj = new Date();
    startDateObj.setDate(startDateObj.getDate() - days + 1);
    const startDate = startDateObj.toLocaleDateString('en-CA', { timeZone: timezone });

    const stmt = db.prepare(`
        SELECT 
            SUM(joins) as total_joins,
            SUM(leaves) as total_leaves,
            SUM(joins - leaves) as net,
            COUNT(*) as days_with_data
        FROM daily_stats 
        WHERE guild_id = ? AND date >= ? AND date <= ?
    `);
    return stmt.get(guildId, startDate, endDate);
}

/**
 * Get daily breakdown for last N days for a guild
 */
function getDailyBreakdown(guildId, days) {
    const config = getGuildConfig(guildId);
    const timezone = config?.timezone || 'UTC';

    const endDate = getDateForTimezone(timezone);

    const startDateObj = new Date();
    startDateObj.setDate(startDateObj.getDate() - days + 1);
    const startDate = startDateObj.toLocaleDateString('en-CA', { timeZone: timezone });

    const stmt = db.prepare(`
        SELECT date, joins, leaves, (joins - leaves) as net
        FROM daily_stats 
        WHERE guild_id = ? AND date >= ? AND date <= ?
        ORDER BY date DESC
    `);
    return stmt.all(guildId, startDate, endDate);
}

/**
 * Get yesterday's stats for a guild
 */
function getYesterdayStats(guildId) {
    const config = getGuildConfig(guildId);
    const timezone = config?.timezone || 'UTC';

    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterday = yesterdayObj.toLocaleDateString('en-CA', { timeZone: timezone });

    const stmt = db.prepare(`
        SELECT date, joins, leaves, (joins - leaves) as net
        FROM daily_stats WHERE guild_id = ? AND date = ?
    `);
    return stmt.get(guildId, yesterday);
}

module.exports = {
    db,
    getGuildConfig,
    setGuildConfig,
    getAllEnabledGuilds,
    recordJoin,
    recordLeave,
    getTodayStats,
    getStatsRange,
    getDailyBreakdown,
    getYesterdayStats,
    getDateForTimezone
};
