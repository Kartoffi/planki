export const name = 'messageCreate';
export const once = false;

import { db } from '../database.js';
import dotenv from 'dotenv';
dotenv.config();

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function execute(message) {
    if (message.author.bot) return;

    // check database for message trigger words
    const triggers = await db.query('SELECT trigger, response, match_mode, allow_inside_word FROM message_triggers');
    const content = message.content.toLowerCase();

    for (const trigger of triggers.rows) {
        const triggerText = trigger.trigger.toLowerCase();
        const mode = trigger.match_mode || 'contains';
        const allowInsideWord = !!trigger.allow_inside_word;

        let isMatch = false;
        if (mode === 'exact') {
            isMatch = content.trim() === triggerText;
        } else if (allowInsideWord) {
            isMatch = content.includes(triggerText);
        } else {
            const regex = new RegExp(`\\b${escapeRegex(trigger.trigger)}\\b`, 'i');
            isMatch = regex.test(message.content);
        }

        if (isMatch) {
            try {
                await message.reply(trigger.response);
            } catch (error) {
                console.error('Fehler beim Antworten auf eine Nachricht:', error);
            }
            break;
        }
    }
}
