interface WapRes {
  code: number
  exp_str: string
  list: {
    hot_id: number
    keyword: string
    show_name: string
    score: number
    word_type: number
    goto_type: number
    goto_value: string
    icon: string
    live_id: any[]
    call_reason: number
    heat_layer: string
    pos: number
    id: number
    status: string
    name_type: string
    resource_id: number
    set_gray: number
    card_values: any[]
    heat_score: number
    stat_datas: {
      etime: string
      stime: string
      is_commercial: string
    }
  }[]
  top_list: any[]
  hotword_egg_info: string
  seid: string
  timestamp: number
  total_count: number
}

// Interface for Bilibili Hot Video response
interface HotVideoRes {
  code: number
  message: string
  ttl: number
  data: {
    list: {
      aid: number
      videos: number
      tid: number
      tname: string
      copyright: number
      pic: string
      title: string
      pubdate: number
      ctime: number
      desc: string
      state: number
      duration: number
      owner: {
        mid: number
        name: string
        face: string
      }
      stat: {
        view: number
        danmaku: number
        reply: number
        favorite: number
        coin: number
        share: number
        now_rank: number
        his_rank: number
        like: number
        dislike: number
      }
      dynamic: string
      cid: number
      dimension: {
        width: number
        height: number
        rotate: number
      }
      short_link: string
      short_link_v2: string
      bvid: string
      rcmd_reason: {
        content: string
        corner_mark: number
      }
    }[]
  }
}

interface SquareRes {
  data: {
    trending: {
      list: {
        keyword: string
        show_name?: string
      }[]
    }
  }
}

interface AppRes {
  code: number
  data: {
    list: {
      keyword: string
      show_name?: string
      hot_id?: number
      is_commercial?: string
    }[]
  }
}

// 说明（Hermes 2026-10 补丁）：B站会限流云厂商共享出口 IP，单端点不可靠。
// 按「实测稳定度」排序依次尝试，任一成功即返回；末档也不抛错（避免整源 500）。
//   ① app.bilibili.com APP 接口（不同主机名，最稳）
//   ② s.search.bilibili.com wap 热词接口
//   ③ api.bilibili.com 搜索广场接口（云出口常返回 412，仅作兜底）
const hotSearch = defineSource(async () => {
  // ① APP 接口
  try {
    const resApp = await myFetch("https://app.bilibili.com/x/v2/search/trending/ranking?limit=30", {
      headers: { Referer: "https://www.bilibili.com/" },
    }) as AppRes

    const listApp = resApp?.data?.list ?? []
    if (listApp.length) {
      return listApp.map(k => ({
        id: k.keyword,
        title: k.show_name || k.keyword,
        url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(k.keyword)}`,
      }))
    }
  } catch (e) {
    console.error("[bilibili] app:", e instanceof Error ? e.message : String(e))
  }

  // ② wap 热词接口
  try {
    const url = "https://s.search.bilibili.com/main/hotword?limit=30"
    const res = await myFetch(url, {
      headers: { Referer: "https://www.bilibili.com/" },
    }) as WapRes

    const list = res?.list ?? []
    if (list.length) {
      return list.map(k => ({
        id: k.keyword,
        title: k.show_name,
        url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(k.keyword)}`,
        extra: {
          icon: k.icon,
        },
      }))
    }
  } catch (e) {
    console.error("[bilibili] hotword:", e instanceof Error ? e.message : String(e))
  }

  // ③ 搜索广场接口（兜底，失败也不抛错）
  try {
    const res2 = await myFetch("https://api.bilibili.com/x/web-interface/search/square?limit=50", {
      headers: { Referer: "https://www.bilibili.com/" },
    }) as SquareRes

    const list2 = res2?.data?.trending?.list ?? []
    if (list2.length) {
      return list2.map(k => ({
        id: k.keyword,
        title: k.show_name || k.keyword,
        url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(k.keyword)}`,
      }))
    }
  } catch (e) {
    console.error("[bilibili] square:", e instanceof Error ? e.message : String(e))
  }

  console.error("[bilibili] all endpoints failed")
  return []
})

const hotVideo = defineSource(async () => {
  const url = "https://api.bilibili.com/x/web-interface/popular"
  const res: HotVideoRes = await myFetch(url)

  return res.data.list.map(video => ({
    id: video.bvid,
    title: video.title,
    url: `https://www.bilibili.com/video/${video.bvid}`,
    pubDate: video.pubdate * 1000,
    extra: {
      info: `${video.owner.name} · ${formatNumber(video.stat.view)}观看 · ${formatNumber(video.stat.like)}点赞`,
      hover: video.desc,
      icon: video.pic,
    },
  }))
})

const ranking = defineSource(async () => {
  const url = "https://api.bilibili.com/x/web-interface/ranking/v2"
  const res: HotVideoRes = await myFetch(url)

  return res.data.list.map(video => ({
    id: video.bvid,
    title: video.title,
    url: `https://www.bilibili.com/video/${video.bvid}`,
    pubDate: video.pubdate * 1000,
    extra: {
      info: `${video.owner.name} · ${formatNumber(video.stat.view)}观看 · ${formatNumber(video.stat.like)}点赞`,
      hover: video.desc,
      icon: video.pic,
    },
  }))
})

function formatNumber(num: number): string {
  if (num >= 10000) {
    return `${Math.floor(num / 10000)}w+`
  }
  return num.toString()
}

export default defineSource({
  "bilibili": hotSearch,
  "bilibili-hot-search": hotSearch,
  "bilibili-hot-video": hotVideo,
  "bilibili-ranking": ranking,
})
