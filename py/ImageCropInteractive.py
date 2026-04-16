import torch
import numpy as np
from PIL import Image
import io
import base64
import time
from threading import Event
import traceback

from server import PromptServer
from aiohttp import web

# 运行时阻塞数据（仅交互期间使用）
image_crop_interactive_data = {}

# 持久化的裁剪参数：{node_id: {crop_x, crop_y, crop_width, crop_height, fill_color, source_width, source_height}}
_saved_crop_params = {}

# 前端标记"下次强制交互"的集合
_force_interactive = set()

WAIT_TIMEOUT = 600
HEARTBEAT_TIMEOUT = 30

MODE_ALWAYS_INTERACTIVE = "Always Interactive"
MODE_AUTO = "Auto"
MODE_ALWAYS_REUSE = "Always Reuse"


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


def _do_crop(source_img_tensor, source_width, source_height, crop_x, crop_y, crop_width, crop_height, fill_rgb):
    """执行裁剪逻辑，返回 (result_img, mask)，均已含 batch 维度"""
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

    return result_img.unsqueeze(0), mask.unsqueeze(0)


def _scale_crop_params(saved, new_width, new_height):
    """按比例缩放裁剪参数适配新尺寸"""
    old_w = saved["source_width"]
    old_h = saved["source_height"]
    if old_w <= 0 or old_h <= 0:
        return None
    sx = new_width / old_w
    sy = new_height / old_h
    return {
        "crop_x": round(saved["crop_x"] * sx),
        "crop_y": round(saved["crop_y"] * sy),
        "crop_width": max(1, round(saved["crop_width"] * sx)),
        "crop_height": max(1, round(saved["crop_height"] * sy)),
        "fill_color": saved["fill_color"],
        "source_width": new_width,
        "source_height": new_height,
    }


def _should_enter_interactive(mode, node_id, source_width, source_height):
    """判断是否需要进入交互模式"""
    if node_id in _force_interactive:
        _force_interactive.discard(node_id)
        return True

    if mode == MODE_ALWAYS_INTERACTIVE:
        return True

    saved = _saved_crop_params.get(node_id)

    if mode == MODE_AUTO:
        if saved is None:
            return True
        if saved["source_width"] != source_width or saved["source_height"] != source_height:
            return True
        return False

    if mode == MODE_ALWAYS_REUSE:
        if saved is None:
            return True
        return False

    return True


def _get_reuse_params(node_id, source_width, source_height):
    """获取复用参数，如果尺寸不匹配则按比例缩放"""
    saved = _saved_crop_params.get(node_id)
    if saved is None:
        return None
    if saved["source_width"] == source_width and saved["source_height"] == source_height:
        return saved
    return _scale_crop_params(saved, source_width, source_height)


class ycImageCropInteractive:
    """
    交互式图像裁剪扩展节点
    三种模式：Always Interactive / Auto / Always Reuse
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": ([MODE_AUTO, MODE_ALWAYS_INTERACTIVE, MODE_ALWAYS_REUSE], {"default": MODE_AUTO}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("IMAGE", "MASK", "INT", "INT")
    RETURN_NAMES = ("image", "mask", "width", "height")
    FUNCTION = "interactive_crop"
    CATEGORY = 'YCNode/utils'

    @classmethod
    def IS_CHANGED(cls, image, mode, unique_id):
        if mode == MODE_ALWAYS_INTERACTIVE:
            return float("NaN")
        if unique_id in _force_interactive:
            return float("NaN")
        if mode == MODE_AUTO:
            saved = _saved_crop_params.get(unique_id)
            if saved is None:
                return float("NaN")
        return ""
    
    def interactive_crop(self, image, mode, unique_id):
        """执行交互式裁剪节点"""
        try:
            node_id = unique_id
            source_img_tensor = torch.clamp(image[0], 0, 1)
            source_height, source_width = source_img_tensor.shape[0], source_img_tensor.shape[1]

            # ── 判断是否需要交互 ──
            if not _should_enter_interactive(mode, node_id, source_width, source_height):
                params = _get_reuse_params(node_id, source_width, source_height)
                if params is not None:
                    fill_rgb = _parse_fill_color(params["fill_color"])
                    result_img, mask = _do_crop(
                        source_img_tensor, source_width, source_height,
                        params["crop_x"], params["crop_y"],
                        params["crop_width"], params["crop_height"], fill_rgb
                    )
                    rw, rh = params["crop_width"], params["crop_height"]
                    print(f"[YC交互式裁剪] 复用参数裁剪: {rw}x{rh}，节点ID: {node_id}")

                    PromptServer.instance.send_sync("yc_image_crop_interactive_reuse", {
                        "node_id": node_id,
                        "crop_x": params["crop_x"],
                        "crop_y": params["crop_y"],
                        "crop_width": params["crop_width"],
                        "crop_height": params["crop_height"],
                    })

                    return (result_img, mask, rw, rh)

            # ── 进入交互模式 ──
            event = Event()
            image_crop_interactive_data[node_id] = {
                "event": event,
                "source_tensor": source_img_tensor,
                "source_width": source_width,
                "source_height": source_height,
                "result_image": None,
                "result_mask": None,
                "result_width": source_width,
                "result_height": source_height,
                "cancelled": False,
                "confirmed": False,
                "last_heartbeat": time.time(),
            }
            
            preview_image = (source_img_tensor * 255).cpu().numpy().astype(np.uint8)
            pil_image = Image.fromarray(preview_image)
            
            buffer = io.BytesIO()
            pil_image.save(buffer, format="PNG")
            base64_image = base64.b64encode(buffer.getvalue()).decode('utf-8')
            del buffer

            # 如果有已保存参数，告知前端作为初始裁剪框
            saved = _saved_crop_params.get(node_id)
            init_crop = None
            if saved is not None:
                if saved["source_width"] == source_width and saved["source_height"] == source_height:
                    init_crop = saved
                else:
                    init_crop = _scale_crop_params(saved, source_width, source_height)
            
            try:
                msg = {
                    "node_id": node_id,
                    "image_data": f"data:image/png;base64,{base64_image}",
                    "width": source_width,
                    "height": source_height,
                }
                if init_crop:
                    msg["init_crop"] = {
                        "crop_x": init_crop["crop_x"],
                        "crop_y": init_crop["crop_y"],
                        "crop_width": init_crop["crop_width"],
                        "crop_height": init_crop["crop_height"],
                        "fill_color": init_crop["fill_color"],
                    }
                PromptServer.instance.send_sync("yc_image_crop_interactive_init", msg)
                del base64_image
                
                print(f"[YC交互式裁剪] 等待用户确认，节点ID: {node_id}")

                deadline = time.time() + WAIT_TIMEOUT
                while not event.is_set():
                    event.wait(timeout=5.0)
                    if event.is_set():
                        break
                    node_info = image_crop_interactive_data.get(node_id)
                    if node_info is None:
                        break
                    now = time.time()
                    if now - node_info["last_heartbeat"] > HEARTBEAT_TIMEOUT:
                        print(f"[YC交互式裁剪] 心跳超时，自动取消，节点ID: {node_id}")
                        node_info["cancelled"] = True
                        break
                    if now >= deadline:
                        print(f"[YC交互式裁剪] 等待超时({WAIT_TIMEOUT}s)，自动取消，节点ID: {node_id}")
                        node_info["cancelled"] = True
                        break
                
                print(f"[YC交互式裁剪] 用户操作完成，节点ID: {node_id}")
                
                node_info = image_crop_interactive_data.get(node_id, {})
                cancelled = node_info.get("cancelled", False)
                confirmed = node_info.get("confirmed", False)
                
                if node_id in image_crop_interactive_data:
                    del image_crop_interactive_data[node_id]
                
                if cancelled or not confirmed:
                    print(f"[YC交互式裁剪] 用户取消操作，返回原图")
                    empty_mask = torch.zeros((1, source_height, source_width), dtype=torch.float32)
                    return (image, empty_mask, source_width, source_height)
                
                result_image = node_info.get("result_image")
                result_mask = node_info.get("result_mask")
                result_width = node_info.get("result_width", source_width)
                result_height = node_info.get("result_height", source_height)
                
                if result_image is not None and result_mask is not None:
                    print(f"[YC交互式裁剪] 返回裁剪结果: {result_width}x{result_height}")
                    return (result_image, result_mask, result_width, result_height)
                else:
                    print(f"[YC交互式裁剪] 结果数据异常，返回原图")
                    empty_mask = torch.zeros((1, source_height, source_width), dtype=torch.float32)
                    return (image, empty_mask, source_width, source_height)
                
            except Exception as e:
                print(f"[YC交互式裁剪] 处理过程中出错: {str(e)}")
                traceback.print_exc()
                if node_id in image_crop_interactive_data:
                    del image_crop_interactive_data[node_id]
                empty_mask = torch.zeros((1, source_height, source_width), dtype=torch.float32)
                return (image, empty_mask, source_width, source_height)
                
        except Exception as e:
            print(f"[YC交互式裁剪] 节点执行出错: {str(e)}")
            traceback.print_exc()
            h, w = image.shape[1], image.shape[2]
            empty_mask = torch.zeros((1, h, w), dtype=torch.float32)
            return (image, empty_mask, w, h)


@PromptServer.instance.routes.post("/yc_image_crop_interactive/heartbeat")
async def heartbeat_crop(request):
    """前端心跳，保持阻塞线程存活"""
    try:
        data = await request.json()
        node_id = data.get("node_id")

        if node_id in image_crop_interactive_data:
            image_crop_interactive_data[node_id]["last_heartbeat"] = time.time()
            return web.json_response({"success": True})

        return web.json_response({"success": False, "error": "节点未找到"})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.post("/yc_image_crop_interactive/confirm")
async def confirm_crop(request):
    """处理前端提交的裁剪参数"""
    try:
        data = await request.json()
        node_id = data.get("node_id")
        crop_x = data.get("crop_x", 0)
        crop_y = data.get("crop_y", 0)
        crop_width = data.get("crop_width", 512)
        crop_height = data.get("crop_height", 512)
        fill_color = data.get("fill_color", "#000000")
        
        if node_id not in image_crop_interactive_data:
            return web.json_response({"success": False, "error": "节点未找到"})
        
        node_info = image_crop_interactive_data[node_id]
        
        try:
            fill_rgb = _parse_fill_color(fill_color)
            source_tensor = node_info["source_tensor"]
            source_width = node_info["source_width"]
            source_height = node_info["source_height"]

            result_img, mask = _do_crop(
                source_tensor, source_width, source_height,
                crop_x, crop_y, crop_width, crop_height, fill_rgb
            )
            
            node_info["result_image"] = result_img
            node_info["result_mask"] = mask
            node_info["result_width"] = crop_width
            node_info["result_height"] = crop_height
            node_info["confirmed"] = True
            node_info["event"].set()

            # 持久化保存裁剪参数
            _saved_crop_params[node_id] = {
                "crop_x": crop_x,
                "crop_y": crop_y,
                "crop_width": crop_width,
                "crop_height": crop_height,
                "fill_color": fill_color,
                "source_width": source_width,
                "source_height": source_height,
            }
            
            return web.json_response({"success": True})
            
        except Exception as e:
            print(f"[YC交互式裁剪] 处理裁剪参数时出错: {str(e)}")
            traceback.print_exc()
            node_info["cancelled"] = True
            node_info["event"].set()
            return web.json_response({"success": False, "error": str(e)})
    
    except Exception as e:
        print(f"[YC交互式裁剪] 请求处理出错: {str(e)}")
        traceback.print_exc()
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.post("/yc_image_crop_interactive/cancel")
async def cancel_crop(request):
    """处理取消请求"""
    try:
        data = await request.json()
        node_id = data.get("node_id")
        
        if node_id in image_crop_interactive_data:
            node_info = image_crop_interactive_data[node_id]
            node_info["cancelled"] = True
            node_info["event"].set()
            print(f"[YC交互式裁剪] 取消操作: 节点ID {node_id}")
            return web.json_response({"success": True})
        
        return web.json_response({"success": False, "error": "节点未找到"})
    
    except Exception as e:
        print(f"[YC交互式裁剪] 取消请求处理出错: {str(e)}")
        traceback.print_exc()
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.post("/yc_image_crop_interactive/force_reedit")
async def force_reedit(request):
    """前端标记下次运行强制进入交互模式"""
    try:
        data = await request.json()
        node_id = data.get("node_id")
        if node_id:
            _force_interactive.add(node_id)
            print(f"[YC交互式裁剪] 标记强制重新编辑: 节点ID {node_id}")
            return web.json_response({"success": True})
        return web.json_response({"success": False, "error": "缺少node_id"})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.post("/yc_image_crop_interactive/save_color")
async def save_color(request):
    """保存填充颜色"""
    try:
        data = await request.json()
        node_id = data.get("node_id")
        fill_color = data.get("fill_color", "#000000")
        source_width = data.get("source_width", 512)
        source_height = data.get("source_height", 512)
        
        if node_id:
            saved = _saved_crop_params.get(node_id)
            if saved:
                saved["fill_color"] = fill_color
            else:
                _saved_crop_params[node_id] = {
                    "crop_x": 0,
                    "crop_y": 0,
                    "crop_width": source_width,
                    "crop_height": source_height,
                    "fill_color": fill_color,
                    "source_width": source_width,
                    "source_height": source_height,
                }
            print(f"[YC交互式裁剪] 保存颜色: {fill_color}，节点ID: {node_id}")
            return web.json_response({"success": True})
        return web.json_response({"success": False, "error": "缺少node_id"})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


NODE_CLASS_MAPPINGS = {
    "ycImageCropInteractive": ycImageCropInteractive,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ycImageCropInteractive": "YC Image Crop Interactive"
}
