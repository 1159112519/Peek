using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading.Tasks;

internal sealed class GatewayProbeReading {
 internal readonly long? Ping;
 internal readonly double? Loss;
 internal readonly DateTime TimeUtc;
 internal readonly string PingReason,LossReason;
 internal GatewayProbeReading(DateTime timeUtc,long? ping,double? loss,string pingReason,string lossReason){
  TimeUtc=timeUtc;Ping=ping;Loss=loss;PingReason=pingReason;LossReason=lossReason;
 }
 internal static GatewayProbeReading Missing(string reason){return new GatewayProbeReading(DateTime.UtcNow,null,null,reason,reason);}

}

// Keep a rolling ICMP window for one adapter/target. Unsupported and local errors are not losses.
internal sealed class GatewayProbeWindow {
 readonly Queue<bool> replies=new Queue<bool>();
 string target; bool confirmed;
 internal void Reset(){replies.Clear();target=null;confirmed=false;}
 internal GatewayProbeReading Add(string next,long? ping,DateTime now){
  if(next!=target){Reset();target=next;}
  if(ping.HasValue)confirmed=true;
  if(replies.Count==20)replies.Dequeue();replies.Enqueue(ping.HasValue);
  double? loss=confirmed&&replies.Count>=3?(double?)100.0*replies.Count(ok=>!ok)/replies.Count:null;
  return new GatewayProbeReading(now,ping,loss,ping.HasValue?null:"网关未响应 ICMP",loss.HasValue?null:confirmed?"正在积累丢包样本":"网关尚未响应 ICMP，无法判断丢包率");
 }
}

internal sealed class WidgetGatewayProbe:IDisposable {
 const int TimeoutMs=750;
 readonly object gate=new object();
 readonly GatewayProbeWindow window=new GatewayProbeWindow();
 readonly Func<string,Tuple<string,IPAddress>> locate;
 volatile GatewayProbeReading reading=GatewayProbeReading.Missing("前往采集设置开启网关探测");
 string adapter="";
 bool enabled,busy,disposed;
 int epoch;
 DateTime next;
 internal WidgetGatewayProbe(Func<string,Tuple<string,IPAddress>> locate=null){this.locate=locate??FindGateway;}
 internal GatewayProbeReading Latest {
  get {var value=reading;return (value.Ping.HasValue||value.Loss.HasValue)&&(DateTime.UtcNow-value.TimeUtc).TotalSeconds>8?GatewayProbeReading.Missing("网关读数已过期"):value;}
 }
 internal void Configure(bool active,string id){lock(gate){
  if(disposed||enabled==active&&adapter==id)return;
  enabled=active;adapter=id;epoch++;next=DateTime.MinValue;window.Reset();
  reading=GatewayProbeReading.Missing(active?"正在等待网关探测":"前往采集设置开启网关探测");
 }}
 internal void Tick(){lock(gate){
  var now=DateTime.UtcNow;if(disposed||!enabled||busy||now<next)return;
  next=now.AddSeconds(2);busy=true;var selected=adapter;var run=epoch;
  Task.Run(()=>Collect(selected,run));
 }}
 void Collect(string selected,int run){
  string key=null,error=null;long? rtt=null;
  try{
   var target=locate(selected);
   if(target==null)error="所选网络没有可用的默认网关";
   else{
    lock(gate){if(disposed||!enabled||epoch!=run)return;}
    using(var ping=new Ping()){
     var result=ping.Send(target.Item2,TimeoutMs);
     if(result.Status==IPStatus.Success||result.Status==IPStatus.TimedOut){key=target.Item1+"/"+target.Item2;if(result.Status==IPStatus.Success)rtt=result.RoundtripTime;}
     else error="当前无法探测默认网关";
    }
   }
  }catch(PingException){error="当前无法探测默认网关";}
  catch(NetworkInformationException){error="当前无法探测默认网关";}
  catch(SocketException){error="当前无法探测默认网关";}
  catch(InvalidOperationException){error="当前无法探测默认网关";}
  catch(UnauthorizedAccessException){error="当前无法探测默认网关";}
  finally{
   lock(gate){
    if(!disposed&&epoch==run){
     if(key!=null)reading=window.Add(key,rtt,DateTime.UtcNow);
     else{window.Reset();reading=GatewayProbeReading.Missing(error??"当前无法探测默认网关");}
    }
    busy=false;
   }
  }
 }
 static Tuple<string,IPAddress> FindGateway(string adapter){
  // Use the selected adapter, or the first connected adapter advertising a default gateway.
  foreach(var ni in NetworkInterface.GetAllNetworkInterfaces()){
   if(ni.OperationalStatus!=OperationalStatus.Up||ni.NetworkInterfaceType==NetworkInterfaceType.Loopback||ni.NetworkInterfaceType==NetworkInterfaceType.Tunnel)continue;
   if(!string.IsNullOrEmpty(adapter)&&!string.Equals(adapter,ni.Id,StringComparison.OrdinalIgnoreCase))continue;
   var candidates=ni.GetIPProperties().GatewayAddresses.Select(g=>g.Address).Where(a=>a!=null&&!a.Equals(IPAddress.Any)&&!a.Equals(IPAddress.IPv6Any)&&!IPAddress.IsLoopback(a));
   var target=candidates.OrderBy(a=>a.AddressFamily==AddressFamily.InterNetwork?0:1).FirstOrDefault();
   if(target!=null)return Tuple.Create(ni.Id,target);
  }
  return null;
 }
 public void Dispose(){lock(gate){disposed=true;enabled=false;epoch++;window.Reset();}}
}
