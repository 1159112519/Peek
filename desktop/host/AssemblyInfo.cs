using System.Reflection;
#if ASTERHUB_WIDGET
[assembly:AssemblyTitle("Peek")]
[assembly:AssemblyProduct("Peek")]
[assembly:AssemblyVersion(PeekRelease.Version)]
[assembly:AssemblyFileVersion(PeekRelease.Version)]
[assembly:AssemblyInformationalVersion(PeekRelease.Version)]
#else
[assembly:AssemblyTitle("AsterHub Windows")]
[assembly:AssemblyProduct("AsterHub")]
[assembly:AssemblyVersion("0.4.3.9")]
[assembly:AssemblyFileVersion("0.4.3.9")]
[assembly:AssemblyInformationalVersion("0.4.3.9")]
#endif
