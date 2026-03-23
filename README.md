# ComfyUI-YCNodes Toolkit


## 主要节点简介
主要是一些前端类的节点集合，有趣，有用

## Load Image Crop Expand
<img width="1253" height="760" alt="image" src="https://github.com/user-attachments/assets/4a825a52-9bf6-4ce8-9bcf-7d251a4e601d" />

这个节点可以加载图像后，直接操作，裁剪图像和扩展图像（配合扩图工作流），<br>
#### 操作要诀<br>
1、注意操作白色框，通过双击鼠标可以停止操作，防止鼠标移动带动白色框移动。<br>
2、假如，你要扩图加宽，鼠标要拉伸白色框下边拉不动，你可以先移动整个白色框往下，就腾出扩图空间，再反向把上边拉回，就达到扩图效果<br>
（基于节点是固定画布，所以有些操作无法和ps一样）

## Load_Image_Brush_Mask
<img width="776" height="700" alt="image" src="https://github.com/user-attachments/assets/7ae85504-db00-4eed-b7ac-82fa28bf2c8a" />

在的加载图像上，直接绘制蒙版遮罩，不用打开comfyui mask编辑器
注意：这个节点所在的工作流要导出前，先清掉图片（可以重建节点），放置导出的工作流过大。

## BBox画布 (CanvasBBoX)
<img width="655" height="660" alt="image" src="https://github.com/user-attachments/assets/57c4c591-e691-421e-930c-45cc6f9efac9" />

我创建这个适合BBox的绘制的节点，实现可视化坐标标注、调试以及与外部数据的桥接，基础的代码来自 https://github.com/Smirnov75/ComfyUI-mxToolkit

## 使用方式

1. 将整个 `custom_nodes/ComfyUI-YCNodes_Toolkit` 文件夹放入 ComfyUI 的 `custom_nodes` 目录。
2. 确保安装 `requirements.txt` 中列出的 Python 依赖（见下节）。
3. 启动或重启 ComfyUI，新的节点会自动出现在 `YCNodes Toolkit` 分类下。

## 关于我 | About me

Bilibili：[我的B站主页](https://space.bilibili.com/498399023?spm_id_from=333.1007.0.0)
QQ号：3260561522
wechat微信: DLONG189one

## 如果您从本项目中受益，可以请作者喝杯咖啡
<img width="1536" height="841" alt="image" src="https://github.com/user-attachments/assets/5c3193f3-8ad8-41ad-8f97-8d3c66840058" />


