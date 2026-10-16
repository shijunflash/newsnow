// 说明（Hermes 2026-10 补丁）：上游原方案走 www.zhihu.com 网页接口，在部分出口 IP 上返回 401。
// 这里改成多端点依次尝试：
//   ① api.zhihu.com 移动端接口（无需签名，最稳）
//   ② www.zhihu.com 网页接口（上游原方案）
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

interface ApiRes {
  data: {
    target: {
      id?: number | string
      title?: string
      excerpt?: string
    }
  }[]
}

interface WebRes {
  data: {
    target: {
      title_area: { text: string }
      excerpt_area: { text: string }
      metrics_area: { text: string }
      link: { url: string }
    }
  }[]
}

async function fromApi(): Promise<NewsItem[]> {
  const res = await myFetch("https://api.zhihu.com/topstory/hot-list?limit=50", {
    headers: { "User-Agent": UA },
  }) as ApiRes

  return (res?.data ?? [])
    .map((k) => {
      const t = k.target ?? {}
      const title = String(t.title ?? "")
      const id = t.id ? String(t.id) : ""
      const url = id ? `https://www.zhihu.com/question/${id}` : "https://www.zhihu.com/hot"
      return {
        id: id || title,
        title,
        url,
        mobileUrl: url,
        extra: { hover: t.excerpt },
      }
    })
    .filter(k => !!k.title)
}

async function fromWeb(): Promise<NewsItem[]> {
  const url = "https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=20&desktop=true"
  const res = await myFetch(url, {
    headers: { "User-Agent": UA, "Referer": "https://www.zhihu.com/hot" },
  }) as WebRes

  return (res?.data ?? []).map(k => ({
    id: k.target.link.url.match(/(\d+)$/)?.[1] ?? k.target.link.url,
    title: k.target.title_area.text,
    extra: {
      info: k.target.metrics_area.text,
      hover: k.target.excerpt_area.text,
    },
    url: k.target.link.url,
  }))
}

export default defineSource({
  zhihu: async () => {
    for (const fn of [fromApi, fromWeb]) {
      try {
        const items = await fn()
        if (items.length)
          return items
      } catch (e) {
        console.error("[zhihu]", e instanceof Error ? e.message : String(e))
      }
    }
    throw new Error("zhihu: all endpoints failed")
  },
})
