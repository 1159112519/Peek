using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class PeekExplorerContextProbe {
 [StructLayout(LayoutKind.Sequential)] struct Rect {internal int L,T,R,B;internal int W{get{return R-L;}}internal int H{get{return B-T;}}}
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls,string name);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string name);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent,IntPtr child);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern bool GetCursorPos(out Point at);
 [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] static extern void keybd_event(byte code,byte scan,uint flags,UIntPtr extra);
 static uint Pid(IntPtr h){uint pid;GetWindowThreadProcessId(h,out pid);return pid;}
 static string Class(IntPtr h){var b=new StringBuilder(128);GetClassName(h,b,b.Capacity);return b.ToString();}
 static Rect Box(IntPtr h){Rect r;if(!GetWindowRect(h,out r))throw new InvalidOperationException("Missing HWND "+h);return r;}
 static IntPtr FindOwned(IntPtr parent,string title,uint pid){var h=IntPtr.Zero;while((h=FindWindowEx(parent,h,null,title))!=IntPtr.Zero){if(Pid(h)==pid&&IsWindowVisible(h))return h;}return IntPtr.Zero;}
 static IntPtr Widget(IntPtr shell,uint pid){return FindOwned(shell,"Peek Taskbar Monitor",pid);}
 static void Need(bool pass,string reason){if(!pass)throw new InvalidOperationException(reason);}
 static bool Wait(Func<bool> cond,int millis){var clock=Stopwatch.StartNew();do{if(cond())return true;Thread.Sleep(24);}while(clock.ElapsedMilliseconds<millis);return false;}
 static IntPtr Menu(uint pid){var h=IntPtr.Zero;while((h=FindWindowEx(IntPtr.Zero,h,"#32768",null))!=IntPtr.Zero){if(Pid(h)==pid&&IsWindowVisible(h))return h;}return IntPtr.Zero;}
 static void Right(Point p){Need(SetCursorPos(p.X,p.Y),"SetCursorPos failed");mouse_event(8,0,0,0,UIntPtr.Zero);Thread.Sleep(60);mouse_event(16,0,0,0,UIntPtr.Zero);}
 static void Escape(){keybd_event(27,0,0,UIntPtr.Zero);keybd_event(27,0,2,UIntPtr.Zero);}
 static bool Same(Rect a,Rect b){return a.L==b.L&&a.T==b.T&&a.R==b.R&&a.B==b.B;}
 static void Capture(Rect r,string file){using(var b=new Bitmap(r.W,r.H))using(var g=Graphics.FromImage(b)){g.CopyFromScreen(r.L,r.T,0,0,b.Size);b.Save(file,ImageFormat.Png);}}
 sealed class OutsideTarget:Form {protected override bool ShowWithoutActivation{get{return true;}}}
 [STAThread]
 static int Main(string[] args){try{Run(args);return 0;}catch(Exception ex){for(var e=ex;e!=null;e=e.InnerException)Console.Error.WriteLine(e.GetType().FullName+": "+e.Message);return 1;}}
 static void Run(string[] args){
  uint pid=uint.Parse(args[0]);var exe=Path.GetFullPath(args[1]);var output=Path.GetFullPath(args[2]);Directory.CreateDirectory(output);
  SetThreadDpiAwarenessContext((IntPtr)(-4));
  var locator=Assembly.LoadFrom(exe).GetType("TaskbarLocator",true);
  var shell=(IntPtr)locator.GetMethod("Target",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{args.Length>3?args[3]:""});
  Need(shell!=IntPtr.Zero,"Explorer taskbar not found on the requested display");
  var shellPid=Pid(shell);var bar=Box(shell);
  var menuInteraction=locator.GetMethod("MenuInteraction",BindingFlags.Static|BindingFlags.NonPublic);
  Func<bool> shellPopup=()=> (bool)menuInteraction.Invoke(null,new object[]{shell});
  Point original;GetCursorPos(out original);OutsideTarget outside=null;
  try{
   Need(Wait(()=>{var h=Widget(shell,pid);return h!=IntPtr.Zero&&Pid(h)==pid&&IsWindowVisible(h)&&Box(h).W>40;},12000),"Isolated Peek did not obtain a visible taskbar lane; another widget PID="+Pid(FindWindowEx(shell,IntPtr.Zero,null,"Peek Taskbar Monitor")));
   var widget=Widget(shell,pid);var bounds=Box(widget);
   var work=Screen.PrimaryScreen.WorkingArea;
   outside=new OutsideTarget{Text="Peek QA outside-click target",ShowInTaskbar=false,TopMost=true,StartPosition=FormStartPosition.Manual,Bounds=new Rectangle(work.Left+56,work.Top+work.Height/2,230,84)};
   outside.Show();Application.DoEvents();
   var src=new Point(bounds.L+22,bounds.T+bounds.H/4);
   var target=new Point(bounds.R+16,bar.B-7);
   var hit=WindowFromPoint(target);Need(Pid(hit)==shellPid&&(hit==shell||IsChild(shell,hit)),"Outside point not owned by taskbar");
   for(int i=0;i<6;i++){
    Right(src);Need(Wait(()=>Menu(pid)!=IntPtr.Zero,2500),"No native Peek popup in round "+i);
    var m=Box(Menu(pid));
    if(i==0)Capture(m,Path.Combine(output,"peek-context.png"));
    // Alternate clicks in another taskbar area and clicks on a test-owned window.
    if(i%2==0){var h=WindowFromPoint(target);Need(Pid(h)==shellPid&&(h==shell||IsChild(shell,h)),"Refusing input outside the Explorer taskbar");Right(target);}
    else{
     var r=Box(outside.Handle);var click=new Point(r.L+r.W/2,r.T+r.H/2);
     Need(WindowFromPoint(click)==outside.Handle,"Outside-click target is occluded");
     SetCursorPos(click.X,click.Y);mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);
    }
    Need(Wait(()=>Menu(pid)==IntPtr.Zero,1500),"Outside click did not dismiss the Peek menu in round "+i);
    if(shellPopup()){Escape();Need(Wait(()=>!shellPopup(),2200),"Explorer popup did not close");}
   }
   Right(target);Need(Wait(shellPopup,2600),"Production locator did not recognize the real Explorer taskbar menu; foreground="+Class(GetForegroundWindow()));
   string menuClass=Class(GetForegroundWindow());
   if(!menuClass.StartsWith("Shell_",StringComparison.Ordinal))Capture(Box(GetForegroundWindow()),Path.Combine(output,"explorer-context.png"));
   Capture(bounds,Path.Combine(output,"widget-during-explorer-menu.png"));
   var watch=Stopwatch.StartNew();int count=0;
   while(watch.ElapsedMilliseconds<1600){Need(shellPopup(),"Explorer menu closed during hold sample");Need(Widget(shell,pid)==widget&&IsWindowVisible(widget)&&Same(bounds,Box(widget)),"Peek changed visibility, HWND or geometry while the Explorer menu was open");count++;Thread.Sleep(28);}
   Escape();Need(Wait(()=>!shellPopup(),2500),"Explorer context menu did not dismiss with Escape");
   Need(Widget(shell,pid)==widget&&IsWindowVisible(widget),"Peek did not survive menu dismissal");
   Console.WriteLine("PASS: six real outside-click cycles; Explorer foreground "+menuClass+"; "+count+" unchanged taskbar samples while open.");
  }finally{
   if(Menu(pid)!=IntPtr.Zero||shellPopup())Escape();if(outside!=null)outside.Dispose();SetCursorPos(original.X,original.Y);
  }
 }
}
