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

## 在线文章管理

在已发布的网站打开 `/admin/`，可以：

- 使用 Markdown 编写新文章，并保存为未公开的 `_drafts/*.md` 草稿。
- 发布文章到 `_posts/YYYY-MM-DD-slug.md`；GitHub Pages 构建后自动上线。
- 编辑现有文章的标题、正文和 `categories`；删除已发表文章或草稿。
- 上传公开图片到 `assets/uploads/` 并插入正文。
- 首页中英文界面都支持按分类筛选。迁移的旧文章默认没有分类，可在管理页逐篇补充。

登录方式：在 GitHub 的 Fine-grained Personal Access Tokens 页面创建令牌，限定 **Only select repositories → evenbao333.github.io**，只授予 **Contents: Read and write**。将令牌粘贴到 `/admin/` 的密码框后连接。令牌只保存在当前页面的 JavaScript 内存中，不存储在仓库、浏览器 localStorage 或 URL；关闭或刷新页面后需要重新填写。**不要把令牌写入文章或提交到仓库，不要发送给别人。**

这是纯静态站点的轻量管理方式，编辑操作直接使用 GitHub REST API，因此需要令牌。GitHub 自身的提交历史可用于恢复误删文件。
