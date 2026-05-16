# Auto Deploy Workflow

This project can auto-commit and auto-push local changes to `main`.
Render then auto-deploys from `main`.

## Start

```bash
cd /home/foruse/CODES/peptide_tracker_app
INTERVAL_SECONDS=8 ./auto_deploy.sh
```

## Stop

Press `Ctrl + C` in the terminal where it is running.

## Optional background run

```bash
cd /home/foruse/CODES/peptide_tracker_app
nohup env INTERVAL_SECONDS=8 ./auto_deploy.sh > /dev/null 2>&1 &
```

## View activity log

```bash
cd /home/foruse/CODES/peptide_tracker_app
tail -f autodeploy.log
```

## Important limits

- Render still needs build/deploy time after each push.
- Free tier can cold-start after inactivity.
- Very frequent edits will create many commits.
