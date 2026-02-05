// author.yichengup.Loadimage_brushmask 2025.01.XX
import { app } from "../../scripts/app.js";
import { initUIBindings } from "./Loadimage_brushmask.ui.js";
import { initInteractionBindings } from "./Loadimage_brushmask.interactions.js";
import { imageCache } from "./Loadimage_brushmask.cache.js";

const DEFAULT_LAYOUT = {
    shiftLeft: 10,
    shiftRight: 80,
    panelHeight: 58
};

class ycimagebrushmask {
    constructor(node) {
        this.node = node;
        this.state = createInitialState(node);
        initUIBindings(node, this.state);
        initInteractionBindings(node, this.state);
    }
}

function createInitialState(node) {
    if (!node.properties) {
        node.properties = {};
    }

    const defaults = {
        brushPaths: [],
        isDrawing: false,
        currentPath: [],
        brushSize: 80,
        brushOpacity: 0.5,
        brushMode: "brush",
        brushColor: "255,255,255",
        eraserColor: "255,50,50",
        backgroundImage: null,
        imageWidth: 512,
        imageHeight: 512,
        buttons: [],
        sliders: [],
        colorButtonGroup: null,
        backgroundImageObj: null,
        imageBase64Data: ""
    };

    node.properties = {
        ...defaults,
        ...node.properties
    };

    node.size = node.size || [500, 500];

    return {
        layout: { ...DEFAULT_LAYOUT },
        fontSize: LiteGraph?.NODE_SUBTEXT_SIZE ?? 10
    };
}

// author.yichengup.Loadimage_brushmask 2025.01.XX
app.registerExtension({
    name: "ycimagebrushmask",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ycimagebrushmask") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) {
                onNodeCreated.apply(this, []);
            }
            this.ycimagebrushmask = new ycimagebrushmask(this);
            if (this.initButtons) {
                this.initButtons();
            }
        };

        // 导出工作流时不保存图片base64数据，减小文件体积
        // 切换tab时从全局缓存恢复图片
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

// author.yichengup.Loadimage_brushmask 2025.01.XX

