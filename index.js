import { bot } from "./client.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hydrateBumpReminderJobs } from "./bumpReminderScheduler.js";
import {
  REST,
  Routes,
  Events,
  Collection,
  EmbedBuilder,
} from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Datenbank
const { db } = await import("./database.js");

// Halloween-Konfiguration
const HALLOWEEN_CHANNEL_ID = process.env.HALLOWEEN_CHANNEL_ID;
const HALLOWEEN_TIMEZONE = "Europe/Berlin";
const HALLOWEEN_INTERVAL_MS = 30 * 60 * 1000;
const HALLOWEEN_REACTION_WINDOW_MS = 15 * 60 * 1000;

// Verhindert parallele Scheduler-Ausführungen im selben Prozess.
let halloweenSchedulerRunning = false;

// Warteschlange für Reaktionen, damit die Rangfolge im selben
// Bot-Prozess nacheinander verarbeitet wird.
let halloweenReactionQueue = Promise.resolve();

// --------------------------------------------------
// COMMANDS LADEN UND REGISTRIEREN
// --------------------------------------------------

const commands = [];
bot.commands = new Collection();

const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);

  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.resolve(commandsPath, file);
    const command = await import(pathToFileURL(filePath).href);

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

// --------------------------------------------------
// SLASH-COMMANDS REGISTRIEREN
// --------------------------------------------------

const rest = new REST({ version: "10" }).setToken(
  process.env.BOT_TOKEN
);

(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`
    );
  } catch (error) {
    console.error(error);
  }
})();

// --------------------------------------------------
// EVENTS LADEN
// --------------------------------------------------

const eventsPath = path.join(__dirname, "events");

const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const filePath = path.resolve(eventsPath, file);
  const event = await import(pathToFileURL(filePath).href);

  bot.on(event.name, (...args) => event.execute(...args));
}

// --------------------------------------------------
// HALLOWEEN: ZUFÄLLIGE ZEITEN FESTLEGEN
// --------------------------------------------------

async function scheduleHalloweenEvents() {
  const result = await db.query(
    `
      UPDATE halloween_events
      SET scheduled_at =
        (posting_interval_start AT TIME ZONE $1)
        + random() * ($2 * interval '1 millisecond')
      WHERE scheduled_at IS NULL
        AND status = 'pending'
      RETURNING id, title, scheduled_at
    `,
    [HALLOWEEN_TIMEZONE, HALLOWEEN_INTERVAL_MS]
  );

  for (const event of result.rows) {
    console.log(
      `[Halloween] "${event.title}" (#${event.id}) geplant für ` +
        new Date(event.scheduled_at).toLocaleString("de-DE", {
          timeZone: HALLOWEEN_TIMEZONE,
        })
    );
  }

  console.log(
    `[Halloween] ${result.rowCount} neue Nachrichten eingeplant für ${HALLOWEEN_TIMEZONE}.`
  );
}

// --------------------------------------------------
// HALLOWEEN: FÄLLIGE NACHRICHTEN RESERVIEREN
// --------------------------------------------------

async function claimHalloweenEvents() {
  const result = await db.query(`
    WITH due AS (
      SELECT id
      FROM halloween_events
      WHERE status = 'pending'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 20
    )
    UPDATE halloween_events AS event
    SET status = 'processing'
    FROM due
    WHERE event.id = due.id
    RETURNING event.*
  `);

  return result.rows;
}

// --------------------------------------------------
// HALLOWEEN: NACHRICHTEN SENDEN
// --------------------------------------------------

async function sendHalloweenEvents() {
  if (halloweenSchedulerRunning) return;

  halloweenSchedulerRunning = true;

  try {
    const events = await claimHalloweenEvents();

    for (const event of events) {
      try {
        if (!HALLOWEEN_CHANNEL_ID) {
          throw new Error("HALLOWEEN_CHANNEL_ID fehlt in der .env");
        }

        const channel = await bot.channels.fetch(
          HALLOWEEN_CHANNEL_ID
        );

        if (!channel || !channel.isSendable()) {
          throw new Error(
            "Halloween-Channel nicht gefunden oder nicht beschreibbar."
          );
        }

        const reactionDeadline = Math.floor(Date.now() / 1000) + HALLOWEEN_REACTION_WINDOW_MS / 1000;

        // 1. ZUERST LEERES LIVE-AUSWERTUNGS-EMBED SENDEN
        const initialLiveEmbed = new EmbedBuilder()
          .setColor("#ea8317")
          .setTitle(`📊 Live-Auswertung: ${event.title}`)
          .setDescription("*Noch keine Ergebnisse vorhanden*")
          .setFooter({ text: "Warte auf Reaktionen..." })
          .setTimestamp();

        const sentLiveMessage = await channel.send({ embeds: [initialLiveEmbed] });

        // 2. DANACH DAS KAPITEL-EMBED SENDEN
        const embed = {
          title: event.title,
          description:
            `${event.message}

` +
            `***Reagiere schnell mit ${event.reaction_emoji}, um dir deine Belohnung zu sichern!***

` +
            `📊 **Die Live-Auswertung für dieses Kapitel findest du über dieser Nachricht.**
` +
            `⏳ **Zeit zum Reagieren läuft ab** <t:${reactionDeadline}:R>`,
          color: 0xea8317,
        };

        const sentMessage = await channel.send({
          embeds: [embed],
          allowedMentions: { parse: [] },
        });

        // Nachricht, Auswertungs-ID und Versandzeitpunkt speichern.
        // Wir nutzen discord_message_id für die Story und ein neues Feld (oder missbrauchen last_error / lagern es aus).
        // Um das DB-Schema nicht zu brechen, speichern wir die ID der Live-Auswertung in einem JSON oder hängen sie an,
        // oder wir nutzen einen praktischen Trick: Wir speichern sie im Feld `last_error` als Prefix oder nutzen ein neues DB-Update, 
        // falls die Spalte existiert. Da wir laut Schema `last_error TEXT` haben, speichern wir dort temporär die ID des Live-Embeds.
        await db.query(
          `
            UPDATE halloween_events
            SET status = 'sent',
                sent_at = NOW(),
                discord_message_id = $2,
                last_error = $3
            WHERE id = $1
              AND status = 'processing'
          `,
          [event.id, sentMessage.id, `LIVE_EMBED_ID:${sentLiveMessage.id}`]
        );

        // Vorgegebenes Emoji als Reaktion hinzufügen.
        if (event.reaction_emoji) {
          try {
            await sentMessage.react(event.reaction_emoji);
          } catch (reactionError) {
            console.error(
              `[Halloween] Reaktion für Event #${event.id} fehlgeschlagen:`,
              reactionError
            );
          }
        }

        console.log(
          `[Halloween] "${event.title}" (#${event.id}) wurde gesendet. Live-Auswertung vorgeschaltet.`
        );
      } catch (error) {
        console.error(
          `[Halloween] Fehler bei Event #${event.id}:`,
          error
        );

        try {
          await db.query(
            `
              UPDATE halloween_events
              SET status = 'failed',
                  last_error = $2
              WHERE id = $1
                AND status = 'processing'
            `,
            [
              event.id,
              String(error.message || error).slice(0, 2000),
            ]
          );
        } catch (dbError) {
          console.error(
            `[Halloween] Fehler beim Speichern des Fehlerstatus für #${event.id}:`,
            dbError
          );
        }
      }
    }
  } finally {
    halloweenSchedulerRunning = false;
  }
}

// --------------------------------------------------
// HALLOWEEN: EMOJI VERGLEICHEN
// --------------------------------------------------

function isExpectedHalloweenEmoji(expectedEmoji, actualEmoji) {
  if (!expectedEmoji || !actualEmoji) return false;

  const expected = expectedEmoji.trim();
  const actualName = actualEmoji.name;
  const actualId = actualEmoji.id;

  if (expected === actualName) {
    return true;
  }

  if (actualId && expected === actualId) {
    return true;
  }

  if (
    actualId &&
    (expected === `<:${actualName}:${actualId}>` ||
      expected === `<a:${actualName}:${actualId}>`)
  ) {
    return true;
  }

  return false;
}

// --------------------------------------------------
// HALLOWEEN: ZEIT LESBAR MIT MILLISEKUNDEN FORMATIEREN
// Beispiel: 14s 420ms oder 01m 05s 080ms
// --------------------------------------------------
function formatDurationMs(seconds) {
  const totalMs = Math.max(0, Math.floor((Number(seconds) || 0) * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const remainingSeconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  const strSec = String(remainingSeconds).padStart(2, "0");
  const strMs = String(milliseconds).padStart(3, "0");

  if (minutes > 0) {
    return `${String(minutes).padStart(2, "0")}m ${strSec}s ${strMs}ms`;
  }
  return `${remainingSeconds}s ${strMs}ms`;
}

function getPlaceLabel(place) {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return `#${place}`;
}

// --------------------------------------------------
// HALLOWEEN: REAKTIONEN UND SÜSSIGKEITEN
// --------------------------------------------------

async function processHalloweenReaction(reaction, user) {
  if (user.bot) return;

  if (reaction.partial) {
    await reaction.fetch();
  }

  const message = reaction.message;
  if (!message?.id || !message.channel) return;

  // Passendes Event finden und 15-Minuten-Frist prüfen.
  const eventResult = await db.query(
    `
      SELECT id, title, reaction_emoji, sent_at, last_error
      FROM halloween_events
      WHERE discord_message_id = $1
        AND status = 'sent'
        AND sent_at IS NOT NULL
        AND sent_at <= NOW()
        AND sent_at >= NOW() - ($2 * INTERVAL '1 millisecond')
      LIMIT 1
    `,
    [message.id, HALLOWEEN_REACTION_WINDOW_MS]
  );

  if (eventResult.rowCount === 0) return;
  const event = eventResult.rows[0];

  // Nur das vorgesehene Emoji zählt.
  if (!isExpectedHalloweenEmoji(event.reaction_emoji, reaction.emoji)) {
    return;
  }

  // Pro Nutzer und Event nur eine Belohnung.
  const existingUser = await db.query(
    `
      SELECT id
      FROM halloween_event_users
      WHERE discord_id = $1
        AND event_id = $2
      LIMIT 1
    `,
    [user.id, event.id]
  );

  if (existingUser.rowCount > 0) return;

  // Aktuelle Teilnehmerzahl bestimmt die Belohnung.
  const countResult = await db.query(
    `
      SELECT COUNT(*)::INTEGER AS participant_count
      FROM halloween_event_users
      WHERE event_id = $1
    `,
    [event.id]
  );

  const participantCount = countResult.rows[0].participant_count;
  let sweetsAmount = 10;

  if (participantCount === 0) {
    sweetsAmount = 25;
  } else if (participantCount === 1) {
    sweetsAmount = 20;
  } else if (participantCount === 2) {
    sweetsAmount = 15;
  }

  // Reaktion registrieren.
  await db.query(
    `
      INSERT INTO halloween_event_users (
        discord_id,
        event_id,
        time,
        collected_sweets_amount
      )
      VALUES ($1, $2, NOW(), $3)
      ON CONFLICT (discord_id, event_id) DO NOTHING
    `,
    [user.id, event.id, sweetsAmount]
  );

  // Alle Teilnehmer dieses Kapitels abrufen, um das Live-Embed komplett neu aufzubauen
  const chapterParticipants = await db.query(
    `
      SELECT 
        discord_id,
        collected_sweets_amount,
        EXTRACT(EPOCH FROM (time - ($2::timestamptz AT TIME ZONE current_setting('TIMEZONE')))) AS elapsed_seconds,
        ROW_NUMBER() OVER (ORDER BY time ASC, id ASC) AS place
      FROM halloween_event_users
      WHERE event_id = $1
      ORDER BY place ASC
    `,
    [event.id, event.sent_at]
  );

  // Live-Embed im gewünschten Ranglistenformat aufbauen.
  let liveDescription = "";
  for (const p of chapterParticipants.rows) {
    liveDescription += `**${getPlaceLabel(Number(p.place))}** <@${p.discord_id}> — ⏱️ **${formatDurationMs(p.elapsed_seconds)}** (**+${p.collected_sweets_amount}** 🍬)
`;
  }

  // Live-Embed editieren
  if (event.last_error && event.last_error.startsWith("LIVE_EMBED_ID:")) {
    const liveEmbedId = event.last_error.replace("LIVE_EMBED_ID:", "");
    try {
      const liveMessage = await message.channel.messages.fetch(liveEmbedId);
      if (liveMessage) {
        const updatedEmbed = new EmbedBuilder()
          .setColor("#ea8317")
          .setTitle(`📊 Live-Auswertung: ${event.title}`)
          .setDescription(liveDescription.trim() || "*Noch keine Ergebnisse vorhanden*")
          .setTimestamp();

        await liveMessage.edit({ embeds: [updatedEmbed] });
      }
    } catch (fetchError) {
      console.error(`[Halloween] Konnte Live-Auswertungsnachricht ${liveEmbedId} nicht editieren:`, fetchError);
    }
  }

  console.log(`[Halloween] Live-Auswertung für Event #${event.id} nach Reaktion von ${user.username} aktualisiert.`);
}

// --------------------------------------------------
// HALLOWEEN: FRISTEN PRÜFEN & GESAMTERGEBNIS POSTEN
// --------------------------------------------------

async function checkAndPostExpiredEvents() {
  const expiredEvents = await db.query(
    `
      SELECT id, title, discord_message_id, sent_at, last_error
      FROM halloween_events
      WHERE status = 'sent'
        AND sent_at IS NOT NULL
        AND sent_at <= NOW() - ($1 * INTERVAL '1 millisecond')
      ORDER BY sent_at ASC
    `,
    [HALLOWEEN_REACTION_WINDOW_MS]
  );

  for (const event of expiredEvents.rows) {
    try {
      // Status auf 'completed' setzen
      await db.query(`UPDATE halloween_events SET status = 'completed' WHERE id = $1`, [event.id]);

      if (!HALLOWEEN_CHANNEL_ID) continue;
      const channel = await bot.channels.fetch(HALLOWEEN_CHANNEL_ID);
      if (!channel || !channel.isSendable()) continue;

      // 1. KAPITELNACHRICHT AKTUALISIEREN: Reaktionsfrist ist abgelaufen.
      try {
        const chapterMessage = await channel.messages.fetch(event.discord_message_id);
        if (chapterMessage?.embeds?.[0]) {
          const chapterEmbed = EmbedBuilder.from(chapterMessage.embeds[0]);
          const oldDescription = chapterMessage.embeds[0].description || "";
          const updatedDescription = oldDescription.replace(
            /⏳ \*\*Zeit zum Reagieren läuft ab\*\*.*$/m,
            "***Reaktionszeit vorbei!***"
          );

          if (updatedDescription !== oldDescription) {
            chapterEmbed.setDescription(updatedDescription);
            await chapterMessage.edit({ embeds: [chapterEmbed] });
          }
        }
      } catch (e) {
        console.error("[Halloween] Konnte Kapitel-Nachricht zum Fristende nicht aktualisieren:", e);
      }

      // 2. LIVE EMBED EIN LETZTES MAL AUF "ABGESCHLOSSEN" SETZEN
      if (event.last_error && event.last_error.startsWith("LIVE_EMBED_ID:")) {
        const liveEmbedId = event.last_error.replace("LIVE_EMBED_ID:", "");
        try {
          const liveMessage = await channel.messages.fetch(liveEmbedId);
          if (liveMessage) {
            const currentEmbed = liveMessage.embeds[0];
            const finalizedEmbed = EmbedBuilder.from(currentEmbed)
              .setFooter({ text: "Auswertung abgeschlossen" })
              .setTimestamp();

            await liveMessage.edit({ embeds: [finalizedEmbed] });
          }
        } catch (e) {
          console.error("[Halloween] Konnte Live-Embed zum Fristende nicht finalisieren:", e);
        }
      }

      // 3. GLOBALE GESAMTLISTE ERMITTELN
      const totalLeaderboard = await db.query(
        `
          WITH totals AS (
            SELECT
              discord_id,
              SUM(collected_sweets_amount)::INTEGER AS total_sweets,
              MIN(time) AS first_collection
            FROM halloween_event_users
            GROUP BY discord_id
          )
          SELECT
            discord_id,
            total_sweets,
            ROW_NUMBER() OVER (ORDER BY total_sweets DESC, first_collection ASC, discord_id ASC) AS place
          FROM totals
          ORDER BY place ASC
        `
      );

      let totalText = "";
      if (totalLeaderboard.rowCount === 0) {
        totalText = "*Noch keine Daten verfügbar.*";
      } else {
        for (const t of totalLeaderboard.rows) {
          totalText += `**${getPlaceLabel(Number(t.place))}** <@${t.discord_id}> — **${t.total_sweets}** 🍬
`;
        }
      }

      // Hilfsfunktion für Pagination
      function splitText(text, maxLength = 3800) {
        const lines = text.split("");
        const chunks = [];
        let currentChunk = "";
        for (const line of lines) {
          if ((currentChunk + line).length > maxLength) {
            chunks.push(currentChunk);
            currentChunk = "";
          }
          currentChunk += line + "";
        }
        if (currentChunk.trim()) chunks.push(currentChunk);
        return chunks;
      }

      const totalChunks = splitText(totalText);

      // Nur das globale Gesamtergebnis posten
      for (let i = 0; i < totalChunks.length; i++) {
        const totalEmbed = new EmbedBuilder()
          .setColor("#dc6913")
          .setTitle(`🏆 Globale Halloween-Bestenliste`)
          .setDescription(totalChunks[i])
          .setFooter({ text: `Seite ${i + 1} von ${totalChunks.length}` })
          .setTimestamp();

        await channel.send({ embeds: [totalEmbed] });
      }

      console.log(`[Halloween] Frist abgelaufen für Event #${event.id}. Globale Bestenliste wurde gepostet.`);

    } catch (eventError) {
      console.error(`[Halloween] Fehler beim Posten des Gesamtergebnisses für Event #${event.id}:`, eventError);
    }
  }
}

// Reaktionen sequenziell verarbeiten
bot.on(Events.MessageReactionAdd, (reaction, user) => {
  halloweenReactionQueue = halloweenReactionQueue
    .then(() => processHalloweenReaction(reaction, user))
    .catch((error) => {
      console.error("[Halloween] Fehler bei der Reaktionsverarbeitung:", error);
    });
});

// --------------------------------------------------
// BOT READY
// --------------------------------------------------

bot.once(Events.ClientReady, async (readyClient) => {
  console.log(`${readyClient.user.username} ist jetzt online!`);

  try {
    await hydrateBumpReminderJobs(bot, db);

    await db.query(`
      UPDATE halloween_events
      SET status = 'pending'
      WHERE status = 'processing'
    `);

    await scheduleHalloweenEvents();
    await sendHalloweenEvents();
    await checkAndPostExpiredEvents();

    cron.schedule(
      "* * * * * *",
      () => {
        sendHalloweenEvents().catch((error) => {
          console.error("[Halloween] Scheduler-Fehler:", error);
        });
        checkAndPostExpiredEvents().catch((error) => {
          console.error("[Halloween] End-Auswertungs-Fehler:", error);
        });
      },
      {
        timezone: HALLOWEEN_TIMEZONE,
        noOverlap: true,
      }
    );

    console.log("[Halloween] Cronjob gestartet.");

    for (const [guildId, guild] of bot.guilds.cache) {
      await guild.members.fetch();
      console.log(`Alle Mitglieder für Guild ${guild.name} wurden gecached.`);
    }
  } catch (err) {
    console.error("Fehler beim Initialisieren des Bots:", err);
  }
});

// --------------------------------------------------
// BOT LOGIN
// --------------------------------------------------

bot.login(process.env.BOT_TOKEN);