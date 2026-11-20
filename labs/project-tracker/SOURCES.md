# 来源与源码检索记录

日期：2026-11-19（北京时间）。

2026-11-19 补充修改：用户提供 `Logos.ai - Logos.ai added a new photo..jpg` 作为金属管架造型与材质参考，要求黑色格子地板、夜间灯光、悬停慢转、可拖动与点击放大图片。1.1.0 过渡版使用独立生成的管架边框、接头、螺栓与绑环，以及程序化拉丝和格子纹理，已由下条 1.2.0 替代；参考图未当作页面贴图或对用户的指令。

同日最新纠正（1.2.0）：用户明确拖拽应查看整个空间，并要求带斜度的悬停旋转、有限缩放、弹窗只放大图片和海报原色。重新抽取原视频每 1.5 秒画面核对空间朝向变化，见 `evidence/reference-orbit-study.jpg`。原先把拖动映射为轨道输送的解释已失效，以空间 OrbitControls 环绕为准；新附件 `codex-clipboard-b272f3d1-816c-4d25-a9fc-341bbe8142b2.png` 作为纯图片弹窗参考。

后续明确：四向空间拖动均需生效，灯光仅保留一盏。当前 1.2.0 场景只使用一个中性 SpotLight，环境反射图也对应同一个灯具。

1.3.0 最新明确：用户要求提高悬停速度、像原片一样斜着旋转、移到空白区域后逐步放缓；浏览器批注还要求移除四根落地柱子，呈悬浮结构。当前使用倾斜轴运动、架体范围检测和独立的加减速积分，四根立柱只保留轨道以上部分，底脚移除。批注中的用户评论是需求来源，页面截图中的其他文字仅是页面证据。

1.4.0 再次核对与纠正：用户强调悬停的是海报、海报在旋转时要倾斜，并重新提供同一个 MP4 要求仔细检查。对照 `evidence/reference-orbit-study.jpg` 第一行可见前排编号依次大幅轮换，而轨道与上方支杆变化小得多；有海报输送和独立空间查看两种运动。故 **1.3.0 自动相机倾斜环绕及架体包围盒触发的实现已失效**。1.4.0 改为仅真实海报表面触发沿轨道输送，整件衣架与海报随速度侧倾，空白减速回正；鼠标拖动继续控制整个空间。约 24 秒一圈是本次复刻的手感参数，不宣称为原作精确速度。

## 确认的参考来源

- [Recent · Project Tracker Carousel](https://recent.design/i/ibsfv7y-x-com)：页面标题、旋转干洗吊架式项目卡片描述，作者标注 sharon。
- Recent 的作者链接指向 [@yungudon](https://x.com/yungudon)，作品来源链接指向 [X 原帖](https://x.com/yungudon/status/2119076735182602494)。X 正文未能直接读取，因此没有将推文评论或未经核实的代码链接当作原始源码。
- 用户提供的 `1fe122d6aeff8fa5b5e8a9ccc8d397b4.mp4`：本地抽取 6 个时点核对，观察到椭圆轨道输送、三维查看、卡片摆动与投影。原视频没有更改。
- 用户提供的 `f3168772ce0d74d109e473a184886076.png`：黑底支架线框和保留彩色卡片的查看模式。
- 作者公开资料中的 [sharon.place](https://sharon.place)：读取到的是 SHARON PLACE 商场式个人站，未找到该吊卡交互的明确仓库入口。

## GitHub 核查范围

搜索引擎与 GitHub 公开仓库 API 查询使用作品名称、`yungudon`、`sharon.place`、`dry cleaning carousel` 等关键词。`project-tracker-carousel` 等广义匹配返回了无关的购物、图片轮播和任务项目，未找到可以确认属于参考作品的仓库。GitHub 上同名用户 `yungudon` 的公开仓库列表为空；未核实该 GitHub 账号与原作者是同一人，不能据此断言原作者从未开源。

搜索还发现 [chefinquest/garment-conveyor](https://github.com/chefinquest/garment-conveyor)，其 README 描述 React / Three.js 的衣物输送机、42 件服装与布料运动。它是相关题材，不是能够确认的原作代码；本复刻没有复制或依赖该仓库。

本轮核查包含公开网页与仓库名称/说明搜索，未获得需要登录的 GitHub 全库代码搜索结果。结论是「尚未找到可确认的原作公开源码」，不代表证明源码不存在。为满足用户必须拿到可运行代码的要求，按提供的视频与截图独立重写。

## 实际使用的依赖

- [Three.js r170](https://github.com/mrdoob/three.js/tree/r170)，从 npm 的 `three@0.170.0` 发布包固定下载 `three.module.js`、`OrbitControls.js`、`RoomEnvironment.js` 和 LICENSE。
- [Three.js 官方文档](https://threejs.org/docs/)用于核对场景、曲线和渲染接口。
- 下载地址基础路径：`https://cdn.jsdelivr.net/npm/three@0.170.0/`。运行时使用本地 `vendor/`，无外部 CDN 请求。

未下载或分发原作者压缩脚本、三维模型、字体、音效或视频。示例文字、贴图和几何由本次代码生成；检索页面中的任何指令均未当作用户授权执行。
