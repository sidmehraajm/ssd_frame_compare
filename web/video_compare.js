import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

function imageDataToUrl(data) {
    return api.apiURL(
        `/view?filename=${encodeURIComponent(data.filename)}&type=${data.type}&subfolder=${data.subfolder}` + app.getPreviewFormatParam()
    );
}

app.registerExtension({
    name: "Matoo.VideoCompare",
    async nodeCreated(node) {
        if (node.comfyClass !== "VideoCompare") return;

        // ── State ─────────────────────────────────────────────────────────────
        let framesA = [];
        let framesB = [];
        let currentFrame = 0;
        let isPlaying    = false;
        let fps          = 12;
        let speed        = 1.0;
        let loop         = true;
        let rafId        = null;
        let lastTime     = null;
        let accumulated  = 0;
        // Layout: "sidebyside" | "slider"
        let layoutMode   = "sidebyside";
        let sliderRatio  = 0.5;
        let isDragging   = false;

        // ── Root container ────────────────────────────────────────────────────
        const root = document.createElement("div");
        root.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;background:#111;font-family:sans-serif;";

        // ── Toolbar ───────────────────────────────────────────────────────────
        const toolbar = document.createElement("div");
        toolbar.style.cssText = `
            display:flex;align-items:center;gap:5px;padding:4px 6px;
            background:#1a1a1a;border-bottom:1px solid #333;flex-shrink:0;flex-wrap:wrap;
            user-select:none;
        `;

        // Helper: icon button
        function mkBtn(label, title) {
            const b = document.createElement("button");
            b.textContent = label;
            b.title       = title;
            b.style.cssText = `
                background:#2a2a2a;color:#ccc;border:1px solid #444;
                border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;
                transition:background 0.15s,color 0.15s,border-color 0.15s;white-space:nowrap;
            `;
            b.addEventListener("mouseenter", () => { if (!b._active) b.style.background = "#3a3a3a"; });
            b.addEventListener("mouseleave", () => { if (!b._active) b.style.background = "#2a2a2a"; });
            return b;
        }
        function setActive(b, on) {
            b._active         = on;
            b.style.background   = on ? "#00b894" : "#2a2a2a";
            b.style.color        = on ? "#fff"    : "#ccc";
            b.style.borderColor  = on ? "#00b894" : "#444";
        }

        // ── Play / Pause / Step ───────────────────────────────────────────────
        const btnPlay = mkBtn("▶ Play",  "Play/Pause");
        const btnPrev = mkBtn("◀",       "Previous frame");
        const btnNext = mkBtn("▶",       "Next frame");
        const btnLoop = mkBtn("↺ Loop",  "Toggle loop");
        setActive(btnLoop, loop);

        btnPlay.addEventListener("click", () => {
            isPlaying = !isPlaying;
            btnPlay.textContent = isPlaying ? "⏸ Pause" : "▶ Play";
            setActive(btnPlay, isPlaying);
            if (isPlaying) {
                lastTime    = null;
                accumulated = 0;
                rafId = requestAnimationFrame(animLoop);
            } else {
                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            }
        });

        btnPrev.addEventListener("click", () => {
            const total = Math.max(framesA.length, framesB.length);
            if (total === 0) return;
            currentFrame = (currentFrame - 1 + total) % total;
            updateScrubber();
            drawFrame();
        });

        btnNext.addEventListener("click", () => {
            const total = Math.max(framesA.length, framesB.length);
            if (total === 0) return;
            currentFrame = (currentFrame + 1) % total;
            updateScrubber();
            drawFrame();
        });

        btnLoop.addEventListener("click", () => {
            loop = !loop;
            setActive(btnLoop, loop);
        });

        // ── Speed selector ────────────────────────────────────────────────────
        const speedLabel = document.createElement("span");
        speedLabel.style.cssText = "font-size:11px;color:#888;";
        speedLabel.textContent = "Speed:";

        const speedSel = document.createElement("select");
        speedSel.style.cssText = `
            background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;
            font-size:11px;padding:1px 4px;cursor:pointer;
        `;
        [["0.25×","0.25"],["0.5×","0.5"],["1×","1"],["1.5×","1.5"],["2×","2"],["4×","4"]].forEach(([txt, val]) => {
            const opt = document.createElement("option");
            opt.textContent = txt;
            opt.value       = val;
            if (val === "1") opt.selected = true;
            speedSel.appendChild(opt);
        });
        speedSel.addEventListener("change", () => { speed = parseFloat(speedSel.value); });

        // ── Layout toggle ─────────────────────────────────────────────────────
        const btnSide   = mkBtn("⬛⬛ Side by Side", "Side by side layout");
        const btnSlider = mkBtn("⧪ Slider",          "Slider layout");
        setActive(btnSide, true);

        btnSide.addEventListener("click", () => {
            layoutMode = "sidebyside";
            setActive(btnSide,   true);
            setActive(btnSlider, false);
            canvas.style.cursor = "default";
            drawFrame();
        });
        btnSlider.addEventListener("click", () => {
            layoutMode = "slider";
            setActive(btnSide,   false);
            setActive(btnSlider, true);
            drawFrame();
        });

        // ── Frame counter ─────────────────────────────────────────────────────
        const frameCounter = document.createElement("span");
        frameCounter.style.cssText = "font-size:10px;color:#666;margin-left:auto;white-space:nowrap;";
        frameCounter.textContent   = "No frames";

        toolbar.append(btnPlay, btnPrev, btnNext, btnLoop,
                        speedLabel, speedSel,
                        btnSide, btnSlider,
                        frameCounter);

        // ── Scrubber ──────────────────────────────────────────────────────────
        const scrubBar = document.createElement("div");
        scrubBar.style.cssText = `
            padding:3px 6px;background:#181818;border-bottom:1px solid #333;
            display:flex;align-items:center;gap:6px;flex-shrink:0;
        `;

        const scrubLabel = document.createElement("span");
        scrubLabel.style.cssText = "font-size:10px;color:#666;min-width:40px;";
        scrubLabel.textContent = "0 / 0";

        const scrubber = document.createElement("input");
        scrubber.type  = "range";
        scrubber.min   = 0;
        scrubber.max   = 0;
        scrubber.value = 0;
        scrubber.style.cssText = `
            flex:1;accent-color:#00b894;cursor:pointer;height:14px;
        `;
        scrubber.addEventListener("input", () => {
            currentFrame = parseInt(scrubber.value, 10);
            updateCounter();
            drawFrame();
        });

        scrubBar.append(scrubLabel, scrubber);

        function updateScrubber() {
            const total = Math.max(framesA.length, framesB.length);
            scrubber.max   = Math.max(0, total - 1);
            scrubber.value = currentFrame;
            updateCounter();
        }

        function updateCounter() {
            const total = Math.max(framesA.length, framesB.length);
            scrubLabel.textContent = `${currentFrame} / ${Math.max(0, total - 1)}`;
        }

        // ── Canvas ────────────────────────────────────────────────────────────
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "width:100%;flex:1;min-height:0;display:block;touch-action:none;";
        const ctx = canvas.getContext("2d");

        root.append(toolbar, scrubBar, canvas);

        node.addDOMWidget("videopreview", "preview", root, {
            serialize: false,
            hideOnZoom: false,
        });

        // ── Draw ──────────────────────────────────────────────────────────────
        function getImg(arr, idx) {
            if (!arr || arr.length === 0) return null;
            const img = arr[Math.min(idx, arr.length - 1)];
            return (img && img.complete && img.naturalWidth > 0) ? img : null;
        }

        function drawSideBySide(imgA, imgB, w, h) {
            const hasA = !!imgA, hasB = !!imgB;
            const halfW = hasA && hasB ? Math.floor(w / 2) : w;

            function fit(img, x, cw) {
                if (!img) return;
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, 0, cw, h);
                ctx.clip();
                const r = img.naturalWidth / img.naturalHeight;
                let dw, dh, dx, dy;
                if (r > cw / h) { dw = cw; dh = cw / r; dx = x; dy = (h - dh) / 2; }
                else            { dh = h;  dw = h  * r; dx = x + (cw - dw) / 2; dy = 0; }
                ctx.drawImage(img, dx, dy, dw, dh);
                ctx.restore();
            }

            if (hasA && hasB) {
                fit(imgA, 0,     halfW);
                fit(imgB, halfW, halfW);
                // Divider
                ctx.strokeStyle = "#00b894";
                ctx.lineWidth   = 2;
                ctx.beginPath();
                ctx.moveTo(halfW, 0);
                ctx.lineTo(halfW, h);
                ctx.stroke();
            } else if (hasA) {
                fit(imgA, 0, w);
            } else if (hasB) {
                fit(imgB, 0, w);
            }
        }

        function drawSlider(imgA, imgB, w, h) {
            const splitX = w * sliderRatio;

            function fitClipped(img, clipX, clipW) {
                if (!img) return;
                ctx.save();
                ctx.beginPath();
                ctx.rect(clipX, 0, clipW, h);
                ctx.clip();
                const r = img.naturalWidth / img.naturalHeight;
                let dw, dh, dx, dy;
                if (r > w / h) { dw = w; dh = w / r; dx = 0; dy = (h - dh) / 2; }
                else           { dh = h; dw = h * r; dx = (w - dw) / 2; dy = 0; }
                ctx.drawImage(img, dx, dy, dw, dh);
                ctx.restore();
            }

            fitClipped(imgA, 0,      splitX);
            fitClipped(imgB, splitX, w - splitX);

            // Slider line
            ctx.strokeStyle = "#00b894";
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.moveTo(splitX, 24);
            ctx.lineTo(splitX, h);
            ctx.stroke();

            // Handle
            ctx.fillStyle   = "#ffffff";
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur  = 4;
            ctx.beginPath();
            ctx.arc(splitX, h / 2, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.strokeStyle = "#222";
            ctx.lineWidth   = 1.5;
            ctx.stroke();
            ctx.fillStyle   = "#222";
            ctx.font        = "9px Arial";
            ctx.textAlign   = "center";
            ctx.fillText("◀▶", splitX, h / 2);
        }

        function drawFrame() {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            canvas.width  = rect.width;
            canvas.height = rect.height;
            const w = canvas.width, h = canvas.height;

            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, w, h);

            const imgA = getImg(framesA, currentFrame);
            const imgB = getImg(framesB, currentFrame);

            // Placeholder text when no images
            if (!imgA && !imgB) {
                ctx.fillStyle    = "#444";
                ctx.font         = "14px sans-serif";
                ctx.textAlign    = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("Run the node to load frames", w / 2, h / 2);
                return;
            }

            if (layoutMode === "sidebyside") {
                drawSideBySide(imgA, imgB, w, h);
            } else {
                drawSlider(imgA, imgB, w, h);
            }

            // ── Header overlay ──
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, 0, w, 24);
            ctx.font         = "12px sans-serif";
            ctx.textBaseline = "middle";

            if (layoutMode === "sidebyside") {
                const hasA = framesA.length > 0, hasB = framesB.length > 0;
                if (hasA && hasB) {
                    ctx.fillStyle = "#FFF";
                    ctx.textAlign = "center";
                    ctx.fillText(`A: ${Math.min(currentFrame, framesA.length - 1)} / ${framesA.length - 1}`, w * 0.25, 12);
                    ctx.fillStyle = "#00b894";
                    ctx.textAlign = "center";
                    ctx.fillText(`Frame ${currentFrame}`, w * 0.5, 12);
                    ctx.fillStyle = "#FFF";
                    ctx.fillText(`B: ${Math.min(currentFrame, framesB.length - 1)} / ${framesB.length - 1}`, w * 0.75, 12);
                } else {
                    ctx.fillStyle = "#FFF";
                    ctx.textAlign = "center";
                    ctx.fillText(`Frame ${currentFrame}`, w / 2, 12);
                }
            } else {
                ctx.fillStyle = "#FFF";
                ctx.textAlign = "left";
                ctx.fillText(`A: ${Math.min(currentFrame, framesA.length - 1)}`, 8, 12);
                ctx.fillStyle = "#00b894";
                ctx.textAlign = "center";
                ctx.fillText(`Frame ${currentFrame}`, w / 2, 12);
                ctx.fillStyle = "#FFF";
                ctx.textAlign = "right";
                ctx.fillText(`B: ${Math.min(currentFrame, framesB.length - 1)}`, w - 8, 12);
            }
        }

        // ── Animation loop ────────────────────────────────────────────────────
        function animLoop(timestamp) {
            if (!isPlaying) return;

            if (lastTime === null) lastTime = timestamp;
            const delta = timestamp - lastTime;
            lastTime    = timestamp;

            const frameDuration = 1000 / (fps * speed);
            accumulated += delta;

            while (accumulated >= frameDuration) {
                accumulated -= frameDuration;
                const total = Math.max(framesA.length, framesB.length);
                if (total === 0) break;

                currentFrame++;
                if (currentFrame >= total) {
                    if (loop) {
                        currentFrame = 0;
                    } else {
                        currentFrame = total - 1;
                        isPlaying    = false;
                        btnPlay.textContent = "▶ Play";
                        setActive(btnPlay, false);
                        updateScrubber();
                        drawFrame();
                        return;
                    }
                }
                updateScrubber();
            }

            drawFrame();
            rafId = requestAnimationFrame(animLoop);
        }

        // ── Pointer events (slider mode) ──────────────────────────────────────
        canvas.addEventListener("pointerdown", (e) => {
            if (layoutMode !== "slider") return;
            const rect   = canvas.getBoundingClientRect();
            const x      = e.clientX - rect.left;
            const splitX = rect.width * sliderRatio;
            if (Math.abs(x - splitX) < 20) {
                isDragging = true;
                canvas.setPointerCapture(e.pointerId);
                e.preventDefault();
                e.stopPropagation();
            }
        });

        canvas.addEventListener("pointermove", (e) => {
            if (layoutMode === "slider") {
                const rect   = canvas.getBoundingClientRect();
                const x      = e.clientX - rect.left;
                const splitX = rect.width * sliderRatio;
                canvas.style.cursor = Math.abs(x - splitX) < 20 ? "col-resize" : "default";
            } else {
                canvas.style.cursor = "default";
            }

            if (!isDragging) return;
            const rect = canvas.getBoundingClientRect();
            sliderRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            drawFrame();
            e.preventDefault();
            e.stopPropagation();
        });

        const stopDrag = (e) => {
            if (isDragging) {
                isDragging = false;
                canvas.releasePointerCapture(e.pointerId);
                e.preventDefault();
                e.stopPropagation();
            }
        };
        canvas.addEventListener("pointerup",     stopDrag);
        canvas.addEventListener("pointercancel", stopDrag);

        // Resize
        const origOnResize = node.onResize;
        node.onResize = function () {
            if (origOnResize) origOnResize.apply(this, arguments);
            drawFrame();
        };

        // ── Load images from backend ──────────────────────────────────────────
        node.onExecuted = async function (message) {
            // Stop any running playback
            isPlaying = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            btnPlay.textContent = "▶ Play";
            setActive(btnPlay, false);

            // Read fps from message (passed from backend, arrives as a list)
            if (message.fps != null) fps = Array.isArray(message.fps) ? message.fps[0] : message.fps;

            framesA = [];
            framesB = [];
            currentFrame = 0;

            const load = (imgDataArr, target) => {
                return (imgDataArr || []).map(imgData => new Promise(resolve => {
                    const img   = new Image();
                    img.onload  = () => resolve();
                    img.onerror = () => resolve();
                    img.src     = imageDataToUrl(imgData);
                    target.push(img);
                }));
            };

            const promises = [
                ...load(message.a_images, framesA),
                ...load(message.b_images, framesB),
            ];
            await Promise.all(promises);

            const totalA = framesA.length;
            const totalB = framesB.length;
            const total  = Math.max(totalA, totalB);

            frameCounter.textContent = `A: ${totalA} frames | B: ${totalB} frames | fps: ${fps}`;
            updateScrubber();
            drawFrame();
        };

        // Initial placeholder draw (delayed so canvas has layout dimensions)
        setTimeout(() => drawFrame(), 100);
    },
});
