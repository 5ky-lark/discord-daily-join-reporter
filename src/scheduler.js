const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { getYesterdayStats, getAllEnabledGuilds, getGuildConfig } = require('./database');

// Store scheduled tasks by guild
const scheduledTasks = new Map();

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

        // Get yesterday's stats
        let stats = getYesterdayStats(guildId);
        if (!stats) {
            stats = { joins: 0, leaves: 0, net: 0 };
        }

        // Get current member count
        let totalMembers = null;
        try {
            const guild = await client.guilds.fetch(guildId);
            totalMembers = guild.memberCount;
        } catch (e) {
            console.error(`[Scheduler] Could not fetch guild ${guildId}:`, e.message);
        }

        const embed = createDailyReportEmbed(stats, totalMembers, config.timezone || 'UTC');
        await channel.send({ embeds: [embed] });

        console.log(`[Scheduler] Report sent for guild ${guildId} - Joins: ${stats.joins}, Leaves: ${stats.leaves}`);
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
    createDailyReportEmbed
};
