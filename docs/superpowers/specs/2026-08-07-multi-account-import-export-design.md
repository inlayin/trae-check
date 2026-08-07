# 多账号导入导出功能设计

> 日期：2026-08-07
> 状态：待实现

## 1. 背景与目标

TraeCheck 应用已支持多账号管理和自动签到，但账号数据仅存储在本机 electron-store 中，用户无法在设备间迁移账号配置。本功能为账号管理页新增导入/导出能力，支持以 JSON 文件形式批量备份和恢复账号数据。

### 核心需求

- 导出：支持勾选指定账号 + 一键导出全部，JSON 格式，含敏感凭证但需二次确认
- 导入：从 JSON 文件恢复账号，冲突时弹窗让用户选择跳过或覆盖
- 入口：账号管理页顶栏，「添加账号」按钮旁新增「导入」「导出」按钮

## 2. 数据格式

### 导出 JSON Schema

```json
{
  "version": 1,
  "exportedAt": 1720000000000,
  "appVersion": "1.0.3",
  "containsCredentials": true,
  "count": 2,
  "accounts": [
    {
      "id": "...",
      "name": "账号备注",
      "cookie": "...",
      "createdAt": 1720000000000,
      "enabled": true,
      "desktopUserId": "...",
      "encryptedCredential": "...",
      "credentialStatus": "valid"
    }
  ]
}
```

### 字段说明

| 字段 | 导出 | 说明 |
|---|---|---|
| id | ✅ | 账号唯一标识 |
| name | ✅ | 账号备注名 |
| cookie | ✅ | 登录 cookie |
| createdAt | ✅ | 创建时间 |
| enabled | ✅ | 是否启用 |
| desktopUserId | ✅ | 桌面用户 ID |
| encryptedCredential | ✅ | 加密凭证 |
| credentialStatus | ✅ | 凭证状态 |
| lastCheckinAt | ❌ | 运行态，不导出 |
| lastCheckinResult | ❌ | 运行态，不导出 |
| lastCheckinMessage | ❌ | 运行态，不导出 |
| points | ❌ | 运行态，不导出 |

### 冲突匹配规则

- 优先按 `desktopUserId` 匹配（桌面凭证账号）
- 无 `desktopUserId` 时，按 `name` + `cookie` 前 32 字符组合匹配

### 凭证跨机器说明

`encryptedCredential` 由 `safeStorage` 加密，绑定本机。跨机器导入后该凭证无效，账号 `credentialStatus` 显示为 `expired`，用户需重新导入桌面凭证。导出文件中 `containsCredentials: true` 标志用于前端提示。

## 3. 后端架构（Electron 主进程）

### 新增 IPC 接口

在 `electron/ipc.ts` 中新增：

| Channel | 入参 | 返回 | 功能 |
|---|---|---|---|
| `accounts:export-to-file` | `{ ids: string[], includeCredentials: boolean }` | `{ success, path?, message? }` | 弹保存对话框，写 JSON 文件（`includeCredentials=false` 时清空 cookie/encryptedCredential） |
| `accounts:import-from-file` | 无 | `{ success, accounts?, conflicts?, invalidCount?, message? }` | 弹打开对话框，读 JSON，校验，返回预览 |
| `accounts:import` | `{ accounts, strategy: 'skip'\|'overwrite' }` | `{ success, imported, skipped, message? }` | 按策略写入 store |

### store.ts 新增

- `bulkSaveAccounts(accounts: Account[], strategy: 'skip' | 'overwrite')` — 批量写入，支持去重策略
  - `skip`：冲突项跳过
  - `overwrite`：冲突项用导入数据覆盖

### 导出流程

1. 渲染进程传入选中的 accountId[]
2. 主进程查 store 获取完整 Account[]（含 encryptedCredential）
3. 主进程弹出 `dialog.showSaveDialog`（默认文件名 `trae-check-accounts-YYYYMMDD.json`）
4. 写入文件，返回 `{ success, path }`

### 导入流程

1. 主进程弹 `dialog.showOpenDialog`，读取文件
2. 校验 JSON schema（version 字段存在、accounts 数组结构合法）
3. 与现有 store 账号比对，标记冲突项（为每个账号附加 `conflict: boolean` 标志）
4. 返回预览数据给渲染进程
5. 用户在弹窗中确认冲突策略后，调用 `accounts:import` 写入

### 校验规则

- 顶层 `version` 字段必须为数字
- `accounts` 必须为数组
- 每个账号至少包含 `id` 和 `name` 字段
- 非法账号计入 `invalidCount`，不阻塞合法账号导入

## 4. 前端架构

### 新增组件

| 组件 | 职责 |
|---|---|
| `ExportModal.vue` | 导出弹窗：账号多选列表 + 「包含凭证」复选框 + 导出按钮 |
| `ImportModal.vue` | 导入弹窗：文件预览 + 冲突列表 + 冲突策略选择 + 导入按钮 |

### App.vue 顶栏改动

在「添加账号」按钮旁新增：
- 「导入」按钮 → 触发文件选择 → 打开 ImportModal
- 「导出」按钮 → 打开 ExportModal（无账号时禁用）

### stores/app.ts 新增方法

- `exportAccounts(ids: string[], includeCredentials: boolean)` — 调用 IPC 保存文件，返回结果
- `importPreview()` — 调用 IPC 选文件，返回预览数据
- `importAccounts(accounts, strategy)` — 执行导入，刷新账号列表

### preload.ts 新增暴露

```ts
exportAccounts: (ids: string[], includeCredentials: boolean) =>
  ipcRenderer.invoke('accounts:export-to-file', { ids, includeCredentials }),
importPreview: () => ipcRenderer.invoke('accounts:import-from-file'),
importAccounts: (data: { accounts: any[], strategy: 'skip' | 'overwrite' }) =>
  ipcRenderer.invoke('accounts:import', data),
```

## 5. 交互流程

### 导出流程

1. 点击「导出」→ 打开 ExportModal，展示全部账号带 checkbox（默认全选）
2. 底部有「包含登录凭证（cookie、加密凭证）」复选框，默认勾选，旁边有 ⚠️ 提示文字
3. 点击「导出」按钮：
   - 若勾选了包含凭证 → 弹二次确认对话框：「导出文件包含登录凭证，请注意保管，确认导出？」
   - 若未勾选 → 直接导出（仅元数据，清空 cookie/encryptedCredential 字段）
4. 调用主进程保存文件，成功后 toast 提示文件路径

### 导入流程

1. 点击「导入」→ 调用主进程打开文件选择框
2. 选择文件后主进程解析并返回 `{ accounts, conflicts, invalidCount }`
3. 打开 ImportModal 展示：
   - 顶部统计：共 N 个账号，其中 M 个与现有账号冲突
   - 账号预览列表（名称、desktopUserId、状态标记：新增/冲突）
   - 冲突策略单选：「跳过冲突账号」/「覆盖冲突账号」（默认跳过）
4. 点击「导入」→ 执行写入，toast 提示「成功导入 X 个，跳过 Y 个」

### 错误处理

- 文件格式无效 → toast 错误提示
- 文件读取失败 → toast 错误提示
- 导入 0 个有效账号 → 提示「没有可导入的账号」

## 6. 涉及文件

| 文件 | 操作 | 改动内容 |
|---|---|---|
| `electron/types.ts` | 编辑 | 新增导入预览结果、导入结果类型定义 |
| `electron/store.ts` | 编辑 | 新增 `bulkSaveAccounts` 方法 |
| `electron/ipc.ts` | 编辑 | 新增 3 个 IPC handler |
| `electron/preload.ts` | 编辑 | 新增 3 个 API 暴露 |
| `src/stores/app.ts` | 编辑 | 新增导出/导入相关 store 方法 |
| `src/components/ExportModal.vue` | 新建 | 导出弹窗组件 |
| `src/components/ImportModal.vue` | 新建 | 导入弹窗组件 |
| `src/App.vue` | 编辑 | 顶栏新增按钮 + 引入新组件 + 状态管理 |

## 7. 风险与注意事项

1. **凭证跨机器无效**：`encryptedCredential` 绑定本机 safeStorage，跨机器导入后需重新导入桌面凭证。导入弹窗中需提示用户此限制。
2. **JSON 格式兼容**：导出文件含 `version` 字段，后续格式变更可通过版本号兼容处理。
3. **ipc.ts 体积**：当前 ipc.ts 约 250 行，新增 3 个 handler 后仍在合理范围内，暂不拆分模块。
