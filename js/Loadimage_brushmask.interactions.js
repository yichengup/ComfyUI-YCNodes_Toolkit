import { syncBrushDataWidget, WIDGET_NAMES } from "./Loadimage_brushmask.ui.js";

export function initInteractionBindings(node, state) {
    const { shiftLeft, shiftRight, panelHeight } = state.layout;

    node.onMouseDown = function (e) {
        if (e.canvasY - this.pos[1] < 0) {
            return false;
        }

        const mouseX = e.canvasX - this.pos[0];
        const mouseY = e.canvasY - this.pos[1];

        if (mouseY >= shiftLeft && mouseY <= shiftLeft + panelHeight) {
            for (const slider of this.properties.sliders) {
                const sliderX = slider.x;
                const sliderY = slider.y;
                const sliderWidth = slider.width;
                const sliderHeight = slider.height;

                if (mouseX >= sliderX && mouseX <= sliderX + sliderWidth &&
                    mouseY >= sliderY - 5 && mouseY <= sliderY + sliderHeight + 15) {
                    slider.dragging = true;
                    this.updateSliderValue(slider, mouseX);
                    this.capture = true;
                    this.captureInput(true);
                    return true;
                }
            }

            if (this.properties.colorButtonGroup) {
                const groupX = this.properties.colorButtonGroup.x;
                const groupY = this.properties.colorButtonGroup.y;
                const groupWidth = this.properties.colorButtonGroup.width;
                const groupHeight = this.properties.colorButtonGroup.height;

                if (mouseX >= groupX && mouseX <= groupX + groupWidth &&
                    mouseY >= groupY && mouseY <= groupY + groupHeight) {
                    for (const colorBtn of this.properties.colorButtonGroup.buttons) {
                        const btnY = groupY + colorBtn.y;
                        const btnHeight = colorBtn.height;
                        if (mouseY >= btnY && mouseY <= btnY + btnHeight) {
                            this.openColorPicker(colorBtn.type);
                            return true;
                        }
                    }
                }
            }

            for (const button of this.properties.buttons) {
                if (button.action && mouseX >= button.x && mouseX <= button.x + button.width &&
                    mouseY >= button.y && mouseY <= button.y + button.height) {
                    button.action();
                    return true;
                }
            }
            return false;
        }

        const canvasWidth = this.properties.imageWidth || 512;
        const canvasHeight = this.properties.imageHeight || 512;
        let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
        let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft - panelHeight;

        const scaleX = canvasAreaWidth / canvasWidth;
        const scaleY = canvasAreaHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledHeight) / 2;

        if (e.canvasX < this.pos[0] + offsetX ||
            e.canvasX > this.pos[0] + offsetX + scaledWidth) return false;
        if (e.canvasY < this.pos[1] + offsetY ||
            e.canvasY > this.pos[1] + offsetY + scaledHeight) return false;

        if (e.button === 0) {
            let localX = e.canvasX - this.pos[0] - offsetX;
            let localY = e.canvasY - this.pos[1] - offsetY;

            let realX = localX / scale;
            let realY = localY / scale;

            realX = Math.max(0, Math.min(realX, canvasWidth - 1));
            realY = Math.max(0, Math.min(realY, canvasHeight - 1));

            this.properties.isDrawing = true;
            this.properties.currentPath = [{ x: realX, y: realY }];

            this.capture = true;
            this.captureInput(true);
            return true;
        }

        return false;
    };

    node.onMouseMove = function (e, _pos, canvas) {
        if (!this.capture) {
            return;
        }

        let isDraggingSlider = false;
        for (const slider of this.properties.sliders) {
            if (slider.dragging) {
                const sliderMouseX = e.canvasX - this.pos[0];
                this.updateSliderValue(slider, sliderMouseX);
                isDraggingSlider = true;
                break;
            }
        }

        if (isDraggingSlider) {
            return;
        }

        if (!this.properties.isDrawing) {
            return;
        }

        if (canvas.pointer.isDown === false) {
            this.onMouseUp(e);
            return;
        }
        this.valueUpdate(e);
    };

    node.updateSliderValue = function (slider, mouseX) {
        const sliderX = slider.x;
        const sliderWidth = slider.width;
        const thumbSize = 14;

        let ratio = (mouseX - sliderX - thumbSize / 2) / (sliderWidth - thumbSize);
        ratio = Math.max(0, Math.min(1, ratio));

        const newValue = slider.min + ratio * (slider.max - slider.min);

        if (slider.type === "size") {
            this.properties.brushSize = Math.round(newValue);
            slider.value = this.properties.brushSize;
            const brushSizeWidget = this.widgets.find(w => w.name === WIDGET_NAMES.BRUSH_SIZE);
            if (brushSizeWidget) {
                brushSizeWidget.value = this.properties.brushSize;
            }
        } else if (slider.type === "opacity") {
            this.properties.brushOpacity = Math.round(newValue * 100) / 100;
            slider.value = this.properties.brushOpacity;
        }

        this.updateThisNodeGraph?.();
    };

    node.valueUpdate = function (e) {
        if (!this.properties.isDrawing) {
            return;
        }

        const canvasWidth = this.properties.imageWidth || 512;
        const canvasHeight = this.properties.imageHeight || 512;
        let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
        let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft - panelHeight;

        const scaleX = canvasAreaWidth / canvasWidth;
        const scaleY = canvasAreaHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledHeight) / 2;

        let mouseX = e.canvasX - this.pos[0] - offsetX;
        let mouseY = e.canvasY - this.pos[1] - offsetY;

        let realX = mouseX / scale;
        let realY = mouseY / scale;

        realX = Math.max(0, Math.min(realX, canvasWidth - 1));
        realY = Math.max(0, Math.min(realY, canvasHeight - 1));

        const lastPoint = this.properties.currentPath[this.properties.currentPath.length - 1];
        const dist = Math.sqrt(
            Math.pow(realX - lastPoint.x, 2) +
            Math.pow(realY - lastPoint.y, 2)
        );

        if (dist > 1) {
            this.properties.currentPath.push({ x: realX, y: realY });
            this.updateThisNodeGraph?.();
        }
    };

    node.onMouseUp = function () {
        if (!this.capture) {
            return;
        }

        for (const slider of this.properties.sliders) {
            if (slider.dragging) {
                slider.dragging = false;
                this.capture = false;
                this.captureInput(false);
                return;
            }
        }

        if (this.properties.isDrawing && this.properties.currentPath.length > 0) {
            this.properties.brushPaths.push({
                points: [...this.properties.currentPath],
                mode: this.properties.brushMode,
                size: this.properties.brushSize,
                opacity: this.properties.brushOpacity
            });
            this.properties.currentPath = [];
            syncBrushDataWidget(this);
        }

        this.properties.isDrawing = false;
        this.capture = false;
        this.captureInput(false);
        this.updateThisNodeGraph?.();
    };

    node.onSelected = function () {
        this.onMouseUp();
    };

    const originalOnConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function (type, slot, isInput, link, info) {
        if (originalOnConnectionsChange) {
            originalOnConnectionsChange.apply(this, arguments);
        }

        if (isInput && slot === 0 && type === 1) {
            setTimeout(() => { }, 100);
        }
    };

    const originalOnAfterExecuteNode = node.onAfterExecuteNode;
    node.onAfterExecuteNode = function (message) {
        if (originalOnAfterExecuteNode) {
            originalOnAfterExecuteNode.apply(this, arguments);
        }
        return message;
    };

    const originalOnWidgetChange = node.onWidgetChange;
    node.onWidgetChange = function (widget) {
        if (originalOnWidgetChange) {
            originalOnWidgetChange.apply(this, arguments);
        }

        if (!widget) {
            return;
        }

        if (widget.name === WIDGET_NAMES.BRUSH_SIZE) {
            this.properties.brushSize = widget.value || 80;
            this.updateThisNodeGraph?.();
        }

        if (widget.name === WIDGET_NAMES.IMAGE_WIDTH || widget.name === WIDGET_NAMES.IMAGE_HEIGHT) {
            const widthWidget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_WIDTH);
            const heightWidget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_HEIGHT);
            if (widthWidget && heightWidget && widthWidget.value && heightWidget.value) {
                this.updateImageSize(widthWidget.value, heightWidget.value);
            }
        }

        if (widget.name === WIDGET_NAMES.IMAGE_BASE64) {
            if (widget.value) {
                this.properties.imageBase64Data = widget.value;
                this.loadBackgroundImageFromBase64(widget.value);
            } else {
                this.properties.backgroundImageObj = null;
                this.properties.imageBase64Data = "";
                this.updateThisNodeGraph?.();
            }
        }
    };

    node.loadImageFromFile = function () {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const dataURL = event.target.result;
                    let base64String = dataURL;
                    if (dataURL.includes(",")) {
                        base64String = dataURL.split(",")[1];
                    }

                    this.properties.imageBase64Data = base64String;

                    const imageBase64Widget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_BASE64);
                    if (imageBase64Widget) {
                        imageBase64Widget.value = base64String;
                    }

                    this.loadBackgroundImageFromBase64(dataURL);

                    this.properties.brushPaths = [];
                    this.properties.currentPath = [];

                    console.log("Image loaded successfully, size:", base64String.length, "bytes");
                } catch (err) {
                    console.error("Error processing image file:", err);
                    alert("加载图片失败: " + err.message);
                }
            };
            reader.onerror = err => {
                console.error("Error reading file:", err);
                alert("读取文件失败");
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    node.openColorPicker = function (type) {
        let currentColor = type === "eraser" ? this.properties.eraserColor : this.properties.brushColor;
        if (!currentColor) {
            currentColor = type === "eraser" ? "255,50,50" : "255,255,255";
        }

        const rgb = currentColor.split(",").map(c => parseInt(c.trim()));
        const hexColor = "#" + rgb.map(c => {
            const hex = c.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join("");

        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = hexColor;
        colorInput.style.position = "fixed";
        colorInput.style.left = "-9999px";
        document.body.appendChild(colorInput);

        colorInput.onchange = e => {
            const hex = e.target.value;
            const r = parseInt(hex.substr(1, 2), 16);
            const g = parseInt(hex.substr(3, 2), 16);
            const b = parseInt(hex.substr(5, 2), 16);
            const rgbColor = `${r},${g},${b}`;

            if (type === "eraser") {
                this.properties.eraserColor = rgbColor;
            } else {
                this.properties.brushColor = rgbColor;
            }

            if (this.properties.colorButtonGroup?.buttons) {
                for (const colorBtn of this.properties.colorButtonGroup.buttons) {
                    if (colorBtn.type === type) {
                        colorBtn.color = rgbColor;
                    }
                }
            }

            this.updateThisNodeGraph?.();
            document.body.removeChild(colorInput);
        };

        colorInput.onblur = () => {
            setTimeout(() => {
                if (document.body.contains(colorInput)) {
                    document.body.removeChild(colorInput);
                }
            }, 100);
        };

        colorInput.click();
    };

    node.loadBackgroundImageFromBase64 = function (base64String) {
        if (!base64String || base64String.trim() === "") {
            this.properties.backgroundImageObj = null;
            this.updateThisNodeGraph?.();
            return;
        }

        try {
            const img = new Image();
            img.onload = () => {
                this.properties.backgroundImageObj = img;
                this.updateImageSize(img.width, img.height);
                this.updateThisNodeGraph?.();
            };
            img.onerror = err => {
                console.error("Error loading background image from base64:", err);
                this.properties.backgroundImageObj = null;
            };
            if (base64String.startsWith("data:")) {
                img.src = base64String;
            } else {
                img.src = "data:image/png;base64," + base64String;
            }
        } catch (err) {
            console.error("Error creating image from base64:", err);
            this.properties.backgroundImageObj = null;
        }
    };

    // 拖拽功能：支持从桌面拖拽图像到画布
    node.onDragOver = function (e) {
        // 检查是否在画布区域内
        const mouseX = e.canvasX - this.pos[0];
        const mouseY = e.canvasY - this.pos[1];

        const canvasWidth = this.properties.imageWidth || 512;
        const canvasHeight = this.properties.imageHeight || 512;
        let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
        let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft - panelHeight;

        const scaleX = canvasAreaWidth / canvasWidth;
        const scaleY = canvasAreaHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledHeight) / 2;

        // 判断鼠标是否在画布区域内
        if (mouseX >= offsetX && mouseX <= offsetX + scaledWidth &&
            mouseY >= offsetY && mouseY <= offsetY + scaledHeight) {

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
    node.onDragDrop = function (e) {
        console.log("onDragDrop triggered", e);

        // 检查是否在画布区域内
        const mouseX = e.canvasX - this.pos[0];
        const mouseY = e.canvasY - this.pos[1];

        const canvasWidth = this.properties.imageWidth || 512;
        const canvasHeight = this.properties.imageHeight || 512;
        let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
        let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft - panelHeight;

        const scaleX = canvasAreaWidth / canvasWidth;
        const scaleY = canvasAreaHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledHeight) / 2;

        // 判断鼠标是否在画布区域内
        if (mouseX < offsetX || mouseX > offsetX + scaledWidth ||
            mouseY < offsetY || mouseY > offsetY + scaledHeight) {
            console.log("Drop outside canvas area");
            return false;
        }

        // 处理拖拽的文件
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            console.log("File dropped:", file.name, file.type);

            // 检查是否是图像文件
            if (!file.type.startsWith('image/')) {
                console.warn('Only image files are supported');
                return false;
            }

            // 读取文件并转换为 base64
            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const dataURL = event.target.result;
                    let base64String = dataURL;
                    if (dataURL.includes(",")) {
                        base64String = dataURL.split(",")[1];
                    }

                    this.properties.imageBase64Data = base64String;

                    const imageBase64Widget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_BASE64);
                    if (imageBase64Widget) {
                        imageBase64Widget.value = base64String;
                    }

                    this.loadBackgroundImageFromBase64(dataURL);

                    // 清空画笔路径
                    this.properties.brushPaths = [];
                    this.properties.currentPath = [];

                    console.log("Image loaded from drag & drop, size:", base64String.length, "bytes");
                } catch (err) {
                    console.error("Error processing dropped image:", err);
                    alert("加载图片失败: " + err.message);
                }
            };
            reader.onerror = err => {
                console.error("Error reading dropped file:", err);
                alert("读取文件失败");
            };
            reader.readAsDataURL(file);

            e.preventDefault();
            e.stopPropagation();
            return true;  // 返回 true 表示已处理
        }

        console.log("No files in drop event");
        return false;
    };
}
