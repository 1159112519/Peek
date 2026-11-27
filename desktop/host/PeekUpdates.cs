using System;
using System.Net;
using System.Text.RegularExpressions;

internal sealed class PeekUpdateResult {
 public string state {get;private set;}
 public string version {get;private set;}
 public int progress {get;private set;}
 public string detail {get;private set;}
 internal PeekUpdateResult(string state,string version=null,int progress=0,string detail=null){this.state=state;this.version=version;this.progress=progress;this.detail=detail;}
}

internal static class PeekUpdates {
 const string RepositoryPath="/1159112519/Peek";
 const string ReleasesPath=RepositoryPath+"/releases";
 internal const string RepositoryUrl="https://github.com"+RepositoryPath;
 internal const string ReleasesUrl="https://github.com"+ReleasesPath;
 static readonly Regex ReleaseTag=new Regex(@"\Av((?:0|[1-9][0-9]{0,9})\.(?:0|[1-9][0-9]{0,9})\.(?:0|[1-9][0-9]{0,9}))\z",RegexOptions.CultureInvariant);
 internal static string CurrentReleaseUrl(string version){return ReleaseTag.IsMatch("v"+version)?ReleasesUrl+"/tag/v"+version:ReleasesUrl;}
 internal static PeekUpdateResult Interpret(Version current,int status,string location) {
  if(status==404)return new PeekUpdateResult("unpublished");
  if(status!=302||string.IsNullOrEmpty(location))return new PeekUpdateResult("error");
  if(location.StartsWith("https://github.com/",StringComparison.Ordinal))location=location.Substring("https://github.com".Length);
  if(location==ReleasesPath)return new PeekUpdateResult("unpublished");
  string prefix=ReleasesPath+"/tag/";
  if(!location.StartsWith(prefix,StringComparison.Ordinal))return new PeekUpdateResult("error");
  var tag=ReleaseTag.Match(location.Substring(prefix.Length));Version latest;
  if(!tag.Success||!Version.TryParse(tag.Groups[1].Value,out latest))return new PeekUpdateResult("error");
  return new PeekUpdateResult(latest>current?"available":"current",latest.ToString());
 }
 internal static PeekUpdateResult Check(Version current) {
  // GitHub's latest-release link selects a published, non-prerelease Release.
  // Read the redirect only; never follow it, scrape a page, or use a token.
  // This host is compiled with the framework csc; older target defaults can be SSL 3.0/TLS 1.0.
  // Preserve the OS default when selected; otherwise ensure the legacy host negotiates TLS 1.2.
  var protocol=ServicePointManager.SecurityProtocol;
  if((int)protocol!=0&&(protocol&SecurityProtocolType.Tls12)==0)ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  var request=(HttpWebRequest)WebRequest.Create(ReleasesUrl+"/latest");
  request.AllowAutoRedirect=false;request.Timeout=6500;request.ReadWriteTimeout=2000;
  request.UserAgent="Peek/"+current;request.CachePolicy=new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
  try{using(var response=(HttpWebResponse)request.GetResponse())return Interpret(current,(int)response.StatusCode,response.Headers[HttpResponseHeader.Location]);}
  catch(WebException failure){using(var response=failure.Response as HttpWebResponse)return response==null?new PeekUpdateResult("error"):Interpret(current,(int)response.StatusCode,null);}
 }
}
