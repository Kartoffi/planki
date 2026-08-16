import { EmbedBuilder } from '@discordjs/builders';
import { db } from '../database.js';
import dotenv from 'dotenv';
dotenv.config();

export const name = "guildMemberAdd";
export const once = false;

export async function execute(member) {

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

    const kickFreshAccountsSetting = await db.query(
        'SELECT value FROM settings WHERE setting_id = $1 AND setting_is_active = TRUE',
        ['remove_users_by_account_age']
    );

    if (kickFreshAccountsSetting.rows.length === 0) {
        console.log('Setting "Entferne neue User..." deaktiviert oder nicht gefunden. Überspringe Prüfung.');
        return;
    }

    const daysThreshold = parseInt(kickFreshAccountsSetting.rows[0].value, 10);

    const user = await member.client.users.fetch(member.user.id, { force: true });

    const diffMs = Date.now() - user.createdAt.getTime();
    const accountAgeInDays = diffMs / 86400000;
    const accountAgeInDaysFloored = Math.floor(accountAgeInDays);

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

    if (accountAgeInDays < daysThreshold) {

        const guild = member.guild;
        const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTimestamp()
            .setThumbnail(user.displayAvatarURL());

        if (member.kickable) {

            await member.kick(
                `Account ist nur ${accountAgeInDaysFloored} Tage alt, Schwellenwert ist ${daysThreshold} Tage.`
            );

            if (logChannel && logChannel.isTextBased()) {
                embed
                    .setTitle('Neues Mitglied gekickt wegen jungem Account')
                    .setDescription(
                        `Das Mitglied ${user} (${user.tag}) wurde gekickt, da sein Account nur ${accountAgeInDaysFloored} Tage alt ist.\n\nAktuelle Einstellung: ${daysThreshold} Tage`
                    );

                logChannel.send({ embeds: [embed] });
            } else {
                console.log(
                    `Person ${user.tag} wurde gekickt (Account: ${accountAgeInDaysFloored} Tage alt).`
                );
            }

            return;
        }

        if (logChannel && logChannel.isTextBased()) {
            embed
                .setTitle('Kicken wegen jungem Account fehlgeschlagen')
                .setDescription(
                    `Konnte ${user} (${user.tag}) nicht kicken, da Nutzer nicht gekickt werden kann.`
                );

            logChannel.send({ embeds: [embed] });
        } else {
            console.log(`Konnte ${user.tag} nicht kicken.`);
        }
    }

    // send notification to log channel that someone joined the server
    const logChannel = member.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor(0x77eb34)
            .setTimestamp()
            .setAuthor({ name: member.client.user.username, iconURL: member.client.user.displayAvatarURL() })
            .setThumbnail(member.user.displayAvatarURL())
            .setTitle('Neues Mitglied beigetreten')
            .setDescription(
                `${member.user} (${member.user.tag}) ist dem Server beigetreten.`
            )
            .addFields(
                { name: 'Server beigetreten am', value: formatGermanDate(member.joinedAt), inline: false },
                { name: 'Account erstellt am', value: formatGermanDate(member.user.createdAt), inline: true },
                { name: 'Account Alter', value: formatAccountAge(member.user.createdAt), inline: true },
            );

        logChannel.send({ embeds: [embed] });
    }

    // add default roles to new member
    const defaultRolesRes = await db.query('SELECT role_id FROM default_roles');
    const defaultRoles = defaultRolesRes.rows.map(row => row.role_id);

    for (const roleId of defaultRoles) {
        const role = member.guild.roles.cache.get(roleId);
        if (role) {
            try {
                await member.roles.add(role);
            } catch (error) {
                console.error(`Fehler beim Hinzufügen der Rolle ${role.name} zu ${member.user.tag}:`, error);

                if (logChannel && logChannel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTimestamp()
                        .setTitle('Fehler beim Hinzufügen der Standardrolle')
                        .setDescription(
                            `Konnte die Rolle <@&${roleId}> nicht zu ${member.user} (${member.user.tag}) hinzufügen.`
                        );

                    logChannel.send({ embeds: [embed] });
                }
            }
        } else {
            console.warn(`Rolle mit ID ${roleId} existiert nicht auf dem Server.`);

            if (logChannel && logChannel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTimestamp()
                    .setTitle('Fehler beim Hinzufügen der Standardrolle - Rolle existiert nicht')
                    .setDescription(
                        `Die Rolle mit der ID ${roleId} existiert nicht auf diesem Server.`
                    );

                logChannel.send({ embeds: [embed] });
            }
        }
    }
}
