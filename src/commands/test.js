const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendDailyReportForGuild } = require('../scheduler');
const { getGuildConfig } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Send a test daily report to the configured channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const config = getGuildConfig(guildId);

        if (!config?.report_channel_id) {
            await interaction.reply({
                content: '❌ No report channel configured! Use `/setup channel #channel` first.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            await sendDailyReportForGuild(interaction.client, guildId);
            await interaction.editReply({
                content: `✅ Test report sent to <#${config.report_channel_id}>!`
            });
        } catch (error) {
            console.error('[Test] Error sending test report:', error);
            await interaction.editReply({
                content: '❌ Failed to send test report. Check the logs.'
            });
        }
    }
};
