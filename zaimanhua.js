class ZaiManHua extends ComicSource {

    name = "再漫画"

    key = "zaimanhua"

    version = "2.2.0"

    minAppVersion = "3.1.0"

    url = "https://raw.githubusercontent.com/MoTingFeng/pica-sources/main/zaimanhua.js"

    /// 内容接口前缀候选, 启动时依次探测, 第一个返回 200 的被采用。
    ///
    /// v4api 放前面: 它与 m 站不是同一套接口 —— 官方新版客户端走 v4api,
    /// 分类/标签与书架返回的作品比老接口全(老接口看着"没有那本漫画")。
    /// 探测不过会自动落到 m 站, 所以换顺序得到的是"优先用新的"而不是"只能用新的"。
    apiHosts = [
        "https://v4api.zaimanhua.com/app/v1",
        "https://m.zaimanhua.com/api/app/v1",
    ]

    /// 各内容接口域名对应的客户端伪装参数。
    ///
    /// _v 是官方 App 版本参数: 详情与章节接口不带时会返回"漫画不存在"(隐藏作品)。
    /// m 站是老接口, 社区客户端实测 _v=15 可用; v4api 是新接口, 除版本号外还要
    /// platform 与渠道号 _c, 否则拿到的数据可能不全。
    hostProfiles = {
        "https://m.zaimanhua.com/api/app/v1": { version: "15", extra: "" },
        "https://v4api.zaimanhua.com/app/v1": {
            version: "2.3.8",
            extra: "&platform=android&_c=101_01_01_000"
        }
    }

    /// 账号接口与内容接口不同域
    accountApi = "https://account-api.zaimanhua.com/v1"

    /// 签到与任务接口: 与内容接口同域, 但路径在 /lpi/v1
    taskApi = "https://m.zaimanhua.com/lpi/v1"

    /// 任务状态: 1=未完成, 2=可领取, 3=已领取
    taskClaimable = 2

    pageSize = 20

    _base = null

    _ready = null

    token = null

    uid = null

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip",
        "Referer": "https://manhua.zaimanhua.com/",
    }

    /// 图片防盗链所需的请求头
    imageHeaders = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
        "Referer": "https://manhua.zaimanhua.com/",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }

    init() {
        this.token = this.loadData("token") || null
        this.uid = this.loadData("uid") || null
        this._ready = this.probeHost()
        /// 不 await: 签到不该拖慢源加载, 失败只进日志
        this.autoSignIn()
    }

    async probeHost() {
        for (var i = 0; i < this.apiHosts.length; i++) {
            var host = this.apiHosts[i]
            var profile = this.profileOf(host)
            try {
                var res = await Network.get(
                    host + "/comic/filter/classify?_v=" + profile.version + profile.extra,
                    this.headers
                )
                if (res.status === 200) {
                    this._base = host
                    log('info', '再漫画', 'using api host: ' + host)
                    return host
                }
            } catch (e) {
                log('warning', '再漫画', 'api host failed: ' + host + ' -> ' + e)
            }
        }
        this._base = this.apiHosts[0]
        log('warning', '再漫画', 'all api hosts failed, fallback to ' + this._base)
        return this._base
    }

    get baseUrl() {
        return this._base || this.apiHosts[0]
    }

    profileOf(host) {
        var profile = this.hostProfiles[host]
        return profile ? profile : { version: "15", extra: "" }
    }

    /// 当前内容接口的 _v
    get appVersion() {
        return this.profileOf(this.baseUrl).version
    }

    /// 当前内容接口额外要带的客户端标识(v4api 专用, 老接口为空串)
    get clientExtra() {
        return this.profileOf(this.baseUrl).extra
    }

    async ensureHost() {
        if (!this._ready) {
            this._ready = this.probeHost()
        }
        await this._ready
    }

    /// 字符串 -> UTF-8 字节数组, 不依赖 JS 引擎的编码/散列接口
    utf8Bytes(text) {
        var bytes = []
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i)
            if (code < 0x80) {
                bytes.push(code)
            } else if (code < 0x800) {
                bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
            } else if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
                var cp = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(++i) - 0xdc00)
                bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
                    0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
            } else {
                bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f),
                    0x80 | (code & 0x3f))
            }
        }
        return bytes
    }

    /// 密码散列: 官方 App 传的是 md5(密码) 的小写十六进制。
    /// 这里自带 md5, 不走 Convert 桥: 当前 App 的 base64 分支在 decode 时会先把
    /// String 转成 Uint8List 再调需要 String 的 base64Decode, 恒定抛类型错误;
    /// 而 Convert.md5 只接受字节序列, 直接传字符串会得到 null。
    md5Hex(text) {
        var bytes = this.utf8Bytes(text)
        var bitLen = bytes.length * 8
        bytes.push(0x80)
        while (bytes.length % 64 !== 56) {
            bytes.push(0)
        }
        bytes.push(bitLen & 0xff, (bitLen >>> 8) & 0xff, (bitLen >>> 16) & 0xff,
            (bitLen >>> 24) & 0xff, 0, 0, 0, 0)

        var shifts = [
            7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
            5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
            4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
            6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
        ]
        var table = []
        for (var t = 0; t < 64; t++) {
            table.push(Math.floor(Math.abs(Math.sin(t + 1)) * 4294967296))
        }

        var h0 = 0x67452301
        var h1 = 0xefcdab89
        var h2 = 0x98badcfe
        var h3 = 0x10325476

        for (var offset = 0; offset < bytes.length; offset += 64) {
            var words = []
            for (var w = 0; w < 16; w++) {
                words.push(bytes[offset + w * 4] | (bytes[offset + w * 4 + 1] << 8) |
                    (bytes[offset + w * 4 + 2] << 16) | (bytes[offset + w * 4 + 3] << 24))
            }
            var a = h0
            var b = h1
            var c = h2
            var d = h3
            for (var i = 0; i < 64; i++) {
                var f, g
                if (i < 16) {
                    f = (b & c) | (~b & d)
                    g = i
                } else if (i < 32) {
                    f = (d & b) | (~d & c)
                    g = (5 * i + 1) % 16
                } else if (i < 48) {
                    f = b ^ c ^ d
                    g = (3 * i + 5) % 16
                } else {
                    f = c ^ (b | ~d)
                    g = (7 * i) % 16
                }
                var sum = (a + f + table[i] + words[g]) | 0
                var rotated = (sum << shifts[i]) | (sum >>> (32 - shifts[i]))
                a = d
                d = c
                c = b
                b = (b + rotated) | 0
            }
            h0 = (h0 + a) | 0
            h1 = (h1 + b) | 0
            h2 = (h2 + c) | 0
            h3 = (h3 + d) | 0
        }

        var hs = [h0, h1, h2, h3]
        var out = ""
        for (var n = 0; n < 4; n++) {
            for (var k = 0; k < 4; k++) {
                var byte = (hs[n] >>> (k * 8)) & 0xff
                out += (byte < 16 ? "0" : "") + byte.toString(16)
            }
        }
        return out
    }

    /// 发起一次接口请求并返回解析后的 JSON。
    ///
    /// [authed] 为 true 表示这是必须登录的接口: 缺 token 直接报错, 失败时判定为
    /// 登录失效(抛含 "Login expired" 的错误, App 会据此自动重登)。
    /// [withToken] 表示公开接口也顺带带上账号 —— 再漫画登录后能看到的作品比未登录多,
    /// 不带 token 时分类/标签下会少一批, 看起来像"这个标签里没有那本漫画"。
    async request(path, params, authed, withToken) {
        await this.ensureHost()

        var sendToken = !!this.token && (authed || withToken)
        var requestHeaders = Object.assign({}, this.headers)
        if (sendToken) {
            requestHeaders["Authorization"] = "Bearer " + this.token
        }

        var url = this.baseUrl + path + "?_v=" + this.appVersion + this.clientExtra
        if (params) {
            var keys = Object.keys(params)
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i]
                var v = params[k]
                if (v === null || v === undefined || v === "") {
                    continue
                }
                url += "&" + k + "=" + encodeURIComponent(v)
            }
        }

        var res = await Network.get(url, requestHeaders)
        if (res.status !== 200) {
            throw "请求失败, HTTP " + res.status
        }
        var data = JSON.parse(res.body)
        if (data === null || data === undefined) {
            throw "接口返回空数据"
        }
        if (data.errno !== undefined && data.errno !== 0) {
            var message = data.errmsg || ("接口返回错误 " + data.errno)
            /// 公开接口顺带带的 token 被拒了(常见于 token 过期): 去掉身份原样重来
            /// 一次 —— 浏览不该因为一个过期的 token 整个挂掉
            if (!authed && sendToken && this.isLoginMessage(message)) {
                log('warning', '再漫画', 'token 被拒, 改用未登录身份重试: ' + message)
                return this.request(path, params, false, false)
            }
            /// token 失效时抛出包含 Login expired 的错误, App 会据此自动重登
            if (authed && this.isLoginMessage(message)) {
                throw "Login expired: " + message
            }
            throw message
        }
        return data
    }

    /// 该错误文案是否属于"登录态有问题"
    isLoginMessage(message) {
        if (!message) {
            return false
        }
        return message.indexOf("登录") >= 0 || message.indexOf("token") >= 0 ||
            message.indexOf("过期") >= 0 || message.indexOf("失效") >= 0
    }

    /// 公开接口(分类/排行/搜索/详情)也带上账号
    api(path, params) {
        return this.request(path, params, false, true)
    }

    authApi(path, params) {
        this.requireLogin()
        return this.request(path, params, true)
    }

    requireLogin() {
        if (!this.token) {
            throw "Not login"
        }
    }

    /// 打开 App 时的自动签到 + 任务领奖。
    ///
    /// JS 源没有定时器(setTimeout / Timer 都没暴露), 做不到"每天定时"执行,
    /// 所以只能挂在 init 上: 每次源被加载(即冷启动 App)时跑一次, 当天已跑过就跳过。
    /// 全链路静默 —— 任何失败只写日志, 不外抛, 不影响浏览。
    async autoSignIn() {
        if (!this.token) {
            return
        }
        if (this.loadData("taskDate") === this.today()) {
            return
        }
        try {
            var signed = await this.signIn()
            var claimed = await this.claimTaskRewards()
            this.saveData("taskDate", this.today())
            log('info', '再漫画', '每日任务: ' + signed +
                (claimed > 0 ? ('; 领取了 ' + claimed + ' 项奖励') : ''))
        } catch (e) {
            /// 故意不写 taskDate: 本次没跑成, 下次启动再试
            log('warning', '再漫画', '每日任务失败: ' + e)
        }
    }

    today() {
        var d = new Date()
        var m = d.getMonth() + 1
        var day = d.getDate()
        return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day
    }

    /// 签到: POST /task/sign_in
    /// errno==1 是「今日已签到」这类业务提示, 不算失败, 也不该拦住后面的领奖
    async signIn() {
        var data = await this.taskRequest("POST", "/task/sign_in")
        var errno = (data.errno === undefined || data.errno === null) ? 0 : data.errno
        if (errno !== 0) {
            var message = data.errmsg || ("签到接口返回 " + errno)
            /// 「已签到」的文案各版本不一(已签到 / 今天已经签到啦 / 请勿重复签到),
            /// 逐个匹配, 命中即视为正常; 其余非 0 是真实错误, 抛出去让当天可重试
            var doneWords = ["已签到", "已经签到", "重复签到"]
            for (var i = 0; i < doneWords.length; i++) {
                if (message.indexOf(doneWords[i]) >= 0) {
                    return message
                }
            }
            throw message
        }
        return "签到成功"
    }

    /// 领取可领的任务奖励, 返回成功条数。
    ///
    /// 只处理 dayTask / newUserTask: sumSignTask 是累计签到里程碑, 它的 id 属于
    /// 另一套编号, 拿去 /task/get_reward 会失败(官方客户端的任务中心同样跳过该组)。
    async claimTaskRewards() {
        var data = await this.taskRequest("GET", "/task/list")
        var task = (data.data && data.data.task) ? data.data.task : null
        if (!task) {
            return 0
        }

        var credits = (data.data && data.data.userCurrency) ? data.data.userCurrency.credits : null
        if (credits !== null && credits !== undefined) {
            log('info', '再漫画', '当前积分: ' + credits)
        }

        var groups = [task.dayTask, task.newUserTask]
        var claimed = 0
        for (var g = 0; g < groups.length; g++) {
            var list = groups[g]
            if (!Array.isArray(list)) {
                continue
            }
            for (var i = 0; i < list.length; i++) {
                var item = list[i]
                if (!item || !this.isClaimable(item)) {
                    continue
                }
                var taskId = item.id || item.task_id || item.taskId
                if (!taskId) {
                    continue
                }
                try {
                    /// 参数名没有公开文档, 三个候选一起带, 服务端挑认得的那个
                    await this.taskRequest("GET", "/task/get_reward", {
                        task_id: taskId,
                        taskId: taskId,
                        id: taskId
                    })
                    claimed++
                } catch (e) {
                    log('warning', '再漫画', '领取奖励失败(' + (item.title || taskId) + '): ' + e)
                }
            }
        }
        return claimed
    }

    /// 是否可领: 实机 status 2=可领取; status 缺失时退回按进度判断
    isClaimable(item) {
        if (item.status === this.taskClaimable) {
            return true
        }
        if (item.status === undefined || item.status === null || item.status === 0) {
            var progress = item.progress_count || item.progress || 0
            var target = item.target_count || item.target || 0
            return target > 0 && progress >= target
        }
        return false
    }

    /// 签到/任务接口: 基址固定, query 固定带 channel/timestamp/uid
    async taskRequest(method, path, params) {
        this.requireLogin()

        var url = this.taskApi + path +
            "?channel=android&timestamp=" + Math.floor(Date.now() / 1000)
        if (this.uid) {
            url += "&uid=" + encodeURIComponent(this.uid)
        }
        if (params) {
            var keys = Object.keys(params)
            for (var i = 0; i < keys.length; i++) {
                url += "&" + keys[i] + "=" + encodeURIComponent(params[keys[i]])
            }
        }

        var headers = Object.assign({}, this.headers)
        headers["Authorization"] = "Bearer " + this.token

        var res = (method === "POST")
            ? await Network.post(url, headers, "")
            : await Network.get(url, headers)

        if (res.status !== 200) {
            throw "任务接口 HTTP " + res.status
        }
        var data = JSON.parse(res.body)
        if (data === null || data === undefined) {
            throw "任务接口返回空数据"
        }
        return data
    }

    /// 作者/题材字段 -> 标签数组。
    /// 详情接口给的是对象数组([{tag_name: "..."}]), 而列表接口给的是分隔符字符串
    /// ("校园"、"作者A、作者B"), 两种形态都要认, 否则列表卡片的 tags 恒为空。
    splitTagText(value) {
        if (!value) {
            return []
        }
        if (Array.isArray(value)) {
            var fromArray = []
            value.forEach(function (item) {
                if (item && item.tag_name) {
                    fromArray.push(item.tag_name)
                }
            })
            return fromArray
        }
        if (typeof value !== "string") {
            return []
        }
        var parts = value.split(/[,\/、|]/)
        var res = []
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim()
            if (part) {
                res.push(part)
            }
        }
        return res
    }

    /// 列表项 -> 卡片数据 (id 必须为字符串, 否则 Dart 侧解析失败)
    parseComic(comic) {
        var tags = []
        this.splitTagText(comic.types).forEach(function (t) {
            tags.push(t)
        })
        this.splitTagText(comic.authors).forEach(function (a) {
            tags.push(a)
        })
        var subTitle = comic.sub_title || ""
        if (!subTitle && typeof comic.authors === "string") {
            subTitle = comic.authors
        }
        return {
            id: "" + comic.id,
            title: comic.title || comic.name || "",
            subTitle: subTitle,
            cover: comic.cover || "",
            tags: tags,
            description: comic.description || ""
        }
    }

    /// 是否还有下一页。
    ///
    /// 不能按"本页条数 >= pageSize"判断: 再漫画的部分接口(如书架 /comic/sub/list)
    /// 会无视 size 只返回很少几条, 那样会被误判成"没有下一页", 后面的收藏就整个看不到了。
    /// 只要本页有数据就先认为还有下一页 —— App 侧有"空页就停"的兜底, 多请求一次是安全的。
    nextPage(list, page) {
        return list.length > 0 ? page + 1 : page
    }

    /// 话的显示名。
    ///
    /// "卷"(单行本)在再漫画通常要购买或更高等级才能读, 而详情接口不返回可读性,
    /// 只能按标题里的"卷"字提示一下, 免得把它当普通话选了、下载时才发现取不到图片。
    epTitle(chapter) {
        var title = chapter.chapter_title || ("" + chapter.chapter_id)
        if (title.indexOf("卷") >= 0 && title.indexOf("(可能需购买)") < 0) {
            title = title + "(可能需购买)"
        }
        return title
    }

    /// 读取筛选项 (0=主题 1=受众 2=状态 3=地域)
    async classify() {
        var data = await this.api("/comic/filter/classify")
        var d = data.data
        if (!d || !d.classifyList) {
            throw "未取到分类数据"
        }
        return d.classifyList
    }

    async filterList(page, extra) {
        var params = {
            page: page,
            size: this.pageSize,
            sortType: 1,
            /// cate(受众)/zone(地区) 显式给 0 = 全部。不传时服务端可能走另一套
            /// 默认筛选, 结果是标签下少一批作品
            cate: 0,
            zone: 0
        }
        if (extra) {
            var keys = Object.keys(extra)
            for (var i = 0; i < keys.length; i++) {
                params[keys[i]] = extra[keys[i]]
            }
        }
        var data = await this.api("/comic/filter/list", params)
        var list = (data.data && data.data.comicList) ? data.data.comicList : []
        var self = this
        return {
            comics: list.map(function (c) {
                return self.parseComic(c)
            }),
            maxPage: this.nextPage(list, page)
        }
    }

    /// 账号: 登录后 token 持久化在源数据里, 重新打开 App 自动恢复
    account = {
        login: async (account, pwd) => {
            await this.ensureHost()

            /// 散列失败时给出可读原因, 否则只会看到一句莫名其妙的登录失败
            var passwd = null
            try {
                passwd = this.md5Hex(pwd)
            } catch (e) {
                throw "密码加密失败(JS 引擎散列接口异常): " + e
            }

            var body = "username=" + encodeURIComponent(account) +
                "&passwd=" + passwd +
                "&channel=android&timestamp=" + Math.floor(Date.now() / 1000)

            var res = await Network.post(
                this.accountApi + "/login/passwd",
                {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "User-Agent": this.headers["User-Agent"],
                },
                body
            )

            if (res.status !== 200) {
                throw "登录失败, HTTP " + res.status
            }

            var json = JSON.parse(res.body)
            if (json === null || json === undefined) {
                throw "登录失败: 接口返回空数据"
            }
            if (json.errno !== undefined && json.errno !== 0) {
                throw (json.errmsg || "登录失败")
            }

            var payload = json.data || json
            var user = payload.user || payload
            if (!user || !user.token) {
                throw "登录失败: 接口未返回 token"
            }

            this.token = user.token
            this.uid = user.uid
            this.saveData("token", user.token)
            this.saveData("uid", user.uid)
            if (user.nickname) {
                this.saveData("nickname", user.nickname)
            }
            log('info', '再漫画', '登录成功: ' + (user.nickname || account))
        },

        logout: () => {
            this.token = null
            this.uid = null
            this.deleteData("token")
            this.deleteData("uid")
            this.deleteData("nickname")
            log('info', '再漫画', '已退出登录')
        }
    }

    /// 分类页(「分类」tab 下的再漫画页): 题材网格。
    /// tagId 取自 /comic/filter/classify 的题材组; 该接口不认读者群/地域参数
    /// (实测 audience/readerGroup/zone/region 等 14 个候选名均无效), 故这两组不列。
    category = {
        title: "再漫画",
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: ["全部", "冒险", "欢乐向", "格斗", "科幻", "爱情", "侦探", "竞技",
                    "魔法", "神鬼", "校园", "惊悚", "其他", "四格", "亲情", "ゆり", "秀吉", "悬疑",
                    "纯爱", "热血", "泛爱", "历史", "战争", "萌系", "宅系", "治愈", "励志", "武侠",
                    "机战", "音乐舞蹈", "美食", "职场", "西方魔幻", "高清单行", "TS", "东方", "魔幻",
                    "奇幻", "节操", "轻小说", "颜艺", "搞笑", "仙侠", "舰娘", "动画", "AA", "福瑞",
                    "生存", "日常", "画集", "2025冬", "2026春"],
                itemType: "category",
                categoryParams: ["", "4", "5", "6", "7", "8", "9", "10",
                    "11", "12", "13", "14", "16", "17", "3242", "3243", "3244", "3245",
                    "3246", "3248", "3249", "3250", "3251", "3252", "3253", "3254", "3255", "3324",
                    "3325", "3326", "3327", "3328", "3365", "4459", "4518", "5077", "5806", "5848",
                    "6219", "6316", "6437", "7568", "7900", "13627", "17192", "18522", "23323", "23388",
                    "30788", "31137", "34093", "36172"]
            }
        ]
    }

    /// 分类页的筛选与列表: 题材(param) + 进度 + 排序。
    /// 分页用接口返回的 totalNum 精确计算, 不再按本次条数猜。
    categoryComics = {
        optionList: [
            {
                options: ["0-全部", "2309-连载中", "2310-已完结", "29205-短篇"],
                notShowWhen: [],
                showWhen: null
            },
            {
                options: ["*1-最近更新", "2-人气最高"],
                notShowWhen: [],
                showWhen: null
            }
        ],

        load: async (category, param, options, page) => {
            var params = {
                page: page,
                size: this.pageSize,
                sortType: String(options[1] || "").replace("*", "") || "1",
                /// 同 filterList: 显式声明"全部受众 / 全部地区"
                cate: 0,
                zone: 0
            }
            if (param) {
                params.theme = param
            }
            var status = String(options[0] || "").replace("*", "")
            if (status && status !== "0") {
                params.status = status
            }

            var data = await this.api("/comic/filter/list", params)
            var list = (data.data && data.data.comicList) ? data.data.comicList : []
            var total = (data.data && data.data.totalNum) ? data.data.totalNum : 0
            var self = this
            return {
                comics: list.map(function (c) {
                    return self.parseComic(c)
                }),
                maxPage: total > 0 ? Math.ceil(total / this.pageSize) : page
            }
        }
    }

    explore = [
        {
            title: "人气榜",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.filterList(page, { sortType: 2 })
            }
        },
        {
            title: "最近更新",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.filterList(page, { sortType: 1 })
            }
        },
        {
            title: "分类浏览",
            type: "singlePageWithMultiPart",
            load: async () => {
                var classifyList = await this.classify()
                var themes = (classifyList[0] && classifyList[0].list) ? classifyList[0].list : []
                var res = {}
                for (var i = 0; i < themes.length; i++) {
                    var theme = themes[i]
                    try {
                        var part = await this.filterList(1, { theme: theme.tagId, sortType: 2 })
                        res[theme.tagName] = part.comics
                    } catch (e) {
                        log('warning', '再漫画', 'load theme failed: ' + theme.tagName + ' -> ' + e)
                    }
                }
                return res
            }
        }
    ]

    search = {
        optionList: [],
        load: async (keyword, options, page) => {
            var data = await this.api("/search/index", {
                source: 0,
                page: page,
                size: this.pageSize,
                keyword: keyword
            })
            var list = (data.data && data.data.list) ? data.data.list : []
            var self = this
            return {
                comics: list.map(function (c) {
                    return self.parseComic(c)
                }),
                maxPage: this.nextPage(list, page)
            }
        }
    }

    /// 收藏(订阅): 再漫画是单书架, 故 multiFolder 为 false
    favorites = {
        multiFolder: false,

        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            await this.authApi(isAdding ? "/comic/sub/add" : "/comic/sub/del", {
                comic_id: comicId
            })
        },

        loadComics: async (page, folder) => {
            var json = await this.authApi("/comic/sub/list", {
                status: 0,
                firstLetter: "",
                page: page,
                size: this.pageSize
            })
            var list = (json.data && json.data.subList) ? json.data.subList : []
            var self = this
            return {
                comics: list.map(function (c) {
                    return self.parseComic(c)
                }),
                maxPage: this.nextPage(list, page)
            }
        }
    }

    comic = {
        loadInfo: async (id) => {
            var data = await this.api("/comic/detail/" + id)
            var d = (data.data && data.data.data) ? data.data.data : null
            if (!d) {
                throw "漫画不存在或已被删除"
            }

            var tags = {}
            if (d.authors && d.authors.length > 0) {
                tags["作者"] = d.authors.map(function (a) {
                    return a.tag_name
                })
            }
            if (d.status && d.status.length > 0) {
                tags["状态"] = d.status.map(function (s) {
                    return s.tag_name
                })
            }
            if (d.types && d.types.length > 0) {
                tags["题材"] = d.types.map(function (t) {
                    return t.tag_name
                })
            }
            if (d.last_update_chapter_name) {
                tags["最新"] = [d.last_update_chapter_name]
            }

            /// 章节接口按最新章节在前返回, 这里倒序成"第 1 话在前"
            var chapters = {}
            if (d.chapters && d.chapters.length > 0 && d.chapters[0].data) {
                var raw = d.chapters[0].data
                for (var i = raw.length - 1; i >= 0; i--) {
                    chapters["" + raw[i].chapter_id] = this.epTitle(raw[i])
                }
            }

            /// 已登录时顺带查一次订阅状态, 失败不影响详情展示
            var isFavorite = null
            if (this.token) {
                try {
                    var sub = await this.authApi("/comic/sub/checkIsSub", {
                        objId: id,
                        source: 1
                    })
                    isFavorite = !!(sub.data && sub.data.isSub)
                } catch (e) {
                    log('warning', '再漫画', 'checkIsSub failed: ' + e)
                }
            }

            return {
                title: d.title,
                subTitle: (d.authors && d.authors.length > 0) ? d.authors[0].tag_name : null,
                cover: d.cover || "",
                description: d.description || "",
                tags: tags,
                chapters: chapters,
                isFavorite: isFavorite
            }
        },

        loadEp: async (comicId, epId) => {
            var data = await this.request("/comic/chapter/" + comicId + "/" + epId, null, !!this.token)
            var d = (data.data && data.data.data) ? data.data.data : null
            if (!d) {
                throw "章节不存在或已被删除"
            }
            if (d.canRead === false) {
                /// 带上章节名: 再漫画的"卷"(单行本)多数要购买或更高等级才能读,
                /// 只说"需要登录"会让人以为是自己没登录, 白折腾半天
                throw "章节不可阅读(需购买或更高等级): " + (d.title || epId)
            }
            var urls = d.page_url || []
            if (!Array.isArray(urls) || urls.length === 0) {
                throw "未取到图片地址(可能需要登录)"
            }
            return { images: urls }
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                url: url,
                headers: this.imageHeaders
            }
        }
    }
}
