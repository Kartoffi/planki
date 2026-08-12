import { SlashCommandBuilder } from '@discordjs/builders';
import { db } from '../../database.js';
import dotenv from 'dotenv';
import { PermissionFlagsBits } from 'discord.js';
dotenv.config();

export const data = new SlashCommandBuilder()
  .setName('set-default-role')
  .setDescription('Füge eine neue Standardrolle hinzu, die Mitgliedern automatisch zugewiesen wird.')
  .addStringOption(option =>
    option.setName('roleid')
      .setDescription('ID der Rolle')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const discordId = interaction.user.id;
  const roleId = interaction.options.getString('roleid');
  const guild = interaction.guild;
  const member = interaction.member;

  // check if role exists in the guild
  const role = guild.roles.cache.get(roleId);

  if (!role) {
    return interaction.reply({ content: 'Die Rolle mit der angegebenen ID existiert nicht auf diesem Server.', flags: 64 });
  }

  // add role to default_roles table
  const dbRes = await db.query('INSERT INTO default_roles (role_id) VALUES ($1) RETURNING *', [roleId]);
  const replyMsg = `Die Rolle <@&${roleId}> wurde erfolgreich als Standardrolle hinzugefügt.`;

  // assign role to all members who don't have it yet
  const membersWithoutRole = guild.members.cache.filter(member => !member.roles.cache.has(roleId));

  for (const [memberId, member] of membersWithoutRole.entries()) {
    try {
      await member.roles.add(roleId);
    } catch (error) {
      console.error(`Fehler beim Hinzufügen der Rolle zu ${member.user.tag}:`, error);
    }
  }

  try {
    await interaction.reply({ content: replyMsg, flags: 64 });
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: `Fehler beim Hinzufügen der Standardrolle. Bitte gebe den Admins bescheid, dass etwas schiefgelaufen ist.`, flags: 64 });
  }
}