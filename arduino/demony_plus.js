const five = require("johnny-five");

const BPM = 148;
const BEAT = (60 / BPM) * 1000;
const EIGHTH = BEAT / 2;

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

new five.Board().on("ready", function () {
    const board = this;
    const piezo = new five.Piezo(9);
    const button = new five.Button({ pin: 8, isPullup: true });
    const lcd = new five.LCD({ pins: [11, 12, 5, 4, 3, 2], rows: 2, cols: 16 });
    lcd.noAutoscroll().noCursor().noBlink();

    // --- helper functions ---
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

    // --- main ---
    function runSong() {
        const melody = createMelody(chordsFull);
        const lyrics = lyricsSplit.flat();
        const NOTES_PER_SLOT = 8;

        // build timeline
        const timeline = [];
        let t = 0;

        for (let i = 0; i < melody.length; i++) {
            const [note, dur] = melody[i];
            const slot = Math.floor(i / NOTES_PER_SLOT);
            const phrase = lyrics[slot] ?? "";
            const isDemon = /demony/i.test(phrase);

            // lyric start
            if (i % NOTES_PER_SLOT === 0) {
                if (isDemon) {
                    timeline.push({ time: t, type: "glitch" });
                    timeline.push({ time: t + 250, type: "lyric", data: phrase });
                } else {
                    timeline.push({ time: t, type: "lyric", data: phrase });
                }
            }

            // tone
            timeline.push({ time: t, type: "tone", data: note, dur });
            t += dur;
        }

        // end
        timeline.push({ time: t + 500, type: "end" });

        // play deterministically
        let start = Date.now();
        let idx = 0;

        function scheduler() {
            const now = Date.now() - start;
            while (idx < timeline.length && timeline[idx].time <= now) {
                const ev = timeline[idx++];
                switch (ev.type) {
                    case "lyric": lcdWrite(ev.data); break;
                    case "glitch": lcdGlitch(); break;
                    case "tone":
                        if (ev.data) {
                            const f = five.Piezo.Notes[ev.data.toLowerCase()];
                            piezo.frequency(f, ev.dur * 0.9);
                        } else piezo.noTone();
                        break;
                    case "end":
                        piezo.noTone();
                        lcdWrite("Karaoke: press btn");
                        console.log("🎵 finished");
                        return;
                }
            }
            if (idx < timeline.length) setTimeout(scheduler, 5);
        }

        lcdWrite("Starting...");
        scheduler();
    }

    let playing = false;
    lcdWrite("Karaoke: press btn");

    button.on("press", () => {
        if (!playing) {
            playing = true;
            runSong();
        }
    });

    button.on("hold", () => {
        piezo.noTone();
        lcdWrite("Karaoke: press btn");
        playing = false;
    });

    console.log("Ready!");
});
