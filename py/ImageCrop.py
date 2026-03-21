import torch
import numpy as np
from PIL import Image
import io
import base64

class ycImageCrop:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image_base64": ("STRING", {"default": "", "multiline": True}),
                "crop_x": ("INT", {"default": 0, "min": -4096, "max": 4096, "step": 1}),
                "crop_y": ("INT", {"default": 0, "min": -4096, "max": 4096, "step": 1}),
                "crop_width": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
                "crop_height": ("INT", {"default": 512, "min": 1, "max": 8192, "step": 1}),
                "aspect_ratio": ("STRING", {"default": "free", "multiline": False}),
                "fill_color": ("STRING", {"default": "#000000", "multiline": False}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "INT", "INT")
    RETURN_NAMES = ("image", "mask", "width", "height")

    FUNCTION = "main"
    CATEGORY = 'YCNode/utils'

    def main(self, image_base64, crop_x, crop_y, crop_width, crop_height, aspect_ratio, fill_color):
        # 从base64字符串加载图片
        source_img_tensor = None
        source_width = 512
        source_height = 512
        
        if image_base64 and image_base64.strip():
            try:
                # 处理可能的data URL格式
                base64_data = image_base64.strip()
                if ',' in base64_data:
                    base64_data = base64_data.split(',')[-1]
                
                # 解码base64
                img_bytes = base64.b64decode(base64_data)
                img_pil = Image.open(io.BytesIO(img_bytes))
                
                # 转换为RGB
                if img_pil.mode != 'RGB':
                    img_pil = img_pil.convert('RGB')
                
                source_width = img_pil.size[0]
                source_height = img_pil.size[1]
                
                # 转换为numpy数组并归一化到0-1
                img_np = np.array(img_pil).astype(np.float32) / 255.0
                source_img_tensor = torch.from_numpy(img_np)
                
            except Exception as e:
                print(f"Error loading image from base64: {e}")
                import traceback
                traceback.print_exc()
        
        # 如果没有图片，创建默认空白图片
        if source_img_tensor is None:
            source_img_tensor = torch.zeros((512, 512, 3), dtype=torch.float32)
            source_width = 512
            source_height = 512
        
        # 解析填充颜色（支持十六进制和RGB格式）
        try:
            fill_color = fill_color.strip()
            if fill_color.startswith('#'):
                # 十六进制格式：#RRGGBB 或 #RGB
                hex_color = fill_color.lstrip('#')
                if len(hex_color) == 3:
                    # 短格式 #RGB -> #RRGGBB
                    hex_color = ''.join([c*2 for c in hex_color])
                if len(hex_color) == 6:
                    fill_rgb = [int(hex_color[i:i+2], 16) for i in (0, 2, 4)]
                else:
                    fill_rgb = [0, 0, 0]
            else:
                # RGB格式：r,g,b
                fill_rgb = [int(c.strip()) for c in fill_color.split(',')]
                if len(fill_rgb) != 3:
                    fill_rgb = [0, 0, 0]
            fill_rgb = [max(0, min(255, c)) for c in fill_rgb]
        except:
            fill_rgb = [0, 0, 0]
        
        # 创建目标画布
        result_img = torch.zeros((crop_height, crop_width, 3), dtype=torch.float32)
        result_img[:, :, 0] = fill_rgb[0] / 255.0
        result_img[:, :, 1] = fill_rgb[1] / 255.0
        result_img[:, :, 2] = fill_rgb[2] / 255.0
        
        # 创建遮罩：默认全白（1.0表示扩展区域）
        mask = torch.ones((crop_height, crop_width), dtype=torch.float32)
        
        # 计算源图片和裁切框的交集区域
        # 源图片坐标系：(0, 0) 到 (source_width, source_height)
        # 裁切框坐标系：(crop_x, crop_y) 到 (crop_x + crop_width, crop_y + crop_height)
        
        # 计算交集区域在源图片中的坐标
        src_x1 = max(0, crop_x)
        src_y1 = max(0, crop_y)
        src_x2 = min(source_width, crop_x + crop_width)
        src_y2 = min(source_height, crop_y + crop_height)
        
        # 计算交集区域在目标图片中的坐标
        dst_x1 = max(0, -crop_x)
        dst_y1 = max(0, -crop_y)
        dst_x2 = dst_x1 + (src_x2 - src_x1)
        dst_y2 = dst_y1 + (src_y2 - src_y1)
        
        # 如果有交集，复制像素并设置遮罩为黑色（0表示原图区域）
        if src_x2 > src_x1 and src_y2 > src_y1:
            result_img[dst_y1:dst_y2, dst_x1:dst_x2, :] = source_img_tensor[src_y1:src_y2, src_x1:src_x2, :]
            mask[dst_y1:dst_y2, dst_x1:dst_x2] = 0.0
        
        # 添加batch维度：(height, width, channels) -> (1, height, width, channels)
        result_img = result_img.unsqueeze(0)
        # 遮罩添加batch维度：(height, width) -> (1, height, width)
        mask = mask.unsqueeze(0)
        
        return (result_img, mask, crop_width, crop_height)

# author.yichengup.ImageCrop 2025.01.XX

NODE_CLASS_MAPPINGS = {
    "ycImageCrop": ycImageCrop,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycImageCrop": "Load Image Crop Expand"
}
