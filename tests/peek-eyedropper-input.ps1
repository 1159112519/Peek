param([int]$PeekPid,[string]$Hex,[ValidateSet('Click','Escape','Probe','Open')][string]$Action='Click',[int]$X,[int]$Y)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @"
using System;using System.Drawing;using System.Runtime.InteropServices;using System.Text;using System.Threading;
public static class PeekPickerInput {
 [StructLayout(LayoutKind.Sequential)] struct Point{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] struct Rect{public int L,T,R,B;}
 delegate bool EnumProc(IntPtr hwnd,IntPtr context);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc func,IntPtr context);
 [DllImport("user32.dll")]static extern int GetWindowThreadProcessId(IntPtr hwnd,out int pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int cap);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr hwnd,out Rect r);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
 [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
 [DllImport("user32.dll")]static extern bool ClientToScreen(IntPtr hwnd,ref Point p);
 [DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]static extern bool ScreenToClient(IntPtr hwnd,ref Point p);
 [DllImport("user32.dll")]static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpi);
 [DllImport("user32.dll")]static extern void mouse_event(int flags,int x,int y,int data,UIntPtr extra);
 [DllImport("user32.dll")]static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr wp,IntPtr lp);
 static IntPtr Find(int pid,string title){IntPtr h=IntPtr.Zero;EnumWindows((w,x)=>{int p;GetWindowThreadProcessId(w,out p);if(p!=pid||!IsWindowVisible(w))return true;var text=new StringBuilder(128);GetWindowText(w,text,128);if(text.ToString()!=title)return true;h=w;return false;},IntPtr.Zero);return h;}
 public static string Run(int pid,string color,string action,int x,int y){
  SetThreadDpiAwarenessContext(new IntPtr(-4));
  bool probe=action=="Probe",escape=action=="Escape",open=action=="Open";
  string title=probe?"Peek QA screen swatches":open?"Peek":"Peek screen color picker";
  IntPtr hwnd=IntPtr.Zero;for(int i=0;i<45&&hwnd==IntPtr.Zero;i++){hwnd=Find(pid,title);if(hwnd==IntPtr.Zero)Thread.Sleep(100);}
  if(hwnd==IntPtr.Zero)throw new Exception(probe?"Native test swatch window not found":"Native picker did not appear");
  Thread.Sleep(250);
  Rect r;GetWindowRect(hwnd,out r);
  if(open){
   if(!SetWindowPos(hwnd,new IntPtr(-1),0,0,0,0,0x13))throw new Exception("Could not raise isolated Peek settings");
   Thread.Sleep(120);Point p=new Point{X=x,Y=y};
   if(!ClientToScreen(hwnd,ref p))throw new Exception("Cannot map Peek button point");
   IntPtr root=GetAncestor(WindowFromPoint(p),2);
   if(root!=hwnd||!SetCursorPos(p.X,p.Y)){int other;GetWindowThreadProcessId(root,out other);throw new Exception(String.Format("Pipette point {0},{1} misses isolated Peek {2}; hit PID {3}",p.X,p.Y,pid,other));}
   mouse_event(2,0,0,0,UIntPtr.Zero);Thread.Sleep(35);mouse_event(4,0,0,0,UIntPtr.Zero);
   return "Clicked pipette in settings";
  }
  if(probe){
   // Use the actual compositor color from a separate native test window.
   int px=color=="#149571"?(r.L*3+r.R)/4:(r.L+r.R*3)/4,py=(r.T+r.B)/2;
   if(WindowFromPoint(new Point{X=px,Y=py})!=hwnd)throw new Exception("The test swatches are obscured");
   using(var bmp=new Bitmap(1,1)){
    using(var g=Graphics.FromImage(bmp))g.CopyFromScreen(px,py,0,0,bmp.Size);
    var c=bmp.GetPixel(0,0);var expected=ColorTranslator.FromHtml(color);
    if(Math.Abs(c.R-expected.R)+Math.Abs(c.G-expected.G)+Math.Abs(c.B-expected.B)>24)throw new Exception(String.Format("Expected swatch {0}, saw #{1:X2}{2:X2}{3:X2}",color,c.R,c.G,c.B));
    return String.Format("{0},{1},#{2:X2}{3:X2}{4:X2}",px,py,c.R,c.G,c.B);
   }
  }
   if(escape){
   // Target only the verified picker HWND, even if another desktop app takes focus.
   if(!PostMessage(hwnd,0x100,(IntPtr)27,(IntPtr)0x00010001))throw new Exception("Could not queue Escape for the isolated picker");
   PostMessage(hwnd,0x101,(IntPtr)27,new IntPtr(unchecked((int)0xC0010001)));
  }
  else{
   if(x<r.L||x>=r.R||y<r.T||y>=r.B)throw new Exception("Reference swatch outside picker");
   if(WindowFromPoint(new Point{X=x,Y=y})!=hwnd)throw new Exception("Reference point did not hit the native picker");
   using(var bmp=new Bitmap(1,1)){
    using(var g=Graphics.FromImage(bmp))g.CopyFromScreen(x,y,0,0,bmp.Size);
    var c=bmp.GetPixel(0,0);var rendered=String.Format("#{0:X2}{1:X2}{2:X2}",c.R,c.G,c.B);
    if(rendered!=color)throw new Exception(String.Format("Frozen picker pixel {0},{1} was {2}, expected {3}; window {4},{5},{6},{7}",x,y,rendered,color,r.L,r.T,r.R,r.B));
   }
   // The real captured pixel is checked above. Send its native client coordinates
   // directly to the verified picker so the shared desktop pointer can stay untouched.
   Point target=new Point{X=x,Y=y};if(!ScreenToClient(hwnd,ref target))throw new Exception("Cannot map the captured pixel");
   var coordinates=new IntPtr((target.X&0xffff)|(target.Y<<16));
   if(!PostMessage(hwnd,0x201,(IntPtr)1,coordinates)||!PostMessage(hwnd,0x202,IntPtr.Zero,coordinates))throw new Exception("Could not send sample to the isolated picker");
  }
  for(int i=0;i<35;i++){if(Find(pid,title)==IntPtr.Zero)return escape?"Canceled":color;Thread.Sleep(100);}
  int fg;GetWindowThreadProcessId(GetForegroundWindow(),out fg);
  throw new Exception("Native picker did not dismiss. Foreground is Peek: "+(fg==pid));
 }
}
"@
[PeekPickerInput]::Run($PeekPid,$Hex,$Action,$X,$Y)