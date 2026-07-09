# CodyWebUI 最终产品目标

本文档定义 CodyWebUI 的长期目标。

当前 CodyWebUI 只支持 Codex。本愿景文档仍以 Codex 为第一运行时来描述能力边界；未来如果接入其他 agent runtime，也应该沿用这里定义的本地优先、浏览器可控、可并行、可审计、可回滚的产品原则。

最终目标不是简单把 Codex 桌面版搬到浏览器里，而是把它做成一个本地优先、浏览器可控、可并行、可审计、可回滚的 AI 软件工程操作系统。用户应该可以在任意设备上启动、监督、审批、审查、验证、回滚和交付 AI 编程任务。

## 一句话定位

CodyWebUI 应该先演进成一个 **Codex Agent Control Tower**，再逐步沉淀为更通用的 AI coding agent control tower。

它应该融合：

- Codex 本地 app-server 和 CLI 的执行能力。
- 浏览器化工程工作区。
- 可信审批、审计和回滚层。
- 多 Agent 任务编排层。
- 可自定义皮肤和布局的专业工作台界面。

用户不应该感觉自己只是在用一个远程聊天窗口，而应该感觉自己在操作一个面向 AI 编程任务的工程控制系统。

## 北极星体验

成熟状态下，一个典型流程应该是：

1. 用户打开浏览器，选择一个 workspace。
2. 首页展示仓库健康状态、活跃任务、运行中的 Agent、分支状态、端口、终端和最近的 Codex 会话。
3. 用户输入需求，例如：“重构支付回调逻辑，并补齐测试。”
4. 系统把自然语言需求转成明确任务，包含目标、风险、预计影响文件、验证计划和审批要求。
5. 用户选择单 Agent 执行或多 Agent 工作流。
6. 调研 Agent 检查代码、测试、历史记录和项目规则。
7. 实现 Agent 在隔离分支或 git worktree 中修改代码。
8. Reviewer Agent、Test Agent、Security Agent 审查结果。
9. UI 展示最终 diff、命令记录、测试结果、预览截图、风险说明和 PR body。
10. 用户可以接受、拒绝、回滚、合并、创建 PR，或要求继续迭代。
11. 整个执行轨迹可以回放、审计和复盘。

## 最终产品系统

### 1. Workspace 系统

Workspace 是最顶层的产品对象，不只是一个 `cwd`。

每个 workspace 应该支持：

- 本地目录、git 仓库、分支和 worktree 感知。
- 多仓库项目。
- workspace 级配置文件 `.cody-web-ui.yml`。
- 默认模型、reasoning effort、协作模式、sandbox 模式和审批策略。
- 项目脚本、启动命令、已知端口和验证命令。
- 来自 `AGENTS.md`、Codex config、本地 skills、MCP servers 和自定义规则的项目上下文。
- 环境健康检查。
- workspace trust 状态。
- secrets 和敏感路径策略。
- 最近会话、活跃任务和任务历史。

Workspace 首页应该展示：

- 活跃任务和阻塞审批。
- Git 分支和 dirty file 状态。
- 正在运行的终端和后台命令。
- 暴露中的开发端口和预览入口。
- 最近 Codex 会话。
- rate limit 和 token 使用概览。
- 远程访问风险、sandbox 过宽等安全警告。

### 2. Task 系统

Codex thread 应该被提升为工程任务，而不只是聊天记录。

每个 task 应该包含：

- 标题和目标。
- workspace 和分支/worktree。
- 当前状态。
- plan 和 todo。
- 负责的 Agent。
- 关联文件和目录。
- 工具调用。
- 审批请求。
- 文件变更。
- 命令执行记录。
- 测试和验证结果。
- 预览链接和截图。
- 风险标签。
- 成本、token 使用和耗时。
- 最终总结和交付物。

推荐 task 状态：

- `queued`
- `planning`
- `waiting_for_approval`
- `coding`
- `testing`
- `reviewing`
- `failed`
- `ready_for_review`
- `ready_to_merge`
- `merged`
- `interrupted`
- `archived`

UI 必须让用户一眼看出任务当前是在运行、阻塞、失败、完成，还是等待用户操作。

### 3. 多 Agent 编排系统

成熟产品不应该只支持单个 Codex session，而应该支持 Agent 团队。

必须支持：

- 一键拆任务。
- 多个调研 Agent 并行工作。
- 多个实现 Agent 并行工作。
- Reviewer Agent。
- Test Agent。
- Security Agent。
- Docs / Release Notes Agent。
- 每个 Agent 独立模型、reasoning 和工具配置。
- 每个 Agent 独立权限策略。
- 每个 Agent 独立分支或 git worktree。
- Agent 状态卡片。
- 跨 Agent 结果汇总。
- 多实现方案对比。
- 选择性合并或丢弃 Agent 输出。

产品应该同时支持用户手动编排和 workflow 模板。

示例 workflow：

- `feature-build`：调研、计划、实现、测试、审查、总结。
- `bug-fix`：复现、诊断、修复、验证、回归测试。
- `review-diff`：审查当前变更，识别风险并提出修复建议。
- `address-pr-comments`：读取 PR comments，修复问题并更新总结。
- `run-tests-and-fix`：运行测试，修复失败，重新运行。
- `security-scan`：检查高风险文件、依赖变更、secrets 和权限问题。
- `release-notes`：把已合并工作整理成 release notes。

### 4. 开发工作台系统

浏览器界面应该足够完成一次工程任务闭环，不需要频繁回到桌面 IDE。

必须具备的面板：

- 项目和线程侧边栏。
- Agent 任务看板。
- 对话和计划时间线。
- 工具调用时间线。
- 审批中心。
- 文件树。
- 基于 Monaco 的文件查看器和轻量编辑器。
- side-by-side diff viewer。
- 终端输出和交互式终端。
- Git 面板。
- 测试、lint、typecheck、build 结果面板。
- Problems 面板。
- 端口和预览面板。
- 支持响应式设备尺寸的浏览器预览。
- 日志和诊断面板。

上下文注入应该支持：

- `@file`
- `@folder`
- `@diff`
- `@terminal`
- `@problems`
- `@test-results`
- `@preview`
- `@recent-thread`
- `@workspace-rules`

工作台应该围绕 Agent 任务监督来组织，而不是追求完整复刻 VS Code。

### 5. 审批与安全系统

远程浏览器访问 Codex 等价于远程访问本机代码、工具、凭证和命令执行能力。安全必须是一等产品系统。

必须具备：

- 默认只监听 `localhost`。
- 绑定公网地址时明确警告。
- 密码或 token 认证。
- 登录限速。
- HTTPS 和反向代理部署指南。
- 短期 session token。
- 设备信任。
- workspace root 限制。
- read-only、workspace-write、danger 模式。
- command allowlist 和 denylist。
- 敏感文件和目录保护。
- `.gitignore`、`.aiignore` 和自定义 ignore 支持。
- MCP server 状态、来源、权限和审批策略。
- 每个审批请求都带风险标签。
- 审批范围：单次、本 session、本 workspace、永久。
- 审批审计日志。
- 端口暴露策略。
- secrets 泄露检测。
- 危险模式醒目标识。

审批请求不应该是泛泛的弹窗。它应该解释请求内容、风险原因和潜在后果。

示例风险标签：

- 删除文件。
- 写入 workspace 外路径。
- 读取敏感路径。
- 安装依赖。
- 发起网络连接。
- 运行高权限命令。
- 使用外部 MCP 工具。
- 修改 lockfile。
- 修改认证、支付或权限相关代码。

### 6. 验证系统

成熟产品不能依赖 Agent 声称“测试通过”。它必须展示真实证据。

每个 task 都应该有验证计划：

- 应该运行哪些命令。
- 哪些测试相关。
- 是否应该运行 lint、typecheck 或 build。
- 是否需要启动服务。
- 哪些端口需要预览。
- 是否需要浏览器冒烟测试。
- 是否需要截图。
- 是否需要人工确认。

验证输出应该包含：

- 命令。
- 工作目录。
- 触发者。
- 开始和结束时间。
- 耗时。
- 退出码。
- stdout 和 stderr。
- 解析后的失败摘要。
- 重跑次数。
- 截图或预览链接。
- 可用时展示 coverage 或受影响测试。
- 剩余风险和未验证区域。

任务不能只因为 Agent 说完成了就进入 ready 状态，必须清楚展示哪些验证做了、哪些没做。

### 7. Diff、Review 和回滚系统

用户只有在恢复手段足够强时，才敢把代码交给自主 Agent 修改。

必须具备：

- 文件级 diff。
- hunk 级 diff。
- 接受或拒绝单个 hunk。
- 回滚单文件。
- 回滚选中 hunk。
- 回滚整个 task。
- 命名 checkpoint。
- 每个 turn 自动 checkpoint。
- patch 导出。
- 把 patch 应用到其他分支或 worktree。
- 生成 commit message。
- 生成 PR body。
- 生成风险摘要。
- Reviewer Agent 评论。
- 人类对 diff 行评论。
- 从 review comment 创建 follow-up task。

Agent 的最终输出应该像一个可审查的工程变更，而不是一段聊天回复。

### 8. 通知和移动端系统

长任务需要远程监督。

必须支持的通知事件：

- 任务开始。
- 任务等待审批。
- 需要用户输入。
- 命令失败。
- 测试失败。
- 任务完成。
- 任务 ready for review。
- 检测到安全风险。
- rate limit 或 token budget 问题。

通知渠道：

- 浏览器通知。
- 移动端 Web 通知。
- Webhook。
- Slack。
- 飞书/Lark。
- 后续可选 Email。

移动端应该优先支持：

- 任务状态。
- 审批操作。
- diff 摘要。
- 测试摘要。
- 风险摘要。
- continue、pause、interrupt、archive 操作。
- 简短 follow-up 输入。

移动端不需要完整 IDE 能力。

### 9. 审计和轨迹回放系统

每个 task 都应该可以回放。

轨迹应该包含：

- 初始用户请求。
- 选中的 workspace 和设置。
- 生效的 rules 和 skills。
- plan 更新。
- 工具调用。
- 命令执行。
- 文件变更。
- 审批决策。
- 测试结果。
- Agent 消息。
- 用户 follow-up。
- checkpoint。
- 最终总结。

轨迹回放用于调试 Agent 行为、复盘团队决策、审计高风险动作和改进 workflow。

### 10. 主题、皮肤和自定义系统

成熟产品应该有一个精致默认视觉，同时支持用户自定义皮肤。

皮肤能力必须作为架构层设计，不能散落成各处 CSS override。

#### Theme Core

组件必须消费语义化 design tokens，不能写死具体颜色。

Token 分组应该包括：

- 颜色。
- 字体。
- 间距。
- 圆角。
- 边框。
- 阴影。
- 动效。
- 密度。
- 代码高亮。
- 终端配色。
- 图表配色。
- 状态颜色。

示例 token 类型：

```ts
export type ThemeTokens = {
  color: {
    background: string
    surface: string
    panel: string
    elevated: string
    text: string
    textMuted: string
    border: string
    accent: string
    danger: string
    warning: string
    success: string
    info: string
  }
  radius: {
    sm: string
    md: string
    lg: string
  }
  shadow: {
    panel: string
    floating: string
    focus: string
  }
  motion: {
    fast: string
    normal: string
    slow: string
  }
  density: 'compact' | 'comfortable' | 'spacious'
}
```

Vue 组件应该使用语义 class 和 CSS variables：

```css
.panel {
  background: var(--color-panel);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
```

组件不应该写死这种值：

```css
background: #0f172a;
```

#### Skin Packs

皮肤包是完整视觉风格包。

```ts
export type SkinPack = {
  id: string
  name: string
  tokens: ThemeTokens
  syntaxTheme: 'light' | 'dark' | string
  terminalTheme: Record<string, string>
  chartPalette: string[]
  background?: {
    type: 'solid' | 'grid' | 'noise' | 'image' | 'animated'
  }
}
```

推荐内置皮肤：

- `Codex Classic`：接近当前桌面版体验，克制、清晰、耐看。
- `Control Tower`：深色工程控制台，适合多 Agent 监督。
- `Cyber Ops`：高对比、霓虹强调、状态信息密集。
- `Light Pro`：亮色办公风，适合长时间阅读。
- `Terminal`：终端优先，适合命令和日志密集工作。
- `Mobile Focus`：适合小屏审批和摘要查看。

默认高级皮肤建议是 `Control Tower`：深色、专业、信息密度高，有 Agent 状态灯、清晰风险色、时间线轨道，并保证 diff 和 terminal 的可读性。

#### Layout Presets

布局预设应该和皮肤解耦。

推荐布局：

- `Chat Focus`：对话优先。
- `Review Focus`：diff、审批、验证优先。
- `Ops Dashboard`：多 Agent 控制塔。
- `IDE Mode`：文件树、编辑器、终端、预览。
- `Mobile Review`：状态、审批、摘要优先。

同一个皮肤应该可以套用到所有布局预设。

#### 自定义能力

用户应该可以：

- 切换内置皮肤。
- 跟随系统深浅色。
- 导入和导出 skin JSON。
- 调整 accent color。
- 调整界面密度。
- 选择字体。
- 选择代码高亮主题。
- 选择终端主题。
- 配置背景风格。
- 为 workspace 绑定皮肤。
- 为 workspace 绑定布局预设。
- 应用前预览主题效果。

建议实现为独立 theme 模块：

```text
src/theme/
  tokens.ts
  skins/
    codexClassic.ts
    controlTower.ts
    cyberOps.ts
    lightPro.ts
    terminal.ts
    mobileFocus.ts
  themeRegistry.ts
  useTheme.ts
  applyTheme.ts
```

核心原则：皮肤可以自由变化，但组件语义必须稳定。

## 产品成熟阶段

### Stage 1: 可信远程控制台

目标：让浏览器版本安全、可信、可用。

交付物：

- 稳定 task/session 状态。
- 工具调用时间线。
- 审批中心。
- Diff review。
- 命令输出。
- 基础回滚。
- 安全警告。
- 断线重连和状态恢复。
- 移动端审批视图。

### Stage 2: 浏览器开发闭环

目标：用户不切回桌面工具，也能完成日常编码任务。

交付物：

- 文件树。
- Monaco 文件查看和轻量编辑。
- Git 面板。
- 终端面板。
- 测试和 build 结果。
- 端口代理和预览。
- workspace 配置文件。
- 上下文选择器。
- 浏览器通知。

### Stage 3: Agent Control Tower

目标：把产品升级成多 Agent 工程驾驶舱。

交付物：

- 多 Agent 任务看板。
- worktree 隔离。
- workflow 模板。
- Reviewer/Test/Security agents。
- 自动验收流水线。
- 多方案对比。
- 轨迹回放。
- 风险分析。
- PR 生成。

### Stage 4: 个性化工程控制台

目标：让产品变得精致、可扩展、可个性化。

交付物：

- Theme token 系统。
- 内置皮肤包。
- 皮肤导入/导出。
- 布局预设。
- workspace 级自定义。
- 高级 dashboard。
- Agent 质量指标。
- 成本和 token 分析。

### Stage 5: 团队和企业层

这个阶段应该在单用户体验足够强后再做。

交付物：

- 多用户认证。
- 团队权限。
- SSO。
- 组织策略。
- 中央审计日志。
- 共享 workflows。
- 共享 rules 和 templates。
- GitHub issue / PR 集成。
- Slack / 飞书运维入口。

## 架构演进方向

当前架构是：

- Vue 前端。
- Express 后端。
- 后端 spawn `codex app-server`。
- 前端通过 `/codex-api` 使用 RPC，并通过 `/codex-api/ws` 接收 WebSocket 实时通知。

成熟架构应该拆分职责。

### Codex Gateway

职责：

- 启停 `codex app-server`。
- 转发 JSON-RPC。
- 订阅 Codex notifications。
- 响应 server-initiated requests。
- 隔离 app-server 协议变化。

### Session Domain

职责：

- 把原始 app-server events 转成稳定领域对象。
- 追踪 thread、turn、task、tool call、approval、file change、command run 和 validation state。
- 向前端暴露 snapshot API。
- 支持 reconnect 和 replay。

### Workspace Service

职责：

- 追踪 workspace roots。
- 提供文件树和文件读取 API。
- 执行 workspace 边界限制。
- 加载 `.cody-web-ui.yml`。
- 加载项目 rules、scripts 和 known ports。
- 应用 ignore 和敏感路径策略。

### Tooling Service

职责：

- Git status、diff、stage、commit、branch、worktree 操作。
- Diff snapshot 和 rollback 操作。
- Terminal sessions。
- 端口发现和代理。
- Test、lint、typecheck、build 命令注册。
- Preview 和 screenshot 支持。

### Security Policy Service

职责：

- Auth 状态。
- Session tokens。
- Workspace trust。
- Command policies。
- MCP policies。
- 敏感文件策略。
- 审批审计日志。
- 远程暴露警告。

### Event Store And Snapshot Service

职责：

- 持久化关键 task events。
- 持久化 task snapshots。
- 支持浏览器刷新恢复。
- 支持轨迹回放。
- 支持搜索和过滤。

### Theme System

职责：

- 注册 theme tokens。
- 注册内置 skins。
- 把 skin variables 应用到 document。
- 持久化用户和 workspace 级主题偏好。
- 校验导入的 skin packs。
- 保持 UI components 与具体视觉风格解耦。

## 近期不做的事

即使在长期愿景里，以下也不应该是早期优先级：

- 完整复刻 VS Code。
- 扩展市场。
- 完整 debugger 替代品。
- 多人实时协同编辑。
- 云容器平台替代品。
- 在单用户远程安全还不强之前做复杂企业 SSO。
- 不服务于任务监督、审批、审查、验证和回滚的装饰型 dashboard。

产品应该始终聚焦 AI 工程任务控制。

## 成功标准

成熟产品应该满足：

- 用户可以在一个浏览器里启动复杂 Codex 任务，并在另一个设备上监督。
- 每个风险动作都可见、可解释、可审计。
- 每个代码变更都可审查、可回滚。
- 每个验证结论都有真实命令证据。
- 多个 Agent 可以并行工作而不污染主 workspace。
- 浏览器 UI 足以端到端完成工程任务。
- 皮肤和布局可以自定义，而不需要重写组件。
- 默认体验像专业 AI 工程控制塔，而不是聊天包装器。

## 总结

最终目标是一个 AI 软件工程控制台。

CodyWebUI 应该让用户像操作一个工程系统一样操作 Codex：任务化、多 Agent、安全、可审查、可验证、可回放、可回滚、支持移动端，并且支持视觉皮肤和布局自定义。

最短路径是先把可信远程控制层做好。最雄心勃勃的终局，是一个可自定义的 AI coding agent control tower，用于严肃的本地和远程软件工程工作。Codex 是当前唯一支持的运行时，也是最优先打磨的运行时。
