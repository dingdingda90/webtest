import { useState } from 'react'
import type { FormEvent } from 'react'
import SiteNav, { SiteFooter } from '../components/SiteNav'

const contacts = [
  { label: '商务合作', value: 'biz@starisle.example.com' },
  { label: '技术支持', value: 'support@starisle.example.com' },
  { label: '公司地址', value: '上海市浦东新区张江智能硬件产业园 88 号' },
]

export default function Contact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // 演示表单：仅本地展示提交成功状态，不做真实发送与持久化
    setSubmitted(true)
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold text-slate-900">联系我们</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">
          如需接入星屿云设备接口或定制硬件方案，欢迎与我们联系。
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            {contacts.map((c) => (
              <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{c.value}</p>
              </div>
            ))}
            <p className="text-xs text-slate-400">以上联系方式为演示内容。</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            {submitted ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600" aria-hidden="true">
                  ✓
                </span>
                <h2 className="mt-4 text-lg font-semibold text-slate-900">已收到您的留言</h2>
                <p className="mt-2 text-sm text-slate-600">
                  这是演示表单，未做真实发送与存储。我们会尽快与您联系。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false)
                    setName('')
                    setEmail('')
                    setMessage('')
                  }}
                  className="mt-6 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  再填一条
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700">
                    姓名
                  </label>
                  <input
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="您的称呼"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700">
                    邮箱
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="name@company.com"
                  />
                </div>
                <div>
                  <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700">
                    留言内容
                  </label>
                  <textarea
                    id="contact-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={4}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="想接入的设备类型、数量与时间…"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  提交留言
                </button>
                <p className="text-xs text-slate-400">演示表单：提交仅在本地页面展示成功状态，不做真实发送。</p>
              </form>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
