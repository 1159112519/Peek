using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Peek")]
[assembly: AssemblyProduct("Peek")]
[assembly: AssemblyFileVersion(PortableBundle.Version)]
[assembly: AssemblyVersion(PortableBundle.Version)]
[assembly: AssemblyInformationalVersion(PortableBundle.Version)]

internal static class WidgetPortable {
    const string Host = "AsterHubWidgets.exe";
    static readonly string Id = PortableBundle.Id;

    [STAThread]
    static int Main(string[] args) {
        bool background = args.Contains("--background");
        int smoke = Array.IndexOf(args, "--smoke");
        try {
            string launcher = Assembly.GetExecutingAssembly().Location;
            string root = smoke >= 0
                ? Path.Combine(Path.GetFullPath(args[smoke + 1]), "PortableRuntime")
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AsterHubWidgets", "Runtime");
            Directory.CreateDirectory(root);
            string ready = Path.Combine(root, Id);
            using (var mutex = new Mutex(false, @"Local\AsterHubWidgets-Extract-" + Id)) {
                bool acquired;
                try { acquired = mutex.WaitOne(TimeSpan.FromSeconds(45)); }
                catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) throw new IOException("等待小组件准备运行文件超时。");
                try {
                    if (!File.Exists(Path.Combine(ready, Host)) || !File.Exists(Path.Combine(ready, ".ready")))
                        ready = Extract(root, ready);
                } finally { mutex.ReleaseMutex(); }
            }
            var start = new ProcessStartInfo(Path.Combine(ready, Host)) {
                UseShellExecute = false,
                WorkingDirectory = ready,
                Arguments = string.Join(" ", args.Select(Quote).Concat(new[]{"--launcher", Quote(launcher)}))
            };
            start.EnvironmentVariables["SYSTEM_WIDGETS_BUNDLE"] = Id;
            using (var child = Process.Start(start)) {
                if (child == null) throw new IOException("没有启动小组件进程。");
                if (smoke < 0) return 0;
                child.WaitForExit();
                return child.ExitCode;
            }
        } catch (Exception e) {
            if (smoke >= 0 && smoke + 1 < args.Length) {
                try { File.AppendAllText(Path.Combine(args[smoke + 1], "portable-startup.log"), e.ToString() + Environment.NewLine); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
            if (!background && smoke < 0)
                MessageBox.Show("无法启动小组件：" + e.Message, "Peek", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    static string Extract(string root, string ready) {
        string staging = Path.Combine(root, ".unpacking-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(staging);
        using (Stream data = Assembly.GetExecutingAssembly().GetManifestResourceStream("WidgetPayload"))
        using (var zip = new ZipArchive(data, ZipArchiveMode.Read)) {
            string prefix = staging + Path.DirectorySeparatorChar;
            foreach (var entry in zip.Entries) {
                string target = Path.GetFullPath(Path.Combine(staging, entry.FullName));
                if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new IOException("无效的运行文件路径。");
                if (entry.Name.Length == 0) { Directory.CreateDirectory(target); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                using (var from = entry.Open())
                using (var to = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None)) from.CopyTo(to);
            }
        }
        if (!File.Exists(Path.Combine(staging, Host))) throw new IOException("小组件程序文件缺失。");
        File.WriteAllText(Path.Combine(staging, ".ready"), Id);
        if (Directory.Exists(ready)) {
            // Keep incomplete caches out of the executable path, without deleting user data.
            PublishDirectory(ready, Path.Combine(root, ".incomplete-" + Guid.NewGuid().ToString("N")));
        }
        PublishDirectory(staging, ready);
        return ready;
    }

    static void PublishDirectory(string from, string to) {
        // Defender or another file observer can briefly hold freshly written files open.
        for (int attempt = 0; ; attempt++) {
            try { Directory.Move(from, to); return; }
            catch (IOException) { if (attempt == 7) throw; }
            catch (UnauthorizedAccessException) { if (attempt == 7) throw; }
            Thread.Sleep(80 * (attempt + 1));
        }
    }

    static string Quote(string value) {
        var b = new StringBuilder("\"");
        int escapes = 0;
        foreach (char c in value) {
            if (c == '\\') { escapes++; continue; }
            b.Append('\\', c == '"' ? escapes * 2 + 1 : escapes).Append(c);
            escapes = 0;
        }
        return b.Append('\\', escapes * 2).Append('"').ToString();
    }
}

