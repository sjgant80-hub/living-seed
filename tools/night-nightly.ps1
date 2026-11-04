# tools/night-nightly.ps1 - receipt (a), every night: seal the next night, push the seal, run it, judge it, push the receipt.
# REGISTERED on Simon's yes (2026-10-19) as the scheduled task living-seed-night, daily at 02:30. Each night pushes a
# sealed receipt to the public repository. Pure ASCII on purpose: Windows PowerShell 5.1 reads a BOM-less script as ANSI.
#   Register-ScheduledTask -TaskName 'living-seed-night' -Trigger (New-ScheduledTaskTrigger -Daily -At 02:30) `
#     -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -File `"$PWD\tools\night-nightly.ps1`"")
# To switch it off: Unregister-ScheduledTask -TaskName 'living-seed-night' -Confirm:$false
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
# Start from what the public repository holds: a commit pushed from elsewhere since last night would otherwise make
# tonight's pushes non-fast-forward, and the night would be sealed here but never published. A pull that cannot
# fast-forward stops the night before anything is sealed. A seal that cannot be pushed yet is warned about and the
# night still runs to its receipt (stopping there would leave a sealed night that never runs, which CI refuses);
# a receipt that cannot be pushed stops loudly (the task's last result is not 0) and goes out with the next night.
git pull -q --ff-only origin main;       if ($LASTEXITCODE -ne 0) { throw "could not fast-forward to origin/main before tonight's night" }
$n = 1 + @(Get-ChildItem data/nights -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^[0-9]+$' }).Count
$push = { git -c credential.helper= -c credential.helper=store push -q origin main | Out-Null; $LASTEXITCODE -eq 0 }
node tools/night.mjs seal $n;            if (-not $?) { throw "night $n could not be sealed" }
git add "data/nights/$n/prereg.json"; git commit -q -m "night $n sealed - before it runs"; if (-not (& $push)) { Write-Warning "the seal of night $n could not be pushed yet; it goes out with the receipt" }
node tools/night.mjs run $n;             if (-not $?) { throw "night $n did not run" }
git add "data/nights/$n/record.json"; git commit -q -m "night $n measured"
node tools/order.mjs --organ "night-$n"; if (-not $?) { throw "night $n's order does not hold" }
node tools/night.mjs judge $n --write
node tools/tally.mjs --write        # the header counts every night too
node tools/geo.mjs --write          # and so do the JSON-LD, llms.txt and the README table
node tools/csp.mjs                  # the JSON-LD is an inline script: re-pin the policy to it
git add "data/nights/$n/verdict.json" index.html llms.txt README.md robots.txt sitemap.xml; git commit -q -m "night $n judged"; if (-not (& $push)) { throw "the receipt of night $n could not be pushed; it is committed here and goes out with the next night" }
