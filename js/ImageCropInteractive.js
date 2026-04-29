// YC Interactive Image Crop - 交互式图像裁剪节点
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const DEFAULT_LAYOUT = {
    shiftLeft: 10,
    shiftRight: 80,
    panelHeight: 100
};

const ASPECT_RATIOS = {
    "free": { label: "Free", ratio: null },
    "1:1": { label: "1:1", ratio: 1 },
    "3:2": { label: "3:2", ratio: 3/2 },
    "2:3": { label: "2:3", ratio: 2/3 },
    "4:3": { label: "4:3", ratio: 4/3 },
    "3:4": { label: "3:4", ratio: 3/4 },
    "16:9": { label: "16:9", ratio: 16/9 },
    "9:16": { label: "9:16", ratio: 9/16 },
    "custom": { label: "Custom", ratio: null }
};

const HEARTBEAT_INTERVAL = 10000; // 10 秒发一次心跳

class ycImageCropInteractive {
    constructor(node) {
        this.node = node;

        // 不可序列化的运行时状态，放在实例上而非 node.properties
        this._sourceImageObj = null;
        this._imageBase64Data = "";
        this._buttons = [];
        this._isDragging = false;
        this._dragHandle = null;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._dragStartCropX = 0;
        this._dragStartCropY = 0;
        this._dragStartCropWidth = 0;
        this._dragStartCropHeight = 0;
        this._heartbeatTimer = null;
        this._globalMouseUpHandler = null;
        this._lastReuseInfo = "";

        this.state = this.createInitialState(node);
        this.initUI(node);
    }

    createInitialState(node) {
        if (!node.properties) {
            node.properties = {};
        }

        const defaults = {
            sourceWidth: 512,
            sourceHeight: 512,
            cropX: 0,
            cropY: 0,
            cropWidth: 512,
            cropHeight: 512,
            aspectRatio: "free",
            customRatioWidth: 1,
            customRatioHeight: 1,
            fillColor: "#000000",
            isWaitingConfirm: false,
            nodeId: null
        };

        for (const [key, val] of Object.entries(defaults)) {
            if (!(key in node.properties)) {
                node.properties[key] = val;
            }
        }

        // 延迟设置最小尺寸，确保在 ComfyUI 自动计算 widget 布局之后生效
        const MIN_WIDTH = 500;
        const MIN_HEIGHT = 400;
        setTimeout(() => {
            if (node.size[0] < MIN_WIDTH || node.size[1] < MIN_HEIGHT) {
                node.size = [Math.max(node.size[0], MIN_WIDTH), Math.max(node.size[1], MIN_HEIGHT)];
                if (app.graph) app.graph.setDirtyCanvas(true, true);
            }
        }, 50);

        return {
            layout: { ...DEFAULT_LAYOUT },
            fontSize: LiteGraph?.NODE_SUBTEXT_SIZE ?? 10
        };
    }

    // ── 坐标计算公共方法 ──────────────────────────────────────────

    _getDisplayBounds(node) {
        const p = node.properties;
        const displayMinX = Math.min(0, p.cropX);
        const displayMinY = Math.min(0, p.cropY);
        const displayMaxX = Math.max(p.sourceWidth, p.cropX + p.cropWidth);
        const displayMaxY = Math.max(p.sourceHeight, p.cropY + p.cropHeight);
        return { displayMinX, displayMinY, displayMaxX, displayMaxY,
                 displayWidth: displayMaxX - displayMinX,
                 displayHeight: displayMaxY - displayMinY };
    }

    _getCanvasMetrics(node) {
        const { shiftLeft, shiftRight, panelHeight } = this.state.layout;
        const bounds = this._getDisplayBounds(node);

        const canvasAreaWidth = node.size[0] - shiftRight - shiftLeft;
        const canvasAreaHeight = node.size[1] - shiftLeft - shiftLeft - panelHeight;
        const scale = Math.min(
            canvasAreaWidth / bounds.displayWidth,
            canvasAreaHeight / bounds.displayHeight
        );
        const scaledDisplayWidth = bounds.displayWidth * scale;
        const scaledDisplayHeight = bounds.displayHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledDisplayWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledDisplayHeight) / 2;

        return { ...bounds, scale, scaledDisplayWidth, scaledDisplayHeight, offsetX, offsetY };
    }

    _localPosToImgCoords(node, localX, localY) {
        const m = this._getCanvasMetrics(node);
        const imgX = (localX - m.offsetX) / m.scale + m.displayMinX;
        const imgY = (localY - m.offsetY) / m.scale + m.displayMinY;
        return { imgX, imgY, metrics: m };
    }

    _isInsideDisplayArea(node, localX, localY) {
        const m = this._getCanvasMetrics(node);
        return localX >= m.offsetX && localX <= m.offsetX + m.scaledDisplayWidth &&
               localY >= m.offsetY && localY <= m.offsetY + m.scaledDisplayHeight;
    }

    // ── 心跳 ─────────────────────────────────────────────────────

    _startHeartbeat(node) {
        this._stopHeartbeat();
        this._heartbeatTimer = setInterval(async () => {
            if (!node.properties.nodeId || !node.properties.isWaitingConfirm) {
                this._stopHeartbeat();
                return;
            }
            try {
                await fetch("/yc_image_crop_interactive/heartbeat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ node_id: node.properties.nodeId })
                });
            } catch (e) {
                console.warn("[YC交互式裁剪] 心跳发送失败:", e);
            }
        }, HEARTBEAT_INTERVAL);
    }

    _stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    // ── 后端图像加载 ─────────────────────────────────────────────

    loadImageFromBackend(node, data) {
        console.log("[YC交互式裁剪] 加载图像数据，节点ID:", data.node_id);
        
        this._lastReuseInfo = "";
        node.properties.isWaitingConfirm = false;
        
        const img = new Image();
        img.onload = () => {
            node.properties.sourceWidth = data.width;
            node.properties.sourceHeight = data.height;
            this._sourceImageObj = img;
            this._imageBase64Data = data.image_data;
            node.properties.nodeId = data.node_id;

            // 如果后端传来了 init_crop（上次保存的参数），使用它作为初始裁剪框
            if (data.init_crop) {
                node.properties.cropX = data.init_crop.crop_x;
                node.properties.cropY = data.init_crop.crop_y;
                node.properties.cropWidth = data.init_crop.crop_width;
                node.properties.cropHeight = data.init_crop.crop_height;
                if (data.init_crop.fill_color) {
                    node.properties.fillColor = data.init_crop.fill_color;
                }
            } else {
                node.properties.cropX = 0;
                node.properties.cropY = 0;
                node.properties.cropWidth = data.width;
                node.properties.cropHeight = data.height;
            }
            node.properties.aspectRatio = "free";
            
            node.properties.isWaitingConfirm = true;

            this._startHeartbeat(node);

            this.updateNodeSize(node);

            if (app.graph) {
                app.graph.setDirtyCanvas(true, true);
            }
            
            console.log("[YC交互式裁剪] 图像加载完成，等待用户确认");
        };
        img.onerror = (e) => {
            console.error("[YC交互式裁剪] 图像加载失败", e);
        };
        img.src = data.image_data;
    }

    // 复用模式时后端通知前端更新裁剪框显示
    handleReuseNotify(node, data) {
        node.properties.cropX = data.crop_x;
        node.properties.cropY = data.crop_y;
        node.properties.cropWidth = data.crop_width;
        node.properties.cropHeight = data.crop_height;
        node.properties.isWaitingConfirm = false;
        this._lastReuseInfo = `Reused: ${data.crop_width}×${data.crop_height}`;
        if (app.graph) {
            app.graph.setDirtyCanvas(true, true);
        }
    }

    // ── UI 初始化 ────────────────────────────────────────────────

    initUI(node) {
        this.initButtons(node);
        this.initInteractions(node);
        this.setupDrawing(node);
        
        node.onAdded = () => {
            this.initButtons(node);
        };
    }

    initButtons(node) {
        const buttonY = 15;
        const buttonHeight = 21;
        let buttonX = 60;

        // 第一行按钮：Reset, Color, Re-edit
        this._buttons = [
            {
                text: "Reset",
                x: buttonX,
                y: buttonY,
                width: 50,
                height: buttonHeight,
                action: () => this.resetCrop(node)
            },
            {
                text: "Color",
                x: (buttonX += 55),
                y: buttonY,
                width: 50,
                height: buttonHeight,
                action: () => this.pickFillColor(node),
                isColorButton: true
            },
            {
                text: "↻ Re-edit",
                x: (buttonX += 55),
                y: buttonY,
                width: 75,
                height: buttonHeight,
                isReedit: true,
                action: () => this.forceReedit(node)
            }
        ];

        const confirmY = buttonY + buttonHeight + 5;
        // 第二行按钮：Confirm, Cancel, Ratio dropdown
        this._buttons.push(
            {
                text: "✓ Confirm",
                x: 60,
                y: confirmY,
                width: 75,
                height: 28,
                isConfirm: true,
                action: () => this.confirmCrop(node)
            },
            {
                text: "✗ Cancel",
                x: 140,
                y: confirmY,
                width: 75,
                height: 28,
                isCancel: true,
                action: () => this.cancelCrop(node)
            }
        );

        // 添加Ratio按钮（点击打开弹窗）
        const ratioButtonWidth = 65;
        const ratioButtonHeight = 28;
        this._buttons.push({
            text: "Ratio",
            x: 220,
            y: confirmY,
            width: ratioButtonWidth,
            height: ratioButtonHeight,
            isRatioButton: true,
            action: () => this.openRatioPopup(node)
        });
    }

    initInteractions(node) {
        node.onMouseDown = (e, localPos, graphCanvas) => {
            for (const button of this._buttons) {
                if (this.isPointInRect(localPos[0], localPos[1], button.x, button.y, button.width, button.height)) {
                    button.action();
                    return true;
                }
            }

            const { imgX, imgY, metrics } = this._localPosToImgCoords(node, localPos[0], localPos[1]);

            const handle = this.getHandleAtPoint(node, imgX, imgY, metrics.scale);
            if (handle) {
                this._isDragging = true;
                this._dragHandle = handle;
                this._dragStartX = imgX;
                this._dragStartY = imgY;
                this._dragStartCropX = node.properties.cropX;
                this._dragStartCropY = node.properties.cropY;
                this._dragStartCropWidth = node.properties.cropWidth;
                this._dragStartCropHeight = node.properties.cropHeight;
                return true;
            }

            return false;
        };

        node.onMouseMove = (e, localPos, graphCanvas) => {
            if (!this._isDragging) {
                const { imgX, imgY, metrics } = this._localPosToImgCoords(node, localPos[0], localPos[1]);
                const handle = this.getHandleAtPoint(node, imgX, imgY, metrics.scale);
                graphCanvas.canvas.style.cursor = handle ? this.getCursorForHandle(handle) : "default";
                return false;
            }

            const { imgX, imgY } = this._localPosToImgCoords(node, localPos[0], localPos[1]);
            this.updateCropByDrag(node, imgX, imgY);
            
            if (graphCanvas.dirty_canvas !== true) {
                graphCanvas.setDirty(true, true);
            }
            return true;
        };

        node.onMouseUp = (e, localPos, graphCanvas) => {
            if (this._isDragging) {
                this._isDragging = false;
                this._dragHandle = null;
                node.properties.cropX = Math.round(node.properties.cropX);
                node.properties.cropY = Math.round(node.properties.cropY);
                node.properties.cropWidth = Math.round(node.properties.cropWidth);
                node.properties.cropHeight = Math.round(node.properties.cropHeight);
                graphCanvas.canvas.style.cursor = "default";
                return true;
            }
            return false;
        };

        node.onDblClick = (e, localPos, graphCanvas) => {
            if (this._isDragging) {
                this._isDragging = false;
                this._dragHandle = null;
                node.properties.cropX = Math.round(node.properties.cropX);
                node.properties.cropY = Math.round(node.properties.cropY);
                node.properties.cropWidth = Math.round(node.properties.cropWidth);
                node.properties.cropHeight = Math.round(node.properties.cropHeight);
                graphCanvas.canvas.style.cursor = "default";
                return true;
            }
            return false;
        };

        // 全局 mouseup 防止拖拽泄露
        this._setupGlobalMouseUp(node);
        
        // 拖拽图片到节点
        node.onDragOver = (e) => {
            const mouseX = e.canvasX - node.pos[0];
            const mouseY = e.canvasY - node.pos[1];

            if (!this._isInsideDisplayArea(node, mouseX, mouseY)) return false;

            if (e.dataTransfer && e.dataTransfer.types) {
                const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
                if (hasFiles) {
                    e.preventDefault();
                    e.stopPropagation();
                    return true;
                }
            }
            return false;
        };

        node.onDragDrop = (e) => {
            const mouseX = e.canvasX - node.pos[0];
            const mouseY = e.canvasY - node.pos[1];

            if (!this._isInsideDisplayArea(node, mouseX, mouseY)) return false;

            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];

                if (!file.type.startsWith('image/')) {
                    console.warn('Only image files are supported');
                    return false;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const dataURL = event.target.result;
                        const img = new Image();
                        img.onload = () => {
                            node.properties.sourceWidth = img.width;
                            node.properties.sourceHeight = img.height;
                            this._sourceImageObj = img;
                            this._imageBase64Data = dataURL;

                            node.properties.cropX = 0;
                            node.properties.cropY = 0;
                            node.properties.cropWidth = img.width;
                            node.properties.cropHeight = img.height;
                            node.properties.aspectRatio = "free";

                            this.updateNodeSize(node);

                            if (app.graph) {
                                app.graph.setDirtyCanvas(true, true);
                            }
                        };
                        img.src = dataURL;
                    } catch (err) {
                        console.error("Error processing dropped image:", err);
                    }
                };
                reader.onerror = (err) => {
                    console.error("Error reading dropped file:", err);
                };
                reader.readAsDataURL(file);

                e.preventDefault();
                e.stopPropagation();
                return true;
            }

            return false;
        };
    }

    _setupGlobalMouseUp(node) {
        this._cleanupGlobalMouseUp();

        const canvas = app.canvas;
        if (!canvas) return;

        this._globalMouseUpHandler = () => {
            if (this._isDragging) {
                this._isDragging = false;
                this._dragHandle = null;
                node.properties.cropX = Math.round(node.properties.cropX);
                node.properties.cropY = Math.round(node.properties.cropY);
                node.properties.cropWidth = Math.round(node.properties.cropWidth);
                node.properties.cropHeight = Math.round(node.properties.cropHeight);
                if (canvas.canvas) {
                    canvas.canvas.style.cursor = "default";
                }
                if (app.graph) {
                    app.graph.setDirtyCanvas(true, true);
                }
            }
        };
        document.addEventListener('mouseup', this._globalMouseUpHandler);
    }

    _cleanupGlobalMouseUp() {
        if (this._globalMouseUpHandler) {
            document.removeEventListener('mouseup', this._globalMouseUpHandler);
            this._globalMouseUpHandler = null;
        }
    }

    // ── 绘制 ─────────────────────────────────────────────────────

    setupDrawing(node) {
        const fontsize = this.state.fontSize;
        const { shiftLeft, shiftRight, panelHeight } = this.state.layout;

        node.onDrawForeground = (ctx) => {
            if (node.flags.collapsed) {
                return false;
            }

            // 控制面板背景
            ctx.fillStyle = "rgba(40,40,40,0.9)";
            ctx.beginPath();
            ctx.roundRect(shiftLeft - 4, shiftLeft - 4, node.size[0] - shiftRight - shiftLeft + 8, panelHeight, 4);
            ctx.fill();

            ctx.strokeStyle = "rgba(100,100,100,0.5)";
            ctx.lineWidth = 1;
            ctx.strokeRect(shiftLeft - 4, shiftLeft - 4, node.size[0] - shiftRight - shiftLeft + 8, panelHeight);

            const m = this._getCanvasMetrics(node);

            const sourceX = m.offsetX + (0 - m.displayMinX) * m.scale;
            const sourceY = m.offsetY + (0 - m.displayMinY) * m.scale;
            const scaledSourceWidth = node.properties.sourceWidth * m.scale;
            const scaledSourceHeight = node.properties.sourceHeight * m.scale;

            // 扩展区域背景
            ctx.fillStyle = "rgba(60,60,60,0.8)";
            ctx.beginPath();
            ctx.roundRect(m.offsetX - 4, m.offsetY - 4, m.scaledDisplayWidth + 8, m.scaledDisplayHeight + 8, 4);
            ctx.fill();

            // 网格
            ctx.strokeStyle = "rgba(80,80,80,0.3)";
            ctx.lineWidth = 1;
            const gridSize = 32 * m.scale;
            for (let x = m.offsetX; x <= m.offsetX + m.scaledDisplayWidth; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, m.offsetY);
                ctx.lineTo(x, m.offsetY + m.scaledDisplayHeight);
                ctx.stroke();
            }
            for (let y = m.offsetY; y <= m.offsetY + m.scaledDisplayHeight; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(m.offsetX, y);
                ctx.lineTo(m.offsetX + m.scaledDisplayWidth, y);
                ctx.stroke();
            }

            // 原图区域
            ctx.fillStyle = "rgba(20,20,20,0.9)";
            ctx.fillRect(sourceX, sourceY, scaledSourceWidth, scaledSourceHeight);

            if (this._sourceImageObj && this._sourceImageObj.complete) {
                try {
                    ctx.drawImage(this._sourceImageObj, sourceX, sourceY, scaledSourceWidth, scaledSourceHeight);
                } catch (e) {
                    console.error("Error drawing source image:", e);
                    this.drawPlaceholder(ctx, sourceX, sourceY, scaledSourceWidth, scaledSourceHeight, m.scale);
                }
            } else {
                this.drawPlaceholder(ctx, sourceX, sourceY, scaledSourceWidth, scaledSourceHeight, m.scale);
            }

            // 原图边界
            ctx.strokeStyle = "rgba(100,150,255,0.6)";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(sourceX, sourceY, scaledSourceWidth, scaledSourceHeight);
            ctx.setLineDash([]);

            this.drawCropBox(ctx, node, m.offsetX, m.offsetY, m.scale, m.displayMinX, m.displayMinY);

            this.drawButtons(ctx, node);

            // 信息文本
            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
            ctx.font = `${fontsize}px Arial`;
            ctx.textAlign = "center";
            const extendInfo = (m.displayMinX < 0 || m.displayMinY < 0 || m.displayMaxX > node.properties.sourceWidth || m.displayMaxY > node.properties.sourceHeight) 
                ? " (Extended)" : "";
            let statusLine = `Source: ${node.properties.sourceWidth}×${node.properties.sourceHeight} | Crop: ${Math.round(node.properties.cropWidth)}×${Math.round(node.properties.cropHeight)}${extendInfo}`;
            ctx.fillText(statusLine, node.size[0] / 2, m.offsetY + m.scaledDisplayHeight + 15);

            // 显示复用/Re-edit 状态提示
            if (this._lastReuseInfo) {
                ctx.fillStyle = "rgba(100,200,100,0.9)";
                ctx.font = `${fontsize}px Arial`;
                ctx.fillText(this._lastReuseInfo, node.size[0] / 2, m.offsetY + m.scaledDisplayHeight + 28);
            }
        };
    }

    drawPlaceholder(ctx, x, y, width, height, scale) {
        ctx.fillStyle = "rgba(100,100,100,0.3)";
        ctx.fillRect(x, y, width, height);
        
        ctx.strokeStyle = "rgba(150,150,150,0.2)";
        ctx.lineWidth = 1;
        const gridSize = 32 * scale;
        
        for (let gx = x; gx <= x + width; gx += gridSize) {
            ctx.beginPath();
            ctx.moveTo(gx, y);
            ctx.lineTo(gx, y + height);
            ctx.stroke();
        }
        
        for (let gy = y; gy <= y + height; gy += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, gy);
            ctx.lineTo(x + width, gy);
            ctx.stroke();
        }
    }

    drawCropBox(ctx, node, offsetX, offsetY, scale, displayMinX, displayMinY) {
        const x1 = offsetX + (node.properties.cropX - displayMinX) * scale;
        const y1 = offsetY + (node.properties.cropY - displayMinY) * scale;
        const x2 = x1 + node.properties.cropWidth * scale;
        const y2 = y1 + node.properties.cropHeight * scale;

        const imgX1 = offsetX + (0 - displayMinX) * scale;
        const imgY1 = offsetY + (0 - displayMinY) * scale;
        const imgX2 = imgX1 + node.properties.sourceWidth * scale;
        const imgY2 = imgY1 + node.properties.sourceHeight * scale;

        // 半透明遮罩
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        if (y1 > imgY1) ctx.fillRect(imgX1, imgY1, imgX2 - imgX1, y1 - imgY1);
        if (y2 < imgY2) ctx.fillRect(imgX1, y2, imgX2 - imgX1, imgY2 - y2);
        if (x1 > imgX1) ctx.fillRect(imgX1, Math.max(y1, imgY1), x1 - imgX1, Math.min(y2, imgY2) - Math.max(y1, imgY1));
        if (x2 < imgX2) ctx.fillRect(x2, Math.max(y1, imgY1), imgX2 - x2, Math.min(y2, imgY2) - Math.max(y1, imgY1));

        // 裁切框
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // 九宫格
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        const w = (x2 - x1) / 3;
        const h = (y2 - y1) / 3;
        for (let i = 1; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(x1 + w * i, y1);
            ctx.lineTo(x1 + w * i, y2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x1, y1 + h * i);
            ctx.lineTo(x2, y1 + h * i);
            ctx.stroke();
        }

        // 控制点
        const handleSize = 10;
        const handles = [
            { x: x1, y: y1 }, { x: x2, y: y1 },
            { x: x1, y: y2 }, { x: x2, y: y2 },
            { x: (x1 + x2) / 2, y: y1 }, { x: (x1 + x2) / 2, y: y2 },
            { x: x1, y: (y1 + y2) / 2 }, { x: x2, y: (y1 + y2) / 2 }
        ];

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = 1;
        for (const handle of handles) {
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        }
    }

    drawButtons(ctx, node) {
        for (const button of this._buttons) {
            if (button.isRatioButton) {
                // 绘制Ratio按钮
                ctx.fillStyle = "rgba(60,60,60,0.7)";
                ctx.fillRect(button.x, button.y, button.width, button.height);

                ctx.strokeStyle = "rgba(150,150,150,0.6)";
                ctx.lineWidth = 1;
                ctx.strokeRect(button.x, button.y, button.width, button.height);

                // 显示当前选中的比例
                ctx.fillStyle = "rgba(220,220,220,0.9)";
                ctx.font = "11px Arial";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                
                let currentRatio = node.properties.aspectRatio;
                let displayText = ASPECT_RATIOS[currentRatio]?.label || "Free";
                if (currentRatio === "custom") {
                    const w = node.properties.customRatioWidth || 1;
                    const h = node.properties.customRatioHeight || 1;
                    displayText = `${w}:${h}`;
                }
                
                ctx.fillText(displayText, button.x + 8, button.y + button.height / 2);

                // 绘制下拉箭头
                ctx.beginPath();
                ctx.moveTo(button.x + button.width - 12, button.y + button.height / 2 - 3);
                ctx.lineTo(button.x + button.width - 6, button.y + button.height / 2 - 3);
                ctx.lineTo(button.x + button.width - 9, button.y + button.height / 2 + 3);
                ctx.fill();
            } else if (button.isColorButton) {
                const color = this.hexToRgb(node.properties.fillColor || "#000000");
                ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
                ctx.fillRect(button.x, button.y, button.width, button.height);

                ctx.strokeStyle = "rgba(150,150,150,0.6)";
                ctx.lineWidth = 1;
                ctx.strokeRect(button.x, button.y, button.width, button.height);

                const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
                ctx.fillStyle = brightness > 128 ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)";
                ctx.font = "11px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(button.text, button.x + button.width / 2, button.y + button.height / 2);
            } else {
                ctx.fillStyle = "rgba(60,60,60,0.7)";
                ctx.fillRect(button.x, button.y, button.width, button.height);

                ctx.strokeStyle = "rgba(150,150,150,0.6)";
                ctx.lineWidth = 1;
                ctx.strokeRect(button.x, button.y, button.width, button.height);

                ctx.fillStyle = "rgba(220,220,220,0.9)";
                ctx.font = "11px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(button.text, button.x + button.width / 2, button.y + button.height / 2);
            }
        }
    }

    // ── 拖拽逻辑 ─────────────────────────────────────────────────

    getHandleAtPoint(node, imgX, imgY, scale) {
        const handleSize = 10 / scale;
        const x1 = node.properties.cropX;
        const y1 = node.properties.cropY;
        const x2 = x1 + node.properties.cropWidth;
        const y2 = y1 + node.properties.cropHeight;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;

        if (Math.abs(imgX - x1) < handleSize && Math.abs(imgY - y1) < handleSize) return 'nw';
        if (Math.abs(imgX - x2) < handleSize && Math.abs(imgY - y1) < handleSize) return 'ne';
        if (Math.abs(imgX - x1) < handleSize && Math.abs(imgY - y2) < handleSize) return 'sw';
        if (Math.abs(imgX - x2) < handleSize && Math.abs(imgY - y2) < handleSize) return 'se';

        if (Math.abs(imgX - cx) < handleSize && Math.abs(imgY - y1) < handleSize) return 'n';
        if (Math.abs(imgX - cx) < handleSize && Math.abs(imgY - y2) < handleSize) return 's';
        if (Math.abs(imgX - x1) < handleSize && Math.abs(imgY - cy) < handleSize) return 'w';
        if (Math.abs(imgX - x2) < handleSize && Math.abs(imgY - cy) < handleSize) return 'e';

        if (imgX >= x1 && imgX <= x2 && imgY >= y1 && imgY <= y2) return 'move';

        return null;
    }

    getCursorForHandle(handle) {
        const cursors = {
            'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
            'n': 'n-resize', 's': 's-resize', 'w': 'w-resize', 'e': 'e-resize',
            'move': 'move'
        };
        return cursors[handle] || 'default';
    }

    updateCropByDrag(node, imgX, imgY) {
        const dx = imgX - this._dragStartX;
        const dy = imgY - this._dragStartY;
        const handle = this._dragHandle;

        let newX = this._dragStartCropX;
        let newY = this._dragStartCropY;
        let newW = this._dragStartCropWidth;
        let newH = this._dragStartCropHeight;

        let ratio = ASPECT_RATIOS[node.properties.aspectRatio]?.ratio;
        if (node.properties.aspectRatio === "custom" && node.properties.customRatioWidth && node.properties.customRatioHeight) {
            ratio = node.properties.customRatioWidth / node.properties.customRatioHeight;
        }

        if (handle === 'move') {
            newX = this._dragStartCropX + dx;
            newY = this._dragStartCropY + dy;
        } else if (handle === 'nw') {
            newX = this._dragStartCropX + dx;
            newY = this._dragStartCropY + dy;
            newW = this._dragStartCropWidth - dx;
            newH = this._dragStartCropHeight - dy;
        } else if (handle === 'ne') {
            newY = this._dragStartCropY + dy;
            newW = this._dragStartCropWidth + dx;
            newH = this._dragStartCropHeight - dy;
        } else if (handle === 'sw') {
            newX = this._dragStartCropX + dx;
            newW = this._dragStartCropWidth - dx;
            newH = this._dragStartCropHeight + dy;
        } else if (handle === 'se') {
            newW = this._dragStartCropWidth + dx;
            newH = this._dragStartCropHeight + dy;
        } else if (handle === 'n') {
            newY = this._dragStartCropY + dy;
            newH = this._dragStartCropHeight - dy;
        } else if (handle === 's') {
            newH = this._dragStartCropHeight + dy;
        } else if (handle === 'w') {
            newX = this._dragStartCropX + dx;
            newW = this._dragStartCropWidth - dx;
        } else if (handle === 'e') {
            newW = this._dragStartCropWidth + dx;
        }

        if (ratio && handle !== 'move') {
            if (handle === 'n' || handle === 's') {
                newW = Math.round(newH * ratio);
                if (handle === 'n') {
                    newX = this._dragStartCropX + (this._dragStartCropWidth - newW) / 2;
                }
            } else if (handle === 'w' || handle === 'e') {
                newH = Math.round(newW / ratio);
                if (handle === 'w') {
                    newY = this._dragStartCropY + (this._dragStartCropHeight - newH) / 2;
                }
            } else {
                newH = Math.round(newW / ratio);
            }
        }

        if (newW < 10) newW = 10;
        if (newH < 10) newH = 10;

        node.properties.cropX = newX;
        node.properties.cropY = newY;
        node.properties.cropWidth = newW;
        node.properties.cropHeight = newH;
    }

    // ── 操作方法 ─────────────────────────────────────────────────

    loadImageFromFile(node) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    node.properties.sourceWidth = img.width;
                    node.properties.sourceHeight = img.height;
                    this._sourceImageObj = img;
                    this._imageBase64Data = event.target.result;

                    node.properties.cropX = 0;
                    node.properties.cropY = 0;
                    node.properties.cropWidth = img.width;
                    node.properties.cropHeight = img.height;
                    node.properties.aspectRatio = "free";

                    this.updateNodeSize(node);

                    if (app.graph) {
                        app.graph.setDirtyCanvas(true, true);
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    resetCrop(node) {
        node.properties.cropX = 0;
        node.properties.cropY = 0;
        node.properties.cropWidth = node.properties.sourceWidth;
        node.properties.cropHeight = node.properties.sourceHeight;
        node.properties.aspectRatio = "free";
        if (app.graph) {
            app.graph.setDirtyCanvas(true, true);
        }
    }

    setAspectRatio(node, ratioKey) {
        node.properties.aspectRatio = ratioKey;
        const ratio = ASPECT_RATIOS[ratioKey]?.ratio;
        
        if (ratio) {
            const centerX = node.properties.cropX + node.properties.cropWidth / 2;
            const centerY = node.properties.cropY + node.properties.cropHeight / 2;
            
            const newHeight = Math.round(node.properties.cropWidth / ratio);
            node.properties.cropHeight = newHeight;
            node.properties.cropY = Math.round(centerY - newHeight / 2);
        }
        
        if (app.graph) {
            app.graph.setDirtyCanvas(true, true);
        }
    }

    openRatioPopup(node) {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2a2a2a;
            border: 1px solid #555;
            border-radius: 6px;
            padding: 12px 14px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            z-index: 10000;
            width: 200px;
        `;

        dialog.innerHTML = `
            <div style="color: #ddd; font-size: 13px; margin-bottom: 10px; font-weight: bold;">
                Aspect Ratio
            </div>
            <div style="max-height: 300px; overflow-y: auto; margin-bottom: 10px;">
                ${Object.entries(ASPECT_RATIOS).map(([key, value]) => `
                    <div style="padding: 8px 10px; margin-bottom: 4px; border-radius: 3px; cursor: pointer; ${node.properties.aspectRatio === key ? 'background: rgba(100,150,255,0.3);' : 'background: #333; hover: background: #444;'} transition: background 0.2s;">
                        ${value.label}
                    </div>
                `).join('')}
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="ratioPopupCancel" 
                    style="padding: 5px 12px; background: #444; border: none; border-radius: 3px; 
                    color: #ddd; cursor: pointer; font-size: 12px;">
                    Cancel
                </button>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            z-index: 9999;
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(dialog);

        const ratioOptions = dialog.querySelectorAll('div[style*="padding: 8px 10px"]');
        const cancelBtn = dialog.querySelector('#ratioPopupCancel');

        const closeDialog = () => {
            document.body.removeChild(dialog);
            document.body.removeChild(overlay);
        };

        const selectRatio = (ratioKey) => {
            if (ratioKey === "custom") {
                this.setCustomRatio(node);
            } else {
                this.setAspectRatio(node, ratioKey);
            }
            closeDialog();
        };

        ratioOptions.forEach((option, index) => {
            option.addEventListener('click', () => {
                const ratioKey = Object.keys(ASPECT_RATIOS)[index];
                selectRatio(ratioKey);
            });
        });

        cancelBtn.onclick = closeDialog;
        overlay.onclick = closeDialog;
    }

    selectRatioOption(node, ratioKey) {
        if (ratioKey === "custom") {
            this.setCustomRatio(node);
        } else {
            this.setAspectRatio(node, ratioKey);
        }
        if (app.graph) {
            app.graph.setDirtyCanvas(true, true);
        }
    }

    setCustomRatio(node) {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2a2a2a;
            border: 1px solid #555;
            border-radius: 6px;
            padding: 12px 14px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            z-index: 10000;
            width: auto;
        `;

        const currentW = node.properties.customRatioWidth || 1;
        const currentH = node.properties.customRatioHeight || 1;

        dialog.innerHTML = `
            <div style="color: #ddd; font-size: 13px; margin-bottom: 10px; font-weight: bold;">
                Custom Aspect Ratio
            </div>
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
                <div>
                    <label style="color: #aaa; font-size: 10px; display: block; margin-bottom: 3px;">Width</label>
                    <input type="number" id="customRatioWidth" value="${currentW}" min="0.1" step="0.1"
                        style="width: 100px; padding: 5px; background: #1a1a1a; border: 1px solid #555; 
                        border-radius: 3px; color: #ddd; font-size: 13px; box-sizing: border-box;">
                </div>
                <div style="color: #888; font-size: 16px; margin-top: 14px;">:</div>
                <div>
                    <label style="color: #aaa; font-size: 10px; display: block; margin-bottom: 3px;">Height</label>
                    <input type="number" id="customRatioHeight" value="${currentH}" min="0.1" step="0.1"
                        style="width: 100px; padding: 5px; background: #1a1a1a; border: 1px solid #555; 
                        border-radius: 3px; color: #ddd; font-size: 13px; box-sizing: border-box;">
                </div>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="customRatioCancel" 
                    style="padding: 5px 12px; background: #444; border: none; border-radius: 3px; 
                    color: #ddd; cursor: pointer; font-size: 12px;">
                    Cancel
                </button>
                <button id="customRatioOk" 
                    style="padding: 5px 12px; background: #4a90e2; border: none; border-radius: 3px; 
                    color: white; cursor: pointer; font-size: 12px;">
                    OK
                </button>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            z-index: 9999;
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(dialog);

        const widthInput = dialog.querySelector('#customRatioWidth');
        const heightInput = dialog.querySelector('#customRatioHeight');
        const okBtn = dialog.querySelector('#customRatioOk');
        const cancelBtn = dialog.querySelector('#customRatioCancel');

        setTimeout(() => widthInput.focus(), 100);

        const closeDialog = () => {
            document.body.removeChild(dialog);
            document.body.removeChild(overlay);
        };

        const applyRatio = () => {
            const w = parseFloat(widthInput.value);
            const h = parseFloat(heightInput.value);

            if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
                widthInput.style.borderColor = '#e74c3c';
                heightInput.style.borderColor = '#e74c3c';
                return;
            }

            node.properties.customRatioWidth = w;
            node.properties.customRatioHeight = h;
            node.properties.aspectRatio = "custom";

            const ratio = w / h;
            const centerX = node.properties.cropX + node.properties.cropWidth / 2;
            const centerY = node.properties.cropY + node.properties.cropHeight / 2;

            const newHeight = Math.round(node.properties.cropWidth / ratio);
            node.properties.cropHeight = newHeight;
            node.properties.cropY = Math.round(centerY - newHeight / 2);

            if (app.graph) {
                app.graph.setDirtyCanvas(true, true);
            }

            closeDialog();
        };

        okBtn.onclick = applyRatio;
        cancelBtn.onclick = closeDialog;
        overlay.onclick = closeDialog;

        widthInput.onkeydown = heightInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                applyRatio();
            } else if (e.key === 'Escape') {
                closeDialog();
            }
        };

        widthInput.oninput = heightInput.oninput = () => {
            widthInput.style.borderColor = '#555';
            heightInput.style.borderColor = '#555';
        };
    }

    pickFillColor(node) {
        const input = document.createElement("input");
        input.type = "color";
        input.value = node.properties.fillColor || "#000000";
        input.onchange = async (e) => {
            node.properties.fillColor = e.target.value;
            if (app.graph) {
                app.graph.setDirtyCanvas(true, true);
            }
            // 保存颜色到后端
            try {
                const nodeId = node.properties.nodeId || node.id.toString();
                await fetch("/yc_image_crop_interactive/save_color", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        node_id: nodeId,
                        fill_color: node.properties.fillColor,
                        source_width: node.properties.sourceWidth || 512,
                        source_height: node.properties.sourceHeight || 512
                    })
                });
                console.log("[YC交互式裁剪] 颜色已保存:", node.properties.fillColor);
            } catch (error) {
                console.error("[YC交互式裁剪] 保存颜色失败:", error);
            }
        };
        input.click();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    updateNodeSize(node) {
        const { shiftLeft, shiftRight, panelHeight } = this.state.layout;
        const maxDisplaySize = 500;
        const scale = Math.min(
            maxDisplaySize / node.properties.sourceWidth,
            maxDisplaySize / node.properties.sourceHeight,
            1.0
        );

        const displayWidth = Math.max(500, Math.min(node.properties.sourceWidth * scale + shiftRight + shiftLeft, 800));
        const displayHeight = Math.max(400, Math.min(node.properties.sourceHeight * scale + shiftLeft * 2 + panelHeight, 800));

        node.size = [displayWidth, displayHeight];
    }

    isPointInRect(px, py, x, y, w, h) {
        return px >= x && px <= x + w && py >= y && py <= y + h;
    }

    // ── 确认 / 取消（不再传 image_data）──────────────────────────

    async confirmCrop(node) {
        console.log("[YC交互式裁剪] 用户点击确认");
        
        if (!node.properties.nodeId) {
            console.error("[YC交互式裁剪] 缺少节点ID");
            return;
        }
        
        try {
            const response = await fetch("/yc_image_crop_interactive/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node_id: node.properties.nodeId,
                    crop_x: node.properties.cropX,
                    crop_y: node.properties.cropY,
                    crop_width: node.properties.cropWidth,
                    crop_height: node.properties.cropHeight,
                    fill_color: node.properties.fillColor
                })
            });
            
            const result = await response.json();
            if (result.success) {
                console.log("[YC交互式裁剪] 确认成功");
                node.properties.isWaitingConfirm = false;
                this._stopHeartbeat();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
            } else {
                console.error("[YC交互式裁剪] 确认失败:", result.error);
            }
        } catch (error) {
            console.error("[YC交互式裁剪] 确认请求失败:", error);
        }
    }
    
    async cancelCrop(node) {
        console.log("[YC交互式裁剪] 用户点击取消");
        
        if (!node.properties.nodeId) {
            console.error("[YC交互式裁剪] 缺少节点ID");
            return;
        }
        
        try {
            const response = await fetch("/yc_image_crop_interactive/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node_id: node.properties.nodeId
                })
            });
            
            const result = await response.json();
            if (result.success) {
                console.log("[YC交互式裁剪] 取消成功");
                node.properties.isWaitingConfirm = false;
                this._stopHeartbeat();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
            } else {
                console.error("[YC交互式裁剪] 取消失败:", result.error);
            }
        } catch (error) {
            console.error("[YC交互式裁剪] 取消请求失败:", error);
        }
    }

    // ── 强制重新编辑 ──────────────────────────────────────────────

    async forceReedit(node) {
        const nodeId = node.properties.nodeId || node.id.toString();
        console.log("[YC交互式裁剪] 标记强制重新编辑，节点ID:", nodeId);
        try {
            await fetch("/yc_image_crop_interactive/force_reedit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node_id: nodeId })
            });
            this._lastReuseInfo = "Re-edit: will open editor on next run";
            if (app.graph) app.graph.setDirtyCanvas(true, true);
        } catch (error) {
            console.error("[YC交互式裁剪] 标记强制重新编辑失败:", error);
        }
    }

    // ── 销毁 ─────────────────────────────────────────────────────

    destroy() {
        this._stopHeartbeat();
        this._cleanupGlobalMouseUp();
        this._sourceImageObj = null;
        this._imageBase64Data = "";
    }
}

// 全局监听 WebSocket 消息
api.addEventListener("yc_image_crop_interactive_init", (event) => {
    console.log("[YC交互式裁剪] 收到WebSocket消息 - 交互模式");
    const { node_id } = event.detail;
    
    const node = app.graph._nodes.find(n => n.id.toString() === node_id);
    if (node && node.ycImageCropInteractive) {
        node.ycImageCropInteractive.loadImageFromBackend(node, event.detail);
    } else {
        console.error("[YC交互式裁剪] 未找到节点或实例:", node_id);
    }
});

// 复用模式通知
api.addEventListener("yc_image_crop_interactive_reuse", (event) => {
    console.log("[YC交互式裁剪] 收到WebSocket消息 - 复用模式");
    const { node_id } = event.detail;
    
    const node = app.graph._nodes.find(n => n.id.toString() === node_id);
    if (node && node.ycImageCropInteractive) {
        node.ycImageCropInteractive.handleReuseNotify(node, event.detail);
    }
});

// 注册扩展
app.registerExtension({
    name: "ycImageCropInteractive",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ycImageCropInteractive") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) {
                onNodeCreated.apply(this, []);
            }
            this.ycImageCropInteractive = new ycImageCropInteractive(this);
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (onRemoved) {
                onRemoved.apply(this, []);
            }
            if (this.ycImageCropInteractive) {
                this.ycImageCropInteractive.destroy();
                this.ycImageCropInteractive = null;
            }
        };
    }
});

console.log("[YC交互式裁剪] 前端扩展已加载");
