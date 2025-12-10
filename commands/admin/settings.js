import { SlashCommandBuilder } from '@discordjs/builders';
import { db } from '../../database.js';
import dotenv from 'dotenv';
import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
dotenv.config();

const settings = await db.query('SELECT setting_id, name, value, type FROM settings');

export const data = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Bearbeite deine Settings.')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('Zeige deine aktuellen Settings an.')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('Bearbeite einen Setting.')
      .addStringOption(option =>
        option.setName('setting_name')
          .setDescription('Name der Setting, die du ändern möchtest.')
          .setRequired(true)
          .addChoices(
            ...settings.rows.map(setting => ({
              name: setting.name,
              value: setting.setting_id
            }))
          )
      )
      .addStringOption(option =>
        option.setName('setting_value')
          .setDescription('Neuer Wert für den Setting.')
          .setRequired(true)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'view') {
    const discordId = interaction.user.id;
    const dbRes = await db.query('SELECT setting_id, name, value, type FROM settings WHERE setting_is_active = TRUE');
    const embed = new EmbedBuilder()
      .setTitle('Deine aktuellen Settings')
      .setColor(0x5865F2)
      .setTimestamp();
    dbRes.rows.forEach(row => {
      embed.addFields({
        name: `${row.name}`,
        value: `ID: ${row.setting_id}\nWert: ${row.value}\nTyp: ${row.type}`,
        inline: false
      });
    });
    return interaction.reply({ embeds: [embed], flags: 64 });
  } else if (subcommand === 'edit') {
    const settingName = interaction.options.getString('setting_name');
    const settingValue = interaction.options.getString('setting_value');

    const settingRes = await db.query('SELECT type FROM settings WHERE setting_id = $1', [settingName]);
    if (settingRes.rows.length === 0) {
      return interaction.reply({ content: `Setting mit der Setting-ID \`${settingName}\` wurde nicht gefunden.`, flags: 64 });
    }

    const settingType = settingRes.rows[0].type;
    let parsedValue;

    try {
      switch (settingType) {
        case 'number':
          parsedValue = parseInt(settingValue, 10);
          if (isNaN(parsedValue)) throw new Error('Invalid number');
          break;
        case 'boolean':
          if (settingValue.toLowerCase() === 'true') {
            parsedValue = true;
          } else if (settingValue.toLowerCase() === 'false') {
            parsedValue = false;
          } else {
            throw new Error('Invalid boolean');
          }
          break;
        case 'string':
        default:
          parsedValue = settingValue;
      }

      await db.query('UPDATE settings SET value = $1 WHERE setting_id = $2', [parsedValue.toString(), settingName]);
      return interaction.reply({ content: `Setting "${settingName}" wurde erfolgreich auf "${parsedValue}" gesetzt.`, flags: 64 });
    } catch (error) {
      return interaction.reply({ content: `Der Wert "${settingValue}" ist ungültig für den Setting-Typ "${settingType}".`, flags: 64 });
    }
  }
  
  await interaction.reply({ content: `Ungültiger Subbefehl. Bitte verwende entweder "view" oder "edit".`, flags: 64 });
}