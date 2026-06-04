# Windows Setup — Lead Pipeline

Step-by-step, from a fresh extraction. Run everything in **PowerShell**.

## 0. Install Python (skip if you already have 3.10+)
- Download from https://www.python.org/downloads/windows/ (3.11 or 3.12).
- Run the installer and TICK "Add python.exe to PATH" on the first screen.
- Verify:  `python --version`

## 1. Open the project folder
After extracting the zip, cd into the folder that contains `requirements.txt`:

```powershell
cd "C:\path\to\lead-pipeline-py"
dir
```

You should see: `leadpipeline` (folder), `requirements.txt`, `dryrun.py`,
`setenv.ps1`, `README.md`, `SETUP_WINDOWS.md`.

## 2. Create + activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Your prompt should now start with `(.venv)`.

If you see "running scripts is disabled on this system", run this once
(answer Y), then re-run the activate line above:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 3. Install dependencies

```powershell
pip install -r requirements.txt
```

## 4. Confirm everything imports

```powershell
python -c "import leadpipeline.main; print('imports OK')"
```

Should print `imports OK`.

## 5. Try it WITHOUT real keys (dry run)
This uses fake data, makes no real API calls, sends no real email. It proves the
whole chain works and produces a sample report.

```powershell
python dryrun.py
notepad report.csv
```

To test a different sender, edit the `FROM_EMAIL` line near the top of
`dryrun.py` and run it again.

## 6. Real run (once you have all 5 API keys)

Edit `setenv.ps1`, put your real keys in, then:

```powershell
.\setenv.ps1
python -m leadpipeline.main         # terminal approval (y / N / s per draft)
```

Or the browser version:

```powershell
.\setenv.ps1
uvicorn leadpipeline.api:app --reload
# open http://127.0.0.1:8000  ;  Ctrl+C in PowerShell to stop
```

Reports are written as `report.csv` and `report.json` in the project folder
(or downloadable from the web UI).

## Notes
- Env vars set with `setenv.ps1` only last for the current PowerShell window.
  Run `.\setenv.ps1` again in any new window.
- The 4 vendor API clients (Ocean, Kipplo, EazyReach, Brevo) use best-guess
  request/response shapes. Your first live call may need field-name tweaks to
  match each provider's real API.
