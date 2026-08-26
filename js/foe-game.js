/* FOE game loop, HUD, layout fitting, and CPU. */
(function () {
    const FOE = (window.FOE = window.FOE || {});
    const debug = FOE.debug;
    const RECORD_KEY = 'foe.record';
    const REVEAL_MS = 1800;
    const PLAYERS = ['PLAYER1', 'CPU1'];

    const els = {};
    const state = {
        gridSize: 10,
        total: 100,
        cells: [],
        current: 'PLAYER1',
        claimed: { PLAYER1: [], CPU1: [] },
        scores: { PLAYER1: 0, CPU1: 0 },
        combos: { PLAYER1: [], CPU1: [] },
        multipliers: { PLAYER1: 1, CPU1: 1 },
        bestCombo: { PLAYER1: 0, CPU1: 0 },
        lastValue: { PLAYER1: null, CPU1: null },
        counts: {
            PLAYER1: { even: 0, odd: 0, fives: 0 },
            CPU1: { even: 0, odd: 0, fives: 0 }
        },
        phase: 'MENU',
        revealing: false,
        cellSize: 36,
        peekTimer: null,
        cpuTimer: null,
        chosenSize: 10
    };

    FOE.state = state;

    function $(id) {
        return document.getElementById(id);
    }

    function loadRecord() {
        try {
            const raw = localStorage.getItem(RECORD_KEY);
            if (!raw) return { wins: 0, losses: 0, draws: 0, high: 0 };
            const data = JSON.parse(raw);
            return {
                wins: data.wins || 0,
                losses: data.losses || 0,
                draws: data.draws || 0,
                high: data.high || 0
            };
        } catch (err) {
            debug.log('record.load.error', { error: String(err) });
            return { wins: 0, losses: 0, draws: 0, high: 0 };
        }
    }

    function saveRecord(record) {
        localStorage.setItem(RECORD_KEY, JSON.stringify(record));
        debug.log('record.save', record);
        paintRecord();
    }

    function paintRecord() {
        const rec = loadRecord();
        if (els.recWins) els.recWins.textContent = rec.wins;
        if (els.recLosses) els.recLosses.textContent = rec.losses;
        if (els.recHigh) els.recHigh.textContent = rec.high;
    }

    function cacheEls() {
        els.startScreen = $('start-screen');
        els.gameContent = $('game-content');
        els.board = $('game-board');
        els.boardStage = $('board-stage');
        els.status = $('status');
        els.peekBar = $('peek-bar');
        els.playerPanel = $('player-panel');
        els.cpuPanel = $('cpu-panel');
        els.callout = $('combo-callout');
        els.endModal = $('end-modal');
        els.debugPanel = $('debug-panel');
        els.debugBody = $('debug-body');
        els.muteBtn = $('mute-btn');
        els.recWins = $('rec-wins');
        els.recLosses = $('rec-losses');
        els.recHigh = $('rec-high');
        els.movesPill = $('moves-pill');
        els.tilesPill = $('tiles-pill');
        els.racePlayer = $('race-player');
        els.raceCpu = $('race-cpu');
        els.winnerText = $('winner-text');
        els.finalScores = $('final-scores');
        els.highNote = $('high-note');
    }

    function comboCount(player, type) {
        const found = state.combos[player].find(function (c) {
            return c.t === type;
        });
        return found ? found.c : 0;
    }

    function maxCombo(player) {
        return state.combos[player].reduce(function (best, c) {
            return Math.max(best, c.c);
        }, 0);
    }

    function surrounding(index) {
        const size = state.gridSize;
        const row = Math.floor(index / size);
        const col = index % size;
        const out = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = row + dr;
                const c = col + dc;
                if (r >= 0 && r < size && c >= 0 && c < size) {
                    out.push(r * size + c);
                }
            }
        }
        return out;
    }

    function isValidMove(index, player) {
        const cell = state.cells[index];
        if (!cell || cell.claimed) return false;
        if (state.claimed[player].length === 0) return true;
        return state.claimed[player].some(function (owned) {
            return surrounding(owned).indexOf(index) !== -1;
        });
    }

    function legalMoves(player) {
        const moves = [];
        for (let i = 0; i < state.cells.length; i++) {
            if (isValidMove(i, player)) moves.push(i);
        }
        return moves;
    }

    function fitBoard() {
        const stage = els.boardStage;
        if (!stage || state.phase === 'MENU') return;
        const size = state.gridSize;
        const gap = size >= 10 ? 3 : 6;
        const pad = 20;
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        const cell = Math.max(
            16,
            Math.floor(Math.min((w - pad - gap * (size - 1)) / size, (h - pad - gap * (size - 1)) / size, 64))
        );
        state.cellSize = cell;
        els.board.style.setProperty('--cell-size', cell + 'px');
        els.board.style.setProperty('--cell-gap', gap + 'px');
        els.board.style.setProperty('--grid-size', String(size));
        logLayout();
    }

    function logLayout() {
        if (!els.cpuPanel) return;
        const cpu = els.cpuPanel.getBoundingClientRect();
        const player = els.playerPanel.getBoundingClientRect();
        const board = els.board.getBoundingClientRect();
        const clippedRight = cpu.right > window.innerWidth + 1;
        const clippedLeft = player.left < -1;
        debug.log('layout', {
            vw: window.innerWidth,
            vh: window.innerHeight,
            grid: state.gridSize,
            cell: state.cellSize,
            playerLeft: Math.round(player.left),
            cpuRight: Math.round(cpu.right),
            boardW: Math.round(board.width),
            clippedRight: clippedRight,
            clippedLeft: clippedLeft
        });
        if (clippedRight || clippedLeft) {
            debug.log('layout.CLIPPED', {
                cpuRight: Math.round(cpu.right),
                vw: window.innerWidth
            });
        }
    }

        function setBoardLock(locked) {
        const column = document.querySelector('.board-column');
        if (!column) return;
        column.classList.toggle('is-locked', !!locked);
    }

    function highlightMoves() {
        const nodes = els.board.querySelectorAll('.cell');
        nodes.forEach(function (node) {
            node.classList.remove('available');
        });
        const playerTurn =
            state.phase !== 'OVER' &&
            !state.revealing &&
            state.current === 'PLAYER1';
        setBoardLock(!playerTurn);
        if (!playerTurn) return;
        legalMoves('PLAYER1').forEach(function (index) {
            const node = els.board.querySelector('.cell[data-index="' + index + '"]');
            if (node) node.classList.add('available');
        });
        debug.log('moves.highlight', { count: legalMoves('PLAYER1').length });
    }

    function updateCombo(value, player) {
        const isEven = value % 2 === 0;
        const isFive = value % 5 === 0;
        const prev = state.combos[player];
        const next = [];
        prev.forEach(function (combo) {
            if (combo.t === 'EVEN' && isEven) next.push({ t: 'EVEN', c: combo.c + 1 });
            if (combo.t === 'ODD' && !isEven) next.push({ t: 'ODD', c: combo.c + 1 });
            if (combo.t === 'FIVES' && isFive) next.push({ t: 'FIVES', c: combo.c + 1 });
        });
        if (isFive && !next.some(function (c) { return c.t === 'FIVES'; })) {
            next.push({ t: 'FIVES', c: 1 });
        }
        if (isEven && !next.some(function (c) { return c.t === 'EVEN'; })) {
            next.push({ t: 'EVEN', c: 1 });
        }
        if (!isEven && !next.some(function (c) { return c.t === 'ODD'; })) {
            next.push({ t: 'ODD', c: 1 });
        }
        state.combos[player] = next;
        state.multipliers[player] =
            1 + next.reduce(function (sum, combo) {
                return sum + combo.c * 0.1;
            }, 0);
        const peak = maxCombo(player);
        if (peak > state.bestCombo[player]) state.bestCombo[player] = peak;
        if (isEven) state.counts[player].even += 1;
        else state.counts[player].odd += 1;
        if (isFive) state.counts[player].fives += 1;
        debug.log('combo', {
            player: player,
            value: value,
            combos: next,
            mult: Number(state.multipliers[player].toFixed(1))
        });
        return next;
    }

    function comboPhrase(combos) {
        const best = combos.slice().sort(function (a, b) {
            return b.c - a.c;
        })[0];
        if (!best) return '';
        if (best.t === 'FIVES' && best.c >= 2) return 'FIVES FRENZY';
        if (best.c >= 6) return 'ON FIRE';
        if (best.c >= 4) return 'HOT STREAK';
        if (best.c >= 3) return best.t + ' x' + best.c;
        return '';
    }

    function setBar(id, value, max) {
        const el = $(id);
        if (!el) return;
        const pct = Math.max(0, Math.min(100, (value / max) * 100));
        el.style.width = pct + '%';
        el.classList.toggle('maxed', value >= max);
        const count = $(id.replace('-bar', '-count'));
        if (count) count.textContent = String(value);
    }

    function paintScout(player, originIndex) {
        const box = $(player === 'PLAYER1' ? 'player-scout' : 'cpu-scout');
        if (!box) return;
        if (originIndex === null || originIndex === undefined) {
            box.innerHTML = '<div class="scout-row"><span>Waiting for a peek</span><b>-</b></div>';
            return;
        }
        let even = 0;
        let odd = 0;
        let fives = 0;
        surrounding(originIndex).forEach(function (i) {
            const cell = state.cells[i];
            if (!cell || cell.claimed) return;
            if (cell.value % 2 === 0) even += 1;
            else odd += 1;
            if (cell.value % 5 === 0) fives += 1;
        });
        box.innerHTML =
            '<div class="scout-row"><span>Hidden EVENS</span><b>' + even + '</b></div>' +
            '<div class="scout-row"><span>Hidden ODDS</span><b>' + odd + '</b></div>' +
            '<div class="scout-row"><span>Hidden FIVES</span><b>' + fives + '</b></div>';
        debug.log('scout', { player: player, even: even, odd: odd, fives: fives });
    }

    function paintHistory(player, value, combos) {
        const list = $(player === 'PLAYER1' ? 'player1-history' : 'cpu1-history');
        const li = document.createElement('li');
        li.className = 'history-item';
        const num = document.createElement('span');
        num.className = 'number';
        num.textContent = String(value);
        const info = document.createElement('span');
        info.className = 'combo-info';
        combos.forEach(function (combo) {
            const badge = document.createElement('span');
            badge.className = 'combo-badge ' + combo.t.toLowerCase();
            badge.textContent = combo.c + 'x' + combo.t.charAt(0);
            info.appendChild(badge);
        });
        li.appendChild(num);
        li.appendChild(info);
        list.insertBefore(li, list.firstChild);
        while (list.children.length > 14) list.removeChild(list.lastChild);
    }

    function animateScore(id, from, to) {
        const el = $(id);
        if (!el) return;
        const start = performance.now();
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        function step(now) {
            const t = Math.min(1, (now - start) / 380);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(from + (to - from) * eased));
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function renderHUD() {
        const pScore = state.scores.PLAYER1;
        const cScore = state.scores.CPU1;
        $('player1-multiplier').textContent = state.multipliers.PLAYER1.toFixed(1) + 'x';
        $('cpu1-multiplier').textContent = state.multipliers.CPU1.toFixed(1) + 'x';
        $('player-territory').textContent = state.claimed.PLAYER1.length;
        $('cpu-territory').textContent = state.claimed.CPU1.length;
        $('player-best').textContent = String(state.bestCombo.PLAYER1);
        $('cpu-best').textContent = String(state.bestCombo.CPU1);
        $('player-last').textContent = state.lastValue.PLAYER1 === null ? '-' : String(state.lastValue.PLAYER1);
        $('cpu-last').textContent = state.lastValue.CPU1 === null ? '-' : String(state.lastValue.CPU1);
        $('player-heat').textContent = String(maxCombo('PLAYER1'));
        $('cpu-heat').textContent = String(maxCombo('CPU1'));

        setBar('player-even-bar', comboCount('PLAYER1', 'EVEN'), 10);
        setBar('player-odd-bar', comboCount('PLAYER1', 'ODD'), 10);
        setBar('player-fives-bar', comboCount('PLAYER1', 'FIVES'), 6);
        setBar('cpu-even-bar', comboCount('CPU1', 'EVEN'), 10);
        setBar('cpu-odd-bar', comboCount('CPU1', 'ODD'), 10);
        setBar('cpu-fives-bar', comboCount('CPU1', 'FIVES'), 6);

        const totalScore = pScore + cScore;
        const pPct = totalScore === 0 ? 50 : (pScore / totalScore) * 100;
        els.racePlayer.style.width = pPct + '%';
        els.raceCpu.style.width = 100 - pPct + '%';

        const open = state.cells.filter(function (c) { return !c.claimed; }).length;
        els.tilesPill.textContent = open + ' open';
        const myMoves = legalMoves(state.current).length;
        els.movesPill.textContent = myMoves + ' moves';
        els.movesPill.classList.toggle('warn', myMoves > 0 && myMoves <= 2);

        els.playerPanel.classList.toggle('active', state.current === 'PLAYER1' && state.phase !== 'OVER');
        els.cpuPanel.classList.toggle('active', state.current === 'CPU1' && state.phase !== 'OVER');
        $('player-turn-tag').textContent =
            state.phase === 'OVER' ? 'Finished' : state.current === 'PLAYER1' ? 'Your turn' : 'Waiting';
        $('cpu-turn-tag').textContent =
            state.phase === 'OVER' ? 'Finished' : state.current === 'CPU1' ? (state.revealing ? 'Scouting...' : 'Thinking...') : 'Idle';
    }

    function updateStatus() {
        if (state.phase === 'OVER') {
            els.status.textContent = 'Board locked';
            return;
        }
        if (state.revealing) {
            els.status.textContent = state.current === 'PLAYER1' ? 'Peeking the neighbors...' : 'CPU is peeking...';
            return;
        }
        if (state.claimed.PLAYER1.length === 0) {
            els.status.textContent = 'Pick any starting tile';
        } else if (state.claimed.CPU1.length === 0 && state.current === 'CPU1') {
            els.status.textContent = 'CPU is choosing a start';
        } else if (state.current === 'PLAYER1') {
            els.status.textContent = 'Claim a glowing neighbor';
        } else {
            els.status.textContent = 'CPU turn';
        }
    }

    function showCallout(text) {
        if (!text) return;
        els.callout.textContent = text;
        els.callout.classList.remove('show');
        void els.callout.offsetWidth;
        els.callout.classList.add('show');
    }

    function evaluateCpuMove(index) {
        const value = state.cells[index].value;
        const isEven = value % 2 === 0;
        const isFive = value % 5 === 0;
        let score = Math.random() * 3;
        state.combos.CPU1.forEach(function (combo) {
            if (combo.t === 'EVEN' && isEven) score += 12 + combo.c * 4;
            if (combo.t === 'ODD' && !isEven) score += 12 + combo.c * 4;
            if (combo.t === 'FIVES' && isFive) score += 18 + combo.c * 6;
        });
        if (isFive) score += 8;
        const expand = surrounding(index).filter(function (i) {
            return !state.cells[i].claimed;
        }).length;
        score += expand * 2.4;
        return score;
    }

    function pickCpuMove(moves) {
        const ranked = moves
            .map(function (i) {
                return { i: i, s: evaluateCpuMove(i) };
            })
            .sort(function (a, b) {
                return b.s - a.s;
            });
        const roll = Math.random();
        let pick = ranked[0];
        if (roll > 0.72 && ranked[1]) pick = ranked[1];
        if (roll > 0.92 && ranked[2]) pick = ranked[2];
        debug.log('cpu.pick', {
            options: ranked.length,
            chosen: pick.i,
            value: state.cells[pick.i].value,
            score: Number(pick.s.toFixed(2)),
            roll: Number(roll.toFixed(2))
        });
        return pick.i;
    }

    function cellCenter(index) {
        const node = els.board.querySelector('.cell[data-index="' + index + '"]');
        if (!node) return { x: window.innerWidth / 2, y: window.innerHeight / 2, node: null };
        const rect = node.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            node: node
        };
    }

    function makeMove(index) {
        const cell = state.cells[index];
        if (!cell || cell.claimed || state.phase === 'OVER') return;
        const player = state.current;
        const fromScore = state.scores[player];
        cell.claimed = true;
        cell.owner = player;
        state.claimed[player].push(index);
        state.lastValue[player] = cell.value;

        const combos = updateCombo(cell.value, player);
        const gained = Math.round(state.multipliers[player]);
        state.scores[player] += gained;

        const node = els.board.querySelector('.cell[data-index="' + index + '"]');
        els.board.querySelectorAll('.cell.last-claim').forEach(function (n) {
            n.classList.remove('last-claim');
        });
        node.textContent = String(cell.value);
        node.classList.add(player.toLowerCase(), 'last-claim');
        node.classList.remove('available', 'temp-revealed');

        const pos = cellCenter(index);
        const color = player === 'PLAYER1' ? '#3da9fc' : '#ff6b4a';
        FOE.fx.burst(pos.x, pos.y, color, 16 + Math.min(12, maxCombo(player) * 2));
        FOE.fx.popup(pos.x, pos.y - 10, '+' + gained, '#ffd166');
        FOE.audio.claim(player === 'PLAYER1');

        const best = combos.slice().sort(function (a, b) { return b.c - a.c; })[0];
        if (best && best.c >= 3) {
            const kind = best.t.toLowerCase();
            FOE.fx.toast(best.t + ' x' + best.c, kind);
            FOE.audio.combo(best.t, best.c);
            showCallout(comboPhrase(combos));
            if (best.c >= 5) FOE.fx.shake(240);
        } else if (best && best.t === 'FIVES' && best.c >= 2) {
            FOE.audio.combo('FIVES', best.c);
            FOE.fx.toast('FIVES x' + best.c, 'fives');
            showCallout('FIVES FRENZY');
        }

        paintHistory(player, cell.value, combos);
        animateScore(player === 'PLAYER1' ? 'player1-score' : 'cpu1-score', fromScore, state.scores[player]);
        debug.log('move', {
            player: player,
            index: index,
            value: cell.value,
            gained: gained,
            score: state.scores[player],
            territory: state.claimed[player].length
        });
        peekNeighbors(index);
    }

        function peekNeighbors(index) {
        state.revealing = true;
        highlightMoves();
        const around = surrounding(index);
        around.forEach(function (i, n) {
            const cell = state.cells[i];
            if (cell.claimed) return;
            const node = els.board.querySelector('.cell[data-index="' + i + '"]');
            setTimeout(function () {
                node.textContent = String(cell.value);
                node.classList.add('temp-revealed');
            }, n * 28);
        });
        paintScout(state.current, index);
        els.peekBar.classList.remove('on');
        void els.peekBar.offsetWidth;
        els.peekBar.classList.add('on');
        FOE.audio.peek();
        renderHUD();
        updateStatus();
        if (state.peekTimer) clearTimeout(state.peekTimer);
        state.peekTimer = setTimeout(function () {
            around.forEach(function (i) {
                const cell = state.cells[i];
                if (cell.claimed) return;
                const node = els.board.querySelector('.cell[data-index="' + i + '"]');
                node.textContent = '';
                node.classList.remove('temp-revealed');
            });
            els.peekBar.classList.remove('on');
            state.revealing = false;
            advanceTurn();
        }, REVEAL_MS);
    }

    function advanceTurn() {
        if (state.phase === 'OVER') return;
        const other = state.current === 'PLAYER1' ? 'CPU1' : 'PLAYER1';
        const otherMoves = legalMoves(other);
        const selfMoves = legalMoves(state.current);
        if (otherMoves.length === 0 && selfMoves.length === 0) {
            endGame();
            return;
        }
        if (otherMoves.length > 0) {
            state.current = other;
        } else {
            debug.log('turn.skip', { skipped: other, still: state.current });
            FOE.fx.toast(other === 'CPU1' ? 'CPU is boxed in' : 'You are boxed in', '');
        }
        FOE.audio.turn();
        renderHUD();
        updateStatus();
        highlightMoves();
        if (state.current === 'CPU1' && state.phase !== 'OVER') {
            const delay = 420 + Math.floor(Math.random() * 380);
            debug.log('cpu.think', { delay: delay });
            state.cpuTimer = setTimeout(cpuMove, delay);
        }
    }

    function cpuMove() {
        if (state.phase === 'OVER' || state.current !== 'CPU1' || state.revealing) return;
        const moves = legalMoves('CPU1');
        if (!moves.length) {
            debug.log('cpu.nomoves', {});
            advanceTurn();
            return;
        }
        makeMove(pickCpuMove(moves));
    }

    function handleCellClick(index) {
        FOE.audio.unlock();
        if (state.phase === 'OVER' || state.revealing) return;
        if (state.current !== 'PLAYER1') {
            debug.log('click.ignored', { reason: 'not-player-turn', index: index });
            return;
        }
        if (!isValidMove(index, 'PLAYER1')) {
            const pos = cellCenter(index);
            if (pos.node) {
                pos.node.classList.remove('shake');
                void pos.node.offsetWidth;
                pos.node.classList.add('shake');
            }
            FOE.audio.invalid();
            debug.log('click.invalid', { index: index, value: state.cells[index] && state.cells[index].value });
            return;
        }
        makeMove(index);
    }

    function buildBoard() {
        els.board.innerHTML = '';
        state.cells.forEach(function (cell, i) {
            const node = document.createElement('button');
            node.type = 'button';
            node.className = 'cell';
            node.dataset.index = String(i);
            node.setAttribute('aria-label', 'Tile ' + (i + 1));
            node.addEventListener('click', function () {
                handleCellClick(i);
            });
            els.board.appendChild(node);
        });
        fitBoard();
        highlightMoves();
    }

    function resetState(size) {
        state.gridSize = size;
        state.total = size * size;
        state.cells = Array.from({ length: state.total }, function (_, i) {
            return { value: i + 1, claimed: false, owner: null };
        });
        for (let i = state.cells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = state.cells[i];
            state.cells[i] = state.cells[j];
            state.cells[j] = tmp;
        }
        state.current = 'PLAYER1';
        state.claimed = { PLAYER1: [], CPU1: [] };
        state.scores = { PLAYER1: 0, CPU1: 0 };
        state.combos = { PLAYER1: [], CPU1: [] };
        state.multipliers = { PLAYER1: 1, CPU1: 1 };
        state.bestCombo = { PLAYER1: 0, CPU1: 0 };
        state.lastValue = { PLAYER1: null, CPU1: null };
        state.counts = {
            PLAYER1: { even: 0, odd: 0, fives: 0 },
            CPU1: { even: 0, odd: 0, fives: 0 }
        };
        state.phase = 'PLAY';
        state.revealing = false;
        $('player1-history').innerHTML = '';
        $('cpu1-history').innerHTML = '';
        $('player1-score').textContent = '0';
        $('cpu1-score').textContent = '0';
        paintScout('PLAYER1', null);
        paintScout('CPU1', null);
        debug.log('game.reset', { grid: size, total: state.total });
    }

    function startGame(size) {
        FOE.audio.unlock();
        FOE.audio.start();
        if (state.peekTimer) clearTimeout(state.peekTimer);
        if (state.cpuTimer) clearTimeout(state.cpuTimer);
        resetState(size || state.chosenSize);
        els.startScreen.style.display = 'none';
        els.gameContent.classList.add('is-on');
        els.endModal.classList.remove('is-on');
        buildBoard();
        renderHUD();
        updateStatus();
        debug.log('game.start', { grid: state.gridSize });
        requestAnimationFrame(function () {
            fitBoard();
            highlightMoves();
        });
    }

    function endGame() {
        state.phase = 'OVER';
        state.revealing = false;
        highlightMoves();
        renderHUD();
        updateStatus();
        const p = state.scores.PLAYER1;
        const c = state.scores.CPU1;
        let title;
        let result;
        if (p > c) {
            title = 'You win!';
            result = 'win';
            FOE.audio.win();
            FOE.fx.confetti();
        } else if (c > p) {
            title = 'CPU wins';
            result = 'loss';
            FOE.audio.lose();
        } else {
            title = 'Draw';
            result = 'draw';
            FOE.audio.draw();
        }
        const rec = loadRecord();
        if (result === 'win') rec.wins += 1;
        if (result === 'loss') rec.losses += 1;
        if (result === 'draw') rec.draws += 1;
        let highNote = 'Best score ' + rec.high;
        if (p > rec.high) {
            rec.high = p;
            highNote = 'New personal best ' + p + '!';
        }
        saveRecord(rec);
        els.winnerText.textContent = title;
        els.finalScores.textContent = 'You ' + p + '  —  CPU ' + c;
        els.highNote.textContent = highNote;
        els.endModal.classList.add('is-on');
        debug.log('game.end', { result: result, player: p, cpu: c, high: rec.high });
    }

    function backToMenu() {
        if (state.peekTimer) clearTimeout(state.peekTimer);
        if (state.cpuTimer) clearTimeout(state.cpuTimer);
        state.phase = 'MENU';
        els.gameContent.classList.remove('is-on');
        els.endModal.classList.remove('is-on');
        els.startScreen.style.display = '';
        paintRecord();
        debug.log('game.menu', {});
    }

    function selectSize(size) {
        state.chosenSize = size;
        document.querySelectorAll('.size-card').forEach(function (card) {
            card.classList.toggle('active', Number(card.dataset.size) === size);
        });
        debug.log('menu.size', { size: size });
    }

    function syncMuteButton() {
        const muted = FOE.audio.isMuted();
        els.muteBtn.textContent = muted ? 'Sound off' : 'Sound on';
        els.muteBtn.setAttribute('aria-pressed', muted ? 'false' : 'true');
    }

    function bind() {
        cacheEls();
        debug.bind(els.debugPanel, els.debugBody);
        FOE.fx.init($('fx-canvas'), $('fx-layer'), document.querySelector('.game-shell'));
        paintRecord();
        syncMuteButton();

        document.querySelectorAll('.size-card').forEach(function (card) {
            card.addEventListener('click', function () {
                FOE.audio.unlock();
                FOE.audio.ui();
                selectSize(Number(card.dataset.size));
            });
        });
        $('start-game').addEventListener('click', function () {
            startGame(state.chosenSize);
        });
        $('new-game-btn').addEventListener('click', function () {
            FOE.audio.ui();
            backToMenu();
        });
        $('play-again').addEventListener('click', function () {
            FOE.audio.ui();
            startGame(state.gridSize);
        });
        $('end-menu').addEventListener('click', function () {
            FOE.audio.ui();
            backToMenu();
        });
        els.muteBtn.addEventListener('click', function () {
            FOE.audio.unlock();
            FOE.audio.toggleMute();
            syncMuteButton();
            FOE.audio.ui();
        });
        $('debug-btn').addEventListener('click', function () {
            debug.toggle();
        });
        $('debug-copy').addEventListener('click', function () {
            debug.copy();
        });
        window.addEventListener('keydown', function (ev) {
            if (ev.key === '`' || ev.key === 'F8') {
                ev.preventDefault();
                debug.toggle();
            }
        });
        window.addEventListener('resize', function () {
            fitBoard();
        });
        if (window.ResizeObserver && els.boardStage) {
            new ResizeObserver(function () {
                fitBoard();
            }).observe(els.boardStage);
        }
        debug.log('ui.bound', { vw: window.innerWidth, vh: window.innerHeight });
    }

    FOE.game = {
        start: startGame,
        fitBoard: fitBoard,
        state: state
    };

    document.addEventListener('DOMContentLoaded', bind);
})();
