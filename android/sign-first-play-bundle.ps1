# Run from PowerShell. The JDK tools prompt directly for the keystore password.
[CmdletBinding()]
param(
    [string]$UnsignedBundle,
    [string]$KeyStore = (Join-Path $env:USERPROFILE 'sorow-keys\sorow-upload.p12'),
    [string]$KeyAlias = 'sorow-upload'
)

$ErrorActionPreference = 'Stop'
if (-not $PSBoundParameters.ContainsKey('UnsignedBundle')) {
    $UnsignedBundle = Join-Path $PSScriptRoot 'sorow-1.0.0-UNSIGNED.aab'
}
$source = (Resolve-Path -LiteralPath $UnsignedBundle).Path
$folder = Split-Path -Parent $source
$output = Join-Path $folder 'sorow-1.0.0-PLAY.aab'
if ([IO.Path]::GetFullPath($output) -eq $source) { throw 'Choose the UNSIGNED input bundle.' }
if (Test-Path -LiteralPath $output) { throw "A signed output already exists. Move it first if you need to sign again: $output" }

function Find-JdkTool([string]$Name) {
    if ($env:JAVA_HOME) {
        $exe = Join-Path $env:JAVA_HOME "bin\$Name.exe"
        if (Test-Path -LiteralPath $exe) { return $exe }
    }
    return (Get-Command "$Name.exe" -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
}

$keytool = Find-JdkTool 'keytool'
$jarsigner = Find-JdkTool 'jarsigner'
if (!(Test-Path -LiteralPath $KeyStore -PathType Leaf)) {
    Write-Host "Creating your first upload key at $KeyStore"
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($KeyStore))) | Out-Null
    & $keytool -genkeypair -storetype PKCS12 -keystore $KeyStore -alias $KeyAlias -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Sorow Upload'
    if ($LASTEXITCODE -ne 0) { throw 'Key creation did not finish.' }
}

$pending = Join-Path $folder ("signing-" + [guid]::NewGuid() + ".tmp")
try {
    & $jarsigner -keystore $KeyStore -signedjar $pending $source $KeyAlias
    if ($LASTEXITCODE -ne 0) { throw 'Signing failed. Check the keystore, alias and password.' }
    & $jarsigner -verify $pending
    if ($LASTEXITCODE -ne 0) { throw 'Bundle signature verification failed.' }
    [IO.File]::Move($pending, $output)
    Write-Host "Upload this file to Play Console: $output"
    Write-Host "Back up your upload key and keep the password in your password manager: $KeyStore"
} finally {
    if (Test-Path -LiteralPath $pending) { Remove-Item -LiteralPath $pending }
}
