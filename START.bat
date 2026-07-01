@echo off
echo ================================================
echo   DataAnalyst AI - Starting up...
echo ================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

echo [1/4] Installing root dependencies...
call npm install
if %errorlevel% neq 0 goto error

echo [2/4] Installing backend...
cd backend
call npm install
cd ..
if %errorlevel% neq 0 goto error

echo [3/4] Installing frontend...
cd frontend
call npm install
cd ..
if %errorlevel% neq 0 goto error

echo [4/4] Starting both servers...
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:5000
echo.
echo   Press Ctrl+C to stop.
echo ================================================
echo.

call npx concurrently "npm run start:backend" "npm run start:frontend"
goto end

:error
echo ERROR: Something went wrong. See above.
pause
exit /b 1

:end
