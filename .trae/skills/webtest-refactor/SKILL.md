markdown



---
name: "webtest-refactor"
description: "Code refactoring patterns for the WebTest project (React + TypeScript + Tailwind). Invoke when simplifying frontend code, reducing code volume, or fixing common rendering bugs."
---

# WebTest 代码精简与重构

## 一、精简策略

### 1. 表单数据驱动
将重复的 `<label><input>` 提取为配置数组，用 `map` 渲染：
```tsx
const fields = [
  { key: 'company_name', label: '公司名称', span: 1 },
  { key: 'latitude', label: '纬度', type: 'number', step: '0.01', span: 1 },
] as const

{fields.map((f) => (
  <div key={f.key}>
    <label>{f.label}</label>
    <input type={(f as any).type === 'number' ? 'number' : 'text'} ... />
  </div>
))}
```
> `as const` 导致联合类型，访问非共有属性需 `(f as any)`

### 2. 表格列数据驱动
```tsx
const logCols = [
  { key: 'city', label: '城市', render: (l) => l.city },
]
<thead><tr>{logCols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
```

### 3. 样式常量合并
```tsx
const input = 'w-full rounded-lg border px-3 py-2.5 text-sm ...'
const btn1 = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white ...'
const btn2 = 'rounded-lg border bg-white px-4 py-2 text-sm ...'
const sec = 'rounded-2xl border bg-white p-6'
```

### 4. 提取复用组件（Pagination）
```tsx
function Pagination({ page, total, totalPages, onChange }) {
  if (totalPages <= 1) return null
  // ...
}
```

## 二、常见 Bug：数据为空导致白屏

**症状**：`Cannot read properties of undefined (reading 'length')`

**原因**：`d.items` 为 `undefined`，`logs.length` 崩溃

**修复**：
```tsx
// 改前（崩溃）
.then((d) => { setLogs(d.items); ... })
// 改后（安全）
.then((d) => { setLogs(d.items ?? []); ... })
```

**排查步骤**：
1. F12 → Console 看报错
2. F12 → Network 看 API 返回数据结构
3. 对比 `d.xxx` 取值路径是否匹配
4. 后端代码更新后必须重启进程（`pkill -f uvicorn`）

## 三、精简效果

| 指标 | 精简前 | 精简后 | 减少 |
|------|--------|--------|------|
| Admin.tsx | 904 行 | 403 行 | -55% |
| ConfigPanel | ~250 行 | ~100 行 | -60% |
| WeatherLogsPanel | ~240 行 | ~90 行 | -62% |

## 四、部署注意

1. 本地改 → 上传 → 构建 → 重启后端 → 重载 Nginx
2. 服务器路径：`/var/www/myweb/`
3. 后端进程：`uvicorn main:app --host 0.0.0.0 --port 8000`
4. 后端代码更新后必须重启进程
5. 前端构建后浏览器 Ctrl+Shift+R 强制刷新
创建文件后提交：

powershell

cd C:\Users\xin.zhang\Desktop\WebTest\webtest
git add .trae/skills/webtest-refactor/
git commit -m "新增代码精简与重构技能"
git push