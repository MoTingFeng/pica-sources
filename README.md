# pica-sources

PicaComic 的自维护漫画源仓库。主要解决两件事：

1. **拷贝漫画源可自更新**：脚本里 `url` 指向本仓库，App 内点「更新」即可拉到最新版，不必重新发版 App。
2. **域名存活性监测**：GitHub Actions 每天探测各 API 域名，把结果写进 `domains.json`。

## 文件

| 文件 | 作用 |
| --- | --- |
| `copymanga.js` | 拷贝漫画源脚本（PicaComic JS 源） |
| `zaimanhua.js` | 再漫画源脚本（PicaComic JS 源） |
| `index.json` | 源清单，App 用它比对版本、发现更新 |
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

## index.json 格式

```json
[
  { "key": "xiaoyaosheny_copymanga", "version": "1.1.5" },
  { "key": "zaimanhua", "version": "2.0.0" }
]
```

PicaComic 侧由 `ComicSourceSettings.checkCustomComicSourceUpdate()` 读取，
逐项比对本地源的 `version`，不一致就提示「有可用更新」并逐个调用 `update()`。

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
