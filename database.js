import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool, Client } = pg;

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

const defaultReminderChannelId = process.env.LOG_CHANNEL_ID || null;

// ========================================
// USERS TABELLE
// ========================================

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR NOT NULL,
    color_role_id VARCHAR
  )
`);

// ========================================
// SETTINGS TABELLE
// ========================================

await pool.query(`
  CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    setting_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    type VARCHAR NOT NULL DEFAULT 'string',
    setting_is_active BOOLEAN DEFAULT TRUE
  )
`);

// ========================================
// DEFAULT ROLES TABELLE
// ========================================

await pool.query(`
  CREATE TABLE IF NOT EXISTS default_roles (
    id SERIAL PRIMARY KEY,
    role_id VARCHAR NOT NULL
  )
`);

// ========================================
// MESSAGE TRIGGERS TABELLE
// ========================================

await pool.query(`
  CREATE TABLE IF NOT EXISTS message_triggers (
    id SERIAL PRIMARY KEY,
    trigger VARCHAR NOT NULL,
    response VARCHAR NOT NULL,
    match_mode VARCHAR NOT NULL DEFAULT 'contains',
    allow_inside_word BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR NOT NULL,
    updated_at TIMESTAMP,
    updated_by VARCHAR
  )
`);

// ========================================
// BUMP REMINDERS TABELLE
// ========================================

await pool.query(`
  CREATE TABLE IF NOT EXISTS bump_reminders (
    guild_id VARCHAR PRIMARY KEY,
    channel_id VARCHAR,
    ping_role_id VARCHAR,
    remind_at TIMESTAMPTZ,
    reminder_sent BOOLEAN NOT NULL DEFAULT TRUE
  )
`);


// ========================================
// HALLOWEEN EVENT USERS
// ========================================

await pool.query(`
  CREATE TABLE IF NOT EXISTS halloween_event_users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(255) NOT NULL,
    event_id INT NOT NULL
      REFERENCES halloween_events(id)
      ON DELETE CASCADE,
    time TIMESTAMP,
    collected_sweets_amount INTEGER NOT NULL DEFAULT 10,
    CONSTRAINT halloween_event_users_unique
      UNIQUE (discord_id, event_id)
  )
`);

// ========================================
// HALLOWEEN EVENTS TABELLE
// ========================================

await pool.query(`
  CREATE TABLE IF NOT EXISTS halloween_events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message VARCHAR(2000) NOT NULL,
    reaction_emoji VARCHAR(255),
    posting_interval_start TIMESTAMP NOT NULL,
    scheduled_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ
  )
`);

// Falls halloween_events bereits existiert, fehlende Spalten ergänzen.
await pool.query(`
  ALTER TABLE halloween_events
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ
`);

await pool.query(`
  ALTER TABLE halloween_events
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
`);

await pool.query(`
  ALTER TABLE halloween_events
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ
`);

// Fehlende Halloween-Scheduler-Spalten ergänzen
await pool.query(`
  ALTER TABLE halloween_events
  ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(20)
`);

await pool.query(`
  ALTER TABLE halloween_events
  ADD COLUMN IF NOT EXISTS last_error TEXT
`);

await pool.query(`
  ALTER TABLE halloween_events
  ALTER COLUMN message TYPE VARCHAR(5000)
`);

// ========================================
// FEHLENDE MESSAGE-TRIGGER-SPALTEN ERGÄNZEN
// ========================================

await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'message_triggers'
        AND column_name = 'match_mode'
    ) THEN
      ALTER TABLE message_triggers
      ADD COLUMN match_mode VARCHAR NOT NULL DEFAULT 'contains';
    END IF;
  END
  $$;
`);

await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'message_triggers'
        AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE message_triggers
      ADD COLUMN updated_at TIMESTAMP;
    END IF;
  END
  $$;
`);

await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'message_triggers'
        AND column_name = 'updated_by'
    ) THEN
      ALTER TABLE message_triggers
      ADD COLUMN updated_by VARCHAR;
    END IF;
  END
  $$;
`);

await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'message_triggers'
        AND column_name = 'allow_inside_word'
    ) THEN
      ALTER TABLE message_triggers
      ADD COLUMN allow_inside_word BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  END
  $$;
`);

// ========================================
// UNIQUE CONSTRAINTS
// ========================================

await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'settings_id_unique'
    ) THEN
      ALTER TABLE settings
      ADD CONSTRAINT settings_id_unique UNIQUE (setting_id);
    END IF;
  END
  $$;
`);

await pool.query(`
  INSERT INTO settings (
    setting_id,
    name,
    value,
    type,
    setting_is_active
  )
  VALUES (
    'remove_users_by_account_age',
    'Entferne neue User, deren Account unter X Tage alt ist',
    '14',
    'number',
    TRUE
  )
  ON CONFLICT (setting_id) DO NOTHING;
`);

await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'users_discord_id_unique'
    ) THEN
      ALTER TABLE users
      ADD CONSTRAINT users_discord_id_unique UNIQUE (discord_id);
    END IF;
  END
  $$;
`);

// ========================================
// HALLOWEEN DATEN EINFÜGEN
// ========================================

await pool.query(`
  INSERT INTO halloween_events (
    title,
    message,
    reaction_emoji,
    posting_interval_start
  )
  VALUES ($1, $2, $3, $4)
`, [
  "Kapitel 1 - Möge das Süßigkeitensammeln beginnen!",
  `Die Kinder des Gruselreiches versammeln sich auf dem Marktplatz, wo der große Scraff-o-Lantern alljährlich seine große Halloween-Rede schwingt.
  \n*„Liebe Kinder, es ist wieder soweit: Wie jedes Jahr seid ihr dazu verdammt, mir seeehr viele, schmackhafte Leckereien zu bringen! Bis 23 Uhr habt ihr Zeit, die Nachbarschaft unsicher zu machen und Süßigkeiten einzusacken. Viel Erfolg dabei!“*
  \nEines der Kinder, die kleine Hexe, hat sich fest vorgenommen, dieses Jahr erfolgreich zu sein. Als es jedoch an die Gruppeneinteilung geht, ist sie sehr enttäuscht: Sie wird mit dem Skelett und der Fledermaus, den unbeliebtesten Kids des ganzen Gruselreichs, in einer Gruppe sein - oh Schreck!
  \nDas Skelett scheint ihren Unmut zu bemerken. *„Keine Sorge, kleine Hexe, ich hab ganz schön Biss, das schaffen wir schon!“* *„Na sicher doch …“,* erwidert die Fledermaus gequält. 
  \nDas humorvolle Skelett und die mies gelaunte Fledermaus … Ob das mit den beiden wohl was werden wird?
  \nAls Startgeschenk nimmt sich jede Gruppe ein paar Bonbons und dann geht die Reise auch schon los!`,
  "🍬",
  "2026-10-28 16:00:00"
]);

console.log("[HALLOWEEN] Eintrag für Kapitel 1 - Möge das Süßigkeitensammeln beginnen! wurde gespeichert.");

await pool.query(`
  INSERT INTO halloween_events (
    title,
    message,
    reaction_emoji,
    posting_interval_start
  )
  VALUES ($1, $2, $3, $4)
`, [
  "Kapitel 2 - Verwirrung",
  `Unzufrieden stapft die kleine Hexe gemeinsam mit ihren Begleitern, dem unlustigen Skelett und der pessimistischen Fledermaus, um die Häuser, um möglichst viele Süßigkeiten zu sammeln. Bisher ist ihre Ausbeute nicht sehr groß. Aus irgendeinem Grund sind bei den meisten Häusern, wo sie vorbeikommen, die Süßigkeiten bereits fast komplett weg, dabei haben sie wie die anderen Kinder gerade erst angefangen! Außerdem hat sie extra den Plan ausgeheckt, dort anzufangen, wo die wenigsten Konkurrenten starten. Sehr ungewöhnlich findet sie das.
  \n*„Wie kann es denn sein, dass es jetzt schon kaum noch Süßigkeiten mehr zu holen gibt? Da steckt doch garantiert die Unruhestifter-Gruppe hinter!“*, meckert die kleine Hexe. Sie bezieht sich dabei auf die drei schrecklichsten Kinder des ganzen Gruselreiches: Die gewiefte Schlange, die gemeine Ratte und die verrückte Spinne. Die letzten Jahre haben diese drei auch immer den Sieg geholt und dabei überraschend viele Süßigkeiten präsentieren können. Ob es da immer so fair zuging? Die kleine Hexe hegt da ihre Zweifel. Deswegen ist sie umso angespornter die drei Schufte endlich zu schlagen. Dieses Jahr soll es endlich soweit sein. Jedoch wird das mit ihrer aktuellen Truppe etwas... schwierig.
  \n*„Kann man nichts machen, guck dir doch an wie erfolglos wir bisher sind, ist doch alles total hoffnungslos. Wir sind wohl dazu bestimmt zu versagen …“*, kommentiert die Fledermaus emotionslos. *„Mit dieser Einstellung willst du Scraff-o-Lantern später entgegentreten? Zeig mal ein bisschen mehr Kampfgeist!“*, entgegnet die kleine Hexe. *„Wir schaffen das schon! Vielleicht wird es nicht ganz so einfach, aber wir dürfen nicht direkt schon so einfach aufgeben!“*, entgegnet sie energisch. *„Ist schon echt ein Knochenjob, aber dafür bin ich ja genau der Richtige!“*, protzt das Skelett. Die kleine Hexe reagiert auf seine Bemerkung mit einem leichten Seufzer und schaute dabei zu Boden. 
  \nDa bemerkt sie ein paar Meter vor sich auf einmal ein paar Lollipops, die auf den Boden verstreut liegen. *„Hey Jungs, schaut mal! Glück im Unglück!“* Schnell beugen sie sich runter und greifen nach den Leckereien.`,
  "🍭",
  "2026-10-28 17:00:00"
]);

console.log("[HALLOWEEN] Eintrag für Kapitel 2 - Verwirrung wurde gespeichert.");

await pool.query(`
  INSERT INTO halloween_events (
    title,
    message,
    reaction_emoji,
    posting_interval_start
  )
  VALUES ($1, $2, $3, $4)
`, [
  "Kapitel 3 - Vermutung",
  `*„Tut mir leid, Kinder, aber alles bereits leer.“*
  \nDas ist nun das fünfte Haus, wo sie klingeln, und dabei erfolglos nach Süßigkeiten fragen. *„Irgendwas stimmt hier doch ganz und gar nicht“*, sagt die kleine Hexe verdutzt. *„Allerdings, ich hätte schwören können, es wäre noch einiges in der Schüssel übrig, aber da habe ich mich wohl geirrt“*, erwidert der Hausherr, wo sie gerade geklingelt haben. *„Momentchen mal, wenn Sie sich da so sicher sind, vielleicht ist dann ein Süßigkeiten-Dieb unterwegs?“*, fragt das Skelett nachdenklich. Endlich macht er mal eine nützliche Äußerung, denkt sich die kleine Hexe, und steigt mit ein. *„Ja, da stecken sicher die Unruhestifter dahinter, jede Wette! Es wird Zeit, dass wir die mal zur Rede stellen! Das ist den anderen Gruppen gegenüber total unfair!“* *„Finden wir auch.“*
  \nEine andere Gruppe taucht auf, es spricht ein Zombie-Junge. *„Wir haben gesehen, wie die Unruhestifter gerade in diese Straße abgebogen sind, vielleicht könnt ihr sie noch einholen, wir verfolgen sie die ganze Zeit erfolglos.“* *„Nimm's mir nicht krumm, aber bei deinem Schneckentempo wundert mich das nicht, Kumpel“*, scherzte das Skelett und bezieht sich dabei auf das Klischee, dass Zombies alle sehr langsam unterwegs seien. Der Zombiejunge lacht darüber sogar, aber die kleine Hexe will sich nicht länger mit so einem Unsinn aufhalten lassen. *„Danke dir für die Auskunft! Wir werden sie verfolgen!“* *„Moment!“*, ruft der Hausherr ihnen plötzlich hinterher.
  \n*„Ich habe in der hintersten Ecke eines Küchenschrankes noch etwas Schokolade gefunden, die könnt ihr haben.“* Die Gruppe der Hexe nimmt dankend die Schokolade an sich und macht sich auf die Suche nach den Unruhestiftern.`,
  "🍫",
  "2026-10-28 18:00:00"
]);

console.log("[HALLOWEEN] Eintrag für Kapitel 3 - Vermutung wurde gespeichert.");

await pool.query(`
  INSERT INTO halloween_events (
    title,
    message,
    reaction_emoji,
    posting_interval_start
  )
  VALUES ($1, $2, $3, $4)
`, [
  "Kapitel 4 - Geheimnis gelüftet",
  `Sie biegen gerade in die Straße ein, welche der Zombiejunge erwähnt hat, als sie plötzlich auf die Unruhestifter-Gruppe und eine weitere Gruppe treffen. Bei der anderen Gruppe handelt es sich um die Drillings-Mäuse. Was ein Zufall, dass die drei Geschwister für die gleiche Gruppe ausgelost wurden. Zu ihrem Entsetzen bedroht die Unruhestifter-Gruppe die armen Mäuse. 
  \n*„Kommt schon, rückt euren Süßkram raus! Sonst setzt es was!“*, spricht die Ratte. *„Seid nicht dumm und tut, was die Ratte sagt, ihr wollt doch nicht, dass euch etwas zustößt, oder?“*, fügt die Schlange einschüchternd hinzu. *„HEY! Was glaubt ihr, was ihr da treibt?!“*, brüllt die Hexe und läuft auf die beiden Gruppen zu. Das Skelett und die Fledermaus folgen ihr dicht auf den Fersen. *„Soso, wen haben wir denn hier? Die Versagergruppe der kleinen Hexe, ooooh, wir haben ja soooolche Angst!“*, sagt die Spinne belustigt. *„Ach, ihr Spinnen seid doch alle gleich: Große Klappe im Netz, aber wenn man den Staubsauger anmacht, fangt ihr an zu rennen“*, sagt das Skelett lässig und unbeeindruckt. Sogar die kleine Hexe muss bei dieser Bemerkung etwas schmunzeln. *„DU!“*, zischt die Spinne. *„Zischen? Überlass' das mal lieber deinem Schlangenfreund. Bedrohlich wirkst du ja nicht gerade, was?“*, sagt das Skelett amüsiert. Bis auf die Unruhestifter-Gruppe fangen alle an zu lachen. *„Dafür haben wir keine Zeit, Leute, kommt, wir ziehen weiter!“*, drängt die Schlange und die Bande verschwindet.
  \n*„Vielen Dank, dass ihr euch für uns eingesetzt habt!“*, sagt eine der Mäuse. *„Aber was ist denn nur passiert, dass sie euch so dermaßen bedroht haben?“*, fragt die Fledermaus mitfühlend. *„Sie wollten uns alle Süßigkeiten wegnehmen, weil wir versucht haben, sie zur Rede zu stellen, aber das ging nicht so gut. Sie fühlten sich wohl durch uns bedroht und wollten uns dafür bestrafen“*, antwortet eine Maus. *„Zur Rede stellen? Wegen was?“*, hakt das Skelett neugierig nach. *„Wir haben sie dabei erwischt, wie sie von einem Hausbewohner alle Süßigkeiten geklaut haben. Die Schlange hat den Hausbewohner in ein Gespräch verwickelt, während die Spinne und die Ratte reingeschlichen sind. Die Spinne nahm alle Süßigkeiten, während die Ratte ein Fenster öffnete, damit sie wieder fliehen konnten.“* *„Das ist ja zum aus der Haut fahren! Ach Moment, das geht ja bei mir eh nicht“*, witzelt das Skelett. Die kleine Hexe ignoriert ihn.
  \n*„Ah-HAH! Ich wusste, da stimmt irgendwas nicht!“*, ruft sie triumphierend. *„Es wird Zeit, dass wir die Gruppe ein für alle Mal aufhalten, nicht wahr, Jungs?“* Das Skelett und die Fledermaus wirken nicht so überzeugt, aber das entgeht der Hexe.
  \n*„Bevor ihr aufbrecht, wollten wir uns erkenntlich zeigen: Hier, nehmt ein paar unserer Donuts! Viel Glück, wir drücken euch die Daumen!“* Die Heldengruppe bedankt sich bei den Mäusen, anschließend ziehen sie weiter.`,
  "🍩",
  "2026-10-28 19:00:00"
]);

console.log("[HALLOWEEN] Eintrag für Kapitel 4 - Geheimnis gelüftet wurde gespeichert.");

await pool.query(`
  INSERT INTO halloween_events (
    title,
    message,
    reaction_emoji,
    posting_interval_start
  )
  VALUES ($1, $2, $3, $4)
`, [
  "Kapitel 5 - Getrennte Wege",
  `*„Hey, Hexe. Sollten wir uns nicht lieber darauf fokussieren, weitere Süßigkeiten zu sammeln, statt der Gruppe hinterherzujagen?“*, fragt das Skelett die Hexe. *„Aber schau doch, wie viel Leid sie schon angerichtet haben! Das willst du ihnen durchgehen lassen?“*, fragt die Hexe ungläubig. *„Nein, ich find es ja auch mies, aber wir verlieren unser Ziel vor Augen“*, kontert das Skelett. *„Und dabei hab ich nicht mal welche“*, muss er natürlich noch hinzufügen.
  \nAuch die Fledermaus pflichtet dem Skelett bei. *„Hör mal, ich finde das auch nicht in Ordnung und mir tun die Kinder, die durch die Unruhestifter belästigt wurden, auch sehr leid. Aber was können wir da schon groß ausrichten?“*, fragt die Fledermaus verzweifelt. Die Hexe ist langsam sichtlich verärgert von ihren Gruppenmitgliedern.
  \n*„Wisst ihr was? Okay, fein. Macht, was ihr wollt, reiß DU weiter deine dummen, unpassenden Witze und sei DU einfach ein unerträglicher Trauerkloß. ICH mache das, was richtig ist, und werde der Gruppe ordentlich in ihren Hintern treten und sie für ihre ekelhaften Taten bezahlen lassen!“* *„Hey Hexe, warte!“*, versucht das Skelett sie noch aufzuhalten, aber da stapft sie schon beleidigt und traurig davon.
  \nSo gehen die beiden verbliebenen Gruppenmitglieder einige Zeit alleine weiter. *„Ich mache mir Sorgen, sie wird sich sowas von in Gefahr begeben …“*, äußert die Fledermaus ihren Unmut. *„Das fürchte ich auch“*, erwidert das Skelett. *„Vielleicht hätte ich diesmal einfach mein Gebiss halten sollen. Weißt du was? Lass' uns ihr schnell nachlaufen, bevor ihr noch etwas zustößt!“*
  \nNun ganz allein unterwegs versucht die Hexe herauszufinden, wo die Unruhestifter hingegangen sind. Ein Schauer läuft ihr über den Rücken, als sie plötzlich ein lautes Weinen hört. Sie versucht, die Ursache zu finden, und wird schnell fündig: Vor einem Haus sitzt ein Vampirjunge und weint sich die Seele aus dem Leib, an seiner Seite seine Mutter. *„Das wird schon wieder, mein Schatz.“*
  \nDie Hexe tritt näher: Der Junge hat eine Wunde am Knie. *„Oh Vampir, bist du hingefallen?“*, fragt die Hexe besorgt. *„Ein Rattenjunge hat ihn beim Vorbeigehen geschubst, dabei hat er sich das Knie aufgeschürft. Ich wollte ihn eigentlich belehren, aber da war er schon verschwunden, und anscheinend hat er sogar ein paar Süßigkeiten aus dem Beutel meines Sohnes geklaut. So ein schreckliches Benehmen!“*, beklagt sich die Mutter, sichtlich verärgert. Auch in der kleinen Hexe kocht die Wut hoch, aber statt ihrem Ärger freien Lauf zu lassen, gibt es Wichtigeres zu tun.
  \n*„Zeig mal das Knie. Ich muss zwar noch einiges lernen, aber die kleine Wunde sollte ich mit meiner Magie heilen können.“* Sie hält ihre Hände über das Knie des Vampirjungen, die Augen geschlossen, einen Zauber murmelnd, und schon ist das Knie verheilt. *„Oh danke dir, kleine Hexe! Es ist schön zu sehen, dass es auch so nette und hilfsbereite Kinder wie dich gibt!“*, sagt die Mutter strahlend. Der kleine Vampirjunge schaut bewundernd zu ihr hoch. *„Danke, Hexe, ich fühle mich jetzt viel besser!“*
  \nDie Mutter streckt ihr ein paar Kekse hin. *„Hier, nimm! Das ist das Mindeste, was ich tun kann. Ich wünsche dir viel Erfolg beim Süßigkeitensammeln!“* Die kleine Hexe bedankt sich herzlich bei der Mutter und zieht weiter auf der Suche nach den Unruhestiftern.`,
  "🍪",
  "2026-10-28 20:00:00"
]);

  console.log("[HALLOWEEN] Eintrag für Kapitel 5 - Getrennte Wege wurde gespeichert.");

  

// ========================================
// DATENBANK-CLIENT FÜR DEN BOT
// ========================================

const db = new Client({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

await db.connect();

export { db };