@echo off
chcp 65001 >nul
title CHUA ONLINE - TIKTOK LIVE GAME SERVER
color 0E

echo ======================================================================
echo           CHUA ONLINE - TIKTOK LIVE GAME VA STREAM OVERLAY
echo ======================================================================
echo.

:: 1. Kiem tra moi truong Node.js
where node >nul 2>nul
if errorlevel 1 goto NoNode

:: 2. Kiem tra thu muc node_modules
if not exist "node_modules\" goto InstallDeps
goto StartApp

:NoNode
echo [LOI] May tinh cua ban chua cai dat Node.js!
echo Vui long truy cap trang web https://nodejs.org de tai ban LTS ve cai dat.
echo.
pause
exit /b

:InstallDeps
echo [THONG BAO] Dang tu dong cai dat thu vien. Vui long cho trong giay lat...
call npm install
if errorlevel 1 goto InstallFail
echo [THANH CONG] Da cai dat xong cac thu vien!
echo.
goto StartApp

:InstallFail
echo [LOI] Khong the cai dat thu vien. Vui long kiem tra ket noi mang Internet.
pause
exit /b

:StartApp
:: 3. Mo san trinh duyet
start "" "http://localhost:3002/"
start "" "http://localhost:3002/overlay.html"

echo [KHOI DONG] Dang khoi dong Web Server tai cong 3002...
echo - Dashboard Dieu Khien:  http://localhost:3002/
echo - Man Hinh LIVE OBS:     http://localhost:3002/overlay.html
echo.
echo ======================================================================
echo Nhan CTRL + C trong cua so nay de tat ung dung khi nghi LIVE.
echo ======================================================================
echo.

node server.js
pause
