# 第三方组件与素材

| 组件 | 版本 | 用途 | 许可证 | 来源与校验 |
|---|---|---|---|---|
| Apache ECharts | 5.6.0 | 数据大屏的柱状图、仪表、折线、雷达、环形图 | Apache License 2.0 | npm 官方 tarball `https://registry.npmjs.org/echarts/-/echarts-5.6.0.tgz`，sha512 与 npm 登记的 integrity 一致；只取出 `dist/echarts.min.js`（sha256 `bf4a223524e40b77c304bec67e1222cf551f14880cf42c69dc046558e11c07b1`）、`LICENSE`、`NOTICE` |

- 文件位置：`web/vendor/echarts/`（源）→ `app/vendor/echarts/`（构建时原样复制）。许可证全文 `LICENSE.txt`，声明 `NOTICE.txt` 与库文件放在一起。
- 页面不访问任何 CDN，`file://` 和 GitHub Pages 下都可用。
- 其余图表（`web/charts.js`）、知识图谱与粒子背景（canvas）都是本项目自己写的，没有使用其他第三方代码。
- 字体只用访问者电脑上的系统字体（微软雅黑、Consolas 等），仓库里没有字体文件。

## 来自作者其他课程项目的素材（页面上标为 p3、p4）

| 素材 | 说明 |
|---|---|
| 作业评阅截图与流程动图（`app/assets/p4/`） | 作者本人的“作业智评”演示系统截图。作业图片是程序用电脑字体渲染的仿手写合成图，学生姓名、成绩都是演示数据；不含任何真实学生作业或人脸 |
| 量规、演示班结果（`data/sources/p4_export.json`） | 演示数据（mock 评分 + 模拟教师复核）。其中 CFMS-34 规则基线只保留了汇总的一致性指标（QWK、相关），不含该数据集的任何原文或逐条记录 |
| 群体风险数字、风险计算器抽样（`data/sources/p3_export.json`） | 文献汇总、仿真与开放数据检验的**汇总数字**，不含任何个体记录 |

## 引用的文本

- 法规条款（`p9/legal.py`、`data/legal_verified.json`）：欧盟法规与中国法律法规的简短逐字摘录，附官方链接，仅供参考，不适用本仓库的许可证。
- 论文出处（`p9/refs.py`、`data/refs_verified.json`）：只有题名、作者、年份、DOI/链接等书目信息。
