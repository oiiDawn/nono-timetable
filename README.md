# 排课表

面向独立老师的个人排课 Web App，支持 PC、移动端和 Apple Calendar 订阅。

## 功能

- 周视图查看课表，点击日期查看当天详情
- 新增、编辑、删除课程
- 单节课支持每 N 天重复，可按循环次数或结束日期结束
- 时间冲突提醒（允许继续保存）
- 单密码登录，多端共享云端课表
- Apple Calendar 私密订阅（单向、刷新时间由 Apple 控制）
- 首次登录可将旧版 IndexedDB 课程一次性迁移到云端

## 云端配置

项目使用 Vercel Functions 和 Neon Postgres。先在 Vercel Marketplace 为项目添加 Neon，确保部署环境提供 `DATABASE_URL` 或 `POSTGRES_URL`，再配置：

```text
APP_PASSWORD_HASH=scrypt$<salt>$<hash>
SESSION_SECRET=<至少 32 字节的随机值>
CALENDAR_FEED_TOKEN=<至少 32 字节的随机值>
```

生成密码哈希：

```bash
npm run hash-password -- "你的个人密码"
```

`SESSION_SECRET` 和 `CALENDAR_FEED_TOKEN` 应分别生成，不能复用。首次 API 请求会自动创建 `lessons` 表。

## 开发

```bash
npm install
npm run dev
```

本地联调 Vercel Functions 时使用 `vercel dev`，并在 `.env.local` 配置上述环境变量。

## 构建

```bash
npm run build
npm run preview
```
