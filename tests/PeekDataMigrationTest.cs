using System;
using System.IO;
static class PeekDataMigrationTest {
 static void Require(bool pass,string title){if(!pass)throw new Exception(title);}
 static void Reject(Action run){try{run();}catch(IOException){return;}throw new Exception("Expected migration rejection");}
 static void Main(string[] args){
  var old=Path.GetFullPath(args[0]);var parent=Path.GetFullPath(args[1]);var pointer=Path.Combine(old,"state","data-root.txt");
  var source=Path.Combine(old,"AsterHubWidgets");Directory.CreateDirectory(source);Directory.CreateDirectory(parent);
  Directory.CreateDirectory(Path.Combine(source,"WebView"));File.WriteAllText(Path.Combine(source,"WebView","cache.bin"),"cache");
  File.WriteAllText(Path.Combine(source,"preferences.json"),"prefs");File.WriteAllText(Path.Combine(source,"peek-color-swatches.json"),"[#AABBCC]");
  Directory.CreateDirectory(Path.Combine(source,"history"));File.WriteAllText(Path.Combine(source,"history","sample.json"),"history");
  var target=PeekDataRoot.Destination(source,parent);
  Directory.CreateDirectory(target);Reject(()=>PeekDataRoot.Migrate(source,target,pointer));Directory.Delete(target);
  Reject(()=>PeekDataRoot.Migrate(source,Path.Combine(source,"Peek"),pointer));
  var blocker=Path.Combine(old,"blocked");File.WriteAllText(blocker,"not a directory");Reject(()=>PeekDataRoot.Migrate(source,target,Path.Combine(blocker,"data-root.txt")));
  Require(Directory.Exists(source)&&!Directory.Exists(target)&&!File.Exists(pointer),"Failed copy must not change the source or pointer");
  string backup=PeekDataRoot.Migrate(source,target,pointer);
  Require(Directory.Exists(backup)&&!Directory.Exists(source)&&PeekDataRoot.Read(pointer,source)==target,"Migration must publish the new path and retain original backup");
  Require(File.ReadAllText(Path.Combine(target,"preferences.json"))=="prefs"&&File.Exists(Path.Combine(target,"peek-color-swatches.json"))&&File.ReadAllText(Path.Combine(target,"history","sample.json"))=="history","Persistent data did not carry over");
  Require(!Directory.Exists(Path.Combine(target,"WebView"))&&Directory.Exists(Path.Combine(backup,"WebView")),"Browser cache must not transfer");
  var unavailable=target+".offline";Directory.Move(target,unavailable);Reject(()=>PeekDataRoot.Read(pointer,source));Directory.Move(unavailable,target);
  Console.WriteLine("PASS: migration {0} -> {1}, no overwrite, pointer rollback, nested data, backup, no silent fallback.",Path.GetPathRoot(source),Path.GetPathRoot(target));
 }
}
