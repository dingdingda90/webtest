import SiteNav, { SiteFooter } from '../components/SiteNav'

const milestones = [
  { year: '2021', event: '星屿智联成立，专注 ESP32 云端接入方向' },
  { year: '2022', event: '发布首个设备友好的 HTTP/JSON 天气聚合接口' },
  { year: '2024', event: '星屿云设备管理平台上线，支持定制反馈字段' },
  { year: '2026', event: '面向硬件团队开放整机 + 云端一体方案' },
]

const values = [
  { title: '设备优先', desc: '所有接口设计都以低算力设备的解析成本为第一考量。' },
  { title: '开放标准', desc: '坚持 HTTP + JSON 开放协议，不绑定私有生态。' },
  { title: '稳定可预期', desc: '字段命名与结构长期稳定，让固件一次编写长期运行。' },
]

export default function About() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold text-slate-900">关于星屿智联</h1>
        <p className="mt-4 max-w-3xl leading-relaxed text-slate-600">
          星屿智联科技是一家专注于物联网硬件云端接入的公司。我们相信：一块 ESP32
          不应该为「拿一次天气」而对接五个平台。我们把天气、时间、公告与定制配置聚合进一个
          JSON 接口，让硬件团队专注于产品本身。
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-slate-900">发展历程</h2>
          <ol className="mt-6 space-y-4">
            {milestones.map((m) => (
              <li key={m.year} className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4">
                <span className="mt-0.5 flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-semibold text-indigo-700">
                  {m.year}
                </span>
                <p className="pt-2 text-sm leading-relaxed text-slate-700">{m.event}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-slate-900">我们的原则</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {values.map((v) => (
              <div key={v.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-base font-semibold text-slate-900">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
