# 第三方组件

- **前端构建与组件**：React、Vite、GSAP、Lucide 等依赖的精确版本见 [`desktop/web/package-lock.json`](../desktop/web/package-lock.json)。Lucide 随附许可见 [`desktop/app/resources/ui/LUCIDE-LICENSE.txt`](../desktop/app/resources/ui/LUCIDE-LICENSE.txt)。
- **WebView2 SDK**：固定为 1.0.2903.40；随附的 [许可](../desktop/app/licenses/webview2_sdk_LICENSE.txt)与 [NOTICE](../desktop/app/licenses/webview2_sdk_NOTICE.txt)保留在载荷中。运行时由系统提供。
- **共享 Windows 模块依赖**：SSH.NET、BouncyCastle 和 .NET 依赖位于 [`desktop/app/runtime/`](../desktop/app/runtime/)，对应[许可证和散列](../desktop/app/licenses/)随附。共享前端使用的 xterm.js 组件与许可证位于 [`desktop/app/resources/terminal/`](../desktop/app/resources/terminal/)，详见其 [`DEPENDENCIES.txt`](../desktop/app/resources/terminal/DEPENDENCIES.txt)。这些共享模块不代表 Peek 提供远程终端。
- **字体**：HarmonyOS Sans [许可](../desktop/web/public/fonts/HarmonyOS-Sans-LICENSE.txt)；Inter 与任务栏字体子集 [OFL](../desktop/host/fonts/LICENSE.txt)，字体来源及子集构建见 [`desktop/scripts/build-taskbar-inter.py`](../desktop/scripts/build-taskbar-inter.py)。
- **安装程序**：Inno Setup 和 Microsoft 签名的 WebView2 Evergreen Bootstrapper 从本机明确传入，不作为仓库构建工具提交。

第三方许可不构成 Peek 自有源码的通用授权。
