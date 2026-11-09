# 导出数据时不停止服务

## Goal

迁移导出在旧服务器上执行时保持 `cdk-server` 运行，避免影响正在使用的用户。导出改为依赖已有的 InnoDB 一致性快照，不再为了导出而停应用。

## What I already know

- 用户要求去掉停止服务的步骤，不希望影响当前用户。
- `deploy/migrate-export.sh` 在 Docker 和本机两种模式下都会先停 `cdk-server`，再 `mysqldump`。
- 脚本已经使用 `--single-transaction`。业务表全部是 InnoDB，该选项能在导出开始时取得一致性读快照，导出过程不锁表。
- 快照开始之后的写入不会进入这份 SQL。用户选择保持服务运行，接受这份时间点备份。
- `deploy/migrate-import.sh` 停的是新服务器上的应用，避免导入和启动建表冲突，不影响旧服务器上的当前用户。

## Requirements

- 从 `deploy/migrate-export.sh` 的 Docker 和本机两条路径中删除停止 `cdk-server` 的步骤（`docker compose stop`、`docker stop`、`systemctl stop`）。
- 保留现有 `mysqldump` 参数：`--single-transaction`、`--routines`、`--triggers`；Docker 路径继续保留 `--set-gtid-purged=OFF`。
- 调整步骤编号和输出文案，说明导出期间应用保持运行，备份是导出开始时的一致性快照。
- 结尾提示改为说明快照之后的写入不在备份中；切流前需要另行处理这段差异。删除“导出后重启旧应用”这类假定应用已被停止的说法。
- 不修改 `deploy/migrate-import.sh`。

## Acceptance Criteria

- [ ] `migrate-export.sh` 中不再出现停止应用的命令。
- [ ] Docker 与本机路径都会在服务运行时直接导出。
- [ ] `mysqldump` 参数保持不变。
- [ ] 脚本输出明确这是时间点快照，且应用未被停止。
- [ ] `migrate-import.sh` 无改动。

## Definition of Done

- 脚本改动与上述要求一致。
- 本变更为 shell 脚本，无对应单元测试；用阅读和检索确认停服务命令已移除。
- 不新增 spec，除非发现可复用的新约定。

## Out of Scope

- 记录 binlog 位点并在新库回放，以实现零丢失切流。
- 修改导入脚本、应用代码、前端 Excel 导出。
- 为导出增加停写窗口或只读模式。

## Technical Notes

- 一致性来自 `mysqldump --single-transaction` 对 InnoDB 的 `REPEATABLE READ` 快照，不是来自停服务。
- 导出过程中若并发执行 `ALTER/CREATE/DROP/RENAME/TRUNCATE TABLE`，快照可能失效。正常在线流量是 DML；应用的建表发生在启动时，本次导出不再重启应用。
- 相关文件：`deploy/migrate-export.sh`、`deploy/mysql-init/01_schema.sql`。
