# 公共技能按需下载

发布镜像和源码包不包含 ZIP。目录中的 sources 指向固定提交，下载后验证 SHA-256，主通道失败尝试 GitHub 文件接口。
本机既有文件保留用于离线回退，不提交新 ZIP。已经安装的技能继续使用工作空间中的副本。
详细规则见 docs/clean-server-install.md。
