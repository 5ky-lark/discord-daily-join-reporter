require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];

// Load all commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`[Deploy] Found command: /${command.data.name}`);
    }
}

// Deploy commands
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`[Deploy] Refreshing ${commands.length} application (/) commands...`);

        const guildId = process.env.GUILD_ID;
        const clientId = process.env.CLIENT_ID;

        if (!clientId) {
            // Try to get client ID from token
            const tokenParts = process.env.DISCORD_TOKEN.split('.');
            const clientIdFromToken = Buffer.from(tokenParts[0], 'base64').toString();

            if (guildId) {
                // Guild-specific commands (instant)
                const data = await rest.put(
                    Routes.applicationGuildCommands(clientIdFromToken, guildId),
                    { body: commands },
                );
                console.log(`[Deploy] Successfully registered ${data.length} guild commands.`);
            } else {
                // Global commands (can take up to 1 hour)
                const data = await rest.put(
                    Routes.applicationCommands(clientIdFromToken),
                    { body: commands },
                );
                console.log(`[Deploy] Successfully registered ${data.length} global commands.`);
            }
        } else {
            if (guildId) {
                const data = await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commands },
                );
                console.log(`[Deploy] Successfully registered ${data.length} guild commands.`);
            } else {
                const data = await rest.put(
                    Routes.applicationCommands(clientId),
                    { body: commands },
                );
                console.log(`[Deploy] Successfully registered ${data.length} global commands.`);
            }
        }
    } catch (error) {
        console.error('[Deploy] Error:', error);
    }
})();
