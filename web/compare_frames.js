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
            };

            this.size = [512, 640];
            
            this.onMouseMove = function (e) {
                if (!this.data.isDraggingSlider) return;
                const rect = this.getBounding();
                const nodeWidth = this.size[0];
                const padding = 10;
                const x = (e.canvasX - rect[0] - padding) / (nodeWidth - 2 * padding);
                this.data.sliderX = Math.max(0, Math.min(1, x));
                this.setDirtyCanvas(true, true);
            };

            this.onMouseDown = function (e) {
                const rect = this.getBounding();
                const clickX = e.canvasX - rect[0];
                const clickY = e.canvasY - rect[1];
                
                if (clickY > 120) { 
                    this.data.isDraggingSlider = true;
                    this.onMouseMove(e);
                    return true;
                }
            };

            this.onMouseUp = function (e) {
                this.data.isDraggingSlider = false;
            };
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = async function (message) {
            if (onExecuted) onExecuted.apply(this, arguments);

            this.data.images = [[], []];
            const map = {1: "a", 2: "b"};

            for (let i = 1; i <= 2; i++) {
                const images = message[`${map[i]}_images`] || [];
                for (const imgData of images) {
                    const img = new Image();
                    img.src = imageDataToUrl(imgData);
                    this.data.images[i - 1].push(img);
                }
            }
            this.setDirtyCanvas(true, true);
        };

        nodeType.prototype.onDrawForeground = function (ctx) {
            if (this.flags.collapsed) return;
            
            const nodeWidth = this.size[0];
            const nodeHeight = this.size[1];
            const marginTop = 120; 
            const padding = 10;

            const previewWidth = nodeWidth - 2 * padding;
            const previewHeight = nodeHeight - marginTop - padding;

            if (previewWidth <= 0 || previewHeight <= 0) return;

            const frame_a_widget = this.widgets.find(w => w.name === "frame_a");
            const frame_b_widget = this.widgets.find(w => w.name === "frame_b");

            const idxA = frame_a_widget ? frame_a_widget.value : 0;
            const idxB = frame_b_widget ? frame_b_widget.value : 0;

            const listA = this.data.images[0];
            const listB = this.data.images[1];

            const imgA = listA && listA.length > 0 ? listA[Math.min(idxA, listA.length - 1)] : null;
            const imgB = listB && listB.length > 0 ? listB[Math.min(idxB, listB.length - 1)] : null;

            function drawImageFitted(img, x, y, w, h, clipX, clipW) {
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

                ctx.drawImage(img, dx, dy, dw, dh);
                ctx.restore();
            }

            const splitX = padding + this.data.sliderX * previewWidth;

            if (imgA) {
                drawImageFitted(imgA, padding, marginTop, previewWidth, previewHeight, padding, splitX - padding);
            }

            if (imgB) {
                drawImageFitted(imgB, padding, marginTop, previewWidth, previewHeight, splitX, (padding + previewWidth) - splitX);
            }

            // Draw Slider Line
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#00b894";
            ctx.beginPath();
            ctx.moveTo(splitX, marginTop);
            ctx.lineTo(splitX, marginTop + previewHeight);
            ctx.stroke();

            // Draw Slider Handle
            ctx.fillStyle = "#00b894";
            ctx.beginPath();
            ctx.arc(splitX, marginTop + previewHeight / 2, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#FFF";
            ctx.lineWidth = 1;
            ctx.stroke();
        };
    },
});
