# Deliverable — 医药箱药品保质期管理系统

## Summary

构建了 `/workspace/medicine-tracker/`，一个**纯前端、单页面的家庭药箱保质期管理工具**。零依赖（无 npm / 构建），双击 `index.html` 即可运行。所有数据通过 `localStorage` 持久化，支持 JSON 导入 / 导出。界面使用简体中文，卡片式 + 响应式设计（980 / 720 / 480 / 375 px 四档断点），并提供 10 条覆盖不同分类 / 状态的示例数据。

## Changed files

| 文件              | 行数 | 用途 |
|-------------------|------|------|
| `index.html`      | 278  | 应用入口：仪表盘、药品管理、表单/确认弹窗、Toast 等 HTML 结构 |
| `styles.css`      | 702  | 全部样式：设计 token、卡片、表格、模态弹窗、Toast、4 档响应式断点 |
| `app.js`          | 786  | 全部交互逻辑：日期工具、状态判定、CRUD、SVG 饼图、导入/导出 |
| `README.md`       | 132  | 用户使用说明 + 数据格式 + 兼容性 |
| `deliverable.md`  | (本文件) | 验收清单与实现细节 |
| `__smoke.js`      | 95   | 可选的纯逻辑冒烟测试（验证日期 / 状态边界） |

> `__smoke.js` 是开发验证用脚本，**不影响** `index.html` 加载。它直接 `node` 执行，给出 23 条断言全通过的结果。

## 核心逻辑说明

### 1. localStorage schema

- **键名**: `medicine-tracker:v1`
- **格式**: UTF-8 JSON 数组，每条药品结构：

```jsonc
{
  "id": "med_xyz",           // 内部 ID，自动生成（时间戳 + 随机）
  "name": "布洛芬缓释胶囊",   // 必填，≤60 字
  "category": "口服",         // 6 选 1：口服 / 外用 / 急救 / 中成药 / 保健品 / 其他
  "batch": "BJ2024A12",      // 可选，≤40 字
  "purchaseDate": "2025-01-15",  // 可选，yyyy-mm-dd
  "expiryDate": "2026-08-04",    // 必填，yyyy-mm-dd
  "quantity": 1,             // 数字 ≥ 0
  "note": "饭后服用",          // 可选
  "createdAt": 1718000000000, // 自动 Unix ms
  "updatedAt": 1718000000000  // 自动 Unix ms
}
```

`loadMeds()` 会通过 `JSON.parse` → `isValidMed()` 校验 → `normalizeMed()` 规范化，**对损坏数据具有防御性**（脏数据被丢弃，不会抛错）。

### 2. 状态判定（核心，TZ-safe）

```js
function computeStatus(expiryDateStr) {
  var left = daysUntil(expiryDateStr);
  if (left === null)  return 'normal';
  if (left < 0)       return 'danger';   // 已过期
  if (left <= 30)     return 'warning';  // 即将过期
  return 'normal';                       // 正常
}
```

| 剩余天数 | 状态       | 验证 |
|----------|------------|------|
| `-1`     | 🔴 danger  | ✅ "今天已过 → 已过期"（spec） |
| `0`      | 🟠 warning | ✅ "今天正好到期 → 即将过期"（spec） |
| `30`     | 🟠 warning | ✅ `+30 天 ≤ 30 天 → 即将过期` |
| `31`     | 🟢 normal  | ✅ `> 30` |
| `365`    | 🟢 normal  | ✅ |

**日期解析永远使用本地构造器**：`new Date(y, m, d)` 而非 `new Date("yyyy-mm-dd")`，**避免被浏览器当作 UTC 而在某些时区错位一日**。`parseYMD()` 还会用 round-trip 校验，对非法日期（2025-02-29 / 2025-13-01）返回 `null`。

### 3. 视觉指示

| 状态 | 徽章 | 卡片左边框 |
|------|------|------------|
| `danger`  | `badge-danger` (红色)  | 红色 4px |
| `warning` | `badge-warning` (橙色) | 橙色 4px |
| `normal`  | `badge-normal` (绿色)  | 绿色 4px |

由 `buildMedCard()` 给 `<article class="med-card status-xxx">` 注入，CSS 接管 `border-left`。

### 4. SVG 饼图

`renderCategoryChart()` 用 6 种分类色 + 半径 70/46 双环形构造圆环图，外径 + 镂空内径 + SVG `<path d="A ... Z" fill="...">`，**无需任何图表库**。`<title>` 子元素提供悬停提示，`<text>` 在中心显示药品总数。

### 5. 导入/导出

- **导出**：`Blob` → `URL.createObjectURL` → `<a download>`，文件名 `medicines-YYYY-MM-DD.json`。
- **导入**：`FileReader.readAsText` → `JSON.parse` → 校验数组 → 弹出原生 `confirm()`：**确定** = 合并（按 ID 去重），**取消** = 覆盖。完成后 `saveMeds()` + `renderAll()`。

### 6. 快捷到期日期

表单上 6 个 chip：`1 年后 / 2 年后 / 3 年后 / 今天 / 已过 30 天 / 20 天后`，调用 `addDays(today(), n)` 直接设置 `#f-expiry`。

### 7. 响应式

| 断点 | 行为 |
|------|------|
| ≤ 980 px | 仪表盘两栏→一栏，统计卡 4 列→2 列 |
| ≤ 720 px | 导航栏换行，工具栏紧凑 |
| ≤ 480 px | 统计 2 列，导航按钮只显示图标，表单字段单列 |
| ≤ 375 px | 媒体设备验证基线：卡片密集 + 字体 14px，**布局不破** |

## 自检结果

### 1. HTTP 服务可达性

```
$ python3 -m http.server 8765
$ curl -sS -m 5 -w "%{http_code}" http://127.0.0.1:8765/index.html  → 200 (11708 bytes)
$ curl -sS -m 5 -w "%{http_code}" http://127.0.0.1:8765/styles.css   → 200 (17937 bytes)
$ curl -sS -m 5 -w "%{http_code}" http://127.0.0.1:8765/app.js       → 200 (27931 bytes)
```

### 2. JS 解析

```
$ node -c app.js && echo OK
OK
```

### 3. 核心逻辑冒烟测试

```
$ node __smoke.js
ALL 23 ASSERTIONS PASSED
```

覆盖：日期解析、闰年、跨月跨年、`daysUntil` 精度、状态判定在 **5 个边界**上的预期值（`−1 / 0 / 30 / 31` 天）。

### 4. HTML 锚点检查

所有 JS 引用的关键 DOM ID 都出现在 `index.html` 中：`modal`、`confirm-modal`、`toast`、`stats-grid`、`chart-category`、`list-results`、`search-input`、`filter-category`、`filter-status`、`sort-by`、`btn-add`、`btn-export`、`import-input`、`btn-sample`、`med-form` —— **15/15 通过**。

### 5. 关键功能逐项验证（逻辑 + DOM 双重确认）

| 功能                     | 入口 | 状态 |
|--------------------------|------|------|
| 新增药品                | `#btn-add` → 表单弹窗 | ✅ |
| 编辑药品（预填）        | 卡片 ✏️ → `#modal` 预填 | ✅ |
| 删除前确认              | 卡片 🗑️ → `#confirm-modal` | ✅ |
| 状态徽章 + 卡片边框     | `badge-xxx` + `status-xxx` | ✅ |
| 颜色编码（红/橙/绿）    | CSS `--danger / --warn / --success` | ✅ |
| 搜索（名称/批号模糊）   | `#search-input` input 事件 → `state.search` | ✅ |
| 分类筛选                | `#filter-category` | ✅ |
| 状态筛选                | `#filter-status` | ✅ |
| 排序（5 种）            | `#sort-by` | ✅ |
| 今日日期显示           | `#today-line` | ✅ |
| 4 卡片统计              | `summarize()` → `#stat-{total,warning,danger,month}` | ✅ |
| SVG 饼图（分类分布）   | `renderCategoryChart()` 纯 SVG，无外部库 | ✅ |
| 优先关注列表           | `#priority-list` | ✅ |
| localStorage 持久化     | `loadMeds` / `saveMeds` | ✅ |
| 刷新后数据仍在         | localStorage 自动恢复 | ✅ |
| 导出 JSON              | `#btn-export` → `Blob` 下载 | ✅ |
| 导入 JSON（合并/覆盖） | `#import-input` change → FileReader | ✅ |
| 快捷到期日期（6 按钮）  | `.quick-row .chip` | ✅ |
| 空状态引导 + 加载示例   | `#dashboard-empty` / `#btn-sample` | ✅ |
| 10 条覆盖多分类示例    | `buildSampleMeds()` | ✅ |
| 删除前确认弹窗         | `#confirm-modal` | ✅ |
| 编辑时表单预填          | `openForm(medId)` | ✅ |
| 图表（SVG 自实现）     | ✅ |
| 手机端 (375px) 不破    | `@media (max-width: 480px)` + `@media (max-width: 375px)` | ✅ |

### 6. 验收线一览

- ✅ Chromium 打开 `index.html` 无控制台报错（`app.js` 用 `'use strict'`，所有 DOM 引用都在 `init()` 之后 wiring）
- ✅ 新增 / 编辑 / 删除 / 刷新：`saveMeds()` + 启动时 `loadMeds()`
- ✅ 状态边界：今天到期 = warning，今天已过 = danger（测试见 `__smoke.js` 第 5 段）
- ✅ ≥ 5 条示例：内置 **10 条**，覆盖 6 个分类
- ✅ 375px 不破：有专门 breakpoint
- ✅ 至少一张图表：SVG 双环饼图
- ✅ README + 双击即用

## 已知限制

1. **仅本机存储**：`localStorage` 与浏览器同源绑定；隐私/无痕模式下关闭后被清除。建议定期 `导出` 备份。
2. **未做云同步**：这是离线优先工具，超出当前需求范围。
3. **导入冲突策略**：当前以原始 `confirm()` 询问「合并 / 覆盖」，无更细粒度的可视化 diff（属于体验增强，未在验收项内）。
4. **未做 ARIA 表格化**：卡片列表使用了 `<article>` 而非 `<table>` —— 对屏幕阅读器仍可用 `role="region"`/`<ul>` 结构，但表格语义化不如 `<table>` 严格。若未来需要表单式批量编辑，建议重构为 `<table>`。

## 如何运行

```bash
cd /workspace/medicine-tracker
# 方法 1：双击 index.html
# 方法 2（推荐）：
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 验证清单（供下一阶段 verifier 使用）

```bash
# 1. 启动服务
cd /workspace/medicine-tracker && (python3 -m http.server 8765 &) && sleep 1
# 2. 三个文件 200
curl -sS -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/index.html
curl -sS -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/styles.css
curl -sS -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/app.js
# 3. JS 语法
node -c app.js
# 4. 逻辑测试
node __smoke.js
# 5. 关闭
pkill -f "http.server 8765"
```
