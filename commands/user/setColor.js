import { SlashCommandBuilder } from '@discordjs/builders';
import { db } from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('setcolor')
  .setDescription('Setze eine neue Farbe.')
  .addStringOption(option =>
    option.setName('hexcode')
      .setDescription('Hex-Code der Farbe, z.B. #ff0000')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('name')
      .setDescription('Name der Farbrolle (optional)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const discordId = interaction.user.id;
  const hexcode = interaction.options.getString('hexcode');
  const guild = interaction.guild;
  const member = interaction.member;
  const roleName = interaction.options.getString('name') || `${interaction.user.username}`;

  let color = null;
  if (hexcode) {
    const hexRegex = /^#?([a-fA-F0-9]{6})$/;
    const match = hexcode.match(hexRegex);
    if (!match) {
      return interaction.reply({ content: 'Bitte gib einen gültigen Hex-Code an, z.B. #ff0000.', flags: 64 });
    }
    color = `#${match[1]}`;
  }
  const hasName = !!interaction.options.getString('name');
  const hasColor = !!color;
  if (!hasName && !hasColor) {
    return interaction.reply({ content: 'Bitte gib entweder einen neuen Namen oder einen Hex-Code für die bestehende Farbrolle an.', flags: 64 });
  }

  try {
    // Check if user already has a color role
    const dbRes = await db.query('SELECT color_role_id FROM users WHERE discord_id = $1', [discordId]);
    let role;
    if (dbRes.rows.length > 0 && dbRes.rows[0].color_role_id) {
      // Update existing role
      role = guild.roles.cache.get(dbRes.rows[0].color_role_id);
      if (role) {
        const editData = {};
        if (hasColor) editData.color = color;
        if (hasName) editData.name = roleName;
        await role.edit(editData);
      } else {
        // Role not found, create new
        const createData = {
          name: roleName,
          mentionable: false,
          reason: `Farbrolle für ${interaction.user.tag}`
        };
        if (hasColor) createData.color = color;
        role = await guild.roles.create(createData);
      }
    } else {
      // User has no color role yet
      if (!hasColor) {
        return interaction.reply({ content: 'Um eine neue Farbrolle zu erstellen, musst du eine Farbe angeben.', flags: 64 });
      }
      // Create new role
      const createData = {
        name: roleName,
        mentionable: false,
        reason: `Farbrolle für ${interaction.user.tag}`
      };
      if (hasColor) createData.color = color;
      role = await guild.roles.create(createData);
    }

    // Assign role to user
    await member.roles.add(role);

    // Upsert user with new color_role_id
    await db.query(`
      INSERT INTO users (discord_id, color_role_id)
      VALUES ($1, $2)
      ON CONFLICT (discord_id)
      DO UPDATE SET color_role_id = EXCLUDED.color_role_id;
    `, [discordId, role.id]);

    let replyMsg = 'Farbrolle aktualisiert!';
    if (hasColor && hasName) replyMsg = `Farbrolle gesetzt: ${color}, Name: ${roleName}`;
    else if (hasColor) replyMsg = `Farbe gesetzt: ${color}`;
    else if (hasName) replyMsg = `Name gesetzt: ${roleName}`;
    await interaction.reply({ content: replyMsg, flags: 64 });
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: `Fehler beim Setzen der Farbrolle.`, flags: 64 });
  }
}