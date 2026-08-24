Option Explicit

' Desktop shortcut entry point. wscript.exe has no console window, so running the
' shortcut as administrator cannot leave an empty Windows Terminal tab behind.
'
' Runs node.exe directly (instead of cmd.exe) to avoid two known issues:
'   1. Some AV/policy engines block hidden cmd.exe as a LOLBin heuristic but
'      allow hidden node.exe.
'   2. chcp 65001 in a fresh console created by wscript can hang, producing a
'      blank window with no output.
Dim shell, fso, scriptDir, nodeExe, nodeDir, subdir, launcherJs, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Find node: prefer WorkBuddy bundled runtime (.workbuddy\binaries\node\versions\*)
nodeExe = ""
nodeDir = shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.workbuddy\binaries\node\versions"
If fso.FolderExists(nodeDir) Then
  For Each subdir In fso.GetFolder(nodeDir).SubFolders
    If fso.FileExists(fso.BuildPath(subdir.Path, "node.exe")) Then
      nodeExe = fso.BuildPath(subdir.Path, "node.exe")
      Exit For
    End If
  Next
End If
If nodeExe = "" Then nodeExe = "node"

launcherJs = fso.BuildPath(scriptDir, "win-launcher.js")
If Not fso.FileExists(launcherJs) Then
  WScript.Quit 1
End If

command = """" & nodeExe & """ --experimental-sqlite """ & launcherJs & """"
shell.Run command, 0, False
