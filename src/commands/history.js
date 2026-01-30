const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Analyze historical member joins based on join dates')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Fetch all members
            const guild = interaction.guild;
            await guild.members.fetch();

            const now = new Date();
            const members = guild.members.cache;

            // Calculate time boundaries
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(yesterdayStart.getDate() - 1);
            const weekStart = new Date(todayStart);
            weekStart.setDate(weekStart.getDate() - 7);
            const monthStart = new Date(todayStart);
            monthStart.setDate(monthStart.getDate() - 30);

            // Count joins by period
            let today = 0;
            let yesterday = 0;
            let thisWeek = 0;
            let thisMonth = 0;
            let older = 0;

            // For daily breakdown of last 7 days
            const dailyCounts = {};
            for (let i = 0; i < 7; i++) {
                const date = new Date(todayStart);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                dailyCounts[dateStr] = 0;
            }

            members.forEach(member => {
                if (member.user.bot) return; // Skip bots

                const joinedAt = member.joinedAt;
                if (!joinedAt) return;

                // Get date string for daily breakdown
                const joinDateStr = joinedAt.toISOString().split('T')[0];
                if (dailyCounts.hasOwnProperty(joinDateStr)) {
                    dailyCounts[joinDateStr]++;
                }

                // Count by period
                if (joinedAt >= todayStart) {
                    today++;
                } else if (joinedAt >= yesterdayStart) {
                    yesterday++;
                }

                if (joinedAt >= weekStart) {
                    thisWeek++;
                }

                if (joinedAt >= monthStart) {
                    thisMonth++;
                } else {
                    older++;
                }
            });

            // Create daily breakdown text
            let breakdownText = '';
            const sortedDates = Object.keys(dailyCounts).sort().reverse();
            for (const date of sortedDates) {
                const count = dailyCounts[date];
                const label = date === todayStart.toISOString().split('T')[0] ? '(Today)' :
                    date === yesterdayStart.toISOString().split('T')[0] ? '(Yesterday)' : '';
                breakdownText += `**${date}** ${label}: ${count} joined\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('📊 Historical Member Joins')
                .setDescription('Based on `joined_at` timestamps of current members\n*(Does not include members who left)*')
                .setColor(0x5865F2)
                .addFields(
                    { name: '📅 Today', value: today.toString(), inline: true },
                    { name: '📅 Yesterday', value: yesterday.toString(), inline: true },
                    { name: '📅 This Week', value: thisWeek.toString(), inline: true },
                    { name: '📅 Last 30 Days', value: thisMonth.toString(), inline: true },
                    { name: '📅 Older', value: older.toString(), inline: true },
                    { name: '👥 Total Members', value: members.filter(m => !m.user.bot).size.toString(), inline: true },
                    { name: '📈 Last 7 Days Breakdown', value: breakdownText || 'No data', inline: false }
                )
                .setFooter({ text: 'Note: Only shows members still in the server' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[History] Error:', error);
            await interaction.editReply({
                content: '❌ Failed to fetch member history. Make sure the bot has the SERVER MEMBERS INTENT enabled.'
            });
        }
    }
};
