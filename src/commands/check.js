const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTodayStats, getGuildConfig } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check')
        .setDescription('Quickly check today\'s join/leave statistics'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const stats = getTodayStats(guildId);
        const config = getGuildConfig(guildId);
        const timezone = config?.timezone || 'UTC';

        const netChange = stats.joins - stats.leaves;
        const netEmoji = netChange > 0 ? '📈' : netChange < 0 ? '📉' : '➖';
        const netDisplay = netChange > 0 ? `+${netChange}` : netChange.toString();

        const totalMembers = interaction.guild.memberCount;

        const embed = new EmbedBuilder()
            .setTitle('📊 Current Stats (Today)')
            .setColor(netChange > 0 ? 0x00ff00 : netChange < 0 ? 0xff0000 : 0x808080)
            .addFields(
                { name: '✅ Joined', value: stats.joins.toString(), inline: true },
                { name: '❌ Left', value: stats.leaves.toString(), inline: true },
                { name: `${netEmoji} Net Change`, value: netDisplay, inline: true },
                { name: '👥 Total Members', value: totalMembers.toString(), inline: false }
            )
            .setFooter({ text: `Timezone: ${timezone}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Send to Slack if configured
        if (config?.slack_webhook_url) {
            const date = new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: timezone
            });

            const slackMessage = {
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: "📊 Current Stats (Today)",
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
                        fields: [
                            { type: "mrkdwn", text: `✅ Joined: *${stats.joins}*` },
                            { type: "mrkdwn", text: `❌ Left: *${stats.leaves}*` },
                            { type: "mrkdwn", text: `${netEmoji} Net Change: *${netDisplay}*` },
                            { type: "mrkdwn", text: `👥 Total: *${totalMembers}*` }
                        ]
                    }
                ]
            };

            try {
                await fetch(config.slack_webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(slackMessage)
                });
            } catch (err) {
                console.error('[Check] Slack webhook error:', err);
            }
        }
    }
};
