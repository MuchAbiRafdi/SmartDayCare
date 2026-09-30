@echo off
echo ========================================================
echo   Menjalankan Backend SmartDayCare AI (FastAPI Python)
echo ========================================================
cd /d "%~dp0\backend"
echo [1/2] Memastikan dependencies backend terpasang...
pip install -r requirements.txt
echo.
echo [2/2] Menjalankan server FastAPI di http://127.0.0.1:8000 ...
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
