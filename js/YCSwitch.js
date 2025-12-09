import { app } from "../../scripts/app.js";

/**
 * YCSwitch（源自 ImpactSwitch）的前端动态行为：
 * - 动态增删输入/输出槽位 input1/input2/... output1/output2/...
 * - 类型传播：连接后将首个非 '*' 类型传播到所有输入输出
 * - 调整 select widget 的范围以匹配当前槽位数量
 */
app.registerExtension({
	name: "YCNodes.YCSwitch",
	beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "YCSwitch") return;

		// 确保节点定义自带首个输入槽（部分环境下可视化初始化会忽略 optional 首槽）
		if (!nodeData.input || nodeData.input.length === 0) {
			nodeData.input = ["*"];
			nodeData.input_name = ["input1"];
			nodeData.input_is_list = [false];
		}

		// 确保初始至少有一个 input 槽位（某些情况下可视化层可能未创建）
		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			if (onNodeCreated) onNodeCreated.apply(this, arguments);
			// 只在缺少 input1 时补齐；若存在则校正类型与名称
			if (!this.inputs) this.inputs = [];
			const hasInput1 = this.inputs.some((i) => i.name === "input1");
			if (!hasInput1) {
				this.addInput("input1", this.outputs?.[0]?.type ?? "*");
			} else {
				this.inputs.forEach((i, idx) => {
					if (idx === 0 && i.name !== "input1") i.name = "input1";
					if (idx === 0 && !i.type) i.type = this.outputs?.[0]?.type ?? "*";
				});
			}
			// 同步 select widget 的最大值
			if (this.widgets?.[0]) {
				this.widgets[0].options.max = this.inputs.length - 3;
				this.widgets[0].value = Math.min(this.widgets[0].value, this.widgets[0].options.max);
				if (this.widgets[0].options.max > 0 && this.widgets[0].value == 0) this.widgets[0].value = 1;
			}
		};

		const input_name = "input";
		const onConnectionsChange = nodeType.prototype.onConnectionsChange;

		nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info) {
			const stackTrace = new Error().stack;

			// HOTFIX: subgraph
			if (stackTrace.includes("convertToSubgraph") || stackTrace.includes("Subgraph.configure")) {
				return;
			}

			if (stackTrace.includes("loadGraphData")) {
				if (this.widgets?.[0]) {
					this.widgets[0].options.max = this.inputs.length - 3;
					this.widgets[0].value = Math.min(this.widgets[0].value, this.widgets[0].options.max);
				}
				return;
			}

			if (stackTrace.includes("pasteFromClipboard")) {
				if (this.widgets?.[0]) {
					this.widgets[0].options.max = this.inputs.length - 3;
					this.widgets[0].value = Math.min(this.widgets[0].value, this.widgets[0].options.max);
				}
				return;
			}

			if (!link_info) return;

			if (type == 2) {
				// connect output
				if (connected && index == 0) {
					if (app.graph._nodes_by_id[link_info.target_id]?.type == "Reroute") {
						app.graph._nodes_by_id[link_info.target_id].disconnectInput(link_info.target_slot);
					}

					if (this.outputs[0].type == "*") {
						if (link_info.type == "*" && app.graph.getNodeById(link_info.target_id).slots[link_info.target_slot].type != "*") {
							app.graph._nodes_by_id[link_info.target_id].disconnectInput(link_info.target_slot);
						} else {
							// propagate type
							this.outputs[0].type = link_info.type;
							this.outputs[0].label = link_info.type;
							this.outputs[0].name = link_info.type;

							for (let i in this.inputs) {
								let input_i = this.inputs[i];
								if (input_i.name != "select" && input_i.name != "sel_mode") input_i.type = link_info.type;
							}
						}
					}
				}

				return;
			} else {
				if (app.graph._nodes_by_id[link_info.origin_id]?.type == "Reroute") this.disconnectInput(link_info.target_slot);

				// connect input
				if (this.inputs[index].name == "select" || this.inputs[index].name == "sel_mode") return;

				if (this.inputs[0].type == "*") {
					const node = app.graph.getNodeById(link_info.origin_id);

					// NOTE: node is undefined when subgraph editing mode
					if (node) {
						let origin_type = node.outputs[link_info.origin_slot]?.type;
						if (link_info.target_slot == 0 && this.inputs.length > 3) {
							// widgets are regarded as input since new front
							origin_type = this.inputs[1].type;
							node.connect(link_info.origin_slot, node.id, "input1");
						}

						if (origin_type == "*" && app.graph.getNodeById(link_info.origin_id).slots[link_info.origin_slot].type != "*") {
							this.disconnectInput(link_info.target_slot);
							return;
						}

						for (let i in this.inputs) {
							let input_i = this.inputs[i];
							if (input_i.name != "select" && input_i.name != "sel_mode") input_i.type = origin_type;
						}

						this.outputs[0].type = origin_type;
						this.outputs[0].label = origin_type;
						this.outputs[0].name = origin_type;
					}
				}
			}

			// 保持与原节点一致：输入端不因断开而删除（避免意外丢槽）
			let slot_i = 1;
			for (let i = 0; i < this.inputs.length; i++) {
				let input_i = this.inputs[i];
				if (input_i.name != "select" && input_i.name != "sel_mode") {
					input_i.name = `${input_name}${slot_i}`;
					slot_i++;
				}
			}

			if (connected) {
				this.addInput(`${input_name}${slot_i}`, this.outputs[0].type);
			}

			if (this.widgets?.[0]) {
				this.widgets[0].options.max = this.inputs.length - 3;
				this.widgets[0].value = Math.min(this.widgets[0].value, this.widgets[0].options.max);
			}
		};
	},
});

