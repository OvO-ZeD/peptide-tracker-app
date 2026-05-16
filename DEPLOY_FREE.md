# Free Deploy Guide (GitHub + Render)

## 1) Create a new GitHub repository

Create a new empty repository named `peptide-tracker-app`.

## 2) Push this app folder as the repo root

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

If needed globally:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 3) Deploy on Render free tier

1. Open Render dashboard.
2. Click New + -> Web Service.
3. Connect `peptide-tracker-app` repository.
4. Render detects `render.yaml`.
5. Confirm deploy.

Current config:

- service: `peptide-tracker-app`
- plan: free
- autoDeploy: true
- build: `pip install -r requirements.txt`
- start: `gunicorn app:app`

## 4) Auto updates

Any push to `main` auto redeploys.

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
