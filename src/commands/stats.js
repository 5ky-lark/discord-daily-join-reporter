const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTodayStats, getStatsRange, getDailyBreakdown, getYesterdayStats, getGuildConfig } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View member join/leave statistics')
        .addStringOption(option =>
            option.setName('period')
                .setDescription('Time period to view')
                .setRequired(false)
                .addChoices(
                    { name: 'Today', value: 'today' },
                    { name: 'Yesterday', value: 'yesterday' },
                    { name: 'Last 7 Days', value: 'week' },
                    { name: 'Last 30 Days', value: 'month' }
                )
        ),

    async execute(interaction) {
        const period = interaction.options.getString('period') || 'today';
        const guildId = interaction.guild.id;

        const config = getGuildConfig(guildId);
        const timezone = config?.timezone || 'UTC';

        let embed;

        switch (period) {
            case 'today': {
                const stats = getTodayStats(guildId);
                const netChange = stats.joins - stats.leaves;
                const netEmoji = netChange > 0 ? '📈' : netChange < 0 ? '📉' : '➖';
                const netDisplay = netChange > 0 ? `+${netChange}` : netChange.toString();

                embed = new EmbedBuilder()
                    .setTitle('📊 Today\'s Stats')
                    .setColor(netChange > 0 ? 0x00ff00 : netChange < 0 ? 0xff0000 : 0x808080)
                    .addFields(
                        { name: '✅ Joined', value: stats.joins.toString(), inline: true },
                        { name: '❌ Left', value: stats.leaves.toString(), inline: true },
                        { name: `${netEmoji} Net`, value: netDisplay, inline: true }
                    )
                    .setFooter({ text: `Timezone: ${timezone}` })
                    .setTimestamp();
                break;
            }

            case 'yesterday': {
                let stats = getYesterdayStats(guildId);

                if (!stats) {
                    stats = { joins: 0, leaves: 0 };
                }

                const netChange = stats.joins - stats.leaves;
                const netEmoji = netChange > 0 ? '📈' : netChange < 0 ? '📉' : '➖';
                const netDisplay = netChange > 0 ? `+${netChange}` : netChange.toString();

                embed = new EmbedBuilder()
                    .setTitle('📊 Yesterday\'s Stats')
                    .setColor(netChange > 0 ? 0x00ff00 : netChange < 0 ? 0xff0000 : 0x808080)
                    .addFields(
                        { name: '✅ Joined', value: stats.joins.toString(), inline: true },
                        { name: '❌ Left', value: stats.leaves.toString(), inline: true },
                        { name: `${netEmoji} Net`, value: netDisplay, inline: true }
                    )
                    .setFooter({ text: `Timezone: ${timezone}` })
                    .setTimestamp();
                break;
            }

            case 'week': {
                const stats = getStatsRange(guildId, 7);
                const breakdown = getDailyBreakdown(guildId, 7);

                const netChange = (stats.total_joins || 0) - (stats.total_leaves || 0);
                const netEmoji = netChange > 0 ? '📈' : netChange < 0 ? '📉' : '➖';
                const netDisplay = netChange > 0 ? `+${netChange}` : netChange.toString();

                // Create breakdown text
                let breakdownText = '';
                for (const day of breakdown.slice(0, 7)) {
                    const dayNet = day.joins - day.leaves;
                    const dayNetDisplay = dayNet > 0 ? `+${dayNet}` : dayNet.toString();
                    breakdownText += `**${day.date}**: ${day.joins} joined, ${day.leaves} left (${dayNetDisplay})\n`;
                }

                if (!breakdownText) breakdownText = 'No data available';

                embed = new EmbedBuilder()
                    .setTitle('📊 Last 7 Days')
                    .setColor(netChange > 0 ? 0x00ff00 : netChange < 0 ? 0xff0000 : 0x808080)
                    .addFields(
                        { name: '✅ Total Joined', value: (stats.total_joins || 0).toString(), inline: true },
                        { name: '❌ Total Left', value: (stats.total_leaves || 0).toString(), inline: true },
                        { name: `${netEmoji} Net Change`, value: netDisplay, inline: true },
                        { name: '📅 Daily Breakdown', value: breakdownText || 'No data', inline: false }
                    )
                    .setFooter({ text: `Timezone: ${timezone}` })
                    .setTimestamp();
                break;
            }

            case 'month': {
                const stats = getStatsRange(guildId, 30);

                const netChange = (stats.total_joins || 0) - (stats.total_leaves || 0);
                const netEmoji = netChange > 0 ? '📈' : netChange < 0 ? '📉' : '➖';
                const netDisplay = netChange > 0 ? `+${netChange}` : netChange.toString();

                const avgJoins = stats.days_with_data > 0 ?
                    ((stats.total_joins || 0) / stats.days_with_data).toFixed(1) : '0';
                const avgLeaves = stats.days_with_data > 0 ?
                    ((stats.total_leaves || 0) / stats.days_with_data).toFixed(1) : '0';

                embed = new EmbedBuilder()
                    .setTitle('📊 Last 30 Days')
                    .setColor(netChange > 0 ? 0x00ff00 : netChange < 0 ? 0xff0000 : 0x808080)
                    .addFields(
                        { name: '✅ Total Joined', value: (stats.total_joins || 0).toString(), inline: true },
                        { name: '❌ Total Left', value: (stats.total_leaves || 0).toString(), inline: true },
                        { name: `${netEmoji} Net Change`, value: netDisplay, inline: true },
                        { name: '📈 Avg Joins/Day', value: avgJoins, inline: true },
                        { name: '📉 Avg Leaves/Day', value: avgLeaves, inline: true },
                        { name: '📅 Days Tracked', value: (stats.days_with_data || 0).toString(), inline: true }
                    )
                    .setFooter({ text: `Timezone: ${timezone}` })
                    .setTimestamp();
                break;
            }
        }

        await interaction.reply({ embeds: [embed] });
    }
};
