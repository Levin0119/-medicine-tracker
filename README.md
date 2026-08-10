# 医药箱药品保质期管理系统

一个**零后端、零数据库、零付费**的家庭医药箱管理工具。包含药品和常用器材的保质期跟踪、二维码贴纸分享、扫码只读查看、移动端友好。

![demo](https://img.shields.io/badge/部署-GitHub_Pages-brightgreen) ![demo](https://img.shields.io/badge/license-MIT-blue) ![demo](https://img.shields.io/badge/dependencies-0-orange)

## ✨ 功能

### 药品 / 器材管理
- 录入 / 编辑 / 删除，分类管理（口服 / 外用 / 急救 / 中成药 / 保健品 / 其他）
- 器材独立分类（体温计 / 血压计 / 血糖仪 / 听诊器 / 剪刀镊子 / 纱布绷带 / 消毒用品 / 其他）
- 智能状态判定：已过期 / 即将过期（≤30 天）/ 正常
- 搜索 + 分类筛选 + 状态筛选 + 多维度排序
- 快速设置到期日期（1 年后 / 2 年后 / 3 年后 等快捷按钮）

### 仪表盘
- 5 个统计卡片：药品 / 器材 / 即将过期 / 已过期 / 本月需关注
- 分类分布饼图（纯 SVG，无外部库）
- 优先关注列表：临期 / 过期药品前 6 条

### 二维码贴纸（核心功能）
- 一键生成当前所有数据的二维码
- LZString 压缩：单张码可塞 **100+ 条记录**
- 自动多张拆分：超出容量自动拆成多张码
- 可下载 PNG 或打印为贴纸（A4 排版自动适配）
- 扫码后**纯前端**解压渲染，不上传任何数据

### 扫码只读查看（view.html）
- 顶部红 / 橙横幅：列出过期 / 30 天内过期药品
- Tab 切换：待关注 / 全部药品 / 器材 / 完整列表
- 多张码乱序扫描自动拼装
- 完全只读，不写回任何数据

## 🚀 快速开始

### 方式 A：直接双击打开
下载整个项目，双击 `index.html` 即可（推荐 Chrome / Edge）。

### 方式 B：部署到 GitHub Pages（永久链接）
详见 [DEPLOY.md](./DEPLOY.md)，3 步搞定：
1. 在 GitHub 创建空仓库
2. 把这个目录 push 上去
3. Settings → Pages → 选 `main` 分支 → 保存

5 分钟后你会得到 `https://<用户名>.github.io/medicine-tracker/`，永久可用。

### 方式 C：拖到 Netlify（最快）
打开 https://app.netlify.com/drop → 把项目文件夹**拖进去** → 立刻拿到链接。

## 📁 文件结构

```
medicine-tracker/
├── index.html        # 主入口（管理端）
├── view.html         # 扫码只读查看端
├── view.js           # 扫码端逻辑
├── view.css          # 扫码端样式
├── app.js            # 主逻辑（CRUD / 状态 / QR / 导出）
├── styles.css        # 主样式
├── qrcode.min.js     # 二维码生成（qrcode-generator@1.4.4）
├── lz-string.min.js  # 字符串压缩（lz-string@1.5.0）
├── README.md         # 本文件
├── DEPLOY.md         # GitHub Pages 部署教程
├── LICENSE           # MIT 许可证
└── deliverable.md    # 实现细节 & 验收清单
```

## 🔒 隐私

- **零后端** — 没有服务器、没有 API、没有数据库
- **零追踪** — 没有 analytics、没有 cookie、没有 fingerprint
- **零依赖外网** — qrcode 和 lz-string 都本地化，断网可用
- **数据只存你的浏览器** — 清缓存 = 丢数据（请定期 JSON 备份）

## 🛠 技术栈

- 原生 HTML / CSS / JavaScript（ES2017+）
- 无任何 npm / 构建工具
- 仅 2 个本地化的第三方库（已附 LICENSE）
- localStorage 持久化
- SVG 自绘图表

## 🌐 浏览器兼容

- Chrome 90+ / Edge 90+ / Safari 14+ / Firefox 88+
- 移动端：iOS Safari 14+ / Android Chrome 90+

## 📝 License

MIT — 随便用、随便改、随便转。