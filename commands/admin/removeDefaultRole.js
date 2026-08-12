import { SlashCommandBuilder } from '@discordjs/builders';
import { db } from '../../database.js';
import dotenv from 'dotenv';
import { PermissionFlagsBits } from 'discord.js';
dotenv.config();

export const data = new SlashCommandBuilder()
  .setName('remove-default-role')
  .setDescription('Entferne eine Standardrolle.')
  .addStringOption(option =>
    option.setName('roleid')
      .setDescription('ID der Rolle')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const roleId = interaction.options.getString('roleid');

  // check if role exists in the guild
  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    return interaction.reply({ content: 'Die Rolle mit der angegebenen ID existiert nicht auf diesem Server.', flags: 64 });
  }

  // check if role is in default_roles table
  const dbResCheck = await db.query('SELECT * FROM default_roles WHERE role_id = $1', [roleId]);
  if (dbResCheck.rows.length === 0) {
    return interaction.reply({ content: 'Die Rolle ist keine Standardrolle.', flags: 64 });
  }

  try {
    // remove role from default_roles table
    const dbRes = await db.query('DELETE FROM default_roles WHERE role_id = $1 RETURNING *', [roleId]);
    const replyMsg = `Die Rolle <@&${roleId}> wurde erfolgreich als Standardrolle entfernt.`;

    // remove role from all members who have it
    const guild = interaction.guild;
    const membersWithRole = guild.members.cache.filter(member => member.roles.cache.has(roleId));

    for (const [memberId, member] of membersWithRole.entries()) {
      try {
        await member.roles.remove(roleId);
      } catch (error) {
        console.error(`Fehler beim Entfernen der Rolle von ${member.user.tag}:`, error);
      }
    }
    await interaction.reply({ content: replyMsg, flags: 64 });
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: `Fehler beim Entfernen der Standardrolle. Bitte gebe den Admins bescheid, dass etwas schiefgelaufen ist.`, flags: 64 });
  }
}