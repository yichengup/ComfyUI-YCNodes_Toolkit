import nodes

class ycCanvasBBox:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "canvas_width": ("INT", {"default": 512, "min": 64, "max": 4096}),
                "canvas_height": ("INT", {"default": 512, "min": 64, "max": 4096}),
                "bbox_data": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ("INT", "INT", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("width", "height", "bbox_1", "bbox_2", "bbox_3", "bbox_4", "bbox_5", "bbox_6", "bbox_7", "bbox_8", "bbox_9", "bbox_10")

    FUNCTION = "main"
    CATEGORY = 'YCNode/utils'

    def main(self, canvas_width, canvas_height, bbox_data):
        # 解析bbox数据 - 格式为 "x1,y1,w1,h1;x2,y2,w2,h2;..."
        bboxes = []
        if bbox_data:
            try:
                bbox_parts = bbox_data.split(';')
                for part in bbox_parts:
                    if part.strip():
                        coords = part.split(',')
                        if len(coords) == 4:
                            bboxes.append({
                                'x': int(coords[0]),
                                'y': int(coords[1]),
                                'width': int(coords[2]),
                                'height': int(coords[3])
                            })
            except:
                bboxes = []

        # 确保至少有10个bbox输出，如果没有则用空字符串填充
        bbox_strings = []
        for i in range(10):
            if i < len(bboxes):
                bbox_strings.append(f"{bboxes[i]['x']},{bboxes[i]['y']},{bboxes[i]['width']},{bboxes[i]['height']}")
            else:
                bbox_strings.append("")

        return (canvas_width, canvas_height, bbox_strings[0], bbox_strings[1], bbox_strings[2], bbox_strings[3], bbox_strings[4], bbox_strings[5], bbox_strings[6], bbox_strings[7], bbox_strings[8], bbox_strings[9])

# author.yichengup.CanvasBBox 2025.11.10 

NODE_CLASS_MAPPINGS = {
    "ycCanvasBBox": ycCanvasBBox,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycCanvasBBox": "Canvas BBox"

}
