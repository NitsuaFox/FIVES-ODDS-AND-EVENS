/* FOE juice: particles, floating scores, combo toasts, screen shake. */
(function () {
    const FOE = (window.FOE = window.FOE || {});
    const debug = FOE.debug;

    const particles = [];
    const popups = [];
    let canvas = null;
    let ctx = null;
    let layer = null;
    let shakeUntil = 0;
    let shakeEl = null;
    let running = false;
    let reduced = false;

    function init(fxCanvas, fxLayer, shell) {
        canvas = fxCanvas;
        layer = fxLayer;
        shakeEl = shell;
        ctx = canvas.getContext('2d');
        reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        resize();
        window.addEventListener('resize', resize);
        if (!running) {
            running = true;
            requestAnimationFrame(tick);
        }
        debug && debug.log('fx.init', { reduced: reduced, w: canvas.width, h: canvas.height });
    }

    function resize() {
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function burst(x, y, color, count) {
        if (reduced) return;
        const n = count || 18;
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
            const sp = 1.4 + Math.random() * 3.6;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 1.2,
                life: 1,
                decay: 0.016 + Math.random() * 0.02,
                size: 2 + Math.random() * 3,
                color: color,
                g: 0.06
            });
        }
    }

    function confetti() {
        if (reduced) return;
        const colors = ['#3da9fc', '#ff6b4a', '#ffd166', '#6ee56e', '#ff6ec7', '#4cc9f0'];
        for (let i = 0; i < 80; i++) {
            particles.push({
                x: Math.random() * window.innerWidth,
                y: -12 - Math.random() * 80,
                vx: (Math.random() - 0.5) * 3,
                vy: 1.5 + Math.random() * 3.5,
                life: 1.2 + Math.random(),
                decay: 0.004 + Math.random() * 0.006,
                size: 3 + Math.random() * 4,
                color: colors[i % colors.length],
                g: 0.04
            });
        }
        debug && debug.log('fx.confetti', { n: 80 });
    }

    function popup(x, y, text, color) {
        const el = document.createElement('div');
        el.className = 'fx-popup';
        el.textContent = text;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.color = color || '#ffd166';
        layer.appendChild(el);
        popups.push(el);
        setTimeout(function () {
            el.remove();
            const idx = popups.indexOf(el);
            if (idx >= 0) popups.splice(idx, 1);
        }, 900);
    }

    function toast(text, kind) {
        const el = document.createElement('div');
        el.className = 'fx-toast ' + (kind || '');
        el.textContent = text;
        layer.appendChild(el);
        debug && debug.log('fx.toast', { text: text, kind: kind || '' });
        setTimeout(function () {
            el.classList.add('out');
        }, 900);
        setTimeout(function () {
            el.remove();
        }, 1200);
    }

    function shake(ms) {
        if (reduced || !shakeEl) return;
        shakeUntil = performance.now() + (ms || 280);
        shakeEl.classList.add('is-shaking');
    }

    function tick(now) {
        if (ctx) {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.g;
                p.life -= p.decay;
                if (p.life <= 0) {
                    particles.splice(i, 1);
                    continue;
                }
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        if (shakeEl && now > shakeUntil) {
            shakeEl.classList.remove('is-shaking');
        }
        requestAnimationFrame(tick);
    }

    FOE.fx = {
        init: init,
        resize: resize,
        burst: burst,
        confetti: confetti,
        popup: popup,
        toast: toast,
        shake: shake
    };
})();
