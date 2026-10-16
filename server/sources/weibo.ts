import * as cheerio from "cheerio"

// 说明（Hermes 2026-10 补丁）：上游原方案走 s.weibo.com 榜单页，需要有效 Cookie，
// 在部分出口 IP（如 Cloudflare）上会 403。这里改成多端点依次尝试：
//   ① weibo.com JSON 接口（必须带 Referer，否则 403）
//   ② s.weibo.com 榜单页（上游原方案）
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

interface AjaxRes {
  data: {
    realtime: {
      word: string
      word_scheme?: string
      note?: string
      num?: number
      label_name?: string
      is_ad?: number
    }[]
  }
}

async function fromAjax(): Promise<NewsItem[]> {
  const res = await myFetch("https://weibo.com/ajax/side/hotSearch", {
    headers: {
      "User-Agent": UA,
      "Referer": "https://weibo.com/",
      "Accept": "application/json, text/plain, */*",
    },
  }) as AjaxRes

  return (res?.data?.realtime ?? [])
    .filter(k => !!k.word && !k.is_ad && !/荐|商/.test(k.label_name ?? ""))
    .map(k => ({
      id: k.word,
      title: k.word,
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(k.word_scheme || `#${k.word}#`)}`,
      mobileUrl: `https://s.weibo.com/weibo?q=${encodeURIComponent(k.word_scheme || `#${k.word}#`)}`,
      extra: {
        info: k.note || (k.num ? `${k.num}万` : undefined),
      },
    }))
}

async function fromHtml(): Promise<NewsItem[]> {
  const baseurl = "https://s.weibo.com"
  const url = `${baseurl}/top/summary?cate=realtimehot`

  const html = await myFetch(url, {
    headers: {
      "User-Agent": UA,
      // https://github.com/v5tech/weibo-trending-hot-search
      "Cookie": "SUB=_2AkMWIuNSf8NxqwJRmP8dy2rhaoV2ygrEieKgfhKJJRMxHRl-yT9jqk86tRB6PaLNvQZR6zYUcYVT1zSjoSreQHidcUq7",
      "referer": url,
    },
  }) as string

  const $ = cheerio.load(html)
  const hotNews: NewsItem[] = []

  $("#pl_top_realtimehot table tbody tr").slice(1).each((_, row) => {
    const $row = $(row)
    const $link = $row.find("td.td-02 a").filter((_, el) => {
      const href = $(el).attr("href")
      return !!(href && !href.includes("javascript:void(0);"))
    }).first()

    if ($link.length) {
      const title = $link.text().trim()
      const href = $link.attr("href")
      if (title && href) {
        hotNews.push({
          id: title,
          title,
          url: `${baseurl}${href}`,
          mobileUrl: `${baseurl}${href}`,
        })
      }
    }
  })

  return hotNews
}

export default defineSource(async () => {
  for (const fn of [fromAjax, fromHtml]) {
    try {
      const items = await fn()
      if (items.length)
        return items
    } catch (e) {
      console.error("[weibo]", e instanceof Error ? e.message : String(e))
    }
  }
  throw new Error("weibo: all endpoints failed")
})
