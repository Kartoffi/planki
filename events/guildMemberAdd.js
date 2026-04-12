import { EmbedBuilder } from '@discordjs/builders';
import { db } from '../database.js';
import dotenv from 'dotenv';
dotenv.config();

export const name = "guildMemberAdd";
export const once = false;

export async function execute(member) {

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

    if (accountAgeInDays < daysThreshold) {

        const guild = member.guild;
        const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTimestamp()
            .setThumbnail(user.displayAvatarURL());

        if (member.kickable) {

            await member.kick(
                `Account ist nur ${accountAgeInDays.toFixed(2)} Tage alt, Schwellenwert ist ${daysThreshold} Tage.`
            );

            if (logChannel && logChannel.isTextBased()) {
                embed
                    .setTitle('Neues Mitglied gekickt wegen jungem Account')
                    .setDescription(
                        `Das Mitglied ${user} (${user.tag}) wurde gekickt, da sein Account nur ${accountAgeInDays.toFixed(2)} Tage alt ist.\n\nAktuelle Einstellung: ${daysThreshold} Tage`
                    );

                logChannel.send({ embeds: [embed] });
            } else {
                console.log(
                    `Person ${user.tag} wurde gekickt (Account: ${accountAgeInDays.toFixed(2)} Tage alt).`
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
}
