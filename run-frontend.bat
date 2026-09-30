@echo off
echo ========================================================
echo   Menjalankan Frontend SmartDayCare AI (Next.js)
echo ========================================================
cd /d "%~dp0\frontend"
if not exist "node_modules\" (
    echo [1/2] Folder node_modules belum ada, memasang paket npm...
    call npm.cmd install
) else (
    echo [1/2] Dependensi node_modules terdeteksi.
)
echo.
echo [2/2] Menjalankan Next.js Development Server...
echo Buka di peramban: http://localhost:3000
echo.
call npm.cmd run dev
pause
