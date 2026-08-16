import { EmbedBuilder } from '@discordjs/builders';
import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

export const name = 'guildBanAdd';
export const once = false;

export async function execute(ban) {
    const guild = ban.guild;
    const user = ban.user;
    console.log(`[guildBanAdd] Event empfangen fuer User ${user.id} in Guild ${guild.id}`);
    let logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

    if (!logChannel) {
        try {
            logChannel = await guild.channels.fetch(process.env.LOG_CHANNEL_ID);
        } catch (error) {
            console.warn('Log-Channel konnte nicht geladen werden:', error);
        }
    }

    if (!logChannel || !logChannel.isTextBased()) {
        console.warn('Kein gueltiger Log-Channel fuer guildBanAdd gefunden.');
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

    let banEntry = null;
    const canReadAuditLogs = guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog);

    if (canReadAuditLogs) {
        try {
            const banAuditLogs = await guild.fetchAuditLogs({
                limit: 5,
                type: AuditLogEvent.MemberBanAdd,
            });

            banEntry = banAuditLogs.entries.find((entry) => {
                const isSameTarget = entry.target?.id === user.id;
                const isRecent = Date.now() - entry.createdTimestamp < 15000;
                return isSameTarget && isRecent;
            }) ?? null;
        } catch (error) {
            console.warn('Konnte Audit Logs nicht lesen, Ban-Details unvollständig:', error);
        }
    }

    const moderator = banEntry?.executor
        ? `${banEntry.executor} (${banEntry.executor.tag})`
        : 'Unbekannt';
    const reason = banEntry?.reason ?? 'Kein Grund angegeben';

    const authorUser = banEntry?.executor ?? guild.client.user;
    const authorName = authorUser?.globalName ?? authorUser?.username ?? 'Unbekannt';
    const authorIconURL = authorUser?.displayAvatarURL?.();

    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTimestamp()
        .setAuthor({ name: authorName, iconURL: authorIconURL })
        .setThumbnail(user.displayAvatarURL())
        .setTitle('Mitglied wurde gebannt')
        .setDescription(`${user} (${user.tag}) wurde vom Server gebannt.`)
        .addFields(
            { name: 'Account erstellt am', value: formatGermanDate(user.createdAt), inline: true },
            { name: 'Account Alter', value: formatAccountAge(user.createdAt), inline: true },
            { name: 'Gebannt von', value: moderator, inline: false },
            { name: 'Grund', value: reason, inline: false },
        );

    try {
        await logChannel.send({ embeds: [embed] });
        console.log('[guildBanAdd] Ban-Benachrichtigung erfolgreich gesendet.');
    } catch (error) {
        console.error('Fehler beim Senden der Ban-Benachrichtigung:', error);
    }
}
