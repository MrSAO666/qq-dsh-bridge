# QQ DSH Bridge

将 DeepSeek Harness（DSH）接入 QQ，并在同一套人格、长期记忆和权限配置下扩展 B 站浏览能力。本仓库是 [NoMindSama/qq-dsh-bridge](https://github.com/NoMindSama/qq-dsh-bridge) 的个人适配分支，主要补充云端 Web 设置、B 站子 Agent 和用量审计。

QQ 与 B 站均需使用你有权操作的账号。项目不会提供平台账号、模型额度或第三方网关的分发包。

## 功能

| 模块 | 当前能力 |
| --- | --- |
| QQ 收发 | 通过 SnowLuma / OneBot v11 接收私聊和群消息，发送文字、图片、表情、语音等；具体能力受网关支持影响。 |
| 权限 | 区分主人、白名单与普通聊天会话；通用子 Agent 仅向主人开放，群聊使用受限预设。 |
| 人格 | 从 `qq-bridge/roles/*.md` 选择角色卡；支持按一代/二代模式筛选及注入长度限制。 |
| 长期记忆 | 复用桥接已有的事实、原文检索、产物索引和自我认知，不额外安装另一套记忆插件。 |
| 回复节奏 | 设置思考强度、主动聊天提示词/时间范围/次数、合并消息、等待、发送间隔和频率限制。 |
| B 站 | 扫码登录、按关键词/UP 主/推荐流找视频；只读取有字幕的视频；按开关和限额点赞、评论、回复。 |
| 自动刷站 | 由主人主 Agent 派出受限子 Agent，独立于 QQ 主动聊天额度；结束后汇报给主 Agent。 |
| 用量 | 汇总主会话及可发现子 Agent 的模型 Token；支持北京时间日期/时间段、用途、对话/请求/工具/刷站任务日志。 |
| 管理页面 | DSH 悬浮球内提供状态、回复节奏、B 站、人格、Token 花费、表情、权限与诊断。 |

### 已知限制

- B 站 `@` 功能尚未接入。即使页面配置了开关和名单，当前工具仍拒绝评论中的 `@`。
- 尚未实现跨轮视频去重，以及主人手动刷站与自动任务的统一互斥。
- 子 Agent 不会自动继承主会话全部历史；主 Agent 需给它传递本次有关的兴趣与表达偏好。
- 主 Agent 被提示判断是否将浏览发现写入现有记忆，但不能保证每次都会写入。
- DSH、SnowLuma 或平台接口升级可能影响兼容性；服务启动成功不等于账号在线或消息投递成功。

## 架构

```text
QQ 账号 ←→ SnowLuma / OneBot v11 ←→ qq-bridge ←→ DSH 主 Agent
                                      │              │
                                      │              └─ 受限 B 站子 Agent
                                      │                       │
                                      ├─ 人格与长期记忆         └─ B 站 MCP / API
                                      ├─ 管理接口与悬浮球
                                      └─ Token 账本与操作日志
```

DSH 负责模型和 Agent 执行；桥接负责 QQ 会话、权限、限额与日志。B 站接口代码参考鱼塘项目，但不启用它独立的人格、记忆或值班会话。

## 安装前准备

- Node.js **22.13 或以上**，已能正常使用的 DSH 和模型配置。
- 按 SnowLuma 自身许可及说明准备网关，并确认 QQ 账号已登录、OneBot HTTP/WS 可访问。
- 只有 B 站功能需要 Python：建议使用 Python 3.12/3.13 和独立虚拟环境；无需额外安装 uv。
- Windows 可使用 `desktop` profile；Linux 云端使用 `web` profile。云端管理可走已有虚拟内网。

仓库不包含 DSH、QQ、SnowLuma 的本体安装包，不自动替你处理平台安全验证。

## 方式 A：手动安装

### 1. 获取代码与依赖

```bash
git clone https://github.com/MrSAO666/qq-dsh-bridge.git
cd qq-dsh-bridge/qq-bridge
npm ci
```

从 `config.example.json` 复制出 `config.json`。Linux 使用 `cp`，PowerShell 使用 `Copy-Item`。不要覆盖已有配置文件。

`npm ci` 的现有 `postinstall` 会修补本地安装的 SnowLuma SDK 相对导入路径；第三方包仍适用其自身许可，详见 [LICENSE](LICENSE)。

### 2. 配置桥接

在 `qq-bridge/config.json` 中填写：

| 配置 | 说明 |
| --- | --- |
| `ownerQQ` | 主人 QQ 号，拥有管理及主人预设权限。 |
| `allow.private` / `allow.groups` | 允许接入的私聊/群号。群列表为空时不接入群聊。 |
| `snowluma.wsUrl` / `httpUrl` | 网关的 OneBot 地址；默认使用本机回环。 |
| `snowluma.accessToken` / `homeDir` | 按网关配置填写；HTTP 与 WS 令牌可能不同，自动发现依赖目录可读。 |
| `dsh.baseUrl` | DSH Web API 地址；同机部署通常使用回环地址。 |
| `dsh.provider` / `model` | 留空时优先跟随 DSH 会话模型；不要填写不存在的模型 ID。 |
| `sessionCwd` | QQ 会话使用的工作区目录。 |
| `role.maxInjectChars` | 人物卡注入上限，默认 6000 字符。 |

模型凭据应在 DSH 中管理，不要写入角色卡、聊天提示词或公开仓库。不要把 Token 发到公开 Issue。

### 3. 安装已有预设与 MCP

在 `qq-bridge` 目录执行，对应选择一个 profile：

```bash
node scripts/setup-dsh.mjs web
# Windows 桌面端使用：node scripts/setup-dsh.mjs desktop
```

脚本负责桥接预设、基础 bundle 和 MCP 挂载。检查输出；若 DSH 无法解析 bundle，按日志提示重新执行对应 profile 的插件安装。

### 4. 挂载上下文与悬浮球

在仓库根目录，将本仓库的两个现有插件加入同一个 DSH profile：

```bash
dsh plugin --profile web add "link:$(pwd)/qq-bridge/plugins/qq-agent-context"
dsh plugin --profile web add "link:$(pwd)/dsh-plugins/dsh-thinking-zh"
```

PowerShell 使用仓库的绝对路径，并把 `web` 换成 `desktop`（如使用桌面端）。在该 profile 的 `cordis.patch.yml` 中，为 `qq-agent-context` 配置正确的桥接地址及令牌文件路径，合并到已有条目而非整份覆盖：

```yaml
- id: qq-agent-context
  name: '@local/qq-agent-context'
  config:
    bridgeUrl: http://127.0.0.1:3100
    tokenFile: /absolute/path/qq-dsh-bridge/qq-bridge/state/console-token
```

使用系统上下文注入时，`config.json` 的 `socialV2.injectViaSystemPrompt` 应为 `true`。桥接首次运行会生成控制台令牌文件。没有正确挂载或配置上下文插件时，不能仅凭页面显示角色名就认定人物卡已进入模型。

### 5. 启动与验证

```bash
cd qq-bridge
npm start
```

重启对应 DSH profile，刷新 Web 页面。常驻运行可使用自己的 systemd/进程管理方案；仓库内 Windows 管理脚本见 [`tools/qq-bot.ps1`](tools/qq-bot.ps1)。

按顺序检查 DSH 就绪、网关连接、QQ 账号在线和会话白名单，再由主人向机器人发一句日常消息，确认真实收发。验证消息不要夹带凭据。

## 可选：启用 B 站

在 `qq-bridge` 目录准备独立 Python 环境：

```bash
python3 -m venv state/bili/.venv
state/bili/.venv/bin/python -m pip install -r vendor/bilibili-mcp/requirements.txt
```

Windows 对应使用 `python -m venv state/bili/.venv` 和 `state/bili/.venv/Scripts/python.exe`。依赖要求来自仓库中的 `requirements.txt`；已有可用环境无需重复安装。

进入悬浮球「QQ 大肥鱼 → B站」获取二维码，用独立 B 站账号扫码并确认，再检查页面登录状态。根据需要设置浏览来源、自动开关、每日次数、每次最长时长，以及互动开关和次数上限。

### 自动刷站如何触发

- 桥接启动 30 秒后首次检查，之后每分钟检查一次。
- 功能与自动开关均开启、每日额度未满、没有未结束的自动任务、DSH 已就绪且主人会话空闲时，才可能派发。
- 两次自动预约至少间隔 `24 小时 / 每日上限`。例如每天最多 5 次对应至少间隔 4 小时 48 分钟；这是上限分散机制，不保证每天跑满。
- 次数按北京时间自然日计，在派发前持久化预留；失败不会随意返还名额。零点不会清除跨日间隔。
- 单次时长从子 Agent **实际开始执行**计算；到时请求中断并等待确认。
- 主人手动要求刷站不占自动次数，也不受自动任务时长上限约束。
- 桥接不另外向 QQ 转发固定刷站报告；子任务结果返回父 Agent。

更多限制见 [B 站接入说明](docs/bilibili-integration-design.md)。

## 人格、记忆与回复节奏

角色卡使用 `roles/*.md`，在「人格」页选择、编辑。系统上下文模式下，卡片正文经过模式筛选及长度限制后注入对应 QQ 会话的系统提示词；新会话创建时读取，已有会话最多约两分钟更新。

长期记忆继续使用原桥接的分层机制：事实与偏好、原文检索、产物索引及自我认知。视频字幕、评论、网页内容是外部资料，不能当作系统指令；资讯应保留来源和时间，不能直接升级为关于用户的长期事实。

「回复节奏」与 B 站页使用统一卡片布局。思考强度单独保存，在下次 QQ 会话处理时应用；DSH 的模型选择还可能影响新会话默认模型。主动聊天与自动刷站是两套独立调度。旧轮询间隔已标为停用，当前使用消息事件与私聊回复窗口。

配置覆盖规则、发送间隔和人物卡修复见 [设置核查说明](docs/rhythm-settings-audit.md)。

## Token 花费与日志

现有插件还包含[上下文、执行预算与回复延迟优化](docs/token-optimization.md)：已读水位安全收尾、发送后合并收尾、40k/80k 上下文边界、稳定系统提示词、图片哈希复用、长文本分段与逐轮模型预算。配置在「回复节奏 → 上下文与执行预算」。

「私聊收到消息后至少等待」控制从最后一条来信到首条回复的等待；「机器人连续发言最短间隔」控制机器人两条发言之间的间隔。两者独立，设为 15 秒时由桥接实际执行，无需模型反复等待。现有主人工具权限、人物卡和思考强度不会因此被自动降低。

在「Token 花费」页选择今天、昨天、近 7 天、全部明细，或填写北京时间开始/结束时间。查询使用 **开始时间包含、结束时间不包含** 的区间；一整天可填当天 00:00 至次日 00:00。

可按用途筛选 QQ 对话、刷 B 站和内部任务，并查看：

- **每轮对话**：回合编号、模型、用量和估算费用；包括已识别的后台浏览及汇报处理回合。
- **每次模型请求**：会话、回合、步骤、重试、缓存命中/未命中/写入及输出 Token。
- **每次工具调用**：工具名、所属回合/步骤、开始时间、耗时和状态。
- **每次 B 站任务**：按任务关联主 Agent 的相关回合与子 Agent 请求，避免把两层统计重复相加。

统计读取 DSH 的真实用量回执；发现的历史子 Agent 可通过只读快照补记，并按请求键和事件序号去重。普通工具通常没有独立 Token 回执，其关联模型步骤的用量只是共享参考，**不单独再计一次费用**。工具内部使用其他付费服务的账单不在此自动统计。

金额按 `config.json` 的 `pricing` 价目表估算，不能替代模型服务商账单。未知模型会使用兜底价格并标记估算。只有累计基线、没有逐次时间明细的旧用量不会伪造到某一天；失败请求未返回 usage 时标为用量待确认，不能认定免费。

运行文件：`state/token-usage.jsonl` 保存用量；`state/token-audit.jsonl` 保存归属、回合和工具元数据。日志不保存工具参数、结果正文或聊天正文。请求明细默认保留最近 20000 条；更早明细淘汰后累计总量仍保留，日期和步骤检索无法恢复这些已淘汰部分。备份时应保留整个 `state/`。

## 更新与排障

更新前备份 `config.json`、`state/`、自定义角色卡和 DSH profile。保持依赖、源码与插件来自同一版本；避免在正在运行刷站子任务时直接覆盖并重启服务。

| 现象 | 检查 |
| --- | --- |
| 群聊不回应 | `allow.groups`、当前模式、群唤醒条件和限流。 |
| 工具提示令牌无效 | 上下文插件是否挂载、`tokenFile` 是否指向实际文件。 |
| 人格没有应用 | 当前卡片、注入模式、字数上限与上下文刷新是否正常。 |
| B 站未自动启动 | 自动开关、当日额度、与上次预约的间隔、主会话是否忙或存在待确认任务。 |
| B 站登录不成功 | 手机是否确认、页面是否完成检查、凭据是否过期；不要反复生成多个并行二维码。 |
| 总额与日期明细不同 | 累计基线、明细淘汰、时间范围及估算价格；不要把工具关联用量再加一次。 |

相关验证脚本位于 `qq-bridge/scripts/`。Token 改动可运行 `test-token-usage.mjs`、`test-token-audit.mjs`、`test-token-child-watch.mjs`；其他模块按对应测试验证。

## 参考项目与版权归属

本分支保留上游及第三方的版权、许可证和 NOTICE；以下项目的工作构成了实现基础：

| 项目 | 使用关系 |
| --- | --- |
| [NoMindSama/qq-dsh-bridge](https://github.com/NoMindSama/qq-dsh-bridge) | 本分支的直接基础：QQ 桥接、人格、记忆与权限机制。 |
| [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge) | 原桥接实现与相关贡献者；原版权声明保留在根 LICENSE。 |
| [YOYOLnFu/dsh-bili-pond](https://github.com/YOYOLnFu/dsh-bili-pond) | B 站接口、登录及浏览设计参考；本分支复用其内嵌 B 站服务并做适配。 |
| [c1overzz/dsh-bili-scroll](https://github.com/c1overzz/dsh-bili-scroll) | 鱼塘项目说明中的上游；衍生关系见内嵌 NOTICE。 |
| bilibili-mcp · [AGI_Ananas 版权声明](qq-bridge/vendor/bilibili-mcp/LICENSE) | 经鱼塘 vendor 引入的 B 站 MCP 服务；原作者署名与 MIT 条款以保留的 LICENSE 为准。 |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | Agent 运行、模型调用、子 Agent 及会话事件接口。 |
| [SnowLuma](https://github.com/SnowLuma/SnowLuma) | 外部 QQ 网关；通过 OneBot 通信，依赖其 SDK，许可独立适用。 |

第三方文件见 [`vendor/bilibili-mcp`](qq-bridge/vendor/bilibili-mcp)：[原 MCP 许可](qq-bridge/vendor/bilibili-mcp/LICENSE)、[鱼塘许可](qq-bridge/vendor/bilibili-mcp/pond-LICENSE)、[鱼塘 NOTICE](qq-bridge/vendor/bilibili-mcp/pond-NOTICE.md)。其他依赖遵守各自许可证，不因本仓库 MIT 许可而变更。

## 免责声明

这是个人维护的非官方适配项目，与腾讯、哔哩哔哩、DeepSeek 或上述项目作者之间不存在由本仓库声明的官方合作或认可关系。

使用第三方网关或自动化操作可能导致登录验证、限流、消息不可见、账号限制或封禁，不能承诺降低风控或永久在线。使用者应遵守平台条款、第三方许可证及适用规则，并自行管理账号、密钥、数据及操作授权；不得用于骚扰、刷屏、批量操纵互动或未经授权的信息收集。

主人 Agent 可能拥有文件、命令及其他工具权限；模型可能误判、受到外部内容诱导或发布错误信息。应按需要限制权限、互动范围和额度，并在使用前做好备份。提示词及关键词拦截不能替代权限边界。

代码按 [MIT License](LICENSE) 的 “AS IS” 条款提供，不作可用性、准确性、适销性或特定用途保证；责任范围以许可证及适用法律为准。第三方组件的商业使用、修改及再分发须另行核对其授权，不能仅依赖本仓库许可。

### 视频分镜（可选插件）

支持接入 [SAOS-3624/dsh-video-storyboard](https://github.com/SAOS-3624/dsh-video-storyboard)（当前适配0.6.5，Apache-2.0），依赖 FFmpeg/ffprobe；网页视频另需 yt-dlp。插件由 DSH profile 单独安装，不捆绑其源码。

主人私聊中的 QQ 视频会保留媒体元数据，通过 qq_get_message_detail 返回视频链接，再按需调用 video_probe / video_storyboard / video_zoom；目前要求网关提供可下载的 HTTP(S) 视频链接，只有网关内部文件路径时需重新发送。普通群聊不开放本机视频工具。B站子任务可对已有字幕的视频补看分镜，仍跳过无字幕视频。

QQ与刷站工具执行期限制每次分镜窗口最多300秒、48帧、2张图，像素预算最多640000；提示词默认360000。长视频分段、按需查看。分镜是抽帧概览，不代表逐帧观看；未配置ASR时不具备语音转写能力，不声称听过音轨。图片计入模型输入实际usage，插件估算不是账单。

安装不会自动配置ASR/OCR，不自动授予额外账号权限；获取与处理视频须符合平台规则和内容使用授权。项目与腾讯、哔哩哔哩等平台无隶属关系。

云端 Web profile 安装示例：

```sh
apt-get install -y --no-install-recommends ffmpeg yt-dlp
dsh plugin --profile web add dsh-video-storyboard@0.6.5
```

某些 DSH Web 安装未暴露插件的可选 peer `@deepseek-ai/dsh-tools`，此时需将服务环境变量 `DSH_TOOLS_PATH` 指向当前 DSH 安装树内该包的 `lib/index.js`，随后重启 DSH 与桥接；不应因此再安装另一套宿主或无关插件。以插件实际注册并返回图片为准，不能只看包已安装。

B站登录态复用是显式开启的：将 `~/.dsh/video.json` 的 `cookies` 设置为 `~/.dsh/bili-video-cookies.txt` 的实际绝对路径。视频工具执行前，桥接守卫会从已有的 `state/bili/bili_credential.json` 刷新这个专用 Netscape Cookie 文件（权限600）；缺失或不完整凭据会删除旧导出并拒绝调用。自定义 Cookie 文件不会被覆盖。Cookie、视频缓存和运行状态不得提交仓库。
