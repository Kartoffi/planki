import { EmbedBuilder } from 'discord.js';

export const DISBOARD_BOT_ID = '302050872383242240';
const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;

const bumpJobs = new Map();

function clearBumpJob(guildId) {
  const existing = bumpJobs.get(guildId);
  if (existing) {
    clearTimeout(existing);
    bumpJobs.delete(guildId);
  }
}

// Disboard localizes its reply, but the success embed always contains the thumbs-up and the bump image.
export function isSuccessfulBumpMessage(message) {
  if (message.author?.id !== DISBOARD_BOT_ID) return false;

  return message.embeds.some((embed) => {
    const description = embed.description || '';
    const imageUrl = embed.image?.url || '';
    return (
      description.includes(':thumbsup:') ||
      description.includes('👍') ||
      imageUrl.includes('bot-command-image-bump')
    );
  });
}

async function sendBumpReminder(guildId, bot, db) {
  bumpJobs.delete(guildId);

  try {
    const result = await db.query(
      `SELECT channel_id, ping_role_id, reminder_sent
       FROM bump_reminders
       WHERE guild_id = $1`,
      [guildId]
    );
    const row = result.rows[0];
    if (!row || row.reminder_sent || !row.channel_id) return;

    const channel = await bot.channels.fetch(row.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn(`Bump-Reminder-Channel ${row.channel_id} nicht gefunden oder nicht textbasiert.`);
      return;
    }

    const ping = row.ping_role_id ? `<@&${row.ping_role_id}> ` : '';
    await channel.send({
      content: `${ping}Der Server kann ab sofort wieder mit dem Befehl \`/bump\` gebumpt werden!`,
      allowedMentions: { roles: row.ping_role_id ? [row.ping_role_id] : [] },
    });

    await db.query('UPDATE bump_reminders SET reminder_sent = TRUE WHERE guild_id = $1', [guildId]);
  } catch (error) {
    console.error(`Fehler beim Senden des Bump-Reminders für Guild ${guildId}:`, error);
  }
}

function scheduleBumpJob(guildId, remindAt, bot, db) {
  clearBumpJob(guildId);
  const delay = Math.max(0, new Date(remindAt).getTime() - Date.now());
  bumpJobs.set(guildId, setTimeout(() => void sendBumpReminder(guildId, bot, db), delay));
}

export async function recordBump(message, bot, db) {
  const guildId = message.guild.id;
  const remindAt = new Date(message.createdTimestamp + BUMP_COOLDOWN_MS);

  await db.query(
    `INSERT INTO bump_reminders (guild_id, channel_id, remind_at, reminder_sent)
     VALUES ($1, $2, $3, FALSE)
     ON CONFLICT (guild_id) DO UPDATE
     SET channel_id = EXCLUDED.channel_id, remind_at = EXCLUDED.remind_at, reminder_sent = FALSE`,
    [guildId, message.channel.id, remindAt]
  );

  scheduleBumpJob(guildId, remindAt, bot, db);

  const bumper = message.interactionMetadata?.user ?? message.interaction?.user;
  const nextBumpUnix = Math.floor(remindAt.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Bump erfolgreich!')
    .setDescription(
      `${bumper ? `Danke für's Bumpen, ${bumper}!` : 'Danke fürs Bumpen!'}\n` +
      `Der nächste Bump ist <t:${nextBumpUnix}:R> (um <t:${nextBumpUnix}:t> Uhr) möglich.`
    )
    .setTimestamp();

  await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

export async function setBumpPingRole(guildId, roleId, db) {
  await db.query(
    `INSERT INTO bump_reminders (guild_id, ping_role_id)
     VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET ping_role_id = EXCLUDED.ping_role_id`,
    [guildId, roleId]
  );
}

export async function hydrateBumpReminderJobs(bot, db) {
  const pending = await db.query(
    `SELECT guild_id, remind_at
     FROM bump_reminders
     WHERE reminder_sent = FALSE AND remind_at IS NOT NULL`
  );

  for (const row of pending.rows) {
    scheduleBumpJob(row.guild_id, row.remind_at, bot, db);
  }

  console.log(`Bump-Reminder: ${pending.rows.length} offene Reminder registriert.`);
}
