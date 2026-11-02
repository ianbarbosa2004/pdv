Option Explicit

Dim shell
Dim fileSystem
Dim root
Dim nodePath

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
root = fileSystem.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = root
nodePath = shell.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe")
If Not fileSystem.FileExists(nodePath) Then nodePath = "node.exe"
shell.Run """" & nodePath & """ """ & root & "\node_modules\@tauri-apps\cli\tauri.js"" dev", 0, False
