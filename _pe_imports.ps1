$ErrorActionPreference = 'Continue'
$exe = 'D:\arkevolvedserver\ShooterGame\Binaries\Win64\ShooterGameServer.exe'

$fs = [System.IO.File]::OpenRead($exe)
$br = New-Object System.IO.BinaryReader($fs)

# DOS header
$fs.Position = 0x3C
$e_lfanew = $br.ReadInt32()

# PE signature
$fs.Position = $e_lfanew
$sig = $br.ReadUInt32()
if ($sig -ne 0x00004550) { Write-Output "NOT PE"; $fs.Close(); return }

# COFF header
$machine = $br.ReadUInt16()
$numSections = $br.ReadUInt16()
$br.ReadUInt32() # timestamp
$br.ReadUInt32() # symtab
$br.ReadUInt32() # nsyms
$sizeOfOptionalHeader = $br.ReadUInt16()
$characteristics = $br.ReadUInt16()

Write-Output ("Machine=0x{0:X4} Sections={1} OptHdr={2}" -f $machine, $numSections, $sizeOfOptionalHeader)

# Optional header (PE32+ if magic 0x20B)
$optStart = $fs.Position
$magic = $br.ReadUInt16()
$is64 = ($magic -eq 0x20B)
Write-Output ("Optional header magic=0x{0:X4} (64-bit={1})" -f $magic, $is64)

# Data directories: for PE32+, offset of data dir from optStart = 112; for PE32 = 96
$ddOffset = if ($is64) { 112 } else { 96 }
$fs.Position = $optStart + $ddOffset + 8  # skip first directory (export), go to import (index 1)
$importRVA = $br.ReadUInt32()
$importSize = $br.ReadUInt32()
Write-Output ("Import directory RVA=0x{0:X} Size=0x{1:X}" -f $importRVA, $importSize)

# Section table: after optional header
$sectionTableOff = $optStart + $sizeOfOptionalHeader
$sections = @()
$fs.Position = $sectionTableOff
for ($i=0; $i -lt $numSections; $i++) {
  $name = [System.Text.Encoding]::ASCII.GetString($br.ReadBytes(8)).TrimEnd([char]0)
  $br.ReadUInt32() | Out-Null # VirtualSize
  $virtAddr = $br.ReadUInt32()
  $rawSize = $br.ReadUInt32()
  $rawOff = $br.ReadUInt32()
  $br.ReadBytes(16) | Out-Null # rest
  $sections += [PSCustomObject]@{ Name=$name; VA=$virtAddr; RawOff=$rawOff; RawSize=$rawSize }
}
$sections | ForEach-Object { Write-Output ("Section {0}: VA=0x{1:X} RawOff=0x{2:X} Size=0x{3:X}" -f $_.Name, $_.VA, $_.RawOff, $_.RawSize) }

# RVA -> file offset
function RvaToOffset($rva) {
  foreach ($s in $sections) {
    if ($rva -ge $s.VA -and $rva -lt ($s.VA + $s.RawSize)) {
      return $rva - $s.VA + $s.RawOff
    }
  }
  return $rva
}

# Parse import descriptors
Write-Output "=== IMPORTED DLLs ==="
$off = RvaToOffset $importRVA
$descOff = $off
$count = 0
while ($true) {
  $fs.Position = $descOff
  $origThunk = $br.ReadUInt32()
  $timeStamp = $br.ReadUInt32()
  $forwarder = $br.ReadUInt32()
  $nameRVA = $br.ReadUInt32()
  $firstThunk = $br.ReadUInt32()
  if ($nameRVA -eq 0) { break }
  $nameOff = RvaToOffset $nameRVA
  $fs.Position = $nameOff
  $dllName = ""
  while ($true) {
    $c = $br.ReadByte()
    if ($c -eq 0) { break }
    $dllName += [char]$c
  }
  $dllPath = Join-Path 'D:\arkevolvedserver\ShooterGame\Binaries\Win64' $dllName
  $sysPath = Join-Path 'C:\Windows\System32' $dllName
  $exists = (Test-Path $dllPath) -or (Test-Path $sysPath)
  $loc = if (Test-Path $dllPath) { 'SERVER' } elseif (Test-Path $sysPath) { 'SYSTEM32' } else { 'MISSING!' }
  Write-Output ("{0}  [{1}]" -f $dllName, $loc)
  $count++
  $descOff += 20
  if ($count -gt 200) { break }
}
$fs.Close()
Write-Output ("Total imported DLLs: {0}" -f $count)
