import { EmbedBuilder } from '@discordjs/builders';
import { db } from '../database.js';
import dotenv from 'dotenv';
dotenv.config();

export const name = "guildMemberRemove";
export const once = false;

export async function execute(member) {
    // send notification to log channel that someone left the server
    const logChannel = member.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor(0xcc234d)
            .setTimestamp()
            .setThumbnail(member.user.displayAvatarURL())
            .setTitle('Mitglied hat den Server verlassen')
            .setDescription(
                `${member.user} (${member.user.tag}) hat den Server verlassen.`
            );

        logChannel.send({ embeds: [embed] });
    }
}
