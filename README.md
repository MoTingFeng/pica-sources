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

- `key = "zaimanhua"`，`version = "2.0.0"`，导入方式与拷贝漫画源相同
- 接口前缀候选（启动时依次探测，首个返回 200 的被采用）：
  `https://m.zaimanhua.com/api/app/v1` → `https://v4api.zaimanhua.com/app/v1`
- `_v` 版本参数默认 `15`（社区客户端实测值）。官方 App 当前为 `2.3.8`；
  详情与章节请求不带该参数时，「神隐」作品会返回「漫画不存在」
- 已实现：登录、收藏（订阅）、人气榜 / 最近更新 / 分类浏览（explore）、搜索、
  详情、章节图片、下载（下载与内置源共用同一链路，只要 `loadInfo` 非空即可）
- 登录：`POST https://account-api.zaimanhua.com/v1/login/passwd`，表单
  `username` + `passwd=md5(密码)` 小写十六进制。成功后 token 写入源数据
  （`saveData`），重开 App 自动恢复，后续请求带 `Authorization: Bearer <token>`
- 收藏：再漫画是单书架，故 `multiFolder = false`。`/comic/sub/list` 读书架、
  `/comic/sub/add` 与 `/comic/sub/del` 增删；详情页收藏状态取自
  `/comic/sub/checkIsSub`
- 未实现：「分类」Tab。JS 源的 `category` 是解析期静态字段，而分类 tagId
  只能运行时从 `filter/classify` 取得，因此分类入口放在 explore 的「分类浏览」里
- 图片请求携带 `Referer: https://manhua.zaimanhua.com/`，用于规避防盗链
- **已知风险点（唯一）**：`Convert.md5` 在 Dart 侧只接受字节序列，传字符串会被
  静默吞掉并返回 null。脚本用 `Convert.md5(Convert.decodeBase64(Convert.encodeBase64(原文)))`
  做字节往返绕开这一点，但该桥接行为无法在本机验证；若登录提示
  「密码加密失败」，即说明这条路径在该版本 JS 引擎上不通
- **未联调**：2026-10-16 实测本机到 `m.zaimanhua.com` / `manhua.zaimanhua.com`
  DNS 可解析但 TCP 不通（curl IPv4/IPv6 均 `http=000`）。已完成 `node --check`
  语法检查与 30 项离线契约断言（含 md5、登录表单、token 持久化与恢复、
  收藏增删、书架解析），真实接口可用性仍需在真机 App 内确认

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
