# 在线导出

## 结论

可以在 `cdk-server` 持续运行时导出。`deploy/migrate-export.sh` 里的 `mysqldump` 已经带 `--single-transaction`。`deploy/mysql-init/01_schema.sql` 与 `backend/migrations/` 中的业务表都是 `ENGINE=InnoDB`。

`--single-transaction` 会在导出开始时开启一致性读。对 InnoDB 来说，之后的普通读写不需要停应用，也不会在整个导出期间锁表。快照开始之后的写入不会出现在 SQL 文件里。

原先停服务是为了让这份 SQL 成为切流前的最终数据。脚本没有记录 binlog 位点，因此不能在不停服务的同时自动补上导出之后的写入。本次按用户要求只去掉停服务，保留时间点快照语义。

导入脚本停的是新机器上的应用，用于避免导入和启动建表冲突，不在本次范围。
