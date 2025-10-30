const five = require("johnny-five");
const Oled = require("oled-js");
const font = require("oled-font-5x7");

new five.Board().on("ready", function() {
    const board = this;

    // PINS
    const PIEZO_PIN = "9";
    const BUTTON_PIN = "10";

    // DEVICES
    const piezo = new five.Piezo(PIEZO_PIN);
    const button  = new five.Button({
        pin: BUTTON_PIN,
        isPullup: true,
        holdtime: 500,
        debounce: 50
    });

    // OLED
    board.io.setMaxListeners(50);
    const oled = new Oled(board, five, { width: 128, height: 64, address: 0x3C });

    // Screen config
    const CHAR_W = 6, CHAR_H = 8;
    const COLS = Math.floor(128 / CHAR_W); // 21
    const ROWS = Math.floor(64  / CHAR_H); // 8
    const buf = Array.from({ length: ROWS }, () => " ".repeat(COLS));

    function setCursorRC(r, c = 0) {
        const x = Math.max(0, Math.min(COLS - 1, c)) * CHAR_W;
        const y = Math.max(0, Math.min(ROWS - 1, r)) * CHAR_H;
        oled.setCursor(x, y);
    }
    function flushLine(r) {
        setCursorRC(r, 0);
        oled.writeString(font, 1, buf[r], 1, false);
    }

    // ---- Batched OLED flush (чтоб не душить I2C и не срывать таймер звука) ----
    const pendingRows = new Set();
    let flushTimer = null;
    function flushSoon(delay = 8) {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            pendingRows.forEach(flushLine);
            oled.update();
            pendingRows.clear();
            flushTimer = null;
        }, delay);
    }

    // Translit
    function translitRu(s) {
        if (!s) return "";
        const map = {'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya','а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
        return String(s).replace(/[\u0400-\u04FF]/g, ch => map[ch] ?? '?');
    }

    function writeRow(row, text) {
        if (row < 0 || row >= ROWS) return;
        const s = translitRu(text).padEnd(COLS, " ").slice(0, COLS);
        if (buf[row] !== s) {
            buf[row] = s;
            pendingRows.add(row);
            flushSoon(8);
        }
    }

    function clearRows(from = 0) {
        for (let r = from; r < ROWS; r++) writeRow(r, "");
    }

    function showWrapped(text, startRow = 2) {
        // очистим область текста
        for (let r = startRow; r < ROWS; r++) writeRow(r, "");
        const words = translitRu(text).split(" ");
        let line = "", row = startRow;
        for (const w of words) {
            if ((line + w).length > COLS - 1) {
                writeRow(row, line.trim());
                row++;
                if (row >= ROWS) break;
                line = w + " ";
            } else {
                line += w + " ";
            }
        }
        if (row < ROWS && line.trim()) writeRow(row, line.trim());
    }

    // ---- Music ----
    const BPM = 148;
    const msPerBeat = 60000 / BPM;
    const EIGHTH = 0.5;
    const BAR_BEATS = 8;
    const OCTAVE_SHIFT = -1;

    const CHORD = {
        C:  ["C5", "E5", "G5"],
        Am: ["A4", "C5", "E5"],
        Em: ["E4", "G4", "B4"],
        G:  ["G4", "B4", "D5"],
    };
    function transpose(note, shift) {
        if (note === "R") return note;
        const m = /^([A-G][#B]?)(\d)$/.exec(note);
        if (!m) return note;
        const [, p, o] = m;
        return p + (parseInt(o, 10) + shift);
    }
    const shifted = (arr, sh) => arr.map(n => transpose(n, sh));
    const ARP_IDX = [0,1,2,1, 0,1,2,1];
    const barArp = notes => ARP_IDX.map(i => [notes[i], EIGHTH]);

    // Прогрессия (оставил как у тебя)
    const chorusProg = [
        "C","Am","Em","G",
        "C","Am","Em","G",
        "C","Am","Em","G",
        "C","Am","Em","G",
    ];
    const melody = chorusProg.flatMap(ch => barArp(shifted(CHORD[ch], OCTAVE_SHIFT)));

    // ---- Текст припева (Три Дня Дождя) — по барам ----
    const barDurationMs = BAR_BEATS * msPerBeat;
    const lyricSegments = [
        "Ya otpravlyus",                // bar 1
        "v dalniy put i",               // bar 2
        "zabudu sigarety",              // bar 3
        "na balkone",                   // bar 4
        "Ya vernus i",                  // bar 5
        "posmotryu v",                  // bar 6
        "zerkalo na",                   // bar 7
        "poroge",                       // bar 8
        "Chtoby demony,",               // bar 9
        "demony, demony",               // bar 10
        "menya ne",                     // bar 11
        "odoleli",                      // bar 12
        "Demony,",                      // bar 13
        "demony, demony",               // bar 14
        "menya ne",                     // bar 15
        "odoleli"                       // bar 16
    ];
    const lyricTimeline = lyricSegments.map((text, index) => ({
        text, timeMs: index * barDurationMs
    }));

    // ---- Karaoke state ----
    let busy = false;

    function startKaraoke() {
        if (busy) return;
        busy = true;
        console.log("Starting karaoke...");

        // Заголовок + очистка области текста
        writeRow(0, "Tri Dnya Dozhdya");
        writeRow(1, "Demony - Karaoke");
        clearRows(2);
        writeRow(2, "Playing...");
        flushSoon(0); // мгновенно нарисовать заглушку

        // Запускаем мелодию
        piezo.play({ song: melody, tempo: BPM });

        // Пишем строки на OLED по таймлайну (по бару)
        lyricTimeline.forEach(({ text, timeMs }) => {
            board.wait(timeMs, () => {
                showWrapped(text, 2); // кладём с 2-й строки вниз
                // маленькая задержка флашинга, чтобы не совпадать с сменой нот
                flushSoon(10);
                // лог для отладки
                // console.log(`${timeMs}ms: ${text}`);
            });
        });

        // Завершение
        const melodyDurationMs = chorusProg.length * BAR_BEATS * msPerBeat;
        const tailMs = Math.max(
            melodyDurationMs,
            (lyricTimeline.at(-1)?.timeMs ?? 0) + 1000
        );

        board.wait(tailMs + 200, () => {
            writeRow(2, "Song finished!");
            writeRow(3, "Press button!");
            flushSoon(0);
            busy = false;
            console.log("Song finished!");
        });
    }

    // Button
    button.on("press", () => startKaraoke());

    // Init screen
    oled.clearDisplay();
    for (let r = 0; r < ROWS; r++) writeRow(r, "");
    writeRow(0, "Tri Dnya Dozhdya");
    writeRow(1, "Demony - Karaoke");
    writeRow(3, "Ready! Press btn");
    flushSoon(0);
    console.log("Karaoke ready. Press button to start!");

    // REPL
    board.repl.inject({ start: startKaraoke, piezo, button, oled });

    board.on("exit", () => piezo.noTone());
});

