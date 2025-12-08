import { EmbedBuilder } from '@discordjs/builders';
import dotenv from 'dotenv';
dotenv.config();

export const name = "guildMemberUpdate";
export const once = false;
export async function execute(oldMember, newMember) {
    // if in the roles the ID '' is contained, kick the user and send a message to a specific channel
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));

        if (addedRoles.has(process.env.KICK_ROLE_ID)) {
        const guild = newMember.guild;
        const member = newMember;
        const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTimestamp()
            .setThumbnail(member.user.displayAvatarURL());

        // Kick the member
        if (member.kickable) {

            await member.kick('Unter 18 Jahre alt');
            if (logChannel && logChannel.isTextBased()) {
                embed.setTitle('Mitglied gekickt wegen U18 Rolle')
                    .setDescription(`Das Mitglied ${member.user} (${member.user.tag}) wurde gekickt, da es die U18-Rolle erhalten hat.`)
                logChannel.send({ embeds: [embed] });
            } else {
                console.log(`Person ${member.user.tag} wurde wegen U18 Rolle gekickt.`);
            }

            return;
        }

        if (logChannel && logChannel.isTextBased()) {
            embed.setTitle('Kicken wegen U18 Rolle fehlgeschlagen')
                .setDescription(`Konnte ${member.user} (${member.user.tag}) mit U18-Rolle nicht kicken, da Nutzer nicht gekickt werden kann.`);
            logChannel.send({ embeds: [embed] });
        } else {
            console.log(`Konnte ${member.user.tag} mit U18-Rolle nicht kicken, da Nutzer nicht gekickt werden kann.`);
        }
    }
}