// 说明（Hermes 2026-10 补丁）：上游原方案走 www.douyin.com 网页接口，需要 a_bogus 签名，
// 常返回空响应（200 但 0 字节）。这里改成多端点依次尝试：
//   ① iesdouyin 榜单接口（无需签名）
//   ② www.douyin.com 网页接口（上游原方案，先取 cookie）
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

interface BillboardRes {
  word_list: {
    word?: string
    hot_value?: number | string
    sentence_id?: string
    label?: number
  }[]
}

interface WebRes {
  data: {
    word_list: {
      sentence_id: string
      word: string
      event_time: string
      hot_value: string
    }[]
  }
}

async function fromBillboard(): Promise<NewsItem[]> {
  const res = await myFetch("https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/", {
    headers: { "User-Agent": UA, "Referer": "https://www.douyin.com/" },
  }) as BillboardRes

  return (res?.word_list ?? [])
    .filter(k => !!k.word)
    .map((k) => {
      const title = String(k.word)
      const hot = Number(k.hot_value ?? 0)
      const url = `https://www.douyin.com/search/${encodeURIComponent(title)}`
      return {
        id: k.sentence_id || title,
        title,
        url,
        mobileUrl: url,
        extra: {
          info: hot > 0 ? `${(hot / 10000).toFixed(1)}万` : undefined,
        },
      }
    })
}

async function fromWeb(): Promise<NewsItem[]> {
  const url = "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1"
  const cookie = (await $fetch.raw("https://login.douyin.com/")).headers.getSetCookie()
  const res = await myFetch(url, {
    headers: {
      "User-Agent": UA,
      "Referer": "https://www.douyin.com/",
      "cookie": cookie.join("; "),
    },
  }) as WebRes

  return (res?.data?.word_list ?? []).map(k => ({
    id: k.sentence_id,
    title: k.word,
    url: `https://www.douyin.com/hot/${k.sentence_id}`,
  }))
}

export default defineSource(async () => {
  for (const fn of [fromBillboard, fromWeb]) {
    try {
      const items = await fn()
      if (items.length)
        return items
    } catch (e) {
      console.error("[douyin]", e instanceof Error ? e.message : String(e))
    }
  }
  throw new Error("douyin: all endpoints failed")
})
