require('dotenv').config();

const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { startAllSchedulers, startMidnightSnapshots, captureMidnightSnapshot } = require('./scheduler');
const { getAllEnabledGuilds } = require('./database');

// Create client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,  // Required for member join/leave events
    ]
});

// Initialize commands collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[Commands] Loaded: /${command.data.name}`);
        }
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        client.on(event.name, (...args) => event.execute(...args));
        console.log(`[Events] Loaded: ${event.name}`);
    }
}

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`[Commands] Error executing /${interaction.commandName}:`, error);
        const reply = {
            content: 'There was an error executing this command!',
            ephemeral: true
        };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
        } else {
            await interaction.reply(reply);
        }
    }
});

// Bot ready event
client.once(Events.ClientReady, async readyClient => {
    console.log(`[Bot] Logged in as ${readyClient.user.tag}`);
    console.log(`[Bot] Serving ${readyClient.guilds.cache.size} guild(s)`);

    // Start schedulers for all configured guilds
    startAllSchedulers(client);

    // Start midnight snapshot schedulers
    startMidnightSnapshots(client);

    // Capture initial snapshot for today if not already captured
    const guilds = getAllEnabledGuilds();
    for (const config of guilds) {
        await captureMidnightSnapshot(client, config.guild_id);
    }

    console.log('[Bot] Ready!');
});

// Handle errors
client.on(Events.Error, error => {
    console.error('[Bot] Client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('[Bot] Unhandled promise rejection:', error);
});

// Login
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('[Bot] DISCORD_TOKEN not found in environment variables!');
    process.exit(1);
}

client.login(token);
