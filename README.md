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
- 课程和学生默认地点支持高德搜索选择或手填，可补充楼层、房间；Apple Calendar 订阅包含完整地点，有坐标时显示内嵌地图
- 重复课可单独指定地点、清空或恢复使用系列地点，学生默认地点变更不影响已保存课程

## 云端配置

项目使用 Vercel Functions 和 Neon Postgres。先在 Vercel Marketplace 为项目添加 Neon，确保部署环境提供 `DATABASE_URL` 或 `POSTGRES_URL`，再配置：

```text
APP_PASSWORD_HASH=scrypt$<salt>$<hash>
SESSION_SECRET=<至少 32 字节的随机值>
CALENDAR_FEED_TOKEN=<至少 32 字节的随机值>
AMAP_KEY=<高德开放平台 Web 服务 API 类型 Key>
PUBLIC_ORIGIN=https://你的课表域名
```

生成密码哈希：

```bash
npm run hash-password -- "你的个人密码"
```

`SESSION_SECRET` 和 `CALENDAR_FEED_TOKEN` 应分别生成，不能复用。首次数据 API 请求会自动创建 `lessons` 和 `lesson_presets` 表。

地点搜索通过登录后的服务端接口调用高德，`AMAP_KEY` 不发送给浏览器。未配置 Key 或搜索不可用时仍可手填地点。已有两张表会幂等新增可空的 `location JSONB` 列，历史记录不会自动填入地点或改变版本。高德搜索配额和数据使用授权需按实际账号确认。

网页中的地图链接打开高德标记或搜索结果。Apple Calendar 订阅将高德坐标转换为 WGS-84，输出一致的地点文字与结构化地点以显示内嵌地图；手填且没有坐标的地点仅输出文字。

## MCP / Codex 接入

部署后，在 Codex 中添加远程 MCP 地址 `https://你的课表域名/api/mcp`，或使用 CLI：

```bash
codex mcp add nono-timetable --url https://你的课表域名/api/mcp
codex mcp login nono-timetable --scopes timetable
```

浏览器会打开现有课表登录页；已登录时直接显示授权确认。允许后，客户端通过 OAuth 授权码与 PKCE 获取凭证。`PUBLIC_ORIGIN` 必须是实际访问的固定 HTTPS 域名，不带路径；本地验证允许 `http://127.0.0.1:端口`。OAuth 元数据通过 `vercel.json` 的 `.well-known` 重写公开，无需把网站密码、session cookie 或日历订阅 token 填入 Codex。

授权没有固定或闲置到期时间。访问令牌有效期 1 小时，客户端自动轮换刷新令牌；旧刷新令牌被重用时整组授权撤销。退出网站不会撤销授权，顶部“MCP 授权”可单独撤销连接，已发放的访问令牌也随即失效。更换网站密码或 `SESSION_SECRET` 不会自动撤销独立的 MCP 授权，应在该入口单独撤销。

首次 OAuth 请求会创建 `oauth_clients`、`oauth_requests`、`oauth_grants` 和 `oauth_tokens` 表；凭证只保存 SHA-256 摘要。授权申请有效期 10 分钟，授权码 5 分钟且只能使用一次。首版支持动态注册的公共客户端，每分钟最多注册 30 个客户端、同时保留最多 100 个待确认申请，不使用第三方身份提供商。

工具范围：

| 工具            | 行为                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `list_lessons`  | 按日期、可选课程名称查询课次和完整系列规则，返回 `id`、`version`、`originalDate` |
| `list_students` | 只读学生姓名、默认地点与备注                                                     |
| `create_lesson` | 创建单次或重复课程，`requestId` 使用 UUID，重试保持相同值                        |
| `update_lesson` | 按 `this` / `future` / `all` 修改，未提供的字段保持不变                          |
| `delete_lesson` | 必须明确提供删除范围，重复课的 `future` / `all` 需确认                           |

时间遵循课表本地日期与时间，仍限制在 08:00–22:00。更新和删除必须提供查询得到的版本和原始课次日期；调课后也使用 `originalDate` 定位。

时间冲突、系列修改丢失单次调整、重复系列的范围删除会先返回 `confirmation_required`、影响详情和 10 分钟有效的确认凭据。agent 应展示详情并取得用户同意，再使用**完全相同的参数**和凭据重试。凭据绑定本次操作、授权和完整课表版本；任何课程变化后需重新预览确认。数据库事务会在最终写入时再次验证快照和授权，系列拆分整体成功或回滚。服务端能验证预览与执行一致，但不能证明 agent 确实询问了用户，因此只连接可信的个人 agent。

本地数据库集成验证（仅使用专用临时容器）：

```powershell
docker run --name nono-mcp-check-20261008 --label codex.task=nono-mcp-check-20261008 --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=local-test-only -d postgres:17-alpine
$env:NONO_MCP_TEST_CONTAINER = "nono-mcp-check-20261008"
npm test -- server/mcp.integration.test.ts
docker rm -f nono-mcp-check-20261008
```

测试覆盖 OAuth 会话鉴权、回调/PKCE/资源绑定、刷新并发与重用撤销、完整课表快照检查、事务回滚，以及官方 MCP 客户端的协议调用。浏览器手工检查可先构建，再设置 `NONO_MCP_BROWSER_CHECK=1`，运行同一测试的 `serves the real APIs` 用例；仅监听 `127.0.0.1:4175`，使用临时密码 `mcp-local-check`，访问 `/__test__/stop` 结束。该测试不会读取真实数据库配置。

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
