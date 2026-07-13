# 部署到 GitHub Pages（5 分钟）

> **零后端、零数据库、零付费**。整个项目就是几个静态文件，GitHub Pages 免费托管。

## 第一步：创建 GitHub 仓库

1. 注册 / 登录 [GitHub](https://github.com)
2. 右上角 `+` → **New repository**
3. 填仓库名：`medicine-tracker`（随便起）
4. 选 **Public**（公开仓库才能免费用 Pages）
5. **不要**勾选 "Add a README file"（我们已有）
6. 点 **Create repository**

## 第二步：推送代码到 GitHub

复制你创建仓库后页面上的命令（长这样）：

```bash
git remote add origin https://github.com/<你的用户名>/medicine-tracker.git
git branch -M main
git push -u origin main
```

把 `<你的用户名>` 替换成你的 GitHub 用户名。

## 第三步：开启 GitHub Pages

1. 仓库页 → **Settings** → 左侧 **Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main` + `/ (root)` → 保存
4. 等 1-2 分钟，刷新页面，会出现一行：

   > Your site is live at `https://<你的用户名>.github.io/medicine-tracker/`

这就是你的永久网址！手机扫码用的就是这个 base URL。

## 第四步（可选）：自定义域名

想用自己的域名（比如 `medicine.example.com`）：
1. 在域名服务商（阿里云 / Cloudflare / 腾讯云等）加一条 CNAME 记录指向 `<你的用户名>.github.io`
2. 仓库根目录加一个 `CNAME` 文件，里面写你的域名
3. 在 GitHub Pages 设置里勾 `Enforce HTTPS`

## 验证部署成功

打开 `https://<你的用户名>.github.io/medicine-tracker/`，应该看到：

- ✅ 仪表盘显示「今天是 ____」
- ✅ 点「加载示例数据」→ 仪表盘出现药品统计
- ✅ 点右上角「📱 二维码」→ 弹出二维码弹窗
- ✅ 二维码内容是 `https://<你的用户名>.github.io/medicine-tracker/view.html#d=...`

## 手机扫码

用微信 / 支付宝 / 系统相机扫一下生成的二维码，应该直接打开 view.html 并显示完整药品列表。

## 数据备份

- 数据存在浏览器 localStorage，换电脑/换浏览器会丢
- **强烈建议**每周点一次「⬇️ 导出」→ 下载 JSON 备份
- 备份文件丢了的话，我也没办法（这是纯前端项目的天然限制）

## 其他部署选项

| 平台 | 难度 | 费用 | 备注 |
|---|---|---|---|
| **GitHub Pages** | ⭐ | 免费 | 推荐，已写好教程 |
| Vercel | ⭐ | 免费 | 需绑定 GitHub 账号 |
| Netlify | ⭐⭐ | 免费 | 拖拽 zip 上传也行 |
| Cloudflare Pages | ⭐⭐ | 免费 | 国内访问稍快 |
| 阿里云 OSS / 腾讯云 COS | ⭐⭐⭐ | 几毛/月 | 国内访问最快 |

如果 GitHub 访问慢，**Netlify Drop** 最简单：
1. 打开 https://app.netlify.com/drop
2. 把整个项目文件夹**直接拖进网页**
3. 立刻给你一个 xxx.netlify.app 的链接，永久可用

---

有问题随时找我~