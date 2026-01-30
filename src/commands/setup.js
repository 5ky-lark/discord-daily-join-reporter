const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { setGuildConfig, getGuildConfig } = require('../database');
const { refreshGuildScheduler } = require('../scheduler');

// Common timezone options
const TIMEZONES = [
    { name: 'UTC', value: 'UTC' },
    { name: 'Singapore (UTC+8)', value: 'Asia/Singapore' },
    { name: 'Manila (UTC+8)', value: 'Asia/Manila' },
    { name: 'Tokyo (UTC+9)', value: 'Asia/Tokyo' },
    { name: 'Sydney (UTC+11)', value: 'Australia/Sydney' },
    { name: 'London (UTC+0/+1)', value: 'Europe/London' },
    { name: 'New York (UTC-5/-4)', value: 'America/New_York' },
    { name: 'Los Angeles (UTC-8/-7)', value: 'America/Los_Angeles' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure the join tracker for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Set the channel for daily reports')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to send daily reports')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('time')
                .setDescription('Set the time for daily reports')
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('Time in 24-hour format (e.g., 10:00, 09:30)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('timezone')
                .setDescription('Set the timezone for this server')
                .addStringOption(option =>
                    option.setName('timezone')
                        .setDescription('Select your timezone')
                        .setRequired(true)
                        .addChoices(...TIMEZONES)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable daily reports')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable daily reports')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current configuration')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        switch (subcommand) {
            case 'channel': {
                const channel = interaction.options.getChannel('channel');

                setGuildConfig(guildId, { reportChannelId: channel.id });
                refreshGuildScheduler(interaction.client, guildId);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Report Channel Updated')
                    .setDescription(`Daily reports will be sent to ${channel}`)
                    .setColor(0x00ff00)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'time': {
                const timeStr = interaction.options.getString('time');

                // Validate time format
                const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
                if (!timeRegex.test(timeStr)) {
                    await interaction.reply({
                        content: '❌ Invalid time format. Use 24-hour format like `10:00` or `09:30`',
                        ephemeral: true
                    });
                    return;
                }

                // Normalize time to HH:MM format
                const [hours, minutes] = timeStr.split(':');
                const normalizedTime = `${hours.padStart(2, '0')}:${minutes}`;

                setGuildConfig(guildId, { reportTime: normalizedTime });
                refreshGuildScheduler(interaction.client, guildId);

                const config = getGuildConfig(guildId);
                const embed = new EmbedBuilder()
                    .setTitle('✅ Report Time Updated')
                    .setDescription(`Daily reports will be sent at **${normalizedTime}** (${config?.timezone || 'UTC'})`)
                    .setColor(0x00ff00)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'timezone': {
                const timezone = interaction.options.getString('timezone');

                setGuildConfig(guildId, { timezone: timezone });
                refreshGuildScheduler(interaction.client, guildId);

                const config = getGuildConfig(guildId);
                const embed = new EmbedBuilder()
                    .setTitle('✅ Timezone Updated')
                    .setDescription(`Timezone set to **${timezone}**\nReports scheduled for **${config?.report_time || '10:00'}**`)
                    .setColor(0x00ff00)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'enable': {
                setGuildConfig(guildId, { enabled: 1 });
                refreshGuildScheduler(interaction.client, guildId);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Daily Reports Enabled')
                    .setDescription('The bot will now send daily join reports.')
                    .setColor(0x00ff00)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'disable': {
                setGuildConfig(guildId, { enabled: 0 });
                refreshGuildScheduler(interaction.client, guildId);

                const embed = new EmbedBuilder()
                    .setTitle('⏸️ Daily Reports Disabled')
                    .setDescription('Daily reports have been paused. Use `/setup enable` to resume.')
                    .setColor(0xff9900)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'view': {
                const config = getGuildConfig(guildId);

                let channelMention = 'Not configured';
                if (config?.report_channel_id) {
                    channelMention = `<#${config.report_channel_id}>`;
                }

                const enabled = config?.enabled ? '✅ Enabled' : '❌ Disabled';

                const embed = new EmbedBuilder()
                    .setTitle('⚙️ Join Tracker Configuration')
                    .setColor(0x5865F2)
                    .addFields(
                        { name: '📢 Report Channel', value: channelMention, inline: true },
                        { name: '🕐 Report Time', value: config?.report_time || '10:00', inline: true },
                        { name: '🌍 Timezone', value: config?.timezone || 'UTC', inline: true },
                        { name: '📊 Status', value: enabled, inline: true }
                    )
                    .setFooter({ text: 'Use /setup commands to modify settings' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
                break;
            }
        }
    }
};
