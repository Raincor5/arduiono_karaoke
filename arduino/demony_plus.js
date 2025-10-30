const five = require("johnny-five");

const BPM = 148;
const BEAT = (60 / BPM) * 1000;
const EIGHTH = BEAT / 2;

// --- SONG DATA ---
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

const chordMap = {
    C: ["C5", "E5", "G5"],
    Am: ["A4", "C5", "E5"],
    Em: ["E4", "G4", "B4"],
    G: ["G4", "B4", "D5"],
};

// --- MELODY ---
function createMelody(chords) {
    const ARP = [0, 1, 2, 1, 0, 1, 2, 1];
    const melody = [];
    for (const bar of chords) {
        for (const ch of bar) {
            if (!ch) {
                for (let i = 0; i < 8; i++) melody.push([null, EIGHTH]);
                continue;
            }
            const notes = chordMap[ch];
            for (const idx of ARP) melody.push([notes[idx], EIGHTH]);
        }
    }
    return melody;
}

// --- BOARD SETUP ---
new five.Board().on("ready", function () {
    const board = this;
    const piezo = new five.Piezo(9);
    const button = new five.Button({ pin: 8, isPullup: true });
    const lcd = new five.LCD({ pins: [11, 12, 5, 4, 3, 2], rows: 2, cols: 16 });
    lcd.noAutoscroll().noCursor().noBlink();

    // Deterministic state
    let playing = false;
    let index = 0;
    let timer = null;

    function lcdWrite(text) {
        const t = String(text).padEnd(32, " ").slice(0, 32);
        lcd.cursor(0, 0).print(t.slice(0, 16));
        lcd.cursor(1, 0).print(t.slice(16, 32));
    }

    function lcdGlitch() {
        const rand = () =>
            Array.from({ length: 32 },
                () => String.fromCharCode(Math.floor(Math.random() * 64) + 32)
            ).join("");
        lcdWrite(rand());
    }

    function stopPlayback(resetText = true) {
        if (timer) clearInterval(timer);
        piezo.noTone();
        playing = false;
        if (resetText) lcdWrite("Karaoke: press btn");
    }

    // --- MAIN PLAYER LOOP ---
    function startSong() {
        const melody = createMelody(chordsFull);
        const lyrics = lyricsSplit.flat();
        const NOTES_PER_SLOT = 8;

        index = 0;
        playing = true;
        lcdWrite("Starting...");
        piezo.noTone();

        timer = setInterval(() => {
            if (!playing) return;

            // song end
            if (index >= melody.length) {
                stopPlayback();
                console.log("🎵 Done");
                return;
            }

            const slot = Math.floor(index / NOTES_PER_SLOT);
            const [note, dur] = melody[index];
            const phrase = lyrics[slot] ?? "";
            const isDemon = /demony/i.test(phrase);

            // lyric at start of bar
            if (index % NOTES_PER_SLOT === 0) {
                if (isDemon) {
                    lcdGlitch();
                    setTimeout(() => lcdWrite(phrase), 300);
                } else {
                    lcdWrite(phrase);
                }
            }

            // tone
            if (note) {
                const freq = five.Piezo.Notes[note.toLowerCase()];
                piezo.frequency(freq, dur * 0.9);
            } else {
                piezo.noTone();
            }

            index++;
        }, EIGHTH + 30); // 30ms buffer between notes
    }

    // --- BUTTONS ---
    lcdWrite("Karaoke: press btn");

    button.on("press", () => {
        if (!playing) {
            console.log("▶️ Start");
            startSong();
        } else {
            console.log("⏸ Pause");
            stopPlayback(false);
        }
    });

    button.on("hold", () => {
        console.log("⏹ Stop");
        stopPlayback();
    });

    console.log("Ready! Press button to play, hold to stop.");
});
