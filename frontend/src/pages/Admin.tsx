import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import type { Esp32Config, Esp32Dashboard, WeatherLog, WeatherLogsResponse } from '../lib/api'

type TabId = 'config' | 'preview' | 'docs' | 'logs'

const tabs: { id: TabId; label: string }[] = [
  { id: 'config', label: 'ESP32 配置' },
  { id: 'preview', label: '设备预览' },
  { id: 'docs', label: 'API 文档' },
  { id: 'logs', label: '天气日志' },
]

const input = 'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
const btn1 = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors'
const btn2 = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors'
const sec = 'rounded-2xl border border-slate-200 bg-white p-6'

const fields = [
  { key: 'company_name', label: '公司名称', span: 1 },
  { key: 'city', label: '天气城市名', span: 1 },
  { key: 'marquee_text', label: '跑马灯文案', span: 2 },
  { key: 'latitude', label: '纬度', type: 'number', step: '0.01', span: 1 },
  { key: 'longitude', label: '经度', type: 'number', step: '0.01', span: 1 },
  { key: 'refresh_interval_sec', label: '轮询间隔（秒）', type: 'number', span: 1 },
  { key: 'led_brightness', label: 'LED 亮度（0～100）', type: 'number', span: 1 },
] as const

const toggles = [
  ['show_weather', '显示天气'],
  ['show_time', '显示服务器时间'],
  ['show_message', '显示跑马灯'],
] as const

type FK = (typeof fields)[number]['key']

function configToForm(cfg: Esp32Config) {
  return {
    company_name: cfg.company_name,
    marquee_text: cfg.marquee_text,
    city: cfg.city,
    latitude: String(cfg.latitude),
    longitude: String(cfg.longitude),
    refresh_interval_sec: String(cfg.refresh_interval_sec),
    led_brightness: String(cfg.led_brightness),
    display: { ...cfg.display },
    custom_fields: Object.entries(cfg.custom_fields).map(([k, v]) => ({ key: k, value: v })),
  }
}

function ConfigPanel() {
  const [form, setForm] = useState<ReturnType<typeof configToForm> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'idle' | 'ok' | 'error'; text: string }>({ type: 'idle', text: '' })

  useEffect(() => {
    let c = false
    apiFetch<Esp32Config>('/api/admin/esp32-config')
      .then((cfg) => { if (!c) setForm(configToForm(cfg)) })
      .catch(() => { if (!c) setLoadError('配置加载失败') })
    return () => { c = true }
  }, [])

  const up = (k: FK | 'display' | 'custom_fields', v: unknown) => {
    setForm((p) => (p ? { ...p, [k]: v } : p))
    setMsg({ type: 'idle', text: '' })
  }

  const validate = (): string | null => {
    if (!form) return null
    const f = form
    if (!f.company_name.trim() || !f.marquee_text.trim() || !f.city.trim()) return '公司名、跑马灯文案与城市不能为空'
    const lat = Number(f.latitude), lng = Number(f.longitude)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return '纬度需在 -90～90'
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return '经度需在 -180～180'
    const ref = Number(f.refresh_interval_sec), bri = Number(f.led_brightness)
    if (!Number.isInteger(ref) || ref < 10 || ref > 3600) return '轮询间隔需为 10～3600 的整数'
    if (!Number.isInteger(bri) || bri < 0 || bri > 100) return '亮度需为 0～100'
    const seen = new Set<string>()
    for (const r of f.custom_fields) {
      const k = r.key.trim()
      if (!k) return '自定义字段键不能为空'
      if (seen.has(k)) return `键「${k}」重复`
      seen.add(k)
    }
    return null
  }

  const save = async () => {
    const err = validate()
    if (err) { setMsg({ type: 'error', text: err }); return }
    setSaving(true)
    try {
      await apiFetch('/api/admin/esp32-config', {
        method: 'PUT',
        body: JSON.stringify({
          company_name: form!.company_name.trim(),
          marquee_text: form!.marquee_text.trim(),
          city: form!.city.trim(),
          latitude: Number(form!.latitude),
          longitude: Number(form!.longitude),
          refresh_interval_sec: Number(form!.refresh_interval_sec),
          led_brightness: Number(form!.led_brightness),
          display: form!.display,
          custom_fields: Object.fromEntries(form!.custom_fields.map((r) => [r.key.trim(), r.value])),
        }),
      })
      setMsg({ type: 'ok', text: '已保存' })
    } catch { setMsg({ type: 'error', text: '保存失败' }) }
    setSaving(false)
  }

  if (loadError) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{loadError}</div>
  if (!form) return <p className="text-sm text-slate-500">加载中…</p>

  return (
    <div className="space-y-6">
      <section className={sec}>
        <h3 className="text-base font-semibold text-slate-900 mb-4">基础信息</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={f.span === 2 ? 'sm:col-span-2' : ''}>
              <label className="block text-sm font-medium text-slate-700">{f.label}</label>
              <input type={f.type === 'number' ? 'number' : 'text'} step={f.step as string | undefined} className={input} value={form[f.key as FK]} onChange={(e) => up(f.key as FK, e.target.value)} />
            </div>
          ))}
        </div>
      </section>

      <section className={sec}>
        <h3 className="text-base font-semibold text-slate-900 mb-4">显示开关</h3>
        <div className="flex flex-wrap gap-6">
          {toggles.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.display[k]} onChange={(e) => up('display', { ...form.display, [k]: e.target.checked })} className="h-4 w-4 rounded border-slate-300 accent-indigo-600" />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className={sec}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">自定义字段</h3>
          <button onClick={() => up('custom_fields', [...form.custom_fields, { key: '', value: '' }])} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">+ 添加</button>
        </div>
        {form.custom_fields.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">暂无</p>
        ) : (
          <div className="space-y-3">
            {form.custom_fields.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input placeholder="键" className="w-2/5 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" value={r.key} onChange={(e) => up('custom_fields', form.custom_fields.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                <input placeholder="值" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" value={r.value} onChange={(e) => up('custom_fields', form.custom_fields.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                <button onClick={() => up('custom_fields', form.custom_fields.filter((_, j) => j !== i))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600">删除</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button onClick={save} disabled={saving} className={btn1}>{saving ? '保存中…' : '保存并下发'}</button>
        {msg.type !== 'idle' && <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
      </div>
    </div>
  )
}

const SAMPLE = JSON.stringify({
  device_target: 'esp32', company_name: '星屿智联科技', server_time: '2026-08-24T16:30:00+08:00',
  weather: { temperature: 31.2, humidity: 62, weather_code: 1, weather_text: '大部晴朗', wind_speed: 8.4, city: '上海', source: 'open-meteo' },
  display: { show_weather: true, show_time: true, show_message: true },
  led_brightness: 80, refresh_interval_sec: 60, custom_fields: { welcome: 'Hello ESP32' },
}, null, 2)

function PreviewPanel() {
  const [data, setData] = useState<Esp32Dashboard | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(() => {
    setStatus('loading')
    apiFetch<Esp32Dashboard>('/api/esp32/dashboard').then(setData).then(() => setStatus('ready')).catch(() => setStatus('error'))
  }, [])

  useEffect(() => { load() }, [load])

  if (status === 'loading') return <p className="text-sm text-slate-500">请求中…</p>
  if (status === 'error') return <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">请求失败</p>
  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">GET /api/esp32/dashboard</p>
        <button onClick={load} className={btn2}>刷新</button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-950 p-6 text-slate-100 shadow-inner" style={{ opacity: 0.55 + data.led_brightness / 100 * 0.45 }}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{data.company_name}</span>
            <span>{data.display.show_time ? data.server_time.replace('T', ' ') : ''}</span>
          </div>
          {data.display.show_weather && (
            <div className="mt-6 flex items-end gap-4">
              <span className="text-5xl font-bold">{data.weather.temperature != null ? `${data.weather.temperature}°` : '--'}</span>
              <div className="pb-1 text-sm text-slate-300">
                <p>{data.weather.weather_text}</p>
                <p className="mt-1 text-xs text-slate-400">湿度 {data.weather.humidity ?? '--'}% · 风速 {data.weather.wind_speed ?? '--'} km/h · {data.weather.city}</p>
              </div>
            </div>
          )}
          {data.display.show_message && <p className="mt-6 overflow-hidden whitespace-nowrap rounded-lg bg-indigo-500/15 px-3 py-2 text-sm text-indigo-200">{data.message}</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            {Object.entries(data.custom_fields).map(([k, v]) => <span key={k} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{k}: {v}</span>)}
          </div>
          <p className="mt-6 text-xs text-slate-500">亮度 {data.led_brightness}% · 轮询 {data.refresh_interval_sec}s · 来源：{data.weather.source === 'open-meteo' ? '实时' : '演示'}</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 px-4 py-3 text-xs text-slate-400">原始 JSON</div>
          <pre className="max-h-96 overflow-auto p-4 text-xs text-emerald-300">{JSON.stringify(data, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}

const logCols = [
  { key: 'city', label: '城市', cls: 'font-medium text-slate-900', render: (l: WeatherLog) => l.city },
  { key: 'temperature', label: '温度', render: (l: WeatherLog) => l.temperature != null ? `${l.temperature}°C` : '—' },
  { key: 'humidity', label: '湿度', render: (l: WeatherLog) => l.humidity != null ? `${l.humidity}%` : '—' },
  {
    key: 'weather_text', label: '天气', render: (l: WeatherLog) => {
      const m: Record<number, string> = { 0: 'bg-amber-50 text-amber-700', 1: 'bg-emerald-50 text-emerald-700', 2: 'bg-emerald-50 text-emerald-700', 3: 'bg-slate-100 text-slate-600' }
      const c = l.weather_code >= 95 ? 'bg-rose-50 text-rose-700' : m[l.weather_code] ?? 'bg-sky-50 text-sky-700'
      return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{l.weather_text}</span>
    },
  },
  { key: 'wind_speed', label: '风速', render: (l: WeatherLog) => l.wind_speed != null ? `${l.wind_speed} km/h` : '—' },
  { key: 'source', label: '数据源', render: (l: WeatherLog) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.source === 'open-meteo' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>{l.source === 'open-meteo' ? '实时' : '演示'}</span> },
  { key: 'queried_at', label: '查询时间', cls: 'whitespace-nowrap text-xs text-slate-500', render: (l: WeatherLog) => l.queried_at.replace('T', ' ') },
]

function Pagination({ page, total, totalPages, onChange }: { page: number; total: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  const pages: number[] = []
  let s = Math.max(1, page - 2), e = Math.min(totalPages, s + 4)
  if (e - s < 4) s = Math.max(1, e - 4)
  for (let i = s; i <= e; i++) pages.push(i)
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span className="text-sm text-slate-500">共 {total} 条，第 {page}/{totalPages} 页</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className={`${btn2} disabled:cursor-not-allowed disabled:opacity-40`}>上一页</button>
        {pages.map((p) => <button key={p} onClick={() => onChange(p)} className={`rounded-lg px-3 py-2 text-sm font-medium ${p === page ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{p}</button>)}
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className={`${btn2} disabled:cursor-not-allowed disabled:opacity-40`}>下一页</button>
      </div>
    </div>
  )
}

function WeatherLogsPanel() {
  const [logs, setLogs] = useState<WeatherLog[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [sd, setSd] = useState('')
  const [ed, setEd] = useState('')
  const [del, setDel] = useState<number | null>(null)

  const load = useCallback((p: number, s: string, e: string) => {
    setStatus('loading')
    const q = new URLSearchParams()
    q.set('page', String(p)); q.set('page_size', '20')
    if (s) q.set('start_date', s); if (e) q.set('end_date', e)
    apiFetch<WeatherLogsResponse>(`/api/admin/weather-logs?${q}`)
      .then((d) => { setLogs(d.items); setTotal(d.total); setTotalPages(d.total_pages); setPage(d.page); setStatus('ready') })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => { load(1, '', '') }, [load])

  const delLog = async (id: number) => {
    if (!confirm('确定删除？')) return
    setDel(id)
    try { await apiFetch(`/api/admin/weather-logs/${id}`, { method: 'DELETE' }); load(logs.length === 1 && page > 1 ? page - 1 : page, sd, ed) }
    catch { alert('删除失败') }
    setDel(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">开始</label><input type="date" value={sd} onChange={(e) => setSd(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">结束</label><input type="date" value={ed} onChange={(e) => setEd(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" /></div>
        <button onClick={() => { setPage(1); load(1, sd, ed) }} className={btn1}>查询</button>
        <button onClick={() => { setSd(''); setEd(''); setPage(1); load(1, '', '') }} className={btn2}>重置</button>
        <button onClick={() => load(page, sd, ed)} className={btn2}>刷新</button>
      </div>

      {status === 'loading' && <p className="text-sm text-slate-500">加载中…</p>}
      {status === 'error' && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">加载失败</p>}
      {status === 'ready' && logs.length === 0 && <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">暂无记录</p>}
      {status === 'ready' && logs.length > 0 && (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-slate-200 bg-slate-50">{logCols.map((c) => <th key={c.key} className="px-4 py-3 font-semibold text-slate-700">{c.label}</th>)}<th className="px-4 py-3 font-semibold text-slate-700">操作</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      {logCols.map((c) => <td key={c.key} className={`px-4 py-3 text-slate-600 ${c.cls ?? ''}`}>{c.render(log)}</td>)}
                      <td className="px-4 py-3"><button onClick={() => delLog(log.id)} disabled={del === log.id} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">{del === log.id ? '删除中…' : '删除'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} total={total} totalPages={totalPages} onChange={(p) => { setPage(p); load(p, sd, ed) }} />
        </>
      )}
    </div>
  )
}

const apiDocs = [
  { method: 'GET', path: '/api/esp32/dashboard', auth: '无需', desc: 'ESP32 主轮询接口：天气、时间、跑马灯、显示开关与定制字段' },
  { method: 'GET', path: '/api/esp32/weather', auth: '无需', desc: '仅返回实时天气' },
  { method: 'GET', path: '/api/esp32/config', auth: '无需', desc: '仅返回设备配置' },
  { method: 'POST', path: '/api/auth/login', auth: '无需', desc: '管理后台登录' },
  { method: 'GET', path: '/api/admin/esp32-config', auth: 'Token', desc: '读取 ESP32 定制配置' },
  { method: 'PUT', path: '/api/admin/esp32-config', auth: 'Token', desc: '更新 ESP32 定制配置' },
  { method: 'GET', path: '/api/admin/weather-logs', auth: 'Token', desc: '分页查询天气日志' },
  { method: 'GET', path: '/api/weather/city?city=北京', auth: '无需', desc: '按城市名获取实时天气' },
]

function DocsPanel() {
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">ESP32 侧代码：Wi-Fi 连接后定时 GET /api/esp32/dashboard，用 ArduinoJSON 解析即可。</p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {apiDocs.map((item) => (
            <li key={item.path} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:gap-4">
              <span className={`inline-flex w-16 shrink-0 justify-center rounded-md px-2 py-1 text-xs font-bold ${item.method === 'GET' ? 'bg-emerald-50 text-emerald-700' : item.method === 'PUT' ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700'}`}>{item.method}</span>
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium text-slate-900">{item.path}</p>
                <p className="mt-1 text-sm text-slate-600">{item.desc}</p>
                <p className="mt-1 text-xs text-slate-400">鉴权：{item.auth}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="border-b border-slate-800 px-4 py-3 text-xs text-slate-400">/api/esp32/dashboard 响应示例</div>
        <pre className="max-h-96 overflow-auto p-4 text-xs text-emerald-300">{SAMPLE}</pre>
      </div>
    </div>
  )
}

export default function Admin() {
  const { user, initializing, logout } = useAuth()
  const location = useLocation()
  const [tab, setTab] = useState<TabId>('config')

  if (initializing) return <main className="flex flex-1 items-center justify-center"><p className="text-sm text-slate-500">校验登录状态…</p></main>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return (
    <main className="flex-1">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">星</span>
            <span className="text-base font-semibold text-slate-900">设备管理后台</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{user.username}</span>
            <Link to="/" className={btn2}>返回主页</Link>
            <button onClick={() => void logout()} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">退出登录</button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap gap-2" role="tablist">
          {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-4 py-2.5 text-sm font-medium ${tab === t.id ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>)}
        </div>
        {tab === 'config' && <ConfigPanel />}
        {tab === 'preview' && <PreviewPanel />}
        {tab === 'docs' && <DocsPanel />}
        {tab === 'logs' && <WeatherLogsPanel />}
      </div>
    </main>
  )
}