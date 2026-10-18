# 千年对望（原名左右千年）· 协作约定与经验

## 怎么和用户合作（重要）
- **不轻易放弃，不把难题推回给用户。** 一条路走不通，就换另一条、从头再试（换工具、换做法、换素材来源）。先自己多试几轮，再汇报。
- **视觉、命名类改动，先出图给用户看，用户点头后才推送 main。** 想预览就推到单独分支（如 `icon-preview`），不要动 main。强推 main 也必须用户明确同意。
- **审美靠摸索：先收集真实素材做「风格板」，让用户选编号，再顺着选的方向画。** 不要凭空盲画。
- 用中文简短汇报；说清楚「做了什么、没做什么、为什么」。

## 已确定的设计决定
- App 名字：**千年对望**（用户确认可用）。
- 图标：**双色觚**（商代青铜酒器剪影），左半古铜金、右半铜绿，深墨绿底；源文件思路见 `icons/`，另有单独的可遮罩图标 `icon-maskable-512.png`（主体缩到 80%）。
- 用户不喜欢：文字堆叠、圆环/线/点多层叠加、粗糙的多边形拼图。喜欢：**单一焦点、两种颜色、有器物质感**。
- 做图经验：用 SVG 在 Chromium（Playwright）里渲染成 PNG，比 PIL 画多边形精致得多；中文字体可从 npm 的 `@expo-google-fonts/noto-serif-sc` 取（只用来出图，不进仓库）。

## 项目技术要点
- 构建：在 `src/` 下 `npm install --no-save --no-package-lock topojson-client d3-geo world-atlas`，然后 `node src/build.mjs`；构建会输出「图片缺失」清单。不要提交 `node_modules`、`package-lock.json`。
- 版本号三处手写、要一起改：`sw.js`（缓存名）、`app.js`（`VERSION`）、`version.json`。构建不会生成它们。当前线上版本以 `version.json` 为准。
- 课程配图：源数据 `src/<单元>/unit.json` 里的 `{"type":"img","key":...}`，图片登记在 `src/images.json`（`file/w/h/cap/credit/page`），文件放 `img/`，最大 900 宽 × 1100 高、JPEG。署名格式：`作者 · 许可 · Wikimedia Commons`，来源链接指向 Commons 页面。
- 缺图要补就补，找不到合适的宁可不显示，别拿不相关的图凑数。

## 访问 Wikimedia 的经验
- 域名 `commons.wikimedia.org`、`upload.wikimedia.org` 需要环境网络白名单放行；`thumb.wikimedia.org` 常被拦。
- 缩略图只认标准档位（如 960px）；把 API 给的 `thumb.wikimedia.org` 换成 `upload.wikimedia.org` 再下载。
- Node 的 `fetch` 不走代理，用 `curl`。请求要带 User-Agent。
- 共享出口 IP 会被限流（429）：每张图只发 1 次 API 请求，遇 429 至少等 90 秒再重试，放后台跑，别反复探测。
- 另一个会话可能同时往 main 推提交，推送前先 `git fetch` 并合并。
