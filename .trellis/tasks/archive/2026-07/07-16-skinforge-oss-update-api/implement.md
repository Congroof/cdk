# SkinForge OSS 更新分发接口 — 实施计划

## 实施步骤

1. 增加依赖和配置：
   - AES-256-GCM、Base64、SemVer、流式文件 body 所需 crate；
   - `KDOCS_CREDENTIAL_KEY`；
   - 删除 Hash public base URL 的业务依赖。
2. 增加四个单例表，并同步：
   - `backend/src/db.rs`
   - 新 migration
   - `deploy/mysql-init/01_schema.sql`
3. 实现 KdocsService：
   - Cookie/CSRF 解析和 AES-GCM encrypt/decrypt；
   - pre-check 配置验证；
   - 流式摘要与上传；
   - file/link 换链；
   - Expires URL cache 和下载探测；
   - 敏感信息日志保护。
4. 实现云文档配置 model/handler/API，并将修改人解析为当前 JWT 用户。
5. 实现软件发布 model/handler：
   - manifest/notes 校验；
   - SemVer 严格递增；
   - 目录一致性与换链探测；
   - 事务化单例覆盖；
   - 当前发布查询。
6. 实现公开 Tauri 动态 endpoint，覆盖 204/200/400/503 矩阵。
7. 重构 Hash sync：
   - 保留上游 HEAD/download/格式校验；
   - staging candidate 与 pending upload 持久化；
   - gzip 与 canonical 摘要；
   - 缺失 artifact 补传；
   - 双换链探测和 DB 成对发布；
   - 状态持久化和进程级防重入。
8. 增加 Hash 管理 API 与公开 metadata API。
9. 扩展 AppState 和启动流程，使后台周期任务、handlers 和 cache 共享状态。
10. 管理后台新增 SkinForge tab、类型和三个管理组件。
11. 删除 Nginx `/skinforge/` 静态 location，保留 staging volume；更新 Docker compose
    的加密 key 配置示例。
12. 更新 `API.md`、`DEPLOY_LINUX.md`、`.env.example`、README 与 Trellis specs。

## 自动化测试

- AES-GCM round-trip、错误 key、nonce 和 Cookie 脱敏。
- csrf 解析、配置字段校验、云文档响应解析。
- manifest schema、摘要、NSIS 文件名、SemVer 严格递增。
- Tauri response/no-update 判定。
- URL `Expires` 解析、5 分钟刷新边界、cache fallback。
- Hash candidate/pending 恢复：
  - TXT 已上传、gzip 未上传时只补 gzip；
  - 双上传成功才发布；
  - 任一失败保持旧 DB 当前记录；
  - 成功后清 pending。
- sync controller 防重入。
- 公开 Hash 响应只在两个 URL 均可用时成功。

## 验证命令

```bash
cd backend
cargo fmt --check
cargo test
cargo check
cargo clippy -- -D warnings

cd ../frontend
npm run lint
npm run build

cd ..
docker compose config
git diff --check
```

集成验证：

1. 使用测试/生产云文档 Cookie 保存配置并重启服务，确认仍可解密。
2. 手动触发 Hash 同步，确认大文件流量直接到云文档上传端，客户端 URL 指向 OSS。
3. 重启中断后复用 staging/pending 补传。
4. 导入 SkinForge release JSON，确认版本不递增被拒绝。
5. curl updater endpoint：
   - 旧版本 200；
   - 当前版本 204；
   - 非 Windows 204。
6. curl Hash metadata 并对两个 URL 做小范围/HEAD 验证。
7. 确认 Nginx 旧大文件路径不可用，`/api/` 正常。

## 风险与回滚

- KDocs 是非公开协议：集中封装响应解析，所有外部错误均保留旧发布，不让协议变化破坏
  当前客户端。
- Cookie key 丢失将无法解密；部署文档必须要求持久保存 key，禁止自动生成新 key
  覆盖。
- Hash 上传可能产生孤儿云文档文件；MVP 允许人工清理，不在失败路径删除。
- 发布表只有最新记录；数据库更新前必须完成所有外部探测。
- 删除 Nginx location 前必须完成新 API/客户端验证；必要时可临时恢复配置和旧目录。

## 开始实施前

- [ ] 用户审阅并批准 PRD/design/implement。
- [ ] 运行 `task.py start`。
- [ ] 加载 `trellis-before-dev` 并重读 backend/frontend/Hash specs。
- [ ] 确认 cdk-server 工作区除本任务规划文件外无用户修改。
