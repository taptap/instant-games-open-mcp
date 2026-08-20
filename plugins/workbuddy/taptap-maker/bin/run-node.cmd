@echo off
setlocal EnableExtensions

set "WB_NODE="
if not defined TAPTAP_MAKER_DISTRIBUTION set "TAPTAP_MAKER_DISTRIBUTION=workbuddy_plugin"
if not defined TAPTAP_MCP_CLIENT_IDE set "TAPTAP_MCP_CLIENT_IDE=workbuddy"

if defined WORKBUDDY_EXTRA_PATHS (
  for %%D in ("%WORKBUDDY_EXTRA_PATHS:;=" "%") do (
    if exist "%%~D\node.exe" (
      set "WB_NODE=%%~D\node.exe"
      goto :run
    )
  )
)

if defined WORKBUDDY_CONFIG_DIR (
  set "WB_ROOT=%WORKBUDDY_CONFIG_DIR%"
) else if defined CODEBUDDY_CONFIG_DIR (
  set "WB_ROOT=%CODEBUDDY_CONFIG_DIR%"
) else (
  set "WB_ROOT=%USERPROFILE%\.workbuddy"
)

set "WB_VERSIONS=%WB_ROOT%\binaries\node\versions"
call :resolve_managed_node
if defined WB_NODE goto :run

for %%N in (node.exe) do if not "%%~$PATH:N"=="" set "WB_NODE=%%~$PATH:N"
if defined WB_NODE goto :run

>&2 echo [taptap-maker] FATAL: cannot locate Node.js ^(checked WORKBUDDY_EXTRA_PATHS, WorkBuddy managed binaries, and PATH^)
exit /b 127

:resolve_managed_node
if not exist "%WB_VERSIONS%\" exit /b 0
set "WB_BEST_SCORE=-1"
set "WB_BEST_NODE="
for /f "delims=" %%V in ('dir /b /ad "%WB_VERSIONS%" 2^>nul') do call :consider_managed_version "%WB_VERSIONS%\%%V"
if defined WB_BEST_NODE set "WB_NODE=%WB_BEST_NODE%"
exit /b 0

:consider_managed_version
set "WB_VERSION=%~nx1"
if not "%WB_VERSION:.installing.=%"=="%WB_VERSION%" exit /b 0
if not "%WB_VERSION:.__extract_temp__=%"=="%WB_VERSION%" exit /b 0
set "WB_CANDIDATE="
if exist "%~1\node.exe" (
  set "WB_CANDIDATE=%~1\node.exe"
)
if not defined WB_CANDIDATE if exist "%~1\bin\node.exe" (
  set "WB_CANDIDATE=%~1\bin\node.exe"
)
if not defined WB_CANDIDATE exit /b 0

set "WB_MAJOR="
set "WB_MINOR="
set "WB_PATCH="
set "WB_EXTRA="
for /f "tokens=1-4 delims=.-" %%A in ("%WB_VERSION%") do (
  set "WB_MAJOR=%%A"
  set "WB_MINOR=%%B"
  set "WB_PATCH=%%C"
  set "WB_EXTRA=%%D"
)
if not defined WB_MAJOR exit /b 0
if not defined WB_MINOR exit /b 0
if not defined WB_PATCH exit /b 0
if defined WB_EXTRA exit /b 0
set /a WB_SCORE=WB_MAJOR*1000000+WB_MINOR*1000+WB_PATCH 2>nul
if %WB_SCORE% GTR %WB_BEST_SCORE% (
  set "WB_BEST_SCORE=%WB_SCORE%"
  set "WB_BEST_NODE=%WB_CANDIDATE%"
)
exit /b 0

:run
"%WB_NODE%" %*
exit /b %ERRORLEVEL%
