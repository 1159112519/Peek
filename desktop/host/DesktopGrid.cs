using System;

internal static class DesktopGrid {
 internal const int Limit=3, CellWidth=104, CellHeight=17, InsetX=11, InsetY=8, SurfaceRadius=16;
 internal static int ClampCount(int value){return Math.Max(1,Math.Min(Limit,value));}
 internal static int Index(int row,int column){return row*Limit+column;}
 internal static double Width(int columns){return InsetX*2+CellWidth*ClampCount(columns);}
 internal static double Height(int rows){return InsetY*2+CellHeight*ClampCount(rows);}
 internal static int Count(double size,int cell){return ClampCount((int)Math.Round((size-(cell==CellWidth?InsetX:InsetY)*2)/cell,MidpointRounding.AwayFromZero));}
 internal static int Closest(double size,double[] stops){int n=0;for(int i=1;i<stops.Length;i++)if(Math.Abs(size-stops[i])<=Math.Abs(size-stops[n]))n=i;return n+1;}
 internal static double SnapEase(double progress){return 1-Math.Pow(1-Math.Max(0,Math.Min(1,progress)),3);}
 internal struct Bounds{internal double Left,Top,Width,Height;}
 internal static Bounds Drag(double left,double top,double width,double height,double dx,double dy,int x,int y,double? minimumWidth=null,double? maximumWidth=null){
  double w=Math.Max(minimumWidth??Width(1),Math.Min(maximumWidth??Width(Limit),width+dx*x)),h=Math.Max(Height(1),Math.Min(Height(Limit),height+dy*y));
  return new Bounds{Left=x<0?left+width-w:left,Top=y<0?top+height-h:top,Width=w,Height=h};
 }
}
