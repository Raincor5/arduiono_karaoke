const five = require("johnny-five");
const Oled = require("oled-js");
const font = require("oled-font-5x7");

new five.Board().on("ready", function () {
    // ===== Pins (breadboard stuff) =====
    const PIEZO_PIN  = 9;   // piezo signal
    const BUTTON_PIN = 8;   // button to GND; we enable internal pullup

    // ===== Devices =====
    const piezo = new five.Piezo(PIEZO_PIN);
    const button = new five.Button({ pin: BUTTON_PIN, isPullup: true }); // pressed = LOW

    // OLED on sensor shield (I2C @ 0x3C typical)
    const oled = new Oled(this, five, { width: 128, height: 64, address: 0x3C });

    // ===== OLED helpers (21x8 text grid using 5x7 font) =====
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
    function repaintAll() {
        for (let r = 0; r < ROWS; r++) flushLine(r);
        oled.update();
    }

    // Batch writes so we don’t hammer I2C (prevents piezo hiccups)
    const pending = new Set();
    let flushTimer = null;
    function queueLineWrite(r, text) {
        let s = String(text);
        if (s.length > COLS) s = s.slice(0, COLS);
        s = s.padEnd(COLS, " ");
        if (buf[r] === s) return;
        buf[r] = s;
        pending.add(r);
        if (!flushTimer) {
            flushTimer = setTimeout(() => {
                pending.forEach(flushLine);
                oled.update();
                pending.clear();
                flushTimer = null;
            }, 8); // small batch window
        }
    }

    function translitRu(s) {
        if (!s) return "";
        const map = {'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya','а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
        return String(s).replace(/[\u0400-\u04FF]/g, ch => map[ch] ?? '?');
    }

    function splash(title, sub = "") {
        for (let r = 0; r < ROWS; r++) queueLineWrite(r, "");
        queueLineWrite(1, translitRu(title).slice(0, COLS));
        if (sub) queueLineWrite(2, translitRu(sub).slice(0, COLS));
    }

    // ===== Music =====
    const BPM = 148;
    const msPerBeat = 60000 / BPM;
    const EIGHTH = 0.5;
    const BAR_BEATS = 8;
    const OCTAVE_SHIFT = -1;

    const CHORD = {
        C:  ["C5","E5","G5"],
        Am: ["A4","C5","E5"],
        Em: ["E4","G4","B4"],
        G:  ["G4","B4","D5"],
    };
    function transpose(note, shift) {
        if (note === "R") return note;
        const m = /^([A-G][#B]?)(\d)$/.exec(note);
        if (!m) return note;
        const [, p, o] = m;
        return p + (parseInt(o, 10) + shift);
    }
    const shifted = (arr, sh) => arr.map(n => transpose(n, sh));
    const ARP = [0,1,2,1, 0,1,2,1];
    const barArp = notes => ARP.map(i => [notes[i], EIGHTH]);
    const prog = ["C","Am","Em","G","C","Am","Em","G","C","Am","Em","G","C","Am","Em","G"];
    const melody = prog.flatMap(ch => barArp(shifted(CHORD[ch], OCTAVE_SHIFT)));

    // ===== Lyric timing (OLED 21 cols, rows 3..7) =====
    const SYLL = { msPer: 180, cols: COLS, startRow: 3, maxRows: 5 };
    function splitSylls(word) {
        if (!word) return [];
        const v = "aeiouyAEIOUY";
        const out = []; let cur = "";
        for (let i=0;i<word.length;i++){
            cur += word[i];
            if (v.includes(word[i])) {
                if (i+1<word.length && !v.includes(word[i+1])) {
                    if (i+2<word.length && !v.includes(word[i+2])) { out.push(cur); cur=""; }
                    else if (i+1===word.length-1) { /* keep */ }
                    else { out.push(cur); cur=""; }
                }
            }
        }
        if (cur) out.push(cur);
        return out.length ? out : [word];
    }
    function batchTimeline(text, t0) {
        const ascii = translitRu(text);
        const words = ascii.trim().split(/\s+/).filter(Boolean);
        const tl = [];
        let t = t0, line = "", row = SYLL.startRow;

        function pushLine() {
            if (line.trim()) {
                tl.push({ row, text: line, t });
                t += 10;
            }
        }

        for (let w=0; w<words.length; w++) {
            const syls = splitSylls(words[w]);
            for (let s=0; s<syls.length; s++) {
                const part = syls[s] + (s === syls.length-1 && w !== words.length-1 ? " " : "");
                const test = line + part;
                t += SYLL.msPer;

                if (test.length <= SYLL.cols) {
                    line = test;
                } else {
                    pushLine();
                    row++;
                    if (row >= SYLL.startRow + SYLL.maxRows) {
                        // scroll up (we’ll render by copying buffer)
                        tl.push({ scroll: true, t });
                        row = SYLL.startRow + SYLL.maxRows - 1;
                    }
                    line = part;
                }
                if (s === syls.length-1 && line.length >= SYLL.cols - 5) {
                    pushLine();
                    row++;
                    if (row >= SYLL.startRow + SYLL.maxRows) {
                        tl.push({ scroll: true, t });
                        row = SYLL.startRow + SYLL.maxRows - 1;
                    }
                    line = "";
                }
            }
        }
        if (line.trim()) tl.push({ row, text: line, t });
        return tl;
    }

    const chorusText =
        "Я отправлюсь в дальний путь и забуду сигареты на балконе " +
        "Я вернусь и посмотрю в зеркало на пороге " +
        "Чтобы демоны, демоны, демоны меня не одолели " +
        "Демоны, демоны, демоны меня не одолели";

    const words = chorusText.trim().split(/\s+/).filter(Boolean);
    const BAR_MS = BAR_BEATS * msPerBeat;
    function lyricBlocks(ws) {
        const segs = 4, per = Math.ceil(ws.length / segs);
        const chunks = Array.from({ length: segs }, () => []);
        let i = 0;
        for (let s=0;s<segs && i<ws.length;s++)
            for (let k=0;k<per && i<ws.length;k++) chunks[s].push(ws[i++]);
        return chunks.map((chunk, idx) => ({
            text: chunk.join(" "),
            t0: idx * BAR_MS
        }));
    }
    const blocks = lyricBlocks(words);
    const timeline = blocks.flatMap(b => batchTimeline(b.text, b.t0));

    const melodyMs = prog.length * BAR_BEATS * msPerBeat;
    const lyricsMs = timeline.length ? timeline[timeline.length-1].t + 500 : 0;
    const totalMs  = Math.max(melodyMs, lyricsMs);

    // ===== UI init =====
    oled.clearDisplay(); // clear video RAM
    for (let r = 0; r < ROWS; r++) queueLineWrite(r, "");
    queueLineWrite(0, "Demony - Karaoke");
    queueLineWrite(1, "Press button");
    repaintAll(); // draw immediately

    // ===== Playback =====
    let busy = false;

    button.on("down", () => {
        if (busy) return;
        busy = true;

        // clear lyric area
        for (let r = SYLL.startRow; r < SYLL.startRow + SYLL.maxRows; r++) queueLineWrite(r, "");
        queueLineWrite(1, ""); // clear hint

        // start melody
        piezo.play({ song: melody, tempo: BPM });

        // schedule display updates
        timeline.forEach(ev => {
            this.wait(ev.t, () => {
                if (ev.scroll) {
                    // scroll lyric region up by 1 line
                    const start = SYLL.startRow;
                    const end   = start + SYLL.maxRows - 1;
                    for (let r = start; r < end; r++) queueLineWrite(r, buf[r + 1]);
                    queueLineWrite(end, "");
                } else {
                    queueLineWrite(ev.row, ev.text);
                }
            });
        });

        // wrap-up
        this.wait(totalMs + 200, () => {
            queueLineWrite(1, "Press button");
            busy = false;
        });
    });

    this.on("exit", () => { piezo.noTone(); });
});

