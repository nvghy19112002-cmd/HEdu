# Quét tệp bằng Microsoft Defender trước khi phát hành (chỉ quét, không chạy tệp, không cách ly).
# Bộ cài NSIS được giải nén bằng 7-Zip để quét cả hedu.exe bên trong (quét bộ cài nguyên khối có thể bỏ sót).
# Thoát 1 nếu Defender báo bất kỳ tệp nào, hoặc nếu không quét được (an toàn: không quét được = không phát hành).
# Dùng:  pwsh scripts/quet-defender.ps1 <tệp hoặc mẫu tệp> [...]
param([Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Paths)
$ErrorActionPreference = 'Stop'

$mp = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'
if (-not (Test-Path $mp)) { Write-Host "::error::Không có Microsoft Defender (MpCmdRun.exe) trên máy này."; exit 1 }

# Cập nhật định nghĩa mới nhất; lỗi mạng thì vẫn quét bằng bản đang có nhưng ghi rõ.
& $mp -SignatureUpdate | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Host "::warning::Không cập nhật được định nghĩa Defender (mã $LASTEXITCODE), quét bằng bản hiện có." }
try { Write-Host ('Định nghĩa Defender: ' + (Get-MpComputerStatus).AntivirusSignatureVersion) } catch { }

$files = @()
foreach ($p in $Paths) { $files += @(Get-ChildItem -Path $p -File) }
if ($files.Count -eq 0) { Write-Host "::error::Không tìm thấy tệp nào để quét: $($Paths -join ', ')"; exit 1 }

$sevenZip = Join-Path $env:ProgramFiles '7-Zip\7z.exe'
$targets = @()
foreach ($f in $files) {
  $targets += $f.FullName
  if ($f.Name -like '*setup.exe') {
    if (-not (Test-Path $sevenZip)) { Write-Host "::error::Thiếu 7-Zip để giải nén $($f.Name)."; exit 1 }
    $out = Join-Path ([IO.Path]::GetTempPath()) ('hedu-quet-' + [guid]::NewGuid())
    & $sevenZip x $f.FullName "-o$out" -y | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "::error::Không giải nén được $($f.Name) (mã $LASTEXITCODE)."; exit 1 }
    $targets += @(Get-ChildItem $out -Recurse -File | ForEach-Object FullName)
  }
}

$bad = 0
foreach ($t in $targets) {
  $log = & $mp -Scan -ScanType 3 -File $t -DisableRemediation 2>&1 | Out-String
  switch ($LASTEXITCODE) {
    0 { Write-Host "  sạch: $t" }
    2 { Write-Host "::error::Defender báo: $t`n$log"; $bad++ }
    default { Write-Host "::error::Không quét được $t (mã $LASTEXITCODE)`n$log"; $bad++ }
  }
}
if ($bad -gt 0) { Write-Host "::error::$bad tệp bị Defender báo hoặc không quét được. KHÔNG phát hành."; exit 1 }
Write-Host "Defender: $($targets.Count) tệp đều sạch."
