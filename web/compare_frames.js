import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

function imageDataToUrl(data) {
    return api.apiURL(
        `/view?filename=${encodeURIComponent(data.filename)}&type=${data.type}&subfolder=${data.subfolder}` + app.getPreviewFormatParam()
    );
}

app.registerExtension({
    name: "Matoo.CompareFrames",
    async nodeCreated(node) {
        if (node.comfyClass !== "CompareFrames") return;

        // ── State ─────────────────────────────────────────────────────────────
        let framesA      = [];
        let framesB      = [];
        let fps          = 12;
        let speed        = 1.0;
        let loop         = true;
        let isPlaying    = false;
        let playFrame    = 0;
        let rafId        = null;
        let lastTime     = null;
        let accumulated  = 0;
        let layoutMode   = "slider";   // "slider" | "sidebyside" | "overlay"
        let overlayAlpha = 0.5;
        let sliderRatio  = 0.5;
        let isDragging   = false;

        // ── Helpers ───────────────────────────────────────────────────────────
        function mkBtn(label, title) {
            const b = document.createElement("button");
            b.textContent = label;
            b.title = title;
            b.style.cssText = [
                "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;",
                "padding:2px 8px;font-size:11px;cursor:pointer;white-space:nowrap;",
                "transition:background .15s,color .15s,border-color .15s;"
            ].join("");
            b.addEventListener("mouseenter", () => { if (!b._active) b.style.background = "#3a3a3a"; });
            b.addEventListener("mouseleave", () => { if (!b._active) b.style.background = "#2a2a2a"; });
            return b;
        }
        function setActive(b, on) {
            b._active = on;
            b.style.background   = on ? "#00b894" : "#2a2a2a";
            b.style.color        = on ? "#fff"    : "#ccc";
            b.style.borderColor  = on ? "#00b894" : "#444";
        }
        function mkSep() {
            const s = document.createElement("span");
            s.style.cssText = "width:1px;height:16px;background:#333;margin:0 2px;flex-shrink:0;";
            return s;
        }

        // ── Build UI elements (all created up-front) ──────────────────────────

        // Toolbar
        const toolbar = document.createElement("div");
        toolbar.style.cssText = [
            "display:flex;align-items:center;gap:5px;padding:4px 6px;",
            "background:#1a1a1a;border-bottom:1px solid #333;flex-wrap:wrap;",
            "user-select:none;flex-shrink:0;"
        ].join("");

        // Playback
        const btnPlay = mkBtn("▶ Play", "Play / Pause");
        const btnPrev = mkBtn("◀",      "Previous frame");
        const btnNext = mkBtn("▶",      "Next frame");
        const btnLoop = mkBtn("↺ Loop", "Toggle loop");
        setActive(btnLoop, true);

        const speedSel = document.createElement("select");
        speedSel.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;font-size:11px;padding:1px 4px;cursor:pointer;";
        [["0.25×","0.25"],["0.5×","0.5"],["1×","1"],["1.5×","1.5"],["2×","2"],["4×","4"]].forEach(([txt,val]) => {
            const o = document.createElement("option");
            o.textContent = txt; o.value = val;
            if (val === "1") o.selected = true;
            speedSel.appendChild(o);
        });

        // Layout buttons
        const btnSlider  = mkBtn("⧪ Slider",         "Slider compare mode");
        const btnSide    = mkBtn("⬛⬛ Side by Side", "Side by side mode");
        const btnOverlay = mkBtn("◈ Overlay",         "Overlay transparency");
        setActive(btnSlider, true);

        const infoLabel = document.createElement("span");
        infoLabel.style.cssText = "font-size:10px;color:#666;margin-left:auto;white-space:nowrap;";
        infoLabel.textContent = "No frames loaded";

        toolbar.append(btnPlay, btnPrev, btnNext, btnLoop, speedSel, mkSep(), btnSlider, btnSide, btnOverlay, infoLabel);

        // Alpha row (hidden by default)
        const alphaRow = document.createElement("div");
        alphaRow.style.cssText = [
            "display:none;align-items:center;gap:6px;padding:3px 6px;",
            "background:#181818;border-bottom:1px solid #333;",
            "user-select:none;flex-shrink:0;"
        ].join("");

        const alphaLabelA   = document.createElement("span");
        alphaLabelA.style.cssText = "font-size:10px;color:#888;";
        alphaLabelA.textContent   = "A";

        const alphaSlider = document.createElement("input");
        alphaSlider.type  = "range";
        alphaSlider.min   = 0; alphaSlider.max = 100; alphaSlider.value = 50;
        alphaSlider.style.cssText = "flex:1;accent-color:#00b894;cursor:pointer;height:14px;";

        const alphaLabelB = document.createElement("span");
        alphaLabelB.style.cssText = "font-size:10px;color:#888;";
        alphaLabelB.textContent   = "B";

        const alphaValLabel = document.createElement("span");
        alphaValLabel.style.cssText = "font-size:10px;color:#00b894;min-width:32px;text-align:right;white-space:nowrap;";
        alphaValLabel.textContent   = "50%";

        alphaRow.append(alphaLabelA, alphaSlider, alphaLabelB, alphaValLabel);

        // Scrub bar
        const scrubBar = document.createElement("div");
        scrubBar.style.cssText = [
            "display:flex;align-items:center;gap:6px;padding:3px 6px;",
            "background:#181818;border-bottom:1px solid #333;flex-shrink:0;"
        ].join("");

        const scrubLabel = document.createElement("span");
        scrubLabel.style.cssText = "font-size:10px;color:#666;min-width:48px;";
        scrubLabel.textContent   = "0 / 0";

        const scrubber = document.createElement("input");
        scrubber.type  = "range";
        scrubber.min   = 0; scrubber.max = 0; scrubber.value = 0;
        scrubber.style.cssText = "flex:1;accent-color:#00b894;cursor:pointer;height:14px;";

        scrubBar.append(scrubLabel, scrubber);

        // Canvas — explicit pixel height; we'll resize it via ResizeObserver
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "width:100%;display:block;touch-action:none;flex:1;min-height:0;";
        const ctx = canvas.getContext("2d");

        // Root wrapper
        const root = document.createElement("div");
        root.style.cssText = "width:100%;display:flex;flex-direction:column;background:#111;font-family:sans-serif;overflow:hidden;";
        root.append(toolbar, alphaRow, scrubBar, canvas);

        // Register widget
        node.addDOMWidget("framepreview", "preview", root, {
            serialize: false,
            hideOnZoom: false,
        });

        // Keep canvas pixel dimensions in sync with its CSS layout size
        const ro = new ResizeObserver(() => requestAnimationFrame(drawFrame));
        ro.observe(canvas);

        // ── Event wiring ──────────────────────────────────────────────────────

        btnPlay.addEventListener("click", () => {
            isPlaying = !isPlaying;
            btnPlay.textContent = isPlaying ? "⏸ Pause" : "▶ Play";
            setActive(btnPlay, isPlaying);
            if (isPlaying) {
                playFrame   = getWidgetValues().compFrame;
                lastTime    = null;
                accumulated = 0;
                rafId = requestAnimationFrame(animLoop);
            } else {
                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            }
        });

        btnPrev.addEventListener("click", () => {
            const total = Math.max(framesA.length, framesB.length);
            if (!total) return;
            playFrame = ((isPlaying ? playFrame : getWidgetValues().compFrame) - 1 + total) % total;
            setCompFrameWidget(playFrame);
            updateScrubber();
            drawFrame();
        });

        btnNext.addEventListener("click", () => {
            const total = Math.max(framesA.length, framesB.length);
            if (!total) return;
            playFrame = ((isPlaying ? playFrame : getWidgetValues().compFrame) + 1) % total;
            setCompFrameWidget(playFrame);
            updateScrubber();
            drawFrame();
        });

        btnLoop.addEventListener("click", () => {
            loop = !loop;
            setActive(btnLoop, loop);
        });

        speedSel.addEventListener("change", () => { speed = parseFloat(speedSel.value); });

        // Layout mode
        function setLayout(mode) {
            layoutMode = mode;
            setActive(btnSlider,  mode === "slider");
            setActive(btnSide,    mode === "sidebyside");
            setActive(btnOverlay, mode === "overlay");
            alphaRow.style.display = mode === "overlay" ? "flex" : "none";
            canvas.style.cursor    = "default";
            drawFrame();
        }
        btnSlider .addEventListener("click", () => setLayout("slider"));
        btnSide   .addEventListener("click", () => setLayout("sidebyside"));
        btnOverlay.addEventListener("click", () => setLayout("overlay"));

        alphaSlider.addEventListener("input", () => {
            overlayAlpha = parseInt(alphaSlider.value, 10) / 100;
            alphaValLabel.textContent = `${alphaSlider.value}%`;
            drawFrame();
        });

        scrubber.addEventListener("input", () => {
            playFrame = parseInt(scrubber.value, 10);
            setCompFrameWidget(playFrame);
            updateScrubberLabel();
            drawFrame();
        });

        // ── Widget helpers ────────────────────────────────────────────────────
        function getWidgetValues() {
            let compFrame = 0, skipA = 0, skipB = 0;
            if (node.widgets) {
                const wC = node.widgets.find(w => w.name === "compare_frame");
                const wA = node.widgets.find(w => w.name === "skip_a");
                const wB = node.widgets.find(w => w.name === "skip_b");
                if (wC) compFrame = wC.value || 0;
                if (wA) skipA     = wA.value || 0;
                if (wB) skipB     = wB.value || 0;
            }
            return { compFrame, skipA, skipB };
        }

        function setCompFrameWidget(val) {
            if (!node.widgets) return;
            const w = node.widgets.find(w => w.name === "compare_frame");
            if (w) w.value = val;
        }

        function updateScrubber() {
            const total = Math.max(framesA.length, framesB.length);
            scrubber.max   = Math.max(0, total - 1);
            scrubber.value = isPlaying ? playFrame : getWidgetValues().compFrame;
            updateScrubberLabel();
        }
        function updateScrubberLabel() {
            const total = Math.max(framesA.length, framesB.length);
            scrubLabel.textContent = `${scrubber.value} / ${Math.max(0, total - 1)}`;
        }

        const hookWidgets = () => {
            if (!node.widgets) return;
            for (const w of node.widgets) {
                if (["compare_frame","skip_a","skip_b"].includes(w.name) && !w._cf_hooked) {
                    const orig = w.callback;
                    w.callback = function () {
                        if (orig) orig.apply(this, arguments);
                        updateScrubber();
                        requestAnimationFrame(drawFrame);
                    };
                    w._cf_hooked = true;
                }
            }
        };
        hookWidgets();
        setTimeout(hookWidgets, 200);

        // ── Draw ──────────────────────────────────────────────────────────────
        function getImg(arr, idx) {
            if (!arr || !arr.length) return null;
            const img = arr[Math.min(idx, arr.length - 1)];
            return (img && img.complete && img.naturalWidth > 0) ? img : null;
        }

        function fitInRegion(img, rx, ry, rw, rh, alpha) {
            if (!img) return;
            const savedAlpha = ctx.globalAlpha;
            if (alpha !== undefined) ctx.globalAlpha = alpha;
            ctx.save();
            ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
            const r = img.naturalWidth / img.naturalHeight;
            let dw, dh, dx, dy;
            if (r > rw / rh) { dw = rw; dh = rw / r; dx = rx; dy = ry + (rh - dh) / 2; }
            else              { dh = rh; dw = rh * r; dx = rx + (rw - dw) / 2; dy = ry; }
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.restore();
            ctx.globalAlpha = savedAlpha;
        }

        function fitFull(img, clipX, clipW, w, h, alpha) {
            // Fit image to full canvas size, clip to a column — used for slider wipe
            if (!img) return;
            const savedAlpha = ctx.globalAlpha;
            if (alpha !== undefined) ctx.globalAlpha = alpha;
            ctx.save();
            ctx.beginPath(); ctx.rect(clipX, 0, clipW, h); ctx.clip();
            const r = img.naturalWidth / img.naturalHeight;
            let dw, dh, dx, dy;
            if (r > w / h) { dw = w; dh = w / r; dx = 0; dy = (h - dh) / 2; }
            else            { dh = h; dw = h * r; dx = (w - dw) / 2; dy = 0; }
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.restore();
            ctx.globalAlpha = savedAlpha;
        }

        function drawFrame() {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            canvas.width  = Math.round(rect.width);
            canvas.height = Math.round(rect.height);
            const w = canvas.width, h = canvas.height;

            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, w, h);

            const { compFrame, skipA, skipB } = getWidgetValues();
            const base    = isPlaying ? playFrame : compFrame;
            const targetA = Math.max(0, base + skipA);
            const targetB = Math.max(0, base + skipB);

            const imgA = getImg(framesA, targetA);
            const imgB = getImg(framesB, targetB);

            // Nothing loaded yet
            if (!imgA && !imgB) {
                ctx.fillStyle = "#444"; ctx.font = "13px sans-serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("Connect images_a and/or images_b, then run the node", w / 2, h / 2);
                return;
            }

            // Single sequence — show full width
            if (!(framesA.length > 0 && framesB.length > 0)) {
                const img   = imgA || imgB;
                const label = imgA ? `A: ${targetA}` : `B: ${targetB}`;
                fitInRegion(img, 0, 0, w, h);
                drawBanner(w);
                ctx.fillStyle = "#fff"; ctx.textAlign = "left";  ctx.fillText(label, 8, 12);
                ctx.fillStyle = "#00b894"; ctx.textAlign = "right"; ctx.fillText(`Frame ${base}`, w - 8, 12);
                return;
            }

            // Two sequences — use layout mode
            if (layoutMode === "sidebyside") {
                const half = Math.floor(w / 2);
                fitInRegion(imgA, 0,    0, half, h);
                fitInRegion(imgB, half, 0, half, h);
                ctx.strokeStyle = "#00b894"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, h); ctx.stroke();

                drawBanner(w);
                ctx.fillStyle = "#fff"; ctx.textAlign = "center";
                ctx.fillText(`A: ${targetA}`, w * 0.25, 12);
                ctx.fillStyle = "#00b894";
                ctx.fillText(`Frame ${base}`, w * 0.5, 12);
                ctx.fillStyle = "#fff";
                ctx.fillText(`B: ${targetB}`, w * 0.75, 12);

            } else if (layoutMode === "overlay") {
                fitInRegion(imgA, 0, 0, w, h, 1);
                if (imgB) fitInRegion(imgB, 0, 0, w, h, overlayAlpha);

                drawBanner(w);
                ctx.fillStyle = "#fff"; ctx.textAlign = "left";
                ctx.fillText(`A: ${targetA}`, 8, 12);
                ctx.fillStyle = "#00b894"; ctx.textAlign = "center";
                ctx.fillText(`Frame ${base}  •  B ${Math.round(overlayAlpha * 100)}%`, w / 2, 12);
                ctx.fillStyle = "#fff"; ctx.textAlign = "right";
                ctx.fillText(`B: ${targetB}`, w - 8, 12);

            } else {
                // Slider
                const sx = w * sliderRatio;
                fitFull(imgA, 0,  sx,     w, h);
                fitFull(imgB, sx, w - sx, w, h);

                ctx.strokeStyle = "#00b894"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(sx, 24); ctx.lineTo(sx, h); ctx.stroke();

                ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 4;
                ctx.beginPath(); ctx.arc(sx, h / 2, 12, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0; ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = "#222"; ctx.font = "9px Arial"; ctx.textAlign = "center";
                ctx.fillText("◀▶", sx, h / 2);

                drawBanner(w);
                ctx.fillStyle = "#fff"; ctx.textAlign = "left";   ctx.fillText(`A: ${targetA}`, 8, 12);
                ctx.fillStyle = "#00b894"; ctx.textAlign = "center"; ctx.fillText(`Frame ${base}`, w / 2, 12);
                ctx.fillStyle = "#fff"; ctx.textAlign = "right";  ctx.fillText(`B: ${targetB}`, w - 8, 12);
            }
        }

        function drawBanner(w) {
            ctx.fillStyle = "rgba(0,0,0,.65)";
            ctx.fillRect(0, 0, w, 24);
            ctx.font = "12px sans-serif"; ctx.textBaseline = "middle";
        }

        // ── Animation loop ────────────────────────────────────────────────────
        function animLoop(ts) {
            if (!isPlaying) return;
            if (lastTime === null) lastTime = ts;
            accumulated += ts - lastTime;
            lastTime = ts;

            const dur   = 1000 / (fps * speed);
            const total = Math.max(framesA.length, framesB.length);

            while (accumulated >= dur && total > 0) {
                accumulated -= dur;
                playFrame++;
                if (playFrame >= total) {
                    if (loop) { playFrame = 0; }
                    else {
                        playFrame = total - 1;
                        isPlaying = false;
                        btnPlay.textContent = "▶ Play";
                        setActive(btnPlay, false);
                        setCompFrameWidget(playFrame);
                        updateScrubber();
                        drawFrame();
                        return;
                    }
                }
                scrubber.value = playFrame;
                updateScrubberLabel();
                setCompFrameWidget(playFrame);
            }

            drawFrame();
            rafId = requestAnimationFrame(animLoop);
        }

        // ── Slider pointer events ─────────────────────────────────────────────
        canvas.addEventListener("pointerdown", (e) => {
            if (layoutMode !== "slider") return;
            const rect = canvas.getBoundingClientRect();
            if (Math.abs((e.clientX - rect.left) - rect.width * sliderRatio) < 20) {
                isDragging = true;
                canvas.setPointerCapture(e.pointerId);
                e.preventDefault(); e.stopPropagation();
            }
        });

        canvas.addEventListener("pointermove", (e) => {
            if (layoutMode === "slider") {
                const rect = canvas.getBoundingClientRect();
                const near = Math.abs((e.clientX - rect.left) - rect.width * sliderRatio) < 20;
                canvas.style.cursor = near ? "col-resize" : "default";
            } else {
                canvas.style.cursor = "default";
            }
            if (!isDragging) return;
            const rect  = canvas.getBoundingClientRect();
            sliderRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            drawFrame();
            e.preventDefault(); e.stopPropagation();
        });

        const stopDrag = (e) => {
            if (!isDragging) return;
            isDragging = false;
            canvas.releasePointerCapture(e.pointerId);
            e.preventDefault(); e.stopPropagation();
        };
        canvas.addEventListener("pointerup",     stopDrag);
        canvas.addEventListener("pointercancel", stopDrag);

        const origOnResize = node.onResize;
        node.onResize = function () {
            if (origOnResize) origOnResize.apply(this, arguments);
            requestAnimationFrame(drawFrame);
        };

        // ── Load on execution ─────────────────────────────────────────────────
        node.onExecuted = async function (message) {
            isPlaying = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            btnPlay.textContent = "▶ Play"; setActive(btnPlay, false);

            if (message.fps != null)
                fps = Array.isArray(message.fps) ? message.fps[0] : message.fps;

            framesA = []; framesB = [];
            playFrame = getWidgetValues().compFrame;

            const load = (list, target) => (list || []).map(d => new Promise(res => {
                const img = new Image();
                img.onload = img.onerror = res;
                img.src    = imageDataToUrl(d);
                target.push(img);
            }));

            await Promise.all([...load(message.a_images, framesA), ...load(message.b_images, framesB)]);

            const total = Math.max(framesA.length, framesB.length);
            scrubber.max   = Math.max(0, total - 1);
            scrubber.value = playFrame;
            updateScrubberLabel();

            const parts = [];
            if (framesA.length) parts.push(`A: ${framesA.length}`);
            if (framesB.length) parts.push(`B: ${framesB.length}`);
            infoLabel.textContent = parts.join(" | ") + ` frames  •  ${fps} fps`;

            requestAnimationFrame(drawFrame);
        };

        // Initial draw attempt after layout settles
        setTimeout(() => requestAnimationFrame(drawFrame), 150);
    },
});
