@echo off
call "%~dp0run-node.cmd" "%~dp0..\dist\maker.js" %*
exit /b %ERRORLEVEL%
