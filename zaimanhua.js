class ZaiManHua extends ComicSource {

    name = "再漫画"

    key = "zaimanhua"

    version = "2.0.0"

    minAppVersion = "3.1.0"

    url = "https://raw.githubusercontent.com/MoTingFeng/pica-sources/main/zaimanhua.js"

    /// 官方 App 版本参数(_v): 详情与章节接口不带该参数时, 隐藏作品会返回"漫画不存在"。
    /// 15 为社区客户端实测可用值; 官方当前版本号为 2.3.8, 若 15 失效可改为 "2.3.8"。
    appVersion = "15"

    /// 内容接口前缀候选, 启动时依次探测, 第一个返回 200 的被采用
    apiHosts = [
        "https://m.zaimanhua.com/api/app/v1",
        "https://v4api.zaimanhua.com/app/v1",
    ]

    /// 账号接口与内容接口不同域
    accountApi = "https://account-api.zaimanhua.com/v1"

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
    }

    async probeHost() {
        for (var i = 0; i < this.apiHosts.length; i++) {
            var host = this.apiHosts[i]
            try {
                var res = await Network.get(
                    host + "/comic/filter/classify?_v=" + this.appVersion,
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

    async ensureHost() {
        if (!this._ready) {
            this._ready = this.probeHost()
        }
        await this._ready
    }

    /// 字节序列 -> 十六进制小写字符串(兼容 ArrayBuffer / Uint8Array / 数组)
    toHex(value) {
        if (typeof value === "string") {
            return value.toLowerCase()
        }
        var bytes = value
        if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
            bytes = new Uint8Array(value)
        }
        if (!bytes || bytes.length === undefined) {
            throw "无法识别的散列结果类型"
        }
        var out = ""
        for (var i = 0; i < bytes.length; i++) {
            var part = (bytes[i] & 0xff).toString(16)
            out += part.length === 1 ? "0" + part : part
        }
        return out
    }

    /// 密码散列: 官方 App 传的是 md5(密码) 的小写十六进制。
    /// 注意 Convert.md5 只接受字节序列, 直接传字符串会被 Dart 侧吞掉并返回 null,
    /// 这里用 base64 往返把字符串转成字节。
    md5Hex(text) {
        var bytes = Convert.decodeBase64(Convert.encodeBase64(text))
        return this.toHex(Convert.md5(bytes))
    }

    /// 发起一次接口请求并返回解析后的 JSON
    async request(path, params, authed) {
        await this.ensureHost()

        var requestHeaders = Object.assign({}, this.headers)
        if (authed) {
            requestHeaders["Authorization"] = "Bearer " + this.token
        }

        var url = this.baseUrl + path + "?_v=" + this.appVersion
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
            /// token 失效时抛出包含 Login expired 的错误, App 会据此自动重登
            if (authed && (message.indexOf("登录") >= 0 || message.indexOf("token") >= 0 ||
                message.indexOf("过期") >= 0 || message.indexOf("失效") >= 0)) {
                throw "Login expired: " + message
            }
            throw message
        }
        return data
    }

    api(path, params) {
        return this.request(path, params, false)
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

    /// 列表项 -> 卡片数据 (id 必须为字符串, 否则 Dart 侧解析失败)
    parseComic(comic) {
        var tags = []
        if (comic.authors && Array.isArray(comic.authors)) {
            comic.authors.forEach(function (a) {
                if (a && a.tag_name) {
                    tags.push(a.tag_name)
                }
            })
        }
        if (comic.types && Array.isArray(comic.types)) {
            comic.types.forEach(function (t) {
                if (t && t.tag_name) {
                    tags.push(t.tag_name)
                }
            })
        }
        return {
            id: "" + comic.id,
            title: comic.title || comic.name || "",
            subTitle: comic.sub_title || "",
            cover: comic.cover || "",
            tags: tags,
            description: comic.description || ""
        }
    }

    /// 是否还有下一页: 接口未返回总页数时按本次条数判断
    nextPage(list, page) {
        return list.length >= this.pageSize ? page + 1 : page
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
            sortType: 1
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
                    chapters["" + raw[i].chapter_id] = raw[i].chapter_title
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
                throw "该章节需要登录或更高账号权限"
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
