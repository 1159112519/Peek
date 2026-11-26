<p align="center">
  <img src="desktop/web/public/peek-icons/01.png" width="112" height="112" alt="Peek 默认应用图标">
</p>

<h1 align="center">Peek</h1>

<p align="center"><strong>把常看的电脑读数放在任务栏</strong></p>

<p align="center">
  不用切窗口，就能看 CPU、GPU、内存、网速和磁盘。<br>
  两行排列，支持一至三列和分页。无需安装 AsterHub。
</p>

<p align="center">
  <a href="https://github.com/1159112519/Peek/releases/latest"><img src="https://img.shields.io/github/v/release/1159112519/Peek?label=download&amp;logo=windows&amp;color=0078d4" alt="下载 Windows 版 · 最新版本" height="20"></a>
  <img src="https://img.shields.io/static/v1?label=platform&amp;message=Windows%20x64&amp;color=59636e" alt="支持 Windows 10 / 11 x64" height="20">
  <img src="https://img.shields.io/static/v1?label=language&amp;message=ZH%20%2F%20EN&amp;color=416f68" alt="界面支持中文与英语" height="20">
  <a href="https://github.com/1159112519/Peek/issues"><img src="https://img.shields.io/static/v1?label=feedback&amp;message=Issues&amp;color=30363d&amp;logo=github" alt="在 GitHub 反馈问题" height="20"></a>
</p>

## 小组件特性

### 两行排列，最多三列

只想看 CPU 和内存，可以用一列；也可以排满三列，同时看六个指标。名称、指标和位置都能调整。

<p align="center">
  <a href="docs/screenshots/taskbar-layouts.png"><img src="docs/screenshots/taskbar-layouts.png" width="800" alt="Peek 浅色任务栏小组件：并列对照一列、两列和三列，每列有两行读数"></a>
</p>

### 空间不足时自动收缩

先缩小列间距，再从右侧逐列退出；空间腾出来后恢复原排列。

<p align="center">
  <img src="docs/screenshots/taskbar-squeeze.gif" width="800" alt="Peek 任务栏空间变化：三列收紧、减为两列和一列、隐藏，再逐列恢复">
</p>

### 多页切换，按用途分组

最多三页。比如第一页看利用率，第二页看网速和磁盘读写，第三页看显卡温度、频率和功耗。把鼠标移到小组件上用滚轮换页，也可以开启定时切页。

<p align="center">
  <img src="docs/screenshots/taskbar-pages.gif" width="800" alt="Peek 三页滚动演示：性能概览、网络与磁盘、显卡状态依次切换，左侧页标同步变化">
</p>

### 读数和小图可以搭配

数字适合看当前值，折线适合看短期变化。部分指标还支持柱状图或环形图；一列或两列时，数字和小图可以放在同一个指标里；名称、读数和图形的颜色可以分别调整。

<p align="center">
  <a href="docs/screenshots/taskbar-graphs.png"><img src="docs/screenshots/taskbar-graphs.png" width="800" alt="Peek 数字与图形组合：CPU 旁是折线，GPU 和内存旁是环形，SSD 旁是条形刻度"></a>
</p>

还可以设置网速单位、隐藏部分单位或百分号、调整刷新间隔。需要时可开启「点击打开资源详情」。可采集的指标取决于硬件与驱动。

## 下载安装

| 版本 | 如何使用 |
| --- | --- |
| [Windows 安装版](https://github.com/1159112519/Peek/releases/download/v0.1.0/Peek-Setup-v0.1.0.exe) | 推荐日常使用。运行安装向导，再从开始菜单打开 Peek。 |
| [Windows 便携版](https://github.com/1159112519/Peek/releases/latest/download/Peek.exe) | 下载后直接运行，无需解压。 |
| [SHA-256 校验文件](https://github.com/1159112519/Peek/releases/latest/download/SHA256SUMS.txt) | 核对下载文件的完整性。 |

首次运行后，可从通知区的 Peek 图标打开设置。在「任务栏」选好指标和排版，点击「应用」。需要登录 Windows 后自动运行时，可在「常规」开启静默启动。

**系统要求：** Windows 10 1809 或更新版本（64 位）、.NET Framework 4.7.2 或更新版本，以及 Microsoft Edge WebView2 Runtime。安装向导会检查 WebView2。

各版本的改进见[更新记录](CHANGELOG.md)与 [GitHub Releases](https://github.com/1159112519/Peek/releases)。

## 开发与许可

源码位于 [`desktop/`](desktop/)。本地构建见[开发指南](docs/BUILDING.md)，随附依赖及许可见[第三方组件说明](docs/THIRD-PARTY.md)。项目源码公开浏览，尚未授予通用开源许可。
