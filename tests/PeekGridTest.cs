using System;
internal static class PeekGridTest {
 static void Expect(bool condition, string name){if(!condition) throw new Exception(name);}
 static int Main(){
  Expect(DesktopGrid.ClampCount(0)==1 && DesktopGrid.ClampCount(4)==3,"1–3 hard bounds");
  Expect(DesktopGrid.Index(1,0)==3 && DesktopGrid.Index(2,2)==8,"stable 3×3 stride");
  for(int n=1;n<=3;n++){
   Expect(DesktopGrid.Count(DesktopGrid.Width(n),DesktopGrid.CellWidth)==n,"width round trip");
   Expect(DesktopGrid.Count(DesktopGrid.Height(n),DesktopGrid.CellHeight)==n,"height round trip");
  }
  var grow=DesktopGrid.Drag(100,80,DesktopGrid.Width(2),DesktopGrid.Height(2),-500,-500,-1,-1);
  Expect(grow.Width==DesktopGrid.Width(3) && grow.Height==DesktopGrid.Height(3),"window cannot exceed 3×3");
  Expect(grow.Left+grow.Width==100+DesktopGrid.Width(2) && grow.Top+grow.Height==80+DesktopGrid.Height(2),"opposite edges stay anchored");
  var shrink=DesktopGrid.Drag(100,80,DesktopGrid.Width(3),DesktopGrid.Height(3),-1000,-1000,1,1);
  Expect(shrink.Left==100 && shrink.Top==80 && shrink.Width==DesktopGrid.Width(1) && shrink.Height==DesktopGrid.Height(1),"lower bounds and fixed origin");
  var compact=DesktopGrid.Drag(100,80,170,DesktopGrid.Height(2),-200,0,1,0,66,240);
  Expect(compact.Width==66 && compact.Left==100,"Measured group minimum and stable anchor");
  Expect(DesktopGrid.Closest(157,new[]{80.0,150.0,225.0})==2,"Snap picks nearest measured column stop");
  double last=0;
  for(int i=0;i<=100;i++){double next=DesktopGrid.SnapEase(i/100.0);Expect(next>=last&&next<=1,"settle is monotonic with no rebound");last=next;}
  Expect(DesktopGrid.SnapEase(0)==0 && last==1 && DesktopGrid.SnapEase(.5)>.5,"nonlinear settle with exact endpoints");
  Console.WriteLine("Desktop grid tests passed");return 0;
 }
}


