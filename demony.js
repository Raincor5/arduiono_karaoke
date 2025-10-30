const five = require("johnny-five");

new five.Board().on("ready", function () {
    const piezo  = new five.Piezo(3);
    const button = new five.Button({ pin: 2, isPullup: true });

    // HD44780 pins order: [RS, EN, D4, D5, D6, D7]
    const lcd    = new five.LCD({ pins: [7, 8, 9, 10, 11, 12], rows: 2, cols: 16 });
    lcd.noAutoscroll().noCursor().noBlink();

    // ---- LCD буфер + батч ----
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
    function translitRu(s) {
        if (!s) return "";
        const map = {'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya','а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
        return String(s).replace(/[\u0400-\u04FF]/g, ch => map[ch] ?? '?');
    }
    function writeRow(row, text) {
        const s = translitRu(text).padEnd(16, " ").slice(0, 16);
        if (L[row] !== s) {
            L[row] = s;
            dirty.add(row);
            flushSoon(8);
        }
    }
    // трактуем 2 строки как ленту из 32 символов
    function writeBothRows(fullText, beep = false) {
        const ascii = translitRu(fullText).padEnd(32, " ").slice(0, 32);
        writeRow(0, ascii.slice(0,16));
        writeRow(1, ascii.slice(16,32));
        if (beep) piezo.frequency(800, 30);
    }

    // Стартовый экран (clear только здесь)
    lcd.clear();
    writeBothRows("Demony - Karaoke Press button", false);

    // ====== Музыка ======
    const BPM = 148;
    const msPerBeat = 60000 / BPM;
    const BAR_BEATS = 8;            // у тебя один бар = 8 восьмых (как было)
    const barDurationMs = BAR_BEATS * msPerBeat;
    const SAFE_OFFSET_MS = Math.floor(barDurationMs * 0.15); // обновлять чуть после начала бара
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

    // арпеджио 8 нот на бар: 0-1-2-1-0-1-2-1
    const ARP_IDX = [0,1,2,1, 0,1,2,1];
    const barArp = notes => ARP_IDX.map(i => [notes[i], 0.5]); // длительность в долях (джонни-файв понимает)

    // === 8 сегментов: аккорд + текст ===
    const SEGMENTS = [
        { ch: "C",  text: "Ya otpravlyus v dalniy put" },
        { ch: "Am", text: "I zabudu sigarety na balkone" },
        { ch: "Em", text: "Ya vernus i posmotryu" },
        { ch: "G",  text: "v zerkalo na poroge" },
        { ch: "C",  text: "Chtoby demony, demony, demony" },
        { ch: "Am", text: "menya ne odoleli" },
        { ch: "Em", text: "Demony, demony, demony" },
        { ch: "G",  text: "menya ne odoleli" },
    ];

    // Собираем 1 проход по 8 барам; можно продублировать (×2) если хочешь длиннее
    const chorusProg = SEGMENTS.map(s => s.ch);
    const melody = chorusProg.flatMap(ch => barArp(shifted(CHORD[ch], OCTAVE_SHIFT)));

    // Таймлайн вывода строк: каждый бар → свой кусок строки
    const chordLineTimeline = SEGMENTS.map((seg, idx) => ({
        timeMs: idx * barDurationMs + SAFE_OFFSET_MS,
        text: seg.text
    }));

    // Длительность (один прогон 8 баров)
    const melodyDurationMs = chorusProg.length * BAR_BEATS * msPerBeat;
    const totalDurationMs  = Math.max(
        melodyDurationMs,
        (chordLineTimeline.at(-1)?.timeMs || 0) + 500
    );

    let busy = false;

    button.on("press", () => {
        if (busy) return;
        busy = true;

        // стартуем звук
        piezo.play({ song: melody, tempo: BPM });

        // обновляем LCD раз в бар по сегменту
        chordLineTimeline.forEach(({ timeMs, text }) => {
            this.wait(timeMs, () => writeBothRows(text, true));
        });

        this.wait(totalDurationMs + 200, () => {
            writeBothRows("Demony - Karaoke Press button", false);
            busy = false;
        });
    });

    this.on("exit", () => piezo.noTone());
});
