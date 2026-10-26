@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3001/api/health' -TimeoutSec 2; if ($r.app -eq 'capital-city') { Start-Process 'http://localhost:3001'; exit 0 } } catch {}; exit 1"
if not errorlevel 1 exit /b 0
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.12 或更新版本。
  pause
  exit /b 1
)
if not exist "node_modules\tsx" (
  echo 正在安装依赖...
  call npm ci --cache "%~dp0.npm-cache"
  if errorlevel 1 exit /b 1
)
if not exist "dist\index.html" (
  call npm run build
  if errorlevel 1 exit /b 1
)
echo.
echo 资本之城即将启动。请在浏览器打开 http://localhost:3001
echo 同一局域网的朋友使用本机 IP 加 :3001 访问。
echo 关闭此窗口将停止服务器。
echo.
call npm start
pause
