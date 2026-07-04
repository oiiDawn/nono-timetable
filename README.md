# 排课表

面向独立老师的本地排课 Web App，支持 PC 和移动端。

## 功能

- 周视图查看课表，点击日期查看当天详情
- 新增、编辑、删除课程
- 单节课支持每 N 天重复，可按循环次数或结束日期结束
- 时间冲突提醒（允许继续保存）
- 数据保存在浏览器 IndexedDB
- 基础 PWA，可离线打开并添加到桌面

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```
