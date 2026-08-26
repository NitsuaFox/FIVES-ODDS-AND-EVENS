/* FOE debug logger — copy these [FOE] lines when something looks wrong. */
(function () {
    const FOE = (window.FOE = window.FOE || {});
    const MAX_LINES = 80;

    const debug = {
        enabled: true,
        lines: [],
        panel: null,
        body: null,

        bind: function (panel, body) {
            this.panel = panel;
            this.body = body;
            this.render();
            console.log('[FOE] debug.bind panel attached');
        },

        log: function (tag, data) {
            const ts = new Date();
            const stamp =
                ts.toISOString().slice(11, 23);
            const payload = data === undefined ? '' : data;
            const line = {
                stamp: stamp,
                tag: tag,
                data: payload
            };
            this.lines.push(line);
            if (this.lines.length > MAX_LINES) {
                this.lines.shift();
            }
            const serialized =
                payload === '' ? '' : ' ' + safeJson(payload);
            const text = '[FOE ' + stamp + '] ' + tag + serialized;
            if (this.enabled) {
                console.log(text);
            }
            this.render();
            return text;
        },

        dump: function () {
            return this.lines
                .map(function (line) {
                    const extra =
                        line.data === '' ? '' : ' ' + safeJson(line.data);
                    return '[FOE ' + line.stamp + '] ' + line.tag + extra;
                })
                .join('\n');
        },

        copy: function () {
            const text = this.dump();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(
                    function () {
                        debug.log('debug.copy', { ok: true, lines: debug.lines.length });
                    },
                    function (err) {
                        debug.log('debug.copy', { ok: false, error: String(err) });
                    }
                );
            } else {
                debug.log('debug.copy', { ok: false, error: 'no clipboard api' });
            }
            return text;
        },

        toggle: function (force) {
            const next =
                force === undefined
                    ? !(this.panel && !this.panel.hidden)
                    : !!force;
            if (this.panel) {
                this.panel.hidden = !next;
            }
            this.log('debug.toggle', { visible: next });
            return next;
        },

        render: function () {
            if (!this.body) return;
            this.body.textContent = this.dump();
            this.body.scrollTop = this.body.scrollHeight;
        }
    };

    function safeJson(value) {
        try {
            return JSON.stringify(value);
        } catch (err) {
            return '{"error":"unserializable"}';
        }
    }

    FOE.debug = debug;
    debug.log('debug.ready', { maxLines: MAX_LINES });
})();
