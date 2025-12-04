import { bot } from "./client.js"; // Importiere den Bot-Client aus client.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Importiere die notwendigen discord.js Klassen
import { REST, Routes, Events, Collection } from "discord.js";

// .env Variablen laden
import dotenv from "dotenv";
dotenv.config();

// Datenbankimport (db) - dynamic import for ESM compatibility
const { db } = await import("./database.js");

// Liste für die Slash-Commands
const commands = [];
bot.commands = new Collection();

// Lese die Befehl-Ordner und füge die Befehle zur Collection hinzu
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(pathToFileURL(filePath).href);
    // Füge die Befehle zur Collection hinzu
    if ("data" in command && "execute" in command) {
      bot.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
    } else {
      console.log(
        `[WARNUNG] Befehl bei ${filePath} hat keine "data" oder "execute" property!`
      );
    }
  }
}

// Erstelle eine neue Instanz des REST-Moduls
const rest = new REST().setToken(process.env.BOT_TOKEN);

// Befehl-Deployment
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);
		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();

// Lese und registriere die Events
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = await import(pathToFileURL(filePath).href);
  bot.on(event.name, (...args) => event.execute(...args));
}

// Wenn der Bot bereit ist, gebe eine Nachricht aus
bot.once(Events.ClientReady, (readyClient) => {
  console.log(`${readyClient.user.username} ist jetzt online!`);
});

// Logge den Bot ein
bot.login(process.env.BOT_TOKEN);