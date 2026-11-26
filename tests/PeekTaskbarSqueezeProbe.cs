using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Reflection;

// Drives the packaged native layout and renderer at 60 fps with deterministic
// room changes. This does not use Explorer or manipulate the user's taskbar.
static class PeekTaskbarSqueezeProbe {
 const BindingFlags Flags=BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic;
 static object Make(Assembly a,string type,params object[] args){return Activator.CreateInstance(a.GetType(type,true),Flags,null,args,null);}
 static object Call(object x,string name,params object[] args){return x.GetType().GetMethod(name,Flags).Invoke(x,args);}
 static object Get(object x,string key){return x.GetType().GetField(key,Flags).GetValue(x);}
 static void Set(object x,string key,object v){x.GetType().GetField(key,Flags).SetValue(x,v);}
 static void Require(bool ok,string error){if(!ok)throw new InvalidOperationException(error);}
 static void Main(string[] args){
  string root=Path.GetFullPath(args[0]),outDir=Path.GetFullPath(args[1]);Directory.CreateDirectory(outDir);
  AppDomain.CurrentDomain.AssemblyResolve+=(s,e)=>{foreach(string dir in new[]{"runtime/managed","app/modules"}){string path=Path.Combine(root,dir,new AssemblyName(e.Name).Name+".dll");if(File.Exists(path))return Assembly.LoadFrom(path);}return null;};
  var assembly=Assembly.LoadFrom(Path.Combine(root,"AsterHubWidgets.exe"));
  var settings=Make(assembly,"TaskbarSettings");var sample=Make(assembly,"TaskbarSnapshot");
  string[] ids={"cpu","memory","gpu","down","gpuPower","up"},labels={"CPU","RAM","GPU","↓","PWR","↑"},units={"%","%","%","K/s","W","K/s"};double[] values={79,89,0,169,5,4};
  var slots=new object[6];
  for(int i=0;i<ids.Length;i++){
   var value=Make(assembly,"TaskbarValue");Set(value,"id",ids[i]);Set(value,"label",labels[i]);Set(value,"unit",units[i]);Set(value,"value",(double?)values[i]);Set(value,"decimals",i==5?1:0);((IDictionary)Get(sample,"values"))[ids[i]]=value;
   var module=new Dictionary<string,object>{{"id","probe-"+i},{"metricId",ids[i]},{"name",new Dictionary<string,object>{{"variant","english"},{"text",labels[i]}}},{"parts",new[]{"number"}}};
   slots[i]=new Dictionary<string,object>{{"id","slot-"+i},{"column",i%3},{"row",i/3},{"module",module}};
  }
  Set(settings,"layout",new Dictionary<string,object>{{"activePageId","page-1"},{"pages",new[]{new Dictionary<string,object>{{"id","page-1"},{"grid",new Dictionary<string,object>{{"columns",3},{"rows",2}}},{"slots",slots}}}}});
  const float scale=1.25f;int height=(int)Math.Round(38*scale);
  using(var painter=(IDisposable)Make(assembly,"TaskbarPainter",420,height,false,root)){
   var layout=Call(painter,"MeasurePage",sample,settings,0);
   float full=(float)layout.GetType().GetProperty("FullWidth",Flags).GetValue(layout,null),middle=(float)Call(layout,"Width",2,4f)+2,small=(float)Call(layout,"Width",1,0f)+4;
   var stages=new[]{full,middle,small,full,middle,full};
   var motion=Make(assembly,"TaskbarSqueezeMotion");Call(motion,"Set",full,0L,false);
   var sizes=new[]{16,16,16,16,6,16};long time=0;float[] previousX=null,previousAlpha=null;int frameNumber=0;
   using(var sheet=new Bitmap(455,stages.Length*height*4))using(var g=Graphics.FromImage(sheet))using(var csv=new StreamWriter(Path.Combine(outDir,"frames.csv"))){
    g.Clear(Color.FromArgb(249,249,249));csv.WriteLine("segment,ms,room,x1,x2,x3,alpha1,alpha2,alpha3");
    for(int stage=0;stage<stages.Length;stage++){
     float room=stages[stage];bool squeeze=stage>0&&room<stages[stage-1];Call(motion,"Set",room,time,false);
     for(int i=0;i<sizes[stage];i++,time+=16){
      var frame=Call(motion,"Frame",layout,room,time,false);var x=(float[])Get(frame,"X");var alpha=(float[])Get(frame,"Alpha");
      if(previousX!=null)for(int col=0;col<3;col++){
       Require(squeeze?alpha[col]<=previousAlpha[col]+.001:alpha[col]>=previousAlpha[col]-.001,"Column fades in the wrong direction at "+time);
       if(alpha[col]>.01&&previousAlpha[col]>.01)Require(squeeze?x[col]<=previousX[col]+.001:x[col]>=previousX[col]-.001,"Surviving column bounces at "+time);
      }
      previousX=x;previousAlpha=alpha;
      Call(painter,"Resize",(int)Math.Ceiling(room*scale),height);
      using(var bitmap=(Bitmap)Call(painter,"RenderSqueeze",sample,null,settings,0,1d,frame,scale,0f,false,true)){
       Require(bitmap.Width==(int)Math.Ceiling(room*scale)&&bitmap.Height==height,"Rendered outside the assigned room");
       bitmap.Save(Path.Combine(outDir,string.Format("frame-{0:000}.png",frameNumber++)),ImageFormat.Png);
       if(i==0||i==2||i==4||i==sizes[stage]-1){int row=i==0?0:i==2?1:i==4?2:3;g.DrawImageUnscaled(bitmap,106,(stage*4+row)*height);g.DrawString(string.Format("{0} / {1} ms",stage+1,i*16),SystemFonts.DefaultFont,Brushes.DimGray,8,(stage*4+row)*height+14);}
      }
      csv.WriteLine(string.Join(",",new[]{(float)stage,(float)time,room,x[0],x[1],x[2],alpha[0],alpha[1],alpha[2]}.SelectInvariant()));
     }
     if(stage!=4){int visible=0;foreach(float a in previousAlpha)if(a>.99)visible++;Require(visible==(stage==1?2:stage==2?1:3),"Wrong settled column count for stage "+stage);}
    }
    sheet.Save(Path.Combine(outDir,"motion-contact-sheet.png"));
   }
   Console.WriteLine("Rendered {0} native frames: 3 → 2 → 1 → 3, then mid-squeeze reversal.",frameNumber);
  }
 }
 static string[] SelectInvariant(this float[] numbers){return Array.ConvertAll(numbers,x=>x.ToString("0.###",CultureInfo.InvariantCulture));}
}
