# pica-sources

PicaComic 的自维护漫画源仓库。主要解决三件事：

1. **源可自更新**：脚本里 `url` 指向本仓库，App 内点「更新」即可拉到最新版，不必重新发版 App。
2. **统一源列表**：App 的「添加漫画源 → 浏览列表」指向本仓库的 `index.json`，所有源集中管理，
   不受上游 `wgh136/pica_configs` 停更（2024-08-23 后无更新）影响。
3. **域名存活性监测**：GitHub Actions 每天探测各 API 域名，把结果写进 `domains.json`。

## 文件

| 文件 | 作用 |
| --- | --- |
| `copymanga.js` | 拷贝漫画源（修正版：修 `CopyManga` 未定义 + 多域名自动探测） |
| `zaimanhua.js` | 再漫画源 |
| `komiic.js` | Komiic 源（自上游收编，仅改 `url` 指向本仓库） |
| `ikmmh.js` | 爱看漫源（自上游收编，仅改 `url`） |
| `baozi.js` | 包子漫画源（自上游收编，仅改 `url`） |
| `index.json` | 源清单：既供 App「浏览列表」展示，也供更新检查比对版本 |
| `domains.json` | 由 Actions 每天生成的域名探测结果（含可用域名排序 `order`） |
| `.github/workflows/probe.yml` | 定时探测任务 |

## copymanga.js 说明

- `key = "xiaoyaosheny_copymanga"`（与上游同 key，替换时先删旧源再导入）
- `version = "1.1.5"`：**每次改动脚本都要 +1**，否则 App 的自动检查发现不了更新
- `url`：指向本仓库的 raw 地址（App 的「更新」按钮从这里拉取）
- 内置 `probeDomain()`：启动时依次探测候选域名 `https://api.<域名>/api/v3/comics?...`，
  第一个返回 200 的被采用；全部失败则回退到 `domains[0]`（`mangacopy.com`）。
  探测用的是**设备自己的网络**，比云端探测更贴近实际可用性。

### 相对上游的修改

| 修改 | 原因 |
| --- | --- |
| `CopyManga.copyVersion` → `CopyManga_xiaoyaosheny.copyVersion`（4 处） | 上游类名与引用不一致，登录时抛 `ReferenceError: CopyManga is not defined` |
| 新增 `domains` + `probeDomain()`，`baseUrl` 改为动态取值 | 上游写死 `mangacopy.com`，域名轮换后无法自愈 |
| 域名列表剔除 `copymanga.tv` / `api.xsskc.com` | 两者已无 DNS A 记录 |

## zaimanhua.js 说明

- `key = "zaimanhua"`，`version = "2.2.2"`，导入方式与拷贝漫画源相同
- 接口前缀候选（启动时依次探测，首个返回 200 的被采用）：**v4api 优先**，
  `https://v4api.zaimanhua.com/app/v1` → `https://m.zaimanhua.com/api/app/v1`。
  两者不是同一套接口：v4api 是官方新版接口，分类/标签与书架返回的作品比
  m 站老接口全（老接口看着「没有那本漫画」）。探测不过会自动落到 m 站
- `_v` 按域名取（`hostProfiles`）：m 站 `15`（社区客户端实测值）、v4api `2.3.8`。
  v4api 还要带 `platform=android` 与渠道号 `_c`，否则数据可能不全。详情与章节
  请求不带 `_v` 时，「神隐」作品会返回「漫画不存在」
- 公开接口（人气榜 / 分类 / 搜索 / 详情）在已登录时也**顺带带上 `Authorization`**
  —— 再漫画登录后能看到的作品更多；token 被服务端拒掉时自动去掉身份重试一次，
  浏览不会因为一个过期的 token 整个挂掉
- `filter/list` 显式传 `cate=0`（读者群）与 `zone=0`（地域）表示「全部」；
  不传时服务端可能走另一套默认筛选，标签下会少一批
- 读者群 / 地域**是生效的**（2026-10-20 实测）：`filter/list` 加 `cate=3262`
  （少年漫画）时「冒险」的 `totalNum` 从 1477 降到 1205，加 `zone` 同理。
  早前「实测 14 个候选名均无效」的结论是错的，2.2.1 已把这两组做进分类页
- 已实现：登录、收藏（订阅）、人气榜 / 最近更新 / 分类浏览（explore）、搜索、
  详情、章节图片、下载（下载与内置源共用同一链路，只要 `loadInfo` 非空即可）、
  自动签到与任务领奖、以及「分类」Tab 的三组入口（题材 / 读者群 / 地域）
- 登录：`POST https://account-api.zaimanhua.com/v1/login/passwd`，表单
  `username` + `passwd=md5(密码)` 小写十六进制。成功后 token 写入源数据
  （`saveData`），重开 App 自动恢复，后续请求带 `Authorization: Bearer <token>`
- 收藏：再漫画是单书架，故 `multiFolder = false`。`/comic/sub/list` 读书架、
  `/comic/sub/add` 与 `/comic/sub/del` 增删；详情页收藏状态取自
  `/comic/sub/checkIsSub`
  - 每页请求 `size=50`（`shelfPageSize`）。书架接口对 `size` 的处理与列表接口
    不同、会少返回，值调大只减少翻页次数，不影响正确性
  - 防重复页：若某页首条 id 与上一页相同，判定服务端对越界页原样返回，停止翻页
    （否则 `nextPage` 恒 `page+1` 会一直翻下去）
  - **收藏数量天然比官方 App 少**：官方书架是 `/comic/sub/list`（漫画）+
    `/novel/sub/list`（轻小说）两个，本项目只做漫画，轻小说条目不计入
- 「分类」Tab：三组入口（题材 / 读者群 / 地域），`categoryParams` 用
  `cate=3262`、`zone=2304` 这样的前缀区分组别，题材组仍传纯 tagId；
  `categoryComics.load` 见到 `=` 就按 `k=v` 覆盖参数，否则当作题材
- **多维度筛选**（2.2.2，需要宿主支持 `categoryComics.loadMulti`，见
  PicaComic `4.6.3-mod`）：源里新增 `loadMulti(groupParams, options, page)`，
  `groupParams` 是所有分组当前选中值，如
  `{"题材":"4","读者群":"cate=3262","地域":"zone=2304"}`。宿主的分类列表页会把
  「其它小组」（标签数 ≤ 16 的组，即读者群/地域）平铺成可选项，选中即重载，
  于是题材 + 读者群 + 地域 + 进度 + 排序可以同时生效。
  服务端实测支持四维叠加：冒险 1477 部，叠加少年 + 日本 + 连载中后剩 **1 部**。
  老宿主没有 `loadMulti`，会继续走单维 `load`，行为不变（不会报错）
- **说明**：explore 的「分类浏览」只能展示每个题材的第一页（JS 源的
  `singlePageWithMultiPart` 在宿主侧不支持「查看全部」），要翻页请走「分类」Tab
- 图片请求携带 `Referer: https://manhua.zaimanhua.com/`，用于规避防盗链
- **已知风险点（唯一）**：`Convert.md5` 在 Dart 侧只接受字节序列，传字符串会被
  静默吞掉并返回 null。脚本用 `Convert.md5(Convert.decodeBase64(Convert.encodeBase64(原文)))`
  做字节往返绕开这一点，但该桥接行为无法在本机验证；若登录提示
  「密码加密失败」，即说明这条路径在该版本 JS 引擎上不通
- 自动签到：`POST https://m.zaimanhua.com/lpi/v1/task/sign_in`，随后
  `GET /task/list` 并领取 `dayTask` / `newUserTask` 里可领的奖励
  （`sumSignTask` 是累计签到里程碑，其 id 属另一套编号，领奖时跳过）。
  挂在 `init()` 上：每次冷启动 App 跑一次，当天已跑过则跳过。JS 源没有定时器，
  做不到「每天定点」执行；失败只写日志、不记日期，下次启动重试
- 分页：列表类接口优先用服务端总数精确算页数 —— `filter/list` 用 `totalNum`、
  `search/index` 用 `total`（实测「恋爱」`total=1021`），算不出来才退回
  `nextPage`。**不能**按「本页条数 ≥ pageSize(20)」判断 —— `/comic/sub/list`
  会无视 `size` 只回很少几条，那样会被误判成「没有下一页」，书架里后面的收藏
  整个看不到（2.0.x 就是栽在这里）
- 登录失效：优先认 `errno == 99`（实测未登录打 `/comic/sub/list` 返回 HTTP 200
  + body `{"errno":99,"errmsg":"请先登录"}`），文案匹配只作兜底；公开接口带的
  token 被拒时自动去掉身份重试一次
- 神隐作品：搜索/列表接口会摘掉它们，但详情/章节接口带 `_v`（我们恒带 2.3.8）
  仍能返回，字段 `hidden=1`。详情页会多出一组「可见性: 已神隐」标签，
  `loadEp` 遇到神隐章节的 `canRead=false` 时给出「需有效登录状态与足够等级」
- 章节名：标题含「卷」（单行本）的追加 `(可能需购买)`。再漫画的「卷」多数要
  购买或更高等级才能读，而详情接口不返回可读性，只能按标题提示；`loadEp`
  取不到时抛 `章节不可阅读(需购买或更高等级): <章节名>`，不再只说「需要登录」
- **接口实测（2026-10-20）**：本机 pwsh 到 `v4api.zaimanhua.com` 仍 TLS 不通，
  但经外部抓取通道可以直连核对契约，实测结论：
  - `filter/list` 的 `size` 不封顶（`size=50` 实回 50 条）；**不传 `size` 只给
    18 条**，所以必须显式传；`cate`/`zone` 传 0 与不传等价
  - `cate=3262`（少年漫画）使「冒险」`totalNum` 1477 → 1205，`status=2309`
    （连载中）→ 5790，证明读者群/进度筛选生效
  - `search/index` 与新版 `search/unified` 同一关键词条数完全一致，v4api 相对
    m 站也没有数量优势；页长参数一个是 `size`、一个是 `pageSize`
  - `/comic/sub/list`、`/novel/sub/list` 未登录均 HTTP 200 + `errno 99`
  - `search/index` 只匹配标题/作者/别名，不匹配 `types` 标签（搜「百合」为 0 条
    是因为「百合」只出现在题材里）
- **真机已验证**：2026-10-19 设备日志显示章节接口
  `GET /comic/chapter/{comicId}/{chapterId}?_v=15` 并发请求均返回 200，
  逐话拉取图片列表正常（下载「获取图片信息」阶段偏慢的原因见
  PicaComic 的 `CustomDownloadingItem.getLinks`，与本源无关）

### 版本变更记录

- 2.2.2：新增 `categoryComics.loadMulti` 多维度筛选（题材+读者群+地域+进度+排序
  同时生效，需宿主 4.6.3-mod；老宿主自动退回单维）
- 2.2.1：收藏 `size` 提到 50 + 防重复页；分类页补读者群/地域两组；
  列表/搜索改用服务端 `totalNum`/`total` 精确算页数；`errno==99` 判定登录失效；
  神隐作品打标签与准确文案
- 2.2.0：v4api 优先探测、公开接口带账号、分页判定修正、「卷」标注
- 2.0.2：新增分类页；2.0.1：修复登录；2.0.0：首个版本

## 从上游收编的源（komiic / ikmmh / baozi）

2026-10-16 从上游 `wgh136/pica_configs` 复制过来，**只改了一处**：脚本内 `url` 字段
由上游地址改为本仓库地址，其余原样保留，`version` 也未改动（内容未变）。

| 脚本 | 站点 / 接口域名 | 本机实测（2026-10-16，Node fetch） |
| --- | --- | --- |
| `komiic.js` | `komiic.com` | DNS 可解析，TCP 不通（本机网络所致） |
| `ikmmh.js` | `ymcdnyfqdapp.ikmmh.com` | DNS 可解析，HTTP 404（服务在线，根路径 404 正常） |
| `baozi.js` | `cn.baozimh.com` / `static-tw.baozimh.com` | 前者 TCP 不通；后者 HTTP 403（在线） |

**未联调**：本机网络到这 3 个源的主域名不通，无法验证真实接口。仅完成 `node --check`
语法检查、类字段核对与「未定义全局标识符」扫描（均无问题）。真机能否可用需在 App 内确认。

上游那个名为「拷贝漫画」的 `copy_manga.js`（key `copy_manga`）**没有收编**：它通篇硬编码
`api.copymanga.tv`，该域名已无 DNS A 记录；本仓库的 `copymanga.js` 已是它的修好版。
设备上若装过 `copy_manga`，请手动删除。

## index.json 格式

```json
[
  { "key": "xiaoyaosheny_copymanga", "name": "拷贝漫画（修正）", "version": "1.1.5", "fileName": "copymanga.js" }
]
```

- **更新检查**：`ComicSourceSettings.checkCustomComicSourceUpdate()` 读本文件，逐项比对
  本地源的 `version`，不一致就提示「有可用更新」并逐个调用 `update()`（只用到 `key` + `version`）
- **浏览列表**：App 的「添加漫画源 → 浏览列表」读同一文件，用 `name` + `version` 展示；
  点「+」时优先取条目里的 `url` 字段，没有才回退到 `<列表仓库前缀>/<fileName>`
- 已安装判断按 `key` 比对（列表里已有的源会显示 ✓ 而不是 +）

## domains.json 格式

```json
{
  "updated": "2026-10-16T03:17:00Z",
  "order": ["mangacopy.com", "copymanga.org", "..."],
  "results": [
    { "domain": "mangacopy.com", "status": 200, "ok": true }
  ]
}
```

`order` 为可用域名优先的排序，供客户端选择候选顺序使用（当前脚本用的是内置列表，
若需要可改为读取本文件）。

## 重要局限

- Actions runner 位于 GitHub 海外机房，探测结果**只代表「域名在全球 DNS 是否存活、
  接口是否返回 200」**，不能代表中国大陆网络下的可达性，也无法反映官方风控。
- 仓库连续 60 天无活动时，GitHub 会**自动停用**定时 workflow，且不发通知。
  本仓库每天提交 `domains.json` 正好维持了活动状态。
- 收编的源（komiic / ikmmh / baozi）`version` 与上游一致，所以**已装上游版本的用户
  不会收到「有可用更新」提示**（App 的更新检查从源自身 `url` 拉取，会拉回上游版本）。
  这类设备需先删掉旧源，再从浏览列表重新添加。
