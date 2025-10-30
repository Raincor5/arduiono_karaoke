const five = require("johnny-five");

new five.Board().on("ready", function () {
    const piezo  = new five.Piezo(9);
    const freqs = [800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000];
    let i = 0;
    const playNext = () => {
        if (i >= freqs.length) return;
        const f = freqs[i++];
        console.log(`Playing ${f} Hz`);
        piezo.frequency(f, 600);
        this.wait(700, playNext);
    };

    playNext();
});