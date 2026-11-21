# akaros.si

akaros.si 前端源码。Cloudflare Pages 项目 `akaros-si-web` 从本仓库构建并发布，EdgeOne 项目 `akarossi` 作为 CDN 回源到该 Pages 项目。

## 部署

推送到 `main` 分支后 Cloudflare Pages 自动构建（无构建命令，仓库根目录即静态资源目录）。

## 注意

- EdgeOne 的 `functions/` 回源代理不在此仓库内，避免 Cloudflare Pages 误启用同名 Pages Function。
- 不要提交 `.edgeone/`、`.env`、`.dev.vars`。
