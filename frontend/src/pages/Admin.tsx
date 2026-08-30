import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import type { DisplayConfig, Esp32Config, Esp32Dashboard, WeatherLog } from '../lib/api'

type TabId = 'config' | 'preview' | 'docs' | 'logs'

const tabs: { id: TabId; label: string }[] = [
  { id: 'config', label: 'ESP32 配置' },
  { id: 'preview', label: '设备预览' },
  { id: 'docs', label: 'API 文档' },
  { id: 'logs', label: '天气日志' },
]

interface CustomFieldRow {
  key: string
  value: string
}

interface ConfigForm {
  company_name: string
  marquee_text: string
  city: string
  latitude: string
  longitude: string
  refresh_interval_sec: string
  led_brightness: string
  display: DisplayConfig
  custom_fields: CustomFieldRow[]
}

const SAMPLE_DASHBOARD_JSON = `{
  "device_target": "esp32",
  "company_name": "星屿智联科技",
  "server_time": "2026-08-24T16:30:00+08:00",
  "timestamp": 1787963400,
  "timezone": "Asia/Shanghai",
  "message": "欢迎使用星屿智联 · ESP32 云端智能终端",
  "weather": {
    "temperature": 31.2,
    "apparent_temperature": 33.5,
    "humidity": 62,
    "weather_code": 1,
    "weather_text": "大部晴朗",
    "wind_speed": 8.4,
    "city": "上海",
    "source": "open-meteo",
    "updated_at": "2026-08-24T16:30:00+08:00"
  },
  "display": { "show_weather": true, "show_time": true, "show_message": true },
  "led_brightness": 80,
  "refresh_interval_sec": 60,
  "custom_fields": { "welcome": "Hello ESP32", "firmware_channel": "stable" }
}`

function configToForm(cfg: Esp32Config): ConfigForm {
  return {
    company_name: cfg.company_name,
    marquee_text: cfg.marquee_text,
    city: cfg.city,
    latitude: String(cfg.latitude),
    longitude: String(cfg.longitude),
    refresh_interval_sec: String(cfg.refresh_interval_sec),
    led_brightness: String(cfg.led_brightness),
    display: { ...cfg.display },
    custom_fields: Object.entries(cfg.custom_fields).map(([key, value]) => ({ key, value })),
  }
}

function ConfigPanel() {
  const [form, setForm] = useState<ConfigForm | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    apiFetch<Esp32Config>('/api/admin/esp32-config')
      .then((cfg) => {
        if (!cancelled) setForm(configToForm(cfg))
      })
      .catch(() => {
        if (!cancelled) setLoadError('配置加载失败，请确认后端服务已启动')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function updateField<K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaveStatus('idle')
  }

  async function handleSave() {
    if (!form) return
    setSaveStatus('idle')

    const latitude = Number(form.latitude)
    const longitude = Number(form.longitude)
    const refresh = Number(form.refresh_interval_sec)
    const brightness = Number(form.led_brightness)

    if (!form.company_name.trim() || !form.marquee_text.trim() || !form.city.trim()) {
      setSaveStatus('error')
      setSaveMessage('公司名、跑马灯文案与城市不能为空')
      return
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setSaveStatus('error')
      setSaveMessage('纬度需在 -90 ～ 90 之间')
      return
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setSaveStatus('error')
      setSaveMessage('经度需在 -180 ～ 180 之间')
      return
    }
    if (!Number.isInteger(refresh) || refresh < 10 || refresh > 3600) {
      setSaveStatus('error')
      setSaveMessage('刷新间隔需为 10 ～ 3600 的整数（秒）')
      return
    }
    if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
      setSaveStatus('error')
      setSaveMessage('亮度需为 0 ～ 100 的整数')
      return
    }

    const customFields: Record<string, string> = {}
    for (const row of form.custom_fields) {
      const key = row.key.trim()
      if (!key) {
        setSaveStatus('error')
        setSaveMessage('自定义字段的键不能为空')
        return
      }
      if (customFields[key] !== undefined) {
        setSaveStatus('error')
        setSaveMessage(`自定义字段的键「${key}」重复`)
        return
      }
      customFields[key] = row.value
    }

    setSaving(true)
    try {
      await apiFetch('/api/admin/esp32-config', {
        method: 'PUT',
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          marquee_text: form.marquee_text.trim(),
          city: form.city.trim(),
          latitude,
          longitude,
          refresh_interval_sec: refresh,
          led_brightness: brightness,
          display: form.display,
          custom_fields: customFields,
        }),
      })
      setSaveStatus('ok')
      setSaveMessage('已保存。配置保存在服务内存中（临时本地状态），设备下次轮询即生效。')
    } catch {
      setSaveStatus('error')
      setSaveMessage('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {loadError}
      </div>
    )
  }

  if (!form) {
    return <p className="text-sm text-slate-500">正在加载当前配置…</p>
  }

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
  const labelClass = 'block text-sm font-medium text-slate-700'

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-900">基础信息</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cfg-company" className={labelClass}>公司名称</label>
            <input
              id="cfg-company"
              className={inputClass}
              value={form.company_name}
              onChange={(e) => updateField('company_name', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cfg-city" className={labelClass}>天气城市名（展示用）</label>
            <input
              id="cfg-city"
              className={inputClass}
              value={form.city}
              onChange={(e) => updateField('city', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cfg-marquee" className={labelClass}>跑马灯文案（message 字段）</label>
            <input
              id="cfg-marquee"
              className={inputClass}
              value={form.marquee_text}
              onChange={(e) => updateField('marquee_text', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cfg-lat" className={labelClass}>纬度（天气定位）</label>
            <input
              id="cfg-lat"
              type="number"
              step="0.01"
              className={inputClass}
              value={form.latitude}
              onChange={(e) => updateField('latitude', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cfg-lng" className={labelClass}>经度（天气定位）</label>
            <input
              id="cfg-lng"
              type="number"
              step="0.01"
              className={inputClass}
              value={form.longitude}
              onChange={(e) => updateField('longitude', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cfg-refresh" className={labelClass}>设备轮询间隔（秒，10～3600）</label>
            <input
              id="cfg-refresh"
              type="number"
              className={inputClass}
              value={form.refresh_interval_sec}
              onChange={(e) => updateField('refresh_interval_sec', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cfg-brightness" className={labelClass}>LED 亮度（0～100）</label>
            <input
              id="cfg-brightness"
              type="number"
              className={inputClass}
              value={form.led_brightness}
              onChange={(e) => updateField('led_brightness', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-900">显示开关（display 字段）</h3>
        <div className="mt-4 flex flex-wrap gap-6">
          {(
            [
              ['show_weather', '显示天气'],
              ['show_time', '显示服务器时间'],
              ['show_message', '显示跑马灯'],
            ] as [keyof DisplayConfig, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.display[key]}
                onChange={(e) =>
                  updateField('display', { ...form.display, [key]: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">自定义 JSON 字段（custom_fields）</h3>
          <button
            type="button"
            onClick={() => updateField('custom_fields', [...form.custom_fields, { key: '', value: '' }])}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            + 添加字段
          </button>
        </div>
        {form.custom_fields.length === 0 ? (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
            暂无自定义字段，点击「添加字段」为 ESP32 下发任意键值对。
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {form.custom_fields.map((row, index) => (
              <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  aria-label={`第 ${index + 1} 个字段的键`}
                  placeholder="键（如 welcome）"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 sm:w-2/5"
                  value={row.key}
                  onChange={(e) =>
                    updateField(
                      'custom_fields',
                      form.custom_fields.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)),
                    )
                  }
                />
                <input
                  aria-label={`第 ${index + 1} 个字段的值`}
                  placeholder="值（如 Hello ESP32）"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 sm:flex-1"
                  value={row.value}
                  onChange={(e) =>
                    updateField(
                      'custom_fields',
                      form.custom_fields.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`删除第 ${index + 1} 个字段`}
                  onClick={() =>
                    updateField(
                      'custom_fields',
                      form.custom_fields.filter((_, i) => i !== index),
                    )
                  }
                  className="self-start rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 sm:self-auto"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? '保存中…' : '保存并下发到设备'}
        </button>
        {saveStatus !== 'idle' && (
          <p
            role="status"
            className={`text-sm ${saveStatus === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}
          >
            {saveMessage}
          </p>
        )}
      </div>
    </div>
  )
}

function PreviewPanel() {
  const [data, setData] = useState<Esp32Dashboard | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(() => {
    setStatus('loading')
    apiFetch<Esp32Dashboard>('/api/esp32/dashboard')
      .then((resp) => {
        setData(resp)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          实时请求 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-indigo-700">GET /api/esp32/dashboard</code>，模拟 ESP32 屏幕渲染。
        </p>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          刷新
        </button>
      </div>

      {status === 'loading' && <p className="text-sm text-slate-500">正在请求设备接口…</p>}
      {status === 'error' && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          设备接口请求失败，请确认后端服务（8000 端口）正在运行。
        </p>
      )}

      {status === 'ready' && data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div
            className="rounded-2xl bg-slate-950 p-6 text-slate-100 shadow-inner"
            style={{ opacity: 0.55 + (data.led_brightness / 100) * 0.45 }}
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{data.company_name}</span>
              <span>{data.display.show_time ? data.server_time.replace('T', ' ') : ''}</span>
            </div>
            {data.display.show_weather && (
              <div className="mt-6 flex items-end gap-4">
                <span className="text-5xl font-bold">
                  {data.weather.temperature !== null ? `${data.weather.temperature}°` : '--'}
                </span>
                <div className="pb-1 text-sm text-slate-300">
                  <p>{data.weather.weather_text}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    湿度 {data.weather.humidity ?? '--'}% · 风速 {data.weather.wind_speed ?? '--'} km/h · {data.weather.city}
                  </p>
                </div>
              </div>
            )}
            {data.display.show_message && (
              <p className="mt-6 overflow-hidden whitespace-nowrap rounded-lg bg-indigo-500/15 px-3 py-2 text-sm text-indigo-200">
                {data.message}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {Object.entries(data.custom_fields).map(([k, v]) => (
                <span key={k} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
                  {k}: {v}
                </span>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-500">
              亮度 {data.led_brightness}% · 轮询间隔 {data.refresh_interval_sec}s · 天气来源：
              {data.weather.source === 'open-meteo' ? 'Open-Meteo 实时' : '演示数据'}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <div className="border-b border-slate-800 px-4 py-3 text-xs text-slate-400">
              原始 JSON（ESP32 实际收到的内容）
            </div>
            <pre className="max-h-96 overflow-auto p-4 text-xs leading-relaxed text-emerald-300">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

const apiDocs = [
  {
    method: 'GET',
    path: '/api/esp32/dashboard',
    auth: '无需鉴权',
    desc: 'ESP32 主轮询接口：一次返回天气、服务器时间、跑马灯、显示开关与全部定制字段。',
  },
  {
    method: 'GET',
    path: '/api/esp32/weather',
    auth: '无需鉴权',
    desc: '仅返回实时天气（优先 Open-Meteo，失败时回退演示数据，以 source 字段区分）。',
  },
  {
    method: 'GET',
    path: '/api/esp32/config',
    auth: '无需鉴权',
    desc: '仅返回设备配置：轮询间隔、亮度、显示开关与自定义字段。',
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    auth: '无需鉴权',
    desc: '管理后台登录，请求体 {"username","password"}，成功返回 Bearer Token。',
  },
  {
    method: 'GET',
    path: '/api/admin/esp32-config',
    auth: 'Bearer Token',
    desc: '读取当前 ESP32 定制配置（本页「ESP32 配置」标签使用）。',
  },
  {
    method: 'PUT',
    path: '/api/admin/esp32-config',
    auth: 'Bearer Token',
    desc: '更新 ESP32 定制配置，保存后设备下次轮询即拿到新内容。',
  },
  {
    method: 'GET',
    path: '/api/admin/weather-logs',
    auth: 'Bearer Token',
    desc: '查询天气日志记录，返回最近 N 条查询历史（默认50条）。',
  },
  {
    method: 'GET',
    path: '/api/weather/city?city=北京',
    auth: '无需鉴权',
    desc: '通用天气查询（GET/POST），按城市名获取实时天气，独立于 ESP32。',
  },
]

function WeatherLogsPanel() {
  const [logs, setLogs] = useState<WeatherLog[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(() => {
    setStatus('loading')
    apiFetch<WeatherLog[]>('/api/admin/weather-logs?limit=100')
      .then((data) => {
        setLogs(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          所有通过网页或 API 查询天气的记录，按时间倒序排列。
        </p>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          刷新
        </button>
      </div>

      {status === 'loading' && <p className="text-sm text-slate-500">正在加载日志…</p>}
      {status === 'error' && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          日志加载失败，请确认后端服务已启动。
        </p>
      )}
      {status === 'ready' && logs.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">
          暂无天气查询记录
        </p>
      )}
      {status === 'ready' && logs.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 font-semibold text-slate-700">城市</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">温度</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">湿度</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">天气</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">风速</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">数据源</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">查询时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{log.city}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {log.temperature !== null ? `${log.temperature}°C` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {log.humidity !== null ? `${log.humidity}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.weather_code === 0
                            ? 'bg-amber-50 text-amber-700'
                            : log.weather_code <= 2
                              ? 'bg-emerald-50 text-emerald-700'
                              : log.weather_code === 3
                                ? 'bg-slate-100 text-slate-600'
                                : log.weather_code >= 95
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-sky-50 text-sky-700'
                        }`}
                      >
                        {log.weather_text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {log.wind_speed !== null ? `${log.wind_speed} km/h` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.source === 'open-meteo'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {log.source === 'open-meteo' ? '实时' : '演示'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {log.queried_at.replace('T', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DocsPanel() {
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm leading-relaxed text-indigo-900">
        ESP32 侧示例代码：Wi-Fi 连接后定时 <code>HTTP GET /api/esp32/dashboard</code>，用
        ArduinoJSON 解析即可。沙箱预览环境中后端仅对前端代理开放；部署后设备直接访问服务端域名的
        8000 端口（或反向代理路径）。
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {apiDocs.map((item) => (
            <li key={`${item.method} ${item.path}`} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:gap-4">
              <span
                className={`inline-flex w-16 shrink-0 justify-center rounded-md px-2 py-1 text-xs font-bold ${
                  item.method === 'GET'
                    ? 'bg-emerald-50 text-emerald-700'
                    : item.method === 'PUT'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-indigo-50 text-indigo-700'
                }`}
              >
                {item.method}
              </span>
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium text-slate-900">{item.path}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.desc}</p>
                <p className="mt-1 text-xs text-slate-400">鉴权：{item.auth}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="border-b border-slate-800 px-4 py-3 text-xs text-slate-400">
          /api/esp32/dashboard 响应示例（演示数据）
        </div>
        <pre className="max-h-96 overflow-auto p-4 text-xs leading-relaxed text-emerald-300">
          {SAMPLE_DASHBOARD_JSON}
        </pre>
      </div>
    </div>
  )
}

export default function Admin() {
  const { user, initializing, logout } = useAuth()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<TabId>('config')

  if (initializing) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-500">正在校验登录状态…</p>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
    <main className="flex-1">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white"
            >
              星
            </span>
            <span className="text-base font-semibold text-slate-900">设备管理后台</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{user.username}</span>
            <Link
              to="/"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              返回主页
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="后台功能标签">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'config' && <ConfigPanel />}
        {activeTab === 'preview' && <PreviewPanel />}
        {activeTab === 'docs' && <DocsPanel />}
        {activeTab === 'logs' && <WeatherLogsPanel />}
      </div>
    </main>
  )
}