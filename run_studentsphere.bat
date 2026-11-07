@echo off
title AU StudentSphere - Africa University
echo ========================================================
echo  AU StudentSphere - University Student Profile System
echo  College of Engineering and Applied Sciences
echo  Africa University
echo ========================================================
echo.
cd /d "%~dp0AU-STUDENTSPHERE-main" 2>nul || cd /d "%~dp0"
echo Starting AU StudentSphere server...
node server.js
pause
