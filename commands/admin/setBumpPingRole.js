import { SlashCommandBuilder } from '@discordjs/builders';
import { PermissionFlagsBits } from 'discord.js';
import { db } from '../../database.js';
import { setBumpPingRole } from '../../bumpReminderScheduler.js';

export const data = new SlashCommandBuilder()
  .setName('set-bump-pingrole')
  .setDescription('Lege die Rolle fest, die beim Bump-Reminder gepingt wird.')
  .addStringOption(option =>
    option.setName('roleid')
      .setDescription('ID der Rolle')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const roleId = interaction.options.getString('roleid').trim();
  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    return interaction.reply({ content: 'Die Rolle mit der angegebenen ID existiert nicht auf diesem Server.', flags: 64 });
  }

  try {
    await setBumpPingRole(interaction.guild.id, roleId, db);
    await interaction.reply({ content: `Die Rolle <@&${roleId}> wird ab jetzt beim Bump-Reminder gepingt.`, flags: 64 });
  } catch (error) {
    console.error('Fehler beim Setzen der Bump-Pingrolle:', error);
    await interaction.reply({ content: 'Fehler beim Setzen der Bump-Pingrolle. Bitte gebe den Admins bescheid, dass etwas schiefgelaufen ist.', flags: 64 });
  }
}
