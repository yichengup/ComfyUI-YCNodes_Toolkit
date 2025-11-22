// author.yichengup.Loadimage_brushmask 2025.01.XX
import { app } from "../../scripts/app.js";
import { initUIBindings } from "./Loadimage_brushmask.ui.js";
import { initInteractionBindings } from "./Loadimage_brushmask.interactions.js";

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
    }
});

// author.yichengup.Loadimage_brushmask 2025.01.XX

