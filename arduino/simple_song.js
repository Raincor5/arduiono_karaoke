const five = require("johnny-five");
new five.Board().on("ready", function () {
    const piezo  = new five.Piezo(3);
    const button = new five.Button({ pin: 2, isPullup: true });

    // HD44780 pins order: [RS, EN, D4, D5, D6, D7]
    const lcd    = new five.LCD({ pins: [7, 8, 9, 10, 11, 12], rows: 2, cols: 16 });

    lcd.noAutoscroll().noCursor().noBlink();
    const L = [" ".repeat(16), " ".repeat(16)];

    const write = (row, text) => {
        const s = (text || "").padEnd(16, " ").slice(0, 16);
        if (L[row] !== s) { L[row] = s; lcd.cursor(row, 0).print(s); }
    };

    this.wait(1000, () => {
        write(0, "Ready!");
        write(1, "Press button");
    });

    const phrase1 = [
        ["C4", 0.5], ["C4", 0.5],
        ["G4", 0.5], ["G4", 0.5],
        ["A4", 0.5], ["A4", 0.5],
        ["G4", 1.0]
    ];

    const phrase2 = [
        ["F4", 0.5], ["F4", 0.5],
        ["E4", 0.5], ["E4", 0.5],
        ["D4", 0.5], ["D4", 0.5],
        ["C4", 1.0]
    ];

    const phrase3 = [
        ["G4", 0.5], ["G4", 0.5],
        ["F4", 0.5], ["F4", 0.5],
        ["E4", 0.5], ["E4", 0.5],
        ["D4", 1.0]
    ];

    const phrase4 = [
        ["G4", 0.5], ["G4", 0.5],
        ["F4", 0.5], ["F4", 0.5],
        ["E4", 0.5], ["E4", 0.5],
        ["D4", 1.0]
    ];

    const getNoteTimes = (phrase) => {
        let t = 0, arr = [];
        for (const [, dur] of phrase) {
            arr.push(t);
            t += dur;
        }
        return arr;
    };

    const phrase1Times = getNoteTimes(phrase1);
    const phrase2Times = getNoteTimes(phrase2);
    const phrase3Times = getNoteTimes(phrase3);
    const phrase4Times = getNoteTimes(phrase4);

    const phraseBeats = phrase1.reduce((s,[,d])=>s+d, 0);
    const song = [...phrase1, ...phrase2, ...phrase3, ...phrase4];

    // SPLIT into two lines per verse
    const verses = [
        {
            phrase: phrase1Times,
            line1: ["Twinkle", "twinkle"],
            line2: ["little", "star"],
            noteIndices: [0, 2, 4, 6]
        },
        {
            phrase: phrase2Times,
            line1: ["How I", "wonder"],
            line2: ["what you", "are"],
            noteIndices: [0, 2, 4, 6]
        },
        {
            phrase: phrase3Times,
            line1: ["Up above", "the"],
            line2: ["world so", "high"],
            noteIndices: [0, 2, 4, 6]
        },
        {
            phrase: phrase4Times,
            line1: ["Like a", "diamond"],
            line2: ["in the", "sky"],
            noteIndices: [0, 2, 4, 6]
        }
    ];

    const tempo = 60;
    const msPerBeat = 60000 / tempo;

    let busy = false;

    function scheduleLine(phraseStartBeats, verse) {
        let accum1 = "";
        let accum2 = "";

        // First two words on line 1
        [0, 1].forEach(i => {
            const noteIdx = verse.noteIndices[i];
            const noteTime = verse.phrase[noteIdx];
            const tMs = (phraseStartBeats + noteTime) * msPerBeat;

            this.wait(tMs, () => {
                accum1 = accum1 ? (accum1 + " " + verse.line1[i]) : verse.line1[i];
                write(0, accum1);
            });
        });

        // Last two words on line 2
        [2, 3].forEach(i => {
            const noteIdx = verse.noteIndices[i];
            const noteTime = verse.phrase[noteIdx];
            const tMs = (phraseStartBeats + noteTime) * msPerBeat;

            this.wait(tMs, () => {
                accum2 = accum2 ? (accum2 + " " + verse.line2[i-2]) : verse.line2[i-2];
                write(1, accum2);
            });
        });
    }

    button.on("press", () => {
        if (busy) return;
        busy = true;

        write(0, "");
        write(1, "");

        piezo.play({ song, tempo });

        let startBeats = 0;
        verses.forEach(verse => {
            scheduleLine.call(this, startBeats, verse);
            startBeats += phraseBeats;
        });

        const songBeatsTotal = song.reduce((s,[,d])=>s+d, 0);
        const totalMs = songBeatsTotal * msPerBeat + 500;

        this.wait(totalMs, () => {
            write(0, "Done!");
            write(1, "Press button");
            busy = false;
        });
    });

    this.on("exit", () => piezo.noTone());
});