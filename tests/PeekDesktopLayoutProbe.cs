using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

// Run the payload's real WPF window on deterministic readings, without changing
// its collectors or exposing a fixture API in the packaged application.
public sealed class PeekDesktopLayoutProbe {
 const BindingFlags Flags=BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic;
 static void Set(object x,string name,object value){x.GetType().GetField(name,Flags).SetValue(x,value);}
 static object Read(object x,string name){return x.GetType().GetField(name,Flags).GetValue(x);}
 static object Call(object x,string name,params object[] args){return x.GetType().GetMethod(name,Flags).Invoke(x,args);}
 static object Create(Assembly a,string name,params object[] args){return Activator.CreateInstance(a.GetType(name,true),Flags,null,args,null);}
 [STAThread] public static void Main(string[] args){
  string payload=Path.GetFullPath(args[0]),output=Path.GetFullPath(args[1]);Directory.CreateDirectory(output);
  if(!String.Equals(AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar),payload.TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase))throw new ArgumentException("Run the fixture executable from beside the payload host so it uses the packaged fonts.");
  AppDomain.CurrentDomain.AssemblyResolve+=(sender,e)=>{
   var name=new AssemblyName(e.Name).Name+".dll";
   foreach(var folder in new[]{"runtime/managed","app/modules"}){var file=Path.Combine(payload,folder,name);if(File.Exists(file))return Assembly.LoadFrom(file);}
   return null;
  };
  try{Run(payload,output);}catch(Exception e){Console.Error.WriteLine(e);Environment.ExitCode=1;}
 }
 static void Run(string payload,string output){
  var a=Assembly.LoadFrom(Path.Combine(payload,"AsterHubWidgets.exe"));
  foreach(bool dark in new[]{false,true}){
   Capture(a,output,dark,"han",new[]{"cpu","memory","gpu",null,null,null,null,null,null},new[]{"CPU","内存","显卡"},new[]{"%","%","%"},new double?[]{63,89,null},new[]{0,0,0},1);
   Capture(a,output,dark,"han-used",new[]{"cpu","memoryUsed","gpu",null,null,null,null,null,null},new[]{"CPU","已用","显卡"},new[]{"%","GB","%"},new double?[]{63,13.9,null},new[]{0,1,0},1);
   Capture(a,output,dark,"columns",new[]{"cpu","memoryUsed","gpu","down","memory","up","ping","gpuPower","loss"},new[]{"CPU","RAM","GPU","↓","RAM","↑","Ping","PWR","Loss"},new[]{"%","GB","%","K/s","%","K/s","ms","W","%"},new double?[]{79,12.8,0,169,89,4,23,5,0},new[]{0,1,0,0,0,1,0,0,0},3);
   Capture(a,output,dark,"align",new[]{"memoryUsed","cpu","gpu","down","gpuMemory","storageRead","up","cpuFrequency","storageWrite"},new[]{"RAM","CPU","GPU","↓","VRAM","R","↑","CPU","W"},new[]{"GB","%","%","K/s","%","K/s","K/s","GHz","M/s"},new double?[]{13.7,24,0,160.5,8,230,9.9,4.7,1.1},new[]{1,0,0,1,0,0,1,1,1},3);
   Capture(a,output,dark,"digits",new[]{"cpu","memoryUsed","gpu","down","memory","up",null,null,null},new[]{"CPU","RAM","GPU","↓","RAM","↑"},new[]{"%","GB","%","K/s","%","K/s"},new double?[]{63,13.9,null,null,88,null},new[]{0,1,0,0,0,0},2);
  }
 }
 static void Capture(Assembly a,string output,bool dark,string tag,string[] ids,string[] labels,string[] units,double?[] values,int[] decimals,int rows){
  var options=Create(a,"WidgetDesktopOptions");var settings=Create(a,"TaskbarSettings");var snapshot=Create(a,"TaskbarSnapshot");
  Set(options,"enabled",true);Set(options,"hideFullscreen",false);Set(options,"rows",rows);Set(options,"cells",ids);Set(settings,"reduced",true);
  var names=(IDictionary)Read(options,"labels");
  for(int i=0;i<labels.Length;i++){
   string id=ids[i];names[id]=labels[i];var sample=Create(a,"TaskbarValue");
   Set(sample,"id",id);Set(sample,"label",labels[i]);Set(sample,"value",values[i]);Set(sample,"unit",units[i]);Set(sample,"decimals",decimals[i]);((IDictionary)Read(snapshot,"values"))[id]=sample;
  }
  var window=(Window)Create(a,"WidgetDesktopWindow",output,(Action)(()=>{}),(Action)(()=>{}));
  try{
   Call(window,"Configure",Call(options,"Normalize"),dark,settings);Call(window,"RenderSnapshot",snapshot);Call(window,"RenderSnapshot",snapshot);window.UpdateLayout();
   var content=(Visual)window.Content;var dpi=PresentationSource.FromVisual(content).CompositionTarget.TransformToDevice.M11;
   var bitmap=new RenderTargetBitmap((int)Math.Ceiling(window.ActualWidth*dpi),(int)Math.Ceiling(window.ActualHeight*dpi),96*dpi,96*dpi,PixelFormats.Pbgra32);
   bitmap.Render(content);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));
   var file=Path.Combine(output,tag+(dark?"-dark.png":"-light.png"));using(var stream=File.Create(file))encoder.Save(stream);
   Console.WriteLine("{0} dpi={1:0.##} pixels={2}x{3}",file,dpi,bitmap.PixelWidth,bitmap.PixelHeight);
  } finally{window.Close();}
 }
}
