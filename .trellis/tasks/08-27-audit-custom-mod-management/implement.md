# 自定义 MOD 分类管理生产回归审计实施计划

1. 复盘 `00a77ca^..HEAD` 的 MOD 相关 diff，建立跨层契约清单。
2. 运行现有后端测试、严格 Clippy、前端 lint/build，记录基线。
3. 启动隔离 MySQL 8，验证：
   - Docker 初始化 schema；
   - 旧版 `skinforge_mods` 自动补列；
   - COUNT、分页列表、行模型和唯一约束的真实解码。
4. 审查并修复输入边界、数据库类型、响应契约、错误映射、并发/分页与前端状态问题。
5. 为每个确认根因增加回归测试；补 schema 一致性自动检查。
6. 重跑：`cargo fmt --check`、`cargo test`、严格 Clippy、前端 lint/build、MySQL 集成测试。
7. 对照 PRD 和项目 spec 做最终复核，记录不能由本地替代的真实 KDocs smoke test 边界。

## 回滚点

- 测试和生产代码分提交审查，但最终按一个修复单元提交。
- 数据库变更只做兼容性增强，不删除表或数据。
- 若外部契约已有客户端依赖，保持旧字段可用并在文档标明。
