const five = require("johnny-five");

// --- Конфигурация ---
const BPM = 60; // ты можешь менять это значение
const BEAT_MS = (60 / BPM) * 1000; // длительность четверти в миллисекундах

// --- Прогрессия ---
const chordsFull = [
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G", null],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
    ["C", "Am", "Em", "G"],
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
    const beat = (60 / bpm) * 1000; // quarter note in ms
    const melody = [];

    // Arpeggio pattern — classic 8-note bar
    const ARP_IDX = [0, 1, 2, 1, 0, 1, 2, 1];

    // Very small rhythmic & dynamic deviation
    const BASE_RHYTHM = 1;   // eighth notes
    const BASE_DYNAMIC = 0.8;
    const VARIATION = 0.08;  // ±8% variation

    for (const bar of chords) {
        for (const ch of bar) {
            if (!ch) {
                // Pause (rest) one bar of eighths
                for (let i = 0; i < 8; i++) {
                    melody.push([null, beat / 2, 0]);
                }
                continue;
            }

            const notes = chordMap[ch];

            // Small chance to invert (play descending instead of ascending)
            const isDescending = Math.random() < 0.25;
            const pattern = isDescending ? [...ARP_IDX].reverse() : ARP_IDX;

            for (let i = 0; i < pattern.length; i++) {
                const idx = pattern[i];
                const note = notes[idx];
                const rhythmFactor = BASE_RHYTHM + (Math.random() - 0.5) * VARIATION;
                const dynamic = BASE_DYNAMIC + (Math.random() - 0.5) * VARIATION;
                const duration = (beat / 2) * rhythmFactor;

                melody.push([note, duration, dynamic]);
            }
        }
    }

    return melody;
}


// --- Генерация ---
const melody = createMelody(chordsFull, BPM);
console.table(melody);


new five.Board().on("ready", function () {
    const board = this;
    const piezo  = new five.Piezo(3);
    const button = new five.Button({ pin: 2, isPullup: true });

    const melody = createMelody(chordsFull, BPM);

    let isPlaying = false;
    let isPaused = false;
    let i = 0;
    let playbackTimer = null;

    // Non-blocking playback with fade and dynamics
    function playNext() {
        if (!isPlaying || isPaused || i >= melody.length) {
            if (i >= melody.length && isPlaying) {
                console.log("🎵 Melody finished");
                isPlaying = false;
                i = 0; // reset for next play
            }
            return;
        }

        const [note, duration, dynamic] = melody[i++];
        console.log(`Playing: ${note ?? "pause"} (${duration.toFixed(0)} ms) [dynamic: ${(dynamic * 100).toFixed(0)}%]`);

        if (note) {
            const freq = five.Piezo.Notes[note.toLowerCase()];

            // Apply dynamics via PWM and fade for long notes
            if (duration > 400) {
                // Fade in/out for long notes
                const fadeSteps = 5;
                const fadeTime = Math.min(50, duration / 10);
                const sustainTime = duration - (fadeTime * 2);

                // Fade in
                for (let step = 0; step < fadeSteps; step++) {
                    const vol = (step / fadeSteps) * dynamic;
                    board.wait(step * (fadeTime / fadeSteps), () => {
                        if (isPlaying && !isPaused) {
                            piezo.frequency(freq, fadeTime / fadeSteps);
                        }
                    });
                }

                // Sustain
                board.wait(fadeTime, () => {
                    if (isPlaying && !isPaused) {
                        piezo.frequency(freq, sustainTime);
                    }
                });

                // Fade out
                board.wait(fadeTime + sustainTime, () => {
                    if (isPlaying && !isPaused) {
                        piezo.noTone();
                    }
                });
            } else {
                // Short notes - simple dynamics
                const adjustedDuration = duration * (0.7 + dynamic * 0.3);
                piezo.frequency(freq, adjustedDuration);
            }
        }

        // Schedule next note
        playbackTimer = board.wait(duration + 20, playNext);
    }

    // Button controls
    button.on("press", () => {
        if (!isPlaying) {
            console.log("▶️  Starting playback...");
            isPlaying = true;
            isPaused = false;
            i = 0;
            playNext();
        } else if (isPaused) {
            console.log("▶️  Resuming...");
            isPaused = false;
            playNext();
        } else {
            console.log("⏸️  Pausing...");
            isPaused = true;
            piezo.noTone();
        }
    });

    button.on("hold", () => {
        console.log("⏹️  Stopping...");
        isPlaying = false;
        isPaused = false;
        i = 0;
        piezo.noTone();
    });

    console.log("Ready! Press button to play/pause, hold to stop.");

})