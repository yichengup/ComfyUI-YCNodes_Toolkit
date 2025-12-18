// author.yichengup.CanvasMask 2025.01.XX
import { app } from "../../scripts/app.js";

class ycCanvasMask
{
    constructor(node)
    {
        this.node = node;
        // 初始化属性
        this.node.properties = { 
            masks: [], // 存储多个mask区域，格式为[{x, y, width, height}, ...]
            selectedMask: -1, // 当前选中的mask索引
            dragMode: null, // 拖动模式: "move", "resize-tl", "resize-tr", "resize-bl", "resize-br"
            snap: true,
            grid: true, // 网格一直显示
            minSize: 10,
            gridSize: 32
        };

        // 设置节点大小
        this.node.size = [450, 450];
        const fontsize = LiteGraph.NODE_SUBTEXT_SIZE;
        const shiftLeft = 10;
        const shiftRight = 80;
        const panelHeight = 60; // 控制面板高度（两行按钮）

        // 隐藏默认小部件
        for (let i = 0; i < this.node.widgets.length; i++) { 
            this.node.widgets[i].hidden = true; 
            this.node.widgets[i].type = "hidden"; 
        }

        // 初始化按钮函数
        this.node.initButtons = function() {
            // 设置输出名称
            this.outputs[0].name = this.outputs[0].localized_name = "mask_1";
            this.outputs[1].name = this.outputs[1].localized_name = "mask_2";
            this.outputs[2].name = this.outputs[2].localized_name = "mask_3";
            this.outputs[3].name = this.outputs[3].localized_name = "mask_4";
            this.outputs[4].name = this.outputs[4].localized_name = "mask_5";
            this.outputs[5].name = this.outputs[5].localized_name = "mask_6";
            this.outputs[6].name = this.outputs[6].localized_name = "mask_7";
            this.outputs[7].name = this.outputs[7].localized_name = "mask_8";
            this.outputs[8].name = this.outputs[8].localized_name = "mask_9";
            this.outputs[9].name = this.outputs[9].localized_name = "mask_10";
            this.outputs[10].name = this.outputs[10].localized_name = "mask_batch";
            this.outputs[11].name = this.outputs[11].localized_name = "width";
            this.outputs[12].name = this.outputs[12].localized_name = "height";

            this.widgets_start_y = -4.8e8 * LiteGraph.NODE_SLOT_HEIGHT;

            // 初始化画布尺寸
            if (!this.widgets[0].value) this.widgets[0].value = 512;
            if (!this.widgets[1].value) this.widgets[1].value = 512;
            // 初始化网格间距（下限为8，避免浏览器卡顿）
            if (!this.properties.gridSize) {
                this.properties.gridSize = 32;
            } else if (this.properties.gridSize < 8) {
                this.properties.gridSize = 8;
            }

            // 定义按钮区域（在节点上方）
            const buttonY = 8;
            const buttonRow2Y = buttonY + 21 + 5; // 第二行按钮位置
            const buttonHeight = 21;
            const buttonSpacing = 5;
            let buttonX = 10;
            const buttonWidth = 66;

            this.properties.buttons = [
                {
                    text: "Set Size",
                    x: buttonX,
                    y: buttonY,
                    width: buttonWidth,
                    height: buttonHeight,
                    action: () => {
                        const canvasWidth = this.widgets[0].value || 512;
                        const canvasHeight = this.widgets[1].value || 512;

                        const newWidth = prompt("请输入画布宽度 (64-4096):", canvasWidth);
                        if (newWidth !== null && !isNaN(newWidth)) {
                            const width = parseInt(newWidth);
                            if (width >= 64 && width <= 4096) {
                                this.widgets[0].value = width;

                                // 调整所有mask以适应新画布尺寸
                                const scaleFactor = width / canvasWidth;
                                for (let mask of this.properties.masks) {
                                    mask.x = Math.round(mask.x * scaleFactor);
                                    mask.width = Math.round(mask.width * scaleFactor);
                                }
                            } else {
                                alert("宽度必须在64到4096之间");
                            }
                        }

                        const newHeight = prompt("请输入画布高度 (64-4096):", canvasHeight);
                        if (newHeight !== null && !isNaN(newHeight)) {
                            const height = parseInt(newHeight);
                            if (height >= 64 && height <= 4096) {
                                this.widgets[1].value = height;

                                // 调整所有mask以适应新画布尺寸
                                const scaleFactor = height / canvasHeight;
                                for (let mask of this.properties.masks) {
                                    mask.y = Math.round(mask.y * scaleFactor);
                                    mask.height = Math.round(mask.height * scaleFactor);
                                }
                            } else {
                                alert("高度必须在64到4096之间");
                            }
                        }

                        this.updateThisNodeGraph?.();
                    }
                },
                {
                    text: "Add Mask",
                    x: (buttonX += buttonWidth + buttonSpacing),
                    y: buttonY,
                    width: buttonWidth,
                    height: buttonHeight,
                    action: () => {
                        const canvasWidth = this.widgets[0].value || 512;
                        const canvasHeight = this.widgets[1].value || 512;

                        // 添加默认大小的mask区域
                        this.properties.masks.push({
                            x: Math.round(canvasWidth / 2 - 50),
                            y: Math.round(canvasHeight / 2 - 50),
                            width: 100,
                            height: 100
                        });

                        // 选中新添加的mask
                        this.properties.selectedMask = this.properties.masks.length - 1;
                        this.updateThisNodeGraph?.();
                    }
                },
                {
                    text: "Del Mask",
                    x: (buttonX += buttonWidth + buttonSpacing),
                    y: buttonY,
                    width: buttonWidth,
                    height: buttonHeight,
                    action: () => {
                        if (this.properties.selectedMask >= 0 && this.properties.selectedMask < this.properties.masks.length) {
                            this.properties.masks.splice(this.properties.selectedMask, 1);
                            if (this.properties.selectedMask >= this.properties.masks.length) {
                                this.properties.selectedMask = this.properties.masks.length - 1;
                            }
                            this.updateThisNodeGraph?.();
                        } else {
                            alert("没有选中的Mask可删除");
                        }
                    }
                }
            ];

            // 定义网格间距调整滑块（放在第二行，网格一直显示）
            // 确保网格间距至少为8，避免浏览器卡顿
            if (this.properties.gridSize && this.properties.gridSize < 8) {
                this.properties.gridSize = 8;
            }
            this.properties.gridSlider = {
                x: 10,
                y: buttonRow2Y,
                width: 130, // 滑块宽度
                height: buttonHeight,
                dragging: false, // 用于拖拽调整网格间距
                min: 8, // 下限设为8，避免浏览器卡顿
                max: 256,
            };
        };

        // 节点初始化
        this.node.onAdded = function () {
            // 调用初始化按钮函数
            this.initButtons();
        };

        // 节点配置
        this.node.onConfigure = function () {
            // 从字符串中解析mask数据 - 格式为 "x1,y1,w1,h1;x2,y2,w2,h2;..."
            this.properties.masks = [];
            if (this.widgets[2] && this.widgets[2].value) {
                try {
                    const maskData = this.widgets[2].value;
                    const maskParts = maskData.split(';');
                    for (const part of maskParts) {
                        if (part.trim()) {
                            const coords = part.split(',');
                            if (coords.length === 4) {
                                this.properties.masks.push({
                                    x: parseInt(coords[0]),
                                    y: parseInt(coords[1]),
                                    width: parseInt(coords[2]),
                                    height: parseInt(coords[3])
                                });
                            }
                        }
                    }
                } catch (e) {
                    this.properties.masks = [];
                }
            }

            // 确保画布尺寸有效
            if (!this.widgets[0].value || this.widgets[0].value < 64 || this.widgets[0].value > 4096) {
                this.widgets[0].value = 512;
            }
            if (!this.widgets[1].value || this.widgets[1].value < 64 || this.widgets[1].value > 4096) {
                this.widgets[1].value = 512;
            }

            // 初始化网格间距（下限为8，避免浏览器卡顿）
            if (!this.properties.gridSize) {
                this.properties.gridSize = 32;
            } else if (this.properties.gridSize < 8) {
                this.properties.gridSize = 8;
            }

            // 确保所有mask在画布范围内
            const canvasWidth = this.widgets[0].value || 512;
            const canvasHeight = this.widgets[1].value || 512;

            for (let mask of this.properties.masks) {
                // 确保mask在画布内
                if (mask.x < 0) mask.x = 0;
                if (mask.y < 0) mask.y = 0;
                if (mask.width < this.properties.minSize) mask.width = this.properties.minSize;
                if (mask.height < this.properties.minSize) mask.height = this.properties.minSize;

                // 如果mask超出画布，调整大小和位置
                if (mask.x + mask.width > canvasWidth) {
                    if (mask.x > canvasWidth) {
                        mask.x = canvasWidth - this.properties.minSize;
                        mask.width = this.properties.minSize;
                    } else {
                        mask.width = canvasWidth - mask.x;
                    }
                }

                if (mask.y + mask.height > canvasHeight) {
                    if (mask.y > canvasHeight) {
                        mask.y = canvasHeight - this.properties.minSize;
                        mask.height = this.properties.minSize;
                    } else {
                        mask.height = canvasHeight - mask.y;
                    }
                }
            }

            // 确保按钮已初始化 - 无论是否存在都重新初始化，确保刷新后按钮正常工作
            this.initButtons();
        }

        // 绘制前景
        this.node.onDrawForeground = function(ctx) {
            if (this.flags.collapsed) return false;

            // 同步网格间距参数（实时更新）
            if (this.widgets[3] && this.widgets[3].value) {
                this.properties.gridSize = this.widgets[3].value;
            }

            // 获取画布尺寸
            const canvasWidth = this.widgets[0].value || 512;
            const canvasHeight = this.widgets[1].value || 512;

            // 计算画布实际绘制位置（为控制面板留出空间）
            const canvasStartY = shiftLeft + panelHeight;

            // 画布背景
            ctx.fillStyle = "rgba(20,20,20,0.8)";
            ctx.beginPath();
            ctx.roundRect(shiftLeft-4, canvasStartY-4, this.size[0]-shiftRight-shiftLeft+8, this.size[1]-canvasStartY-shiftLeft+8, 4);
            ctx.fill();

            // 绘制网格（以画布中心为原点，向四周均匀分布，一直显示）
            {
                ctx.fillStyle = "rgba(200,200,200,0.7)";
                ctx.beginPath();
                let swX = (this.size[0]-shiftRight-shiftLeft);
                let swY = (this.size[1]-canvasStartY-shiftLeft);
                let gridSize = this.properties.gridSize;
                let stX = (swX * gridSize / canvasWidth);
                let stY = (swY * gridSize / canvasHeight);

                // 计算画布中心在显示区域的位置
                let centerX = swX / 2;
                let centerY = swY / 2;

                // 从中心向四周绘制网格点
                // 先绘制中心点
                ctx.rect(shiftLeft + centerX - 0.5, canvasStartY + centerY - 0.5, 1, 1);
                
                // 向四个方向扩展绘制网格点
                for (var i = 1; i * stX <= swX / 2 + stX; i++) {
                    // 水平方向（左右）
                    if (centerX + i * stX <= swX) {
                        ctx.rect(shiftLeft + centerX + i * stX - 0.5, canvasStartY + centerY - 0.5, 1, 1);
                    }
                    if (centerX - i * stX >= 0) {
                        ctx.rect(shiftLeft + centerX - i * stX - 0.5, canvasStartY + centerY - 0.5, 1, 1);
                    }
                }
                
                for (var i = 1; i * stY <= swY / 2 + stY; i++) {
                    // 垂直方向（上下）
                    if (centerY + i * stY <= swY) {
                        ctx.rect(shiftLeft + centerX - 0.5, canvasStartY + centerY + i * stY - 0.5, 1, 1);
                    }
                    if (centerY - i * stY >= 0) {
                        ctx.rect(shiftLeft + centerX - 0.5, canvasStartY + centerY - i * stY - 0.5, 1, 1);
                    }
                }
                
                // 绘制其他网格点（交叉点）
                for (var ix = 1; ix * stX <= swX / 2 + stX; ix++) {
                    for (var iy = 1; iy * stY <= swY / 2 + stY; iy++) {
                        // 四个象限
                        let px1 = centerX + ix * stX;
                        let py1 = centerY + iy * stY;
                        let px2 = centerX - ix * stX;
                        let py2 = centerY + iy * stY;
                        let px3 = centerX + ix * stX;
                        let py3 = centerY - iy * stY;
                        let px4 = centerX - ix * stX;
                        let py4 = centerY - iy * stY;
                        
                        if (px1 <= swX && py1 <= swY) {
                            ctx.rect(shiftLeft + px1 - 0.5, canvasStartY + py1 - 0.5, 1, 1);
                        }
                        if (px2 >= 0 && py2 <= swY) {
                            ctx.rect(shiftLeft + px2 - 0.5, canvasStartY + py2 - 0.5, 1, 1);
                        }
                        if (px3 <= swX && py3 >= 0) {
                            ctx.rect(shiftLeft + px3 - 0.5, canvasStartY + py3 - 0.5, 1, 1);
                        }
                        if (px4 >= 0 && py4 >= 0) {
                            ctx.rect(shiftLeft + px4 - 0.5, canvasStartY + py4 - 0.5, 1, 1);
                        }
                    }
                }
                
                ctx.fill();
            }

            // 计算实际画布区域
            let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
            let canvasAreaHeight = this.size[1] - canvasStartY - shiftLeft;

            // 绘制所有mask区域
            for (let i = 0; i < this.properties.masks.length; i++) {
                const mask = this.properties.masks[i];

                // 计算mask在画布上的位置和大小
                let maskX = shiftLeft + (mask.x / canvasWidth) * canvasAreaWidth;
                let maskY = canvasStartY + (mask.y / canvasHeight) * canvasAreaHeight;
                let maskWidth = (mask.width / canvasWidth) * canvasAreaWidth;
                let maskHeight = (mask.height / canvasHeight) * canvasAreaHeight;

                // 设置颜色 - 选中的mask使用不同的颜色
                if (i === this.properties.selectedMask) {
                    ctx.fillStyle = "rgba(100,200,255,0.3)";
                    ctx.strokeStyle = "rgba(100,200,255,0.9)";
                } else {
                    ctx.fillStyle = "rgba(100,200,255,0.1)";
                    ctx.strokeStyle = "rgba(100,200,255,0.5)";
                }
                ctx.lineWidth = 2;

                // 绘制mask区域
                ctx.beginPath();
                ctx.rect(maskX, maskY, maskWidth, maskHeight);
                ctx.fill();
                ctx.stroke();

                // 绘制mask边角（仅对选中的mask）
                if (i === this.properties.selectedMask) {
                    ctx.fillStyle = "rgba(100,200,255,0.9)";
                    let cornerSize = 6;
                    // 左上角
                    ctx.fillRect(maskX - cornerSize/2, maskY - cornerSize/2, cornerSize, cornerSize);
                    // 右上角
                    ctx.fillRect(maskX + maskWidth - cornerSize/2, maskY - cornerSize/2, cornerSize, cornerSize);
                    // 左下角
                    ctx.fillRect(maskX - cornerSize/2, maskY + maskHeight - cornerSize/2, cornerSize, cornerSize);
                    // 右下角
                    ctx.fillRect(maskX + maskWidth - cornerSize/2, maskY + maskHeight - cornerSize/2, cornerSize, cornerSize);
                }

                // 显示mask编号
                ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
                ctx.font = (fontsize) + "px Arial";
                ctx.textAlign = "left";
                ctx.fillText(`${i+1}`, maskX + 5, maskY + 15);
            }

            // 显示画布尺寸（在控制面板下方）
            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
            ctx.font = (fontsize) + "px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`${canvasWidth}×${canvasHeight}`, this.size[0]/2, canvasStartY - 8);

            // 绘制按钮
            for (let button of this.properties.buttons) {
                // 按钮背景
                ctx.fillStyle = "rgba(60,60,60,0.5)";
                ctx.fillRect(button.x, button.y, button.width, button.height);

                // 按钮边框
                ctx.strokeStyle = "rgba(150,150,150,0.5)";
                ctx.lineWidth = 1;
                ctx.strokeRect(button.x, button.y, button.width, button.height);

                // 按钮文本
                ctx.fillStyle = "rgba(220,220,220,0.8)";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(button.text, button.x + button.width/2, button.y + button.height/2);
            }

            // 绘制网格间距调整滑块
            if (this.properties.gridSlider) {
                const slider = this.properties.gridSlider;
                const gridSize = this.properties.gridSize || 32;
                const sliderX = slider.x;
                const sliderY = slider.y;
                const sliderWidth = slider.width;
                const sliderHeight = slider.height;

                // 滑块背景
                ctx.fillStyle = "rgba(60,60,60,0.5)";
                ctx.fillRect(sliderX, sliderY, sliderWidth, sliderHeight);

                // 滑块边框
                ctx.strokeStyle = "rgba(150,150,150,0.5)";
                ctx.lineWidth = 1;
                ctx.strokeRect(sliderX, sliderY, sliderWidth, sliderHeight);

                // 计算滑块位置（基于当前值）
                const valueRatio = (gridSize - slider.min) / (slider.max - slider.min);
                const thumbX = sliderX + valueRatio * (sliderWidth - 8);
                const thumbWidth = 8;
                const thumbHeight = sliderHeight - 4;

                // 绘制滑块拇指
                ctx.fillStyle = "rgba(100,200,255,0.9)";
                ctx.fillRect(thumbX, sliderY + 2, thumbWidth, thumbHeight);

                // 显示当前值
                ctx.fillStyle = "rgba(220,220,220,0.8)";
                ctx.font = "11px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`Grid: ${gridSize}`, sliderX + sliderWidth/2, sliderY + sliderHeight/2);
            }

            // 更新mask数据字符串 - 使用逗号分隔的格式
            this.widgets[2].value = this.properties.masks.map(mask => 
                `${mask.x},${mask.y},${mask.width},${mask.height}`
            ).join(';');
        }

        // 鼠标按下事件
        this.node.onMouseDown = function(e) {
            if (e.canvasY - this.pos[1] < 0) return false;

            // 检查按钮点击
            const mouseX = e.canvasX - this.pos[0];
            const mouseY = e.canvasY - this.pos[1];

            for (let button of this.properties.buttons) {
                if (mouseX >= button.x && mouseX <= button.x + button.width &&
                    mouseY >= button.y && mouseY <= button.y + button.height) {
                    button.action();
                    return true;
                }
            }

            // 检查网格间距滑块点击
            if (this.properties.gridSlider) {
                const slider = this.properties.gridSlider;
                if (mouseX >= slider.x && mouseX <= slider.x + slider.width &&
                    mouseY >= slider.y && mouseY <= slider.y + slider.height) {
                    slider.dragging = true;
                    this.capture = true;
                    this.captureInput(true);
                    // 更新网格间距值（确保不小于8）
                    const relativeX = mouseX - slider.x;
                    const ratio = Math.max(0, Math.min(1, relativeX / slider.width));
                    const newValue = Math.max(8, Math.round(slider.min + ratio * (slider.max - slider.min)));
                    this.properties.gridSize = newValue;
                    this.updateThisNodeGraph?.();
                    return true;
                }
            }

            // 检查是否点击在画布区域（考虑控制面板高度）
            const canvasStartY = shiftLeft + panelHeight;
            if (e.canvasX < this.pos[0] + shiftLeft - 5 || 
                e.canvasX > this.pos[0] + this.size[0] - shiftRight + 5) return false;
            if (e.canvasY < this.pos[1] + canvasStartY - 5 || 
                e.canvasY > this.pos[1] + this.size[1] - shiftLeft + 5) return false;

            // 右键点击处理 - 仅用于选中mask
            if (e.button === 2) { // 右键
                const canvasWidth = this.widgets[0].value || 512;
                const canvasHeight = this.widgets[1].value || 512;
                const canvasStartY = shiftLeft + panelHeight;
                let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
                let canvasAreaHeight = this.size[1] - canvasStartY - shiftLeft;

                let mouseX = e.canvasX - this.pos[0] - shiftLeft;
                let mouseY = e.canvasY - this.pos[1] - canvasStartY;

                // 检查是否点击在某个mask上
                let clickedMask = -1;
                for (let i = this.properties.masks.length - 1; i >= 0; i--) {
                    const mask = this.properties.masks[i];
                    let maskX = (mask.x / canvasWidth) * canvasAreaWidth;
                    let maskY = (mask.y / canvasHeight) * canvasAreaHeight;
                    let maskWidth = (mask.width / canvasWidth) * canvasAreaWidth;
                    let maskHeight = (mask.height / canvasHeight) * canvasAreaHeight;

                    if (mouseX >= maskX && mouseX <= maskX + maskWidth && 
                        mouseY >= maskY && mouseY <= maskY + maskHeight) {
                        clickedMask = i;
                        break;
                    }
                }

                if (clickedMask >= 0) {
                    // 选中该mask
                    this.properties.selectedMask = clickedMask;
                    this.updateThisNodeGraph?.();
                }

                return true;
            }

            // 左键点击处理
            if (e.button === 0) { // 左键
                const canvasWidth = this.widgets[0].value || 512;
                const canvasHeight = this.widgets[1].value || 512;
                const canvasStartY = shiftLeft + panelHeight;
                let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
                let canvasAreaHeight = this.size[1] - canvasStartY - shiftLeft;

                let mouseX = e.canvasX - this.pos[0] - shiftLeft;
                let mouseY = e.canvasY - this.pos[1] - canvasStartY;

                // 检查是否点击在某个mask上
                let clickedMask = -1;
                for (let i = this.properties.masks.length - 1; i >= 0; i--) {
                    const mask = this.properties.masks[i];
                    let maskX = (mask.x / canvasWidth) * canvasAreaWidth;
                    let maskY = (mask.y / canvasHeight) * canvasAreaHeight;
                    let maskWidth = (mask.width / canvasWidth) * canvasAreaWidth;
                    let maskHeight = (mask.height / canvasHeight) * canvasAreaHeight;

                    if (mouseX >= maskX && mouseX <= maskX + maskWidth && 
                        mouseY >= maskY && mouseY <= maskY + maskHeight) {
                        clickedMask = i;
                        break;
                    }
                }

                if (clickedMask >= 0) {
                    // 选中该mask
                    this.properties.selectedMask = clickedMask;

                    const mask = this.properties.masks[clickedMask];
                    let maskX = (mask.x / canvasWidth) * canvasAreaWidth;
                    let maskY = (mask.y / canvasHeight) * canvasAreaHeight;
                    let maskWidth = (mask.width / canvasWidth) * canvasAreaWidth;
                    let maskHeight = (mask.height / canvasHeight) * canvasAreaHeight;

                    // 检查是否点击了边角
                    let cornerSize = 6;
                    let cornerThreshold = cornerSize + 2;

                    // 左上角
                    if (Math.abs(mouseX - maskX) < cornerThreshold && 
                        Math.abs(mouseY - maskY) < cornerThreshold) {
                        this.dragMode = "resize-tl";
                    } 
                    // 右上角
                    else if (Math.abs(mouseX - (maskX + maskWidth)) < cornerThreshold && 
                             Math.abs(mouseY - maskY) < cornerThreshold) {
                        this.dragMode = "resize-tr";
                    } 
                    // 左下角
                    else if (Math.abs(mouseX - maskX) < cornerThreshold && 
                             Math.abs(mouseY - (maskY + maskHeight)) < cornerThreshold) {
                        this.dragMode = "resize-bl";
                    } 
                    // 右下角
                    else if (Math.abs(mouseX - (maskX + maskWidth)) < cornerThreshold && 
                             Math.abs(mouseY - (maskY + maskHeight)) < cornerThreshold) {
                        this.dragMode = "resize-br";
                    } 
                    // 点击在mask内部
                    else {
                        this.dragMode = "move";
                        this.dragOffsetX = mouseX - maskX;
                        this.dragOffsetY = mouseY - maskY;
                    }

                    this.capture = true;
                    this.captureInput(true);
                    return true;
                }
            }

            return false;
        }

        // 鼠标移动事件
        this.node.onMouseMove = function(e, pos, canvas) {
            if (!this.capture) return;
            if (canvas.pointer.isDown === false) { this.onMouseUp(e); return; }
            this.valueUpdate(e);
        }

        // 更新值
        this.node.valueUpdate = function(e) {
            // 处理网格间距滑块拖拽
            if (this.properties.gridSlider && this.properties.gridSlider.dragging) {
                const mouseX = e.canvasX - this.pos[0];
                const slider = this.properties.gridSlider;
                const sliderX = slider.x;
                const sliderWidth = slider.width;
                const relativeX = mouseX - sliderX;
                const ratio = Math.max(0, Math.min(1, relativeX / sliderWidth));
                const newValue = Math.max(8, Math.round(slider.min + ratio * (slider.max - slider.min)));
                this.properties.gridSize = newValue;
                this.updateThisNodeGraph?.();
                return;
            }

            if (this.properties.selectedMask < 0 || this.properties.selectedMask >= this.properties.masks.length) {
                return;
            }

            const canvasWidth = this.widgets[0].value || 512;
            const canvasHeight = this.widgets[1].value || 512;
            const canvasStartY = shiftLeft + panelHeight;
            let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
            let canvasAreaHeight = this.size[1] - canvasStartY - shiftLeft;

            let mouseX = e.canvasX - this.pos[0] - shiftLeft;
            let mouseY = e.canvasY - this.pos[1] - canvasStartY;

            // 转换为实际坐标
            let realX = (mouseX / canvasAreaWidth) * canvasWidth;
            let realY = (mouseY / canvasAreaHeight) * canvasHeight;

            // 网格对齐（以画布中心为原点）
            if (this.properties.snap) {
                let gridSize = this.properties.gridSize;
                let centerX = canvasWidth / 2;
                let centerY = canvasHeight / 2;
                
                // 计算相对于中心的偏移
                let offsetX = realX - centerX;
                let offsetY = realY - centerY;
                
                // 对齐到网格
                let alignedOffsetX = Math.round(offsetX / gridSize) * gridSize;
                let alignedOffsetY = Math.round(offsetY / gridSize) * gridSize;
                
                // 计算对齐后的绝对坐标
                realX = centerX + alignedOffsetX;
                realY = centerY + alignedOffsetY;
            }

            const mask = this.properties.masks[this.properties.selectedMask];

            if (this.dragMode === "move") {
                // 移动mask
                let newX = realX - (this.dragOffsetX / canvasAreaWidth) * canvasWidth;
                let newY = realY - (this.dragOffsetY / canvasAreaHeight) * canvasHeight;

                // 网格对齐（以画布中心为原点）
                if (this.properties.snap) {
                    let gridSize = this.properties.gridSize;
                    let centerX = canvasWidth / 2;
                    let centerY = canvasHeight / 2;
                    
                    // 计算相对于中心的偏移
                    let offsetX = newX - centerX;
                    let offsetY = newY - centerY;
                    
                    // 对齐到网格
                    let alignedOffsetX = Math.round(offsetX / gridSize) * gridSize;
                    let alignedOffsetY = Math.round(offsetY / gridSize) * gridSize;
                    
                    // 计算对齐后的绝对坐标
                    newX = centerX + alignedOffsetX;
                    newY = centerY + alignedOffsetY;
                }

                // 确保mask在画布内
                newX = Math.max(0, Math.min(newX, canvasWidth - mask.width));
                newY = Math.max(0, Math.min(newY, canvasHeight - mask.height));

                mask.x = newX;
                mask.y = newY;
            } 
            else if (this.dragMode && this.dragMode.startsWith("resize")) {
                // 调整mask大小
                if (this.dragMode === "resize-tl") {
                    let newWidth = mask.x + mask.width - realX;
                    let newHeight = mask.y + mask.height - realY;

                    if (newWidth >= this.properties.minSize) {
                        mask.x = realX;
                        mask.width = newWidth;
                    }

                    if (newHeight >= this.properties.minSize) {
                        mask.y = realY;
                        mask.height = newHeight;
                    }
                } 
                else if (this.dragMode === "resize-tr") {
                    let newWidth = realX - mask.x;
                    let newHeight = mask.y + mask.height - realY;

                    if (newWidth >= this.properties.minSize) {
                        mask.width = newWidth;
                    }

                    if (newHeight >= this.properties.minSize) {
                        mask.y = realY;
                        mask.height = newHeight;
                    }
                } 
                else if (this.dragMode === "resize-bl") {
                    let newWidth = mask.x + mask.width - realX;
                    let newHeight = realY - mask.y;

                    if (newWidth >= this.properties.minSize) {
                        mask.x = realX;
                        mask.width = newWidth;
                    }

                    if (newHeight >= this.properties.minSize) {
                        mask.height = newHeight;
                    }
                } 
                else if (this.dragMode === "resize-br") {
                    let newWidth = realX - mask.x;
                    let newHeight = realY - mask.y;

                    if (newWidth >= this.properties.minSize) {
                        mask.width = newWidth;
                    }

                    if (newHeight >= this.properties.minSize) {
                        mask.height = newHeight;
                    }
                }

                // 确保mask在画布内
                mask.x = Math.max(0, mask.x);
                mask.y = Math.max(0, mask.y);
                mask.width = Math.min(mask.width, canvasWidth - mask.x);
                mask.height = Math.min(mask.height, canvasHeight - mask.y);
            }

            this.updateThisNodeGraph?.();
        }

        // 鼠标释放事件
        this.node.onMouseUp = function() {
            if (!this.capture) return;
            // 停止网格间距滑块拖拽
            if (this.properties.gridSlider) {
                this.properties.gridSlider.dragging = false;
            }
            this.capture = false;
            this.captureInput(false);
            this.dragMode = null;
        }

        // 节点选中事件
        this.node.onSelected = function() {
            this.onMouseUp();
        }

        // 计算节点大小
        this.node.computeSize = () => [300, 300];
    }
}
// author.yichengup.CanvasMask 2025.01.XX
app.registerExtension({
    name: "ycCanvasMask",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name === "ycCanvasBBoxMask") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, []);
                this.ycCanvasMask = new ycCanvasMask(this);
            }
        }
    }
});

// author.yichengup.CanvasMask 2025.01.XX

