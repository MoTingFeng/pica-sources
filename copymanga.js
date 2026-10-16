class CopyManga_xiaoyaosheny extends ComicSource {

    name = "拷贝漫画（修正）"

    key = "xiaoyaosheny_copymanga"

    version = "1.1.7"

    minAppVersion = "3.1.0"

    url = "https://raw.githubusercontent.com/MoTingFeng/pica-sources/main/copymanga.js"

    headers = {}

    /// 官方 App 版本参数: 服务端按该值做版本门禁, 低于 3.0.0 一律返回
    /// code 210 (請升級到最新的APP(3.0.0)); 3.0.0 实测可用, 2025.08.15 等日期式取值在
    /// api.mangacopy.com 上无效。登录成功后 headers 的 User-Agent 会跟随该值。
    static copyVersion = "3.0.0"

    /// 备用域名, 依次探测, 第一个可用的会被采用
    /// 2026-10-16 实测: copymanga.info/.org/.net 皆 SSL EOF, copymanga.site 证书错误,
    /// api.copymanga.tv 域名已废, 只有 mangacopy.com 可用, 故不再保留其余域名
    domains = ["mangacopy.com"]

    _host = null

    _ready = null

    async probeDomain() {
        for (let i = 0; i < this.domains.length; i++) {
            let d = this.domains[i]
            try {
                let res = await Network.get(`https://api.${d}/api/v3/comics?limit=1&offset=0&platform=3`, this.headers)
                if (res.status !== 200) {
                    throw `http ${res.status}`
                }
                // 只判断 HTTP 200 会把「HTTP 200 + 业务 code 210」误判为域名可用:
                // api.mangacopy.com 在 version 不为 3.0.0 时正是这样返回的
                let code = null
                try {
                    code = JSON.parse(res.body).code
                } catch (e) {
                    // body 非 JSON (例如字面 error), 视为不可用
                }
                if (code !== 200) {
                    throw `business code ${code}`
                }
                this._host = d
                log('info', 'CopyManga', `using domain: ${d}`)
                return d
            } catch (e) {
                log('warning', 'CopyManga', `domain ${d} failed: ${e}`)
            }
        }
        log('warning', 'CopyManga', 'all domains failed, fallback to ' + this.domains[0])
        return this.domains[0]
    }

    init() {
        let token = this.loadData("token");
        if (!token) {
            token = "";
        } else {
            token = " " + token;
        }
        this.headers = {
//            "User-Agent": "COPY/" + CopyManga_xiaoyaosheny.copyVersion,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "gzip",
            "source": "copyApp",
            "webp": "1",
            "region": "1",
            "version": CopyManga_xiaoyaosheny.copyVersion,
            "authorization": `Token${token}`,
            "platform": "3",
        }
        this._ready = this.probeDomain()
    }

    get baseUrl() {
        return this._host || this.domains[0]
    }

    /// account
    /// set this to null to desable account feature
    account = {
        /// login func
        login: async (account, pwd) => {
            if (this._ready) {
                await this._ready
            }
            let salt = randomInt(1000, 9999)
            let base64 = Convert.encodeBase64(`${pwd}-${salt}`)
            let res = await Network.post(
                `https://api.${this.baseUrl}/api/v3/login?platform=3`,
                {
                    ...this.headers,
                    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
                },
                `username=${account}&password=${base64}&salt=${salt}&platform=3&authorization=Token+&version=${CopyManga_xiaoyaosheny.copyVersion}&source=copyApp&region=1&webp=1`
            );
            if (res.status === 200) {
                let data = JSON.parse(res.body)
                // 版本门禁与「破解版限制」都会返回 code 210 + results 为 null,
                // 直接取 .token 会抛 TypeError: cannot read property 'token' of null
                let token = data.results && data.results.token
                if (!token) {
                    throw `登录失败: ${data.message || (data.results && data.results.detail) || res.body}`
                }
                this.saveData('token', token)
                this.headers = {
                    "User-Agent": "COPY/" + CopyManga_xiaoyaosheny.copyVersion,
                    "Accept": "*/*",
                    "Accept-Encoding": "gzip",
                    "source": "copyApp",
                    "webp": "1",
                    "region": "1",
                    "version": CopyManga_xiaoyaosheny.copyVersion,
                    "authorization": `Token ${token}`,
                    "platform": "3",
                }
                return "ok"
            } else {
                // 非 200 (实测「破解版限制」返回 HTTP 210) 时透传服务端文案, 不要只报状态码
                let msg = null
                try {
                    let data = JSON.parse(res.body)
                    msg = data.message || (data.results && data.results.detail)
                } catch (e) {
                }
                throw msg ? `登录失败(${res.status}): ${msg}` : `Invalid Status Code ${res.status}`
            }
        },
        // callback when user log out
        logout: () => {
            this.deleteData('token')
        },
        registerWebsite: `https://www.${this.baseUrl}/web/login/loginByAccount`
    }

    /// explore pages
    explore = [
        {
            title: "拷贝漫画",
            type: "singlePageWithMultiPart",
            load: async () => {
                let dataStr = await Network.get(
                    `https://api.${this.baseUrl}/api/v3/h5/homeIndex?platform=3`,
                    this.headers
                )

                if (dataStr.status !== 200) {
                    throw `Invalid status code: ${dataStr.status}`
                }

                let data = JSON.parse(dataStr.body)

                function parseComic(comic) {
                    if (comic["comic"] !== null && comic["comic"] !== undefined) {
                        comic = comic["comic"]
                    }
                    let tags = []
                    if (comic["theme"] !== null && comic["theme"] !== undefined) {
                        tags = comic["theme"].map(t => t["name"])
                    }
                    let author = null

                    if (Array.isArray(comic["author"]) && comic["author"].length > 0) {
                        author = comic["author"][0]["name"]
                    }

                    return {
                        id: comic["path_word"],
                        title: comic["name"],
                        subTitle: author,
                        cover: comic["cover"],
                        tags: tags
                    }
                }

                let res = {}
                res["推荐"] = data["results"]["recComics"]["list"].map(parseComic)
                res["热门"] = data["results"]["hotComics"].map(parseComic)
                res["最新"] = data["results"]["newComics"].map(parseComic)
                res["完结"] = data["results"]["finishComics"]["list"].map(parseComic)
                res["今日排行"] = data["results"]["rankDayComics"]["list"].map(parseComic)
                res["本周排行"] = data["results"]["rankWeekComics"]["list"].map(parseComic)
                res["本月排行"] = data["results"]["rankMonthComics"]["list"].map(parseComic)

                return res
            }
        }
    ]

    category = {
        title: "拷贝漫画",
        parts: [
            {
                name: "主题",
                type: "fixed",
                categories: ["全部", "爱情", "欢乐向", "冒险", "奇幻", "百合", "校园", "科幻", "东方", "耽美", "生活", "格斗", "轻小说", "悬疑",
                    "其它", "神鬼", "职场", "TL", "萌系", "治愈", "长条"],
                itemType: "category",
                categoryParams: ["", "aiqing", "huanlexiang", "maoxian", "qihuan", "baihe", "xiaoyuan", "kehuan", "dongfang", "danmei", "shenghuo", "gedou", "qingshuo", "xuanyi",
                    "qita", "shengui", "zhichang", "teenslove", "mengxi", "zhiliao", "changtiao"]
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            options = options.map(e => e.replace("*", "-"))
            let res = await Network.get(
                `https://api.${this.baseUrl}/api/v3/comics?limit=21&offset=${(page - 1) * 21}&ordering=${options[1]}&theme=${param}&top=${options[0]}&platform=3`,
                this.headers
            )
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }

            let data = JSON.parse(res.body)

            function parseComic(comic) {
                if (comic["comic"] !== null && comic["comic"] !== undefined) {
                    comic = comic["comic"]
                }
                let tags = []
                if (comic["theme"] !== null && comic["theme"] !== undefined) {
                    tags = comic["theme"].map(t => t["name"])
                }
                let author = null

                if (Array.isArray(comic["author"]) && comic["author"].length > 0) {
                    author = comic["author"][0]["name"]
                }

                return {
                    id: comic["path_word"],
                    title: comic["name"],
                    subTitle: author,
                    cover: comic["cover"],
                    tags: tags,
                    description: comic["datetime_updated"]
                }
            }

            return {
                comics: data["results"]["list"].map(parseComic),
                maxPage: (data["results"]["total"] - (data["results"]["total"] % 21)) / 21 + 1
            }
        },
        optionList: [
            {
                options: [
                    "-全部",
                    "japan-日漫",
                    "korea-韩漫",
                    "west-美漫",
                    "finish-已完结"
                ],
                notShowWhen: null,
                showWhen: null
            },
            {
                options: [
                    "*datetime_updated-时间倒序",
                    "datetime_updated-时间正序",
                    "*popular-热度倒序",
                    "popular-热度正序",
                ],
                notShowWhen: null,
                showWhen: null
            }
        ]
    }

    search = {
        load: async (keyword, options, page) => {
            keyword = encodeURIComponent(keyword)
            var res = await Network.get(
                `https://www.${this.baseUrl}/api/kb/web/searchbd/comics?limit=21&offset=${(page - 1) * 21}&q=${keyword}&q_type=&platform=3`,
                this.headers
            )
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }

            let data = JSON.parse(res.body)

            function parseComic(comic) {
                if (comic["comic"] !== null && comic["comic"] !== undefined) {
                    comic = comic["comic"]
                }
                let tags = []
                if (comic["theme"] !== null && comic["theme"] !== undefined) {
                    tags = comic["theme"].map(t => t["name"])
                }
                let author = null

                if (Array.isArray(comic["author"]) && comic["author"].length > 0) {
                    author = comic["author"][0]["name"]
                }

                return {
                    id: comic["path_word"],
                    title: comic["name"],
                    subTitle: author,
                    cover: comic["cover"],
                    tags: tags,
                }
            }

            return {
                comics: data["results"]["list"].map(parseComic),
                maxPage: (data["results"]["total"] - (data["results"]["total"] % 21)) / 21 + 1
            }
        },
        /*
        optionList: [
            {
                options: [
                    "0-time",
                    "1-popular"
                ],
                label: "sort"
            }
        ]
        */
        optionList: []
    }

    favorites = {
        multiFolder: false,
        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            let is_collect = isAdding ? 1 : 0
            let token = this.loadData("token");
            let comicData = await Network.get(
                `https://api.${this.baseUrl}/api/v3/comic2/${comicId}?platform=3`,
                this.headers
            )
            if (comicData.status !== 200) {
                throw `Invalid status code: ${comicData.status}`
            }
            let comic_id = JSON.parse(comicData.body).results.comic.uuid
            let res = await Network.post(
                `https://api.${this.baseUrl}/api/v3/member/collect/comic?platform=3`,
                {
                    ...this.headers,
                    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
                },
                `comic_id=${comic_id}&is_collect=${is_collect}&authorization=Token+${token}`
            )
            if (res.status === 401) {
                throw `Login expired`;
            }
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }
            return "ok"
        },
        loadComics: async (page, folder) => {
            var res = await Network.get(
                `https://api.${this.baseUrl}/api/v3/member/collect/comics?limit=21&offset=${(page - 1) * 21}&free_type=1&ordering=-datetime_updated&platform=3`,
                this.headers
            )

            if (res.status === 401) {
                throw `Login expired`
            }

            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }

            let data = JSON.parse(res.body)

            function parseComic(comic) {
                if (comic["comic"] !== null && comic["comic"] !== undefined) {
                    comic = comic["comic"]
                }
                let tags = []
                if (comic["theme"] !== null && comic["theme"] !== undefined) {
                    tags = comic["theme"].map(t => t["name"])
                }
                let author = null

                if (Array.isArray(comic["author"]) && comic["author"].length > 0) {
                    author = comic["author"][0]["name"]
                }

                return {
                    id: comic["path_word"],
                    title: comic["name"],
                    subTitle: author,
                    cover: comic["cover"],
                    tags: tags,
                    description: comic["datetime_updated"]
                }
            }

            return {
                comics: data["results"]["list"].map(parseComic),
                maxPage: (data["results"]["total"] - (data["results"]["total"] % 21)) / 21 + 1
            }
        }
    }

    comic = {
        loadInfo: async (id) => {
            async function getChapters(id) {
                var res = await Network.get(
                    `https://api.${this.baseUrl}/api/v3/comic/${id}/group/default/chapters?limit=500&offset=0&platform=3`,
                    this.headers
                );
                if (res.status !== 200) {
                    throw `Invalid status code: ${res.status}`;
                }
                let data = JSON.parse(res.body);
                let eps = new Map();
                data.results.list.forEach((e) => {
                    let title = e.name;
                    let id = e.uuid;
                    eps.set(id, title);
                });
                let maxChapter = data.results.total;
                if (maxChapter > 500) {
                    let offset = 500;
                    while (offset < maxChapter) {
                        res = await Network.get(
                            `https://api.${this.baseUrl}/api/v3/comic/chongjingchengweimofashaonv/group/default/chapters?limit=500&offset=${offset}&platform=3`,
                            this.headers
                        );
                        if (res.status !== 200) {
                            throw `Invalid status code: ${res.status}`;
                        }
                        data = JSON.parse(res.body);
                        data.results.list.forEach((e) => {
                            let title = e.name;
                            let id = e.uuid;
                            eps.set(id, title)
                        });
                        offset += 500;
                    }
                }
                return eps;
            }

            async function getFavoriteStatus(id) {
                let res = await Network.get(`https://api.${this.baseUrl}/api/v3/comic2/${id}/query?platform=3`, this.headers);
                if (res.status !== 200) {
                    throw `Invalid status code: ${res.status}`;
                }
                return JSON.parse(res.body).results.collect != null;
            }

            let results = await Promise.all([
                Network.get(
                    `https://api.${this.baseUrl}/api/v3/comic2/${id}?platform=3`,
                    this.headers
                ),
                getChapters.bind(this)(id),
                getFavoriteStatus.bind(this)(id)
            ])

            if (results[0].status !== 200) {
                throw `Invalid status code: ${res.status}`;
            }

            let comicData = JSON.parse(results[0].body).results.comic;

            let title = comicData.name;
            let cover = comicData.cover;
            let authors = comicData.author.map(e => e.name);
            let tags = comicData.theme.map(e => e.name);
            let updateTime = comicData.datetime_updated;
            let description = comicData.brief;


            return {
                title: title,
                cover: cover,
                description: description,
                tags: {
                    "作者": authors,
                    "更新": [updateTime],
                    "标签": tags
                },
                chapters: results[1],
                isFavorite: results[2],
                subId: comicData.uuid
            }
        },
        loadEp: async (comicId, epId) => {
            let res = await Network.get(
                `https://api.${this.baseUrl}/api/v3/comic/${comicId}/chapter2/${epId}?platform=3`,
                this.headers
            );

            if (res.status !== 200){
                throw `Invalid status code: ${res.status}`;
            }

            let data = JSON.parse(res.body);

            let imagesUrls = data.results.chapter.contents.map(e => e.url)

            let orders = data.results.chapter.words

            let images = imagesUrls.map(e => "")

            for(let i=0; i < imagesUrls.length; i++){
                images[orders[i]] = imagesUrls[i]
            }

            return {
                images: images
            }
        },
        loadComments: async (comicId, subId, page, replyTo) => {
            let url = `https://api.${this.baseUrl}/api/v3/comments?comic_id=${subId}&limit=20&offset=${(page-1)*20}`;
            if(replyTo){
                url = url + `&reply_id=${replyTo}&_update=true`;
            }
            let res = await Network.get(
                url,
                this.headers,
            );

            if (res.status !== 200){
                throw `Invalid status code: ${res.status}`;
            }

            let data = JSON.parse(res.body);

            let total = data.results.total;

            return {
                comments: data.results.list.map(e => {
                    return {
                        userName: e.user_name,
                        avatar: e.user_avatar,
                        content: e.comment,
                        time: e.create_at,
                        replyCount: e.count,
                        id: e.id,
                    }
                }),
                maxPage: (total - (total % 20)) / 20 + 1,
            }
        },
        sendComment: async (comicId, subId, content, replyTo) => {
            let token = this.loadData("token");
            if(!token){
                throw "未登录"
            }
            if(!replyTo){
                replyTo = '';
            }
            let res = await Network.post(
                `https://api.${this.baseUrl}/api/v3/member/comment`,
                {
                    ...this.headers,
                    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
                },
                `comic_id=${subId}&comment=${encodeURIComponent(content)}&reply_id=${replyTo}`,
            );

            if (res.status === 401){
                error(`Login expired`);
                return;
            }

            if (res.status !== 200){
                throw `Invalid status code: ${res.status}`;
            } else {
                return "ok"
            }
        }
    }
}