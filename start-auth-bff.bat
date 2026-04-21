@echo off
setlocal EnableExtensions
REM Edit KAI_ROOT if you moved this project folder.
set "KAI_ROOT=c:\Users\vttha\OneDrive\Desktop\advance genai project"
set "AUTH_BFF=%KAI_ROOT%\auth-bff"
if not exist "%AUTH_BFF%\node_modules\" (
  echo Installing auth-bff dependencies...
  call npm install --prefix "%AUTH_BFF%"
)
call npm run start --prefix "%AUTH_BFF%"
