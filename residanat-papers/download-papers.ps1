# Download Residanat past papers (sujets) listed in papers-url-manifest.csv.
# Sequential (polite to web.archive.org), curl.exe, PDF-magic verification,
# one retry on failure. Output: download-results.csv next to this script.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rows = Import-Csv (Join-Path $root "papers-url-manifest.csv")
$results = New-Object System.Collections.Generic.List[string]
$results.Add("faculty,year,label,url,file,bytes,ok")
$okCount = 0; $failCount = 0

foreach ($row in $rows) {
  $dir = Join-Path $root $row.faculty
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $file = Join-Path $dir ("{0}_{1}.pdf" -f $row.year, $row.label)
  # Idempotent: skip files already downloaded and verified (re-run after timeout)
  if (Test-Path $file) {
    $bytes = (Get-Item $file).Length
    $head = [System.IO.File]::ReadAllBytes($file)[0..3]
    $magic = [System.Text.Encoding]::ASCII.GetString($head)
    if ($bytes -gt 10240 -and $magic -eq "%PDF") {
      $okCount++
      $results.Add(('{0},{1},{2},{3},{4},{5},{6}' -f $row.faculty, $row.year, $row.label, $row.url, (Split-Path -Leaf $file), $bytes, "yes"))
      Write-Output ("SKIP-OK {0}/{1} {2} {3} {4}" -f ($okCount + $failCount), $rows.Count, $row.faculty, $row.year, $row.label)
      continue
    }
  }
  $ok = "no"
  $bytes = 0
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    & curl.exe -sSfL --max-time 180 -o $file $row.url 2>$null
    if ($LASTEXITCODE -eq 0 -and (Test-Path $file)) {
      $bytes = (Get-Item $file).Length
      $head = [System.IO.File]::ReadAllBytes($file)[0..3]
      $magic = [System.Text.Encoding]::ASCII.GetString($head)
      if ($bytes -gt 10240 -and $magic -eq "%PDF") { $ok = "yes"; break }
    }
    Start-Sleep -Seconds 3
  }
  if ($ok -eq "yes") { $okCount++ } else { $failCount++ }
  $results.Add(('{0},{1},{2},{3},{4},{5},{6}' -f $row.faculty, $row.year, $row.label, $row.url, (Split-Path -Leaf $file), $bytes, $ok))
  Write-Output ("{0}/{1} {2} {3} {4} {5}B" -f ($okCount + $failCount), $rows.Count, $row.faculty, $row.year, $row.label, $bytes)
  Start-Sleep -Milliseconds 800
}

$results | Set-Content (Join-Path $root "download-results.csv") -Encoding UTF8
Write-Output ("DONE ok={0} fail={1}" -f $okCount, $failCount)
