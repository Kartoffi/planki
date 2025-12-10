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
        console.log('Setting "Entferne neue User, deren Account X Tage alt ist" wurde deaktiviert oder nicht gefunden. Überspringe Prüfung.');
        return;
    }

    const daysThreshold = parseInt(kickFreshAccountsSetting.rows[0].value, 10);
    const accountAgeInDays = (Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (accountAgeInDays < daysThreshold) {
        const guild = member.guild;
        const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTimestamp()
            .setThumbnail(member.user.displayAvatarURL());

        // Kick the member
        if (member.kickable) {

            await member.kick(`Account ist nur ${Math.floor(accountAgeInDays)} Tage alt, Schwellenwert ist ${daysThreshold} Tage.`);
            if (logChannel && logChannel.isTextBased()) {
                embed.setTitle('Neues Mitglied gekickt wegen jungem Account')
                    .setDescription(`Das Mitglied ${member.user} (${member.user.tag}) wurde gekickt, da sein Account nur ${Math.floor(accountAgeInDays)} Tage alt ist.\n\nAktuelle Einstellung: ${daysThreshold} Tage`);
                logChannel.send({ embeds: [embed] });
            } else {
                console.log(`Person ${member.user.tag} wurde wegen jungem Account (nur ${Math.floor(accountAgeInDays)} Tage alt) gekickt.`);
            }

            return;
        }

        if (logChannel && logChannel.isTextBased()) {
            embed.setTitle('Kicken wegen jungem Account fehlgeschlagen')
                .setDescription(`Konnte ${member.user} (${member.user.tag}) nicht kicken, da Nutzer nicht gekickt werden kann.`);
            logChannel.send({ embeds: [embed] });
        } else {
            console.log(`Konnte ${member.user.tag} nicht kicken, da Nutzer nicht gekickt werden kann.`);
        }
    }
}