import inspect
import logging
from typing import Any, Dict


# 与 Impact-Pack 保持一致的“任意类型”实现，避免前端验证类型不匹配
class AnyType(str):
    def __ne__(self, __value: object) -> bool:  # 总是相等
        return False


ANY_TYPE = AnyType("*")


class YCSwitch:
    """
    ImpactSwitch 的本地化版本：
    - 动态增加/移除输入槽位（input1、input2、...）
    - 通过 select 选择输出哪一路输入
    - 额外返回被选中的槽位标签与索引
    """

    @classmethod
    def INPUT_TYPES(cls):
        # 默认第一个动态输入
        dyn_inputs: Dict[str, Any] = {
            "input1": (ANY_TYPE, {"lazy": True, "tooltip": "任意输入，连接后自动新增下一输入槽"})
        }

        # 兼容 ComfyUI 校验阶段：在 get_input_info 调用时放宽校验，允许任意新增输入
        stack = inspect.stack()
        if len(stack) > 2 and stack[2].function == "get_input_info":
            class AllContainer:
                def __contains__(self, item):
                    return True

                def __getitem__(self, key):
                    return ANY_TYPE, {"lazy": True}

            dyn_inputs = AllContainer()

        return {
            "required": {
                "select": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 999999,
                        "step": 1,
                        "tooltip": "选择要输出的输入编号",
                    },
                ),
                "sel_mode": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "select_on_prompt",
                        "label_off": "select_on_execution",
                        "forceInput": False,
                        "tooltip": "select_on_execution 在执行时动态选择；select_on_prompt 兼容旧版 ComfyUI，在执行前确定。",
                    },
                ),
            },
            "optional": dyn_inputs,
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = (ANY_TYPE, "STRING", "INT")
    RETURN_NAMES = ("selected_value", "selected_label", "selected_index")
    OUTPUT_TOOLTIPS = (
        "仅输出 select 指定的输入内容",
        "所选输入槽位的标签",
        "所选输入的索引（与 select 相同）",
    )
    FUNCTION = "doit"
    CATEGORY = "YCNode/Logic"

    def check_lazy_status(self, *args, **kwargs):
        """保持与原节点一致的 lazy 处理：仅选中的输入会被执行。"""
        selected_index = int(kwargs["select"])
        input_name = f"input{selected_index}"
        return [input_name] if input_name in kwargs else []

    def doit(self, *args, **kwargs):
        selected_index = int(kwargs["select"])
        input_name = f"input{selected_index}"
        selected_label = input_name
        node_id = kwargs.get("unique_id")

        # 从工作流附带信息中读取用户自定义的槽位标签
        extra = kwargs.get("extra_pnginfo")
        if extra and "workflow" in extra and "nodes" in extra["workflow"]:
            for node in extra["workflow"]["nodes"]:
                if str(node.get("id")) == str(node_id):
                    for slot in node.get("inputs", []):
                        if slot.get("name") == input_name and "label" in slot:
                            selected_label = slot["label"]
                    break
        else:
            logging.info("[YCSwitch] 在 API 模式下无法保证槽位标签获取")

        # 调试信息：记录可用输入及选择
        logging.debug(
            "[YCSwitch] select=%s available_inputs=%s value=%s",
            selected_index,
            [k for k in kwargs.keys() if k.startswith("input")],
            kwargs.get(input_name),
        )

        if input_name in kwargs:
            return kwargs[input_name], selected_label, selected_index

        logging.info("[YCSwitch] 无效的 select 索引，未找到对应输入")
        return None, "", selected_index


NODE_CLASS_MAPPINGS = {"YCSwitch": YCSwitch}
NODE_DISPLAY_NAME_MAPPINGS = {"YCSwitch": "YCSwitch(any)"}

