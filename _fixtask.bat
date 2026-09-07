@echo off
schtasks /create /tn ARKAdminManager /tr "\"C:\Program Files\ARK Admin Manager\ARK Admin Manager.exe\"" /sc onlogon /ru Administrator /rl highest /f
echo TASK_EXIT=%errorlevel%
schtasks /run /tn ARKAdminManager
echo RUN_EXIT=%errorlevel%
