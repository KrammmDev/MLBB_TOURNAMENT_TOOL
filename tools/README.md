# Optional Android USB capture prerequisite

Download **Android SDK Platform Tools** from Google's official page:
https://developer.android.com/tools/releases/platform-tools

On the Windows capture PC, extract the downloaded `platform-tools` folder into this `tools` folder. The resulting executable must be at:

```text
MLBB_TOURNAMENT_TOOL/tools/platform-tools/adb.exe
```

Keep the accompanying DLLs/files from the official package together. This directory is ignored by Git. No ADB binaries or Android APKs are bundled by this project.

Alternatively, use an existing Platform Tools installation through PATH, or set `MLBB_ADB_PATH` to the full executable path before the usual `npm start`:

```powershell
$env:MLBB_ADB_PATH = 'C:\Android\platform-tools\adb.exe'
npm start
```

USB capture is optional; the server and camera/window/image modes still start without ADB. No separate OCR application, OBS setup, Android Studio installation or scrcpy window is required for this mode. Windows may require the phone manufacturer's USB driver. Enable Developer options / USB debugging on the phone, connect a USB **data** cable, unlock it and approve the computer's debugging key.

Open `http://localhost:3000/ocr-control.html` on this PC, click **Detect phones**, select the authorized phone, then **Start USB capture**. Device control/screenshots are restricted to localhost. The normal broadcast output remains accessible to the production LAN.

This initial adapter captures native PNG screenshots through ADB; it is not a 30/60 fps video stream. Capture speed and live OCR accuracy must be measured on the actual phone/PC. No ADB `kill-server`, app installation, root access or game-memory extraction is used.
