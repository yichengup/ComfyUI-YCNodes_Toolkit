// author.yichengup.ImageCrop 2026.04.XX
import { app } from "../../scripts/app.js";

// 全局图片缓存（避免工作流保存时包含图片）
const imageCache = new Map();

const DEFAULT_LAYOUT = {
    shiftLeft: 10,
    shiftRight: 80,
    panelHeight: 58
};

// 预设比例
const ASPECT_RATIOS = {
    "free": { label: "Free", ratio: null },
    "1:1": { label: "1:1", ratio: 1 },
    "4:3": { label: "4:3", ratio: 4/3 },
    "3:4": { label: "3:4", ratio: 3/4 },
    "3:2": { label: "3:2", ratio: 3/2 },
    "2:3": { label: "2:3", ratio: 2/3 },
    "16:9": { label: "16:9", ratio: 16/9 },
    "9:16": { label: "9:16", ratio: 9/16 },
    "21:9": { label: "21:9", ratio: 21/9 },
    "2:1": { label: "2:1", ratio: 2 },
    "1:2": { label: "1:2", ratio: 0.5 },
    "custom": { label: "Custom", ratio: null }
};

class ycImageCrop {
    constructor(node) {
        this.node = node;
        this.state = this.createInitialState(node);
        this.initUI(node);
    }

    createInitialState(node) {
        if (!node.properties) {
            node.properties = {};
        }

        const defaults = {
            sourceImage: null,
            sourceImageObj: null,
            imageBase64Data: "",
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
            isDragging: false,
            dragHandle: null, // null, 'move', 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
            dragStartX: 0,
            dragStartY: 0,
            dragStartCropX: 0,
            dragStartCropY: 0,
            dragStartCropWidth: 0,
            dragStartCropHeight: 0,
            buttons: []
        };

        node.properties = { ...defaults, ...node.properties };
        node.size = node.size || [500, 500];

        return {
            layout: { ...DEFAULT_LAYOUT },
            fontSize: LiteGraph?.NODE_SUBTEXT_SIZE ?? 10
        };
    }

    initUI(node) {
        const { shiftLeft, shiftRight, panelHeight } = this.state.layout;

        this.setupHiddenWidgets(node);
        this.initButtons(node);
        this.initInteractions(node);
        this.setupDrawing(node);
        
        // 添加 onAdded 钩子
        node.onAdded = () => {
            this.initButtons(node);
        };
    }

    setupHiddenWidgets(node) {
        // 隐藏不需要显示的widgets
        const widgetNames = ["image_base64", "crop_x", "crop_y", "crop_width", "crop_height", "aspect_ratio", "fill_color"];
        for (const name of widgetNames) {
            const widget = node.widgets.find(w => w.name === name);
            if (widget) {
                widget.hidden = true;
            }
        }
    }

    initButtons(node) {
            const buttonY = 10;  // 向下移动2px
            const buttonHeight = 21;
            let buttonX = 10;

            // 第一行：功能按钮 + Free + Custom
            node.properties.buttons = [
                {
                    text: "Load Image",
                    x: buttonX,
                    y: buttonY,
                    width: 80,
                    height: buttonHeight,
                    action: () => this.loadImageFromFile(node)
                },
                {
                    text: "Reset",
                    x: (buttonX += 85),
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
                }
            ];

            // 确保输出端口正确设置
            if (node.outputs && node.outputs.length >= 4) {
                node.outputs[0].name = "image";
                node.outputs[0].type = "IMAGE";
                node.outputs[1].name = "mask";
                node.outputs[1].type = "MASK";
                node.outputs[2].name = "width";
                node.outputs[2].type = "INT";
                node.outputs[3].name = "height";
                node.outputs[3].type = "INT";
            }

            // 第一行比例按钮（接在功能按钮后面）：Free + Custom
            buttonX += 55;
            const ratioButtonWidth = 30;  // 缩小按钮宽度到30px
            const customButtonWidth = 50;  // Custom按钮需要更宽
            const ratioButtonHeight = 18;

            const ratioKeys1 = ["free", "custom"];
            for (const key of ratioKeys1) {
                const btnWidth = key === "custom" ? customButtonWidth : ratioButtonWidth;
                node.properties.buttons.push({
                    text: ASPECT_RATIOS[key].label,
                    x: buttonX,
                    y: buttonY + 2,
                    width: btnWidth,
                    height: ratioButtonHeight,
                    isRatio: true,
                    ratioKey: key,
                    action: () => key === "custom" ? this.setCustomRatio(node) : this.setAspectRatio(node, key)
                });
                buttonX += btnWidth + 5;
            }

            // 第二行：所有预设比例按钮（包括1:1）
            const ratioY2 = buttonY + buttonHeight + 5;
            let ratioX2 = 10;
            const ratioKeys2 = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"];
            for (const key of ratioKeys2) {
                node.properties.buttons.push({
                    text: ASPECT_RATIOS[key].label,
                    x: ratioX2,
                    y: ratioY2,
                    width: ratioButtonWidth,
                    height: ratioButtonHeight,
                    isRatio: true,
                    ratioKey: key,
                    action: () => this.setAspectRatio(node, key)
                });
                ratioX2 += ratioButtonWidth + 5;
            }
        }



    initInteractions(node) {
        const { shiftLeft, shiftRight, panelHeight } = this.state.layout;

        node.onMouseDown = (e, localPos, graphCanvas) => {
            // 检查是否点击按钮
            for (const button of node.properties.buttons) {
                if (this.isPointInRect(localPos[0], localPos[1], button.x, button.y, button.width, button.height)) {
                    button.action();
                    return true;
                }
            }

            // 计算扩展后的显示范围
            const displayMinX = Math.min(0, node.properties.cropX);
            const displayMinY = Math.min(0, node.properties.cropY);
            const displayMaxX = Math.max(node.properties.sourceWidth, node.properties.cropX + node.properties.cropWidth);
            const displayMaxY = Math.max(node.properties.sourceHeight, node.properties.cropY + node.properties.cropHeight);
            const displayWidth = displayMaxX - displayMinX;
            const displayHeight = displayMaxY - displayMinY;

            // 计算画布区域
            const canvasAreaWidth = node.size[0] - shiftRight - shiftLeft;
            const canvasAreaHeight = node.size[1] - shiftLeft - shiftLeft - panelHeight;
            const scale = Math.min(
                canvasAreaWidth / displayWidth,
                canvasAreaHeight / displayHeight
            );
            const scaledDisplayWidth = displayWidth * scale;
            const scaledDisplayHeight = displayHeight * scale;
            const offsetX = shiftLeft + (canvasAreaWidth - scaledDisplayWidth) / 2;
            const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledDisplayHeight) / 2;

            // 转换为图片坐标（考虑扩展区域的偏移）
            const imgX = (localPos[0] - offsetX) / scale + displayMinX;
            const imgY = (localPos[1] - offsetY) / scale + displayMinY;

            // 检查是否点击裁切框的控制点或边
            const handle = this.getHandleAtPoint(node, imgX, imgY, scale);
            if (handle) {
                node.properties.isDragging = true;
                node.properties.dragHandle = handle;
                node.properties.dragStartX = imgX;
                node.properties.dragStartY = imgY;
                node.properties.dragStartCropX = node.properties.cropX;
                node.properties.dragStartCropY = node.properties.cropY;
                node.properties.dragStartCropWidth = node.properties.cropWidth;
                node.properties.dragStartCropHeight = node.properties.cropHeight;
                return true;
            }

            return false;
        };

        node.onMouseMove = (e, localPos, graphCanvas) => {
            if (!node.properties.isDragging) {
                // 更新鼠标样式
                const displayMinX = Math.min(0, node.properties.cropX);
                const displayMinY = Math.min(0, node.properties.cropY);
                const displayMaxX = Math.max(node.properties.sourceWidth, node.properties.cropX + node.properties.cropWidth);
                const displayMaxY = Math.max(node.properties.sourceHeight, node.properties.cropY + node.properties.cropHeight);
                const displayWidth = displayMaxX - displayMinX;
                const displayHeight = displayMaxY - displayMinY;

                const canvasAreaWidth = node.size[0] - shiftRight - shiftLeft;
                const canvasAreaHeight = node.size[1] - shiftLeft - shiftLeft - panelHeight;
                const scale = Math.min(
                    canvasAreaWidth / displayWidth,
                    canvasAreaHeight / displayHeight
                );
                const scaledDisplayWidth = displayWidth * scale;
                const scaledDisplayHeight = displayHeight * scale;
                const offsetX = shiftLeft + (canvasAreaWidth - scaledDisplayWidth) / 2;
                const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledDisplayHeight) / 2;

                const imgX = (localPos[0] - offsetX) / scale + displayMinX;
                const imgY = (localPos[1] - offsetY) / scale + displayMinY;

                const handle = this.getHandleAtPoint(node, imgX, imgY, scale);
                if (handle) {
                    graphCanvas.canvas.style.cursor = this.getCursorForHandle(handle);
                } else {
                    graphCanvas.canvas.style.cursor = "default";
                }
                return false;
            }

            // 拖拽中
            const displayMinX = Math.min(0, node.properties.cropX);
            const displayMinY = Math.min(0, node.properties.cropY);
            const displayMaxX = Math.max(node.properties.sourceWidth, node.properties.cropX + node.properties.cropWidth);
            const displayMaxY = Math.max(node.properties.sourceHeight, node.properties.cropY + node.properties.cropHeight);
            const displayWidth = displayMaxX - displayMinX;
            const displayHeight = displayMaxY - displayMinY;

            const canvasAreaWidth = node.size[0] - shiftRight - shiftLeft;
            const canvasAreaHeight = node.size[1] - shiftLeft - shiftLeft - panelHeight;
            const scale = Math.min(
                canvasAreaWidth / displayWidth,
                canvasAreaHeight / displayHeight
            );
            const scaledDisplayWidth = displayWidth * scale;
            const scaledDisplayHeight = displayHeight * scale;
            const offsetX = shiftLeft + (canvasAreaWidth - scaledDisplayWidth) / 2;
            const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledDisplayHeight) / 2;

            const imgX = (localPos[0] - offsetX) / scale + displayMinX;
            const imgY = (localPos[1] - offsetY) / scale + displayMinY;

            this.updateCropByDrag(node, imgX, imgY);
            this.syncWidgets(node);
            
            if (graphCanvas.dirty_canvas !== true) {
                graphCanvas.setDirty(true, true);
            }

            return true;
        };

        node.onMouseUp = (e, localPos, graphCanvas) => {
            if (node.properties.isDragging) {
                node.properties.isDragging = false;
                node.properties.dragHandle = null;
                node.properties.cropX = Math.round(node.properties.cropX);
                node.properties.cropY = Math.round(node.properties.cropY);
                node.properties.cropWidth = Math.round(node.properties.cropWidth);
                node.properties.cropHeight = Math.round(node.properties.cropHeight);
                graphCanvas.canvas.style.cursor = "default";
                return true;
            }
            return false;
        };

        // 添加双击事件处理
        node.onDblClick = (e, localPos, graphCanvas) => {
            if (node.properties.isDragging) {
                node.properties.isDragging = false;
                node.properties.dragHandle = null;
                node.properties.cropX = Math.round(node.properties.cropX);
                node.properties.cropY = Math.round(node.properties.cropY);
                node.properties.cropWidth = Math.round(node.properties.cropWidth);
                node.properties.cropHeight = Math.round(node.properties.cropHeight);
                graphCanvas.canvas.style.cursor = "default";
                return true;
            }
            return false;
        };

        // 添加全局鼠标释放监听（防止鼠标移出节点区域时无法释放）
        const canvas = app.canvas;
        if (canvas && !node._globalMouseUpHandler) {
            node._globalMouseUpHandler = (e) => {
                if (node.properties.isDragging) {
                    node.properties.isDragging = false;
                    node.properties.dragHandle = null;
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
            document.addEventListener('mouseup', node._globalMouseUpHandler);
        }
        
        // 拖拽功能：支持从桌面拖拽图像到画布
        node.onDragOver = (e) => {
            // 检查是否在画布区域内
            const mouseX = e.canvasX - node.pos[0];
            const mouseY = e.canvasY - node.pos[1];

            // 计算扩展后的显示范围
            const displayMinX = Math.min(0, node.properties.cropX);
            const displayMinY = Math.min(0, node.properties.cropY);
            const displayMaxX = Math.max(node.properties.sourceWidth, node.properties.cropX + node.properties.cropWidth);
            const displayMaxY = Math.max(node.properties.sourceHeight, node.properties.cropY + node.properties.cropHeight);
            const displayWidth = displayMaxX - displayMinX;
            const displayHeight = displayMaxY - displayMinY;

            const canvasAreaWidth = node.size[0] - shiftRight - shiftLeft;
            const canvasAreaHeight = node.size[1] - shiftLeft - shiftLeft - panelHeight;
            const scale = Math.min(
                canvasAreaWidth / displayWidth,
                canvasAreaHeight / displayHeight
            );
            const scaledDisplayWidth = displayWidth * scale;
            const scaledDisplayHeight = displayHeight * scale;
            const offsetX = shiftLeft + (canvasAreaWidth - scaledDisplayWidth) / 2;
            const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledDisplayHeight) / 2;

            // 判断鼠标是否在画布区域内
            if (mouseX >= offsetX && mouseX <= offsetX + scaledDisplayWidth &&
                mouseY >= offsetY && mouseY <= offsetY + scaledDisplayHeight) {

                // 检查是否有图像文件
                if (e.dataTransfer && e.dataTransfer.types) {
                    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
                    if (hasFiles) {
                        e.preventDefault();
                        e.stopPropagation();
                        return true;
                    }
                }
            }
            return false;
        };

        // 注意：ComfyUI 使用 onDragDrop 而不是 onDrop
        node.onDragDrop = (e) => {
            // 检查是否在画布区域内
            const mouseX = e.canvasX - node.pos[0];
            const mouseY = e.canvasY - node.pos[1];

            // 计算扩展后的显示范围
            const displayMinX = Math.min(0, node.properties.cropX);
            const displayMinY = Math.min(0, node.properties.cropY);
            const displayMaxX = Math.max(node.properties.sourceWidth, node.properties.cropX + node.properties.cropWidth);
            const displayMaxY = Math.max(node.properties.sourceHeight, node.properties.cropY + node.properties.cropHeight);
            const displayWidth = displayMaxX - displayMinX;
            const displayHeight = displayMaxY - displayMinY;

            const canvasAreaWidth = node.size[0] - shiftRight - shiftLeft;
            const canvasAreaHeight = node.size[1] - shiftLeft - shiftLeft - panelHeight;
            const scale = Math.min(
                canvasAreaWidth / displayWidth,
                canvasAreaHeight / displayHeight
            );
            const scaledDisplayWidth = displayWidth * scale;
            const scaledDisplayHeight = displayHeight * scale;
            const offsetX = shiftLeft + (canvasAreaWidth - scaledDisplayWidth) / 2;
            const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledDisplayHeight) / 2;

            // 判断鼠标是否在画布区域内
            if (mouseX < offsetX || mouseX > offsetX + scaledDisplayWidth ||
                mouseY < offsetY || mouseY > offsetY + scaledDisplayHeight) {
                return false;
            }

            // 处理拖拽的文件
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];

                // 检查是否是图像文件
                if (!file.type.startsWith('image/')) {
                    console.warn('Only image files are supported');
                    return false;
                }

                // 读取文件并转换为 base64
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const dataURL = event.target.result;
                        
                        const img = new Image();
                        img.onload = () => {
                            node.properties.sourceWidth = img.width;
                            node.properties.sourceHeight = img.height;
                            node.properties.sourceImageObj = img;
                            node.properties.imageBase64Data = dataURL;

                            // 加载图片后，控制框自动填满整个图片
                            node.properties.cropX = 0;
                            node.properties.cropY = 0;
                            node.properties.cropWidth = img.width;
                            node.properties.cropHeight = img.height;
                            node.properties.aspectRatio = "free";

                            // 更新节点大小
                            this.updateNodeSize(node);

                            // 同步到widgets
                            this.syncWidgets(node);

                            // 触发重绘
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

    setupDrawing(node) {
        const { shiftLeft, shiftRight, panelHeight } = this.state.layout;
        const fontsize = this.state.fontSize;

        node.onDrawForeground = (ctx) => {
            if (node.flags.collapsed) {
                return false;
            }

            // 绘制控制面板背景
            ctx.fillStyle = "rgba(40,40,40,0.9)";
            ctx.beginPath();
            ctx.roundRect(shiftLeft - 4, shiftLeft - 4, node.size[0] - shiftRight - shiftLeft + 8, panelHeight, 4);
            ctx.fill();

            ctx.strokeStyle = "rgba(100,100,100,0.5)";
            ctx.lineWidth = 1;
            ctx.strokeRect(shiftLeft - 4, shiftLeft - 4, node.size[0] - shiftRight - shiftLeft + 8, panelHeight);

            // 计算扩展后的显示范围（包含裁切框的所有区域）
            const displayMinX = Math.min(0, node.properties.cropX);
            const displayMinY = Math.min(0, node.properties.cropY);
            const displayMaxX = Math.max(node.properties.sourceWidth, node.properties.cropX + node.properties.cropWidth);
            const displayMaxY = Math.max(node.properties.sourceHeight, node.properties.cropY + node.properties.cropHeight);
            const displayWidth = displayMaxX - displayMinX;
            const displayHeight = displayMaxY - displayMinY;

            // 计算画布区域和缩放
            const canvasAreaWidth = node.size[0] - shiftRight - shiftLeft;
            const canvasAreaHeight = node.size[1] - shiftLeft - shiftLeft - panelHeight;
            const scale = Math.min(
                canvasAreaWidth / displayWidth,
                canvasAreaHeight / displayHeight
            );
            const scaledDisplayWidth = displayWidth * scale;
            const scaledDisplayHeight = displayHeight * scale;
            const offsetX = shiftLeft + (canvasAreaWidth - scaledDisplayWidth) / 2;
            const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledDisplayHeight) / 2;

            // 计算原图在显示区域中的位置
            const sourceX = offsetX + (0 - displayMinX) * scale;
            const sourceY = offsetY + (0 - displayMinY) * scale;
            const scaledSourceWidth = node.properties.sourceWidth * scale;
            const scaledSourceHeight = node.properties.sourceHeight * scale;

            // 绘制扩展区域背景（深灰色）
            ctx.fillStyle = "rgba(60,60,60,0.8)";
            ctx.beginPath();
            ctx.roundRect(offsetX - 4, offsetY - 4, scaledDisplayWidth + 8, scaledDisplayHeight + 8, 4);
            ctx.fill();

            // 绘制扩展区域的网格
            ctx.strokeStyle = "rgba(80,80,80,0.3)";
            ctx.lineWidth = 1;
            const gridSize = 32 * scale;
            for (let x = offsetX; x <= offsetX + scaledDisplayWidth; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, offsetY);
                ctx.lineTo(x, offsetY + scaledDisplayHeight);
                ctx.stroke();
            }
            for (let y = offsetY; y <= offsetY + scaledDisplayHeight; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(offsetX, y);
                ctx.lineTo(offsetX + scaledDisplayWidth, y);
                ctx.stroke();
            }

            // 绘制原图区域背景
            ctx.fillStyle = "rgba(20,20,20,0.9)";
            ctx.fillRect(sourceX, sourceY, scaledSourceWidth, scaledSourceHeight);

            // 绘制源图片
            if (node.properties.sourceImageObj && node.properties.sourceImageObj.complete) {
                try {
                    ctx.drawImage(node.properties.sourceImageObj, sourceX, sourceY, scaledSourceWidth, scaledSourceHeight);
                } catch (e) {
                    console.error("Error drawing source image:", e);
                    this.drawPlaceholder(ctx, sourceX, sourceY, scaledSourceWidth, scaledSourceHeight, scale);
                }
            } else {
                this.drawPlaceholder(ctx, sourceX, sourceY, scaledSourceWidth, scaledSourceHeight, scale);
            }

            // 绘制原图边界线
            ctx.strokeStyle = "rgba(100,150,255,0.6)";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(sourceX, sourceY, scaledSourceWidth, scaledSourceHeight);
            ctx.setLineDash([]);

            // 绘制裁切框（使用新的坐标系统）
            this.drawCropBox(ctx, node, offsetX, offsetY, scale, displayMinX, displayMinY);

            // 绘制按钮
            this.drawButtons(ctx, node);

            // 绘制信息文本
            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
            ctx.font = `${fontsize}px Arial`;
            ctx.textAlign = "center";
            const extendInfo = (displayMinX < 0 || displayMinY < 0 || displayMaxX > node.properties.sourceWidth || displayMaxY > node.properties.sourceHeight) 
                ? " (Extended)" : "";
            ctx.fillText(
                `Source: ${node.properties.sourceWidth}×${node.properties.sourceHeight} | Crop: ${Math.round(node.properties.cropWidth)}×${Math.round(node.properties.cropHeight)}${extendInfo}`,
                node.size[0] / 2,
                offsetY + scaledDisplayHeight + 15
            );
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
        // 计算裁切框在显示坐标系中的位置
        const x1 = offsetX + (node.properties.cropX - displayMinX) * scale;
        const y1 = offsetY + (node.properties.cropY - displayMinY) * scale;
        const x2 = x1 + node.properties.cropWidth * scale;
        const y2 = y1 + node.properties.cropHeight * scale;

        // 计算原图在显示坐标系中的边界
        const imgX1 = offsetX + (0 - displayMinX) * scale;
        const imgY1 = offsetY + (0 - displayMinY) * scale;
        const imgX2 = imgX1 + node.properties.sourceWidth * scale;
        const imgY2 = imgY1 + node.properties.sourceHeight * scale;

        // 绘制半透明遮罩（裁切框外的区域）
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        
        // 上
        if (y1 > imgY1) {
            ctx.fillRect(imgX1, imgY1, imgX2 - imgX1, y1 - imgY1);
        }
        // 下
        if (y2 < imgY2) {
            ctx.fillRect(imgX1, y2, imgX2 - imgX1, imgY2 - y2);
        }
        // 左
        if (x1 > imgX1) {
            ctx.fillRect(imgX1, Math.max(y1, imgY1), x1 - imgX1, Math.min(y2, imgY2) - Math.max(y1, imgY1));
        }
        // 右
        if (x2 < imgX2) {
            ctx.fillRect(x2, Math.max(y1, imgY1), imgX2 - x2, Math.min(y2, imgY2) - Math.max(y1, imgY1));
        }

        // 绘制裁切框边框
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // 绘制九宫格辅助线
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

        // 绘制控制点
        const handleSize = 10;
        const handles = [
            { x: x1, y: y1 }, // nw
            { x: x2, y: y1 }, // ne
            { x: x1, y: y2 }, // sw
            { x: x2, y: y2 }, // se
            { x: (x1 + x2) / 2, y: y1 }, // n
            { x: (x1 + x2) / 2, y: y2 }, // s
            { x: x1, y: (y1 + y2) / 2 }, // w
            { x: x2, y: (y1 + y2) / 2 }  // e
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
        for (const button of node.properties.buttons) {
            // 高亮当前选中的比例按钮
            if (button.isRatio && button.ratioKey === node.properties.aspectRatio) {
                ctx.fillStyle = "rgba(100,150,255,0.8)";
            } else if (button.isColorButton) {
                // 颜色按钮显示当前填充色
                const color = this.hexToRgb(node.properties.fillColor || "#000000");
                ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
            } else {
                ctx.fillStyle = "rgba(60,60,60,0.7)";
            }
            
            ctx.fillRect(button.x, button.y, button.width, button.height);

            ctx.strokeStyle = "rgba(150,150,150,0.6)";
            ctx.lineWidth = 1;
            ctx.strokeRect(button.x, button.y, button.width, button.height);

            // 颜色按钮的文字颜色根据背景亮度调整
            if (button.isColorButton) {
                const color = this.hexToRgb(node.properties.fillColor || "#000000");
                const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
                ctx.fillStyle = brightness > 128 ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)";
            } else {
                ctx.fillStyle = "rgba(220,220,220,0.9)";
            }
            
            ctx.font = button.isRatio ? "10px Arial" : "11px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            
            // Custom按钮显示当前自定义比例
            let displayText = button.text;
            if (button.ratioKey === "custom" && node.properties.aspectRatio === "custom") {
                const w = node.properties.customRatioWidth || 1;
                const h = node.properties.customRatioHeight || 1;
                displayText = `${w}:${h}`;
            }
            
            ctx.fillText(displayText, button.x + button.width / 2, button.y + button.height / 2);
        }
    }

    getHandleAtPoint(node, imgX, imgY, scale) {
        const handleSize = 10 / scale; // 转换为图片坐标系
        const x1 = node.properties.cropX;
        const y1 = node.properties.cropY;
        const x2 = x1 + node.properties.cropWidth;
        const y2 = y1 + node.properties.cropHeight;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;

        // 检查角点
        if (Math.abs(imgX - x1) < handleSize && Math.abs(imgY - y1) < handleSize) return 'nw';
        if (Math.abs(imgX - x2) < handleSize && Math.abs(imgY - y1) < handleSize) return 'ne';
        if (Math.abs(imgX - x1) < handleSize && Math.abs(imgY - y2) < handleSize) return 'sw';
        if (Math.abs(imgX - x2) < handleSize && Math.abs(imgY - y2) < handleSize) return 'se';

        // 检查边
        if (Math.abs(imgX - cx) < handleSize && Math.abs(imgY - y1) < handleSize) return 'n';
        if (Math.abs(imgX - cx) < handleSize && Math.abs(imgY - y2) < handleSize) return 's';
        if (Math.abs(imgX - x1) < handleSize && Math.abs(imgY - cy) < handleSize) return 'w';
        if (Math.abs(imgX - x2) < handleSize && Math.abs(imgY - cy) < handleSize) return 'e';

        // 检查是否在裁切框内（移动）
        if (imgX >= x1 && imgX <= x2 && imgY >= y1 && imgY <= y2) return 'move';

        return null;
    }

    getCursorForHandle(handle) {
        const cursors = {
            'nw': 'nw-resize',
            'ne': 'ne-resize',
            'sw': 'sw-resize',
            'se': 'se-resize',
            'n': 'n-resize',
            's': 's-resize',
            'w': 'w-resize',
            'e': 'e-resize',
            'move': 'move'
        };
        return cursors[handle] || 'default';
    }

    updateCropByDrag(node, imgX, imgY) {
        const dx = imgX - node.properties.dragStartX;
        const dy = imgY - node.properties.dragStartY;
        const handle = node.properties.dragHandle;

        let newX = node.properties.dragStartCropX;
        let newY = node.properties.dragStartCropY;
        let newW = node.properties.dragStartCropWidth;
        let newH = node.properties.dragStartCropHeight;

        // 获取比例（支持自定义比例）
        let ratio = ASPECT_RATIOS[node.properties.aspectRatio]?.ratio;
        if (node.properties.aspectRatio === "custom" && node.properties.customRatioWidth && node.properties.customRatioHeight) {
            ratio = node.properties.customRatioWidth / node.properties.customRatioHeight;
        }

        if (handle === 'move') {
            newX = node.properties.dragStartCropX + dx;
            newY = node.properties.dragStartCropY + dy;
        } else if (handle === 'nw') {
            newX = node.properties.dragStartCropX + dx;
            newY = node.properties.dragStartCropY + dy;
            newW = node.properties.dragStartCropWidth - dx;
            newH = node.properties.dragStartCropHeight - dy;
        } else if (handle === 'ne') {
            newY = node.properties.dragStartCropY + dy;
            newW = node.properties.dragStartCropWidth + dx;
            newH = node.properties.dragStartCropHeight - dy;
        } else if (handle === 'sw') {
            newX = node.properties.dragStartCropX + dx;
            newW = node.properties.dragStartCropWidth - dx;
            newH = node.properties.dragStartCropHeight + dy;
        } else if (handle === 'se') {
            newW = node.properties.dragStartCropWidth + dx;
            newH = node.properties.dragStartCropHeight + dy;
        } else if (handle === 'n') {
            newY = node.properties.dragStartCropY + dy;
            newH = node.properties.dragStartCropHeight - dy;
        } else if (handle === 's') {
            newH = node.properties.dragStartCropHeight + dy;
        } else if (handle === 'w') {
            newX = node.properties.dragStartCropX + dx;
            newW = node.properties.dragStartCropWidth - dx;
        } else if (handle === 'e') {
            newW = node.properties.dragStartCropWidth + dx;
        }

        // 应用比例约束
        if (ratio && handle !== 'move') {
            if (handle === 'n' || handle === 's') {
                newW = Math.round(newH * ratio);
                if (handle === 'n') {
                    newX = node.properties.dragStartCropX + (node.properties.dragStartCropWidth - newW) / 2;
                }
            } else if (handle === 'w' || handle === 'e') {
                newH = Math.round(newW / ratio);
                if (handle === 'w') {
                    newY = node.properties.dragStartCropY + (node.properties.dragStartCropHeight - newH) / 2;
                }
            } else {
                // 角点：保持比例，以宽度为准
                newH = Math.round(newW / ratio);
            }
        }

        // 限制最小尺寸
        if (newW < 10) newW = 10;
        if (newH < 10) newH = 10;

        node.properties.cropX = newX;
        node.properties.cropY = newY;
        node.properties.cropWidth = newW;
        node.properties.cropHeight = newH;
    }

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
                    node.properties.sourceImageObj = img;
                    node.properties.imageBase64Data = event.target.result;

                    // 加载图片后，控制框自动填满整个图片
                    node.properties.cropX = 0;
                    node.properties.cropY = 0;
                    node.properties.cropWidth = img.width;
                    node.properties.cropHeight = img.height;
                    node.properties.aspectRatio = "free";

                    // 更新节点大小
                    this.updateNodeSize(node);

                    // 同步到widgets
                    this.syncWidgets(node);

                    // 触发重绘
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
        this.syncWidgets(node);
        if (app.graph) {
            app.graph.setDirtyCanvas(true, true);
        }
    }

    setAspectRatio(node, ratioKey) {
        node.properties.aspectRatio = ratioKey;
        const ratio = ASPECT_RATIOS[ratioKey]?.ratio;
        
        if (ratio) {
            // 调整裁切框以匹配比例（保持中心点）
            const centerX = node.properties.cropX + node.properties.cropWidth / 2;
            const centerY = node.properties.cropY + node.properties.cropHeight / 2;
            
            const newHeight = Math.round(node.properties.cropWidth / ratio);
            node.properties.cropHeight = newHeight;
            node.properties.cropY = Math.round(centerY - newHeight / 2);
        }
        
        this.syncWidgets(node);
        if (app.graph) {
            app.graph.setDirtyCanvas(true, true);
        }
    }

    setCustomRatio(node) {
        // 创建自定义弹窗
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

        // 添加遮罩层
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

        // 获取输入框
        const widthInput = dialog.querySelector('#customRatioWidth');
        const heightInput = dialog.querySelector('#customRatioHeight');
        const okBtn = dialog.querySelector('#customRatioOk');
        const cancelBtn = dialog.querySelector('#customRatioCancel');

        // 聚焦到第一个输入框
        setTimeout(() => widthInput.focus(), 100);

        // 关闭弹窗函数
        const closeDialog = () => {
            document.body.removeChild(dialog);
            document.body.removeChild(overlay);
        };

        // 应用比例函数
        const applyRatio = () => {
            const w = parseFloat(widthInput.value);
            const h = parseFloat(heightInput.value);

            if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
                widthInput.style.borderColor = '#e74c3c';
                heightInput.style.borderColor = '#e74c3c';
                return;
            }

            // 保存自定义比例
            node.properties.customRatioWidth = w;
            node.properties.customRatioHeight = h;
            node.properties.aspectRatio = "custom";

            // 应用自定义比例
            const ratio = w / h;
            const centerX = node.properties.cropX + node.properties.cropWidth / 2;
            const centerY = node.properties.cropY + node.properties.cropHeight / 2;

            const newHeight = Math.round(node.properties.cropWidth / ratio);
            node.properties.cropHeight = newHeight;
            node.properties.cropY = Math.round(centerY - newHeight / 2);

            this.syncWidgets(node);
            if (app.graph) {
                app.graph.setDirtyCanvas(true, true);
            }

            closeDialog();
        };

        // 事件监听
        okBtn.onclick = applyRatio;
        cancelBtn.onclick = closeDialog;
        overlay.onclick = closeDialog;

        // 回车键确认
        widthInput.onkeydown = heightInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                applyRatio();
            } else if (e.key === 'Escape') {
                closeDialog();
            }
        };

        // 输入时清除错误样式
        widthInput.oninput = heightInput.oninput = () => {
            widthInput.style.borderColor = '#555';
            heightInput.style.borderColor = '#555';
        };
    }

    pickFillColor(node) {
        const input = document.createElement("input");
        input.type = "color";
        input.value = node.properties.fillColor || "#000000";
        input.onchange = (e) => {
            node.properties.fillColor = e.target.value;
            this.syncWidgets(node);
            if (app.graph) {
                app.graph.setDirtyCanvas(true, true);
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

        const displayWidth = Math.max(300, Math.min(node.properties.sourceWidth * scale + shiftRight + shiftLeft, 800));
        const displayHeight = Math.max(300, Math.min(node.properties.sourceHeight * scale + shiftLeft * 2 + panelHeight, 800));

        node.size = [displayWidth, displayHeight];
    }

    syncWidgets(node) {
        const widgets = {
            crop_x: node.widgets.find(w => w.name === "crop_x"),
            crop_y: node.widgets.find(w => w.name === "crop_y"),
            crop_width: node.widgets.find(w => w.name === "crop_width"),
            crop_height: node.widgets.find(w => w.name === "crop_height"),
            aspect_ratio: node.widgets.find(w => w.name === "aspect_ratio"),
            fill_color: node.widgets.find(w => w.name === "fill_color"),
            image_base64: node.widgets.find(w => w.name === "image_base64")
        };

        if (widgets.crop_x) widgets.crop_x.value = node.properties.cropX;
        if (widgets.crop_y) widgets.crop_y.value = node.properties.cropY;
        if (widgets.crop_width) widgets.crop_width.value = node.properties.cropWidth;
        if (widgets.crop_height) widgets.crop_height.value = node.properties.cropHeight;
        if (widgets.aspect_ratio) widgets.aspect_ratio.value = node.properties.aspectRatio;
        if (widgets.fill_color) widgets.fill_color.value = node.properties.fillColor;
        if (widgets.image_base64) widgets.image_base64.value = node.properties.imageBase64Data;
    }

    isPointInRect(px, py, x, y, w, h) {
        return px >= x && px <= x + w && py >= y && py <= y + h;
    }
}

// 注册扩展
app.registerExtension({
    name: "ycImageCrop",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ycImageCrop") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) {
                onNodeCreated.apply(this, []);
            }
            this.ycImageCrop = new ycImageCrop(this);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            if (onConfigure) {
                onConfigure.apply(this, [info]);
            }

            // 确保 ycImageCrop 实例存在
            if (!this.ycImageCrop) {
                this.ycImageCrop = new ycImageCrop(this);
            }

            // 恢复状态
            if (info.properties) {
                // 保存旧的 buttons（如果存在）
                const oldButtons = this.properties?.buttons;
                
                this.properties = { ...this.properties, ...info.properties };
                
                // 恢复图片：优先级 全局缓存 > properties > widget
                let imageToLoad = null;
                
                if (imageCache.has(this.id)) {
                    // 1. 从全局缓存恢复（切换tab后的情况）
                    imageToLoad = imageCache.get(this.id);
                } else if (this.properties.imageBase64Data && this.properties.imageBase64Data.trim()) {
                    // 2. 从 properties 恢复
                    imageToLoad = this.properties.imageBase64Data;
                } else {
                    // 3. 从 widget 恢复（工作流自带图片的情况）
                    const imageBase64Widget = this.widgets.find(w => w.name === "image_base64");
                    if (imageBase64Widget && imageBase64Widget.value && imageBase64Widget.value.trim()) {
                        imageToLoad = imageBase64Widget.value;
                    }
                }
                
                if (imageToLoad) {
                    this.properties.imageBase64Data = imageToLoad;
                    const img = new Image();
                    img.onload = () => {
                        this.properties.sourceImageObj = img;
                        if (app.graph) {
                            app.graph.setDirtyCanvas(true, true);
                        }
                    };
                    img.src = imageToLoad;
                    
                    // 同步到 widget（保持一致性）
                    const imageBase64Widget = this.widgets.find(w => w.name === "image_base64");
                    if (imageBase64Widget) {
                        imageBase64Widget.value = imageToLoad;
                    }
                }
            }
            
            // 重新初始化按钮（必须在 properties 恢复之后，确保按钮有正确的 action 函数）
            if (this.ycImageCrop) {
                this.ycImageCrop.initButtons(this);
            }
        };

        // 添加节点移除时的清理
        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (onRemoved) {
                onRemoved.apply(this, []);
            }
            
            // 清理全局事件监听
            if (this._globalMouseUpHandler) {
                document.removeEventListener('mouseup', this._globalMouseUpHandler);
                this._globalMouseUpHandler = null;
            }
            
            // 清理图片缓存
            if (imageCache.has(this.id)) {
                imageCache.delete(this.id);
            }
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (o) {
            if (onSerialize) {
                onSerialize.apply(this, [o]);
            }
            
            // 序列化前：将当前图片保存到全局缓存（用于切换tab后恢复）
            const currentBase64 = this.properties?.imageBase64Data;
            if (currentBase64 && currentBase64.trim()) {
                imageCache.set(this.id, currentBase64);
            }
            
            // 在序列化的 widgets_values 中清空 image_base64
            if (o.widgets_values && Array.isArray(o.widgets_values)) {
                const imageBase64Index = this.widgets?.findIndex(w => w.name === "image_base64");
                if (imageBase64Index !== -1 && imageBase64Index < o.widgets_values.length) {
                    o.widgets_values[imageBase64Index] = "";
                }
            }
            
            // 清理序列化对象中的 imageBase64Data（减小工作流文件体积）
            if (o.properties && o.properties.imageBase64Data) {
                o.properties.imageBase64Data = "";
            }
        };
    }
});

// author.yichengup.ImageCrop 2026.04.XX
