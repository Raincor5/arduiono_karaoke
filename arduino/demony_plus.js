const five = require("johnny-five");

// --- Конфигурация ---
const BPM = 148;
const BEAT_MS = (60 / BPM) * 1000;

// --- Прогрессия ---
const chordsFull = [
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G", null],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
];

const lyricsSplit = [
    ["Ya otpravlyus v dalniy put", "i zabudu sigarety na balkone",
        "Ya vernus i posmotryu", "v zerkalo na poroge"],
    ["Chtoby demony, demony, demony", "menya ne odoleli",
        "Demony, demony, demony", "menya ne odoleli", "Tvoj drug"],
    ["Ya otpravlyus v dalniy put", "i zabudu sigarety na balkone",
        "Ya vernus i posmotryu", "v zerkalo na poroge"],
    ["Chtoby demony, demony, demony", "menya ne odoleli",
        "Demony, demony, demony", "menya ne odoleli"],
    ["Ya otpravlyus v dalniy put", "i zabudu sigarety na balkone",
        "Ya vernus i posmotryu", "v zerkalo na poroge"],
    ["Chtoby demony, demony, demony", "menya ne odoleli",
        "Demony, demony, demony", "menya ne odoleli"],
];

// --- Маппинг аккордов на ноты ---
const chordMap = {
    C:  ["C5", "E5", "G5"],
    Am: ["A4", "C5", "E5"],
    Em: ["E4", "G4", "B4"],
    G:  ["G4", "B4", "D5"],
};

// --- Функция генерации ---
function createMelody(chords, bpm = 120) {
    const beat = (60 / bpm) * 1000;
    const eighth = beat / 2;
    const melody = [];
    const ARP_IDX = [0, 1, 2, 1, 0, 1, 2, 1];

    for (const bar of chords) {
        for (const ch of bar) {
            if (!ch) {
                for (let i = 0; i < 8; i++) melody.push([null, eighth]);
                continue;
            }
            const notes = chordMap[ch];
            for (const idx of ARP_IDX) melody.push([notes[idx], eighth]);
        }
    }
    return melody;
}

// --- Генерация ---
const melody = createMelody(chordsFull, BPM);
console.table(melody);

new five.Board().on("ready", function () {
    const board = this;
    const piezo  = new five.Piezo(9);
    const button = new five.Button({ pin: 8, isPullup: true });

    // ✅ LCD wiring: RS=11, E=12, D4–D7=5–2
    const lcd = new five.LCD({ pins: [11, 12, 5, 4, 3, 2], rows: 2, cols: 16 });
    lcd.noAutoscroll().noCursor().noBlink();

    lcd.commandDelay = 12;
    lcd.clearDelay   = 8;
    lcd.printDelay   = 8;

    function translitRu(s) {
        if (!s) return "";
        const map = {'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya','а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
        return String(s).replace(/[\u0400-\u04FF]/g, ch => map[ch] ?? '?');
    }

    function writeBothRows(fullText) {
        const ascii = translitRu(fullText).padEnd(32, " ").slice(0, 32);
        const line0 = ascii.slice(0, 16);
        const line1 = ascii.slice(16, 32);
        lcd.cursor(0, 0).print(line0);
        board.wait(20, () => lcd.cursor(1, 0).print(line1));
    }

    // --- Deterministic Queue Player ---
    function runSequence() {
        const melody = createMelody(chordsFull, BPM);
        const chordsFlat = chordsFull.flat();
        const lyricsFlat = lyricsSplit.flat();
        const slots = Math.min(chordsFlat.length, lyricsFlat.length);
        const NOTES_PER_SLOT = 8;

        const queue = [];

        // Build event queue
        for (let i = 0; i < melody.length; i++) {
            const [note, duration] = melody[i];
            const slotIndex = Math.floor(i / NOTES_PER_SLOT);
            const phrase = lyricsFlat[slotIndex] ?? "";

            if (i % NOTES_PER_SLOT === 0) {
                queue.push({ type: "lyric", phrase });
            }
            queue.push({ type: "tone", note, duration });
        }

        let idx = 0;
        function next() {
            if (idx >= queue.length) {
                // Wait 700ms to ensure last glitch or tone fully finishes
                board.wait(700, () => {
                    piezo.noTone();
                    writeBothRows("Karaoke: press btn");
                    isPlaying = false;
                    console.log("🎵 Sequence finished cleanly");
                });
                return;
            }


            const ev = queue[idx++];
            switch (ev.type) {
                case "lyric": {
                    const phrase = ev.phrase;
                    const isDemon = /demony/i.test(phrase);

                    if (isDemon) {
                        const glitch = () => writeBothRows(
                            Array.from({ length: 32 },
                                () => String.fromCharCode(Math.floor(Math.random() * 64) + 32)
                            ).join("")
                        );

                        glitch();
                        board.wait(150, glitch);
                        board.wait(300, glitch);
                        board.wait(450, () => writeBothRows(phrase));
                        board.wait(600, next); // resume only after full recovery
                        return;
                    } else {
                        writeBothRows(phrase);
                        board.wait(40, next);
                        return;
                    }
                }

                case "tone": {
                    const { note, duration } = ev;
                    if (note) {
                        const freq = five.Piezo.Notes[note.toLowerCase()];
                        piezo.frequency(freq, duration);
                    } else {
                        piezo.noTone();
                    }
                    board.wait(duration, next);
                    return;
                }

                default:
                    board.wait(10, next);
            }
        }

        next();
    }

    // --- UI control ---
    lcd.clear();
    writeBothRows("Karaoke: press btn");

    let isPlaying = false;

    button.on("press", () => {
        if (!isPlaying) {
            console.log("▶️ Starting deterministic playback...");
            isPlaying = true;
            runSequence();
        }
    });

    button.on("hold", () => {
        console.log("⏹️ Stopping...");
        isPlaying = false;
        piezo.noTone();
        writeBothRows("Karaoke: press btn");
    });

    console.log("Ready! Press button to play, hold to stop.");
});
