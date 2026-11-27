# 开发指南

## 环境

- Windows x64、.NET Framework 4.7.2 或更新版本。构建使用系统的 `Framework64/v4.0.30319/csc.exe`。
- Node.js 22.12+ / npm。前端依赖由 `desktop/web/package-lock.json` 锁定。
- 运行设置界面需要 Microsoft Edge WebView2 Runtime。
- 正常安装包使用 Inno Setup 7，构建时显式传入 ISCC 和经过签名验证的 Microsoft WebView2 引导程序。MSI 脚本只保留给已使用 MSI 通道的隔离构建和兼容测试。

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

## 构建 Inno Setup 安装版

```powershell
./desktop/installer/build-peek.ps1 `
  -OutputDirectory './artifacts/installer' `
  -Compiler 'C:/tools/inno/ISCC.exe' `
  -Bootstrapper 'C:/tools/MicrosoftEdgeWebview2Setup.exe'
```

输出 `Peek-Setup-v<版本>.exe`。首次安装可选择目录，默认 `%LOCALAPPDATA%\Programs\Peek`；同一 Inno 通道升级沿用原目录。安装包从与便携版相同的载荷清单逐文件校验并安装 `Peek.exe`、配置、`app/`、`runtime/`、`resources/`、`licenses/`，不会把便携自解包 EXE 装入目录。用户配置由 Peek 单独管理，普通卸载不删除。安装器图标由 `build-setup-icon.ps1` 按尺寸生成：ICO 用于安装包、卸载器和应用列表，透明 PNG 用于浅深色安装向导，不替换应用图标。

交付前运行 `tests/peek-inno-clean-user.ps1`，在临时标准用户中操作中文向导、选择非默认目录、逐文件比对、启动软件并卸载。以最终安装包哈希与实际截图为准，不用静默解包替代交互验证。

`desktop/PEEK-VERSION` 是版本来源。安装包与独立 EXE 使用相同的校验后有效负载。未签名的构建默认只作本地测试；如果维护者明确指定发布现成的未签名候选，须在发布说明标明未签名。SHA-256 只用于核对文件内容，不能代替代码签名。

## 源码结构

| 位置 | 职责 |
| --- | --- |
| `desktop/host/WidgetHost.cs`、`desktop/host/PeekNativeMenu.cs` | Peek 独立 Windows 入口、托盘、Win32 菜单与设置桥接 |
| `desktop/host/taskbar/`、`desktop/host/WidgetDesktopWindow.cs` | 原生任务栏绘制与桌面监测 |
| `desktop/host/PeekUpdates.cs` | Peek 的 GitHub 正式更新通道 |
| `desktop/backend/` | 采样、系统调用和持久化等共享模块 |
| `desktop/web/src/native/WidgetApp.jsx` | Peek 设置主界面，复用公共前端组件 |
| `desktop/installer/`、`build-widget-portable.ps1` | 安装包与便携版构建 |

## 配置与数据

新默认位置为 `%LOCALAPPDATA%\Peek`。首次运行在独占实例锁下迁移旧 `%LOCALAPPDATA%\AsterHubWidgets` 中的持久数据；不搬运行时、浏览器缓存和临时更新包。手动迁移从常规页选择父目录，新建其中的 `Peek` 文件夹，核对文件后切换目录指针并重启，原始目录保留为备份。迁移的是配置和数据，不移动安装位置或启动 EXE。目录不可用时不自动另建一份空配置；连接原磁盘后重试。

## 正式版更新资产

便携实例使用 `Peek.exe`，Inno 实例使用 `Peek-Setup-v<版本>.exe`，两者由同一 `SHA256SUMS.txt` 校验。如果另行维护 MSI 通道，MSI 实例仍寻找 `Peek-Setup-v<版本>.msi`，不与 Inno 跨格式原位覆盖。

在「关于」中，下载和校验完成后，独立更新进程等待旧版退出，再静默安装或替换，最后重启 Peek。不会自动重启 Windows。

应用内升级冒烟脚本位于 `tests/peek-update-smoke.mjs`。测试用另外一个版本的真实包，正式安装记录之外使用独立的 AppId，并禁用测试包的卸载注册和快捷方式；不要拿正在使用的正式安装目录进行覆盖或故障测试。
