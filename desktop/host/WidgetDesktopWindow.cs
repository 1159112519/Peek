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
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;


public sealed class WidgetDesktopOptions {
 public bool enabled,topmost=true,clickThrough,locked,allowOutside,hideFullscreen=true,swapNetwork,showUnits=true,showTooltips=true;
 public int columns=3,rows=2,backgroundOpacity=82;
 public string doubleClick="settings",memoryMode="percent";
 public string[] metrics={"cpu","memory","gpu","down","up"},cells;
 public Dictionary<string,WidgetDesktopStyle> modules=new Dictionary<string,WidgetDesktopStyle>();
 public Dictionary<string,object> palette;
 public Dictionary<string,string> labels=new Dictionary<string,string>(),colors=new Dictionary<string,string>();
 internal WidgetDesktopOptions Normalize(){
  var v=(WidgetDesktopOptions)MemberwiseClone();v.columns=DesktopGrid.ClampCount(columns);v.rows=DesktopGrid.ClampCount(rows);v.backgroundOpacity=Math.Max(20,Math.Min(100,backgroundOpacity));
  v.doubleClick=doubleClick=="taskmanager"||doubleClick=="none"?doubleClick:"settings";
  v.memoryMode=memoryMode=="used"||memoryMode=="free"?memoryMode:"percent";
  var source=cells??(metrics??new string[0]).Where(id=>TaskbarSettings.Metrics.Contains(id)).Distinct().ToArray();
  v.cells=new string[9];var seen=new HashSet<string>();
  for(int i=0;i<v.cells.Length&&i<source.Length;i++)if(TaskbarSettings.Metrics.Contains(source[i])&&seen.Add(source[i]))v.cells[i]=source[i];
  if(cells==null&&seen.Count==0)v.cells[0]="cpu";
  v.metrics=v.cells.Where(id=>id!=null).ToArray();
  v.labels=(labels??new Dictionary<string,string>()).Where(p=>TaskbarSettings.Metrics.Contains(p.Key)&&!string.IsNullOrWhiteSpace(p.Value)).ToDictionary(p=>p.Key,p=>p.Value.Trim().Substring(0,Math.Min(12,p.Value.Trim().Length)));
  v.colors=(colors??new Dictionary<string,string>()).Where(p=>TaskbarSettings.Metrics.Contains(p.Key)&&System.Text.RegularExpressions.Regex.IsMatch(p.Value??"","^#[0-9a-fA-F]{6}$")).ToDictionary(p=>p.Key,p=>p.Value);
  v.modules=(modules??new Dictionary<string,WidgetDesktopStyle>()).Where(p=>TaskbarSettings.Metrics.Contains(p.Key)&&p.Value!=null).ToDictionary(p=>p.Key,p=>p.Value.Normalize());
  v.palette=TaskbarSettings.NormalizeColors(palette);
  return v;
 }
}

public sealed class WidgetDesktopStyle {
 public string variant;
 public string[] parts;
 internal WidgetDesktopStyle Normalize(){
  return new WidgetDesktopStyle{variant=new[]{"english","chinese","icon","arrow","short","ram","ssd"}.Contains(variant)?variant:null,
   parts=parts==null?null:parts.Where(p=>p=="number"||p=="bars"||p=="line").Distinct().Take(2).ToArray()};
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
 readonly Action showSettings,showMenu;

 readonly Border surface=new Border{BorderThickness=new Thickness(1)};
 readonly Canvas ink=new Canvas{IsHitTestVisible=false};
 readonly RectangleGeometry mask=new RectangleGeometry(),inkMask=new RectangleGeometry();
 readonly Image[,] cellImages=new Image[3,3];
 WidgetDesktopOptions options;
 TaskbarSettings format;
 TaskbarSnapshot last;
 TaskbarModule[,] modules;
 TaskbarPainter painter;
 readonly TaskbarHistory history=new TaskbarHistory();
 double paintScale;
 float[] origins;
 int[] alphaRow=new int[0];
 double inkLeft=DesktopGrid.InsetX;
 readonly float[] atlasCuts=new float[4];
 readonly double[] columnStops={DesktopGrid.Width(1),DesktopGrid.Width(2),DesktopGrid.Width(3)};
 readonly double[] columnEdges=new double[4];
 Point? press;
 IntPtr handle;
 bool darkSurface;
 string tooltipKey;
 ToolTip tip;

 internal WidgetDesktopWindow(string root,Action showSettings,Action showMenu){
  this.showSettings=showSettings;this.showMenu=showMenu;positionFile=Path.Combine(root,"desktop-widget-position.txt");
  WindowStyle=WindowStyle.None;AllowsTransparency=true;ResizeMode=ResizeMode.NoResize;ShowInTaskbar=false;ShowActivated=false;
  Title="Peek · 桌面组件";WindowStartupLocation=WindowStartupLocation.Manual;Background=Brush(0,0,0,0);SizeToContent=SizeToContent.Manual;
  UseLayoutRounding=true;SnapsToDevicePixels=true;
  var rootView=new Grid{Background=Brush(1,255,255,255),Clip=mask};
  ink.Clip=inkMask;rootView.Children.Add(surface);rootView.Children.Add(ink);Content=rootView;
  for(int r=0;r<3;r++)for(int c=0;c<3;c++){
   var image=new Image{Stretch=Stretch.None,SnapsToDevicePixels=true};RenderOptions.SetBitmapScalingMode(image,BitmapScalingMode.NearestNeighbor);cellImages[r,c]=image;
   Canvas.SetLeft(image,DesktopGrid.InsetX);Canvas.SetTop(image,DesktopGrid.InsetY+r*DesktopGrid.CellHeight);ink.Children.Add(image);
  }
  LoadPosition();
  SourceInitialized+=(s,e)=>{handle=new WindowInteropHelper(this).Handle;ApplyHitTesting();};
  SizeChanged+=(s,e)=>Shape(e.NewSize.Width,e.NewSize.Height);
  PreviewMouseLeftButtonDown+=OnPress;PreviewMouseLeftButtonUp+=(s,e)=>press=null;MouseMove+=OnMove;
  MouseLeave+=(s,e)=>SetTooltip(null);
  MouseRightButtonUp+=OnMenu;
  Closed+=(s,e)=>{if(painter!=null)painter.Dispose();};
 }
 static SolidColorBrush Brush(byte a,byte r,byte g,byte b){var brush=new SolidColorBrush(Color.FromArgb(a,r,g,b));brush.Freeze();return brush;}
 bool Animate{get{return SystemParameters.ClientAreaAnimation&&format!=null&&!format.reduced;}}
 string T(string text){return UiLanguage.Text(text);}
 internal void Configure(WidgetDesktopOptions next,bool useDark,TaskbarSettings taskbar){
  options=next;format=taskbar.CloneForWidgetDesktop();format.memoryMode=options.memoryMode;Topmost=options.topmost;
  if(options.locked||options.clickThrough)press=null;
  ApplyHitTesting();
  if(darkSurface!=useDark){darkSurface=useDark;if(painter!=null){painter.Dispose();painter=null;}}
  byte alpha=(byte)Math.Round(next.backgroundOpacity*255/100.0);
  surface.Background=darkSurface?Brush(alpha,37,37,39):Brush(alpha,252,248,239);
  surface.BorderBrush=darkSurface?Brush(149,99,99,104):Brush(149,213,204,186);
  var colors=TaskbarSettings.Copy(TaskbarSettings.Get(format.layout,"colors"));
  foreach(var pair in next.colors){var parts=TaskbarSettings.Copy(TaskbarSettings.Get(colors,pair.Key));parts["reading"]=pair.Value;colors[pair.Key]=parts;}
  foreach(var entry in next.palette){var parts=TaskbarSettings.Copy(TaskbarSettings.Get(colors,entry.Key));foreach(var part in TaskbarSettings.Copy(entry.Value))parts[part.Key]=part.Value;colors[entry.Key]=parts;}
  format.layout=TaskbarSettings.Copy(format.layout);format.layout["colors"]=colors;
  var seen=new Dictionary<string,TaskbarModule>();
  for(int offset=0;offset<taskbar.PageCount;offset++){
   int page=(taskbar.page+offset)%taskbar.PageCount;
   foreach(var m in taskbar.Modules(page,taskbar.Columns(page)*2,false))if(m!=null&&!seen.ContainsKey(m.Metric))seen.Add(m.Metric,m);
  }
  var slots=(string[])next.cells.Clone();if(next.swapNetwork){int d=Array.IndexOf(slots,"down"),u=Array.IndexOf(slots,"up");if(d>=0&&u>=0){slots[d]="up";slots[u]="down";}}
  modules=new TaskbarModule[3,6];
  for(int i=0;i<slots.Length;i++){
   string id=slots[i];if(id==null)continue;TaskbarModule matched;string label;next.labels.TryGetValue(id,out label);
   var equivalent=seen.TryGetValue(id,out matched)?new Dictionary<string,object>(matched.Data):new Dictionary<string,object>{{"metricId",id},{"name",new Dictionary<string,object>{{"variant",TaskbarModule.DefaultVariant(id)}}},{"parts",new[]{"number"}}};
   if(matched!=null)equivalent["parts"]=matched.Parts;
   WidgetDesktopStyle styled;if(next.modules.TryGetValue(id,out styled)){
    if(styled.variant!=null)equivalent["name"]=new Dictionary<string,object>{{"variant",styled.variant}};
    if(styled.parts!=null&&styled.parts.Length>0)equivalent["parts"]=styled.parts;
   }
   modules[i/3,i%3]=new TaskbarModule(equivalent,false,false,label);
  }
  origins=null;
  Height=DesktopGrid.Height(next.rows);
  if(last!=null)Paint();else Width=DesktopGrid.Width(next.columns);
  if(IsVisible){UpdateLayout();Constrain();}
  SetTooltip(null);
 }
 void Shape(double w,double h){
  double radius=Math.Min(DesktopGrid.SurfaceRadius,Math.Min(h/2,w/2));surface.CornerRadius=new CornerRadius(radius);mask.Rect=new Rect(0,0,Math.Max(0,w),Math.Max(0,h));mask.RadiusX=mask.RadiusY=radius;
  inkMask.Rect=new Rect(inkLeft,DesktopGrid.InsetY,Math.Max(0,w-2*inkLeft),Math.Max(0,h-2*DesktopGrid.InsetY));
 }
 void ApplyHitTesting(){
  if(handle==IntPtr.Zero||options==null)return;long style=GetStyle(handle,-20).ToInt64();
  long next=options.clickThrough?style|NoActivate|Transparent:(style|NoActivate)&~Transparent;
  if(next!=style)SetStyle(handle,-20,(IntPtr)next);
 }
 void OnMenu(object sender,MouseButtonEventArgs e){
  if(options==null)return;
  showMenu();e.Handled=true;
 }
 internal void RenderSnapshot(TaskbarSnapshot snapshot){
  if(options==null||!options.enabled)return;last=snapshot;history.Add(snapshot,false);
  if(options.hideFullscreen&&ForegroundFullscreen()){if(IsVisible)Hide();return;}
  if(!IsVisible){Paint();Show();ApplyHitTesting();Constrain();
   if(Animate)BeginAnimation(UIElement.OpacityProperty,new DoubleAnimation(0,1,TimeSpan.FromMilliseconds(160)){EasingFunction=new CubicEase{EasingMode=EasingMode.EaseOut},FillBehavior=FillBehavior.Stop});
  }else Paint();
 }
 void EnsureBands(){
  if(origins!=null||last==null||modules==null)return;
  if(painter==null){paintScale=1;painter=new TaskbarPainter(1,38,darkSurface);}
  var slots=new TaskbarModule[9];for(int i=0;i<slots.Length;i++)if(i/3<options.rows)slots[i]=modules[i/3,i%3];
  var layout=painter.MeasureDesktopGrid(last,format,slots,options.showUnits);
  // Guard space is only for drawing, never part of the visible gutters. An
  // integer-pixel crop can then compact whole columns without filtering text.
  const float guard=TaskbarPainter.DesktopValueGapLimit+3;
  origins=new float[3];atlasCuts[0]=0;
  for(int c=0;c<3;c++){
   origins[c]=atlasCuts[c]+guard-layout.Left[c];
   atlasCuts[c+1]=origins[c]+layout.Right[c]+guard;
  }
  Height=DesktopGrid.Height(options.rows);
 }
 void Paint(){
  if(last==null||modules==null)return;
  EnsureBands();
  var visual=PresentationSource.FromVisual(this);double scale=visual==null||visual.CompositionTarget==null?paintScale:visual.CompositionTarget.TransformToDevice.M11;if(scale<=0)scale=1;
  if(painter==null||scale!=paintScale){if(painter!=null)painter.Dispose();paintScale=scale;painter=new TaskbarPainter(1,(int)Math.Round(38*scale),darkSurface);}
  var cuts=atlasCuts.Select(v=>(int)Math.Ceiling(v*scale)).ToArray();
  painter.Resize(cuts[options.columns],(int)Math.Round(38*scale));painter.History=history;
  var shifts=painter.DesktopValueShifts(last,format,modules,options.rows,options.columns,(float)scale,options.showUnits,origins);
  var images=new BitmapSource[3];var left=cuts.Skip(1).ToArray();var right=cuts.Take(3).ToArray();
  for(int r=0;r<options.rows;r++){
   var row=new TaskbarModule[6];for(int c=0;c<options.columns;c++)row[c]=modules[r,c];
   if(row.All(item=>item==null))continue;
   using(var drawn=painter.RenderDesktopRow(last,format,row,(float)scale,options.showUnits,origins,shifts[r])){
    int top=(int)Math.Round(2*scale);
    var rect=new System.Drawing.Rectangle(0,top,drawn.Width,Math.Min(drawn.Height-top,(int)Math.Round(DesktopGrid.CellHeight*scale)));
    var data=drawn.LockBits(rect,System.Drawing.Imaging.ImageLockMode.ReadOnly,System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
    try{
     MeasureInk(data.Scan0,data.Stride,rect.Width,rect.Height,cuts,left,right);
     var image=BitmapSource.Create(rect.Width,rect.Height,96*scale,96*scale,PixelFormats.Pbgra32,null,data.Scan0,data.Stride*rect.Height,data.Stride);image.Freeze();images[r]=image;
    }finally{drawn.UnlockBits(data);}
   }
  }
  int margin=(int)Math.Round(DesktopGrid.InsetX*scale),gap=(int)Math.Round(TaskbarSqueezeLayout.MaxGap*scale),x=margin;
  inkLeft=margin/scale;columnEdges[0]=0;
  for(int c=0;c<3;c++){
   bool visible=c<options.columns,hasInk=visible&&right[c]>left[c];
   int span=hasInk?right[c]-left[c]:(int)Math.Round(48*scale);
   for(int r=0;r<3;r++){
    var image=cellImages[r,c];
    if(hasInk&&images[r]!=null&&modules[r,c]!=null){
     var section=new CroppedBitmap(images[r],new Int32Rect(left[c],0,span,images[r].PixelHeight));section.Freeze();image.Source=section;
     Canvas.SetLeft(image,x/scale);
    }else image.Source=null;
   }
   if(visible){x+=span;columnStops[c]=(x+margin)/scale;columnEdges[c+1]=(x-margin+gap*.5)/scale;if(c+1<options.columns)x+=gap;}
  }
  double width=(x+margin)/scale;
  if(Width!=width){Width=width;if(IsVisible){UpdateLayout();Constrain();}}
 }
 void MeasureInk(IntPtr scan,int stride,int width,int height,int[] cuts,int[] left,int[] right){
  if(alphaRow.Length<width)alphaRow=new int[width];
  for(int y=0;y<height;y++){
   Marshal.Copy(IntPtr.Add(scan,y*stride),alphaRow,0,width);
   for(int c=0;c<options.columns;c++){
    for(int x=cuts[c];x<left[c];x++)if((uint)alphaRow[x]>>24>=16){left[c]=x;break;}
    for(int x=cuts[c+1]-1;x>=right[c];x--)if((uint)alphaRow[x]>>24>=16){right[c]=x+1;break;}
   }
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
 void OnMove(object sender,MouseEventArgs e){
  var p=e.GetPosition(this);
  if(options!=null&&options.showTooltips&&modules!=null&&e.LeftButton==MouseButtonState.Released){
   int r=(int)Math.Floor((p.Y-DesktopGrid.InsetY)/DesktopGrid.CellHeight),c=-1;
   double xx=p.X-inkLeft;for(int i=0;i<options.columns;i++)if(xx>=columnEdges[i]&&xx<columnEdges[i+1]){c=i;break;}
   var item=r>=0&&r<options.rows&&c>=0&&c<options.columns?modules[r,c]:null;SetTooltip(item);
  }
  if(!press.HasValue||e.LeftButton!=MouseButtonState.Pressed)return;
  if(Math.Abs(p.X-press.Value.X)<SystemParameters.MinimumHorizontalDragDistance&&Math.Abs(p.Y-press.Value.Y)<SystemParameters.MinimumVerticalDragDistance)return;
  press=null;try{DragMove();Constrain();SavePosition();}catch(InvalidOperationException){}
 }
 void SetTooltip(TaskbarModule item){
  string id=item==null?null:item.Metric;if(id==tooltipKey)return;tooltipKey=id;
  if(tip!=null)tip.IsOpen=false;tip=null;ToolTip=null;
  if(item==null||last==null)return;var display=last.ReadForDisplay(id,format).ConfiguredDisplay(format);
  tip=new ToolTip{Content=item.Label(last.Read(id).label)+" · "+display.Text+(options.showUnits&&display.Unit.Length>0?" "+display.Unit:""),PlacementTarget=this};ToolTip=tip;
 }
 void LoadPosition(){
  double x,y;var a=SystemParameters.WorkArea;Left=Math.Max(a.Left,a.Right-416);Top=a.Top+28;
  try{if(File.Exists(positionFile)){var parts=File.ReadAllText(positionFile).Split('|');if(parts.Length==2&&double.TryParse(parts[0],NumberStyles.Float,CultureInfo.InvariantCulture,out x)&&double.TryParse(parts[1],NumberStyles.Float,CultureInfo.InvariantCulture,out y)&&Math.Abs(x)<100000&&Math.Abs(y)<100000){Left=x;Top=y;}}}
  catch(IOException ex){DiagnosticsLog.Write("desktop-widget-position-read",ex);}
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
  UpdateLayout();var bitmap=new RenderTargetBitmap((int)Math.Ceiling(ActualWidth*paintScale),(int)Math.Ceiling(ActualHeight*paintScale),96*paintScale,96*paintScale,PixelFormats.Pbgra32);
  bitmap.Render((Visual)Content);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));
  using(var stream=File.Create(Path.Combine(root,"desktop-widget.png")))encoder.Save(stream);
 }
 internal object State(){RectN rect=new RectN();if(handle!=IntPtr.Zero)GetWindowRect(handle,out rect);return new{screenLeft=rect.left,screenTop=rect.top,screenRight=rect.right,screenBottom=rect.bottom,visible=IsVisible,topmost=Topmost,clickThrough=options.clickThrough,windowStyle=handle==IntPtr.Zero?0:GetStyle(handle,-20).ToInt64(),columns=options.columns,rows=options.rows,left=Left,top=Top,width=Width,height=Height,columnStops,cells=options.cells};}
}
