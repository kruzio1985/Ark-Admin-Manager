@echo off
taskkill /F /IM "ARK Admin Manager.exe" >nul 2>&1
timeout /t 2 /nobreak >nul
start "" /wait C:\temp\ArkAdminSetup.exe /S
echo INSTALL_EXIT=%errorlevel%
schtasks /run /tn "ARK Admin Manager"
timeout /t 6 /nobreak >nul
tasklist | findstr /c:"ARK Admin"
