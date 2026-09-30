# 从零搭建并部署个人知识图谱网站（Cloudflare Pages 实践记录）

> 成果：https://ai-knowledge-graph-892.pages.dev （Cloudflare Pages 托管，GitHub 自动部署）

## 一、整体流程概览

```
写代码（本地） → 推送到 GitHub → Cloudflare Pages 连接仓库 → 自动部署上线
                     ↑___________________________________________|
                     （以后每次 push，Cloudflare 自动重新部署，无需手动）
```

## 二、网站搭建（本地开发）

### 技术选型（纯静态，零构建）

| 文件 | 作用 |
|---|---|
| `index.html` | 首页：ECharts 力导向知识图谱，点击节点跳转详情 |
| `node.html` | 详情页模板：读 URL 参数 `?id=xxx`，从 data.js 渲染内容 |
| `data.js` | 全部知识数据（36 个节点：id/name/category/tagline/summary/content/links） |
| `style.css` | 全局样式 |
| `README.md` | 项目说明 |

关键设计：
- **图谱可视化**：ECharts `graph` 类型 + `force` 布局，`chart.on('click')` 监听节点点击 → `window.location.href = "node.html?id=" + id`
- **内容驱动**：新增知识点只需在 `data.js` 加一个对象，图谱和详情页自动更新，不用改其他文件
- 引用 ECharts CDN：`https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js`

### 本地预览

```bash
cd 项目目录
python3 -m http.server 8000   # 打开 http://localhost:8000
```

## 三、推送到 GitHub

### 1. 创建仓库

在 GitHub 网页手动创建空仓库（如 `ai-knowledge-graph`），不要勾选 README（避免冲突）。

### 2. 初始化并推送

```bash
git init
git add -A
git commit -m "初版"
git branch -m main
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

### 3. 凭据问题处理（重要经验）

- **现象**：`git push` 报 `could not read Username for 'https://github.com'`（终端无法交互输入账号密码）
- **解决**：用 GitHub CLI 的设备流登录（Device Flow），它会自动配置 git 凭据助手：

```bash
gh auth login --web -h github.com -p https
# 输出一个一次性验证码，浏览器打开 https://github.com/login/device 输入即可
gh auth setup-git   # 把 gh 的凭据同步给 git
```

> ⚠️ 注意：`gh auth login` 的 OAuth 回调只等约 2 分钟，要在浏览器里**尽快**完成授权，否则会超时失败，需要重新发起拿新验证码。
> 本项目部署时网络出口在香港（公司网络/代理），OAuth 端点一度连接被重置——多试几次或换网络。

## 四、部署到 Cloudflare（踩坑与正解）

### ❌ 踩坑 1：用了新的 Workers 部署流程

Dashboard → Workers & Pages → Create → Connect GitHub → Deploy

- 它默认走 `npx wrangler deploy`，仓库里需要 `wrangler.toml` 配置静态资源：

```toml
name = "ai-knowledge-graph"
compatibility_date = "2025-09-25"

[assets]
directory = "."
```

- 部署本身成功，但生成的地址是 `xxx.workers.dev`

### ❌ 踩坑 2：`*.workers.dev` 在国内被 DNS 污染

- **现象**：部署成功、后台一切正常，但浏览器和 curl 都连不上，连手机流量也不行
- **诊断方法**：`nslookup` 对比解析结果

```bash
nslookup ai-knowledge-graph.luw.workers.dev
# → 52.58.1.161  ❌ 假 IP（不是 Cloudflare 的），被污染

nslookup flow-panel-designer.pages.dev   # 同账号下能打开的旧项目
# → 172.66.x.x   ✅ 真实 Cloudflare IP

nslookup dash.cloudflare.com
# → 104.17.x.x   ✅ 正常（后台能打开不代表网站域名没被污染）
```

- **结论**：`workers.dev` 在国内普遍被 DNS 污染；`pages.dev` 通常直连正常

### ✅ 正解：用经典 Cloudflare Pages 流程

Dashboard 的 "Create an app" 页面**底部有小字**：`Need to use the legacy Pages workflow? Continue to Pages` → 点进去

1. **Connect to Git** → 选择仓库 → **Begin setup**
2. 配置：
   - Project name：自定义
   - Production branch：`main`
   - Framework preset：**None**
   - Build command：**留空**（纯静态无需构建）
   - Build output directory：`/`
3. **Save and Deploy** → 1 分钟后上线，地址 `https://<项目名>.pages.dev`

> 也可以直接访问 https://dash.cloudflare.com/pages/new/provider/github

### 踩坑 3：项目名冲突导致域名带随机后缀

- Workers 和 Pages **共用一个命名空间**。之前创建的 Worker 叫 `ai-knowledge-graph`，Pages 再用同名就分配了 `ai-knowledge-graph-892.pages.dev`
- **Pages 的 pages.dev 域名创建后不可修改**（Settings 里的 Rename 只改项目名，不改域名）。想要干净地址只能：删 Worker → 删 Pages 项目 → 重建
- 不折腾的话带后缀也功能完全一样；买了自己的域名后绑 Custom domain 才是最终形态

## 五、验证清单

```bash
# 1. DNS 是否被污染（先确认解析到 172.66.x / 104.x / 188.114.x 才是真实 Cloudflare IP）
nslookup <你的域名>.pages.dev

# 2. 页面可访问性（本机网络通的话）
curl -s -o /dev/null -w "%{http_code}" https://<你的域名>.pages.dev/
curl -s -o /dev/null -w "%{http_code}" "https://<你的域名>.pages.dev/node.html?id=xxx"

# 3. 自动部署验证：随便改个文件推送，观察 Dashboard Deployments 是否自动出现新构建
git add -A && git commit -m "test" && git push
```

## 六、日常维护备忘

| 操作 | 方法 |
|---|---|
| 新增知识点 | 编辑 `data.js` 加节点对象 → push → 自动部署 |
| 换 workers.dev 子域名 | Workers & Pages 总览页右侧 Account details → Subdomain → 修改（账号级，全账号生效） |
| 绑定自己的域名 | 项目 → Custom domains → Add Domain（需先把域名 NS 托管到 Cloudflare） |
| 开启访问 | 项目 → Domains → 打开 Production 开关 |
| 删除项目 | 项目 → Settings → 底部 Delete |

## 核心经验总结

1. **国内环境优先选 Pages（pages.dev）而不是 Workers（workers.dev）**，出问题时用 `nslookup` 先排除 DNS 污染
2. 终端推送 GitHub 用 `gh auth login --web` 设备流最省事，但授权动作要快（2 分钟超时）
3. Cloudflare 连接 GitHub 部署：**纯静态站 = Framework None + 无构建命令 + 输出目录 `/`**
4. Workers / Pages 项目名共享命名空间，重复名会导致域名加随机后缀，且 Pages 域名创建后不可改
5. Dashboard 新版 "Create an app" 默认是 Workers 流程，**Pages 入口藏在页面底部一行小字里**
