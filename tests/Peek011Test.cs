using System;
internal sealed class TaskbarModule { internal string[] Parts=new[]{"number"}; }
internal static class TaskbarPainter { internal static double Ease(double p){return 1-Math.Pow(1-p,3);} }
internal static class Peek011Test {
 static void Expect(bool ok,string message){if(!ok)throw new Exception(message);}
 static void Main(){
  var modules=new[]{new TaskbarModule(),new TaskbarModule(),new TaskbarModule()};
  var cells=new TaskbarCellInk[3];for(int i=0;i<3;i++){cells[i]=new TaskbarCellInk();cells[i].Include(0,60);}
  var layout=new TaskbarSqueezeLayout(modules,cells,3);
  var motion=new TaskbarSqueezeMotion();motion.Set(220,0,false);
  var first=motion.Frame(layout,220,0,false);float x=first.X[1],alpha=first.Alpha[2];
  motion.Set(166,10,false);
  for(int t=10;t<=490;t+=8){var f=motion.Frame(layout,166,t,false);Expect(f.X[1]<=x+.001f,"Surviving column bounced right during squeeze at "+t);Expect(f.Alpha[2]<=alpha+.001f,"Departing column faded back in");x=f.X[1];alpha=f.Alpha[2];}
  var before=motion.Frame(layout,166,500,false);
  motion.Set(250,500,false);var at=motion.Frame(layout,250,500,false);
  Expect(Math.Abs(before.X[1]-at.X[1])<.001f&&before.Alpha[2]==at.Alpha[2],"Retarget jumped on its first frame");
  for(int t=508;t<=988;t+=8){var f=motion.Frame(layout,250,t,false);Expect(f.X[1]>=x-.001f,"Expansion pulled a surviving column backwards");Expect(f.Alpha[2]>=alpha-.001f,"Expansion revived then hid the incoming column");x=f.X[1];alpha=f.Alpha[2];}
  Expect(Math.Abs(alpha-1)<.001f,"Expansion did not restore the full column");
  var hold=new TaskbarProbeHold();
  Expect(hold.Keep(0,true,false,true)&&hold.Keep(250,true,false,true),"Brief Explorer UIA gap dropped the attached widget");
  Expect(!hold.Keep(640,true,false,true),"Unverified space was retained indefinitely");
  Expect(hold.Keep(800,true,true,false)&&hold.Keep(5000,true,true,false),"Open shell menu should not replace verified geometry");
  Expect(hold.Keep(5030,true,false,true),"Closing menu did not get a fresh probe grace period");
  Expect(!hold.Keep(5031,false,true,true),"New or hidden taskbar must not inherit the old overlay");
  Expect(!hold.Keep(5032,true,false,false),"Verified layout must apply immediately");
  var old=PeekUpdates.Interpret(new Version("0.1.0"),302,"/1159112519/Peek/releases/tag/v0.1.1");
  var current=PeekUpdates.Interpret(new Version("0.1.1"),302,"/1159112519/Peek/releases/tag/v0.1.1");
  Expect(old.state=="available"&&old.version=="0.1.1"&&current.state=="current","Peek Release response regression");
  Console.WriteLine("Squeeze motion and Peek update comparison passed.");
 }
}
