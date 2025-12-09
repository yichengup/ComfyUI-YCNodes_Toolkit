# 文本展示节点
class YC_ShowText:
    """
    将输入文本直接展示在节点上，同时透传给下游。
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "show"
    OUTPUT_NODE = True
    CATEGORY = "YCNode/Text"
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)

    def show(self, text, unique_id=None, extra_pnginfo=None):
        # 参考 ShowText：将文本回写到 workflow widgets，便于保存/回显
        if unique_id is not None and extra_pnginfo is not None:
            try:
                if isinstance(extra_pnginfo, list) and extra_pnginfo and isinstance(extra_pnginfo[0], dict):
                    workflow = extra_pnginfo[0].get("workflow")
                    if workflow and isinstance(workflow, dict):
                        node = next(
                            (x for x in workflow.get("nodes", []) if str(x.get("id")) == str(unique_id[0])),
                            None,
                        )
                        if node:
                            node["widgets_values"] = [text]
            except Exception:
                pass

        # 在 UI 中展示，同时输出给下游（result 对应 RETURN_TYPES 顺序）
        return {
            "ui": {"text": text},
            "result": (text,),
        }

# 节点注册
NODE_CLASS_MAPPINGS = {
    "YC_ShowText": YC_ShowText
}

# 节点显示名称
NODE_DISPLAY_NAME_MAPPINGS = {
    "YC_ShowText": "YC show text"
} 