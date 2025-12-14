import json
import os
from typing import List, Tuple

import numpy as np
import torch
from PIL import Image

import folder_paths


class YCLiveLoadImagesMulti:
    """
    实验节点：多图即时预览（前端）+ 后端批量/单张输出。
    前端拖拽/上传后即可在节点底部看到缩略图，运行后输出对齐好的批次与单张。
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images_json": ("STRING", {"default": "", "multiline": True, "tooltip": "前端上传生成的图片列表 JSON"}),
                "selected_index": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
            },
            "optional": {
                "batch_start": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
                "batch_end": ("INT", {"default": -1, "min": -1, "max": 999, "step": 1}),
                "align_mode": (["first", "largest", "smallest"], {"default": "largest"}),
                "pad_color": ("STRING", {"default": "#000000"}),
            },
        }

    CATEGORY = "YCNode/Image"
    RETURN_TYPES = ("IMAGE", "MASK", "IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("images", "masks", "image", "mask", "meta_json")
    FUNCTION = "load_images"
    OUTPUT_NODE = True

    def load_images(
        self,
        images_json: str,
        selected_index: int = -1,
        batch_start: int = -1,
        batch_end: int = -1,
        align_mode: str = "largest",
        pad_color: str = "#000000",
    ):
        metas = self._parse_metas(images_json)
        if not metas:
            empty_img = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
            empty_mask = torch.ones((1, 64, 64), dtype=torch.float32)
            return empty_img, empty_mask, empty_img, empty_mask, json.dumps([])

        images = []
        for meta in metas:
            tensor = self._load_image(meta)
            if tensor is not None:
                images.append(tensor)

        if not images:
            empty_img = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
            empty_mask = torch.ones((1, 64, 64), dtype=torch.float32)
            return empty_img, empty_mask, empty_img, empty_mask, json.dumps([])

        batch_images, batch_masks = self._align_batch(images, align_mode, pad_color)

        idx = len(batch_images) - 1 if selected_index == -1 else max(0, min(selected_index, len(batch_images) - 1))
        single_image = batch_images[idx:idx + 1]
        single_mask = batch_masks[idx:idx + 1]

        if batch_start == -1:
            out_images = single_image
            out_masks = single_mask
        else:
            start = max(0, min(batch_start, len(batch_images) - 1))
            end = len(batch_images) - 1 if batch_end == -1 else max(0, min(batch_end, len(batch_images) - 1))
            if start > end:
                start, end = end, start
            out_images = batch_images[start:end + 1]
            out_masks = batch_masks[start:end + 1]

        # 不返回 ui 预览，避免与前端即时预览重复
        return (
            out_images,
            out_masks,
            single_image,
            single_mask,
            json.dumps(metas, ensure_ascii=False),
        )

    def _parse_metas(self, raw: str) -> List[dict]:
        try:
            metas = json.loads(raw) if raw else []
            return metas if isinstance(metas, list) else []
        except Exception:
            return []

    def _resolve_path(self, meta: dict) -> str:
        filename = meta.get("filename") or meta.get("name")
        subfolder = meta.get("subfolder", "")
        ftype = meta.get("type", "input")
        base = {
            "temp": folder_paths.get_temp_directory,
            "input": folder_paths.get_input_directory,
            "output": folder_paths.get_output_directory,
        }.get(ftype, folder_paths.get_temp_directory)()
        return os.path.join(base, subfolder, filename)

    def _load_image(self, meta: dict):
        path = self._resolve_path(meta)
        if not path or not os.path.exists(path):
            print(f"[YCLiveLoadImagesMulti] file not found: {path}")
            return None
        try:
            img = Image.open(path).convert("RGB")
            arr = np.array(img).astype(np.float32) / 255.0
            return torch.from_numpy(arr).unsqueeze(0)
        except Exception as e:
            print(f"[YCLiveLoadImagesMulti] load fail {path}: {e}")
            return None

    def _align_batch(self, images: List[torch.Tensor], mode: str, pad_color: str) -> Tuple[torch.Tensor, torch.Tensor]:
        if mode == "first":
            target_h, target_w = images[0].shape[1], images[0].shape[2]
        elif mode == "smallest":
            target_h = min(img.shape[1] for img in images)
            target_w = min(img.shape[2] for img in images)
        else:
            target_h = max(img.shape[1] for img in images)
            target_w = max(img.shape[2] for img in images)

        aligned_imgs = []
        aligned_masks = []
        color = self._hex_to_gray(pad_color)
        for img in images:
            aligned, mask = self._align_image(img, target_h, target_w, color)
            aligned_imgs.append(aligned)
            aligned_masks.append(mask)

        return torch.cat(aligned_imgs, dim=0), torch.cat(aligned_masks, dim=0)

    def _align_image(self, image: torch.Tensor, target_h: int, target_w: int, color: float):
        h, w = image.shape[1], image.shape[2]
        if h == target_h and w == target_w:
            return image, torch.ones((1, target_h, target_w), dtype=torch.float32)

        pad_top = max(0, (target_h - h) // 2)
        pad_bottom = max(0, target_h - h - pad_top)
        pad_left = max(0, (target_w - w) // 2)
        pad_right = max(0, target_w - w - pad_left)

        if pad_top > 0 or pad_bottom > 0 or pad_left > 0 or pad_right > 0:
            padded = torch.nn.functional.pad(
                image,
                (0, 0, pad_left, pad_right, pad_top, pad_bottom),
                mode="constant",
                value=color,
            )
            mask = torch.zeros((1, target_h, target_w), dtype=torch.float32)
            mask[0, pad_top:pad_top + h, pad_left:pad_left + w] = 1.0
            return padded, mask

        crop_top = (h - target_h) // 2
        crop_left = (w - target_w) // 2
        cropped = image[:, crop_top:crop_top + target_h, crop_left:crop_left + target_w, :]
        mask = torch.ones((1, target_h, target_w), dtype=torch.float32)
        return cropped, mask

    def _hex_to_gray(self, hex_color: str) -> float:
        try:
            hex_color = hex_color.lstrip("#")
            if len(hex_color) == 3:
                hex_color = "".join([c * 2 for c in hex_color])
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0
            b = int(hex_color[4:6], 16) / 255.0
            return float(0.299 * r + 0.587 * g + 0.114 * b)
        except Exception:
            return 0.0

NODE_CLASS_MAPPINGS = {"YCLiveLoadImagesMulti": YCLiveLoadImagesMulti}
NODE_DISPLAY_NAME_MAPPINGS = {"YCLiveLoadImagesMulti": "YC Live Load Images (Multi)"}

