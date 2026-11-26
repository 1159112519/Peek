# 开发指南

## 环境

- Windows x64、.NET Framework 4.7.2 或更新版本。构建使用系统的 `Framework64/v4.0.30319/csc.exe`。
- Node.js 22.12+ / npm。前端依赖由 `desktop/web/package-lock.json` 锁定。
- 运行设置界面需要 Microsoft Edge WebView2 Runtime。
- 安装包另外需要 Inno Setup 7 或更新版本，以及 Microsoft 签名的 WebView2 Evergreen Bootstrapper。

## 构建便携版

在仓库根目录执行：

```powershell
npm.cmd --prefix desktop/web ci
./desktop/build.ps1 -WidgetOnly
./build-widget-portable.ps1 -OutputDirectory './artifacts/portable'
```

宿主和载荷清单位于 `desktop/app/`；便携版位于 `artifacts/portable/Peek.exe`。打包时逐个校验载荷 SHA-256。每次打包请传入一个新的便携版输出目录。

可用独立目录启动冒烟测试，避免读取正常配置或写入正常启动项：

```powershell
& ./artifacts/portable/Peek.exe --smoke (Join-Path $env:TEMP ('Peek-source-check-' + [guid]::NewGuid().ToString('N')))
```

## 构建安装版

```powershell
./desktop/installer/build-peek.ps1 `
  -PeekExe './artifacts/portable/Peek.exe' `
  -Compiler 'C:/tools/Inno Setup 7/ISCC.exe' `
  -Bootstrapper 'C:/tools/MicrosoftEdgeWebview2Setup.exe' `
  -OutputDirectory './artifacts/installer'
```

`desktop/PEEK-VERSION` 是 Peek 的发布版本来源。构建脚本校验内嵌版本和引导器的 Microsoft 数字签名。机器上的构建不替换 GitHub Release 资产，也不要求与已发布的 EXE 字节级重现。

## 源码结构

| 位置 | 职责 |
| --- | --- |
| `desktop/host/WidgetHost.cs` | Peek 独立 Windows 入口、托盘及设置桥接 |
| `desktop/host/taskbar/`、`desktop/host/WidgetDesktopWindow.cs` | 原生任务栏绘制与桌面监测 |
| `desktop/host/PeekUpdates.cs` | Peek 的 GitHub 正式更新通道 |
| `desktop/backend/` | 采样、系统调用和持久化等共享模块 |
| `desktop/web/src/native/WidgetApp.jsx` | Peek 设置主界面，复用公共前端组件 |
| `desktop/installer/`、`build-widget-portable.ps1` | 安装包与便携版构建 |

项目保留共享模块及历史内部标识。`AsterHubWidgets.exe`、`AsterHubWidgets` 用户数据目录和登录启动项用于兼容既有设置；正式面向用户的程序名为 `Peek.exe`。这些名称不代表需要另装 AsterHub，也不改变 Peek 的更新仓库。

## 正式版更新资产

每个正式 Release 需同时发布 `Peek.exe`、`Peek-Setup-v<版本>.exe` 和 `SHA256SUMS.txt`；校验文件每行使用「64 位 SHA-256、两个空格、精确资产名」。应从最终构建产物生成后再一起发布，不能改名或只替换其中一个文件。Peek 从正式版标签的公开下载地址取校验文件和相应的 EXE，不依赖 GitHub REST API 凭据。

在「关于」发现新版本时，「安装并重启」原位替换「检查更新」。点击一次即下载并校验，校验通过后才退出并安装；自动检查本身不会安装。安装版通过现有 Inno 安装目录静默覆盖，便携版在原目录替换 EXE；两种模式都由独立的 `PeekUpdateWorker.exe` 重新启动 Peek，不重启 Windows。0.1.1 及更早版本需手动覆盖一次，不能用旧版本验证安装按钮。

应用内升级冒烟脚本位于 `tests/peek-update-smoke.mjs`。测试用另外一个版本的真实包，正式安装记录之外使用独立的 AppId，并禁用测试包的卸载注册和快捷方式；不要拿正在使用的正式安装目录进行覆盖或故障测试。
