import { SlashCommandBuilder } from '@discordjs/builders';
import { db } from '../../database.js';
import dotenv from 'dotenv';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
dotenv.config();


export const data = new SlashCommandBuilder()
		.setName('message-triggers')
		.setDescription('Trigger-Nachrichten verwalten')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Ein Trigger-Nachricht hinzufügen')
				.addStringOption((opt) =>
					opt
						.setName('trigger')
						.setDescription('Die Trigger-Nachricht, auf die der Bot reagieren soll')
						.setRequired(true)
						.setMaxLength(200)
				)
				.addStringOption((opt) =>
					opt
						.setName('response')
						.setDescription('Die Antwort auf die Trigger-Nachricht')
						.setRequired(true)
						.setMaxLength(2000)
				)
				.addStringOption((opt) =>
					opt
						.setName('mode')
						.setDescription('Wie der Trigger übereinstimmen soll')
						.setRequired(false)
						.addChoices(
							{ name: 'Darf im Nachrichtentext enthalten sein', value: 'contains' },
							{ name: 'Nur exakte Nachricht', value: 'exact' }
						)
				)
				.addBooleanOption((opt) =>
					opt
						.setName('insideword')
						.setDescription('Erlauben, dass der Trigger auch innerhalb eines anderen Wortes übereinstimmt')
						.setRequired(false)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('remove')
				.setDescription('Trigger-Nachricht entfernen')
				.addStringOption((opt) =>
					opt
						.setName('trigger')
						.setDescription('Das zu entfernende Trigger-Nachricht')
						.setRequired(true)
						.setMaxLength(200)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('show')
				.setDescription('Alle Trigger-Nachrichten für diesen Server anzeigen')
		);


export async function execute(interaction) {
		const sub = interaction.options.getSubcommand();
		const guildId = interaction.guildId;
		if (!guildId) {
			return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
		}

		if (sub === 'add') {
			const trigger = interaction.options.getString('trigger', true).trim();
			const response = interaction.options.getString('response', true).trim();
			const mode = interaction.options.getString('mode') ?? 'contains';
			const insideWord = interaction.options.getBoolean('insideword') ?? false;

			const existing = await db.query(
				'SELECT id FROM message_triggers WHERE LOWER(trigger) = LOWER($1) LIMIT 1',
				[trigger]
			);

			if (existing.rows.length > 0) {
				await db.query(
					'UPDATE message_triggers SET response = $1, match_mode = $2, allow_inside_word = $3, updated_by = $4, updated_at = NOW() WHERE id = $5',
					[response, mode, insideWord, interaction.user.id, existing.rows[0].id]
				);
				return interaction.reply({
					content: `Updated trigger: \`${trigger}\``,
					flags: MessageFlags.Ephemeral,
				});
			}

			await db.query(
				'INSERT INTO message_triggers (trigger, response, match_mode, allow_inside_word, created_by) VALUES ($1, $2, $3, $4, $5)',
				[trigger, response, mode, insideWord, interaction.user.id]
			);
			return interaction.reply({
				content: `Added trigger: \`${trigger}\``,
				flags: MessageFlags.Ephemeral,
			});
		}

		if (sub === 'remove') {
			const trigger = interaction.options.getString('trigger', true).trim();
			const deleted = await db.query(
				'DELETE FROM message_triggers WHERE LOWER(trigger) = LOWER($1) RETURNING id',
				[trigger]
			);

			if (deleted.rows.length === 0) {
				return interaction.reply({
					content: `No trigger found for: \`${trigger}\``,
					flags: MessageFlags.Ephemeral,
				});
			}

			return interaction.reply({
				content: `Removed trigger: \`${trigger}\``,
				flags: MessageFlags.Ephemeral,
			});
		}

		const triggerRes = await db.query('SELECT trigger, response, match_mode, allow_inside_word, created_by, created_at, updated_by, updated_at FROM message_triggers ORDER BY id ASC');
		const triggers = triggerRes.rows;
		if (!triggers.length) {
			return interaction.reply({
				content: 'No message triggers configured for this server.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const fieldsPerPage = 10;
		const totalPages = Math.ceil(triggers.length / fieldsPerPage);
		let page = 0;

		const truncate = (value, maxLength) => {
			if (value.length <= maxLength) return value;
			return `${value.slice(0, maxLength - 3)}...`;
		};

		const formatDateTime = (value) => {
			if (!value) return null;
			const date = new Date(value);
			return new Intl.DateTimeFormat('de-DE', {
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			}).format(date);
		};

		const buildEmbed = (pageIndex) => {
			const start = pageIndex * fieldsPerPage;
			const pageItems = triggers.slice(start, start + fieldsPerPage);
			const embed = new EmbedBuilder()
				.setTitle('Message Triggers')
				.setColor(0x2b2d31)
				.setFooter({ text: `Seite ${pageIndex + 1} von ${totalPages} • ${triggers.length} Trigger-Nachricht(en) gesamt` });

			for (const t of pageItems) {
				const modeLabel = t.match_mode === 'exact' ? 'exakte Übereinstimmung' : 'im Nachrichtentext enthalten';
				const insideLabel = t.allow_inside_word ? 'Innerhalb anderer Wörter: ja' : 'Innerhalb anderer Wörter: nein';
				const createdAt = formatDateTime(t.created_at);
				const updatedAt = formatDateTime(t.updated_at);
				const createdLine = `Erstellt von <@${t.created_by}> am ${createdAt} Uhr`;
				const updatedLine = t.updated_by && updatedAt
					? `\nZuletzt bearbeitet von <@${t.updated_by}> am ${updatedAt} Uhr`
					: '';
				embed.addFields({
					name: truncate(t.trigger, 256),
					value: truncate(`${t.response}\nMode: ${modeLabel}, ${insideLabel}\n${createdLine}${updatedLine}`, 1024),
				});
			}

			return embed;
		};

		const buildRow = (pageIndex) => new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId('message_triggers_prev')
				.setEmoji('◀️')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(pageIndex === 0),
			new ButtonBuilder()
				.setCustomId('message_triggers_next')
				.setEmoji('▶️')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(pageIndex >= totalPages - 1)
		);

		const usePagination = totalPages > 1;
		await interaction.reply({
			embeds: [buildEmbed(page)],
			components: usePagination ? [buildRow(page)] : [],
			flags: MessageFlags.Ephemeral,
		});
		const reply = await interaction.fetchReply();

		if (!usePagination) {
			return;
		}

		const collector = reply.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 120000,
		});

		collector.on('collect', async (btnInteraction) => {
			if (btnInteraction.user.id !== interaction.user.id) {
				await btnInteraction.reply({
					content: 'Nur der Nutzer des Befehls kann diese Buttons benutzen.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			if (btnInteraction.customId === 'message_triggers_prev' && page > 0) {
				page -= 1;
			}
			if (btnInteraction.customId === 'message_triggers_next' && page < totalPages - 1) {
				page += 1;
			}

			await btnInteraction.update({
				embeds: [buildEmbed(page)],
				components: [buildRow(page)],
			});
		});

		collector.on('end', async () => {
			try {
				await reply.edit({ components: [] });
			} catch {
				// Ignore if message can no longer be edited.
			}
		});

		return;
	}
