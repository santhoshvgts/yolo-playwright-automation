#!/bin/bash
# Sequential Playwright run queue. Each line of queue.txt: <name>;;<grep pattern>;;<spec>
S="${1:?usage: queue.sh <scratch dir>}"
cd /d/YOLO/yolo-playwright-automation
touch "$S/queue.txt" "$S/queue.done"
while true; do
  # wait while any other playwright test run is alive
  busy() { powershell -NoProfile -Command "@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'cli\.js\"? test ' }).Count" 2>/dev/null | tr -d '
'; }
  while [ "$(busy)" != "0" ]; do sleep 10; done
  line=$(grep -vxF -f "$S/queue.done" "$S/queue.txt" | head -1)
  if [ -z "$line" ]; then sleep 10; continue; fi
  name=${line%%;;*}; rest=${line#*;;}; pat=${rest%%;;*}; spec=${rest#*;;}
  # wait for the app to be reachable (a DNS / network drop fails every test in seconds)
  until [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://invoice.test.vgts.xyz/)" = "200" ]; do echo "NET down $(date +%H:%M)" >> "$S/queue.log"; sleep 60; done
  echo "START $name" >> "$S/queue.log"
  npx playwright test "$spec" --grep "$pat" --output="test-results/$name" --reporter=list > "$S/$name.log" 2>&1
  echo "EXIT $?" >> "$S/$name.log"
  echo "$line" >> "$S/queue.done"
  echo "DONE $name $(grep -E '^\s+[0-9]+ (passed|failed)' "$S/$name.log" | tr '\n' ' ')" >> "$S/queue.log"
done
