import torch
import numpy as np
import nodes
from PIL import Image
import io
import base64

class ycimagebrushmask:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "brush_data": ("STRING", {"default": "", "multiline": True}),
                "brush_size": ("INT", {"default": 80, "min": 1, "max": 200, "step": 1}),
                "image_base64": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ( "IMAGE", "MASK","INT", "INT")
    RETURN_NAMES = ("image", "mask", "width", "height")

    FUNCTION = "main"
    CATEGORY = 'YCNode/utils'

    def main(self, brush_data, brush_size, image_base64):
        # 从base64字符串加载图片
        background_img_tensor = None
        
        if image_base64 and image_base64.strip():
            # 从base64字符串加载图片
            try:
                # 处理可能的data URL格式（去掉前缀）
                base64_data = image_base64.strip()
                if ',' in base64_data:
                    # 如果包含逗号，说明是data URL格式，取逗号后的部分
                    base64_data = base64_data.split(',')[-1]
                
                # 解码base64
                img_bytes = base64.b64decode(base64_data)
                img_pil = Image.open(io.BytesIO(img_bytes))
                # 转换为RGB（确保3通道）
                if img_pil.mode != 'RGB':
                    img_pil = img_pil.convert('RGB')
                # 转换为numpy数组并归一化到0-1
                img_np = np.array(img_pil).astype(np.float32) / 255.0
                # 转换为tensor: (height, width, channels) -> (1, height, width, channels)
                background_img_tensor = torch.from_numpy(img_np).unsqueeze(0)
                # 只在调试时打印
                # print(f"Loaded image from base64: {img_pil.size[0]}x{img_pil.size[1]}")
            except Exception as e:
                print(f"Error loading image from base64: {e}")
                import traceback
                traceback.print_exc()
        
        # 如果没有base64图片，创建默认空白图片
        if background_img_tensor is None:
            background_img_tensor = torch.zeros((1, 512, 512, 3), dtype=torch.float32)
            # print("No image loaded, using default 512x512 blank image")
        
        # 获取背景图尺寸
        # IMAGE格式: (batch, height, width, channels)
        batch_size = background_img_tensor.shape[0]
        height = background_img_tensor.shape[1]
        width = background_img_tensor.shape[2]
        
        # 创建空白遮罩 (batch, height, width)
        mask = torch.zeros((batch_size, height, width), dtype=torch.float32)
        
        # 解析画笔数据并绘制到遮罩上
        if brush_data and brush_data.strip():
            try:
                # 画笔数据格式支持多种格式：
                # 新格式：mode:size:opacity:x1,y1;x2,y2;...
                # 旧格式1：mode:x1,y1;x2,y2;...
                # 旧格式2：x1,y1;x2,y2;... (多个笔画用"|"分隔)
                strokes = brush_data.split('|')
                total_strokes = len([s for s in strokes if s.strip()])
                # 只在调试时打印（大图时减少日志输出）
                # if total_strokes > 0:
                #     print(f"Parsing brush data: {total_strokes} strokes, brush_size={brush_size}, image_size={width}x{height}")
                
                # 创建numpy数组用于绘制（在所有stroke之前创建一次）
                mask_np = mask[0].numpy().copy()
                
                # 批量解析所有点，减少字符串操作
                for stroke_idx, stroke in enumerate(strokes):
                    if not stroke.strip():
                        continue
                    
                    # 解析模式、size、opacity和颜色信息
                    mode = 'brush'  # 默认模式
                    stroke_size = brush_size  # 默认使用全局brush_size
                    stroke_opacity = 1.0  # 默认透明度（后端不使用，但解析出来保持兼容）
                    stroke_color = None  # 颜色信息（后端不使用，但解析出来保持兼容）
                    points_str = stroke
                    
                    if ':' in stroke:
                        parts = stroke.split(':')
                        if len(parts) >= 2:
                            # 检查第一部分是否是模式
                            if parts[0] in ('brush', 'erase'):
                                mode = parts[0]
                                
                                # 检查格式：支持 mode:size:opacity:r,g,b:points 或 mode:size:opacity:points
                                if len(parts) >= 4:
                                    # 尝试解析新格式（带颜色）：mode:size:opacity:r,g,b:points
                                    part3 = parts[3]
                                    if part3 and ',' in part3:
                                        # 可能是颜色格式 r,g,b
                                        try:
                                            color_parts = part3.split(',')
                                            if len(color_parts) == 3:
                                                r = int(float(color_parts[0]))
                                                g = int(float(color_parts[1]))
                                                b = int(float(color_parts[2]))
                                                # 验证是否是有效的RGB值
                                                if 0 <= r <= 255 and 0 <= g <= 255 and 0 <= b <= 255:
                                                    # 这是颜色，格式为 mode:size:opacity:r,g,b:points
                                                    stroke_size = int(float(parts[1]))
                                                    stroke_opacity = float(parts[2])
                                                    stroke_color = f"{r},{g},{b}"
                                                    # 合并剩余部分作为points（处理points中可能包含冒号的情况）
                                                    points_str = ':'.join(parts[4:])
                                                else:
                                                    # 不是有效的颜色，可能是旧格式 mode:size:opacity:points
                                                    stroke_size = int(float(parts[1]))
                                                    stroke_opacity = float(parts[2])
                                                    points_str = ':'.join(parts[3:])
                                            else:
                                                # 不是颜色格式，可能是旧格式 mode:size:opacity:points
                                                stroke_size = int(float(parts[1]))
                                                stroke_opacity = float(parts[2])
                                                points_str = ':'.join(parts[3:])
                                        except (ValueError, IndexError):
                                            # 解析失败，使用旧格式
                                            try:
                                                stroke_size = int(float(parts[1]))
                                                stroke_opacity = float(parts[2])
                                                points_str = ':'.join(parts[3:])
                                            except (ValueError, IndexError):
                                                points_str = ':'.join(parts[1:])
                                    else:
                                        # 旧格式：mode:size:opacity:points（没有颜色）
                                        try:
                                            stroke_size = int(float(parts[1]))
                                            stroke_opacity = float(parts[2])
                                            # 合并剩余部分作为points（处理points中可能包含冒号的情况）
                                            points_str = ':'.join(parts[3:])
                                        except (ValueError, IndexError):
                                            # 解析失败，使用默认值
                                            points_str = ':'.join(parts[1:])
                                else:
                                    # 旧格式1：mode:points
                                    points_str = ':'.join(parts[1:])
                    
                    # 计算该路径的半径
                    radius = max(1, stroke_size // 2)  # 确保半径至少为1
                    
                    # 解析单个笔画的所有点
                    point_list = points_str.split(';')
                    path_points = []
                    
                    for point_str in point_list:
                        if not point_str.strip():
                            continue
                        try:
                            # 直接分割并转换，减少异常处理开销
                            coords = point_str.split(',', 1)  # 只分割一次
                            if len(coords) == 2:
                                x = int(float(coords[0]))
                                y = int(float(coords[1]))
                                # 确保坐标在有效范围内
                                if 0 <= x < width and 0 <= y < height:
                                    path_points.append((x, y))
                        except (ValueError, IndexError):
                            continue
                    
                    # 在遮罩上绘制或擦除路径（使用该路径自己的size）
                    if len(path_points) > 0:
                        # 绘制每个点（圆形画笔或橡皮擦）
                        for i, (x, y) in enumerate(path_points):
                            # 如果是连续路径，绘制线段
                            if i > 0:
                                prev_x, prev_y = path_points[i-1]
                                # 在两点之间绘制线段
                                if mode == 'erase':
                                    self._erase_line(mask_np, prev_x, prev_y, x, y, radius)
                                else:
                                    self._draw_line(mask_np, prev_x, prev_y, x, y, radius)
                            else:
                                # 绘制单个点（第一个点）
                                if mode == 'erase':
                                    self._erase_circle(mask_np, x, y, radius)
                                else:
                                    self._draw_circle(mask_np, x, y, radius)
                
                # 所有stroke绘制完成后，更新遮罩
                mask[0] = torch.from_numpy(mask_np)
                # 只在调试时打印
                # if total_strokes > 0:
                #     print(f"Completed drawing {total_strokes} strokes")
                        
            except Exception as e:
                print(f"Error parsing brush data: {e}")
                import traceback
                traceback.print_exc()
        
        # 确保遮罩值在0-1范围内
        mask = torch.clamp(mask, 0.0, 1.0)
        
        # 返回遮罩、图片和尺寸
        return (background_img_tensor, mask, width, height)
    
    def _draw_circle(self, mask, x, y, radius):
        """在遮罩上绘制圆形（优化版本，使用向量化操作）"""
        h, w = mask.shape
        y_min = max(0, y - radius)
        y_max = min(h, y + radius + 1)
        x_min = max(0, x - radius)
        x_max = min(w, x + radius + 1)
        
        if x_max <= x_min or y_max <= y_min:
            return
        
        # 使用numpy向量化操作替代Python循环
        # 创建坐标网格
        y_coords, x_coords = np.ogrid[y_min:y_max, x_min:x_max]
        
        # 计算距离（使用平方距离避免sqrt，提高性能）
        dist_sq = (x_coords - x)**2 + (y_coords - y)**2
        radius_sq = radius * radius
        
        # 一次性设置所有在圆内的点
        mask[y_min:y_max, x_min:x_max] = np.maximum(
            mask[y_min:y_max, x_min:x_max],
            (dist_sq <= radius_sq).astype(np.float32)
        )
    
    def _draw_line(self, mask, x1, y1, x2, y2, radius):
        """在遮罩上绘制线段（带宽度，优化版本）"""
        # 如果两点相同，只绘制一个圆
        if x1 == x2 and y1 == y2:
            self._draw_circle(mask, x1, y1, radius)
            return
        
        # 计算线段长度和步数（根据半径调整步数，避免过度采样）
        dx = x2 - x1
        dy = y2 - y1
        length = np.sqrt(dx*dx + dy*dy)
        
        # 优化：步数根据半径动态调整，避免过度采样
        # 对于大半径，减少步数；对于小半径，增加步数以保证连续性
        if radius > 10:
            step_size = max(1, radius // 3)  # 大半径时步长更大
        else:
            step_size = 1  # 小半径时每像素一步
        
        steps = max(1, int(length / step_size) + 1)
        
        if steps <= 0:
            self._draw_circle(mask, x1, y1, radius)
            return
        
        # 使用numpy生成所有点，一次性绘制
        t_values = np.linspace(0, 1, steps + 1)
        x_coords = (x1 + dx * t_values).astype(np.int32)
        y_coords = (y1 + dy * t_values).astype(np.int32)
        
        # 去重并确保在范围内（使用numpy去重，更快）
        h, w = mask.shape
        valid_mask = (x_coords >= 0) & (x_coords < w) & (y_coords >= 0) & (y_coords < h)
        x_coords = x_coords[valid_mask]
        y_coords = y_coords[valid_mask]
        
        # 去重：使用numpy的unique，避免重复绘制同一位置
        if len(x_coords) > 0:
            # 将坐标组合成结构化数组以便去重
            coords = np.column_stack((y_coords, x_coords))
            unique_coords = np.unique(coords, axis=0)
            
            # 批量绘制所有点（减少函数调用）
            for y, x in unique_coords:
                self._draw_circle(mask, int(x), int(y), radius)
    
    def _erase_circle(self, mask, x, y, radius):
        """在遮罩上擦除圆形（减少遮罩值）"""
        h, w = mask.shape
        y_min = max(0, y - radius)
        y_max = min(h, y + radius + 1)
        x_min = max(0, x - radius)
        x_max = min(w, x + radius + 1)
        
        if x_max <= x_min or y_max <= y_min:
            return
        
        # 使用numpy向量化操作
        y_coords, x_coords = np.ogrid[y_min:y_max, x_min:x_max]
        
        # 计算距离（使用平方距离避免sqrt）
        dist_sq = (x_coords - x)**2 + (y_coords - y)**2
        radius_sq = radius * radius
        
        # 擦除：将圆内的点设为0
        erase_mask = dist_sq <= radius_sq
        mask[y_min:y_max, x_min:x_max] = np.where(
            erase_mask,
            0.0,  # 擦除区域设为0
            mask[y_min:y_max, x_min:x_max]  # 保持原值
        )
    
    def _erase_line(self, mask, x1, y1, x2, y2, radius):
        """在遮罩上擦除线段（带宽度，优化版本）"""
        # 如果两点相同，只擦除一个圆
        if x1 == x2 and y1 == y2:
            self._erase_circle(mask, x1, y1, radius)
            return
        
        # 计算线段长度和步数
        dx = x2 - x1
        dy = y2 - y1
        length = np.sqrt(dx*dx + dy*dy)
        
        # 优化：步数根据半径动态调整
        if radius > 10:
            step_size = max(1, radius // 3)
        else:
            step_size = 1
        
        steps = max(1, int(length / step_size) + 1)
        
        if steps <= 0:
            self._erase_circle(mask, x1, y1, radius)
            return
        
        # 使用numpy生成所有点
        t_values = np.linspace(0, 1, steps + 1)
        x_coords = (x1 + dx * t_values).astype(np.int32)
        y_coords = (y1 + dy * t_values).astype(np.int32)
        
        # 去重并确保在范围内
        h, w = mask.shape
        valid_mask = (x_coords >= 0) & (x_coords < w) & (y_coords >= 0) & (y_coords < h)
        x_coords = x_coords[valid_mask]
        y_coords = y_coords[valid_mask]
        
        # 去重：使用numpy的unique
        if len(x_coords) > 0:
            coords = np.column_stack((y_coords, x_coords))
            unique_coords = np.unique(coords, axis=0)
            
            # 批量擦除所有点
            for y, x in unique_coords:
                self._erase_circle(mask, int(x), int(y), radius)

# author.yichengup.Loadimage_brushmask 2025.01.XX

NODE_CLASS_MAPPINGS = {
    "ycimagebrushmask": ycimagebrushmask,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycimagebrushmask": "Load Image Brush Mask"
}

