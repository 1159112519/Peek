param([int]$ParentPid)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing @"
using System;using System.Drawing;using System.Windows.Forms;
using System.Diagnostics;using System.Runtime.InteropServices;
public sealed class PeekColorQaSwatches:Form {
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 public static void Run(int parent){
  SetThreadDpiAwarenessContext(new IntPtr(-4));
  using(var form=new PeekColorQaSwatches())using(var timer=new Timer{Interval=1000}){
   timer.Tick+=(s,e)=>{try{if(Process.GetProcessById(parent).HasExited)form.Close();}catch(ArgumentException){form.Close();}};
   timer.Start();Application.Run(form);
  }
 }
 PeekColorQaSwatches(){
  Text="Peek QA screen swatches";ShowInTaskbar=false;TopMost=true;FormBorderStyle=FormBorderStyle.None;
  AutoScaleMode=AutoScaleMode.None;StartPosition=FormStartPosition.Manual;
  var display=Screen.PrimaryScreen;foreach(var monitor in Screen.AllScreens)if(!monitor.Primary){display=monitor;break;}
  var b=display.WorkingArea;Bounds=new Rectangle(b.Left+32,b.Top+100,128,54);
 }
 protected override bool ShowWithoutActivation {get{return true;}}
 protected override void OnPaint(PaintEventArgs e){using(var a=new SolidBrush(ColorTranslator.FromHtml("#149571")))using(var b=new SolidBrush(ColorTranslator.FromHtml("#A789E0"))){e.Graphics.FillRectangle(a,0,0,64,54);e.Graphics.FillRectangle(b,64,0,64,54);}}
}
"@
[PeekColorQaSwatches]::Run($ParentPid)
