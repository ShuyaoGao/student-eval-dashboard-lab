@echo off
rem 学生成长全景评价平台：本地一键演示
rem 双击：用 Edge（找不到时用 Chrome）全屏打开数据大屏，并自动开始“巡演”（大屏与各页面无人值守轮播）。
rem 低配电脑：在命令行运行  启动演示.bat static  （关闭动画的静态模式）。
rem 纯静态网页，不联网、不装任何东西、没有后台进程；关掉浏览器窗口就全部结束。
setlocal EnableDelayedExpansion
set "PAGE=%~dp0app\index.html"
if not exist "%PAGE%" (
  echo [出错] 找不到 app\index.html。请确认这个 .bat 和 app 文件夹在同一个目录里。
  pause
  exit /b 1
)
set "Q=?tour"
if /i "%~1"=="static" set "Q=?tour&static"
set "URL=file:///!PAGE:\=/!"
set "URL=!URL: =%%20!!Q!"

set "BROWSER="
for %%B in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
  if not defined BROWSER if exist "%%~B" set "BROWSER=%%~B"
)

echo.
echo   学生成长全景评价平台 · 演示
echo   ------------------------------------------------------------
if defined BROWSER (
  start "" "!BROWSER!" --new-window --start-fullscreen "!URL!"
  echo   已打开数据大屏，并开始自动巡演（一轮约 3 分半，循环播放）。
  echo   F11 退出全屏　P 暂停/继续巡演　S 静态模式　H 操作说明　0-7 切换页面
) else (
  start "" "%PAGE%"
  echo   没有找到 Edge 或 Chrome，已用默认浏览器打开。
  echo   页面打开后按 P 开始巡演。
)
echo   页面上的学校、学生、成绩全部是合成数据。
echo   本窗口 10 秒后自动关闭。
timeout /t 10 >nul
endlocal
