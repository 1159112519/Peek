using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
internal static class NativeWidgetInput {
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern void mouse_event(int flags,int x,int y,int data,UIntPtr extra);
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls,string title);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string title);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] struct Box { public int left,top,right,bottom; }
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Box box);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,System.Text.StringBuilder text,int n);
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point at);
 [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
 static string Class(IntPtr h){var s=new System.Text.StringBuilder(256);GetClassName(h,s,s.Capacity);return s.ToString();}
 static int Main(){SetProcessDPIAware();string line;
  while((line=Console.ReadLine())!=null){var a=line.Split('|');try{
   if(a[0]=="foreground"){Point pt;GetCursorPos(out pt);Console.WriteLine("ok|"+pt.X+","+pt.Y+","+Class(WindowFromPoint(pt))+","+Class(GetForegroundWindow()));continue;}
   if(a[0]=="window"){
    var parent=a[1]=="taskbar"?FindWindow("Shell_TrayWnd",null):IntPtr.Zero;
    var hwnd=a[1]=="shell"?FindWindow("Shell_TrayWnd",null):parent!=IntPtr.Zero?FindWindowEx(parent,IntPtr.Zero,null,"AsterHub Taskbar Monitor"):FindWindow(null,"AsterHub menu");
    uint pid;GetWindowThreadProcessId(hwnd,out pid);if(a.Length>2){Console.WriteLine("ok|"+pid);continue;}
    Box b;Console.WriteLine("ok|"+(IsWindowVisible(hwnd)&&GetWindowRect(hwnd,out b)?hwnd+","+b.left+","+b.top+","+b.right+","+b.bottom:"hidden"));continue;
   }
   else if(a[0]=="goto"){if(!SetCursorPos(int.Parse(a[1]),int.Parse(a[2])))throw new Exception("SetCursorPos failed");}
   else if(a[0]=="down")mouse_event(2,0,0,0,UIntPtr.Zero);
   else if(a[0]=="up")mouse_event(4,0,0,0,UIntPtr.Zero);
   else if(a[0]=="right"){mouse_event(8,0,0,0,UIntPtr.Zero);Thread.Sleep(65);mouse_event(16,0,0,0,UIntPtr.Zero);}
   else if(a[0]=="escape")System.Windows.Forms.SendKeys.SendWait("{ESC}");
   else if(a[0]=="capture"){
    var screen=System.Windows.Forms.Screen.PrimaryScreen.Bounds;
    var r=new Rectangle(Math.Max(screen.Left,screen.Right-510),Math.Max(screen.Top,screen.Bottom-400),Math.Min(510,screen.Width),Math.Min(400,screen.Height));
    if(a.Length==6)r=new Rectangle(int.Parse(a[2]),int.Parse(a[3]),int.Parse(a[4]),int.Parse(a[5]));
    using(var bitmap=new Bitmap(r.Width,r.Height))using(var g=Graphics.FromImage(bitmap)){g.CopyFromScreen(r.Location,Point.Empty,r.Size);bitmap.Save(a[1],ImageFormat.Png);}
   }else if(a[0]=="exit")return 0;
   Thread.Sleep(35);Console.WriteLine("ok");
  }catch(Exception ex){Console.WriteLine("error:"+ex.Message);}}
  return 0;
 }
}
