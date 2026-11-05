# 小红书分支验证记录

日期：2026-11-05。分支：codex/xiaohongshu-lite，基准：5bdd7c8。

## 已通过

- 运行文件白名单；根入口 index.html；无嵌套目录、重复 ZIP entry、符号链接、源码映射、抓取资料或旧 ZIP。
- 本地资源引用完整；无业务网络请求、外链按钮、内联脚本/事件、module 脚本、下载、联系和收款入口。
- 全部交付 JS 以 Acorn ecmaVersion:2017 解析通过，包括 Leaflet 与静态数据。
- CSS 使用 grid-gap / margin、物理属性与视口回退；安全区遵循容器变量，模糊效果有背景回退及 supports 检测。
- Skill 目录及 ZIP 体积审计均 PASS，0 warning；最终包低于 2 MiB 建议值。
- 2,169 条航班、366 个机场、25 家航司；对照原版核验所有航班的日期展开、四个日期的执行判定、最多三个有效日期的 UTC 时刻及默认筛选结果。
- 离线 CSP 下：搜索/筛选/详情、行程添加/排序/移除/清空/重开、总览分页；无页面异常或站外请求。
- Promise / callback 平台缓存模拟；低版本、缺少 API、读失败、写失败、写超时及损坏数据测试；读取失败不覆盖原缓存。
- 320 / 390 / 600 / 768 / 1440 px 布局；模拟安全区和原生按钮；移除 flatMap、fromEntries、replaceAll、MediaQueryList.addEventListener 后仍正常运行。
- 人工检查手机地图、手机详情及桌面地图截图。
- Pages 发布源核验为 main:/，本分支无部署工作流。

## 范围与待验证项

浏览器测试使用普通 Chrome 和模拟平台接口，仅为补充回归。创服平台模拟器、Android / iOS 真机及 Chrome 61 / Android 8.1 CSS 表现仍未实测。未上传、预览、送审或部署；本记录不代表平台内容审核通过。

产物：artifacts/maoji-xiaohongshu.zip。每次构建的大小和 SHA-256 由 scripts/package.py 输出；完整补充回归结果位于 artifacts/browser-tests.json。
