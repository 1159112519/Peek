using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// User32 owns layout, input, dismissal and accessibility; no WPF popup or WebView.
internal sealed class PeekNativeMenu : IDisposable {
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
  internal Owner(){CreateHandle(new CreateParams{Caption="Peek native menu owner",Style=unchecked((int)0x80000000),ExStyle=0x80});}
 }
 Owner owner;
 bool disposed;
 internal bool IsOpen {get;private set;}
 internal Action Show(IList<Entry> entries,bool abovePointer){
  if(disposed||IsOpen)return null;
  Point cursor;if(!GetCursorPos(out cursor))return null;
  IntPtr hwnd=GetForegroundWindow();
  if(hwnd==IntPtr.Zero||GetWindowThreadProcessId(hwnd,IntPtr.Zero)!=GetCurrentThreadId()){
   if(owner==null)owner=new Owner();
   hwnd=owner.Handle;
  }
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
   SetForegroundWindow(hwnd);
   selected=TrackPopupMenuEx(popup,ReturnCommand|RightButton|(abovePointer?BottomAlign:0),cursor.X,cursor.Y,hwnd,IntPtr.Zero);
   PostMessage(hwnd,0,IntPtr.Zero,IntPtr.Zero); // WM_NULL
  }finally{
   DestroyMenu(popup);IsOpen=false;
   if(disposed)DestroyOwner();
  }
  return !disposed&&selected>0&&selected<=entries.Count&&entries[(int)selected-1]!=null?entries[(int)selected-1].Run:null;
 }
 void DestroyOwner(){if(owner!=null){owner.DestroyHandle();owner=null;}}
 public void Dispose(){disposed=true;if(IsOpen)EndMenu();else DestroyOwner();}
}
