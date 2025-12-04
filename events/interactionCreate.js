export const name = "interactionCreate";
export const once = false;
export async function execute(interaction) {
    const { client } = interaction;
    if(!interaction.isCommand()) return;
    // Befehl holen
    const command = client.commands.get(interaction.commandName);
    // Befehl ausführen
    if(command) {
        try {
            await command.execute(interaction);
        } catch(error) {
            console.error(error);
            if(interaction.deferred || interaction.replied) {
                interaction.editReply("⚠️ Es ist ein Fehler beim Ausführen des Befehls aufgetreten!");
            } else {
                interaction.reply("⚠️ Es ist ein Fehler beim Ausführen des Befehls aufgetreten!");
            }
        }
    }
}