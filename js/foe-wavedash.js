/* Wavedash host hooks — no-ops when the SDK is not injected. */
(function () {
    const FOE = (window.FOE = window.FOE || {});
    const LEADERBOARD_ID = 'high-scores';

    function log(tag, data) {
        if (FOE.debug && FOE.debug.log) FOE.debug.log(tag, data || {});
    }

    function sdk() {
        return window.Wavedash || null;
    }

    FOE.wavedash = {
        present: function () {
            return !!sdk();
        },

        init: function () {
            const WD = sdk();
            if (!WD) {
                log('wavedash.standalone', {});
                return false;
            }
            try {
                if (typeof WD.updateLoadProgressZeroToOne === 'function') {
                    WD.updateLoadProgressZeroToOne(0);
                    WD.updateLoadProgressZeroToOne(1);
                }
                const first = WD.init({ debug: false });
                const mobile = document.querySelector('.mobile-link');
                if (mobile) mobile.hidden = true;
                log('wavedash.init', { firstCall: first });
                return true;
            } catch (err) {
                log('wavedash.init.error', { error: String(err) });
                return false;
            }
        },

        submitScore: function (score) {
            const WD = sdk();
            if (!WD || typeof WD.getLeaderboard !== 'function') {
                log('wavedash.score.skip', { score: score });
                return;
            }
            WD.getLeaderboard(LEADERBOARD_ID)
                .then(function (board) {
                    if (!board || !board.success) {
                        log('wavedash.score.noleaderboard', board);
                        return null;
                    }
                    return WD.uploadLeaderboardScore(board.data.id, score, true);
                })
                .then(function (res) {
                    if (res) log('wavedash.score', { score: score, success: !!res.success });
                })
                .catch(function (err) {
                    log('wavedash.score.error', { error: String(err) });
                });
        }
    };
})();
