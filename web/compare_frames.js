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

        // 1. Create a dedicated HTML element for Nodes 2.0 compatibility
        let canvasElement = document.createElement("canvas");
        canvasElement.style.width = "100%";
        canvasElement.style.height = "100%";
        canvasElement.style.touchAction = "none"; 
        canvasElement.style.cursor = "crosshair";

        // 2. Add it to the node as a DOM Widget
        let previewWidget = node.addDOMWidget("framepreview", "preview", canvasElement, {
            serialize: false,
            hideOnZoom: false,
        });

        let images = [[], []];
        let sliderRatio = 0.5;
        let isDragging = false;
        let ctx = canvasElement.getContext("2d");

        // 3. The Drawing Loop
        function draw() {
            if (!ctx) return;
            
            const rect = canvasElement.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                requestAnimationFrame(draw); 
                return;
            }
            
            canvasElement.width = rect.width;
            canvasElement.height = rect.height;
            const w = canvasElement.width;
            const h = canvasElement.height;

            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, w, h);

            // Fetch new Offset Widgets
            let compFrame = 0, skipA = 0, skipB = 0;
            if (node.widgets) {
                const wComp = node.widgets.find(w => w.name === "compare_frame");
                const wSkipA = node.widgets.find(w => w.name === "skip_a");
                const wSkipB = node.widgets.find(w => w.name === "skip_b");
                if (wComp) compFrame = wComp.value || 0;
                if (wSkipA) skipA = wSkipA.value || 0;
                if (wSkipB) skipB = wSkipB.value || 0;
            }

            // Calculate target frames (prevent going below 0)
            const targetA = Math.max(0, compFrame + skipA);
            const targetB = Math.max(0, compFrame + skipB);

            // Fetch images based on calculated target frames
            const imgA = images[0].length > 0 ? images[0][Math.min(targetA, images[0].length - 1)] : null;
            const imgB = images[1].length > 0 ? images[1][Math.min(targetB, images[1].length - 1)] : null;

            function drawImageFitted(img, clipX, clipW) {
                if (!img || !img.complete || img.naturalWidth === 0) return;
                ctx.save();
                ctx.beginPath();
                ctx.rect(clipX, 0, clipW, h);
                ctx.clip();

                const imgRatio = img.naturalWidth / img.naturalHeight;
                const targetRatio = w / h;
                let dw, dh, dx, dy;

                if (imgRatio > targetRatio) {
                    dw = w;
                    dh = w / imgRatio;
                    dx = 0;
                    dy = (h - dh) / 2;
                } else {
                    dh = h;
                    dw = h * imgRatio;
                    dx = (w - dw) / 2;
                    dy = 0;
                }
                ctx.drawImage(img, dx, dy, dw, dh);
                ctx.restore();
            }

            const splitX = w * sliderRatio;

            if (imgA) drawImageFitted(imgA, 0, splitX);
            if (imgB) drawImageFitted(imgB, splitX, w - splitX);

            // Draw UI Overlay with detailed offset info
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(0, 0, w, 24);
            ctx.fillStyle = "#FFF";
            ctx.font = "12px sans-serif";
            ctx.textBaseline = "middle";
            
            ctx.textAlign = "left";
            ctx.fillText(`A: Frame ${targetA}`, 8, 12);
            
            ctx.fillStyle = "#00b894";
            ctx.textAlign = "center";
            ctx.fillText(`Base Frame: ${compFrame}`, w / 2, 12);
            
            ctx.fillStyle = "#FFF";
            ctx.textAlign = "right";
            ctx.fillText(`B: Frame ${targetB}`, w - 8, 12);

            // Draw Slider Line
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#00b894";
            ctx.beginPath();
            ctx.moveTo(splitX, 0);
            ctx.lineTo(splitX, h);
            ctx.stroke();

            // Draw Slider Handle
            const handleY = h / 2;
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(splitX, handleY, 12, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#222";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            ctx.fillStyle = "#222";
            ctx.font = "9px Arial";
            ctx.textAlign = "center";
            ctx.fillText("◀▶", splitX, handleY);
        }

        // --- Hook into ALL three widgets to force a redraw when numbers change ---
        const setupWidgetCallbacks = () => {
            if (node.widgets) {
                for (const w of node.widgets) {
                    if (w.name === "compare_frame" || w.name === "skip_a" || w.name === "skip_b") {
                        if (!w._draw_hooked) {
                            const originalCallback = w.callback;
                            w.callback = function () {
                                if (originalCallback) originalCallback.apply(this, arguments);
                                requestAnimationFrame(draw); 
                            };
                            w._draw_hooked = true;
                        }
                    }
                }
            }
        };

        setupWidgetCallbacks();
        setTimeout(setupWidgetCallbacks, 100);
        // -----------------------------------------------------------------------

        // 4. Standard HTML Event Listeners
        canvasElement.addEventListener("pointerdown", (e) => {
            const rect = canvasElement.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const splitX = rect.width * sliderRatio;
            
            if (Math.abs(x - splitX) < 20) {
                isDragging = true;
                canvasElement.setPointerCapture(e.pointerId); 
                e.preventDefault();
                e.stopPropagation(); 
            }
        });

        canvasElement.addEventListener("pointermove", (e) => {
            if (!isDragging) return;
            const rect = canvasElement.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            sliderRatio = Math.max(0, Math.min(1, x / rect.width));
            requestAnimationFrame(draw);
            
            e.preventDefault();
            e.stopPropagation();
        });

        const stopDrag = (e) => {
            if (isDragging) {
                isDragging = false;
                canvasElement.releasePointerCapture(e.pointerId);
                e.preventDefault();
                e.stopPropagation();
            }
        };
        
        canvasElement.addEventListener("pointerup", stopDrag);
        canvasElement.addEventListener("pointercancel", stopDrag);

        const originalOnResize = node.onResize;
        node.onResize = function() {
            if (originalOnResize) originalOnResize.apply(this, arguments);
            requestAnimationFrame(draw);
        };

        // 5. Load Data on Execution
        node.onExecuted = async function (message) {
            images = [[], []];
            const map = {1: "a", 2: "b"};

            let promises = [];
            for (let i = 1; i <= 2; i++) {
                const imgs = message[`${map[i]}_images`] || [];
                for (const imgData of imgs) {
                    promises.push(new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve();
                        img.onerror = () => resolve(); 
                        img.src = imageDataToUrl(imgData);
                        images[i - 1].push(img);
                    }));
                }
            }
            
            await Promise.all(promises);
            requestAnimationFrame(draw);
        };
    },
});