import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

// 参考 pysssss ShowText 的前端逻辑，支持显示执行结果并在重新加载时恢复
app.registerExtension({
	name: "YCNodes.YC_ShowText",
	beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "YC_ShowText") return;

		// 显示文本的核心函数，支持列表/多输出
		function populate(text) {
			if (this.widgets) {
				// 兼容旧前端：第 0 个可能是转换的隐藏 widget
				const isConvertedWidget = +!!this.inputs?.[0]?.widget;
				for (let i = isConvertedWidget; i < this.widgets.length; i++) {
					this.widgets[i].onRemove?.();
				}
				this.widgets.length = isConvertedWidget;
			}

			const lists = [...text];
			if (!lists[0]) {
				lists.shift();
			}
			for (let list of lists) {
				if (!(list instanceof Array)) list = [list];
				for (const l of list) {
					const w = ComfyWidgets["STRING"](this, "text_" + (this.widgets?.length ?? 0), ["STRING", { multiline: true }], app).widget;
					w.inputEl.readOnly = true;
					w.inputEl.style.opacity = 0.6;
					w.value = l;
				}
			}

			requestAnimationFrame(() => {
				const sz = this.computeSize();
				if (sz[0] < this.size[0]) sz[0] = this.size[0];
				if (sz[1] < this.size[1]) sz[1] = this.size[1];
				this.onResize?.(sz);
				app.graph.setDirtyCanvas(true, false);
			});
		}

		// 执行后更新显示
		const onExecuted = nodeType.prototype.onExecuted;
		nodeType.prototype.onExecuted = function (message) {
			onExecuted?.apply(this, arguments);
			if (message?.text !== undefined) {
				populate.call(this, message.text);
			} else if (message?.ui?.text !== undefined) {
				populate.call(this, message.ui.text);
			} else if (Array.isArray(message?.result) && message.result.length) {
				populate.call(this, message.result[0]);
			}
		};

		// 处理 configure 时恢复 widgets_values
		const VALUES = Symbol();
		const configure = nodeType.prototype.configure;
		nodeType.prototype.configure = function () {
			this[VALUES] = arguments[0]?.widgets_values;
			return configure?.apply(this, arguments);
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			onConfigure?.apply(this, arguments);
			const widgets_values = this[VALUES];
			if (widgets_values?.length) {
				requestAnimationFrame(() => {
					populate.call(this, widgets_values.slice(+(widgets_values.length > 1 && this.inputs?.[0]?.widget)));
				});
			}
		};
	},
});

