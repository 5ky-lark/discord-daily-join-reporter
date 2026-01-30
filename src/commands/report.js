const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendDailyReportForGuild } = require('../scheduler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Manually trigger the daily report for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            await sendDailyReportForGuild(interaction.client, interaction.guild.id);
            await interaction.editReply({
                content: '✅ Daily report has been sent to the configured channel!'
            });
        } catch (error) {
            console.error('[Report] Error sending manual report:', error);
            await interaction.editReply({
                content: '❌ Failed to send report. Make sure you have configured a report channel with `/setup channel`.'
            });
        }
    }
};
