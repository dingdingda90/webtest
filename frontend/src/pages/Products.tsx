import { Link } from 'react-router-dom'
import SiteNav, { SiteFooter } from '../components/SiteNav'

const products = [
  {
    name: '星屿天气终端 E1',
    tag: '整机方案',
    desc: '基于 ESP32-S3 的桌面天气屏，轮询云端接口展示实时天气、时间与跑马灯公告。',
    specs: ['ESP32-S3 Wi-Fi', '2.9" 墨水屏', 'JSON 接口直连', '支持 OTA'],
  },
  {
    name: '星屿 ESP32 开发套件',
    tag: '开发套件',
    desc: '预装星屿设备 SDK 的开发板套件，内置 /api/esp32/* 接口示例代码与接线指引。',
    specs: ['ESP32-WROOM-32', 'ArduinoJSON 示例', '传感器扩展口', '中文文档'],
  },
  {
    name: '星屿云设备管理平台',
    tag: '云服务',
    desc: '本站同款管理后台：登录后可定制设备 JSON 反馈字段、查看接口文档与设备预览。',
    specs: ['Bearer Token 鉴权', '定制 JSON 字段', '实时天气聚合', '接口文档'],
  },
]

export default function Products() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold text-slate-900">产品方案</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">
          从整机到云端的一站式 ESP32 接入方案，所有设备均通过标准 HTTP + JSON 与云端通信。
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {products.map((p) => (
            <article key={p.name} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6">
              <span className="self-start rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                {p.tag}
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{p.name}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{p.desc}</p>
              <ul className="mt-4 space-y-1.5">
                {p.specs.map((s) => (
                  <li key={s} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="mt-12 rounded-2xl bg-indigo-600 px-6 py-10 text-center sm:px-10">
          <h2 className="text-xl font-semibold text-white">需要定制设备反馈字段？</h2>
          <p className="mt-2 text-sm text-indigo-100">
            登录管理后台即可编辑 ESP32 拿到的每一个 JSON 字段。
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
          >
            前往后台登录
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
