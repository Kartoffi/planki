export const name = 'messageCreate';
export const once = false;

import { db } from '../database.js';
import dotenv from 'dotenv';
dotenv.config();

function isWordChar(char) {
    return /[a-z0-9_]/i.test(char);
}

function matchesOnWordBoundaries(content, triggerText) {
    let startIndex = content.indexOf(triggerText);

    while (startIndex !== -1) {
        const endIndex = startIndex + triggerText.length;
        const beforeChar = startIndex > 0 ? content[startIndex - 1] : '';
        const afterChar = endIndex < content.length ? content[endIndex] : '';

        const startsWithWordChar = isWordChar(triggerText[0] || '');
        const endsWithWordChar = isWordChar(triggerText[triggerText.length - 1] || '');

        const beforeBoundaryOk = startIndex === 0 || !startsWithWordChar || !isWordChar(beforeChar);
        const afterBoundaryOk = endIndex === content.length || !endsWithWordChar || !isWordChar(afterChar);

        if (beforeBoundaryOk && afterBoundaryOk) {
            return true;
        }

        startIndex = content.indexOf(triggerText, startIndex + 1);
    }

    return false;
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
            isMatch = matchesOnWordBoundaries(content, triggerText);
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
