# 排课表

面向独立老师的个人排课 Web App，支持 PC、移动端和 Apple Calendar 订阅。

## 功能

- 周视图查看课表，点击日期查看当天详情
- 新增、编辑、删除课程
- 顶部“学生管理”弹窗维护学生姓名、默认地点与备注，加课时快捷选用，多端共用；学生资料变更不影响已保存课程
- 单节课支持每 N 天重复，可按循环次数或结束日期结束
- 时间冲突提醒（允许继续保存）
- 单密码登录，多端共享云端课表
- Apple Calendar 私密订阅（单向、刷新时间由 Apple 控制）
- 课程和学生默认地点支持高德搜索选择或手填，可补充楼层、房间；课表显示地点，Apple Calendar 订阅包含完整地点与地图链接
- 重复课可单独指定地点、清空或恢复使用系列地点，学生默认地点变更不影响已保存课程

## 云端配置

项目使用 Vercel Functions 和 Neon Postgres。先在 Vercel Marketplace 为项目添加 Neon，确保部署环境提供 `DATABASE_URL` 或 `POSTGRES_URL`，再配置：

```text
APP_PASSWORD_HASH=scrypt$<salt>$<hash>
SESSION_SECRET=<至少 32 字节的随机值>
CALENDAR_FEED_TOKEN=<至少 32 字节的随机值>
AMAP_KEY=<高德开放平台 Web 服务 API 类型 Key>
```

生成密码哈希：

```bash
npm run hash-password -- "你的个人密码"
```

`SESSION_SECRET` 和 `CALENDAR_FEED_TOKEN` 应分别生成，不能复用。首次数据 API 请求会自动创建 `lessons` 和 `lesson_presets` 表。

地点搜索通过登录后的服务端接口调用高德，`AMAP_KEY` 不发送给浏览器。未配置 Key 或搜索不可用时仍可手填地点。已有两张表会幂等新增可空的 `location JSONB` 列，历史记录不会自动填入地点或改变版本。高德搜索配额和数据使用授权需按实际账号确认。

已选择地图地点的链接打开高德标记；手填地点的链接打开高德搜索结果。日历订阅保证输出地点文字与链接，Apple 原生地图卡片和 App 调起效果需在实际设备上验收。

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

## 验证

`npm test` 验证地点输入、重复课继承及覆盖、搜索鉴权和日历输出。

数据库检查使用专用临时 PostgreSQL 容器（不能指向业务数据库）：

```powershell
docker run --name nono-location-check-20261008 --label codex.task=nono-location-check-20261008 --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=local-test-only -d postgres:17-alpine
$env:NONO_TEST_POSTGRES_CONTAINER = "nono-location-check-20261008"
npm test -- server/db.test.ts
docker rm -f nono-location-check-20261008
```

测试先检查容器的专用标签，再重建其中的测试表，验证已有表的幂等增列、系列拆分成功、旧版本冲突和新 ID 冲突的回滚。
