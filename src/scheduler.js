const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { getYesterdayStats, getAllEnabledGuilds, getGuildConfig, storeTotalMembers } = require('./database');

// Store scheduled tasks by guild
const scheduledTasks = new Map();
const midnightTasks = new Map();

/**
 * Send report to Slack via webhook
 */
async function sendSlackReport(webhookUrl, stats, totalMembers, timezone, guildName) {
    try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: timezone
        });

        // Get timezone abbreviation nicely
        const tzAbbr = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'short'
        }).formatToParts(now).find(part => part.type === 'timeZoneName').value;

        const date = `${dateStr} (${tzAbbr})`;

        const joins = stats?.joins || 0;
        const leaves = stats?.leaves || 0;
        const netChange = joins - leaves;
        const netEmoji = netChange > 0 ? '📈' : netChange < 0 ? '📉' : '➖';
        const netDisplay = netChange > 0 ? `+${netChange}` : netChange.toString();
        const serverName = guildName || 'Server';

        const slackMessage = {
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: `📊 ${serverName}: Daily Join Report`,
                        emoji: true
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: `*${date}*`
                        }
                    ]
                },
                {
                    type: "divider"
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `🟢 *Joined:* ${joins}\n🔴 *Left:* ${leaves}\n${netEmoji} *Net:* ${netDisplay}\n👥 *Total:* ${totalMembers || 'N/A'}`
                    }
                }
            ]
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackMessage)
        });

        if (response.ok) {
            console.log('[Scheduler] Slack report sent successfully');
        } else {
            console.error('[Scheduler] Slack webhook error:', response.status, await response.text());
        }
    } catch (error) {
        console.error('[Scheduler] Error sending Slack report:', error);
    }
}


/**
 * Create the daily report embed
 */
function createDailyReportEmbed(stats, totalMembers, timezone) {
    const date = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone
    });

    const joins = stats?.joins || 0;
    const leaves = stats?.leaves || 0;
    const netChange = joins - leaves;
    const netEmoji = netChange > 0 ? '📈' : netChange < 0 ? '📉' : '➖';
    const netDisplay = netChange > 0 ? `+${netChange}` : netChange.toString();

    const embed = new EmbedBuilder()
        .setTitle('📊 Daily Join Report')
        .setDescription(`**${date}**`)
        .setColor(netChange > 0 ? 0x00ff00 : netChange < 0 ? 0xff0000 : 0x808080)
        .addFields(
            { name: '✅ Joined', value: joins.toString(), inline: true },
            { name: '❌ Left', value: leaves.toString(), inline: true },
            { name: `${netEmoji} Net Change`, value: netDisplay, inline: true }
        )
        .setTimestamp();

    if (totalMembers !== null) {
        embed.addFields({ name: '👥 Total Members', value: totalMembers.toString(), inline: false });
    }

    return embed;
}

/**
 * Send the daily report for a specific guild
 */
async function sendDailyReportForGuild(client, guildId) {
    try {
        const config = getGuildConfig(guildId);
        if (!config || !config.report_channel_id) {
            console.error(`[Scheduler] No config for guild ${guildId}`);
            return;
        }

        const channel = await client.channels.fetch(config.report_channel_id);
        if (!channel) {
            console.error(`[Scheduler] Could not find channel for guild ${guildId}`);
            return;
        }

        // Get yesterday's stats (includes stored total_members from midnight snapshot)
        let stats = getYesterdayStats(guildId);
        if (!stats) {
            stats = { joins: 0, leaves: 0, net: 0, total_members: null };
        }

        // Use the stored total_members from yesterday's midnight snapshot
        // Fall back to live count if no snapshot exists
        let totalMembers = stats.total_members;
        let guildName = 'Server';
        try {
            const guild = await client.guilds.fetch(guildId);
            guildName = guild.name;
            // If no stored snapshot, use live count as fallback
            if (totalMembers === null) {
                totalMembers = guild.memberCount;
                console.log(`[Scheduler] No midnight snapshot for ${guildId}, using live count`);
            }
        } catch (e) {
            console.error(`[Scheduler] Could not fetch guild ${guildId}:`, e.message);
        }

        const embed = createDailyReportEmbed(stats, totalMembers, config.timezone || 'UTC');
        await channel.send({ embeds: [embed] });

        console.log(`[Scheduler] Report sent for guild ${guildId} - Joins: ${stats.joins}, Leaves: ${stats.leaves}`);

        // Send to Slack if configured
        if (config.slack_webhook_url) {
            await sendSlackReport(config.slack_webhook_url, stats, totalMembers, config.timezone || 'UTC', guildName);
        }
    } catch (error) {
        console.error(`[Scheduler] Error sending report for guild ${guildId}:`, error);
    }
}

/**
 * Schedule daily report for a specific guild
 */
function scheduleGuildReport(client, guildId, reportTime, timezone) {
    // Stop existing task for this guild
    if (scheduledTasks.has(guildId)) {
        scheduledTasks.get(guildId).stop();
    }

    const [hours, minutes] = reportTime.split(':').map(Number);
    const cronExpression = `${minutes} ${hours} * * *`;

    console.log(`[Scheduler] Scheduling for guild ${guildId} at ${reportTime} (${timezone})`);

    const task = cron.schedule(cronExpression, () => {
        console.log(`[Scheduler] Running report for guild ${guildId}...`);
        sendDailyReportForGuild(client, guildId);
    }, {
        timezone: timezone
    });

    scheduledTasks.set(guildId, task);
}

/**
 * Start schedulers for all configured guilds
 */
function startAllSchedulers(client) {
    const guilds = getAllEnabledGuilds();

    console.log(`[Scheduler] Starting schedulers for ${guilds.length} guild(s)...`);

    for (const config of guilds) {
        scheduleGuildReport(
            client,
            config.guild_id,
            config.report_time || '10:00',
            config.timezone || 'UTC'
        );
    }

    console.log('[Scheduler] All schedulers started');
}

/**
 * Capture midnight snapshot of member count for a guild
 */
async function captureMidnightSnapshot(client, guildId) {
    try {
        const guild = await client.guilds.fetch(guildId);
        const memberCount = guild.memberCount;
        storeTotalMembers(guildId, memberCount);
        console.log(`[Scheduler] Midnight snapshot for ${guild.name}: ${memberCount} members`);
    } catch (error) {
        console.error(`[Scheduler] Error capturing snapshot for ${guildId}:`, error);
    }
}

/**
 * Schedule midnight snapshot for a guild
 */
function scheduleMidnightSnapshot(client, guildId, timezone) {
    // Stop existing midnight task for this guild
    if (midnightTasks.has(guildId)) {
        midnightTasks.get(guildId).stop();
    }

    // Run at 23:59 (just before midnight) in the guild's timezone
    const cronExpression = '59 23 * * *';

    console.log(`[Scheduler] Scheduling midnight snapshot for guild ${guildId} (${timezone})`);

    const task = cron.schedule(cronExpression, () => {
        console.log(`[Scheduler] Running midnight snapshot for guild ${guildId}...`);
        captureMidnightSnapshot(client, guildId);
    }, {
        timezone: timezone
    });

    midnightTasks.set(guildId, task);
}

/**
 * Start midnight snapshot schedulers for all guilds
 */
function startMidnightSnapshots(client) {
    const guilds = getAllEnabledGuilds();

    console.log(`[Scheduler] Starting midnight snapshots for ${guilds.length} guild(s)...`);

    for (const config of guilds) {
        scheduleMidnightSnapshot(
            client,
            config.guild_id,
            config.timezone || 'UTC'
        );
    }

    console.log('[Scheduler] All midnight snapshots scheduled');
}

/**
 * Stop scheduler for a specific guild
 */
function stopGuildScheduler(guildId) {
    if (scheduledTasks.has(guildId)) {
        scheduledTasks.get(guildId).stop();
        scheduledTasks.delete(guildId);
        console.log(`[Scheduler] Stopped scheduler for guild ${guildId}`);
    }
}

/**
 * Stop all schedulers
 */
function stopAllSchedulers() {
    for (const [guildId, task] of scheduledTasks) {
        task.stop();
    }
    scheduledTasks.clear();
    for (const [guildId, task] of midnightTasks) {
        task.stop();
    }
    midnightTasks.clear();
    console.log('[Scheduler] All schedulers stopped');
}

/**
 * Refresh scheduler for a guild (call after config update)
 */
function refreshGuildScheduler(client, guildId) {
    const config = getGuildConfig(guildId);

    if (!config || !config.enabled || !config.report_channel_id) {
        stopGuildScheduler(guildId);
        return;
    }

    scheduleGuildReport(
        client,
        guildId,
        config.report_time || '10:00',
        config.timezone || 'UTC'
    );
}

module.exports = {
    startAllSchedulers,
    stopAllSchedulers,
    scheduleGuildReport,
    stopGuildScheduler,
    refreshGuildScheduler,
    sendDailyReportForGuild,
    createDailyReportEmbed,
    startMidnightSnapshots,
    scheduleMidnightSnapshot,
    captureMidnightSnapshot
};
