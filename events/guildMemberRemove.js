import { EmbedBuilder } from '@discordjs/builders';
import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

export const name = "guildMemberRemove";
export const once = false;

export async function execute(member) {
    const guild = member.guild;
    const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

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

    let banEntry = null;
    let kickEntry = null;
    const canReadAuditLogs = guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog);

    if (canReadAuditLogs) {
        try {
            const banAuditLogs = await guild.fetchAuditLogs({
                limit: 5,
                type: AuditLogEvent.MemberBanAdd,
            });

            banEntry = banAuditLogs.entries.find((entry) => {
                const isSameTarget = entry.target?.id === member.user.id;
                const isRecent = Date.now() - entry.createdTimestamp < 15000;
                return isSameTarget && isRecent;
            }) ?? null;

            const kickAuditLogs = await guild.fetchAuditLogs({
                limit: 5,
                type: AuditLogEvent.MemberKick,
            });

            kickEntry = kickAuditLogs.entries.find((entry) => {
                const isSameTarget = entry.target?.id === member.user.id;
                const isRecent = Date.now() - entry.createdTimestamp < 15000;
                return isSameTarget && isRecent;
            }) ?? null;
        } catch (error) {
            console.warn('Konnte Audit Logs nicht lesen, Ban/Kick-Erkennung übersprungen:', error);
        }
    }

    if (logChannel && logChannel.isTextBased()) {
        const isBan = Boolean(banEntry);
        const isKick = Boolean(kickEntry);
        const fields = [
            { name: 'Server beigetreten am', value: formatGermanDate(member.joinedAt), inline: false },
            { name: 'Account erstellt am', value: formatGermanDate(member.user.createdAt), inline: true },
            { name: 'Account Alter', value: formatAccountAge(member.user.createdAt), inline: true },
        ];

        if (isBan) {
            const moderator = banEntry.executor
                ? `${banEntry.executor} (${banEntry.executor.tag})`
                : 'Unbekannt';

            fields.push(
                { name: 'Gebannt von', value: moderator, inline: false },
                { name: 'Grund', value: banEntry.reason ?? 'Kein Grund angegeben', inline: false },
            );
        }

        if (!isBan && isKick) {
            const moderator = kickEntry.executor
                ? `${kickEntry.executor} (${kickEntry.executor.tag})`
                : 'Unbekannt';

            fields.push(
                { name: 'Gekickt von', value: moderator, inline: false },
                { name: 'Grund', value: kickEntry.reason ?? 'Kein Grund angegeben', inline: false },
            );
        }

        const authorUser = isBan ? banEntry?.executor : isKick ? kickEntry?.executor : member.client.user;
        const authorName = authorUser?.tag ?? authorUser?.username ?? 'Unbekannt';
        const authorIconURL = authorUser?.displayAvatarURL?.();

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTimestamp()
            .setAuthor({ name: authorName, iconURL: authorIconURL })
            .setThumbnail(member.user.displayAvatarURL())
            .setTitle(isBan ? 'Mitglied wurde gebannt' : isKick ? 'Mitglied wurde gekickt' : 'Mitglied hat den Server verlassen')
            .setDescription(
                isBan
                    ? `${member.user} (${member.user.tag}) wurde vom Server gebannt.`
                    : isKick
                    ? `${member.user} (${member.user.tag}) wurde vom Server gekickt.`
                    : `${member.user} (${member.user.tag}) hat den Server verlassen.`
            )
            .addFields(fields);

        logChannel.send({ embeds: [embed] });
    }
}
