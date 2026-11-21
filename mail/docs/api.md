# Akaros Mail API

Base URL：`https://api.mail.akaros.si`

## 认证与权限

除 `GET /api/health` 外，所有 REST API 和 MCP 请求均使用：

```http
Authorization: Bearer <API_KEY>
```

- 管理员密钥：访问全部邮件、地址、转发规则和 catch-all。
- 子账户密钥：仅访问 `mailbox` 等于自身地址的邮件及附件，仅以自身地址发件，仅管理自身转发规则；不能管理 catch-all 或其他地址。
- 子账户的 `destinations` 响应为空，不能读取全局目标地址清单。
- 子账户密钥在 D1 中仅保存 SHA-256 哈希。

`GET /api/me` 返回当前密钥信息：

```json
{
  "role": "account",
  "account": "shirobana@akaros.si",
  "manage_all_accounts": false,
  "manage_catch_all": false
}
```

管理员的 `role` 为 `admin`，`account` 为 `null`，两个管理权限均为 `true`。

## 通用响应与错误

成功响应为 JSON；附件下载返回二进制。错误格式：

```json
{
  "error": "错误说明",
  "details": {}
}
```

常见状态码：`400` 参数错误、`401` 密钥无效、`403` 权限不足、`404` 对象不存在或不属于当前账户、`409` 操作冲突、`502` SMTP/上游错误、`503` 服务未配置。

## REST API

### 健康检查

`GET /api/health`，无需认证。

### 发件

`POST /api/send`，`Content-Type: application/json`。

```json
{
  "from": "no-reply@akaros.si",
  "from_name": "Akaros Mail",
  "to": ["recipient@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "测试",
  "text": "纯文本正文",
  "html": "<p>可选 HTML 正文</p>",
  "in_reply_to": "<optional-message-id@example.com>",
  "references": "<optional-message-id@example.com>",
  "attachments": [
    {"name": "hello.txt", "type": "text/plain", "data": "aGVsbG8="}
  ]
}
```

字段：

- `from`：可选。管理员默认 `no-reply@akaros.si`；子账户始终只能使用自身地址。
- `to`、`cc`、`bcc`：邮件地址数组，至少一个收件人，总计最多 50 个。
- `subject`：最长 200 字符。
- `text`、`html`：正文，单种正文最大 2 MB。
- `attachments`：最多 10 个，`data` 为不带 data URL 前缀的 base64，总大小不超过 10 MiB。
- `in_reply_to`、`references`：回复邮件时可选的 RFC 5322 邮件头。

成功返回 `201`：

```json
{
  "message": {"id": "uuid", "folder": "sent", "status": "sent"},
  "smtp_response": "250 2.0.0 OK: queued"
}
```

SMTP 失败时返回 `502`，D1 中保留 `failed` 记录。

### 邮件列表

`GET /api/messages?folder=inbox&limit=50`

查询参数：

- `folder`：`inbox`（默认）、`sent`、`failed`、`outbox`、`trash`、`all`。
- `direction`：可选，`in` 或 `out`。
- `q`：可选，按主题、发件人或摘要搜索。
- `limit`：1–100，默认 50。

子账户只能得到自身地址的记录。响应：

```json
{"messages": [{"id": "uuid", "subject": "主题", "snippet": "摘要", "mailbox": "user@akaros.si"}]}
```

### 邮件详情

`GET /api/messages/:id`

返回完整 `text`、`html`、地址、状态、Message-ID 和附件元数据。子账户访问其他邮件返回 `404`。

### 已读与文件夹

`PATCH /api/messages/:id`

```json
{"is_read": true}
```

或：

```json
{"folder": "trash"}
```

`folder` 支持 `inbox`、`trash`。发件记录从垃圾箱恢复时自动回到其发件文件夹。

### 删除邮件

- `DELETE /api/messages/:id`：移入垃圾箱。
- `DELETE /api/messages/:id?permanent=1`：永久删除邮件、正文及附件对象。

### 下载附件

`GET /api/attachments/:id`，使用 Bearer 认证，返回原始二进制和 `Content-Disposition`。子账户访问其他账户附件返回 `404`。

## Email Routing API

所有转发规则均支持双份留存：底层规则指向 `akaros-mail-api` Worker，邮件先保存到 D1，再通过 `message.forward()` 转发。Cloudflare 控制台显示 Worker 是预期行为。转发失败不会删除已保存的 Webmail 副本。

### 路由状态

`GET /api/routing`

返回 `settings`、`rules`、`catch_all`、`destinations` 和 `access`。子账户只返回自身规则，`catch_all` 为 `null`，`destinations` 为 `[]`。

### 新增转发规则

`POST /api/routing/rules`

```json
{
  "address": "user@akaros.si",
  "destination": "verified@example.com",
  "name": "可选名称",
  "enabled": true
}
```

目标地址必须已通过 Cloudflare 验证，不能与收件地址相同。子账户只能使用自身地址作为 `address`。

### 修改转发规则

`PUT /api/routing/rules/:id`

可提交部分字段：

```json
{"destination": "verified@example.com", "name": "名称", "enabled": false}
```

只能修改当前账户有权管理的规则。

### 删除转发规则

`DELETE /api/routing/rules/:id`

同时删除对应的 D1 转发映射。catch-all 不使用此接口。

### 配置 catch-all（仅管理员）

`PUT /api/routing/catch-all`

```json
{"enabled": true, "action": "worker"}
```

- `action`：`worker`、`drop` 或 `forward`。
- `forward` 需要额外的 `destination`，且同样先存 D1 再转发。
- 子账户调用返回 `403`。

### 添加目标地址

`POST /api/routing/destinations`

```json
{"email": "destination@example.com"}
```

Cloudflare 会向目标邮箱发送验证邮件。Webmail 不展示已有验证地址或自动补全，目标地址需手动输入。

## MCP

端点：`POST https://api.mail.akaros.si/mcp`

使用同一个 Bearer API Key，采用无状态 Streamable HTTP，支持 `initialize`、版本协商、`ping`、`tools/list`、`tools/call` 和通知。支持协议版本：2024-11-05、2025-03-26、2025-06-18、2025-11-25、2026-07-28。

客户端配置示例：

```json
{
  "mcpServers": {
    "akaros-mail": {
      "type": "http",
      "url": "https://api.mail.akaros.si/mcp",
      "headers": {"Authorization": "Bearer <API_KEY>"}
    }
  }
}
```

工具：

- `send_email`：参数与 `POST /api/send` 相同。
- `list_emails`：`folder`、`direction`、`q`、`limit`。
- `get_email`：`id`。
- `get_attachment`：`id`，返回附件元数据和 `data_base64`。

MCP 与 REST 使用完全相同的账户权限。子账户工具调用不会读取或修改其他账户的数据。

## 收件限制

单封接收邮件默认最大 20 MiB，最多 15 个附件。正文与附件在 D1 中分块存储。API 不会返回 Brevo、Cloudflare 或其他账户密钥。
