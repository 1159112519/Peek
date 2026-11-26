using System;
using System.Net;
using System.Threading;
static class PeekGatewayProbeTest {
 static void Assert(bool value,string message){if(!value)throw new Exception(message);}
 static void Main(){
  var window=new GatewayProbeWindow();var now=new DateTime(2026,11,26,12,0,0,DateTimeKind.Utc);
  var noReply=window.Add("wifi/192.168.1.1",null,now);
  Assert(!noReply.Ping.HasValue&&!noReply.Loss.HasValue,"Unconfirmed router cannot claim packet loss");
  var normal=window.Add("wifi/192.168.1.1",0,now.AddSeconds(2));
  Assert(normal.Ping==0&&!normal.Loss.HasValue,"Zero milliseconds is valid; loss is warming up");
  var mixed=window.Add("wifi/192.168.1.1",18,now.AddSeconds(4));
  Assert(mixed.Ping==18&&Math.Abs(mixed.Loss.Value-100.0/3)<.001,"Loss counts timed-out attempts");
  var lost=window.Add("wifi/192.168.1.1",null,now.AddSeconds(6));
  Assert(!lost.Ping.HasValue&&lost.Loss==50,"Timeout must not show an old RTT");
  for(var i=0;i<20;i++)lost=window.Add("wifi/192.168.1.1",null,now.AddSeconds(8+i*2));
  Assert(lost.Loss==100,"Confirmed gateway can show a full window of loss");
  var moved=window.Add("ethernet/192.168.1.1",null,now.AddMinutes(1));
  Assert(!moved.Ping.HasValue&&!moved.Loss.HasValue,"Changing adapter resets the route window");
  window.Add("ethernet/192.168.1.1",1,now.AddMinutes(1));window.Reset();
  var reset=window.Add("ethernet/192.168.1.1",null,now.AddMinutes(1));
  Assert(!reset.Loss.HasValue,"Disabling probe discards prior measurements");
  using(var probe=new WidgetGatewayProbe(id=>Tuple.Create(id,IPAddress.Loopback))){
   Assert(!probe.Latest.Ping.HasValue,"Disabled probe cannot report an RTT");
   probe.Configure(true,"test");
   for(int i=0;i<100&&!probe.Latest.Loss.HasValue;i++){probe.Tick();Thread.Sleep(75);}
   Assert(probe.Latest.Ping.HasValue&&probe.Latest.Loss==0,"Loopback ICMP succeeds through the worker");
   probe.Configure(false,"test");
   Assert(!probe.Latest.Ping.HasValue&&!probe.Latest.Loss.HasValue,"Probe disable clears readings");
  }
  Console.WriteLine("Gateway sample window and background ICMP to loopback passed; no LAN or internet probes.");
 }
}
