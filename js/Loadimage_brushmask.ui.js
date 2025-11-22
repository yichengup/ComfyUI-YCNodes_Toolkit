export const WIDGET_NAMES = {
    BRUSH_DATA: "brush_data",
    BRUSH_SIZE: "brush_size",
    IMAGE_WIDTH: "image_width",
    IMAGE_HEIGHT: "image_height",
    IMAGE_BASE64: "image_base64"
};

export function initUIBindings(node, state) {
    const { shiftLeft, shiftRight, panelHeight } = state.layout;
    const fontsize = state.fontSize;

    setupHiddenWidgets(node);

    node.initButtons = function () {
        if (this.outputs && this.outputs.length >= 4) {
            this.outputs[0].name = this.outputs[0].localized_name = "image";
            this.outputs[0].type = "IMAGE";

            this.outputs[1].name = this.outputs[1].localized_name = "mask";
            this.outputs[1].type = "MASK";

            this.outputs[2].name = this.outputs[2].localized_name = "width";
            this.outputs[2].type = "INT";

            this.outputs[3].name = this.outputs[3].localized_name = "height";
            this.outputs[3].type = "INT";
        }

        this.widgets_start_y = -4.8e8 * LiteGraph.NODE_SLOT_HEIGHT;

        if (this.widgets[1] && this.widgets[1].value) {
            this.properties.brushSize = this.widgets[1].value || 80;
        }

        const buttonY = 8;
        const buttonHeight = 21;
        const sliderHeight = 12;
        const sliderY = buttonY + buttonHeight + 5;
        const colorButtonWidth = 39;
        const colorButtonHeight = buttonHeight / 2 - 1;

        let buttonX = 10;

        this.properties.buttons = [
            {
                text: "Load Image",
                x: buttonX,
                y: buttonY,
                width: 66,
                height: buttonHeight,
                action: () => this.loadImageFromFile()
            },
            {
                text: "Clear",
                x: (buttonX += 71),
                y: buttonY,
                width: 39,
                height: buttonHeight,
                action: () => {
                    this.properties.brushPaths = [];
                    this.properties.currentPath = [];
                    this.updateThisNodeGraph?.();
                }
            },
            {
                text: "Undo",
                x: (buttonX += 44),
                y: buttonY,
                width: 39,
                height: buttonHeight,
                action: () => {
                    if (this.properties.brushPaths.length > 0) {
                        this.properties.brushPaths.pop();
                        this.updateThisNodeGraph?.();
                    }
                }
            },
            {
                text: "Eraser",
                x: (buttonX += 44),
                y: buttonY,
                width: 39,
                height: buttonHeight,
                isToggle: true,
                action: () => {
                    this.properties.brushMode = this.properties.brushMode === "brush" ? "erase" : "brush";
                    this.updateThisNodeGraph?.();
                }
            }
        ];

        this.properties.sliders = [
            {
                label: "Size",
                x: 10,
                y: sliderY,
                width: 120,
                height: sliderHeight,
                min: 1,
                max: 200,
                value: this.properties.brushSize || 80,
                type: "size",
                dragging: false
            },
            {
                label: "Opacity",
                x: 140,
                y: sliderY,
                width: 120,
                height: sliderHeight,
                min: 0.1,
                max: 1.0,
                value: this.properties.brushOpacity || 0.5,
                type: "opacity",
                dragging: false
            }
        ];

        this.properties.colorButtonGroup = {
            x: buttonX + 39 + 5,
            y: buttonY,
            width: colorButtonWidth,
            height: buttonHeight,
            buttons: [
                {
                    label: "Brush",
                    y: 0,
                    height: colorButtonHeight,
                    type: "brush",
                    color: this.properties.brushColor || "255,255,255"
                },
                {
                    label: "Eraser",
                    y: colorButtonHeight + 1,
                    height: colorButtonHeight,
                    type: "eraser",
                    color: this.properties.eraserColor || "255,50,50"
                }
            ]
        };
    };

    node.onAdded = function () {
        this.initButtons?.();
    };

    node.onConfigure = function () {
        const widthWidget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_WIDTH);
        const heightWidget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_HEIGHT);

        if (widthWidget && heightWidget && widthWidget.value && heightWidget.value) {
            this.updateImageSize(widthWidget.value, heightWidget.value);
        } else {
            this.updateImageSize(512, 512);
        }

        const brushSizeWidget = this.widgets.find(w => w.name === WIDGET_NAMES.BRUSH_SIZE);
        this.properties.brushSize = brushSizeWidget && brushSizeWidget.value !== undefined
            ? brushSizeWidget.value
            : 80;

        if (this.properties.brushOpacity === undefined) {
            this.properties.brushOpacity = 0.5;
        }
        if (this.properties.brushColor === undefined) {
            this.properties.brushColor = "255,255,255";
        }
        if (this.properties.eraserColor === undefined) {
            this.properties.eraserColor = "255,50,50";
        }

        if (this.properties.sliders) {
            for (const slider of this.properties.sliders) {
                if (slider.type === "size") {
                    slider.value = this.properties.brushSize;
                } else if (slider.type === "opacity") {
                    slider.value = this.properties.brushOpacity;
                }
            }
        }

        if (this.properties.colorButtonGroup?.buttons) {
            for (const colorBtn of this.properties.colorButtonGroup.buttons) {
                if (colorBtn.type === "brush") {
                    colorBtn.color = this.properties.brushColor;
                } else if (colorBtn.type === "eraser") {
                    colorBtn.color = this.properties.eraserColor;
                }
            }
        }

        const imageBase64Widget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_BASE64);
        if (imageBase64Widget && imageBase64Widget.value) {
            this.properties.imageBase64Data = imageBase64Widget.value;
            this.loadBackgroundImageFromBase64(imageBase64Widget.value);
        } else if (this.properties.imageBase64Data) {
            this.loadBackgroundImageFromBase64(this.properties.imageBase64Data);
        }

        this.properties.brushPaths = [];
        const brushDataWidget = this.widgets.find(w => w.name === WIDGET_NAMES.BRUSH_DATA) || this.widgets[2];
        if (brushDataWidget && brushDataWidget.value) {
            try {
                const brushData = brushDataWidget.value;
                if (brushData && brushData.trim()) {
                    const strokes = brushData.split("|");
                    for (const stroke of strokes) {
                        if (!stroke.trim()) continue;
                        const parsed = parseStroke(stroke);
                        if (parsed.points.length > 0) {
                            this.properties.brushPaths.push(parsed);
                        }
                    }
                }
            } catch (e) {
                console.error("Error parsing brush data:", e);
                this.properties.brushPaths = [];
            }
        }

        this.initButtons?.();
    };

    node.updateImageSize = function (width, height) {
        if (!width || !height || width <= 0 || height <= 0) {
            return;
        }

        this.properties.imageWidth = width;
        this.properties.imageHeight = height;

        const widthWidget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_WIDTH);
        const heightWidget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_HEIGHT);
        if (widthWidget) widthWidget.value = width;
        if (heightWidget) heightWidget.value = height;

        const maxDisplaySize = 500;
        const scale = Math.min(
            maxDisplaySize / width,
            maxDisplaySize / height,
            1.0
        );

        const displayWidth = Math.max(300, Math.min(width * scale + shiftRight + shiftLeft, 800));
        const displayHeight = Math.max(300, Math.min(height * scale + shiftLeft * 2 + panelHeight, 800));

        this.size = [displayWidth, displayHeight];

        this.updateThisNodeGraph?.();
    };

    node.onDrawForeground = function (ctx) {
        if (this.flags.collapsed) {
            return false;
        }

        const canvasWidth = this.properties.imageWidth || 512;
        const canvasHeight = this.properties.imageHeight || 512;

        const panelY = shiftLeft;
        ctx.fillStyle = "rgba(40,40,40,0.9)";
        ctx.beginPath();
        ctx.roundRect(shiftLeft - 4, panelY - 4, this.size[0] - shiftRight - shiftLeft + 8, panelHeight, 4);
        ctx.fill();

        ctx.strokeStyle = "rgba(100,100,100,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(shiftLeft - 4, panelY - 4, this.size[0] - shiftRight - shiftLeft + 8, panelHeight);

        let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
        let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft - panelHeight;

        const scaleX = canvasAreaWidth / canvasWidth;
        const scaleY = canvasAreaHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledHeight) / 2;

        ctx.fillStyle = "rgba(20,20,20,0.8)";
        ctx.beginPath();
        ctx.roundRect(offsetX - 4, offsetY - 4, scaledWidth + 8, scaledHeight + 8, 4);
        ctx.fill();

        if (this.properties.backgroundImageObj && this.properties.backgroundImageObj.complete) {
            try {
                ctx.drawImage(
                    this.properties.backgroundImageObj,
                    offsetX,
                    offsetY,
                    scaledWidth,
                    scaledHeight
                );
            } catch (e) {
                console.error("Error drawing background image:", e);
                ctx.fillStyle = "rgba(100,100,100,0.3)";
                ctx.fillRect(offsetX, offsetY, scaledWidth, scaledHeight);
            }
        } else {
            ctx.fillStyle = "rgba(100,100,100,0.3)";
            ctx.fillRect(offsetX, offsetY, scaledWidth, scaledHeight);
            ctx.strokeStyle = "rgba(150,150,150,0.2)";
            ctx.lineWidth = 1;
            const gridSize = 32;
            const gridScale = gridSize * scale;

            for (let x = offsetX; x <= offsetX + scaledWidth; x += gridScale) {
                ctx.beginPath();
                ctx.moveTo(x, offsetY);
                ctx.lineTo(x, offsetY + scaledHeight);
                ctx.stroke();
            }

            for (let y = offsetY; y <= offsetY + scaledHeight; y += gridScale) {
                ctx.beginPath();
                ctx.moveTo(offsetX, y);
                ctx.lineTo(offsetX + scaledWidth, y);
                ctx.stroke();
            }
        }

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (const pathObj of this.properties.brushPaths) {
            const path = pathObj.points || pathObj;
            const mode = pathObj.mode || "brush";
            const pathSize = pathObj.size !== undefined ? pathObj.size : this.properties.brushSize;
            const pathOpacity = pathObj.opacity !== undefined ? pathObj.opacity : this.properties.brushOpacity;

            if (mode === "erase" || path.length < 2) continue;

            const pathColor = this.properties.brushColor || "255,255,255";
            const rgb = pathColor.split(",").map(c => parseInt(c.trim()));

            ctx.lineWidth = pathSize * scale;
            ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${pathOpacity})`;
            ctx.beginPath();
            for (let i = 0; i < path.length; i++) {
                const x = offsetX + path[i].x * scale;
                const y = offsetY + path[i].y * scale;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        ctx.globalCompositeOperation = "source-over";
        for (const pathObj of this.properties.brushPaths) {
            const path = pathObj.points || pathObj;
            const mode = pathObj.mode || "brush";
            const pathSize = pathObj.size !== undefined ? pathObj.size : this.properties.brushSize;
            const pathOpacity = pathObj.opacity !== undefined ? pathObj.opacity : this.properties.brushOpacity;

            if (mode !== "erase" || path.length < 2) continue;

            const pathColor = this.properties.eraserColor || "255,50,50";
            const rgb = pathColor.split(",").map(c => parseInt(c.trim()));

            ctx.lineWidth = pathSize * scale;
            ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${pathOpacity})`;
            ctx.beginPath();
            for (let i = 0; i < path.length; i++) {
                const x = offsetX + path[i].x * scale;
                const y = offsetY + path[i].y * scale;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        if (this.properties.currentPath.length > 1) {
            ctx.globalCompositeOperation = "source-over";
            ctx.lineWidth = this.properties.brushSize * scale;

            let currentColor = this.properties.brushMode === "erase"
                ? this.properties.eraserColor
                : this.properties.brushColor;
            if (!currentColor) {
                currentColor = this.properties.brushMode === "erase" ? "255,50,50" : "255,255,255";
            }
            const rgb = currentColor.split(",").map(c => parseInt(c.trim()));

            ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${this.properties.brushOpacity})`;
            ctx.beginPath();
            for (let i = 0; i < this.properties.currentPath.length; i++) {
                const x = offsetX + this.properties.currentPath[i].x * scale;
                const y = offsetY + this.properties.currentPath[i].y * scale;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
        ctx.font = `${fontsize}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(`${canvasWidth}×${canvasHeight}`, this.size[0] / 2, offsetY + scaledHeight + 15);

        for (const button of this.properties.buttons) {
            if (button.isToggle && button.text === "Eraser") {
                ctx.fillStyle = this.properties.brushMode === "erase"
                    ? "rgba(255,100,100,0.8)"
                    : "rgba(60,60,60,0.7)";
            } else {
                ctx.fillStyle = "rgba(60,60,60,0.7)";
            }
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

        for (const slider of this.properties.sliders) {
            if (slider.type === "size") {
                slider.value = this.properties.brushSize;
            } else if (slider.type === "opacity") {
                slider.value = this.properties.brushOpacity;
            }

            const ratio = (slider.value - slider.min) / (slider.max - slider.min);
            const sliderX = slider.x;
            const sliderY = slider.y;
            const sliderWidth = slider.width;
            const sliderHeight = slider.height;
            const thumbSize = 14;
            const thumbX = sliderX + ratio * (sliderWidth - thumbSize);
            const thumbY = sliderY - 1;

            ctx.fillStyle = "rgba(50,50,50,0.8)";
            ctx.fillRect(sliderX, sliderY, sliderWidth, sliderHeight);

            ctx.strokeStyle = "rgba(100,100,100,0.6)";
            ctx.lineWidth = 1;
            ctx.strokeRect(sliderX, sliderY, sliderWidth, sliderHeight);

            ctx.fillStyle = "rgba(100,150,255,0.4)";
            ctx.fillRect(sliderX, sliderY, ratio * sliderWidth, sliderHeight);

            ctx.fillStyle = "rgba(120,170,255,0.9)";
            ctx.beginPath();
            ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize + 2, 2);
            ctx.fill();

            ctx.strokeStyle = "rgba(150,200,255,1.0)";
            ctx.lineWidth = 1;
            ctx.strokeRect(thumbX, thumbY, thumbSize, thumbSize + 2);

            ctx.fillStyle = "rgba(200,200,200,0.9)";
            ctx.font = "11px Arial";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            const valueText = slider.type === "size"
                ? `${slider.label}: ${Math.round(slider.value)}`
                : `${slider.label}: ${Math.round(slider.value * 100)}%`;
            ctx.fillText(valueText, sliderX, sliderY + sliderHeight + 2);
        }

        if (this.properties.colorButtonGroup) {
            const groupX = this.properties.colorButtonGroup.x;
            const groupY = this.properties.colorButtonGroup.y;
            const groupWidth = this.properties.colorButtonGroup.width;

            ctx.strokeStyle = "rgba(150,150,150,0.8)";
            ctx.lineWidth = 1;
            ctx.strokeRect(groupX, groupY, groupWidth, this.properties.colorButtonGroup.height);

            for (const colorBtn of this.properties.colorButtonGroup.buttons) {
                const btnX = groupX;
                const btnY = groupY + colorBtn.y;
                const btnWidth = groupWidth;
                const btnHeight = colorBtn.height;

                if (colorBtn.type === "brush") {
                    colorBtn.color = this.properties.brushColor || "255,255,255";
                } else if (colorBtn.type === "eraser") {
                    colorBtn.color = this.properties.eraserColor || "255,50,50";
                }

                const rgb = colorBtn.color.split(",").map(c => parseInt(c.trim()));

                ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`;
                ctx.fillRect(btnX, btnY, btnWidth, btnHeight);

                ctx.strokeStyle = "rgba(150,150,150,0.6)";
                ctx.lineWidth = 1;
                ctx.strokeRect(btnX, btnY, btnWidth, btnHeight);

                ctx.fillStyle = "rgba(80,80,80,0.9)";
                ctx.font = "10px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillText(colorBtn.label, btnX + btnWidth / 2, btnY + 1);
            }
        }

        syncBrushDataWidget(this);
    };
}

export function syncBrushDataWidget(node) {
    const brushDataStrings = (node.properties.brushPaths || []).map(pathObj => {
        const path = pathObj.points || pathObj;
        const mode = pathObj.mode || "brush";
        const size = pathObj.size !== undefined ? pathObj.size : node.properties.brushSize;
        const opacity = pathObj.opacity !== undefined ? pathObj.opacity : node.properties.brushOpacity;
        const pointsStr = path.map(p => `${p.x},${p.y}`).join(";");
        return `${mode}:${size}:${opacity}:${pointsStr}`;
    });

    const brushDataWidget = node.widgets.find(w => w.name === WIDGET_NAMES.BRUSH_DATA) || node.widgets[2];
    if (brushDataWidget) {
        brushDataWidget.value = brushDataStrings.join("|");
    }
}

function setupHiddenWidgets(node) {
    const brushDataWidget = node.widgets.find(w => w.name === WIDGET_NAMES.BRUSH_DATA);
    if (brushDataWidget) {
        brushDataWidget.hidden = true;
    }

    const brushSizeWidget = node.widgets.find(w => w.name === WIDGET_NAMES.BRUSH_SIZE);
    if (brushSizeWidget) {
        brushSizeWidget.hidden = false;
    }

    let widthWidget = node.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_WIDTH);
    let heightWidget = node.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_HEIGHT);
    let imageBase64Widget = node.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_BASE64);

    if (!widthWidget) {
        widthWidget = node.addWidget("number", WIDGET_NAMES.IMAGE_WIDTH, 512, () => { }, { min: 64, max: 4096 });
        widthWidget.hidden = true;
    }
    if (!heightWidget) {
        heightWidget = node.addWidget("number", WIDGET_NAMES.IMAGE_HEIGHT, 512, () => { }, { min: 64, max: 4096 });
        heightWidget.hidden = true;
    }
    if (!imageBase64Widget) {
        imageBase64Widget = node.addWidget("text", WIDGET_NAMES.IMAGE_BASE64, "", () => { });
    }
    if (imageBase64Widget) {
        imageBase64Widget.hidden = true;
    }

    node.properties.backgroundImageObj = null;
    node.properties.imageBase64Data = "";
}

function parseStroke(stroke) {
    let mode = "brush";
    let size = 20;
    let opacity = 1.0;
    let pointsStr = stroke;

    if (stroke.includes(":")) {
        const parts = stroke.split(":");
        if (parts.length >= 2) {
            if (parts[0] === "brush" || parts[0] === "erase") {
                mode = parts[0];
                if (parts.length >= 4) {
                    const part3 = parts[3];
                    if (part3 && part3.includes(",") && part3.split(",").length === 3) {
                        try {
                            const colorParts = part3.split(",");
                            const r = parseInt(colorParts[0]);
                            const g = parseInt(colorParts[1]);
                            const b = parseInt(colorParts[2]);
                            if (isValidRGB(r, g, b)) {
                                size = parseFloat(parts[1]) || 20;
                                opacity = parseFloat(parts[2]) || 1.0;
                                pointsStr = parts.slice(4).join(":");
                            } else {
                                size = parseFloat(parts[1]) || 20;
                                opacity = parseFloat(parts[2]) || 1.0;
                                pointsStr = parts.slice(3).join(":");
                            }
                        } catch {
                            size = parseFloat(parts[1]) || 20;
                            opacity = parseFloat(parts[2]) || 1.0;
                            pointsStr = parts.slice(3).join(":");
                        }
                    } else {
                        size = parseFloat(parts[1]) || 20;
                        opacity = parseFloat(parts[2]) || 1.0;
                        pointsStr = parts.slice(3).join(":");
                    }
                } else {
                    pointsStr = parts.slice(1).join(":");
                }
            }
        }
    }

    const points = pointsStr.split(";");
    const path = [];
    for (const point of points) {
        if (!point.trim()) continue;
        const coords = point.split(",");
        if (coords.length === 2) {
            path.push({
                x: parseFloat(coords[0]),
                y: parseFloat(coords[1])
            });
        }
    }

    return {
        points: path,
        mode,
        size,
        opacity
    };
}

function isValidRGB(r, g, b) {
    return [r, g, b].every(v => Number.isFinite(v) && v >= 0 && v <= 255);
}

