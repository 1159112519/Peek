using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// User32 owns layout, input, dismissal and accessibility; no WPF popup or WebView.
internal sealed class PeekNativeMenu : IDisposable {
 internal const int CancelTracking=0x8000+94;
 static volatile bool tracking;
 internal static bool InteractivePopupOpen {get{return tracking;}}
 delegate IntPtr MouseProc(int code,IntPtr message,IntPtr data);
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id,MouseProc callback,IntPtr module,uint thread);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string module);
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,System.Text.StringBuilder name,int size);
 const uint StringItem=0,Separator=0x800,ReturnCommand=0x100,RightButton=2,BottomAlign=0x20;
 [StructLayout(LayoutKind.Sequential)] struct Point {internal int X,Y;}
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr CreatePopupMenu();
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool AppendMenu(IntPtr menu,uint flags,UIntPtr command,string text);
 [DllImport("user32.dll")] static extern uint TrackPopupMenuEx(IntPtr menu,uint flags,int x,int y,IntPtr owner,IntPtr parameters);
 [DllImport("user32.dll")] static extern bool DestroyMenu(IntPtr menu);
 [DllImport("user32.dll")] static extern bool GetCursorPos(out Point position);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool PostMessage(IntPtr window,uint message,IntPtr wparam,IntPtr lparam);
 [DllImport("user32.dll")] static extern bool EndMenu();
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,IntPtr process);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

 internal sealed class Entry {
  internal readonly string Text;
  internal readonly Action Run;
  internal Entry(string text,Action action){Text=text;Run=action;}
 }
 // A top-level, non-visible HWND on Peek's UI thread; not the Explorer taskbar HWND.
 sealed class Owner : NativeWindow {
  readonly Action<int> cancel;
  internal Owner(Action<int> cancel){this.cancel=cancel;CreateHandle(new CreateParams{Caption="Peek native menu owner",Style=unchecked((int)0x80000000),ExStyle=0x80});}
  protected override void WndProc(ref Message message){
   if(message.Msg==CancelTracking){cancel(message.WParam.ToInt32());return;}
   base.WndProc(ref message);
  }
 }
 Owner owner;
 IntPtr outsideHook;
 MouseProc mouseProc;
 uint menuThread;
 int generation;
 readonly System.Text.StringBuilder hitClass=new System.Text.StringBuilder(32);
 bool disposed;
 internal bool IsOpen {get;private set;}
 internal Action Show(IList<Entry> entries,bool abovePointer){
  if(disposed||IsOpen)return null;
  Point cursor;if(!GetCursorPos(out cursor))return null;
  if(owner==null)owner=new Owner(request=>{if(IsOpen&&request==generation)EndMenu();});
  generation=unchecked(generation+1);
  menuThread=GetCurrentThreadId();
  var hwnd=GetForegroundWindow();
  if(hwnd==IntPtr.Zero||GetWindowThreadProcessId(hwnd,IntPtr.Zero)!=menuThread)hwnd=owner.Handle;
  var popup=CreatePopupMenu();
  if(popup==IntPtr.Zero)throw new Win32Exception();
  uint selected=0;
  IsOpen=true;
  try{
   for(int i=0;i<entries.Count;i++){
    var entry=entries[i];
    if(!AppendMenu(popup,entry==null?Separator:StringItem,entry==null?UIntPtr.Zero:new UIntPtr((uint)i+1),entry==null?null:entry.Text))
     throw new Win32Exception();
   }
   // Notification-area popups need the foreground owner and a message after tracking;
   // otherwise clicking elsewhere may not dismiss them or the next open can vanish.
   // The taskbar overlay never activates; Windows may refuse foreground here.
   // While tracking, also observe (but never swallow) physical clicks outside this menu.
   bool activated=SetForegroundWindow(hwnd);
   mouseProc=OutsideMouse;
   outsideHook=SetWindowsHookEx(14,mouseProc,GetModuleHandle(null),0);
   if(outsideHook==IntPtr.Zero&&!activated&&GetForegroundWindow()!=hwnd)return null;
   tracking=true;
   selected=TrackPopupMenuEx(popup,ReturnCommand|RightButton|(abovePointer?BottomAlign:0),cursor.X,cursor.Y,hwnd,IntPtr.Zero);
   PostMessage(hwnd,0,IntPtr.Zero,IntPtr.Zero); // WM_NULL
  }finally{
   tracking=false;
   if(outsideHook!=IntPtr.Zero){UnhookWindowsHookEx(outsideHook);outsideHook=IntPtr.Zero;}
   mouseProc=null;
   DestroyMenu(popup);IsOpen=false;
   if(disposed)DestroyOwner();
  }
  return !disposed&&selected>0&&selected<=entries.Count&&entries[(int)selected-1]!=null?entries[(int)selected-1].Run:null;
 }
 static bool IsPointerDown(int message){return message==0x201||message==0x204||message==0x207||message==0x20B;}
 IntPtr OutsideMouse(int code,IntPtr message,IntPtr data){
  if(code>=0&&tracking&&IsPointerDown(message.ToInt32())){
   // MSLLHOOKSTRUCT starts with screen coordinates. Do not cancel clicks inside
   // this thread's own Win32 popup, including a submenu or its non-client area.
   var hit=WindowFromPoint(new Point{X=Marshal.ReadInt32(data),Y=Marshal.ReadInt32(data,4)});
   if(hit==IntPtr.Zero||GetWindowThreadProcessId(hit,IntPtr.Zero)!=menuThread||
      GetClassName(hit,hitClass,hitClass.Capacity)==0||hitClass.ToString()!="#32768")
    PostMessage(owner.Handle,CancelTracking,(IntPtr)generation,IntPtr.Zero);
  }
  return CallNextHookEx(outsideHook,code,message,data);
 }
 void DestroyOwner(){if(owner!=null){owner.DestroyHandle();owner=null;}}
 public void Dispose(){disposed=true;if(IsOpen)EndMenu();else DestroyOwner();}
}
