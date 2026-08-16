import { EmbedBuilder } from '@discordjs/builders';
import { db } from '../database.js';
import dotenv from 'dotenv';
dotenv.config();

export const name = "guildMemberRemove";
export const once = false;

export async function execute(member) {
    // send notification to log channel that someone left the server
    const logChannel = member.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

    const formatGermanDate = (date) => {
        if (!date) return 'Unbekannt';

        const formatted = new Intl.DateTimeFormat('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(date);

        return `${formatted} Uhr`;
    };

    const diffMs = Date.now() - member.user.createdAt.getTime();
    const accountAgeInDays = diffMs / 86400000;
    const accountAgeInDaysFloored = Math.floor(accountAgeInDays);

    if (logChannel && logChannel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor(0xcc234d)
            .setTimestamp()
            .setAuthor({ name: member.client.user.username, iconURL: member.client.user.displayAvatarURL() })
            .setThumbnail(member.user.displayAvatarURL())
            .setTitle('Mitglied hat den Server verlassen')
            .setDescription(
                `${member.user} (${member.user.tag}) hat den Server verlassen.`
            )
            .addFields(
                { name: 'Server beigetreten am', value: formatGermanDate(member.joinedAt), inline: false },
                { name: 'Account erstellt am', value: formatGermanDate(member.user.createdAt), inline: true },
                { name: 'Account Alter', value: `${accountAgeInDaysFloored} Tage`, inline: true },
            );

        logChannel.send({ embeds: [embed] });
    }
}
