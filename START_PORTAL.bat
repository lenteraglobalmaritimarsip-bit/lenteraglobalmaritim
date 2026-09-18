@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo   MARITIMPORT - SHIPPING AGENCY WORK PORTAL
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terinstall.
  echo Install Node.js LTS terlebih dahulu.
  pause
  exit /b 1
)
echo Node.js terdeteksi.
if not exist node_modules (
  echo.
  echo Menginstall dependency pertama kali...
  call npm install
  if errorlevel 1 (
    echo.
    echo Gagal menjalankan npm install.
    pause
    exit /b 1
  )
)
echo.
echo Menjalankan database API di port 3001...
start "MaritimPort API" cmd /k "npm run server"
timeout /t 2 /nobreak >nul
echo.
echo Menjalankan portal di port 3000...
echo Buka: http://localhost:3000
echo Tekan Ctrl+C untuk menghentikan frontend.
call npm run dev
pause
