# 把扩展打包成可以直接上传 / 分发的 zip（不含 tests、preview、docs）
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'dist'
$zip = Join-Path $out 'github-workbench.zip'
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('ghw-pack-' + [guid]::NewGuid().ToString('N').Substring(0, 8))

New-Item -ItemType Directory -Force -Path $out, $stage | Out-Null

Copy-Item (Join-Path $root 'manifest.json') $stage
foreach ($dir in @('src', 'assets')) {
  Copy-Item (Join-Path $root $dir) (Join-Path $stage $dir) -Recurse
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force

$size = [math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Host "打包完成: $zip  ($size KB)" -ForegroundColor Green
