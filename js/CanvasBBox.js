// author.yichengup.CanvasBBox 2025.11.10 
import { app } from "../../scripts/app.js";

class ycCanvasBBOX
{
    constructor(node)
    {
        this.node = node;
        // 初始化属性
        this.node.properties = { 
            bboxes: [], // 存储多个bbox，格式为[{x, y, width, height}, ...]
            selectedBBox: -1, // 当前选中的bbox索引
            dragMode: null, // 拖动模式: "move", "resize-tl", "resize-tr", "resize-bl", "resize-br"
            snap: true,
            grid: true,
            minSize: 10,
            gridSize: 32
        };

        // 设置节点大小
        this.node.size = [450, 450];
        const fontsize = LiteGraph.NODE_SUBTEXT_SIZE;
        const shiftLeft = 10;
        const shiftRight = 80;

        // 隐藏默认小部件
        for (let i = 0; i < this.node.widgets.length; i++) { 
            this.node.widgets[i].hidden = true; 
            this.node.widgets[i].type = "hidden"; 
        }

        // 初始化按钮函数
        this.node.initButtons = function() {
            // 设置输出名称
            this.outputs[0].name = this.outputs[0].localized_name = "width";
            this.outputs[1].name = this.outputs[1].localized_name = "height";
            this.outputs[2].name = this.outputs[2].localized_name = "bbox_1";
            this.outputs[3].name = this.outputs[3].localized_name = "bbox_2";
            this.outputs[4].name = this.outputs[4].localized_name = "bbox_3";
            this.outputs[5].name = this.outputs[5].localized_name = "bbox_4";
            this.outputs[6].name = this.outputs[6].localized_name = "bbox_5";
            this.outputs[7].name = this.outputs[7].localized_name = "bbox_6";
            this.outputs[8].name = this.outputs[8].localized_name = "bbox_7";
            this.outputs[9].name = this.outputs[9].localized_name = "bbox_8";
            this.outputs[10].name = this.outputs[10].localized_name = "bbox_9";
            this.outputs[11].name = this.outputs[11].localized_name = "bbox_10";

            this.widgets_start_y = -4.8e8 * LiteGraph.NODE_SLOT_HEIGHT;

            // 初始化画布尺寸
            if (!this.widgets[0].value) this.widgets[0].value = 512;
            if (!this.widgets[1].value) this.widgets[1].value = 512;

            // 定义按钮区域
            this.properties.buttons = [
                {
                    text: "Set Size",
                    x: 15,
                    y: 15,
                    width: 66,
                    height: 20,
                    action: () => {
                        const canvasWidth = this.widgets[0].value || 512;
                        const canvasHeight = this.widgets[1].value || 512;

                        const newWidth = prompt("请输入画布宽度 (64-4096):", canvasWidth);
                        if (newWidth !== null && !isNaN(newWidth)) {
                            const width = parseInt(newWidth);
                            if (width >= 64 && width <= 4096) {
                                this.widgets[0].value = width;

                                // 调整所有bbox以适应新画布尺寸
                                const scaleFactor = width / canvasWidth;
                                for (let bbox of this.properties.bboxes) {
                                    bbox.x = Math.round(bbox.x * scaleFactor);
                                    bbox.width = Math.round(bbox.width * scaleFactor);
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

                                // 调整所有bbox以适应新画布尺寸
                                const scaleFactor = height / canvasHeight;
                                for (let bbox of this.properties.bboxes) {
                                    bbox.y = Math.round(bbox.y * scaleFactor);
                                    bbox.height = Math.round(bbox.height * scaleFactor);
                                }
                            } else {
                                alert("高度必须在64到4096之间");
                            }
                        }

                        this.updateThisNodeGraph?.();
                    }
                },
                {
                    text: "Add BBox",
                    x: 15,
                    y: 45,
                    width: 66,
                    height: 20,
                    action: () => {
                        const canvasWidth = this.widgets[0].value || 512;
                        const canvasHeight = this.widgets[1].value || 512;

                        // 添加默认大小的bbox
                        this.properties.bboxes.push({
                            x: Math.round(canvasWidth / 2 - 50),
                            y: Math.round(canvasHeight / 2 - 50),
                            width: 100,
                            height: 100
                        });

                        // 选中新添加的bbox
                        this.properties.selectedBBox = this.properties.bboxes.length - 1;
                        this.updateThisNodeGraph?.();
                    }
                },
                {
                    text: "Del BBox",
                    x: 15,
                    y: 75,
                    width: 66,
                    height: 20,
                    action: () => {
                        if (this.properties.selectedBBox >= 0 && this.properties.selectedBBox < this.properties.bboxes.length) {
                            this.properties.bboxes.splice(this.properties.selectedBBox, 1);
                            if (this.properties.selectedBBox >= this.properties.bboxes.length) {
                                this.properties.selectedBBox = this.properties.bboxes.length - 1;
                            }
                            this.updateThisNodeGraph?.();
                        } else {
                            alert("没有选中的BBox可删除");
                        }
                    }
                }
            ];
        };

        // 节点初始化
        this.node.onAdded = function () {
            // 调用初始化按钮函数
            this.initButtons();
        };

        // 节点配置
        this.node.onConfigure = function () {
            // 从字符串中解析bbox数据 - 格式为 "x1,y1,w1,h1;x2,y2,w2,h2;..."
            this.properties.bboxes = [];
            if (this.widgets[2] && this.widgets[2].value) {
                try {
                    const bboxData = this.widgets[2].value;
                    const bboxParts = bboxData.split(';');
                    for (const part of bboxParts) {
                        if (part.trim()) {
                            const coords = part.split(',');
                            if (coords.length === 4) {
                                this.properties.bboxes.push({
                                    x: parseInt(coords[0]),
                                    y: parseInt(coords[1]),
                                    width: parseInt(coords[2]),
                                    height: parseInt(coords[3])
                                });
                            }
                        }
                    }
                } catch (e) {
                    this.properties.bboxes = [];
                }
            }

            // 确保画布尺寸有效
            if (!this.widgets[0].value || this.widgets[0].value < 64 || this.widgets[0].value > 4096) {
                this.widgets[0].value = 512;
            }
            if (!this.widgets[1].value || this.widgets[1].value < 64 || this.widgets[1].value > 4096) {
                this.widgets[1].value = 512;
            }

            // 确保所有bbox在画布范围内
            const canvasWidth = this.widgets[0].value || 512;
            const canvasHeight = this.widgets[1].value || 512;

            for (let bbox of this.properties.bboxes) {
                // 确保bbox在画布内
                if (bbox.x < 0) bbox.x = 0;
                if (bbox.y < 0) bbox.y = 0;
                if (bbox.width < this.properties.minSize) bbox.width = this.properties.minSize;
                if (bbox.height < this.properties.minSize) bbox.height = this.properties.minSize;

                // 如果bbox超出画布，调整大小和位置
                if (bbox.x + bbox.width > canvasWidth) {
                    if (bbox.x > canvasWidth) {
                        bbox.x = canvasWidth - this.properties.minSize;
                        bbox.width = this.properties.minSize;
                    } else {
                        bbox.width = canvasWidth - bbox.x;
                    }
                }

                if (bbox.y + bbox.height > canvasHeight) {
                    if (bbox.y > canvasHeight) {
                        bbox.y = canvasHeight - this.properties.minSize;
                        bbox.height = this.properties.minSize;
                    } else {
                        bbox.height = canvasHeight - bbox.y;
                    }
                }
            }

            // 确保按钮已初始化 - 无论是否存在都重新初始化，确保刷新后按钮正常工作
            this.initButtons();
        }

        // 绘制前景
        this.node.onDrawForeground = function(ctx) {
            if (this.flags.collapsed) return false;

            // 获取画布尺寸
            const canvasWidth = this.widgets[0].value || 512;
            const canvasHeight = this.widgets[1].value || 512;

            // 画布背景
            ctx.fillStyle = "rgba(20,20,20,0.8)";
            ctx.beginPath();
            ctx.roundRect(shiftLeft-4, shiftLeft-4, this.size[0]-shiftRight-shiftLeft+8, this.size[1]-shiftLeft-shiftLeft+8, 4);
            ctx.fill();

            // 绘制网格
            if (this.properties.grid) {
                ctx.fillStyle = "rgba(200,200,200,0.7)";
                ctx.beginPath();
                let swX = (this.size[0]-shiftRight-shiftLeft);
                let swY = (this.size[1]-shiftLeft-shiftLeft);
                let gridSize = this.properties.gridSize;
                let stX = (swX * gridSize / canvasWidth);
                let stY = (swY * gridSize / canvasHeight);

                for (var ix = 0; ix < swX + stX/2; ix += stX) {
                    for (var iy = 0; iy < swY + stY/2; iy += stY) {
                        ctx.rect(shiftLeft + ix - 0.5, shiftLeft + iy - 0.5, 1, 1);
                    }
                }
                ctx.fill();
            }

            // 计算实际画布区域
            let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
            let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft;

            // 绘制所有bbox
            for (let i = 0; i < this.properties.bboxes.length; i++) {
                const bbox = this.properties.bboxes[i];

                // 计算bbox在画布上的位置和大小
                let bboxX = shiftLeft + (bbox.x / canvasWidth) * canvasAreaWidth;
                let bboxY = shiftLeft + (bbox.y / canvasHeight) * canvasAreaHeight;
                let bboxWidth = (bbox.width / canvasWidth) * canvasAreaWidth;
                let bboxHeight = (bbox.height / canvasHeight) * canvasAreaHeight;

                // 设置颜色 - 选中的bbox使用不同的颜色
                if (i === this.properties.selectedBBox) {
                    ctx.fillStyle = "rgba(100,200,255,0.3)";
                    ctx.strokeStyle = "rgba(100,200,255,0.9)";
                } else {
                    ctx.fillStyle = "rgba(100,200,255,0.1)";
                    ctx.strokeStyle = "rgba(100,200,255,0.5)";
                }
                ctx.lineWidth = 2;

                // 绘制bbox
                ctx.beginPath();
                ctx.rect(bboxX, bboxY, bboxWidth, bboxHeight);
                ctx.fill();
                ctx.stroke();

                // 绘制bbox边角（仅对选中的bbox）
                if (i === this.properties.selectedBBox) {
                    ctx.fillStyle = "rgba(100,200,255,0.9)";
                    let cornerSize = 6;
                    // 左上角
                    ctx.fillRect(bboxX - cornerSize/2, bboxY - cornerSize/2, cornerSize, cornerSize);
                    // 右上角
                    ctx.fillRect(bboxX + bboxWidth - cornerSize/2, bboxY - cornerSize/2, cornerSize, cornerSize);
                    // 左下角
                    ctx.fillRect(bboxX - cornerSize/2, bboxY + bboxHeight - cornerSize/2, cornerSize, cornerSize);
                    // 右下角
                    ctx.fillRect(bboxX + bboxWidth - cornerSize/2, bboxY + bboxHeight - cornerSize/2, cornerSize, cornerSize);
                }

                // 显示bbox编号
                ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
                ctx.font = (fontsize) + "px Arial";
                ctx.textAlign = "left";
                ctx.fillText(`${i+1}`, bboxX + 5, bboxY + 15);
            }

            // 显示画布尺寸
            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
            ctx.font = (fontsize) + "px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`${canvasWidth}×${canvasHeight}`, this.size[0]/2, shiftLeft - 8);

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



            // 更新bbox数据字符串 - 使用逗号分隔的格式
            this.widgets[2].value = this.properties.bboxes.map(bbox => 
                `${bbox.x},${bbox.y},${bbox.width},${bbox.height}`
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

            // 检查是否点击在画布区域
            if (e.canvasX < this.pos[0] + shiftLeft - 5 || 
                e.canvasX > this.pos[0] + this.size[0] - shiftRight + 5) return false;
            if (e.canvasY < this.pos[1] + shiftLeft - 5 || 
                e.canvasY > this.pos[1] + this.size[1] - shiftLeft + 5) return false;

            // 右键点击处理 - 仅用于选中bbox
            if (e.button === 2) { // 右键
                const canvasWidth = this.widgets[0].value || 512;
                const canvasHeight = this.widgets[1].value || 512;
                let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
                let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft;

                let mouseX = e.canvasX - this.pos[0] - shiftLeft;
                let mouseY = e.canvasY - this.pos[1] - shiftLeft;

                // 检查是否点击在某个bbox上
                let clickedBBox = -1;
                for (let i = this.properties.bboxes.length - 1; i >= 0; i--) {
                    const bbox = this.properties.bboxes[i];
                    let bboxX = (bbox.x / canvasWidth) * canvasAreaWidth;
                    let bboxY = (bbox.y / canvasHeight) * canvasAreaHeight;
                    let bboxWidth = (bbox.width / canvasWidth) * canvasAreaWidth;
                    let bboxHeight = (bbox.height / canvasHeight) * canvasAreaHeight;

                    if (mouseX >= bboxX && mouseX <= bboxX + bboxWidth && 
                        mouseY >= bboxY && mouseY <= bboxY + bboxHeight) {
                        clickedBBox = i;
                        break;
                    }
                }

                if (clickedBBox >= 0) {
                    // 选中该bbox
                    this.properties.selectedBBox = clickedBBox;
                    this.updateThisNodeGraph?.();
                }

                return true;
            }

            // 左键点击处理
            if (e.button === 0) { // 左键
                const canvasWidth = this.widgets[0].value || 512;
                const canvasHeight = this.widgets[1].value || 512;
                let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
                let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft;

                let mouseX = e.canvasX - this.pos[0] - shiftLeft;
                let mouseY = e.canvasY - this.pos[1] - shiftLeft;

                // 检查是否点击在某个bbox上
                let clickedBBox = -1;
                for (let i = this.properties.bboxes.length - 1; i >= 0; i--) {
                    const bbox = this.properties.bboxes[i];
                    let bboxX = (bbox.x / canvasWidth) * canvasAreaWidth;
                    let bboxY = (bbox.y / canvasHeight) * canvasAreaHeight;
                    let bboxWidth = (bbox.width / canvasWidth) * canvasAreaWidth;
                    let bboxHeight = (bbox.height / canvasHeight) * canvasAreaHeight;

                    if (mouseX >= bboxX && mouseX <= bboxX + bboxWidth && 
                        mouseY >= bboxY && mouseY <= bboxY + bboxHeight) {
                        clickedBBox = i;
                        break;
                    }
                }

                if (clickedBBox >= 0) {
                    // 选中该bbox
                    this.properties.selectedBBox = clickedBBox;

                    const bbox = this.properties.bboxes[clickedBBox];
                    let bboxX = (bbox.x / canvasWidth) * canvasAreaWidth;
                    let bboxY = (bbox.y / canvasHeight) * canvasAreaHeight;
                    let bboxWidth = (bbox.width / canvasWidth) * canvasAreaWidth;
                    let bboxHeight = (bbox.height / canvasHeight) * canvasAreaHeight;

                    // 检查是否点击了边角
                    let cornerSize = 6;
                    let cornerThreshold = cornerSize + 2;

                    // 左上角
                    if (Math.abs(mouseX - bboxX) < cornerThreshold && 
                        Math.abs(mouseY - bboxY) < cornerThreshold) {
                        this.dragMode = "resize-tl";
                    } 
                    // 右上角
                    else if (Math.abs(mouseX - (bboxX + bboxWidth)) < cornerThreshold && 
                             Math.abs(mouseY - bboxY) < cornerThreshold) {
                        this.dragMode = "resize-tr";
                    } 
                    // 左下角
                    else if (Math.abs(mouseX - bboxX) < cornerThreshold && 
                             Math.abs(mouseY - (bboxY + bboxHeight)) < cornerThreshold) {
                        this.dragMode = "resize-bl";
                    } 
                    // 右下角
                    else if (Math.abs(mouseX - (bboxX + bboxWidth)) < cornerThreshold && 
                             Math.abs(mouseY - (bboxY + bboxHeight)) < cornerThreshold) {
                        this.dragMode = "resize-br";
                    } 
                    // 点击在bbox内部
                    else {
                        this.dragMode = "move";
                        this.dragOffsetX = mouseX - bboxX;
                        this.dragOffsetY = mouseY - bboxY;
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
            if (this.properties.selectedBBox < 0 || this.properties.selectedBBox >= this.properties.bboxes.length) {
                return;
            }

            const canvasWidth = this.widgets[0].value || 512;
            const canvasHeight = this.widgets[1].value || 512;
            let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
            let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft;

            let mouseX = e.canvasX - this.pos[0] - shiftLeft;
            let mouseY = e.canvasY - this.pos[1] - shiftLeft;

            // 转换为实际坐标
            let realX = (mouseX / canvasAreaWidth) * canvasWidth;
            let realY = (mouseY / canvasAreaHeight) * canvasHeight;

            // 网格对齐
            if (this.properties.snap) {
                let gridSize = this.properties.gridSize;
                realX = Math.round(realX / gridSize) * gridSize;
                realY = Math.round(realY / gridSize) * gridSize;
            }

            const bbox = this.properties.bboxes[this.properties.selectedBBox];

            if (this.dragMode === "move") {
                // 移动bbox
                let newX = realX - (this.dragOffsetX / canvasAreaWidth) * canvasWidth;
                let newY = realY - (this.dragOffsetY / canvasAreaHeight) * canvasHeight;

                // 网格对齐
                if (this.properties.snap) {
                    let gridSize = this.properties.gridSize;
                    newX = Math.round(newX / gridSize) * gridSize;
                    newY = Math.round(newY / gridSize) * gridSize;
                }

                // 确保bbox在画布内
                newX = Math.max(0, Math.min(newX, canvasWidth - bbox.width));
                newY = Math.max(0, Math.min(newY, canvasHeight - bbox.height));

                bbox.x = newX;
                bbox.y = newY;
            } 
            else if (this.dragMode && this.dragMode.startsWith("resize")) {
                // 调整bbox大小
                if (this.dragMode === "resize-tl") {
                    let newWidth = bbox.x + bbox.width - realX;
                    let newHeight = bbox.y + bbox.height - realY;

                    if (newWidth >= this.properties.minSize) {
                        bbox.x = realX;
                        bbox.width = newWidth;
                    }

                    if (newHeight >= this.properties.minSize) {
                        bbox.y = realY;
                        bbox.height = newHeight;
                    }
                } 
                else if (this.dragMode === "resize-tr") {
                    let newWidth = realX - bbox.x;
                    let newHeight = bbox.y + bbox.height - realY;

                    if (newWidth >= this.properties.minSize) {
                        bbox.width = newWidth;
                    }

                    if (newHeight >= this.properties.minSize) {
                        bbox.y = realY;
                        bbox.height = newHeight;
                    }
                } 
                else if (this.dragMode === "resize-bl") {
                    let newWidth = bbox.x + bbox.width - realX;
                    let newHeight = realY - bbox.y;

                    if (newWidth >= this.properties.minSize) {
                        bbox.x = realX;
                        bbox.width = newWidth;
                    }

                    if (newHeight >= this.properties.minSize) {
                        bbox.height = newHeight;
                    }
                } 
                else if (this.dragMode === "resize-br") {
                    let newWidth = realX - bbox.x;
                    let newHeight = realY - bbox.y;

                    if (newWidth >= this.properties.minSize) {
                        bbox.width = newWidth;
                    }

                    if (newHeight >= this.properties.minSize) {
                        bbox.height = newHeight;
                    }
                }

                // 确保bbox在画布内
                bbox.x = Math.max(0, bbox.x);
                bbox.y = Math.max(0, bbox.y);
                bbox.width = Math.min(bbox.width, canvasWidth - bbox.x);
                bbox.height = Math.min(bbox.height, canvasHeight - bbox.y);
            }

            this.updateThisNodeGraph?.();
        }

        // 鼠标释放事件
        this.node.onMouseUp = function() {
            if (!this.capture) return;
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
// author.yichengup.CanvasBBox 2025.11.10 
app.registerExtension({
    name: "ycCanvasBBox",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name === "ycCanvasBBox") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, []);
                this.ycCanvasBBox = new ycCanvasBBOX(this);
            }
        }
    }
});

// author.yichengup.CanvasBBox 2025.11.10 
