# 同城短视频运营与培训工作台

中文在线工作台，适合同城商家短视频代运营与实战培训团队。基于 Node.js、Express、PostgreSQL 和官方 MCP TypeScript SDK；可直接部署到 Railway。

## 功能

| 模块     | 内容                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 运营总览 | 客户与任务数量、累计播放、线索、成交、交付截止日程                     |
| 客户管理 | 商家名称、城市、行业、联系人、电话、账号、合作目标                     |
| 任务协作 | 客户关联、负责人、截止日期、优先级、执行状态                           |
| 沟通记录 | 沟通对象、渠道、日期、内容摘要、下一步行动                             |
| 内容中心 | 按归属、类型、目的、形式等条件生成脚本，统一沉淀客户内容库与内部内容库 |
| 培训作业 | 学员、课程、要求、作品链接、截止日期、导师反馈、评分                   |
| 视频数据 | 视频链接、播放、点赞、评论、分享、线索、成交、投放费用                 |
| 运营复盘 | 周期、有效做法、问题原因、行动计划、负责人、截止日期                   |

所有业务模块支持新增、编辑、删除。内容中心按客户内容与内部内容分库显示；其他业务列表支持状态筛选、关键词搜索、分页、按客户筛选和 CSV 导出。编辑带版本检查，避免覆盖他人的修改；客户存在关联记录时不能删除。网页和 MCP 共用数据库与校验规则，操作记录保存在 `audit_log`，编辑窗口显示近期记录。

**使用范围**：当前版本是单团队共享空间，持工作台密码的成员具有相同权限。它不提供多租户隔离或学员独立账号。视频数据手动录入，作业保存作品链接；不自动抓取平台数据，不托管视频文件，不内置付费模型调用。生产环境不会自动写入演示数据。

## 内容中心

原“选题脚本”统一升级为内容中心，继续使用原有 `scripts` 数据与 MCP 工具。

- 上方设置归属、客户、类型、目的、形式、受众、镜头建议、结尾引导和数量；再次生成保留条件。
- 中间显示模板草稿，可保存到对应内容库，或加入任务协作中的拍摄计划。网页生成采用内置模板，不调用 AI 模型；案例、结果和缺失资料需人工核实补充。
- 客户草稿读取关联客户的行业、产品服务、目标顾客、优势及最近 10 条历史内容和复盘；历史和复盘作为创作参考标注在草稿末尾。
- 内部草稿覆盖培训、诊断、拍摄现场、文案对比、作业批改、项目复盘及运营获客主题。
- 下方两个内容库可新建和编辑。客户内容必须关联客户，内部内容不关联客户；网页和 MCP 均执行此校验。
- 启动时为旧脚本补充新字段：有关联客户的归入客户库，无关联的归入内部库；保留原文案、平台、镜头、引导及发布日期。

## Railway 部署（复用已有 PostgreSQL）

1. 在现有 Railway 项目中添加或选中应用服务，将 GitHub 源绑定到本仓库的 `main` 分支，根目录使用 `/`。
2. 保留现有 PostgreSQL 服务；在**应用服务**设置下表变量。数据库引用中的服务名称必须与实际名称一致。
3. 为应用生成 Railway 公共域名，将 `APP_URL` 设置为该完整 HTTPS 源地址，然后部署。域名不带路径或末尾斜线，例如 `https://your-service.up.railway.app`。
4. Railway 按 `Dockerfile` 构建，按 `railway.json` 检查 `/healthz`。无需额外设置构建或启动命令。
5. 应用启动时以事务及 PostgreSQL advisory lock 创建缺失表和索引；不会清空已有业务数据。首个版本使用应用专有表 `records`、`audit_log`、`auth_state`，建议使用专属数据库。
6. 打开网页，用 `ADMIN_PASSWORD` 登录。先建立客户，再录入关联任务、脚本、作业和视频数据。

### 环境变量

| 变量                  | 必需         | 设置方式                                                                                                                                                   |
| --------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | 是           | `${{Postgres.DATABASE_URL}}`；将 `Postgres` 替换为现有数据库服务名。优先使用同一 Railway 项目中的内部连接。                                                |
| `APP_URL`             | 是（生产）   | 应用完整 HTTPS 源地址，例如 `https://your-service.up.railway.app`；必须与用户实际访问地址一致。                                                            |
| `ADMIN_PASSWORD`      | 是           | 至少 12 字符的独立强密码，仅保存在 Railway 变量中。                                                                                                        |
| `SESSION_SECRET`      | 是           | 至少 32 字符的随机值，用于密码校验盐；可用 `openssl rand -hex 32` 生成。                                                                                   |
| `OAUTH_REDIRECT_URIS` | 建议显式设置 | 精确匹配的 OAuth 回调白名单，多个地址用英文逗号分隔；默认 `https://chatgpt.com/connector_platform_oauth_redirect`。以 ChatGPT 连接设置实际显示的地址为准。 |
| `PORT`                | 自动         | Railway 注入；本地默认 `3000`。服务监听 `0.0.0.0`。                                                                                                        |
| `NODE_ENV`            | 镜像内置     | Dockerfile 已设 `production`。                                                                                                                             |

不需要 `OPENAI_API_KEY`。ChatGPT 通过 MCP 调用工作台，工作台本身不调用模型 API。所有示例均为占位值，不应直接当作生产密码。

部署建议使用一个应用副本（请求限流为进程内状态）。会话、OAuth 客户端、授权码及令牌均保存在 PostgreSQL；重启应用不会丢失业务数据或有效登录。生产 Cookie 使用 HttpOnly、Secure、SameSite=Lax，网页登录和修改请求校验来源与 CSRF。不要把公共域名设置成数据库服务域名。

## ChatGPT MCP 接入

服务端点：`https://你的应用域名/mcp`，使用 **Streamable HTTP**。

1. 在支持自定义 MCP 的 ChatGPT 账号/工作空间中启用开发者模式，创建连接，填写上面的端点。
2. 选择 OAuth，使用动态客户端注册（DCR），无需手工设置 client ID 或 client secret。
3. 将 ChatGPT 显示的精确回调地址加入 Railway 的 `OAUTH_REDIRECT_URIS`。某些连接使用 `https://chatgpt.com/connector/oauth/{callback_id}`；只添加实际显示的具体地址，不支持通配符。
4. 连接时会跳转到工作台，登录并核对客户端名称、读写权限，然后明确确认授权。
5. 验证：“查询全部待跟进客户”“列出进行中的任务”。写入示例：“为青禾咖啡创建一条本周五截止的拍摄任务，负责人小林”。

授权支持发现元数据、DCR、授权码、S256 PKCE、资源绑定、refresh token 轮换及撤销；授权码有效 2 分钟、access token 1 小时、refresh token 30 天、网页登录 12 小时。OAuth 回调附带 `iss`。元数据位于 `/.well-known/oauth-authorization-server` 和 `/.well-known/oauth-protected-resource/mcp`。`resource` 参数应与元数据中的 `resource` 一致，即完整 MCP 地址。

权限：`workbench:read` 读取全团队业务数据；`workbench:write` 创建和更新业务记录。MCP 无删除工具，删除通过网页确认完成。账户是否能添加自定义 MCP 取决于 ChatGPT 当前计划和工作空间管理员设置。

### 17 个工具

- `get_dashboard`：运营汇总与截止日程。
- `list_records`：按 `kind`、`q`、`status`、`customer_id` 查询，`page` 从 1 开始，`limit` 最大 100。
- `get_record`：按 UUID 读取完整记录及 `version`。
- `create_customers/tasks/communications/scripts/assignments/videos/reviews`：分别创建七种业务记录（实际工具名例如 `create_tasks`）。
- `update_customers/tasks/communications/scripts/assignments/videos/reviews`：分别完整更新七种记录；先读取，保留现有字段，传入 `id`、`version`。版本不一致会拒绝覆盖。

工具 schema 中定义完整字段、默认值、状态枚举、数值范围和链接规则。客户资料、脚本、沟通内容均应作为业务数据处理，不应当作系统指令。MCP 操作在审计中标记为 `mcp`，网页标记为 `web`。

官方参考：[OpenAI MCP 授权](https://developers.openai.com/plugins/build/auth)、[MCP SDK](https://modelcontextprotocol.io/docs/sdk)、[Railway Dockerfile](https://docs.railway.com/builds/dockerfiles)、[Railway 健康检查](https://docs.railway.com/deployments/healthchecks)。

## 本地开发与验证

需要 Node.js 22+、pnpm 11.19.0、PostgreSQL 16+。

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
# 编辑 .env，填写本地 PostgreSQL 连接与独立密码。
node --env-file=.env src/server.js
```

打开 `http://localhost:3000`。如果更改端口，`APP_URL` 也必须同步更新。

```bash
pnpm check
pnpm test
```

默认测试使用内存 PGlite（PostgreSQL WASM），覆盖真实 SQL、认证、业务增删改查、关联保护、版本冲突、OAuth 和实际 MCP 请求。设置 `TEST_DATABASE_URL` 可使用独立 PostgreSQL 测试数据库；**只允许使用空的、可丢弃的测试数据库，测试会写入和删除数据**。

GitHub Actions 使用 PostgreSQL 16 服务执行同一组集成测试，并构建 Docker 镜像。浏览器页面不依赖外部 CDN 或字体；响应式适配桌面和手机。

## 运维

- `/healthz`：数据库可连接时返回 HTTP 200；连接异常返回 503。
- 首次部署失败：检查 `DATABASE_URL` 是否引用应用同项目中的数据库、必需变量是否满足长度要求，以及 `APP_URL` 是否为 HTTPS。
- 登录后 403：检查浏览器地址与 `APP_URL` 是否完全一致；重新登录获取 CSRF 信息。
- OAuth 注册失败：核对回调白名单。连接失败时核对 `resource` 和实际域名。
- 409 更新冲突：重新打开记录，查看最新内容后再保存。
- CSV 导出采用 UTF-8 BOM，转义公式前缀；导出当前模块的筛选结果。
- 备份使用 Railway PostgreSQL 的备份功能或 `pg_dump`。CSV 便于业务分析，不替代完整数据库备份。
- 修改管理员密码只影响后续登录。若要同时撤销全部网页会话和 OAuth 授权，用数据库管理工具执行 `DELETE FROM auth_state WHERE key NOT LIKE 'client:%';`；业务记录与已注册客户端保留。仅对需要主动登出的工作台执行。
- 部署、正式公网访问和 ChatGPT 账号内端到端连接，需要配置实际 Railway 变量与域名；代码提交本身不代表已上线。
