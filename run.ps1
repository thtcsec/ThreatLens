Write-Host "Starting ThreatLens Backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; if (!(Test-Path .venv)) { Write-Error '.venv not found!' }; .\.venv\Scripts\activate.ps1; pip install -r requirements.txt; python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

Write-Host "Starting ThreatLens Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm install; npm run dev"
