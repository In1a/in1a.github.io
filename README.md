# evenbao blog

GitHub Pages + Jekyll 静态博客。文章保存在 `_posts/`，无需运行服务器或数据库。

## 迁移博客园文章

```bash
python3 -m pip install lxml
python3 scripts/migrate_cnblogs.py
```

脚本会从博客园 evenbao 主页逐页发现文章并下载正文，保留原始日期和来源链接。重复运行会跳过已有文件；`--limit 20` 可用于试运行。迁移结果在 `_posts/` 中，失败记录在 `migration-failures.txt` 中。

部分博客园图片为站外资源，原站删除或开启防盗链后可能失效；请检查迁移文章的图片和复杂数学公式。

## 发布到 GitHub Pages

1. 创建 GitHub 公共仓库 `你的用户名.github.io`，将本目录文件放在仓库根目录并推送到 `main`。
2. 在仓库 **Settings → Pages → Build and deployment** 选择 **Deploy from a branch**，选择 `main` 和 `/(root)`。
3. 在 `_config.yml` 填写 `url: "https://你的用户名.github.io"`，`baseurl: ""`。
4. 等待 GitHub Pages 首次构建，打开 `https://你的用户名.github.io`。

如果使用普通仓库名（例如 `blog`），则填写 `url: "https://你的用户名.github.io"` 和 `baseurl: "/blog"`。
