# ComfyUI-YCNodes Toolkit


## 主要节点简介

## BBox画布 (CanvasBBoX)
<img width="655" height="660" alt="image" src="https://github.com/user-attachments/assets/57c4c591-e691-421e-930c-45cc6f9efac9" />

我创建这个适合BBox的绘制的节点，实现可视化坐标标注、调试以及与外部数据的桥接，基础的代码来自 https://github.com/Smirnov75/ComfyUI-mxToolkit


## Load_Image_Brush_Mask
<img width="776" height="700" alt="image" src="https://github.com/user-attachments/assets/7ae85504-db00-4eed-b7ac-82fa28bf2c8a" />

在的加载图像上，直接绘制蒙版遮罩，不用打开comfyui mask编辑器
注意：这个节点所在的工作流要导出前，先清掉图片（可以重建节点），放置导出的工作流过大。
## 使用方式

1. 将整个 `custom_nodes/ComfyUI-YCNodes_Toolkit` 文件夹放入 ComfyUI 的 `custom_nodes` 目录。
2. 确保安装 `requirements.txt` 中列出的 Python 依赖（见下节）。
3. 启动或重启 ComfyUI，新的节点会自动出现在 `YCNodes Toolkit` 分类下。

## 关于我 | About me

Bilibili：[我的B站主页](https://space.bilibili.com/498399023?spm_id_from=333.1007.0.0)
QQ号：3260561522
wechat微信: DLONG189one

