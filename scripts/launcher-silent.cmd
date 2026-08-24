@echo off
rem WorkDaddy visible launcher (auto-close, no pause).
rem Use this as the desktop shortcut target when the hidden VBS path is blocked
rem by AV/policy or when chcp 65001 hangs on the fresh wscript-spawned console.
set WBSWITCH_NO_PAUSE=1
call "%~dp0launcher.cmd" %*
