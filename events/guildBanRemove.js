import { EmbedBuilder } from '@discordjs/builders';
import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

export const name = 'guildBanRemove';
export const once = false;

export async function execute(ban) {
    const guild = ban.guild;
    const user = ban.user;

    let logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

    if (!logChannel) {
        try {
            logChannel = await guild.channels.fetch(process.env.LOG_CHANNEL_ID);
        } catch (error) {
            console.warn('Log-Channel konnte fuer guildBanRemove nicht geladen werden:', error);
        }
    }

    if (!logChannel || !logChannel.isTextBased()) {
        console.warn('Kein gueltiger Log-Channel fuer guildBanRemove gefunden.');
        return;
    }

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

    const formatAccountAge = (createdAt, now = new Date()) => {
        if (!createdAt) return 'Unbekannt';

        let years = now.getFullYear() - createdAt.getFullYear();
        let months = now.getMonth() - createdAt.getMonth();
        let days = now.getDate() - createdAt.getDate();

        if (days < 0) {
            months -= 1;
            const daysInPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
            days += daysInPreviousMonth;
        }

        if (months < 0) {
            years -= 1;
            months += 12;
        }

        if (years < 0) {
            years = 0;
            months = 0;
            days = 0;
        }

        return `${years} Jahr(e), ${months} Monat(e), ${days} Tag(e)`;
    };

    let unbanEntry = null;
    const canReadAuditLogs = guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog);

    if (canReadAuditLogs) {
        try {
            const unbanAuditLogs = await guild.fetchAuditLogs({
                limit: 5,
                type: AuditLogEvent.MemberBanRemove,
            });

            unbanEntry = unbanAuditLogs.entries.find((entry) => {
                const isSameTarget = entry.target?.id === user.id;
                const isRecent = Date.now() - entry.createdTimestamp < 15000;
                return isSameTarget && isRecent;
            }) ?? null;
        } catch (error) {
            console.warn('Konnte Audit Logs nicht lesen, Unban-Details unvollstaendig:', error);
        }
    }

    const moderator = unbanEntry?.executor
        ? `${unbanEntry.executor} (${unbanEntry.executor.tag})`
        : 'Unbekannt';
    const reason = unbanEntry?.reason ?? 'Kein Grund angegeben';

    const authorUser = unbanEntry?.executor ?? guild.client.user;
    const authorName = authorUser?.globalName ?? authorUser?.username ?? 'Unbekannt';
    const authorIconURL = authorUser?.displayAvatarURL?.();

    const embed = new EmbedBuilder()
        .setColor(0x2f6fed)
        .setTimestamp()
        .setAuthor({ name: authorName, iconURL: authorIconURL })
        .setThumbnail(user.displayAvatarURL())
        .setTitle('Ban wurde aufgehoben')
        .setDescription(`${user} (${user.tag}) wurde entbannt.`)
        .addFields(
            { name: 'Account erstellt am', value: formatGermanDate(user.createdAt), inline: true },
            { name: 'Account Alter', value: formatAccountAge(user.createdAt), inline: true },
            { name: 'Entbannt von', value: moderator, inline: false },
            { name: 'Grund', value: reason, inline: false },
        );

    try {
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Fehler beim Senden der Unban-Benachrichtigung:', error);
    }
}
