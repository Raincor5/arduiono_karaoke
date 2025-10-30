const five = require("johnny-five");

// --- Конфигурация ---
const BPM = 148; // ты можешь менять это значение
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

const lyricsSplit = [
    ['Ya otpravlyus v dalniy put', 'i zabudu sigarety na balkone',
    'Ya vernus i posmotryu', 'v zerkalo na poroge'],
    ['Chtoby demony, demony, demony', 'menya ne odoleli',
    'Demony, demony, demony', 'menya ne odoleli', 'Tvoj drug'],
    ['Ya otpravlyus v dalniy put', 'i zabudu sigarety na balkone',
    'Ya vernus i posmotryu', 'v zerkalo na poroge'],
    ['Chtoby demony, demony, demony', 'menya ne odoleli',
    'Demony, demony, demony', 'menya ne odoleli'],
    ['Ya otpravlyus v dalniy put', 'i zabudu sigarety na balkone',
    'Ya vernus i posmotryu', 'v zerkalo na poroge'],
    ['Chtoby demony, demony, demony', 'menya ne odoleli',
    'Demony, demony, demony', 'menya ne odoleli'],
]


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
    const eighth = beat / 2;        // eighth note in ms
    const melody = [];

    // Arpeggio pattern — classic 8-note bar, fixed order
    const ARP_IDX = [0, 1, 2, 1, 0, 1, 2, 1];

    for (const bar of chords) {
        for (const ch of bar) {
            if (!ch) {
                // Pause (rest) one bar of eighths
                for (let i = 0; i < 8; i++) {
                    melody.push([null, eighth]);
                }
                continue;
            }

            const notes = chordMap[ch];

            // Fixed ascending/returning arpeggio, equal durations
            for (const idx of ARP_IDX) {
                const note = notes[idx];
                melody.push([note, eighth]);
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
    const piezo  = new five.Piezo(9);
    const button = new five.Button({ pin: 8, isPullup: true });

    // LCD init (HD44780 compatible): [RS, EN, D4, D5, D6, D7]
    const lcd    = new five.LCD({ pins: [12, 11, 5, 4, 3, 2], rows: 2, cols: 16 });
    lcd.noAutoscroll().noCursor().noBlink();

    // Buffered LCD writes
    const L = [" ".repeat(16), " ".repeat(16)];
    const dirty = new Set();
    let flushTimer = null;
    function flushSoon(delay = 8) {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            dirty.forEach(r => { lcd.cursor(r, 0).print(L[r]); });
            dirty.clear();
            flushTimer = null;
        }, delay);
    }
    function writeRow(row, text) {
        const s = String(text ?? "").padEnd(16, " ").slice(0, 16);
        if (L[row] !== s) {
            L[row] = s;
            dirty.add(row);
            flushSoon(8);
        }
    }
    function translitRu(s) {
        if (!s) return "";
        const map = {'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya','а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
        return String(s).replace(/[\u0400-\u04FF]/g, ch => map[ch] ?? '?');
    }
    function writeBothRows(fullText) {
        const ascii = translitRu(fullText).padEnd(32, " ").slice(0, 32);
        writeRow(0, ascii.slice(0,16));
        writeRow(1, ascii.slice(16,32));
    }
    // Karaoke updates happen only on slot change; no per-note LCD updates

    // Build melody and flatten mapping between chord slots and lyric phrases
    const melody = createMelody(chordsFull, BPM);
    const chordsFlat = chordsFull.flat();
    const lyricsFlat = lyricsSplit.flat();
    const slots = Math.min(chordsFlat.length, lyricsFlat.length);
    const NOTES_PER_SLOT = 8;

    // Initial screen
    lcd.clear();
    writeBothRows("Karaoke: press btn");

    let isPlaying = false;
    let isPaused = false;
    let i = 0;
    let lastSlotIndex = -1;

    function playNext() {
        if (!isPlaying || isPaused || i >= melody.length) {
            if (i >= melody.length && isPlaying) {
                console.log("🎵 Melody finished");
                isPlaying = false;
                i = 0;
                lastSlotIndex = -1;
                writeBothRows("Karaoke: press btn");
            }
            return;
        }

        const [note, duration] = melody[i++];
        const curNoteIdx = i - 1;
        const slotIndex = Math.floor(curNoteIdx / NOTES_PER_SLOT);

        // Update karaoke display only when a new phrase (slot) starts
        // ... внутри playNext(), перед board.wait(duration + 20, playNext);
        if (slotIndex !== lastSlotIndex) {
            lastSlotIndex = slotIndex;
            const phrase = slotIndex < slots ? lyricsFlat[slotIndex] : "";

            // DETECT "DEMONY" moment
            const isDemonMoment = /demony/i.test(phrase);

            if (isDemonMoment) {
                // хаос на LCD
                const glitch = () =>
                    writeBothRows(
                        Array.from({ length: 32 },
                            () => String.fromCharCode(Math.floor(Math.random() * 64) + 32)
                        ).join("")
                    );

                // “одержимость”: три вспышки глюков подряд
                for (let j = 0; j < 3; j++) board.wait(j * 150, glitch);

                // звук сбоит
                const randNote = ["C6","D5","F#4","A5"][Math.floor(Math.random()*4)];
                piezo.frequency(five.Piezo.Notes[randNote.toLowerCase()], 100);

                // через 500 мс восстанавливаем текст
                board.wait(500, () => writeBothRows(phrase));
            } else {
                board.wait(2, () => writeBothRows(phrase));
            }
        }


        console.log(`Playing: ${note ?? "pause"} (${Math.round(duration)} ms) | slot ${Math.min(slotIndex + 1, slots)}/${slots}`);

        if (note) {
            const freq = five.Piezo.Notes[note.toLowerCase()];
            piezo.frequency(freq, duration);
        } else {
            piezo.noTone();
        }

        board.wait(duration + 20, playNext);
    }

    // Button controls
    button.on("press", () => {
        if (!isPlaying) {
            console.log("▶️  Starting playback...");
            isPlaying = true;
            isPaused = false;
            i = 0;
            // Reset phrase index; LCD updates on slot change only
            lastSlotIndex = -1;
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
        lastSlotIndex = -1;
        piezo.noTone();
        writeBothRows("Karaoke: press btn");
    });

    console.log("Ready! Press button to play/pause, hold to stop.");
})