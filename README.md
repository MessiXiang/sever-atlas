# 毛机指南 · 小红书精简版

分支：codex/xiaohongshu-lite。基于 5bdd7c8，面向小红书离线 H5 小工具。

## 保留与精简

- 保留离线地图、机场点选、中俄英/转写搜索、机型/航司/日期筛选、航班详情、行程排序与衔接计算。
- 保留 2,169 条航班、366 个航点及 25 家航司；核查快照为 2026-11-05，并非完整航网、实时运行或余票查询。
- 删除“收录与来源”页面、冷门航线独立页面、联系入口、邮箱/微信、赞赏二维码、外部个人主页、购票外链、原始文件下载和 CSV 导出。
- 来源仅保留纯文字名称及核查日期；准入要求、机型不确定性、时区/班期冲突提示继续显示。
- 删除原始资料、抓取结果、重复数据库和维护报告；完整资料仍在 main 和 Git 历史中。
- 保留当前飞行企鹅标识，运行资源随包提供，无远程地图或网络请求。

## GitHub 与 Pages

本分支用于代码保存和小工具打包。**不要将 Pages 发布源切到本分支，不要合入 main 作为网页部署。**
2026-11-05 核验 Pages 配置为 legacy，发布源 main:/。本分支没有 Pages 工作流或部署脚本。

## 缓存与兼容性

优先使用 9.46+ 的 xhs.miniTool Storage API，通过 launchOptions.miniToolEnv.buildVersion 核验版本，支持 Promise 和回调。无法使用时仅保留本次打开期间的行程，界面明确提示。

读失败或格式损坏时不覆盖原缓存；写失败/超时时明确提示。缓存不提供跨设备同步或永久备份。9.49+ 使用 getWindowInfo 避让安全区及原生按钮；其他环境使用容器 CSS 变量与布局回退。

交付 JS 为 ES2017；CSS 使用基础 Grid、margin 间距、物理属性和视口回退。列表分批显示，搜索防抖。

## 构建与验证

使用 Python 3，无需安装 npm 依赖：

    python3 scripts/package.py
    python3 scripts/check.py

白名单运行文件复制到 dist/；产物为 artifacts/maoji-xiaohongshu.zip，index.html 位于 ZIP 根目录。构建会重建 dist/，不会读取或覆盖原有 avia-atlas.zip。

安装开发规范 Skill 后可运行体积审计：

    python3 ~/.codex/skills/minitool-zip-builder/scripts/audit_artifact.py dist
    python3 ~/.codex/skills/minitool-zip-builder/scripts/audit_artifact.py artifacts/maoji-xiaohongshu.zip

补充浏览器回归使用已有 Playwright 和 Chrome，不自动安装依赖：

    PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROME_EXECUTABLE=/absolute/path/to/chrome node scripts/test-browser.cjs

测试读取基准提交 5bdd7c8，使用回环地址及虚拟平台缓存；结果和截图写入已忽略的 artifacts/。不会上传、发布或触发 Pages。

## 发布前验证

规范依据：minitool-zip-builder 1.9.0-beta.20261023.1，以及 2026-11-05 获取的小工具在线文档。

最终 ZIP 仍需在创服平台模拟器、Android 真机、iOS 真机验证；Chrome 61 / Android 8.1 的 CSS 兼容性未实测。静态检查和普通浏览器回归不等同于平台审核通过。详见 VALIDATION.md。

未启用 Worker、OffscreenCanvas、WebAssembly 或游戏引擎，mini_tool.json 中 is_high_consumption_scene 为 false。运行许可证放在 legal-notices.js，完整说明见 LICENSE.md 与 THIRD_PARTY_NOTICES.md。
