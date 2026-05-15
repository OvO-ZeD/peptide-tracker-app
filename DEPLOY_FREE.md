# Free Deploy Guide (GitHub + Render)

## 1) Create a new GitHub repository

Create a new empty repository named `peptide-tracker-app`.

## 2) Push this app folder as the repo root

Run:

```bash
cd /home/foruse/CODES/peptide_tracker_app
git init
git config user.name "Your Name"
git config user.email "you@example.com"
git add .
git commit -m "Initial peptide tracker app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/peptide-tracker-app.git
git push -u origin main
```

If you want this identity available for all your repos on this machine, use:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 3) Deploy on Render free tier

1. Open Render dashboard.
2. Click New + -> Web Service.
3. Connect your `peptide-tracker-app` GitHub repository.
4. Render should detect `render.yaml` automatically.
5. Confirm deploy.

Current config:

- plan: free
- autoDeploy: true
- build: `pip install -r requirements.txt`
- start: `gunicorn app:app`

## 4) Auto updates

Any future push to `main` will auto redeploy.

```bash
cd /home/foruse/CODES/peptide_tracker_app
git add .
git commit -m "Update tracker"
git push
```

## 5) Open on iPhone

1. Open deployed URL in Safari.
2. Share -> Add to Home Screen.
3. Launch like an app.
