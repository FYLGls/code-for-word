@echo off
chcp 65001 >nul
cd /d "%~dp0"
title CodePaste · Dev

where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js LTS first: https://nodejs.org/
  echo End users should install CodePaste-Setup from GitHub Releases.
  pause
  exit /b 1
)

if not exist "node_modules\" call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

call npm run dev
if errorlevel 1 (
  echo Failed to start.
  pause
  exit /b 1
)
