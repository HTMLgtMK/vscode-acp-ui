# ACP UI

## 这个 fork 现在装的是什么（分支 `001-workbench-ui-redesign`）

下面这节只讲**我们这份**；`---` 之后是上游 README 的其余部分，只改了已经不成立的段落。

这份 fork 是宿主扩展（`goworker-vscode-extension`，`package.json` 里叫 `vscode-goworker`）的
**UI 工程**：侧栏控制面板、Agent Chat、trace 流三块界面全部自绘在这里，扩展宿主那一侧只吃
`npm run build:sdk` 产出的 `dist-sdk/`（`package.json` 里以 `@htmlgtmk/acp-ui` 的名字被引用）。
走这条路的原因（皮肤 token 盖不到别人 bundle 里的组件、要等对方排期）写在扩展仓
`specs/001-workbench-ui-redesign/research.md` R1。

交付物就三样，别的都不算：

- `dist-sdk/` —— 一份 SDK：ACP 客户端本体、宿主↔webview 契约、webview HTML 装配。入口
  [src/sdk/index.ts](src/sdk/index.ts)。
- `media/acp-ui/` 与 `media/control-panel/` —— 两份自绘 webview 产物（`npm run build:webview`），
  跟着 SDK 一起装进 `dist-sdk/webview/` 和 `dist-sdk/webview-control-panel/`。
- `standalone/` —— 浏览器调试壳（Vite + WS 桥），只在本地跑，不进任何产物。

扩展那一侧是空的：[src/extension.ts](src/extension.ts) 的 `activate()` 没有实现，`package.json` 的
`activationEvents` 是 `[]`、`contributes` 是 `{}` —— **装上这个 vsix 看不到任何视图、命令、设置项**。
命令、视图容器、快捷键、设置项这些产品面全在宿主仓那侧。界面也不碰 VS Code 原生控件：树、面板、
下拉、审批卡都是这里的 React 组件，皮肤靠自己的语义 token 层画。

分支基线是上游 `9320873`。相对基线现在差 113 个跟踪文件 / `+6564 −6189`（含未提交的工作区），
另有 35 个还没 `git add` 的新文件 5236 行。删掉的那 6189 行大头不是改写，而是撤掉了这份 fork 自己那个
通用扩展的产品面（`src/extension/**`、`src/acp/config/**`、Activity Bar 容器、`*.acp` customEditor、
`ib-acp-ui.*` 命令与设置项、Cursor 那两个弹窗）连同描述它们的四份文档 —— 撤了什么、为什么，记在
[changelog.md](changelog.md)。

| 新增的东西 | 在哪 | 现在多大 |
|---|---|---|
| 侧栏控制面板（React 组件，浏览器与 webview 同一份） | `webview/control-panel/src/` | 源码 11 个文件 2352 行（含 `control-panel.css`）；测试 4 个文件 1441 行 / 94 条 |
| 语义 token 层 `--gw-*` + 三套皮肤（`terminal` / `vscode` / `light-paper`） | `webview/acp-ui/src/tokens.css` | 199 行，`acp-ui/src/main.ts` 里加一行 import 就生效 |
| 宿主 ↔ 界面的快照与上行契约 | `src/protocol/controlPanelMessages.ts` | 303 行 + 232 行用例 |
| trace 第 6 类条目：未知 `session/update` 的折叠原文 | `webview/acp-ui/src/components/UnknownUpdateBlock.tsx` | 45 行 + 55 行 CSS + 114 行用例 |
| 只读 composer（任务详情那块面板）：`init.composerReadOnly` + 三道门禁 | `webview/acp-ui/src/components/ChatComposer.tsx`、`chatReducer.ts`、`AcpUiApp.tsx` | 用例 3 条 / 110 行（`ChatComposer.readonly.test.tsx`）；浏览器侧 `ACP_UI_COMPOSER_READONLY=1 npm run dev:standalone` 演 |
| 浏览器端那块侧栏（不连 VS Code、不连 daemon 就能看界面） | `standalone/src/control-panel.ts`，`npm run dev:standalone` 打开后在页面左栏 `#gw-side-panel`，可用 `?skin=…&state=…` 切 | 279 行 |
| SDK 产物打包（多出一份 `webview-control-panel/`） | `scripts/emit-sdk-package.mjs` | 60 行 |

全仓 `npm run verify`（build + check + test + lint）当前 38 个测试文件 / 393 条用例全绿。

**皮肤还管不到的地方**：界面里真正用 `var(--vscode-*)` 取值的只剩两处 —— `tokens.css`（宿主变量进
`--gw-*` 的唯一入口，71 处，都带缺省值）与 `agentMarkdownTheme.ts`（行内代码那一格读 `--vscode-textPreformat-*`，
跟宿主不跟皮肤）。宿主变量在全仓还剩 11 个文件 / 255 处（不含本 README），除上面两处外都在宿主侧：
缺省色表、standalone 主题解析和它们的测试，那是往页面里**注入** `--vscode-*` 而不是取用；`skins/vscode.css`
一档零自有取值，注释写明刻意继承 `:root` 的解析结果。侧栏、trace、composer 三块都走
`--gw-*` 了：composer 那一格（`.composer-frame` 的底色 × 只读标记的字）实测对比度 `vscode` 10.55:1（浅色宿主）
/ 6.87:1（深色缺省）、`terminal` 4.94:1、`light-paper` 5.38:1，三级文本那条 4.5:1 全过
（`node tmp/t-composer-contrast.mjs [--offline-theme]`，2026-09-25 量）。

---

An **ACP UI** chat surface for the [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol):
a session bridge plus a self-drawn React panel that another extension embeds, instead of a
standalone extension you install on its own.

The panel shows the running conversation — streaming markdown, tool calls, thoughts, plans — and a
sidebar control panel drawn from a host-pushed snapshot tree.
Nothing here registers a view container, a command, or a setting: the embedding extension owns the
entry points, and every control in these bundles is drawn in the webview rather than with VS Code
widgets.

![ACP UI workbench: sidebar control panel and chat trace](docs/Fullscreen.png)

*The sidebar control panel drawn from a host-pushed snapshot, and the trace with streaming markdown,
tool calls, and plans.*

## Features

- **ACP UI** chat bundle: ACP-backed transcript and composer, built to `media/acp-ui/`.
  Theme-aware markdown with colored headings and syntax-highlighted fenced code:

  ![ACP UI markdown rendering](docs/Markdown.png)

- **Tool calls** inline in the trace: read output, terminal runs, and file diffs:

  ![ACP UI tool call with diff](docs/Tool-call.png)

- **Agent plans** rendered as structured plan blocks:

  ![ACP UI plan block](docs/Plan.png)

- **Unrecognized `session/update` types** collapsed into a raw row instead of vanishing.
- **Session config** in the composer when the agent advertises model and tuning options.
  Cursor-style bracketed models expand into a model row plus derived params (for example **Fast**):

  ![Cursor-style model picker](docs/Model-picker-cursor.png)

  Agents that advertise explicit `model_config` options use a Zed-style toolbar (model, thinking, context, effort, and more):

  ![Agent-ordered model picker](docs/Model-picker-opus.png)

- **Sidebar control panel** as a second bundle: a tree drawn from a host-pushed snapshot
  ([src/protocol/controlPanelMessages.ts](src/protocol/controlPanelMessages.ts)), with its own skins.
- **Embeddable SDK**: session bridge, agent transports, host↔webview message contract, and webview
  HTML assembly exported from [src/sdk/index.ts](src/sdk/index.ts).

## Requirements

- VS Code `1.125.0` or newer on the embedding side (`engines.vscode` here).
- At least one ACP-capable agent CLI available on your `PATH` (for example `agent`, `gemini`, or another ACP-compatible command).
- Any auth/environment variables required by your chosen agent.

## Quick Start

1. `npm ci`.
2. `npm run build:sdk` — webview bundles plus `dist-sdk/`.
3. Reference the built package from the embedding extension, e.g.
   `"@htmlgtmk/acp-ui": "file:../vscode-acp-ui/dist-sdk"`, and mount the bundles with
   `buildAcpUiWebviewHtml` / `resolveAcpUiWebviewAssets`.
4. No VS Code round-trip needed for UI work: `npm run dev:standalone` serves both panels in a
   browser.

## Usage

### Agent configuration

There is no `ib-acp-ui.*` setting in this repo. A host builds one spawn config per agent — the same
shape the dev shell reads from a JSON file — and hands it to the session bridge:

```json
[
  {
    "name": "Cursor",
    "command": "agent",
    "args": ["acp"]
  },
  {
    "name": "Gemini",
    "command": "gemini",
    "args": ["--acp"],
    "env": {
      "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
    }
  }
]
```

Fields, from [AcpAgentSpawnConfig](src/acp/domain/agentSpawnConfig.ts#L5-L17):
- `name`: label shown in ACP UI.
- `command`: executable to spawn.
- `args`: optional argument list.
- `env`: optional per-agent environment variables.
- `authMethodId`: optional, when the agent advertises several auth methods.
- `socketPath`: optional, talk to a running daemon on a unix socket instead of spawning.

The dev shell reads exactly this list from [standalone/acp-agent.json](standalone/acp-agent.json)
through [loadAgentConfigs](standalone/server.ts#L287-L321); it exits with an error when the file is
missing or will not parse.

### Panel actions

Composer slash commands, `@` mentions, prompt recall, and the keyboard map live in the webview:
see [composer](docs/features/ui/composer.md).
Session resume and the list/delete primitives are in [sessions](docs/features/acp/sessions.md).

## Development

```bash
npm ci
npm run build:sdk    # the deliverable: dist-sdk/ = SDK + webview/ + webview-control-panel/
npm run pack:sdk     # same build, then one versioned tarball in dist-tgz/ (snapshot tier: stamped version + gitHead)
npm run build:webview  # media/acp-ui + media/control-panel only
npm run build        # dist/extension.js — the empty activation shell, not the SDK
npm run watch        # same, esbuild watch mode
npm run check        # TypeScript: src + both webviews + standalone
npm run test         # vitest
npm run lint         # biome check .
npm run verify       # build + check + test + lint
```

`build:sdk` runs `build:webview` first, so the two bundles land inside `dist-sdk/` too. That
directory is what the host consumes — `"@htmlgtmk/acp-ui": "file:../vscode-acp-ui/dist-sdk"` in
`vscode-goworker`, so the UI loop is `build:sdk` there plus a window reload, and `npm run
install:local` (vsix + `code --install-extension`) is of no use for it: the packaged shell has no
view or command to look at.

For a browser-only UI loop without VS Code, use `npm run dev:standalone` (see `standalone/`).
Preview mock chats without a live agent:

```bash
npm run dev:standalone:demo
```

Then open http://localhost:5173.
Browse mock chats and model-picker seeds from http://localhost:5173/fixtures.
控制面板（左侧那块）也走这条回路：`http://localhost:5173/?panel=ws` 让它改连 WebSocket 桥、快照由服务端推，
而不是吃页内的本地夹具。`&panelFixture=<名>` 选哪一份（缺省 `progressive`，内置另有 `ready` / `stale` / `empty`，
其余名字去 `standalone/fixtures/panels/<名>.ndjson` 找，一行一帧）；`&panelReplay=1` 逐帧推，不带就只给最后一帧。
页面上这三颗都带 `panel` 前缀 —— 裸 `?fixture=` / `?replay=` 归右侧那块 chat，同一页两块面板各配各的
（WS 请求行里仍是短名）。浏览器里没有 daemon 套接字可显示，所以 connection 那几行的 unix 路径会换成
页面真正连上的那个桥地址。
端口用 `ACP_UI_VITE_PORT` / `ACP_WS_PORT` 换；同一对端口上只留一对 dev server，抢输的那个进程直接没了。
The standalone shell loads workbench colors and markdown syntax from your VS Code user settings（按平台找：macOS 是 `~/Library/Application Support/Code/User/settings.json`，Windows 是 `%APPDATA%\Code\User\settings.json`，Linux 是 `~/.config/Code/User/settings.json`）。
Override with `ACP_UI_VSCODE_SETTINGS=/path/to/settings.json` if needed.
切明暗：`ACP_UI_THEME=light npm run dev:standalone`（或 `dark`）—— 接口会按那一侧的宿主缺省值出一整套 `--vscode-*` 与算好的 `--gw-*`；接口没起来时浏览器端用 `?theme=light|dark` 退回仓内对应那份主题。
In demo mode, send `fixture-markdown`, `fixture-tools`, or `fixture-plan` in the composer to replay other samples.
Set `ACP_UI_DEMO_SEED=opus-model` to preview the agent-ordered model toolbar.

Regenerate fixtures and README screenshots:

```bash
npm run screenshots
```

Publishing is automated when `package.json` **version** changes on `main` (see `.github/workflows/publish.yml`).

## Troubleshooting

- No responses in chat: verify the agent `command` in the spawn config runs in a shell and supports ACP mode.
- The dev shell exits before serving anything: a missing or unparsable
  [standalone/acp-agent.json](standalone/acp-agent.json) stops
  [loadAgentConfigs](standalone/server.ts#L287-L321) with the parse error on stderr.
- Need diagnostics: the dev shell appends one NDJSON line per JSON-RPC message to
  `standalone/acp-rpc.ndjson` on every run; `ACP_RPC_LOG=/path/to/file.ndjson` redirects it and
  `ACP_RPC_LOG=0` turns it off. There is no output channel and no command to open one — a VS Code
  host decides whether to record at all: [RPC logging](docs/features/maintainer/rpc-logging.md).

## Explore

| Area | Role |
| --- | --- |
| [`src/extension.ts`](src/extension.ts) | Extension entry: an empty `activate()`, kept only so the vsix still packages. |
| [`src/sdk/`](src/sdk/) | The `vscode`-free barrel the host imports, plus the webview HTML/asset helpers. |
| [`src/acp/`](src/acp/) | ACP session bridge, spawn config, agent transports, `session/update` mapping, host ports. |
| [`src/protocol/`](src/protocol/) | Messages between host and webview, and the parser that gates untrusted input. |
| [`src/platform/`](src/platform/) | Node and VS Code adapters for the host ports, and the theme-color resolvers. |
| [`webview/acp-ui/`](webview/acp-ui/) | React + Vite chat and trace bundle (markdown, state, skins). |
| [`webview/control-panel/`](webview/control-panel/) | React + Vite sidebar bundle for the host snapshot tree. |
| [`standalone/`](standalone/) | Local dev server and mocks for both bundles without the extension host. |
| [`standalone/fixtures/chats/`](standalone/fixtures/chats/) | Committed mock chat replays for demo and screenshots. |
| [`media/`](media/) | Gitignored build output of the two bundles (`acp-ui/`, `control-panel/`); no icons. |

Mock chat fixtures are built by `scripts/build-showcase-fixtures.ts` and replayed through the standalone WebSocket bridge.

## License

MIT — see [`package.json`](package.json) `license` field.
