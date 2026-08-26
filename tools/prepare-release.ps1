param(
  [Parameter(Mandatory = $true)][string]$Apk,
  [Parameter(Mandatory = $true)][string]$BuildTools
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$config = Get-Content -LiteralPath (Join-Path $repoRoot 'release.config.json') -Raw | ConvertFrom-Json
$app = (Get-Content -LiteralPath (Join-Path $repoRoot 'app.json') -Raw | ConvertFrom-Json).expo
$apkPath = (Resolve-Path -LiteralPath $Apk).Path
$toolsPath = (Resolve-Path -LiteralPath $BuildTools).Path
$toolSuffix = if ($env:OS -eq 'Windows_NT') { '.bat' } else { '' }
$exeSuffix = if ($env:OS -eq 'Windows_NT') { '.exe' } else { '' }
& node (Join-Path $PSScriptRoot 'check-version.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Version validation failed' }
$verification = & (Join-Path $toolsPath "apksigner$toolSuffix") verify --verbose --print-certs $apkPath
if ($LASTEXITCODE -ne 0) { throw 'APK signature invalid' }
$certificate = ($verification | Select-String '^Signer #1 certificate SHA-256 digest:').Line
if (-not $certificate -or ($certificate.Split(':', 2)[1].Trim().ToLower() -ne $config.certificateSha256)) {
  throw 'APK does not use the official signing certificate'
}
& (Join-Path $toolsPath "zipalign$exeSuffix") -c -P 16 4 $apkPath
if ($LASTEXITCODE -ne 0) { throw 'APK alignment invalid' }
$badging = & (Join-Path $toolsPath "aapt$exeSuffix") dump badging $apkPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect APK manifest' }
$packageLine = ($badging | Select-String '^package:').Line
$expected = "name='$($config.applicationId)' versionCode='$($app.android.versionCode)' versionName='$($app.version)'"
if (-not $packageLine.Contains($expected)) { throw 'APK package/version differs from source' }
if ($badging -match '^application-debuggable') { throw 'Debug APK cannot be released' }
$notes = Join-Path $repoRoot "docs/releases/$($app.version).md"
if (-not (Test-Path -LiteralPath $notes)) { throw 'Release notes missing' }
$output = Join-Path $repoRoot "release-output/$($app.version)"
New-Item -ItemType Directory -Path $output -Force | Out-Null
$name = "MusicBank-$($app.version)-build$($app.android.versionCode).apk"
$destination = Join-Path $output $name
Copy-Item -LiteralPath $apkPath -Destination $destination -Force
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLower()
"$hash  $name" | Set-Content -LiteralPath "$destination.sha256" -Encoding ascii
$manifest = [ordered]@{
  version = $app.version
  versionCode = $app.android.versionCode
  applicationId = $config.applicationId
  apk = $name
  bytes = (Get-Item -LiteralPath $destination).Length
  sha256 = $hash
  certificateSha256 = $config.certificateSha256
  url = "https://github.com/$($config.repository)/releases/download/v$($app.version)/$name"
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'release.json') -Encoding utf8
Write-Output "Verified release assets: $output"
Write-Output "SHA256: $hash"
