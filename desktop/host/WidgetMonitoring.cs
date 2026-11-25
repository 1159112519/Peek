using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

// Preferences are saved by the widget's existing Apply/Cancel transaction.
public sealed class WidgetMonitoring {
 public string adapter="",disk="",volume="",cpuSource="time";
 public int trafficMiB,memoryPercent,gpuCelsius;
 public WidgetMonitoring Normalize(){return new WidgetMonitoring{
  adapter=Source(adapter),disk=Source(disk),volume=Source(volume),cpuSource=cpuSource=="performance"?"performance":"time",
  trafficMiB=Bound(trafficMiB,1048576),memoryPercent=Bound(memoryPercent,100),gpuCelsius=Bound(gpuCelsius,120)};}
 static string Source(string value){return value!=null&&value.Length<=256?value:"";}
 static int Bound(int value,int max){return Math.Max(0,Math.Min(max,value));}
}

internal sealed class WidgetAlerts {
 internal sealed class Day {public string date;public double bytes;public bool notified;}
 readonly string path;
 readonly Dictionary<string,double> previousDown=new Dictionary<string,double>(),previousUp=new Dictionary<string,double>();
 Day day;
 DateTime lastSample,lastWrite;
 bool dirty;
 bool memoryRaised,gpuRaised;
 internal double TodayBytes{get{return day.date==DayKey(DateTime.Now)?day.bytes:0;}}
 internal WidgetAlerts(string root){
  path=Path.Combine(root,"observed-traffic.json");
  try{day=File.Exists(path)?ArchiveStore.Json().Deserialize<Day>(File.ReadAllText(path)):null;}catch(Exception e){DiagnosticsLog.Write("widget-traffic-read",e);}
  if(day==null||day.date!=DayKey(DateTime.Now)||double.IsNaN(day.bytes)||double.IsInfinity(day.bytes)||day.bytes<0)day=new Day{date=DayKey(DateTime.Now)};
 }
 static string DayKey(DateTime local){return local.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);}
 internal void SettingsChanged(WidgetMonitoring before,WidgetMonitoring next){
  if(before.adapter!=next.adapter){previousDown.Clear();previousUp.Clear();}
  if(before.memoryPercent!=next.memoryPercent)memoryRaised=false;
  if(before.gpuCelsius!=next.gpuCelsius)gpuRaised=false;
 }
 internal bool Observe(DeviceReading reading,string adapter,DateTime now){
  if(reading==null||reading.TimeUtc<=lastSample)return false;
  bool continuous=lastSample!=default(DateTime)&&(reading.TimeUtc-lastSample).TotalMilliseconds<=Math.Max(15000,reading.IntervalMs*3);
  lastSample=reading.TimeUtc;
  string key=DayKey(now);bool rollover=day.date!=key;
  if(rollover){day=new Day{date=key};continuous=false;}
  var metrics=reading.Metrics;var network=metrics!=null&&string.IsNullOrEmpty(metrics.Error)?metrics.Network:null;
  var interfaces=network!=null&&string.IsNullOrEmpty(network.Error)&&reading.TimeUtc.ToLocalTime().Date==now.Date?network.Interfaces.Where(n=>!string.IsNullOrEmpty(n.Id)&&(adapter.Length==0||n.Id==adapter)).ToArray():new NetworkCounter[0];
  double delta=0;
  if(continuous)foreach(var n in interfaces){double rx,tx;if(previousDown.TryGetValue(n.Id,out rx)&&previousUp.TryGetValue(n.Id,out tx)&&n.ReceivedBytes>=rx&&n.SentBytes>=tx)delta+=n.ReceivedBytes-rx+n.SentBytes-tx;}
  previousDown.Clear();previousUp.Clear();
  foreach(var n in interfaces){previousDown[n.Id]=n.ReceivedBytes;previousUp[n.Id]=n.SentBytes;}
  day.bytes+=delta;
  dirty=dirty||delta>0||rollover;
  if(dirty&&(now-lastWrite).TotalSeconds>=15)Persist();
  return interfaces.Length>0;
 }
 internal void Evaluate(WidgetMonitoring settings,TaskbarSnapshot snapshot,bool freshTraffic,Action<string,string> notify){
  if(freshTraffic&&settings.trafficMiB>0&&TodayBytes>=settings.trafficMiB*1048576.0&&!day.notified){
   day.notified=true;Persist();notify("当日流量提醒",PeripheralMetrics.Bytes(TodayBytes));
  }
  EvaluateThreshold(snapshot.Read("memory"),settings.memoryPercent,3,ref memoryRaised,"内存利用率提醒",notify);
  EvaluateThreshold(snapshot.Read("gpuTemperature"),settings.gpuCelsius,3,ref gpuRaised,"GPU 温度提醒",notify);
 }
 static void EvaluateThreshold(TaskbarValue value,int limit,int hysteresis,ref bool raised,string label,Action<string,string> notify){
  if(limit==0||value.stale||!value.value.HasValue||double.IsNaN(value.value.Value)||double.IsInfinity(value.value.Value))return;
  if(value.value<=Math.Max(0,limit-hysteresis))raised=false;
  if(!raised&&value.value>=limit){raised=true;notify(label,value.value.Value.ToString("0",CultureInfo.InvariantCulture)+" "+value.unit);}
 }
 internal void Flush(){if(dirty)Persist();}
 void Persist(){
  string temp=path+".new";
  try{File.WriteAllText(temp,ArchiveStore.Json().Serialize(day));if(File.Exists(path))File.Replace(temp,path,null);else File.Move(temp,path);dirty=false;lastWrite=DateTime.Now;}
  catch(Exception e){DiagnosticsLog.Write("widget-traffic-save",e);}
 }
}
