# tools/night-nightly.ps1 — receipt (a), every night: seal the next night, push the seal, run it, judge it, push the receipt.
# It is written ready, and NOT registered: running it every night pushes a sealed receipt to the public repository each
# night, which is the owner's decision. To switch it on (once, from a PowerShell prompt in the repository):
#   Register-ScheduledTask -TaskName 'living-seed-night' -Trigger (New-ScheduledTaskTrigger -Daily -At 02:30) `
#     -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -File `"$PWD\tools\night-nightly.ps1`"")
# To switch it off: Unregister-ScheduledTask -TaskName 'living-seed-night' -Confirm:$false
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$n = 1 + @(Get-ChildItem data/nights -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^[0-9]+$' }).Count
$push = { git -c credential.helper= -c credential.helper=store push -q origin main }
node tools/night.mjs seal $n;            if (-not $?) { throw "night $n could not be sealed" }
git add "data/nights/$n/prereg.json"; git commit -q -m "night $n sealed — before it runs"; & $push
node tools/night.mjs run $n;             if (-not $?) { throw "night $n did not run" }
git add "data/nights/$n/record.json"; git commit -q -m "night $n measured"
node tools/order.mjs --organ "night-$n"; if (-not $?) { throw "night $n's order does not hold" }
node tools/night.mjs judge $n --write
node tools/tally.mjs --write        # the header counts every night too
git add "data/nights/$n/verdict.json" index.html; git commit -q -m "night $n judged"; & $push
