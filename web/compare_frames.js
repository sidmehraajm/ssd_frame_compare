import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

function imageDataToUrl(data) {
    return api.apiURL(
        `/view?filename=${encodeURIComponent(data.filename)}&type=${data.type}&subfolder=${data.subfolder}` + app.getPreviewFormatParam()
    );
}

app.registerExtension({
    name: "Matoo.CompareFrames",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "CompareFrames") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            this.data = {
                images: [[], []],
                sliderX: 0.5,
                isDraggingSlider: false,
                isDraggingImage: false,
                zoom: 1.0,
                panX: 0,
                panY: 0,
                lastMouseX: 0,
                lastMouseY: 0
            };

            this.size = [512, 640];
        };

        // Use ComfyUI's native local_pos for perfectly accurate mouse tracking
        nodeType.prototype.onMouseMove = function (e, local_pos) {
            if (!this.data) return false;
            
            const localX = local_pos[0];
            const localY = local_pos[1];
            const nodeWidth = this.size[0];
            const padding = 10;
            
            if (this.data.isDraggingSlider) {
                const x = (localX - padding) / (nodeWidth - 2 * padding);
                this.data.sliderX = Math.max(0, Math.min(1, x));
                this.setDirtyCanvas(true, true);
                return true;
            } else if (this.data.isDraggingImage) {
                const dx = localX - this.data.lastMouseX;
                const dy = localY - this.data.lastMouseY;
                this.data.panX += dx;
                this.data.panY += dy;
                this.data.lastMouseX = localX;
                this.data.lastMouseY = localY;
                this.setDirtyCanvas(true, true);
                return true;
            }
            return false;
        };

        nodeType.prototype.onMouseDown = function (e, local_pos) {
            if (!this.data) return false;
            
            const localX = local_pos[0];
            const localY = local_pos[1];
            const marginTop = 120; 
            const padding = 10;
            const previewWidth = this.size[0] - 2 * padding;
            
            if (localY > marginTop) { 
                const splitX = padding + this.data.sliderX * previewWidth;
                
                // 15px grab radius for the slider, otherwise it pans the image
                if (Math.abs(localX - splitX) < 15) {
                    this.data.isDraggingSlider = true;
                } else {
                    this.data.isDraggingImage = true;
                    this.data.lastMouseX = localX;
                    this.data.lastMouseY = localY;
                }
                return true; 
            }
            return false;
        };

        nodeType.prototype.onMouseUp = function (e, local_pos) {
            if (!this.data) return false;
            
            const wasDragging = this.data.isDraggingSlider || this.data.isDraggingImage;
            this.data.isDraggingSlider = false;
            this.data.isDraggingImage = false;
            
            if (wasDragging) {
                this.setDirtyCanvas(true, true);
                return true;
            }
            return false;
        };

        // Double click the image area to reset pan
        nodeType.prototype.onDblClick = function (e, local_pos) {
            if (!this.data) return false;
            if (local_pos[1] > 120) {
                this.data.zoom = 1.0;
                this.data.panX = 0;
                this.data.panY = 0;
                this.setDirtyCanvas(true, true);
                return true;
            }
            return false;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = async function (message) {
            if (onExecuted) onExecuted.apply(this, arguments);

            if (!this.data) {
                this.data = { images: [[], []], sliderX: 0.5, panX: 0, panY: 0, zoom: 1.0 };
            }
            
            this.data.images = [[], []];
            const map = {1: "a", 2: "b"};

            // PROPER ASYNC IMAGE LOADING: Prevents drawing blank frames
            let promises = [];
            for (let i = 1; i <= 2; i++) {
                const images = message[`${map[i]}_images`] || [];
                for (const imgData of images) {
                    promises.push(new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve();
                        img.onerror = () => resolve(); // Prevent infinite hang on error
                        img.src = imageDataToUrl(imgData);
                        this.data.images[i - 1].push(img);
                    }));
                }
            }
            
            await Promise.all(promises);
            this.setDirtyCanvas(true, true);
        };

        nodeType.prototype.onDrawForeground = function (ctx) {
            if (this.flags.collapsed) return;
            if (!this.data) return; // Failsafe
            
            const nodeWidth = this.size[0];
            const nodeHeight = this.size[1];
            const marginTop = 120; 
            const padding = 10;

            const previewWidth = nodeWidth - 2 * padding;
            const previewHeight = nodeHeight - marginTop - padding;

            if (previewWidth <= 0 || previewHeight <= 0) return;

            // Failsafe: Check if widgets exist before accessing them
            let idxA = 0, idxB = 0;
            if (this.widgets) {
                const frame_a_widget = this.widgets.find(w => w.name === "frame_a");
                const frame_b_widget = this.widgets.find(w => w.name === "frame_b");
                if (frame_a_widget) idxA = frame_a_widget.value || 0;
                if (frame_b_widget) idxB = frame_b_widget.value || 0;
            }

            const listA = this.data.images[0] || [];
            const listB = this.data.images[1] || [];

            const imgA = listA.length > 0 ? listA[Math.min(idxA, listA.length - 1)] : null;
            const imgB = listB.length > 0 ? listB[Math.min(idxB, listB.length - 1)] : null;

            const zoom = this.data.zoom || 1.0;
            const panX = this.data.panX || 0;
            const panY = this.data.panY || 0;
            const splitX = padding + this.data.sliderX * previewWidth;

            // 1. Draw solid background placeholder
            ctx.fillStyle = "#111";
            ctx.fillRect(padding, marginTop, previewWidth, previewHeight);

            function drawImageFitted(img, x, y, w, h, clipX, clipW, zoom, panX, panY) {
                if (!img || !img.complete || img.naturalWidth === 0) return;
                ctx.save();
                
                ctx.beginPath();
                ctx.rect(clipX, y, clipW, h);
                ctx.clip();

                const imgRatio = img.naturalWidth / img.naturalHeight;
                const targetRatio = w / h;
                let dw, dh, dx, dy;

                if (imgRatio > targetRatio) {
                    dw = w;
                    dh = w / imgRatio;
                    dx = x;
                    dy = y + (h - dh) / 2;
                } else {
                    dh = h;
                    dw = h * imgRatio;
                    dx = x + (w - dw) / 2;
                    dy = y;
                }

                const finalX = dx * zoom + panX;
                const finalY = dy * zoom + panY;
                const finalW = dw * zoom;
                const finalH = dh * zoom;

                ctx.drawImage(img, finalX, finalY, finalW, finalH);
                ctx.restore();
            }

            // 2. Draw active frames
            if (imgA) drawImageFitted(imgA, padding, marginTop, previewWidth, previewHeight, padding, splitX - padding, zoom, panX, panY);
            if (imgB) drawImageFitted(imgB, padding, marginTop, previewWidth, previewHeight, splitX, (padding + previewWidth) - splitX, zoom, panX, panY);

            // 3. UI Info Overlay
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(padding, marginTop, previewWidth, 24);
            
            ctx.fillStyle = "#FFF";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(`A: Frame ${idxA}`, padding + 8, marginTop + 12);
            
            ctx.textAlign = "right";
            ctx.fillText(`B: Frame ${idxB}`, padding + previewWidth - 8, marginTop + 12);

            if (panX !== 0 || panY !== 0) {
                ctx.textAlign = "center";
                ctx.fillStyle = "#00b894";
                ctx.fillText(`Pan Active (Dbl-click reset)`, padding + previewWidth / 2, marginTop + 12);
            }

            // 4. Draw Slider Line
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#00b894";
            ctx.beginPath();
            ctx.moveTo(splitX, marginTop);
            ctx.lineTo(splitX, marginTop + previewHeight);
            ctx.stroke();

            // 5. Draw Slider Handle
            const handleY = marginTop + previewHeight / 2;
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
            ctx.textBaseline = "middle";
            ctx.fillText("◀▶", splitX, handleY);
        };
    },
});