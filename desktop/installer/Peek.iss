#if VER < EncodeVer(7, 0, 0)
#error Peek uses the same Windows 11 wizard as AsterHub and requires Inno Setup 7 or later.
#endif
[Setup]
AppId={{B86A0A48-66C9-4C84-B53C-6BA90801F43F}
AppName=Peek
AppVerName=Peek v{#ReleaseVersion}
AppVersion={#ReleaseVersion}
AppPublisher=Peek
DefaultDirName={localappdata}\Programs\Peek
DefaultGroupName=Peek
PrivilegesRequired=lowest
SetupArchitecture=x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
SetupMutex=Local\PeekSetup
OutputDir={#InstallerOutputDir}
OutputBaseFilename=Peek-Setup-v{#ReleaseVersion}
SetupIconFile={#SetupIcon}
UninstallDisplayIcon={app}\resources\setup\PeekSetup.ico
UninstallDisplayName=Peek v{#ReleaseVersion}
WizardStyle=modern dynamic windows11 hidebevels
WizardSizePercent=100,100
WizardImageFile={#WizardAssets}\peek-*.png
WizardImageFileDynamicDark={#WizardAssets}\peek-*.png
WizardSmallImageFile={#WizardAssets}\peek-*.png
WizardSmallImageFileDynamicDark={#WizardAssets}\peek-*.png
DisableWelcomePage=yes
ShowLanguageDialog=no
DisableProgramGroupPage=yes
DisableDirPage=no
AllowNoIcons=yes
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
UsePreviousAppDir=yes
UsePreviousGroup=no
VersionInfoVersion={#ReleaseVersion}
VersionInfoProductVersion={#ReleaseVersion}
VersionInfoTextVersion={#ReleaseVersion}
VersionInfoProductName=Peek
VersionInfoDescription=Peek Setup
ChangesEnvironment=no
UninstallLogMode=append
[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
[LangOptions]
DialogFontName=Microsoft YaHei
DialogFontSize=10
[Messages]
chinesesimplified.SetupWindowTitle=Peek 安装
chinesesimplified.FinishedHeadingLabel=Peek 已准备就绪
chinesesimplified.FinishedLabel=安装已完成。
chinesesimplified.SelectDirLabel3=安装目录
chinesesimplified.SelectDirDesc=选择 Peek 的安装位置。
english.SelectDirLabel3=Installation folder
english.SelectDirDesc=Choose where to install Peek.
chinesesimplified.ReadyLabel1=已准备好安装 Peek。
chinesesimplified.InstallingLabel=正在安装 Peek，请稍候…
english.SetupWindowTitle=Peek Setup
english.FinishedHeadingLabel=Peek is ready
english.FinishedLabel=Installation is complete.
[CustomMessages]
chinesesimplified.DesktopShortcut=创建桌面快捷方式
chinesesimplified.ShortcutGroup=快捷方式
chinesesimplified.LaunchApplication=启动 Peek
chinesesimplified.NoFramework=Peek 需要 .NET Framework 4.7.2 或更新版本。请更新 Windows 组件后重试。
chinesesimplified.NoWebView=Microsoft Edge WebView2 Runtime 尚未安装完成。请保持网络连接并重试。
english.DesktopShortcut=Create a desktop shortcut
english.ShortcutGroup=Shortcuts
english.LaunchApplication=Open Peek
english.NoFramework=Peek requires .NET Framework 4.7.2 or later. Update the Windows component and retry.
english.NoWebView=Microsoft Edge WebView2 Runtime is not installed. Check your connection and retry.
[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; GroupDescription: "{cm:ShortcutGroup}"; Flags: unchecked
[Files]
Source: "{#InstalledPayload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SetupIcon}"; DestDir: "{app}\resources\setup"; DestName: "PeekSetup.ico"; Flags: ignoreversion
Source: "{#Bootstrapper}"; DestName: "MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy
[Icons]
Name: "{group}\Peek"; Filename: "{app}\Peek.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\Peek"; Filename: "{app}\Peek.exe"; WorkingDir: "{app}"; Tasks: desktopicon
[Run]
Filename: "{app}\Peek.exe"; Description: "{cm:LaunchApplication}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
[Code]
const
 EdgeKey = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
 RunKey = 'Software\Microsoft\Windows\CurrentVersion\Run';
 StartValue = 'AsterHubWidgets'; { Existing standalone Peek data/autorun compatibility. }

procedure InitializeWizard;
var Inset, MarkSize, TitleX, HeaderY, ButtonShift, FinishMarkSize, FinishTitleX: Integer;
begin
 Inset := WizardForm.InnerNotebook.Left;
 MarkSize := ScaleX(40);
 TitleX := Inset + MarkSize + ScaleX(12);
 HeaderY := (WizardForm.MainPanel.ClientHeight - ScaleY(35)) div 2;
 FinishMarkSize := ScaleX(96);
 FinishTitleX := Inset + FinishMarkSize + ScaleX(28);
 with WizardForm do begin
  WizardSmallBitmapImage.Anchors := [akLeft, akTop];
  WizardSmallBitmapImage.Stretch := True;
  WizardSmallBitmapImage.SetBounds(Inset, (MainPanel.ClientHeight - MarkSize) div 2, MarkSize, MarkSize);
  PageNameLabel.AutoSize := False;
  PageNameLabel.Font.Size := 12;
  PageNameLabel.SetBounds(TitleX, HeaderY, MainPanel.ClientWidth - TitleX - Inset, ScaleY(21));
  PageDescriptionLabel.AutoSize := False;
  PageDescriptionLabel.SetBounds(TitleX, HeaderY + ScaleY(21), MainPanel.ClientWidth - TitleX - Inset, ScaleY(22));

  { Give the completion mark a left column with a comfortable text gutter. }
  WizardBitmapImage2.Anchors := [akLeft, akTop];
  WizardBitmapImage2.Stretch := True;
  WizardBitmapImage2.SetBounds(Inset, ScaleY(40), FinishMarkSize, FinishMarkSize);
  FinishedHeadingLabel.SetBounds(FinishTitleX, ScaleY(32), FinishedPage.ClientWidth - FinishTitleX - Inset, ScaleY(26));
  FinishedLabel.Left := FinishTitleX;
  FinishedLabel.Top := ScaleY(76);
  FinishedLabel.Width := FinishedPage.ClientWidth - FinishTitleX - Inset;
  YesRadio.Left := FinishTitleX;
  NoRadio.Left := FinishTitleX;
  RunList.Left := FinishTitleX;
  RunList.Width := FinishedPage.ClientWidth - FinishTitleX - Inset;

  SelectDirBitmapImage.Visible := False;
  SelectDirBrowseLabel.Visible := False;
  SelectDirLabel.Font.Style := [fsBold];
  SelectDirLabel.SetBounds(0, ScaleY(13), SelectDirPage.ClientWidth, ScaleY(18));
  DirEdit.SetBounds(0, ScaleY(36), DirEdit.Width, DirEdit.Height);
  DirBrowseButton.Top := DirEdit.Top + (DirEdit.Height - DirBrowseButton.Height) div 2;
  DiskSpaceLabel.Top := DirEdit.Top + DirEdit.Height + ScaleY(11);
  DiskSpaceLabel.Anchors := [akLeft, akTop];

  ButtonShift := Inset - (ClientWidth - CancelButton.Left - CancelButton.Width);
  if ButtonShift > 0 then begin
   CancelButton.Left := CancelButton.Left - ButtonShift;
   NextButton.Left := NextButton.Left - ButtonShift;
   BackButton.Left := BackButton.Left - ButtonShift;
  end;
 end;
end;

function ValidRuntime(RootKey: Integer): Boolean;
var Version: String;
begin
 Result := RegQueryStringValue(RootKey, EdgeKey, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0');
end;

procedure CurPageChanged(CurPageID: Integer);
begin
 if CurPageID = wpFinished then begin
  { Inno lays out the launch list again when it sets the final message. }
  WizardForm.RunList.Top := WizardForm.FinishedLabel.Top + WizardForm.FinishedLabel.Height + ScaleY(4);
  WizardForm.RunList.Height := ScaleY(44);
 end;
end;

function HasWebView: Boolean;
begin
 Result := ValidRuntime(HKCU32) or ValidRuntime(HKCU64) or ValidRuntime(HKLM32) or ValidRuntime(HKLM64);
end;

function HasFramework: Boolean;
var Release: Cardinal;
begin
 Result := (RegQueryDWordValue(HKLM32, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release) and (Release >= 461808)) or
           (RegQueryDWordValue(HKLM64, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release) and (Release >= 461808));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var ExitCode: Integer;
begin
 Result := '';
 if not HasFramework then begin
   Result := ExpandConstant('{cm:NoFramework}');
   Exit;
 end;
 if not HasWebView then begin
   ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
   if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
     Result := ExpandConstant('{cm:NoWebView}')
   else if not HasWebView then
     Result := ExpandConstant('{cm:NoWebView}');
 end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Command: String;
begin
 if (CurUninstallStep = usUninstall) and RegQueryStringValue(HKCU, RunKey, StartValue, Command) then
   if CompareText(Trim(Command), '"' + ExpandConstant('{app}\Peek.exe') + '" --background') = 0 then
     RegDeleteValue(HKCU, RunKey, StartValue);
end;
