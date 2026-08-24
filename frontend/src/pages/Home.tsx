import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SiteNav, { SiteFooter } from '../components/SiteNav'
import { apiFetch } from '../lib/api'
import type { Esp32Dashboard } from '../lib/api'

const features = [
  {
    title: '实时天气推送',
    desc: 'ESP32 设备轮询 /api/esp32/dashboard 即可获取温度、湿度、风速等实时天气 JSON 字段。',
  },
  {
    title: '远程定制反馈',
    desc: '后台可定制跑马灯文案、刷新间隔、亮度与自定义键值字段，设备端即时生效。',
  },
  {
    title: '轻量接入',
    desc: '标准 HTTP + JSON，ESP32 使用 ArduinoJSON 即可解析，无需私有协议。',
  },
  {
    title: '安全可靠',
    desc: '管理接口全部走 Bearer Token 鉴权，设备接口只读、无敏感信息。',
  },
]

const stats = [
  { label: '设备接入协议', value: 'HTTP/JSON' },
  { label: '天气数据来源', value: 'Open-Meteo' },
  { label: '管理端鉴权', value: 'Bearer Token' },
  { label: '默认刷新间隔', value: '60s' },
]

export default function Home() {
  const [dashboard, setDashboard] = useState<Esp32Dashboard | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    apiFetch<Esp32Dashboard>('/api/esp32/dashboard')
      .then((data) => {
        if (cancelled) return
        setDashboard(data)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <SiteNav />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-block rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
              IoT · ESP32 云端接入平台
            </p>
            <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
              让每一块 ESP32
              <br />
              都能拿到<span className="text-indigo-600">实时天气</span>与云端配置
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
              星屿智联为智能硬件团队提供设备友好的云端接口：一次 HTTP
              请求，即可获取天气、服务器时间与后台定制的全部 JSON 字段。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                查看产品方案
              </Link>
              <Link
                to="/contact"
                className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100"
              >
                联系接入顾问
              </Link>
            </div>
          </div>
        </section>

        {/* 实时接口示例 */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="text-2xl font-semibold text-slate-900">设备端实时反馈示例</h2>
              <p className="mt-3 leading-relaxed text-slate-600">
                下方 JSON 来自正在运行的后端接口{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-indigo-700">
                  GET /api/esp32/dashboard
                </code>
                ，与 ESP32 实际拿到的数据一致。
              </p>
              <ul className="mt-5 space-y-2 text-sm text-slate-600">
                <li>· 天气字段：温度 / 体感温度 / 湿度 / 风速 / 现象描述</li>
                <li>· 跑马灯文案与显示开关由后台定制，实时下发</li>
                <li>· custom_fields 支持任意自定义键值对</li>
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-rose-500" aria-hidden="true" />
                <span className="h-3 w-3 rounded-full bg-amber-400" aria-hidden="true" />
                <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="ml-2 text-xs text-slate-400">GET /api/esp32/dashboard</span>
              </div>
              <div className="max-h-80 overflow-auto p-4">
                {status === 'loading' && (
                  <p className="text-sm text-slate-400">正在请求后端接口…</p>
                )}
                {status === 'error' && (
                  <p className="text-sm text-rose-400">
                    接口请求失败，请确认后端服务（8000 端口）已启动。
                  </p>
                )}
                {status === 'ready' && dashboard && (
                  <pre className="text-xs leading-relaxed text-emerald-300">
                    {JSON.stringify(dashboard, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 能力 */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-slate-900">为什么选择星屿智联</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {features.map((f) => (
                <div key={f.title} className="rounded-xl border border-slate-200 p-6">
                  <h3 className="text-base font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
                </div>
              ))}
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-6 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="text-xs text-slate-500">{s.label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
