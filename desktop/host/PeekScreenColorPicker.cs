using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Capture once in physical screen pixels. No image leaves this process or is written to disk.
internal sealed class PeekScreenColorPicker : Form {
 sealed class WindowOwner : IWin32Window {
  public IntPtr Handle{get;private set;}
  internal WindowOwner(IntPtr hwnd){Handle=hwnd;}
 }
 [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
 [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window,IntPtr dc);
 [DllImport("gdi32.dll",SetLastError=true)] static extern bool BitBlt(IntPtr dst,int x,int y,int w,int h,IntPtr src,int sx,int sy,uint flags);
 static void Capture(Rectangle bounds,Bitmap bitmap){
  var src=GetDC(IntPtr.Zero);if(src==IntPtr.Zero)throw new InvalidOperationException("Screen unavailable");
  try{using(var g=Graphics.FromImage(bitmap)){
   var dst=g.GetHdc();
   try{if(!BitBlt(dst,0,0,bounds.Width,bounds.Height,src,bounds.Left,bounds.Top,0x40CC0020))throw new Win32Exception();}
   finally{g.ReleaseHdc(dst);}
  }}finally{ReleaseDC(IntPtr.Zero,src);}
 }
 readonly Bitmap screen;
 string selected;
 PeekScreenColorPicker(Rectangle bounds,Bitmap image){
  Text="Peek screen color picker";screen=image;AutoScaleMode=AutoScaleMode.None;FormBorderStyle=FormBorderStyle.None;
  StartPosition=FormStartPosition.Manual;Bounds=bounds;ShowInTaskbar=false;TopMost=true;KeyPreview=true;Cursor=Cursors.Cross;
  SetStyle(ControlStyles.Opaque|ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint,true);
 }
 protected override void OnPaint(PaintEventArgs e){
  e.Graphics.DrawImageUnscaledAndClipped(screen,ClientRectangle);
 }
 protected override void OnMouseUp(MouseEventArgs e){
  if(e.Button==MouseButtons.Right){DialogResult=DialogResult.Cancel;return;}
  if(e.Button!=MouseButtons.Left||e.X<0||e.Y<0||e.X>=screen.Width||e.Y>=screen.Height)return;
  var c=screen.GetPixel(e.X,e.Y);selected=String.Format("#{0:X2}{1:X2}{2:X2}",c.R,c.G,c.B);
  DialogResult=DialogResult.OK;
 }
 protected override bool ProcessCmdKey(ref Message message, Keys key){
  if(key==Keys.Escape){DialogResult=DialogResult.Cancel;return true;}
  return base.ProcessCmdKey(ref message,key);
 }
 internal static string Pick(IntPtr owner){
  Rectangle bounds=SystemInformation.VirtualScreen;
  using(var bitmap=new Bitmap(bounds.Width,bounds.Height,PixelFormat.Format24bppRgb)){
   Capture(bounds,bitmap);
   using(var dialog=new PeekScreenColorPicker(bounds,bitmap))using(var timer=new Timer{Interval=60000}){
    timer.Tick+=(s,e)=>dialog.DialogResult=DialogResult.Cancel;timer.Start();
    // ShowDialog keeps keyboard/focus routing on the same UI thread and makes other settings inert.
    return dialog.ShowDialog(new WindowOwner(owner))==DialogResult.OK?dialog.selected:null;
   }
  }
 }
}
