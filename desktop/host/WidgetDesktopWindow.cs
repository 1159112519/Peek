using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Documents;
using System.Windows.Interop;
using System.Windows.Media;

public sealed class WidgetDesktopOptions {
 public bool enabled,topmost=true,clickThrough,locked,allowOutside,hideFullscreen=true,swapNetwork,showUnits=true,showTooltips=true;
 public int fontSize=13;
 public string doubleClick="settings",memoryMode="percent";
 public string[] metrics={"cpu","memory","gpu","down","up"};
 public Dictionary<string,string> labels=new Dictionary<string,string>(),colors=new Dictionary<string,string>();
 internal static readonly string[] MetricIds={"cpu","memory","gpu","storage","down","up","gpuTemperature"};
 internal WidgetDesktopOptions Normalize(){
  var v=(WidgetDesktopOptions)MemberwiseClone();v.fontSize=Math.Max(11,Math.Min(21,fontSize));
  v.doubleClick=doubleClick=="taskmanager"||doubleClick=="none"?doubleClick:"settings";
  v.memoryMode=memoryMode=="used"||memoryMode=="free"?memoryMode:"percent";
  v.metrics=(metrics??new string[0]).Where(id=>MetricIds.Contains(id)).Distinct().ToArray();if(v.metrics.Length==0)v.metrics=new[]{"cpu"};
  v.labels=(labels??new Dictionary<string,string>()).Where(p=>MetricIds.Contains(p.Key)&&!string.IsNullOrWhiteSpace(p.Value)).ToDictionary(p=>p.Key,p=>p.Value.Trim().Substring(0,Math.Min(12,p.Value.Trim().Length)));
  v.colors=(colors??new Dictionary<string,string>()).Where(p=>MetricIds.Contains(p.Key)&&System.Text.RegularExpressions.Regex.IsMatch(p.Value??"","^#[0-9a-fA-F]{6}$")).ToDictionary(p=>p.Key,p=>p.Value);
  return v;
 }
}

internal sealed class WidgetDesktopWindow:Window {
 [StructLayout(LayoutKind.Sequential)]struct RectN {public int left,top,right,bottom;}
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr window,StringBuilder text,int size);
 [DllImport("dwmapi.dll")]static extern int DwmGetWindowAttribute(IntPtr window,int attribute,out RectN rect,int size);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr window,out RectN rect);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]static extern IntPtr GetStyle(IntPtr window,int index);
 [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW")]static extern IntPtr SetStyle(IntPtr window,int index,IntPtr value);
 const long Transparent=0x20,NoActivate=0x08000000;
 readonly string positionFile;
 readonly Action showSettings;
 readonly Border surface;
 readonly StackPanel grid;
 readonly Dictionary<string,TextBlock> labels=new Dictionary<string,TextBlock>(),values=new Dictionary<string,TextBlock>();
 readonly FontFamily type;
 WidgetDesktopOptions options;
 TaskbarSettings format;
 Point? press;
 IntPtr handle;
 double? storedLeft,storedTop;
 bool dark;
 internal WidgetDesktopWindow(string root,Action showSettings){
  this.showSettings=showSettings;positionFile=Path.Combine(root,"desktop-widget-position.txt");
  // A fully opaque surface on a layered HWND so Windows can route mouse-through across processes.
  WindowStyle=WindowStyle.None;AllowsTransparency=true;ResizeMode=ResizeMode.NoResize;ShowInTaskbar=false;ShowActivated=false;
  Title="AsterHub 桌面监测";SizeToContent=SizeToContent.WidthAndHeight;WindowStartupLocation=WindowStartupLocation.Manual;
  UseLayoutRounding=true;SnapsToDevicePixels=true;
  var resources=new Uri(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"resources")+Path.DirectorySeparatorChar,UriKind.Absolute);
  type=new FontFamily(resources,"./fonts/#Taskbar Inter, ./workbench/fonts/#HarmonyOS Sans SC, Segoe UI");
  surface=new Border{BorderThickness=new Thickness(1),Padding=new Thickness(12,8,12,8)};
  grid=new StackPanel();surface.Child=grid;Content=surface;
  LoadPosition();
  SourceInitialized+=(s,e)=>{handle=new WindowInteropHelper(this).Handle;ApplyHitTesting();};
  MouseLeftButtonDown+=OnPress;MouseLeftButtonUp+=(s,e)=>press=null;MouseMove+=OnDrag;
  MouseRightButtonUp+=(s,e)=>showSettings();
 }
 internal void Configure(WidgetDesktopOptions next,bool useDark,TaskbarSettings taskbar){
  options=next;format=taskbar.CloneForWidgetDesktop();format.memoryMode=options.memoryMode;format.hidePercent=false;format.hideNetworkUnit=false;dark=useDark;Topmost=options.topmost;ApplyHitTesting();
  var background=Brush(dark?"#242424":"#fafafa");var border=Brush(dark?"#424242":"#dadada");
  surface.Background=background;surface.BorderBrush=border;Background=background;
  var ids=options.metrics.ToArray();if(options.swapNetwork){int down=Array.IndexOf(ids,"down"),up=Array.IndexOf(ids,"up");if(down>=0&&up>=0){ids[down]="up";ids[up]="down";}}
  grid.Children.Clear();labels.Clear();values.Clear();StackPanel line=null;int index=0;
  foreach(var id in ids){
   if(index++%3==0){line=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Center};grid.Children.Add(line);}
   var row=new Grid{Width=options.fontSize*7,Margin=new Thickness(5,3,5,3)};
   row.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});row.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});
   var label=new TextBlock{FontFamily=type,Foreground=Brush(dark?"#b5b5b5":"#626262"),FontSize=options.fontSize-2,TextTrimming=TextTrimming.CharacterEllipsis,TextAlignment=TextAlignment.Center};
   string color;var foreground=Brush(options.colors.TryGetValue(id,out color)?color:dark?"#f4f4f4":"#242424");
   var value=new TextBlock{Text="—",FontFamily=type,Foreground=foreground,FontSize=options.fontSize,FontWeight=FontWeights.Medium,TextAlignment=TextAlignment.Center,TextTrimming=TextTrimming.CharacterEllipsis};
   Typography.SetNumeralAlignment(value,FontNumeralAlignment.Tabular);
   Grid.SetRow(value,1);row.Children.Add(label);row.Children.Add(value);line.Children.Add(row);labels[id]=label;values[id]=value;
  }
  UpdateLayout();Constrain();
 }
 static SolidColorBrush Brush(string color){var brush=new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));brush.Freeze();return brush;}
 void ApplyHitTesting(){
  if(handle==IntPtr.Zero||options==null)return;
  long style=GetStyle(handle,-20).ToInt64();
  long next=options.clickThrough?style|NoActivate|Transparent:(style|NoActivate)&~Transparent;
  if(next!=style)SetStyle(handle,-20,(IntPtr)next);
 }
 internal void RenderSnapshot(TaskbarSnapshot snapshot){
  if(options==null||!options.enabled)return;
  if(options.hideFullscreen&&ForegroundFullscreen()){if(IsVisible)Hide();return;}
  if(!IsVisible){Show();ApplyHitTesting();Constrain();}
  foreach(var id in values.Keys){
   var sample=snapshot.Read(id);
   string name;labels[id].Text=options.labels.TryGetValue(id,out name)?name:id=="down"?"Download":id=="up"?"Upload":id=="gpuTemperature"?"GPU °C":sample.label;
   var text=snapshot.ReadForDisplay(id,format).ConfiguredDisplay(format);
   string value=text.Text+(options.showUnits&&text.Unit.Length>0?" "+text.Unit:"");
   if(values[id].Text!=value)values[id].Text=value;
   string tip=sample.stale?"—":labels[id].Text+" · "+value;
   values[id].ToolTip=options.showTooltips?tip:null;
  }
 }
 bool ForegroundFullscreen(){
  var front=GetForegroundWindow();if(front==IntPtr.Zero||handle==IntPtr.Zero)return false;
  uint process;GetWindowThreadProcessId(front,out process);if(process==Process.GetCurrentProcess().Id)return false;
  var kind=new StringBuilder(64);GetClassName(front,kind,kind.Capacity);if(kind.ToString()=="Progman"||kind.ToString()=="WorkerW"||kind.ToString().StartsWith("Shell_",StringComparison.Ordinal))return false;
  if(System.Windows.Forms.Screen.FromHandle(front).DeviceName!=System.Windows.Forms.Screen.FromHandle(handle).DeviceName)return false;
  RectN r;if(DwmGetWindowAttribute(front,9,out r,Marshal.SizeOf(typeof(RectN)))!=0&&!GetWindowRect(front,out r))return false;
  var screen=System.Windows.Forms.Screen.FromHandle(front).Bounds;
  return r.left<=screen.Left+2&&r.top<=screen.Top+2&&r.right>=screen.Right-2&&r.bottom>=screen.Bottom-2;
 }
 void OnPress(object sender,MouseButtonEventArgs e){
  if(options==null)return;
  if(e.ClickCount==2){press=null;e.Handled=true;if(options.doubleClick=="settings")showSettings();
   else if(options.doubleClick=="taskmanager"&&!WidgetHost.TestMode)try{using(var process=Process.Start(Path.Combine(Environment.SystemDirectory,"Taskmgr.exe"))){} }catch(Exception ex){DiagnosticsLog.Write("desktop-widget-taskmanager",ex);}return;}
  if(options.locked||options.clickThrough)return;
  press=e.GetPosition(this);
 }
 void OnDrag(object sender,MouseEventArgs e){
  if(!press.HasValue||e.LeftButton!=MouseButtonState.Pressed)return;
  var p=e.GetPosition(this);
  if(Math.Abs(p.X-press.Value.X)<SystemParameters.MinimumHorizontalDragDistance&&Math.Abs(p.Y-press.Value.Y)<SystemParameters.MinimumVerticalDragDistance)return;
  press=null;
  try{DragMove();Constrain();SavePosition();}catch(InvalidOperationException){}
 }
 void LoadPosition(){
  try{if(File.Exists(positionFile)){var v=File.ReadAllText(positionFile).Split('|');double x,y;if(v.Length==2&&double.TryParse(v[0],NumberStyles.Float,CultureInfo.InvariantCulture,out x)&&double.TryParse(v[1],NumberStyles.Float,CultureInfo.InvariantCulture,out y)&&Math.Abs(x)<100000&&Math.Abs(y)<100000){storedLeft=x;storedTop=y;}}}
  catch(IOException ex){DiagnosticsLog.Write("desktop-widget-position-read",ex);}
  var a=SystemParameters.WorkArea;Left=storedLeft??Math.Max(a.Left,a.Right-320);Top=storedTop??a.Top+28;
 }
 internal void Constrain(){
  if(options==null||options.allowOutside)return;
  RectN r;if(handle==IntPtr.Zero||!GetWindowRect(handle,out r))return;
  var work=System.Windows.Forms.Screen.FromHandle(handle).WorkingArea;
  var transform=PresentationSource.FromVisual(this);if(transform==null||transform.CompositionTarget==null)return;
  var fromDevice=transform.CompositionTarget.TransformFromDevice;
  int left=Math.Max(work.Left,Math.Min(r.left,work.Right-(r.right-r.left))),top=Math.Max(work.Top,Math.Min(r.top,work.Bottom-(r.bottom-r.top)));
  var delta=fromDevice.Transform(new Vector(left-r.left,top-r.top));Left+=delta.X;Top+=delta.Y;
 }
 void SavePosition(){try{File.WriteAllText(positionFile,Left.ToString("R",CultureInfo.InvariantCulture)+"|"+Top.ToString("R",CultureInfo.InvariantCulture));}catch(IOException ex){DiagnosticsLog.Write("desktop-widget-position-write",ex);}}
 internal void CaptureForSmoke(string root){
  if(!WidgetHost.TestMode||!IsVisible)return;
  UpdateLayout();var source=PresentationSource.FromVisual(this);double scale=source==null?1:source.CompositionTarget.TransformToDevice.M11;
  var bitmap=new System.Windows.Media.Imaging.RenderTargetBitmap((int)Math.Ceiling(ActualWidth*scale),(int)Math.Ceiling(ActualHeight*scale),96*scale,96*scale,PixelFormats.Pbgra32);
  bitmap.Render(surface);var encoder=new System.Windows.Media.Imaging.PngBitmapEncoder();encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(bitmap));
  using(var stream=File.Create(Path.Combine(root,"desktop-widget.png")))encoder.Save(stream);
 }
 internal object State(){return new{visible=IsVisible,topmost=Topmost,clickThrough=options.clickThrough,windowStyle=handle==IntPtr.Zero?0:GetStyle(handle,-20).ToInt64(),metrics=values.Select(v=>new{id=v.Key,value=v.Value.Text,label=labels[v.Key].Text}).ToArray()};}
}
