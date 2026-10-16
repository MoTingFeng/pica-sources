# pica-sources

PicaComic 的自维护漫画源仓库。主要解决两件事：

1. **拷贝漫画源可自更新**：脚本里 `url` 指向本仓库，App 内点「更新」即可拉到最新版，不必重新发版 App。
2. **域名存活性监测**：GitHub Actions 每天探测各 API 域名，把结果写进 `domains.json`。

## 文件

| 文件 | 作用 |
| --- | --- |
| `copymanga.js` | 拷贝漫画源脚本（PicaComic JS 源） |
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

## index.json 格式

```json
[
  { "key": "xiaoyaosheny_copymanga", "version": "1.1.5" }
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
