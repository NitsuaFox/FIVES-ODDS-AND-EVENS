/* FOE arcade SFX via Web Audio — no asset files, unlocks on first gesture. */
(function () {
    const FOE = (window.FOE = window.FOE || {});
    const debug = FOE.debug;
    const MUTE_KEY = 'foe.muted';

    const audio = {
        ctx: null,
        master: null,
        muted: localStorage.getItem(MUTE_KEY) === '1',
        unlocked: false
    };

    function ensure() {
        if (!audio.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) {
                debug && debug.log('audio.unavailable', { reason: 'no AudioContext' });
                return null;
            }
            audio.ctx = new Ctx();
            audio.master = audio.ctx.createGain();
            audio.master.gain.value = audio.muted ? 0 : 0.22;
            audio.master.connect(audio.ctx.destination);
            debug && debug.log('audio.created', { muted: audio.muted });
        }
        return audio.ctx;
    }

    function unlock() {
        const ctx = ensure();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().then(function () {
                audio.unlocked = true;
                debug && debug.log('audio.unlocked', { state: ctx.state });
            });
        } else {
            audio.unlocked = true;
        }
    }

    function setMuted(muted) {
        audio.muted = !!muted;
        localStorage.setItem(MUTE_KEY, audio.muted ? '1' : '0');
        if (audio.master) {
            audio.master.gain.setTargetAtTime(
                audio.muted ? 0 : 0.22,
                audio.ctx.currentTime,
                0.04
            );
        }
        debug && debug.log('audio.mute', { muted: audio.muted });
        return audio.muted;
    }

    function beep(freq, dur, type, gain, slideTo) {
        const ctx = ensure();
        if (!ctx || audio.muted) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        }
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain || 0.08, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(audio.master);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }

    function chord(freqs, dur, type, gain) {
        freqs.forEach(function (f, i) {
            setTimeout(function () {
                beep(f, dur, type, gain);
            }, i * 42);
        });
    }

    FOE.audio = {
        unlock: unlock,
        isMuted: function () {
            return audio.muted;
        },
        setMuted: setMuted,
        toggleMute: function () {
            return setMuted(!audio.muted);
        },
        ui: function () {
            beep(880, 0.07, 'triangle', 0.05);
        },
        start: function () {
            chord([262, 330, 392, 523], 0.16, 'square', 0.07);
            debug && debug.log('audio.start', {});
        },
        claim: function (isPlayer) {
            if (isPlayer) {
                beep(523, 0.09, 'square', 0.07, 784);
            } else {
                beep(196, 0.11, 'square', 0.06, 262);
            }
        },
        peek: function () {
            beep(1480, 0.12, 'sine', 0.03, 2200);
        },
        combo: function (type, count) {
            const n = Math.max(1, count || 1);
            debug && debug.log('audio.combo', { type: type, count: n });
            if (type === 'FIVES') {
                chord([784, 988, 1175, 1568], 0.12, 'triangle', 0.06);
                return;
            }
            const base = type === 'EVEN' ? 392 : 349;
            beep(base + n * 36, 0.1, 'square', 0.05 + Math.min(n, 8) * 0.004);
            if (n >= 3) {
                chord([base, base * 1.25, base * 1.5], 0.1, 'triangle', 0.045);
            }
            if (n >= 6) {
                chord([523, 659, 784, 1046], 0.14, 'square', 0.05);
            }
        },
        invalid: function () {
            beep(140, 0.16, 'sawtooth', 0.05, 90);
        },
        turn: function () {
            beep(440, 0.05, 'triangle', 0.03);
        },
        win: function () {
            chord([523, 659, 784, 1046, 1318], 0.18, 'square', 0.07);
            debug && debug.log('audio.win', {});
        },
        lose: function () {
            chord([392, 311, 247, 196], 0.22, 'triangle', 0.06);
            debug && debug.log('audio.lose', {});
        },
        draw: function () {
            chord([330, 392, 330], 0.16, 'triangle', 0.05);
        }
    };

    debug && debug.log('audio.ready', { muted: audio.muted });
})();
