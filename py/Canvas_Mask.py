import torch
import nodes

class ycCanvasBBoxMask:
    """
    画布遮罩节点：
    - 可以在画布上创建多个遮罩区域
    - 按顺序输出单独遮罩（每个区域在画布中显示白色）
    - 总输出端输出遮罩批次（包含所有遮罩）
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "canvas_width": ("INT", {"default": 512, "min": 64, "max": 4096}),
                "canvas_height": ("INT", {"default": 512, "min": 64, "max": 4096}),
                "mask_data": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = (
        "MASK", "MASK", "MASK", "MASK", "MASK", "MASK", "MASK", "MASK", "MASK", "MASK",  # 10个单独遮罩
        "MASK",  # 遮罩批次
        "INT", "INT",  # 画布尺寸
    )
    RETURN_NAMES = (
        "mask_1", "mask_2", "mask_3", "mask_4", "mask_5", "mask_6", "mask_7", "mask_8", "mask_9", "mask_10",
        "mask_batch",
        "width", "height",
    )

    FUNCTION = "main"
    CATEGORY = 'YCNode/Mask'

    def main(self, canvas_width, canvas_height, mask_data):
        # 解析mask数据 - 格式为 "x1,y1,w1,h1;x2,y2,w2,h2;..."
        masks = []
        if mask_data:
            try:
                mask_parts = mask_data.split(';')
                for part in mask_parts:
                    if part.strip():
                        coords = part.split(',')
                        if len(coords) == 4:
                            masks.append({
                                'x': int(coords[0]),
                                'y': int(coords[1]),
                                'width': int(coords[2]),
                                'height': int(coords[3])
                            })
            except:
                masks = []

        # 创建单独遮罩（最多10个）
        individual_masks = []
        for i in range(10):
            if i < len(masks):
                mask_region = masks[i]
                # 创建黑色遮罩
                mask = torch.zeros((canvas_height, canvas_width), dtype=torch.float32)
                # 将mask区域设置为白色（1.0）
                x_start = max(0, mask_region['x'])
                y_start = max(0, mask_region['y'])
                x_end = min(canvas_width, mask_region['x'] + mask_region['width'])
                y_end = min(canvas_height, mask_region['y'] + mask_region['height'])
                
                if x_end > x_start and y_end > y_start:
                    mask[y_start:y_end, x_start:x_end] = 1.0
                
                # 添加batch维度: (1, H, W)
                mask = mask.unsqueeze(0)
            else:
                # 创建全黑遮罩
                mask = torch.zeros((1, canvas_height, canvas_width), dtype=torch.float32)
            
            individual_masks.append(mask)

        # 创建遮罩批次（只包含实际存在的mask区域）
        if len(masks) > 0:
            batch_masks = []
            for mask_region in masks:
                mask = torch.zeros((canvas_height, canvas_width), dtype=torch.float32)
                x_start = max(0, mask_region['x'])
                y_start = max(0, mask_region['y'])
                x_end = min(canvas_width, mask_region['x'] + mask_region['width'])
                y_end = min(canvas_height, mask_region['y'] + mask_region['height'])
                
                if x_end > x_start and y_end > y_start:
                    mask[y_start:y_end, x_start:x_end] = 1.0
                
                batch_masks.append(mask)
            
            # 堆叠成批次: (N, H, W)
            mask_batch = torch.stack(batch_masks, dim=0)
        else:
            # 如果没有mask区域，返回一个全黑遮罩的批次
            mask_batch = torch.zeros((1, canvas_height, canvas_width), dtype=torch.float32)

        return (
            individual_masks[0], individual_masks[1], individual_masks[2], individual_masks[3], individual_masks[4],
            individual_masks[5], individual_masks[6], individual_masks[7], individual_masks[8], individual_masks[9],
            mask_batch,
            canvas_width, canvas_height
        )

# author.yichengup.CanvasBBoxMask 2025.01.XX

NODE_CLASS_MAPPINGS = {
    "ycCanvasBBoxMask": ycCanvasBBoxMask,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycCanvasBBoxMask": "Canvas BBox Mask"
}

