const five = require("johnny-five");

// --- CONFIG ---
const BPM = 148;
const BEAT_MS = (60 / BPM) * 1000;

// --- CHORDS ---
const chordsFull = [
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G", null],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
];

// --- LYRICS ---
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

// --- CHORD MAP ---
const chordMap = {
    C: ["C5", "E5", "G5"],
    Am: ["A4", "C5", "E5"],
    Em: ["E4", "G4", "B4"],
    G: ["G4", "B4", "D5"],
};

// --- MELODY GENERATOR ---
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

// --- BOARD ---
new five.Board().on("ready", function () {
    const board = this;
    const piezo = new five.Piezo(9);
    const button = new five.Button({ pin: 8, isPullup: true });
    const lcd = new five.LCD({ pins: [11, 12, 5, 4, 3, 2], rows: 2, cols: 16 });

    lcd.noAutoscroll().noCursor().noBlink();

    // --- SEQUENTIAL EVENT QUEUE ---
    const queue = [];
    let isRunning = false;

    function enqueue(fn, delay = 0) {
        queue.push({ fn, delay });
    }

    function processQueue() {
        if (queue.length === 0) {
            isRunning = false;
            return;
        }

        isRunning = true;
        const { fn, delay } = queue.shift();

        try { fn(); }
        catch (err) { console.warn("Queue step error:", err); }

        board.wait(delay, processQueue);
    }

    function startQueue() {
        if (!isRunning) processQueue();
    }

    // --- LCD WRITER ---
    function lcdWrite(text) {
        const txt = String(text).padEnd(32, " ").slice(0, 32);
        const line1 = txt.slice(0, 16);
        const line2 = txt.slice(16, 32);

        enqueue(() => lcd.cursor(0, 0).print(line1), 50);
        enqueue(() => lcd.cursor(1, 0).print(line2), 50);
    }

    // --- GLITCH EFFECT ---
    function glitchEffect() {
        const rand = () => Array.from({ length: 32 },
            () => String.fromCharCode(Math.floor(Math.random() * 64) + 32)
        ).join("");

        enqueue(() => lcdWrite(rand()), 120);
        enqueue(() => lcdWrite(rand()), 120);
        enqueue(() => lcdWrite(rand()), 120);
    }

    // --- SONG SEQUENCE ---
    function runSequence() {
        const melody = createMelody(chordsFull, BPM);
        const lyricsFlat = lyricsSplit.flat();
        const NOTES_PER_SLOT = 8;

        lcdWrite("Karaoke: playing...");
        enqueue(() => piezo.noTone(), 100);

        for (let i = 0; i < melody.length; i++) {
            const [note, duration] = melody[i];
            const slotIndex = Math.floor(i / NOTES_PER_SLOT);
            const phrase = lyricsFlat[slotIndex] ?? "";
            const isDemon = /demony/i.test(phrase);

            // New lyric start
            if (i % NOTES_PER_SLOT === 0) {
                if (isDemon) {
                    glitchEffect();
                    enqueue(() => lcdWrite(phrase), 300);
                } else {
                    enqueue(() => lcdWrite(phrase), 80);
                }
            }

            // Play tone
            if (note) {
                enqueue(() => {
                    const freq = five.Piezo.Notes[note.toLowerCase()];
                    piezo.frequency(freq, duration);
                }, duration);
            } else {
                enqueue(() => piezo.noTone(), duration);
            }
        }

        // END SEQUENCE
        enqueue(() => piezo.noTone(), 200);
        enqueue(() => lcdWrite("Karaoke: press btn"), 300);
        enqueue(() => console.log("🎵 Finished cleanly"), 0);

        startQueue();
    }

    // --- BUTTON CONTROL ---
    let isPlaying = false;
    lcdWrite("Karaoke: press btn");

    button.on("press", () => {
        if (!isPlaying) {
            console.log("▶️ Starting playback...");
            isPlaying = true;
            runSequence();
        }
    });

    button.on("hold", () => {
        console.log("⏹️ Stopping...");
        queue.length = 0; // clear queue
        isRunning = false;
        isPlaying = false;
        piezo.noTone();
        lcdWrite("Karaoke: press btn");
    });

    console.log("Ready! Press button to play, hold to stop.");
});
