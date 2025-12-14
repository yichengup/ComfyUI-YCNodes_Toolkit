import { app } from "../../scripts/app.js";

/**
 * 前端：多图拖拽/上传，实时缩略图预览（无需运行）。
 * - 上传到 temp 目录，生成 metas 写入隐藏 images_json
 * - 绘制底部缩略图网格，运行后后端再输出对齐批次
 */

function setup(node) {
    node.flags = node.flags || {};
    node.flags.allow_file_drops = true;
    node.properties = node.properties || {};
    node.properties._ycMetas = node.properties._ycMetas || [];

    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length) await handleFiles(node, files);
        input.value = "";
    });

    node.addWidget("button", "选择文件上传", null, () => input.click());
    node.addWidget("button", "清空已加载", null, () => {
        node.properties._ycMetas = [];
        syncImagesJson(node);
        node.graph?.setDirtyCanvas(true, true);
    });

    node.onDroppedFiles = async (files) => {
        if (!files || !files.length) return;
        await handleFiles(node, files);
        return true;
    };
    node.onDragAndDropFile = async (file) => {
        if (!file) return false;
        await handleFiles(node, [file]);
        return true;
    };
    node.onDropFile = async (file) => {
        if (!file) return false;
        await handleFiles(node, [file]);
        return true;
    };
    node.onDragOver = () => true;
    node.onDragLeave = () => true;
}

async function handleFiles(node, files) {
    const metas = [];
    for (const file of files) {
        const meta = await upload(file).catch((e) => {
            console.error("[YCLiveLoadImagesMulti] upload fail", e);
            return null;
        });
        if (meta) metas.push(meta);
    }
    if (metas.length) {
        const list = node.properties._ycMetas || [];
        metas.forEach((m) => list.push(m));
        node.properties._ycMetas = list;
        syncImagesJson(node);
        node.graph?.setDirtyCanvas(true, true);
    }
}

async function upload(file) {
    const form = new FormData();
    form.append("image", file, file.name);
    form.append("type", "temp");
    const resp = await fetch("/upload/image", { method: "POST", body: form });
    if (!resp.ok) throw new Error(`upload failed: ${resp.status}`);
    const j = await resp.json();
    return {
        filename: j.name || file.name,
        subfolder: j.subfolder || "",
        type: j.type || "temp",
    };
}

function syncImagesJson(node) {
    const widget = ensureHiddenWidget(node);
    const val = JSON.stringify(node.properties._ycMetas || []);
    if (widget) widget.value = val;
    node.properties.images_json = val;
}

function ensureHiddenWidget(node) {
    if (!node.widgets) return null;
    let w = node.widgets.find((x) => x.name === "images_json");
    if (!w) {
        w = node.addWidget("text", "images_json", "", () => {}, { multiline: true });
    }
    if (w) {
        w.hidden = true;
        w.type = "hidden";
    }
    return w;
}

function getThumb(meta, cache) {
    const key = `${meta.type}/${meta.subfolder || ""}/${meta.filename}`;
    if (cache.has(key)) return cache.get(key);
    const img = new Image();
    const url = `/view?filename=${encodeURIComponent(meta.filename)}&subfolder=${encodeURIComponent(meta.subfolder || "")}&type=${encodeURIComponent(meta.type || "temp")}`;
    img.src = url;
    img.onload = () => {};
    img.onerror = () => cache.delete(key);
    cache.set(key, img);
    return img;
}

function drawThumbs(node, ctx, cache) {
    const metas = node.properties._ycMetas || [];
    if (!metas.length) return;
    const pad = 8;
    const gap = 6;
    const maxCols = 4;
    const cellW = (node.size[0] - pad * 2 - gap * (maxCols - 1)) / maxCols;
    const rows = Math.ceil(metas.length / maxCols);
    const desiredH = rows * (cellW + gap) - gap;
    const boxH = Math.min(260, desiredH + pad); // 允许多行显示，最多约 3-4 行
    const w = node.size[0] - pad * 2;
    const startY = node.size[1] - boxH - pad;

    ctx.save();
    ctx.fillStyle = "rgba(30,30,30,0.65)";
    ctx.fillRect(pad, startY, w, boxH);
    metas.forEach((m, idx) => {
        const col = idx % maxCols;
        const row = Math.floor(idx / maxCols);
        const x = pad + col * (cellW + gap);
        const y = startY + row * (cellW + gap);
        if (y > startY + boxH - cellW) return;
        ctx.strokeStyle = "rgba(220,220,220,0.35)";
        ctx.strokeRect(x, y, cellW, cellW);
        const img = getThumb(m, cache);
        if (img && img.complete && img.naturalWidth > 0) {
            const r = Math.min(cellW / img.naturalWidth, cellW / img.naturalHeight);
            const iw = img.naturalWidth * r;
            const ih = img.naturalHeight * r;
            ctx.drawImage(img, x + (cellW - iw) / 2, y + (cellW - ih) / 2, iw, ih);
        }
    });
    ctx.restore();
}

app.registerExtension({
    name: "YCLiveLoadImagesMultiUI",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YCLiveLoadImagesMulti") return;
        const cache = new Map();
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onCreated) onCreated.apply(this, []);
            setup(this);
        };
        const origDraw = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            if (origDraw) origDraw.call(this, ctx);
            if (this.flags?.collapsed) return;
            drawThumbs(this, ctx, cache);
        };
    },
});

