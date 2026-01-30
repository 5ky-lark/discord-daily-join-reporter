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
    }
};
