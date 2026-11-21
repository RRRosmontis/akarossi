# akaros.si

akaros.si 前端源码仓库。

## 发布链路

```
访客 → akaros.si（EdgeOne 项目 akaros)
         ↓ 回源
   Cloudflare Pages 项目 akarosi-si-web（从本仓库 main 分支自动构建）
```

- 本仓库 `main` 分支推送后，Cloudflare Pages 项目 `akaros-si-web` 自动构建，构建命令为空、输出目录为仓库根目录。
- EdgeOne 项目通过 `functions/[[path]].js` 把请求反向代理到 `akaros-si-web.pages.dev`，浏览器访问的域名和 Cloudflare DNS 记录保持不变。

## 目录

| 路径 | 说明 |
|---|---|
| `index.html` | 首页 |
| `css/` `js/` | 样式与脚本 |
| `articles/` `programs/` `notes/` `mail/` `t/` | 各栏目页面 |
| `error.html` `robots.txt` `sitemap.xml` `BingSiteAuth.xml` | 站点级文件 |

## 更新方式

直接修改并推送到 `main`，Pages 会自动发布：

```bash
git add -A
git commit -m "更新说明"
git push origin main
```

发布后可在 Cloudflare Pages 的 `akaros-si-web` 项目查看构建记录。

## 注意

- EdgeOne 的回源代理函数不在本仓库，避免 Cloudflare Pages 把同名目录当作 Pages Functions 执行导致回源环路。
- 不要提交 `.edgeone/`、`.env`、`.dev.vars`。
