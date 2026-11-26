using System;
using System.IO;
internal static class PeekUpdateProtocolTest {
 static void Assert(bool ok,string meaning){if(!ok)throw new Exception(meaning);}
 static void Reject(Action run){try{run();}catch(InvalidDataException){return;}throw new Exception("Invalid metadata accepted");}
 static void Main(){
  var version=new Version("0.1.3");
  Assert(PeekUpdateProtocol.AssetName(version,false)=="Peek.exe","portable asset");
  Assert(PeekUpdateProtocol.AssetName(version,true)=="Peek-Setup-v0.1.3.exe","installed asset");
  var sha=new string('c',64);
  PeekUpdateProtocol.CheckMetadata(1000,sha);
  Assert(PeekUpdateProtocol.ManifestDigest(sha+"  Peek.exe\r\n"+sha+" *Peek-Setup-v0.1.3.exe\n","Peek.exe")==sha,"manifest hashes match by exact asset name");
  Reject(()=>PeekUpdateProtocol.ManifestDigest(sha+"  other-Peek.exe\n","Peek.exe"));
  Reject(()=>PeekUpdateProtocol.ManifestDigest(sha+"  Peek.exe\n"+sha+"  Peek.exe\n","Peek.exe"));
  Reject(()=>PeekUpdateProtocol.CheckMetadata(0,sha));Reject(()=>PeekUpdateProtocol.CheckMetadata(300000000,sha));Reject(()=>PeekUpdateProtocol.CheckMetadata(1000,"1234"));
  Assert(PeekUpdateProtocol.AllowedDownload(new Uri("https://release-assets.githubusercontent.com/example")),"GitHub asset redirect");
  Assert(!PeekUpdateProtocol.AllowedDownload(new Uri("http://github.com/1159112519/Peek/")),"plain HTTP");
  Assert(!PeekUpdateProtocol.AllowedDownload(new Uri("https://github.com.evil.invalid/")),"lookalike host");
  Assert(!PeekUpdateProtocol.AllowedDownload(new Uri("https://github.com:81/")),"unapproved port");
  var setup=PeekUpdateProtocol.InstallerArguments(@"C:\Custom Peek",@"C:\Peek Updates\log.txt");
  Assert(setup.Contains("/VERYSILENT")&&setup.Contains("/NORESTART ")&&setup.Contains("/NOCLOSEAPPLICATIONS")&&setup.Contains("/DIR=\"C:\\Custom Peek\""),"silent update must preserve install directory and never reboot Windows");
  Console.WriteLine("Peek update protocol: asset identity, manifest bounds, redirect handling and silent setup flags passed.");
 }
}
