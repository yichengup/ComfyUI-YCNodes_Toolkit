
import nodes

class ycBBoxBridge:
    """
    桥接节点：将Canvas BBox的输出转换为WithAnyoneSinglePersonConditioningNode可以接受的格式
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "width": ("INT", {"default": 512, "min": 64, "max": 4096}),
                "height": ("INT", {"default": 512, "min": 64, "max": 4096}),
                "canvas_bbox": ("STRING", {"default": "", "multiline": False}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("withanyone_bbox",)
    FUNCTION = "main"
    CATEGORY = 'YCNode/utils'

    def main(self, width, height, canvas_bbox):
        """
        将Canvas BBox格式(x,y,width,height)转换为WithAnyone格式(x1_ratio,y1_ratio,x2_ratio,y2_ratio)

        参数:
            width: 画布宽度
            height: 画布高度
            canvas_bbox: Canvas BBox格式的字符串 "x,y,width,height"

        返回:
            WithAnyone格式的bbox字符串 "x1_ratio,y1_ratio,x2_ratio,y2_ratio"
        """
        if not canvas_bbox or not canvas_bbox.strip():
            return ("",)

        try:
            # 解析Canvas BBox格式
            coords = canvas_bbox.strip().split(',')
            if len(coords) != 4:
                raise ValueError("Invalid bbox format")

            x = int(coords[0])
            y = int(coords[1])
            w = int(coords[2])
            h = int(coords[3])

            # 转换为WithAnyone格式
            x1 = x
            y1 = y
            x2 = x + w
            y2 = y + h

            # 转换为相对比例 (0-1范围)
            x1_ratio = x1 / width
            y1_ratio = y1 / height
            x2_ratio = x2 / width
            y2_ratio = y2 / height

            # 确保值在0-1范围内
            x1_ratio = max(0, min(1, x1_ratio))
            y1_ratio = max(0, min(1, y1_ratio))
            x2_ratio = max(0, min(1, x2_ratio))
            y2_ratio = max(0, min(1, y2_ratio))

            # 返回WithAnyone格式的字符串
            result = f"{x1_ratio:.4f},{y1_ratio:.4f},{x2_ratio:.4f},{y2_ratio:.4f}"
            return (result,)

        except Exception as e:
            print(f"Error converting bbox: {e}")
            return ("",)

# 注册节点
NODE_CLASS_MAPPINGS = {
    "ycBBoxBridge": ycBBoxBridge,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycBBoxBridge": "BBox Bridge to WithAnyone"
}
