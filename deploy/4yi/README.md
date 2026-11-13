# 4YI 多服务部署

参考后台已经发布的 Shannon 的 services 数组、internal 路由、独立构建和 storage 声明。
本应用拆分为 web、postgres、redis；仅 web 对外公开。数据库和缓存由本应用的独立服务承载，不使用外部托管数据库/缓存。
业务仍使用 4YI 的入口、身份签名、Secret 注入、内部 DNS 和持久卷。

## 资源约束

每个服务声明 resources.cpu=0.5、memoryMb=1536（按 1.5 GiB 预算）。
Redis 最大数据内存设为 768mb，为 AOF 和进程留空间；数据库降低连接数和缓存。
这是资源预算，不是保证工作负载一定够用。
声明格式取自现有应用，但尚未验证平台是否生成同值 limits，不能把 requests 当硬上限。
上线前使用精确的应用标签选择器获取本应用全部 Pods：

```sh
kubectl get pods -n <namespace> -l <本应用实际标签选择器> -o json | node deploy/4yi/verify-pod-limits.mjs
```

脚本检查每个 Pod 的所有容器合计、init 容器及 sidecar 的 requests/limits；缺失或超过 500m CPU、1536Mi 内存即失败。
如果不通过，须在 4YI 发布器支持的资源配置中设置实际 limits 后重发，不能声称已落实硬上限。
本次未添加平台尚未确认支持的 cpuLimit 等字段。不要对现有其他应用改资源。

## 首次配置

在管理员机器运行（需要 Node 和 OpenSSL）；已有数据必须传现有加密主密钥文件：

```sh
mkdir -p .secrets
node deploy/4yi/provision-secrets.mjs .secrets/4yi /安全位置/operations-config.key
# 仅明确是全新空数据库时，才可把最后一个参数改为 --new-install。
```

脚本拒绝覆盖已存在的目录。生成的 secrets.json、CA 私钥和证书必须保存在受控秘密存储中，不进入 Git。
不可对已有数据库重新生成密码或主密钥；Postgres 卷初始化后不会自动接受新 POSTGRES_PASSWORD。
叶证书有效期一年，提前使用原 CA 续签并更新两个服务的证书 Secret，不能靠重启生成新 CA。

将 secrets.json 的字段分别安全绑定到 deploy/4yi/secret-bindings.json 中同名环境变量引用的 secret:*：
APP_DB_PASSWORD、POSTGRES_PASSWORD、REDIS_PASSWORD、OPERATIONS_CONFIG_KEY、
INTERNAL_CA_CERT_B64、POSTGRES_TLS_CERT_B64、POSTGRES_TLS_KEY_B64、
REDIS_TLS_CERT_B64、REDIS_TLS_KEY_B64。
配置声明中的引用不等于秘密值已存入平台；4yi-app.json 的严格校验不接受 secrets 字段。导入后必须在 Proposal manifest.services 对应服务补齐 secret-bindings.json 中的 secrets 映射；不要把整个文件覆盖到 Proposal，也不要把实际秘密值写入仓库。

4YI 继续注入 FOURYI_ROUTER_IDENTITY_KEY、XCLAW_APP_HOSTNAME。
固定 slug 为 ai-office-saas，内部 DNS 为 ai-office-saas-postgres / ai-office-saas-redis，沿用 Shannon 的 appSlug-service 命名。
发布时核实实际 DNS；修改 slug 时同时修改 PGHOST、REDIS_HOST 和证书 SAN。

## 启动与数据

postgres/redis 只开启 TLS 网络连接；Redis 同时要求密码，Postgres 网络连接只接受 hostssl + scram。
web 从私有 CA Secret 写入可信证书文件，NODE_EXTRA_CA_CERTS 供 Redis 客户端使用，PGSSLROOTCERT 供数据库使用。
启动等待数据库，再运行现有幂等迁移/office_app 角色初始化；主服务只收到受限数据库用户凭据。
迁移失败会停止启动，不忽略失败，不取消 TLS/行权限检查。
postgres 持久卷 20GB、Redis 5GB、web 原有 20GB；备份需另行配置。

现有数据迁移必须先备份并恢复到这些卷；本配置不会自动导入原托管数据库。
OPERATIONS_CONFIG_KEY 是加密主密钥，不是独立服务或 Pod。
该配置不新增浏览器执行沙箱或视频服务，也不等于所有业务功能已验收。

## 发布验收

1. 4YI 重新拉取本次提交，确认 Proposal 有 web/postgres/redis 三个服务及对应 Secret。
2. 核实存储挂载、内部 DNS、证书 SAN、TLS 密钥文件权限和平台 Pod 安全上下文。中间件沿用官方镜像入口的 root 初始化后降权；若平台强制非 root，需先适配卷所有权。
3. Apply/Release 后执行资源上限校验，确认容器无 OOM、无 Pending。
4. /health/ready 冒烟通过，再验收平台登录、数据写入、重启数据保留及密钥解密。
5. 本地未具备 Docker 时，不能将静态测试当成镜像集成测试；发布前补跑镜像构建和完整启动。
