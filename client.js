// client.js
import { Client, GatewayIntentBits } from 'discord.js';

// Erstelle den Client und initialisiere die benötigten Intents
export const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMessageReactions, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ],
});

// Hier musst du den Bot mit deinem Token einloggen, es wird in index.js gemacht.