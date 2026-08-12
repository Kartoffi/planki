import { SlashCommandBuilder } from '@discordjs/builders';
import { db } from '../../database.js';
import dotenv from 'dotenv';
import { PermissionFlagsBits } from 'discord.js';
dotenv.config();

export const data = new SlashCommandBuilder()
  .setName('show-default-roles')
  .setDescription('Zeigt alle Standardrollen an, die neuen Mitgliedern automatisch zugewiesen werden.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const discordId = interaction.user.id;
  const guild = interaction.guild;

  const defaultRolesRes = await db.query('SELECT role_id FROM default_roles');
  const defaultRoles = defaultRolesRes.rows.map(row => row.role_id);

  if (defaultRoles.length === 0) {
    return interaction.reply({ content: 'Es sind noch keine Standardrollen festgelegt.', flags: 64 });
  }

  const roleMentions = defaultRoles.map(roleId => `<@&${roleId}>`).join('\n');
  await interaction.reply({ content: `Die folgenden Standardrollen sind festgelegt:\n${roleMentions}`, flags: 64 });
}