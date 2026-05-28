# Oksskolten 自定义改造计划

## 背景
上游仓库 babarot/oksskolten 限制了协作者才能提 PR。我们基于 fork 自用，按功能拆分为独立分支，方便后续上游合并或独立维护。

## 分支规划

| 分支 | 功能 | 优先级 |
|------|------|--------|
| `feat/i18n-zh` | 简体中文 ✅ 已完成 | P0 |
| `feat/custom-llm-providers` | DeepSeek + Mimo + 自定义 API + 模型获取 | P1 |
| `feat/auto-summary-toggle` | 自动摘要开关 | P2 |
| `feat/translation-enhanced` | 翻译复用 LLM 配置 + 源/目标语言 + 沉浸式翻译 | P2 |

每个分支独立，可单独合并或 cherry-pick。

---

## Phase 1: 自定义 LLM Provider (`feat/custom-llm-providers`)

### 目标
添加 DeepSeek API、Xiaomi Mimo、自定义 OpenAI 兼容 API 的接入选项，支持获取可用模型列表和选择。

### 后端改动

**1. 新增 Provider 实现** (`server/providers/llm/`)

三个新 provider 都是 OpenAI 兼容格式，复用 OpenAI SDK：

- `deepseek.ts` — DeepSeek API
  - Base URL: `https://api.deepseek.com/v1`
  - API Key: `getSetting('api_key.deepseek')`
  - 模型获取: `GET /v1/models`
  
- `mimo.ts` — Xiaomi Mimo
  - Base URL: `https://api.mimo.ai/v1` (待确认)
  - API Key: `getSetting('api_key.mimo')`
  - 模型获取: `GET /v1/models`

- `custom.ts` — 自定义 OpenAI 兼容 API
  - Base URL: `getSetting('custom.base_url')`
  - API Key: `getSetting('api_key.custom')`
  - 显示名: `getSetting('custom.name')` — 如 "My Proxy"
  - 模型获取: `GET {base_url}/v1/models`

额外：给 Anthropic provider 加可选 Base URL 覆盖（默认官方地址），用于代理场景。
  - Setting Key: `anthropic.base_url`（空则用官方地址）

**2. 注册 Provider** (`server/providers/llm/index.ts`)
- 在 registry map 中添加 `deepseek`, `mimo`, `custom`

**3. 模型列表 API** (`server/routes/settings.ts`)
- `GET /api/settings/deepseek/models` — 获取 DeepSeek 模型列表
- `GET /api/settings/mimo/models` — 获取 Mimo 模型列表
- `GET /api/settings/custom/models` — 获取自定义 API 模型列表
- 复用现有的 `ollamaFetch` 模式（fetch + 5s timeout + 错误处理）

**4. Settings Keys**
- `api_key.deepseek` — DeepSeek API Key
- `api_key.mimo` — Mimo API Key
- `api_key.custom` — 自定义 API Key
- `custom.base_url` — 自定义 API Base URL
- `custom.api_format` — API 格式: `openai` / `anthropic`
- `custom.name` — 自定义 API 显示名称（可选）

### 前端改动

**1. Provider Config Section** (`src/pages/settings/sections/provider-config-section.tsx`)
- 新增 `DeepseekCard` — API Key 输入 + 测试连接 + 模型列表预览
- 新增 `MimoCard` — 同上
- 新增 `CustomCard` — Base URL 输入 + API Key + API 格式选择（OpenAI/Anthropic）+ 显示名 + 测试连接
- 复用 `ApiProviderCard` 模式

**2. Task Model Section** (`src/pages/settings/sections/task-model-section.tsx`)
- `ProviderButtons` 添加 deepseek / mimo / custom 按钮
- `ModelSelect` 添加动态模型获取逻辑（SWR fetch）

**3. Shared Models** (`shared/models.ts`)
- 添加 `DEEPSEEK_MODELS` 静态模型列表（备用，当 API 不支持 /v1/models 时）
- 更新 `MODELS_BY_PROVIDER` 映射

**4. i18n**
- 新增所有新 provider 相关的翻译键（中/日/英）

---

## Phase 2: 自动摘要开关 (`feat/auto-summary-toggle`)

### 目标
在 AI & Translation → Provider per Feature 中，提供"是否自动摘要"开关。

### 改动

**1. 新增 Setting Key**
- `summary.auto` — `true` / `false`（默认 `false`）

**2. 前端** (`task-model-section.tsx`)
- Summary 任务区域添加 Toggle 组件
- 说明文字：开启后获取文章时自动生成摘要

**3. 后端** (`server/fetcher/ai.ts` + `server/routes/articles.ts`)
- 在文章获取流程中，检查 `summary.auto` 设置
- 如果开启，自动触发 `summarizeArticle()` 并存储结果

**4. i18n**
- 新增 `settings.autoSummary`, `settings.autoSummaryDesc` 等翻译键

---

## Phase 3: 翻译增强 (`feat/translation-enhanced`)

### 目标
- 翻译服务可选择复用 LLM Provider 配置或单独配置翻译服务
- 支持选择源语言和目标语言
- 翻译模式：全文翻译 vs 沉浸式翻译（中英对照）

### 改动

**1. Translation Services 区域重构** (`provider-config-section.tsx`)
- 添加"复用 LLM 配置"开关
  - 开启时：翻译直接使用 Provider per Feature 中 Translation 任务配置的模型
  - 关闭时：显示 Google Translate / DeepL 独立配置（现有逻辑）
- 源语言选择：自动检测 / 日语 / 英语 / 中文 / 其他
- 目标语言选择：当前 UI 语言 / 日语 / 英语 / 中文 / 自定义

**2. 沉浸式翻译模式**
- 新增 Setting Key: `translate.mode` — `full` / `immersive`
- `full`: 现有逻辑，替换整篇文章内容
- `immersive`: 保留原文，逐段插入译文（原文+译文对照显示）
- 前端在文章详情页添加翻译模式切换按钮

**3. 后端改动**
- `server/fetcher/ai.ts` — `translateArticle()` 支持新参数：`sourceLang`, `targetLang`, `mode`
- 沉浸式翻译：后端返回结构化数据 `{ original: string, translated: string }[]`，前端做并排渲染
- `server/routes/settings.ts` — 新增 settings keys

**4. 新增 Settings Keys**
- `translate.reuse_llm` — `true` / `false`
- `translate.source_lang` — 源语言代码
- `translate.target_lang` — 目标语言代码（扩展现有 `translate.target_lang`）
- `translate.mode` — `full` / `immersive`

**5. i18n**
- 新增所有翻译增强相关翻译键

---

## 实施顺序

1. **Phase 1** (最核心，P1) — 自定义 LLM Provider
   - 预计改动文件：~10 个
   - 新增文件：3 个 provider + 前端组件

2. **Phase 2** (简单，P2) — 自动摘要开关
   - 预计改动文件：~4 个
   - 主要是 toggle + 后端条件触发

3. **Phase 3** (复杂，P2) — 翻译增强
   - 预计改动文件：~8 个
   - 沉浸式翻译需要前端新组件

## 构建 & 部署
每个 Phase 完成后：
1. 合并到主分支
2. 构建 `oksskolten-zh` Docker 镜像
3. 替换运行中的容器
4. 本地测试验证
