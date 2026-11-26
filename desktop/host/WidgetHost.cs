using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Windows.Threading;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

internal static class WidgetHost {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool SetDllDirectory(string path);
 internal static string LauncherPath {get;private set;}
 internal static bool TestMode { get {return WorkbenchHost.SmokeRoot!=null;} }
 static readonly System.Reflection.Assembly Assembly=typeof(WidgetHost).Assembly;
 static readonly string bundle=Environment.GetEnvironmentVariable("SYSTEM_WIDGETS_BUNDLE");
 static readonly string build=LauncherBuild();
 static string LauncherBuild(){
  return bundle!=null&&bundle.Length==24&&bundle.All(Uri.IsHexDigit)?bundle.ToUpperInvariant():Assembly.ManifestModule.ModuleVersionId.ToString("N").ToUpperInvariant();
 }
 internal static string VersionText {get{return ((System.Reflection.AssemblyInformationalVersionAttribute)Attribute.GetCustomAttribute(Assembly,typeof(System.Reflection.AssemblyInformationalVersionAttribute))).InformationalVersion;}}
 internal static object AppInfo(){return new{name="Peek",version=VersionText,build=build.Substring(0,8)};}
 static bool ActivateMatchingBuild(string restoreKey){
  // A newly owning process publishes this event just after taking the shared mutex.
  for(int i=0;i<10;i++){
   EventWaitHandle restore;
   if(EventWaitHandle.TryOpenExisting(restoreKey,out restore)){using(restore)return restore.Set();}
   Thread.Sleep(30);
  }
  return false;
 }
 [STAThread] public static int Main(string[] args) {
  bool background=false;
  try {
   WorkbenchHost.DataRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"AsterHubWidgets");
   for(int i=0;i<args.Length;i++) switch(args[i]) {
    case "--launcher":LauncherPath=Path.GetFullPath(args[++i]);break;
    case "--background":background=true;break;
    case "--smoke":WorkbenchHost.DataRoot=WorkbenchHost.SmokeRoot=Path.GetFullPath(args[++i]);break;
    case "--smoke-taskbar":WorkbenchHost.SmokeTaskbar=true;break;
    case "--debug-port":WorkbenchHost.DebugPort=int.Parse(args[++i]);break;
    default:throw new ArgumentException("Unknown startup option: "+args[i]);
   }
   Directory.CreateDirectory(WorkbenchHost.DataRoot);
   DiagnosticsLog.Configure(WorkbenchHost.DataRoot);
   SetDllDirectory(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"runtime","win-x64"));
   string instance;
   using(var sha=System.Security.Cryptography.SHA256.Create())instance=BitConverter.ToString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(WorkbenchHost.DataRoot.ToUpperInvariant()))).Replace("-","").Substring(0,24);
   var key=@"Local\AsterHubWidgets-"+instance;
   bool first;
   string restoreKey=key+"-restore-"+build;
   using(var mutex=new Mutex(true,key,out first)) {
    if(!first){
     if(background)return 0;
     if(ActivateMatchingBuild(restoreKey))return 0;
     if(TestMode)File.WriteAllText(Path.Combine(WorkbenchHost.SmokeRoot,"widget-build-conflict.test.txt"),build.Substring(0,8));
     else MessageBox.Show("已有另一版本的小组件在后台运行。请从 Windows 通知区域退出旧小组件，再双击此文件。现有设置不会被覆盖。","Peek · 未启动",MessageBoxButton.OK,MessageBoxImage.Information);
     return 2;
    }
    try {
     using(var restore=new EventWaitHandle(false,EventResetMode.AutoReset,restoreKey)) {
     var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};
     using(var runtime=new WidgetRuntime(app)) {
      var wait=ThreadPool.RegisterWaitForSingleObject(restore,delegate{if(!app.Dispatcher.HasShutdownStarted)app.Dispatcher.BeginInvoke(new Action(runtime.ShowSettings));},null,Timeout.Infinite,false);
      app.SessionEnding+=(s,e)=>runtime.Exit();
      try{if(!background)app.Dispatcher.BeginInvoke(new Action(runtime.ShowSettings));else app.Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle,new Action(runtime.PrepareSettings));return app.Run();}finally{wait.Unregister(null);}
     }
     }
    } finally {mutex.ReleaseMutex();}
   }
  }catch(Exception ex){DiagnosticsLog.Write("widget-startup",ex);if(!background)MessageBox.Show("小组件无法启动："+ex.Message,"Peek");return 1;}
 }
}

internal sealed class WidgetStartup {
 const string RunKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
 const string ValueName="AsterHubWidgets";
 readonly string command="\""+(WidgetHost.LauncherPath??System.Reflection.Assembly.GetExecutingAssembly().Location)+"\" --background";
 // The test data root also isolates login registration from the real account.
 string TestValue {get {return Path.Combine(WorkbenchHost.DataRoot,"widget-startup.test.txt");}}
 internal string Registration {
  get {
   if(WidgetHost.TestMode)return File.Exists(TestValue)?File.ReadAllText(TestValue):null;
   using(var key=Registry.CurrentUser.OpenSubKey(RunKey))return key==null?null:key.GetValue(ValueName) as string;
  }
 }
 internal bool Enabled {
  get {
   if(WidgetHost.TestMode)return File.Exists(TestValue)&&File.ReadAllText(TestValue)==command;
   using(var key=Registry.CurrentUser.OpenSubKey(RunKey))return key!=null&&string.Equals(Convert.ToString(key.GetValue(ValueName)),command,StringComparison.OrdinalIgnoreCase);
  }
 }
 internal void Set(bool enable) {
  if(WidgetHost.TestMode){if(enable)File.WriteAllText(TestValue,command);else if(Enabled)File.Delete(TestValue);return;}
  if(enable){using(var key=Registry.CurrentUser.CreateSubKey(RunKey)){if(key==null)throw new InvalidOperationException("无法打开当前用户的登录启动项");key.SetValue(ValueName,command,RegistryValueKind.String);}}
  else if(Enabled){using(var key=Registry.CurrentUser.OpenSubKey(RunKey,true)){if(key!=null&&string.Equals(Convert.ToString(key.GetValue(ValueName)),command,StringComparison.OrdinalIgnoreCase))key.DeleteValue(ValueName,false);}}
 }
}

internal sealed class WidgetRuntime:IDisposable {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string className,string caption);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 readonly uint pid=(uint)Process.GetCurrentProcess().Id;
 readonly Application app;
 readonly Server device=Storage.LocalServer();
 readonly WidgetStartup startup=new WidgetStartup();
 readonly DeviceCapture capture;
 readonly WidgetAlerts alerts;
 readonly DispatcherTimer alertTimer;
 readonly DispatcherTimer updateTimer;
 PeekUpdateResult updateState=new PeekUpdateResult("idle");
 Task<PeekUpdateResult> updateCheck;
 string notifiedUpdate;
 readonly LocalLightCapture light;
 readonly TaskbarController taskbar;
 readonly System.Windows.Forms.NotifyIcon tray;
 System.Drawing.Icon trayIcon;
 NativeCompactMenu.Menu menu;
 WidgetWindow window;
 WidgetDesktopWindow desktopWindow;
 volatile DesktopPreferences preferences;
 bool closing;string appearanceMode,appliedTheme;
 internal WidgetRuntime(Application application) {
  app=application;
  preferences=DesktopPreferences.Load(); preferences.scale=1;preferences.taskbar.deviceId="local";
  UiLanguage.Set(preferences.language);
  appearanceMode=ReadAppearanceMode();RefreshAppearance();
  preferences.widgetDesktop=(preferences.widgetDesktop??new WidgetDesktopOptions()).Normalize();
  preferences.widgetMonitoring=(preferences.widgetMonitoring??new WidgetMonitoring()).Normalize();
  alerts=new WidgetAlerts(WorkbenchHost.DataRoot);
  capture=new DeviceCapture(null,null,s=>Local.Collect(),1);
  capture.Configure(new[]{device},3,preferences.localIntervalMs);
  light=new LocalLightCapture(null,preferences.localIntervalMs);
  // In isolated UI QA the default run never attaches a second monitor to the desktop.
  var options=preferences.taskbar;
  if(WidgetHost.TestMode&&!WorkbenchHost.SmokeTaskbar){options=options.Normalize();options.enabled=false;}
  taskbar=new TaskbarController(options,Snapshot,()=>Dispatch(ShowSettings),()=>Dispatch(ShowSettings),()=>Dispatch(()=>ShowMenu(true)),(page,revision)=>Dispatch(()=>SelectPage(page,revision)),null,Occupied);
  trayIcon=BrandIcons.Tray(preferences.iconThemeId);
  BrandShortcuts.RegisterPeekSender(preferences.iconThemeId);
  tray=new System.Windows.Forms.NotifyIcon{Icon=trayIcon,Text="Peek",Visible=preferences.widgetTrayVisible};
  alertTimer=new DispatcherTimer{Interval=TimeSpan.FromSeconds(1)};alertTimer.Tick+=(s,e)=>RefreshBackground();alertTimer.Start();
  ConfigureDesktop();
  updateTimer=new DispatcherTimer(DispatcherPriority.Background);
  updateTimer.Tick+=(s,e)=>{updateTimer.Stop();if(!closing&&preferences.widgetAutoCheckUpdates){updateTimer.Interval=TimeSpan.FromHours(24);updateTimer.Start();CheckUpdates(true);}};
  ScheduleUpdates();
  tray.MouseUp+=(s,e)=>{if(e.Button==System.Windows.Forms.MouseButtons.Left)Dispatch(ShowSettings);else if(e.Button==System.Windows.Forms.MouseButtons.Right)Dispatch(()=>ShowMenu(false));};
  app.Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Background,new Action(()=>{if(!closing&&menu==null)WarmMenu();}));
  SystemEvents.UserPreferenceChanged += OnSystemPreferenceChanged;
  DiagnosticsLog.Write("widget-runtime-ready",null);
 }
 bool Occupied(IntPtr parent){
  IntPtr child=IntPtr.Zero;
  for(int i=0;i<16;i++){
   child=FindWindowEx(parent,child,null,"AsterHub Taskbar Monitor");if(child==IntPtr.Zero)return false;
   uint other;GetWindowThreadProcessId(child,out other);if(other!=0&&other!=pid)return true;
  }
  return false;
 }
 void Dispatch(Action action){if(!closing&&!app.Dispatcher.HasShutdownStarted)app.Dispatcher.BeginInvoke(new Action(()=>{if(!closing)action();}));}
 string AppearanceFile{get{return Path.Combine(WorkbenchHost.DataRoot,"window-theme.txt");}}
 string ReadAppearanceMode(){try{string value=File.ReadAllText(AppearanceFile).Trim();return value=="system"||value=="light"?value:"dark";}catch(IOException){return "dark";}catch(UnauthorizedAccessException){return "dark";}}
 static bool SystemAppsLight(){
  if(WidgetHost.TestMode){string file=Path.Combine(WorkbenchHost.DataRoot,"system-app-theme.test.txt");if(File.Exists(file))return File.ReadAllText(file).Trim()=="light";}
  try{return Convert.ToInt32(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize","AppsUseLightTheme",1))!=0;}catch{return BrandIcons.SystemLight();}
 }
 void OnSystemPreferenceChanged(object sender,UserPreferenceChangedEventArgs e){Dispatch(()=>{if(appearanceMode=="system")RefreshAppearance();});}
 void RefreshAppearance(bool force=false){
  string resolved=appearanceMode=="light"||(appearanceMode=="system"&&SystemAppsLight())?"light":"graphite";
  if(!force&&appliedTheme==resolved)return;
  appliedTheme=resolved;NativeWindowTheme.TaskbarDetailDark=appliedTheme!="light";
  if(window!=null)window.ApplyTheme(appearanceMode,appliedTheme);
  if(desktopWindow!=null)ConfigureDesktop();
 }
 internal static NativeWindowTheme.Appearance AppearanceFor(string theme){
  if(theme!="light")return NativeWindowTheme.Current("graphite");
  return new NativeWindowTheme.Appearance{theme="light",mode="light",colors=new Dictionary<string,string>{{"background","#f5f5f5"},{"foreground","#242424"},{"surface","#fafafa"},{"muted","#616161"},{"border","#dcdcdc"}}};
 }
 internal string SetAppearance(string next){
  if(next!="light"&&next!="dark"&&next!="system")throw new ArgumentException("不支持的外观模式");
  if(next==appearanceMode)return next;
  string file=AppearanceFile,temp=file+".new";
  File.WriteAllText(temp,next);if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);
  appearanceMode=next;RefreshAppearance(true);return next;
 }
 internal void SmokeSystemAppearance(){if(!WidgetHost.TestMode)throw new InvalidOperationException("Unsupported command");OnSystemPreferenceChanged(null,null);}
 void WarmMenu(){try{menu=NativeCompactMenu.Prepare();}catch(Exception e){DiagnosticsLog.Write("widget-menu-warmup",e);}}
 void ShowMenu(bool fromTaskbar,bool fromDesktop=false){
  if(menu==null)WarmMenu();if(menu==null)return;
  var items=new List<NativeCompactMenu.Entry>();
  if(fromDesktop)items.Add(new NativeCompactMenu.Entry("\uE711","隐藏监测",ToggleDesktop));
  else{
   items.Add(new NativeCompactMenu.Entry(preferences.taskbar.enabled?"\uE711":"\uE7F4",preferences.taskbar.enabled?"隐藏监测":"显示监测",ToggleDisplay));
   if(!fromTaskbar)items.Add(new NativeCompactMenu.Entry("\uE7F4",preferences.widgetDesktop.enabled?"隐藏桌面监测":"显示桌面监测",ToggleDesktop));
   if(fromTaskbar&&preferences.taskbar.PageCount>1){items.Add(new NativeCompactMenu.Entry("\uE76B","上一页",()=>taskbar.FlipPage(-1)));items.Add(new NativeCompactMenu.Entry("\uE76C","下一页",()=>taskbar.FlipPage(1)));}
  }
  items.Add(new NativeCompactMenu.Entry("\uE713","Peek 设置",ShowSettings));
  items.Add(null);
  items.Add(new NativeCompactMenu.Entry("\uE8AC","退出 Peek",Exit));
  menu.Open(appliedTheme,items,null,true);
 }
 WidgetWindow SettingsWindow(){
  if(window==null){var created=new WidgetWindow(this,appearanceMode,appliedTheme,preferences.iconThemeId);window=created;created.Closed+=(s,e)=>{if(ReferenceEquals(window,created))window=null;};}
  return window;
 }
 internal void PrepareSettings(){if(!closing)SettingsWindow().Prepare();}
 internal void ShowSettings(){if(!closing)SettingsWindow().RequestOpen();}
 void SelectPage(string page,int revision){
  var old=preferences.taskbar;if(old.Revision!=revision||old.PageId(old.page)==page)return;
  try{var next=preferences.Copy();next.taskbar=old.Normalize();if(next.taskbar.SetActive(page)){next.Save();preferences=next;}}catch(Exception ex){DiagnosticsLog.Write("widget-active-page",ex);}
 }
 void ToggleDisplay(){try{var next=preferences.taskbar.Normalize();next.enabled=!next.enabled;SaveTaskbar(next,startup.Enabled,false);}catch(Exception ex){DiagnosticsLog.Write("widget-toggle",ex);tray.ShowBalloonTip(2500,"Peek","无法保存监测设置。",System.Windows.Forms.ToolTipIcon.Warning);}}
 TaskbarSnapshot Snapshot(){var p=preferences;return TaskbarData.Compose(device,capture.Latest(device),capture.IntervalSeconds(device),light.Latest,p.localIntervalMs,p.widgetMonitoring);}
 void ConfigureDesktop(){
  if(!preferences.widgetDesktop.enabled){if(desktopWindow!=null){desktopWindow.Close();desktopWindow=null;}return;}
  if(desktopWindow==null){var created=new WidgetDesktopWindow(WorkbenchHost.DataRoot,ShowSettings,()=>ShowMenu(false,true));desktopWindow=created;created.Closed+=(s,e)=>{if(ReferenceEquals(desktopWindow,created))desktopWindow=null;};}
  desktopWindow.Configure(preferences.widgetDesktop,appliedTheme!="light",preferences.taskbar);
  desktopWindow.RenderSnapshot(Snapshot());
 }
 internal string ProbeNotification(){
  if(!WidgetHost.TestMode||Environment.GetEnvironmentVariable("PEEK_SMOKE_NOTIFY")!="1")throw new InvalidOperationException("Unsupported command");
  BrandShortcuts.RegisterPeekSender(preferences.iconThemeId,true);
  tray.ShowBalloonTip(3500,"内存利用率提醒","76 %",System.Windows.Forms.ToolTipIcon.Info);
  return BrandShortcuts.AppIdFor(BrandShortcuts.Executable);
 }
 void ToggleDesktop(){try{
  var candidate=preferences.Copy();var options=preferences.widgetDesktop.Normalize();options.enabled=!options.enabled;
  candidate.widgetDesktop=options;candidate.Save();preferences=candidate;
  ConfigureDesktop();if(window!=null)window.RefreshParkedDraft();
 }catch(Exception ex){DiagnosticsLog.Write("widget-desktop-toggle",ex);}}
 internal void CaptureDesktopForSmoke(){if(!WidgetHost.TestMode)throw new InvalidOperationException("Unsupported command");if(desktopWindow!=null)desktopWindow.CaptureForSmoke(WorkbenchHost.SmokeRoot);}
 internal object MonitoringState(){
  if(!WidgetHost.TestMode)throw new InvalidOperationException("Unsupported command");
  var sample=light.Latest;return new{fullIntervalMs=capture.IntervalMilliseconds(device),lightIntervalMs=sample==null?0:sample.IntervalMs,desktop=desktopWindow==null?null:desktopWindow.State()};
 }
 void RefreshBackground(){
  var p=preferences;var reading=capture.Latest(device);var fresh=alerts.Observe(reading,p.widgetMonitoring.adapter,DateTime.Now);
  bool notifications=!WidgetHost.TestMode&&p.widgetTrayVisible&&(p.widgetMonitoring.trafficMiB>0||p.widgetMonitoring.memoryPercent>0||p.widgetMonitoring.gpuCelsius>0);
  if(desktopWindow!=null||notifications){
   var snapshot=Snapshot();if(desktopWindow!=null)desktopWindow.RenderSnapshot(snapshot);
   if(notifications)alerts.Evaluate(p.widgetMonitoring,snapshot,fresh,(name,body)=>tray.ShowBalloonTip(3500,name,body,System.Windows.Forms.ToolTipIcon.Info));
  }
 }
 internal object Sources(){
  var latest=capture.Latest(device);var m=latest==null?null:latest.Metrics;
  var adapters=NetworkInterface.GetAllNetworkInterfaces().Where(n=>n.NetworkInterfaceType!=NetworkInterfaceType.Loopback&&n.NetworkInterfaceType!=NetworkInterfaceType.Tunnel)
   .Select(n=>new{id=n.Id,name=n.Name,active=n.OperationalStatus==OperationalStatus.Up}).OrderByDescending(n=>n.active).ThenBy(n=>n.name).ToArray();
  var snapshot=Snapshot();var gpu=snapshot.Read("gpuTemperature");
  return new{adapters,disks=m==null?null:m.Storage.Select(d=>new{id=d.Id,name=d.Name}).ToArray(),volumes=m==null?null:m.Volumes.Select(v=>new{id=v.Path,name=(v.Path+" "+v.Label).Trim()}).ToArray(),
    displays=System.Windows.Forms.Screen.AllScreens.Select(s=>new{id=s.DeviceName,name=s.DeviceName,primary=s.Primary,width=s.Bounds.Width,height=s.Bounds.Height}).ToArray(),
    gpuAvailable=!gpu.stale&&gpu.value.HasValue,trafficBytes=alerts.TodayBytes};
 }
 internal void OpenWindowsTaskbar(){
  if(WidgetHost.TestMode)return;
  using(var process=Process.Start(new ProcessStartInfo{FileName="ms-settings:taskbar",UseShellExecute=true})){}
 }
 internal object SmokeIconState(){
  if(!WidgetHost.TestMode)throw new InvalidOperationException("Unsupported command");
  var image=window==null?null:window.Icon as System.Windows.Media.Imaging.BitmapSource;
  using(var sha=System.Security.Cryptography.SHA256.Create())using(var trayStream=new MemoryStream())using(var titleStream=new MemoryStream()){
   tray.Icon.Save(trayStream);
   if(image!=null){var encoder=new System.Windows.Media.Imaging.PngBitmapEncoder();encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(image));encoder.Save(titleStream);}
   return new{title=window==null?null:window.Title,selected=preferences.iconThemeId,tray=Convert.ToBase64String(sha.ComputeHash(trayStream.ToArray())),caption=Convert.ToBase64String(sha.ComputeHash(titleStream.ToArray()))};
  }
 }
 string UpdateFixture {get{return WidgetHost.TestMode?Path.Combine(WorkbenchHost.SmokeRoot,"peek-update.test.txt"):null;}}
 void ScheduleUpdates(){
  updateTimer.Stop();
  if(preferences.widgetAutoCheckUpdates&&(!WidgetHost.TestMode||File.Exists(UpdateFixture))){updateTimer.Interval=TimeSpan.FromSeconds(2);updateTimer.Start();}
 }
 internal PeekUpdateResult UpdateStatus {get{return updateState;}}
 void PublishUpdate(PeekUpdateResult state){updateState=state;if(window!=null)window.PublishUpdate(state);}
 internal Task<PeekUpdateResult> CheckUpdates(bool automatic=false){
  if(updateCheck!=null&&!updateCheck.IsCompleted)return updateCheck;
  PublishUpdate(new PeekUpdateResult("checking"));
  return updateCheck=RunUpdateCheck(automatic);
 }
 async Task<PeekUpdateResult> RunUpdateCheck(bool automatic){
  PeekUpdateResult result;
  try{result=await Task.Run(()=>{
   var current=Version.Parse(WidgetHost.VersionText);
   string fixture=UpdateFixture;
   if(!File.Exists(fixture))return PeekUpdates.Check(current);
   var lines=File.ReadAllLines(fixture);Thread.Sleep(650);
   return PeekUpdates.Interpret(current,int.Parse(lines[0]),lines.Length>1?lines[1]:null);
  });}catch(Exception ex){DiagnosticsLog.Write("peek-update-check",ex);result=new PeekUpdateResult("error");}
  if(!closing){
   PublishUpdate(result);
   if(automatic&&result.state=="available"&&preferences.widgetAutoCheckUpdates&&tray.Visible&&!WidgetHost.TestMode&&notifiedUpdate!=result.version){
    notifiedUpdate=result.version;
    tray.ShowBalloonTip(4500,"Peek",UiLanguage.Text("发现新版本 ")+"v"+result.version+" · "+UiLanguage.Text("请在关于页查看"),System.Windows.Forms.ToolTipIcon.Info);
   }
  }
  return result;
 }
 internal void OpenReleasePage(){
  if(WidgetHost.TestMode){File.WriteAllText(Path.Combine(WorkbenchHost.SmokeRoot,"peek-open-releases.test.txt"),PeekUpdates.ReleasesUrl);return;}
  using(var process=Process.Start(new ProcessStartInfo{FileName=PeekUpdates.ReleasesUrl,UseShellExecute=true})){}
 }
 internal object Status(){return new{host=taskbar.Status(),snapshot=Snapshot(),systemTheme=BrandIcons.SystemLight()?"light":"dark"};}
 internal object Options(){return new{appInfo=WidgetHost.AppInfo(),taskbar=preferences.taskbar,startup=startup.Enabled,startupNeedsRepair=!startup.Enabled&&!string.IsNullOrWhiteSpace(startup.Registration),trayVisible=preferences.widgetTrayVisible,autoCheckUpdates=preferences.widgetAutoCheckUpdates,iconThemeId=preferences.iconThemeId,language=preferences.language,dataPath=WorkbenchHost.DataRoot,localIntervalMs=preferences.localIntervalMs,monitoring=preferences.widgetMonitoring,desktop=preferences.widgetDesktop};}
 internal object Save(Dictionary<string,object> p,JavaScriptSerializer json){
  var settings=json.Deserialize<TaskbarSettings>(json.Serialize(p["taskbar"]));if(settings==null)throw new ArgumentException("缺少任务栏设置");
  var raw=p["taskbar"] as Dictionary<string,object>;object changed;
  bool activeEdited=raw!=null&&raw.TryGetValue("activePageEdited",out changed)&&Convert.ToBoolean(changed);
  object value;
  bool showTray=p.TryGetValue("trayVisible",out value)?Convert.ToBoolean(value):preferences.widgetTrayVisible;
  bool autoCheck=p.TryGetValue("autoCheckUpdates",out value)?Convert.ToBoolean(value):preferences.widgetAutoCheckUpdates;
  string language=p.TryGetValue("language",out value)?Convert.ToString(value):preferences.language;
  string iconId=p.TryGetValue("iconThemeId",out value)?Convert.ToString(value):preferences.iconThemeId;
  if(!BrandIcons.Ids.Contains(iconId))throw new ArgumentException("不支持的 Peek 图标");
  int interval=p.TryGetValue("localIntervalMs",out value)?Convert.ToInt32(value):preferences.localIntervalMs;
  if(!DesktopPreferences.ValidLocalInterval(interval))throw new ArgumentException("不支持的采样周期");
  var monitoring=p.TryGetValue("monitoring",out value)?json.Deserialize<WidgetMonitoring>(json.Serialize(value)):preferences.widgetMonitoring;
  if(monitoring==null)throw new ArgumentException("缺少采集设置");
  var desktop=p.TryGetValue("desktop",out value)?json.Deserialize<WidgetDesktopOptions>(json.Serialize(value)):preferences.widgetDesktop;
  if(desktop==null)throw new ArgumentException("缺少桌面监测设置");
  SaveTaskbar(settings.Normalize(),Convert.ToBoolean(p["startup"]),activeEdited,showTray,language,interval,monitoring.Normalize(),desktop.Normalize(),iconId,autoCheck);return Options();
 }
 internal object RepairStartup(){
  if(string.IsNullOrWhiteSpace(startup.Registration))throw new InvalidOperationException("请先启用并应用登录启动。");
  startup.Set(true);return Options();
 }
 internal void OpenDataFolder(){
  Directory.CreateDirectory(WorkbenchHost.DataRoot);
  using(var process=Process.Start(new ProcessStartInfo{FileName=WorkbenchHost.DataRoot,UseShellExecute=true})){}
 }
 void SaveTaskbar(TaskbarSettings settings,bool start,bool activeEdited,bool? showTray=null,string language=null,int? localInterval=null,WidgetMonitoring monitoring=null,WidgetDesktopOptions desktop=null,string iconId=null,bool? autoCheckUpdates=null){
  if(settings.deviceId!="local")throw new ArgumentException("独立小组件当前只支持本机。");
  var current=preferences.taskbar;
  if(settings.Revision!=current.Revision)throw new InvalidOperationException("任务栏设置已在托盘更新，请重新打开设置。");
  if(!activeEdited)settings.SetActive(current.PageId(current.page));
  settings.layout["revision"]=checked(current.Revision+1);
  var candidate=preferences.Copy();candidate.taskbar=settings;candidate.widgetTrayVisible=showTray??candidate.widgetTrayVisible;if(language!=null)candidate.language=language=="en"?"en":"zh-CN";
  candidate.localIntervalMs=localInterval??candidate.localIntervalMs;candidate.widgetMonitoring=monitoring??candidate.widgetMonitoring;candidate.widgetDesktop=desktop??candidate.widgetDesktop;
  candidate.iconThemeId=iconId??candidate.iconThemeId;candidate.widgetAutoCheckUpdates=autoCheckUpdates??candidate.widgetAutoCheckUpdates;
  bool autoChanged=preferences.widgetAutoCheckUpdates!=candidate.widgetAutoCheckUpdates;
  bool iconChanged=preferences.iconThemeId!=candidate.iconThemeId;
  bool intervalChanged=preferences.localIntervalMs!=candidate.localIntervalMs;
  bool wasStartup=startup.Enabled;if(start!=wasStartup)startup.Set(start);
  try{candidate.Save();}catch{if(start!=wasStartup)startup.Set(wasStartup);throw;}
  alerts.SettingsChanged(preferences.widgetMonitoring,candidate.widgetMonitoring);
  preferences=candidate;
  if(autoChanged)ScheduleUpdates();
  if(intervalChanged){capture.Configure(new[]{device},3,candidate.localIntervalMs);light.SetInterval(candidate.localIntervalMs);light.RequestRefresh();}
  if(iconChanged){
   var nextIcon=BrandIcons.Tray(candidate.iconThemeId);var oldIcon=trayIcon;
   BrandShortcuts.RegisterPeekSender(candidate.iconThemeId);
   tray.Icon=nextIcon;trayIcon=nextIcon;oldIcon.Dispose();
   if(window!=null)window.ApplyIcon(candidate.iconThemeId);
  }
  tray.Visible=candidate.widgetTrayVisible;UiLanguage.Set(candidate.language);var applied=settings;
  if(WidgetHost.TestMode&&!WorkbenchHost.SmokeTaskbar){applied=settings.Normalize();applied.enabled=false;}
  taskbar.Configure(applied);ConfigureDesktop();
  if(window!=null)window.RefreshParkedDraft();
 }
 internal void Exit(){if(closing)return;closing=true;if(window!=null)window.ClosePermanently();if(desktopWindow!=null)desktopWindow.Close();app.Shutdown();}
 public void Dispose(){closing=true;alertTimer.Stop();updateTimer.Stop();alerts.Flush();if(desktopWindow!=null){desktopWindow.Close();desktopWindow=null;}SystemEvents.UserPreferenceChanged -= OnSystemPreferenceChanged;if(menu!=null)menu.Dispose();tray.Visible=false;tray.Dispose();trayIcon.Dispose();taskbar.Dispose();light.Dispose();capture.Stop(1500);}
}

internal sealed class WidgetWindow:Window {
 const string Origin="https://asterhub.local";
 const double SettingsZoom=1.0;
 [StructLayout(LayoutKind.Sequential)] struct FrameRect { public int Left,Top,Right,Bottom; }
 [DllImport("dwmapi.dll",EntryPoint="DwmGetWindowAttribute")] static extern int DwmFrame(IntPtr hwnd,int attribute,out FrameRect value,int size);
 [DllImport("dwmapi.dll",EntryPoint="DwmGetWindowAttribute")] static extern int DwmNumber(IntPtr hwnd,int attribute,out int value,int size);
 [DllImport("dwmapi.dll")] static extern int DwmFlush();
 readonly WidgetRuntime runtime;
 string mode,theme,icon;
 readonly WebView2 web=new WebView2();
 readonly JavaScriptSerializer json=ArchiveStore.Json();
 bool closed,documentReady,started,initialized,wantsOpen,revealed,cloaking,exiting,faulted;
 int epoch,verifyingEpoch=-1,presentations;
 long openRequestedAt,lastPresentationMs;
 IntPtr hwnd;
 bool Presented {get{return revealed&&IsVisible&&WindowState!=WindowState.Minimized;}}
 internal void Prepare(){
  if(started||closed)return;started=true;ShowActivated=false;ShowInTaskbar=false;
  hwnd=new WindowInteropHelper(this).EnsureHandle();cloaking=PopupCloak.Set(hwnd,true);
  if(!cloaking){WindowStartupLocation=WindowStartupLocation.Manual;Left=-20000;Top=-20000;}
  Show();
 }
 internal void RequestOpen(){
  if(closed)return;openRequestedAt=Stopwatch.GetTimestamp();wantsOpen=true;Prepare();PresentIfReady();
 }
 void PresentIfReady(){
  if(closed||!documentReady||!wantsOpen)return;
  if(!revealed){
   if(!cloaking&&Left<=-20000){var work=SystemParameters.WorkArea;Left=work.Left+(work.Width-Width)/2;Top=work.Top+(work.Height-Height)/2;}
   if(!IsVisible)Show();ShowInTaskbar=true;
   if(cloaking)PopupCloak.Set(hwnd,false);
   revealed=true;
  }
  if(WindowState==WindowState.Minimized)WindowState=WindowState.Normal;
  Activate();PublishVisibility();
  lastPresentationMs=(long)((Stopwatch.GetTimestamp()-openRequestedAt)*1000.0/Stopwatch.Frequency);presentations++;
  DiagnosticsLog.Write("widget-settings-presented",null);
  if(WidgetHost.TestMode)WriteSmokeState("widget-ready.json");
 }
 internal void PublishUpdate(PeekUpdateResult state){
  if(closed||web.CoreWebView2==null||faulted)return;
  web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{type="peek-update",value=state}));
 }
 void PublishVisibility(object reset=null){
  if(closed||web.CoreWebView2==null||faulted)return;
  web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{type="widget-visibility",value=new{visible=Presented,reset,epoch}}));
 }
 internal void RefreshParkedDraft(){
  if(!started||!documentReady||revealed||wantsOpen||faulted)return;
  ResetParkedDraft();
 }
 void ResetParkedDraft(){documentReady=false;epoch++;PublishVisibility(runtime.Options());}
 void Dismiss(){
  if(closed||!revealed)return;
  wantsOpen=false;revealed=false;
  if(faulted){ClosePermanently();return;}
  if(cloaking){PopupCloak.Set(hwnd,true);ShowInTaskbar=false;}
  else Hide();
  if(documentReady)ResetParkedDraft();else PublishVisibility();
 }
 internal void ClosePermanently(){exiting=true;Close();}
 object SmokeState(){return new{pid=Process.GetCurrentProcess().Id,zoom=web.ZoomFactor,documentReady,visible=Presented,epoch,presentations,lastPresentationMs,windowState=WindowState.ToString(),cloaked=PopupCloak.Hidden(this,hwnd)};}
 void WriteSmokeState(string file){File.WriteAllText(Path.Combine(WorkbenchHost.SmokeRoot,file),json.Serialize(SmokeState()));}
 async void AcceptRenderedView(int revision){
  if(closed||faulted||documentReady||revision!=epoch||verifyingEpoch==revision)return;
  verifyingEpoch=revision;
  try{
   using(var frame=new MemoryStream()){
    var capture=web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,frame);
    await capture;
    if(frame.Length==0)throw new InvalidOperationException("设置首帧为空");
   }
   if(closed||faulted||revision!=epoch)return;
   documentReady=true;PublishAppearance(WidgetRuntime.AppearanceFor(theme));
   DiagnosticsLog.Write("widget-settings-ready",null);
   if(WidgetHost.TestMode)WriteSmokeState("widget-prepared.json");
   PresentIfReady();
  }catch(Exception ex){if(!closed){DiagnosticsLog.Write("widget-settings-first-frame",ex);ShowError("无法呈现小组件设置，请关闭后重新打开。\n"+ex.GetBaseException().Message);}}
 }

 internal void ApplyIcon(string id){if(icon==id)return;icon=id;BrandIcons.ApplyWindow(this,id);}
 internal WidgetWindow(WidgetRuntime owner,string selectedMode,string selectedTheme,string iconId){
  runtime=owner;mode=selectedMode;theme=selectedTheme;icon=iconId;Title="Peek";Width=579;Height=639;MinWidth=459;MinHeight=416;
  WindowStartupLocation=WindowStartupLocation.CenterScreen;BrandIcons.ApplyWindow(this,icon);
  ApplyTheme(mode,theme);SourceInitialized+=(s,e)=>{NativeWindowTheme.PreferRoundedCorners(this);ApplyTheme(mode,theme);};
  web.ZoomFactor=SettingsZoom;Content=web;

  Loaded+=async (s,e)=>await Initialize();
  StateChanged+=(s,e)=>{if(revealed&&documentReady)PublishVisibility();};
  Closing+=(s,e)=>{if(!exiting){e.Cancel=true;Dispatcher.BeginInvoke(new Action(Dismiss));}};
  Closed+=(s,e)=>{closed=true;web.Dispose();};
 }
 internal void ApplyTheme(string preference,string selected){
  mode=preference;theme=selected;var appearance=WidgetRuntime.AppearanceFor(selected);
  NativeWindowTheme.ApplyColors(this,appearance);
  var color=NativeWindowTheme.ColorValue(appearance.colors["surface"]);
  web.DefaultBackgroundColor=System.Drawing.Color.FromArgb(255,color.R,color.G,color.B);
  PublishAppearance(appearance);
 }
 object CaptureFrameForSmoke(){
  if(!WidgetHost.TestMode)throw new InvalidOperationException("Unsupported command");
  const int ExtendedFrameBounds=9,WindowCornerPreference=33;
  var handle=new System.Windows.Interop.WindowInteropHelper(this).Handle;
  FrameRect frame;int preference;
  if(DwmFrame(handle,ExtendedFrameBounds,out frame,Marshal.SizeOf(typeof(FrameRect)))!=0)throw new IOException("Native frame bounds are unavailable");
  int cornerResult=DwmNumber(handle,WindowCornerPreference,out preference,sizeof(int));
  int width=frame.Right-frame.Left,height=frame.Bottom-frame.Top,pad=12;
  bool previousTopmost=Topmost;
  try{
   Topmost=true;
   DwmFlush();
   using(var bitmap=new System.Drawing.Bitmap(width+2*pad,height+2*pad)){
    using(var graphics=System.Drawing.Graphics.FromImage(bitmap))graphics.CopyFromScreen(frame.Left-pad,frame.Top-pad,0,0,bitmap.Size);
    bitmap.Save(Path.Combine(WorkbenchHost.SmokeRoot,"widget-native-frame.png"),System.Drawing.Imaging.ImageFormat.Png);
   }
  }finally{Topmost=previousTopmost;}
  return new{cornerResult,preference,width,height,pad,dpi=VisualTreeHelper.GetDpi(this).DpiScaleX,windowStyle=WindowStyle.ToString(),resizeMode=ResizeMode.ToString()};
 }
 void PublishAppearance(NativeWindowTheme.Appearance appearance){
  if(documentReady&&!closed&&web.CoreWebView2!=null)web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{type="widget-appearance",value=new{appearance.theme,appearance.mode,preference=mode}}));
 }
 static bool Trusted(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.Scheme=="https"&&uri.Host=="asterhub.local"&&uri.IsDefaultPort;}
 async Task Initialize(){
  if(initialized||closed)return;initialized=true;
  try{
   var options=new CoreWebView2EnvironmentOptions();
   if(WidgetHost.TestMode&&WorkbenchHost.DebugPort>0)options.AdditionalBrowserArguments="--remote-debugging-address=127.0.0.1 --remote-debugging-port="+WorkbenchHost.DebugPort;
   var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(WorkbenchHost.DataRoot,"WebView"),options);if(closed)return;
   await web.EnsureCoreWebView2Async(env);if(closed)return;
   var core=web.CoreWebView2;
   await core.AddScriptToExecuteOnDocumentCreatedAsync("globalThis.__ASTER_WIDGET=true;globalThis.__ASTER_THEME="+json.Serialize(theme)+";globalThis.__ASTER_WIDGET_MODE="+json.Serialize(mode)+";globalThis.__ASTER_ICON="+json.Serialize(icon)+";globalThis.__ASTER_APPEARANCE="+json.Serialize(WidgetRuntime.AppearanceFor(theme))+";");if(closed)return;
   core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.IsZoomControlEnabled=false;
   core.NavigationStarting+=(s,e)=>{if(!Trusted(e.Uri))e.Cancel=true;};core.NewWindowRequested+=(s,e)=>e.Handled=true;core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;core.DownloadStarting+=(s,e)=>e.Cancel=true;
   core.SetVirtualHostNameToFolderMapping("asterhub.local",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"resources","workbench"),CoreWebView2HostResourceAccessKind.DenyCors);
   core.WebMessageReceived+=HandleMessage;
   core.NavigationCompleted+=(s,e)=>{if(!e.IsSuccess&&!closed)ShowError("设置界面加载失败："+e.WebErrorStatus);};
   core.ProcessFailed+=(s,e)=>{if(!closed)ShowError("设置窗口已断开。后台监测仍在运行，请关闭后重新打开设置。");};
   core.Navigate(Origin+"/index.html");
  }catch(Exception ex){if(!closed){DiagnosticsLog.Write("widget-settings-init",ex);ShowError("无法打开设置，请确认系统已安装 Microsoft Edge WebView2 Runtime。\n"+ex.Message);}}
 }
 void ShowError(string text){faulted=true;documentReady=true;Content=new TextBlock{Text=text,TextWrapping=TextWrapping.Wrap,Margin=new Thickness(24),Foreground=new SolidColorBrush(NativeWindowTheme.ColorValue(WidgetRuntime.AppearanceFor(theme).colors["foreground"]))};PresentIfReady();}
 async void HandleMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e){
  if(closed||!Trusted(e.Source))return;
  string id="";try{
   var msg=json.Deserialize<Dictionary<string,object>>(e.WebMessageAsJson);id=Convert.ToString(msg["id"]);
   object result=null;var method=Convert.ToString(msg["method"]);
   switch(method){
    case "desktop.settings":result=runtime.Options();break;
    case "devices.list":result=new{items=new[]{new{device=new{id="local",isLocal=true,name="本机"}}}};break;
    case "taskbar.status":result=runtime.Status();break;
    case "widget.save":result=runtime.Save((Dictionary<string,object>)msg["params"],json);break;
    case "widget.startup.repair":result=runtime.RepairStartup();break;
    case "widget.smoke.icon-state":result=runtime.SmokeIconState();break;
    case "widget.smoke.desktop.capture":runtime.CaptureDesktopForSmoke();break;
    case "widget.smoke.notify":result=runtime.ProbeNotification();break;
    case "widget.smoke.frame.capture":result=CaptureFrameForSmoke();break;
    case "widget.smoke.monitoring":result=runtime.MonitoringState();break;
    case "widget.sources":result=runtime.Sources();break;
    case "widget.windows.taskbar":runtime.OpenWindowsTaskbar();break;
    case "widget.data.open":runtime.OpenDataFolder();break;
    case "widget.updates.status":result=runtime.UpdateStatus;break;
    case "widget.updates.check":result=await runtime.CheckUpdates();break;
    case "widget.updates.releases":runtime.OpenReleasePage();break;
    case "widget.ready":AcceptRenderedView(Convert.ToInt32(((Dictionary<string,object>)msg["params"])["epoch"]));break;
    case "widget.load-failed":ShowError("无法加载小组件设置。\n"+Convert.ToString(((Dictionary<string,object>)msg["params"])["error"]));break;
    case "widget.close":Dispatcher.BeginInvoke(new Action(Dismiss));break;
    case "widget.smoke.window-state":if(!WidgetHost.TestMode)throw new InvalidOperationException("Unsupported command");result=SmokeState();break;
    case "widget.smoke.minimize":if(!WidgetHost.TestMode)throw new InvalidOperationException("Unsupported command");Dispatcher.BeginInvoke(new Action(()=>WindowState=WindowState.Minimized));break;
    case "widget.appearance":result=runtime.SetAppearance(Convert.ToString(((Dictionary<string,object>)msg["params"])["mode"]));break;
    case "widget.smoke.system-appearance":runtime.SmokeSystemAppearance();break;
    case "widget.smoke.quit":if(!WidgetHost.TestMode)throw new InvalidOperationException("Unsupported command");Dispatcher.BeginInvoke(new Action(runtime.Exit));break;
    default:throw new InvalidOperationException("Unsupported command: "+method);
   }
   if(!closed)web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{id=id,ok=true,result=result}));
  }catch(Exception ex){DiagnosticsLog.Write("widget-settings-request",ex);if(!closed)web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{id=id,ok=false,error=ex.GetBaseException().Message}));}
 }
}
