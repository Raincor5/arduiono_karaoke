const five = require("johnny-five");

// --- Конфигурация ---
const BPM = 100; // ты можешь менять это значение
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
    const beat = (60 / bpm) * 1000; // четвертная нота (мс)
    const durationRatios = [1, 0.5, 0.25, 2]; // четвертная, восьмая, шестнадцатая, половинная
    const melody = [];

    for (const bar of chords) {
        for (const ch of bar) {
            if (!ch) {
                melody.push([null, beat]); // пауза длиной в 1 beat
                continue;
            }

            const notes = chordMap[ch];
            const note = notes[Math.floor(Math.random() * notes.length)];

            // случайная длительность, но реальная, от bpm
            const ratio = durationRatios[Math.floor(Math.random() * durationRatios.length)];
            const duration = beat * ratio;

            melody.push([note, duration]);
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

    // test the melody only with piezo
    const melody = createMelody(chordsFull, BPM);

    // play the melody
    let i = 0;

    function playNext() {
        if (i >= melody.length) {
            console.log("🎵 Melody finished");
            return;
        }

        const [note, duration] = melody[i++];
        console.log(`Playing: ${note ?? "pause"} (${duration} ms)`);

        if (note) {
            const freq = five.Piezo.Notes[note.toLowerCase()];
            piezo.frequency(freq, duration);
        }

        board.wait(duration + 50, playNext); // +50 мс пауза между нотами
    }

    playNext();

})