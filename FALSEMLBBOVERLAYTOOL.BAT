@echo off
:: Change text color in the command prompt window to green
color 2

:: Set window title
title False Overlay Tool Launcher

echo.
echo ====================================================================
echo      INITIALIZING NODE.JS SERVER
echo ====================================================================
echo.

:: 1. [FIXED] Find IPv4 address from MAIN adapter (Wi-Fi/LAN)
echo [STEP 1] Finding active IPv4 address (Wi-Fi/Ethernet)...

:: Set IP_ADDRESS empty first
set "IP_ADDRESS="

:: This PowerShell command looks for adapters that are 'Up' AND have a Default Gateway (connection to Router)
:: This automatically ignores VMWare/VirtualBox since they usually don't have an active Default Gateway.
for /f "usebackq tokens=*" %%a in (`powershell -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -ExpandProperty IPv4Address | Select-Object -First 1 -ExpandProperty IPAddress"`) do (
    set IP_ADDRESS=%%a
)

:: Clean up spaces if any
if defined IP_ADDRESS set IP_ADDRESS=%IP_ADDRESS: =%

:: Check if IP was obtained successfully
if not defined IP_ADDRESS (
    echo.
    echo [FAILED] No active Wi-Fi or Ethernet connection found.
    echo.
    echo Troubleshooting:
    echo 1. Make sure internet/wifi is connected.
    echo 2. Make sure you're not in airplane mode.
    pause
    exit
)

echo [SUCCESS] Main Adapter IP found: %IP_ADDRESS%
echo.

:: 2. Overwrite (replace) text inside /public/serverip.txt
echo [STEP 2] Saving IP address to public\serverip.txt...
echo %IP_ADDRESS%> public\serverip.txt
echo [SUCCESS] File has been updated.
echo.

:: Add a short pause so server has time to be ready before browser opens
echo Pausing for 2 seconds before opening browser...
timeout /t 2 /nobreak > nul

:: 4. Open URL in browser (PORT 3000)
echo [STEP 4] Opening URL in the default browser...
start http://%IP_ADDRESS%:3000/hub.html
echo.
echo Initialization complete. Clearing screen and starting server...
timeout /t 2 /nobreak > nul

:: =================================================================
:: == CLEAR SCREEN & RUN SERVER ==
:: =================================================================

cls

echo =========================================
echo ===========FALSE OVERLAY TOOL=============
echo =========================================
echo.
echo Please Read the readme
echo.
echo =========================================
echo Server is running on Port 3000...
echo Local Access: http://localhost:3000
echo LAN Access  : http://%IP_ADDRESS%:3000
echo.
echo Do not close this window!
echo =========================================
echo.

:: 3. Run Node.js server
node server.js

:: Check if Node.js error
if errorlevel 1 (
    echo.
    echo =========================================
    echo [ERROR] Server failed to start.
    echo.
    echo Check if Node.js is installed or Port 3000 is in use.
    echo =========================================
    echo.
    pause
)