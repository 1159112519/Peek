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
