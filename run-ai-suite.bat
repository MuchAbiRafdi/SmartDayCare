@echo off
echo ========================================================
echo   Verifikasi 5 Modul AI Ekosistem SmartDayCare
echo ========================================================
cd /d "%~dp0\ai"
python test_ai_suite.py
echo.
pause
