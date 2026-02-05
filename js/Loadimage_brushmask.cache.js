// 全局图片缓存模块
// 用于在序列化时保持图片数据（切换tab不丢失）
// key: nodeId, value: base64Data
// 注意：刷新页面会清空此缓存

export const imageCache = new Map();
