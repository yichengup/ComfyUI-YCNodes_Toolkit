import torch


def _parse_fill_color(fill_color):
    """解析填充颜色字符串为 RGB 列表"""
    fill_color = fill_color.strip()
    if fill_color.startswith('#'):
        hex_color = fill_color.lstrip('#')
        if len(hex_color) == 3:
            hex_color = ''.join([c * 2 for c in hex_color])
        if len(hex_color) == 6:
            fill_rgb = [int(hex_color[i:i + 2], 16) for i in (0, 2, 4)]
        else:
            fill_rgb = [0, 0, 0]
    else:
        try:
            fill_rgb = [int(c.strip()) for c in fill_color.split(',')]
            if len(fill_rgb) != 3:
                fill_rgb = [0, 0, 0]
        except ValueError:
            fill_rgb = [0, 0, 0]
    return [max(0, min(255, c)) for c in fill_rgb]


def _do_crop_single(source_img_tensor, crop_params):
    """对单张图像执行裁剪逻辑"""
    source_width = source_img_tensor.shape[1]
    source_height = source_img_tensor.shape[0]
    
    crop_x = crop_params.get("crop_x", 0)
    crop_y = crop_params.get("crop_y", 0)
    crop_width = crop_params.get("crop_width", source_width)
    crop_height = crop_params.get("crop_height", source_height)
    fill_color = crop_params.get("fill_color", "#000000")
    
    fill_rgb = _parse_fill_color(fill_color)
    
    result_img = torch.zeros((crop_height, crop_width, 3), dtype=torch.float32)
    result_img[:, :, 0] = fill_rgb[0] / 255.0
    result_img[:, :, 1] = fill_rgb[1] / 255.0
    result_img[:, :, 2] = fill_rgb[2] / 255.0
    
    mask = torch.ones((crop_height, crop_width), dtype=torch.float32)
    
    src_x1 = max(0, crop_x)
    src_y1 = max(0, crop_y)
    src_x2 = min(source_width, crop_x + crop_width)
    src_y2 = min(source_height, crop_y + crop_height)
    
    dst_x1 = max(0, -crop_x)
    dst_y1 = max(0, -crop_y)
    dst_x2 = dst_x1 + (src_x2 - src_x1)
    dst_y2 = dst_y1 + (src_y2 - src_y1)
    
    if src_x2 > src_x1 and src_y2 > src_y1:
        result_img[dst_y1:dst_y2, dst_x1:dst_x2, :] = source_img_tensor[src_y1:src_y2, src_x1:src_x2, :]
        mask[dst_y1:dst_y2, dst_x1:dst_x2] = 0.0
    
    return result_img, mask


class ycImageCropBatchApply:
    """
    批处理裁剪扩图节点
    接收交互式裁剪节点的裁剪参数，对单张图像或序列帧进行批量处理
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "crop_params": ("DICT",),
            },
        }
    
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "batch_crop"
    CATEGORY = 'YCNode/utils'
    
    def batch_crop(self, image, crop_params):
        """执行批量裁剪"""
        try:
            result_images = []
            result_masks = []
            
            output_width = crop_params.get("crop_width", image.shape[2])
            output_height = crop_params.get("crop_height", image.shape[1])
            
            print(f"[YC批处理裁剪] 开始处理 {image.shape[0]} 张图像")
            print(f"[YC批处理裁剪] 裁剪参数: x={crop_params.get('crop_x')}, y={crop_params.get('crop_y')}, "
                  f"size={output_width}x{output_height}")
            
            for i in range(image.shape[0]):
                single_image = image[i]
                
                result_img, mask = _do_crop_single(single_image, crop_params)
                
                result_images.append(result_img)
                result_masks.append(mask)
            
            result_tensor = torch.stack(result_images, dim=0)
            mask_tensor = torch.stack(result_masks, dim=0)
            
            print(f"[YC批处理裁剪] 处理完成，输出 {result_tensor.shape[0]} 张图像")
            
            return (result_tensor, mask_tensor, output_width, output_height)
            
        except Exception as e:
            print(f"[YC批处理裁剪] 处理出错: {str(e)}")
            import traceback
            traceback.print_exc()
            return (image, torch.zeros((image.shape[0], image.shape[1], image.shape[2]), dtype=torch.float32),
                   image.shape[2], image.shape[1])


NODE_CLASS_MAPPINGS = {
    "ycImageCropBatchApply": ycImageCropBatchApply,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ycImageCropBatchApply": "YC Image Crop Batch Apply"
}
