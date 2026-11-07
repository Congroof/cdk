# LTK Manager 运行环境分发

复用现有全局 Kdocs 凭证与目录，不保存 OSS 临时 URL，不经过本服务转发安装包。只为缺少 Manager 的 SkinForge Windows x64 用户提供一键安装；不自动升级已有安装。

## 发布

1. 发布者从上游获取已验证兼容的原版 `LTK.Manager_VERSION_x64-setup.exe` 和对应 `.exe.sig`（官方 Tauri updater 签名），保留许可证和原始签名，不重新打包。
2. 在 SkinForge 工作目录运行 `node scripts/upload-ltk-manager.mjs INSTALLER SIGNATURE VERSION OUTPUT_JSON`。环境复用现有 `KDOCS_COOKIE` / `KDOCS_GROUP_ID` / `KDOCS_PARENT_ID`。不要把 Cookie 写入清单或提交仓库。
3. 打开管理后台 → SkinForge → 外服运行环境，导入 JSON，确认兼容性后发布。
4. `GET /api/client/skinforge/ltk-manager` 应返回 200 / `Cache-Control: no-store`。随后在 Windows 测试确认、下载进度、官方验签、安装/取消/失败重试、路径自动识别和外服实际换肤。

清单示例（签名和摘要需使用真实文件计算值）：

```json
{"schemaVersion":1,"product":"ltk-manager","platform":"windows-x86_64","version":"1.33.0","signature":"OFFICIAL_UPDATER_SIGNATURE","artifact":{"fileId":"1","linkId":"LINK_ID","fileName":"LTK.Manager_1.33.0_x64-setup.exe","fileSize":123,"sha256":"SHA256","groupId":"2","parentId":"3"}}
```

## API

- JWT `GET /api/skinforge/ltk-manager`：当前全局 pin 或 null，包含稳定云文档标识及发布时间，不返回 Cookie/临时直链。
- JWT `POST /api/skinforge/ltk-manager`：`{"manifest": MANIFEST}`，验证 schema/product/platform、稳定 ID/目录/大小/摘要/签名格式，再解析和探测直链；成功后原子替换 singleton。与软件更新不同，允许回退兼容 pin，不覆盖 `skinforge_releases`。
- Public `GET /api/client/skinforge/ltk-manager`：标准 envelope，data 为 `version/platform/fileName/fileSize/sha256/signature/url`，每次请求从 Kdocs 获取新 HTTPS OSS 地址。无记录 404，解析失败/超时 503；不自动回源 GitHub。

客户端使用内置官方公钥验证安装包字节，服务端导入只验证签名格式而非签名真实性，摘要本身不是来源认证。错误不回显完整 OSS URL；不要把临时 URL 放到日志、数据库或清单中。管理员应核对上游来源和兼容性，公钥轮换需更新客户端代码。

## 部署与回滚

先部署 backend（启动自动创建 `skinforge_ltk_manager`，手动迁移为 `012_create_skinforge_ltk_manager.sql`），再部署管理前端，最后发布新 SkinForge。复用 `KDOCS_CREDENTIAL_KEY`，不新增云文档凭证。

先发布清单再放量客户端；未发布时客户端提示稍后重试/选择已有路径。回滚时重新导入旧的兼容清单；已安装用户不受 pin 变动影响。旧客户端及国服路由无变化。本地代码通过不等于已上传或线上部署。

官方 v1.33.0 `.exe.sig` 的受信任文件名是 `LTK Manager_VERSION_x64-setup.exe`，发行资产名称则是 `LTK.Manager_VERSION_x64-setup.exe`。各层只兼容这一固定产品名前缀差异，版本和路径不做宽松归一化。

本地验证：Rust 48 passed（2 ignored），新增隔离 MySQL 8.0.46 回归已显式执行通过；前端清单回归/lint/build、clippy、实际本机 API 200/400/401/404 通过。没有真实 OSS 上传/发布、线上部署或 Windows 安装实测。
