param([Parameter(Mandatory=$true)][string]$Out,[string]$WizardDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class PeekSetupIconBuilder {
 static byte[] Frame(int n,bool usePng=false){
  using(var bmp=new Bitmap(n,n,PixelFormat.Format32bppArgb)){
   using(var g=Graphics.FromImage(bmp))using(var tile=new GraphicsPath())using(var wave=new GraphicsPath()){
    g.SmoothingMode=SmoothingMode.AntiAlias;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.ScaleTransform(n/256f,n/256f);
    const int a=8,b=248,d=114;
    tile.AddArc(a,a,d,d,180,90);tile.AddArc(b-d,a,d,d,270,90);
    tile.AddArc(b-d,b-d,d,d,0,90);tile.AddArc(a,b-d,d,d,90,90);tile.CloseFigure();
    using(var fill=new SolidBrush(Color.FromArgb(227,239,231)))g.FillPath(fill,tile);
    using(var outline=new Pen(Color.FromArgb(159,191,174),n<=24?12:6))g.DrawPath(outline,tile);
    wave.AddBezier(48,147,64,147,64,123,78,123);wave.AddBezier(78,123,92,123,89,173,106,173);
    wave.AddBezier(106,173,123,173,119,76,137,76);wave.AddBezier(137,76,155,76,148,153,165,153);
    wave.AddBezier(165,153,179,153,178,120,192,120);wave.AddLine(192,120,208,120);
    using(var stroke=new Pen(Color.FromArgb(26,105,87),n<=24?27:23){StartCap=LineCap.Round,EndCap=LineCap.Round,LineJoin=LineJoin.Round})g.DrawPath(stroke,wave);
   }
   if(n==256||usePng){using(var png=new MemoryStream()){bmp.Save(png,ImageFormat.Png);return png.ToArray();}}
   // Native 32-bpp ICO DIBs for the small frames: no PNG-to-legacy-icon fallback.
   int stride=((n+31)/32)*4;
   using(var buffer=new MemoryStream())using(var w=new BinaryWriter(buffer)){
    w.Write(40);w.Write(n);w.Write(2*n);w.Write((ushort)1);w.Write((ushort)32);w.Write(0);
    w.Write(4*n*n+stride*n);for(int i=0;i<4;i++)w.Write(0);
    var mask=new byte[stride*n];
    for(int y=n-1;y>=0;y--)for(int x=0;x<n;x++){
     Color c=bmp.GetPixel(x,y);w.Write(c.B);w.Write(c.G);w.Write(c.R);w.Write(c.A);
     if(c.A==0)mask[(n-1-y)*stride+x/8]|=(byte)(128>>(x%8));
    }
    w.Write(mask);return buffer.ToArray();
   }
  }
 }
 public static void Write(string path,string wizardDirectory){
  int[] sizes={16,20,24,32,40,48,64,80,96,128,256};
  var frames=Array.ConvertAll(sizes,n=>Frame(n));
  using(var stream=File.Create(path))using(var w=new BinaryWriter(stream)){
   w.Write((ushort)0);w.Write((ushort)1);w.Write((ushort)sizes.Length);
   int offset=6+16*sizes.Length;
   for(int i=0;i<sizes.Length;i++){
    w.Write((byte)(sizes[i]%256));w.Write((byte)(sizes[i]%256));w.Write((ushort)0);w.Write((ushort)1);w.Write((ushort)32);
    w.Write(frames[i].Length);w.Write(offset);offset+=frames[i].Length;
   }
   foreach(var frame in frames)w.Write(frame);
  }
  if(!String.IsNullOrEmpty(wizardDirectory)){
   Directory.CreateDirectory(wizardDirectory);
   foreach(int n in new[]{58,77,97,116,124,143,159,192,256})
    File.WriteAllBytes(Path.Combine(wizardDirectory,"peek-"+n+".png"),Frame(n,true));
  }
 }
}
"@
if($WizardDirectory){$WizardDirectory=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($WizardDirectory)}
[PeekSetupIconBuilder]::Write($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out),$WizardDirectory)
