const TOKEN_KEY = 'starisle_admin_token'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const resp = await fetch(path, { ...options, headers })
  if (!resp.ok) {
    let detail = `请求失败（HTTP ${resp.status}）`
    try {
      const body = (await resp.json()) as { detail?: unknown }
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // 忽略解析失败，使用默认错误信息
    }
    throw new ApiError(resp.status, detail)
  }
  return (await resp.json()) as T
}

export interface LoginResponse {
  token: string
  user: { username: string; role: string }
}

export interface AuthUser {
  username: string
  role: string
}

export interface DisplayConfig {
  show_weather: boolean
  show_time: boolean
  show_message: boolean
}

export interface Esp32Config {
  company_name: string
  marquee_text: string
  city: string
  latitude: number
  longitude: number
  refresh_interval_sec: number
  led_brightness: number
  display: DisplayConfig
  custom_fields: Record<string, string>
}

export interface WeatherInfo {
  temperature: number | null
  apparent_temperature: number | null
  humidity: number | null
  weather_code: number
  weather_text: string
  wind_speed: number | null
  city: string
  source: string
  updated_at: string | null
}

export interface Esp32Dashboard {
  device_target: string
  company_name: string
  server_time: string
  timestamp: number
  timezone: string
  message: string
  weather: WeatherInfo
  display: DisplayConfig
  led_brightness: number
  refresh_interval_sec: number
  custom_fields: Record<string, string>
}

export interface WeatherLog {
  id: number
  city: string
  temperature: number | null
  humidity: number | null
  weather_code: number
  weather_text: string
  wind_speed: number | null
  source: string
  queried_at: string
}

export interface WeatherLogsResponse {
  items: WeatherLog[]
  total: number
  page: number
  page_size: number
  total_pages: number
}