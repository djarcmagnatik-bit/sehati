<#
  One-time local setup (Windows):
    1. Creates PostgreSQL role + development and test databases
    2. Writes .env with a freshly generated random password for the app role
    3. Applies migrations and seeds reference data on both databases

  Run from the project root:
    powershell -ExecutionPolicy Bypass -File scripts\setup-local.ps1

  psql will ask for the password of the PostgreSQL superuser (default user: postgres).
  The password is typed by you into psql; this script never stores it.
#>
param(
  [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin",
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$SuperUser = "postgres",
  [string]$AppUser = "wedding_planner",
  [string]$DevDb = "wedding_planner",
  [string]$TestDb = "wedding_planner_test"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Invoke-Step([string]$Title, [scriptblock]$Command) {
  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Langkah gagal: $Title (exit code $LASTEXITCODE)" }
}

$psql = Join-Path $PgBin "psql.exe"
if (-not (Test-Path $psql)) { throw "psql.exe tidak ditemukan di '$PgBin'. Gunakan parameter -PgBin." }
if (Test-Path ".env") { throw ".env sudah ada. Rename/hapus dulu jika ingin menjalankan setup ulang." }
if (-not (Test-Path "node_modules")) {
  Invoke-Step "Install dependency (pnpm install)" { pnpm install }
}

# Random 48-hex-char password for the application role (URL-safe, no escaping needed).
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$appPassword = -join ($bytes | ForEach-Object { $_.ToString("x2") })

Invoke-Step "Membuat role '$AppUser' dan database '$DevDb' + '$TestDb' (masukkan password user '$SuperUser')" {
  & $psql -h $PgHost -p $PgPort -U $SuperUser -d postgres `
    -v ON_ERROR_STOP=1 `
    -v "app_user=$AppUser" -v "app_password=$appPassword" `
    -v "dev_db=$DevDb" -v "test_db=$TestDb" `
    -f "scripts/setup-db.sql"
}

$envContent = @"
DATABASE_URL="postgresql://${AppUser}:${appPassword}@${PgHost}:${PgPort}/${DevDb}"
DATABASE_URL_TEST="postgresql://${AppUser}:${appPassword}@${PgHost}:${PgPort}/${TestDb}"
APP_URL="http://localhost:3000"
MAIL_DRIVER="file"
MAIL_FILE_DIR=".data/mail"
"@

# UTF-8 without BOM (a BOM would corrupt the first variable name for dotenv).
[System.IO.File]::WriteAllText((Join-Path $projectRoot ".env"), $envContent + "`n", (New-Object System.Text.UTF8Encoding $false))
Write-Host ""
Write-Host "==> .env dibuat (password role disimpan hanya di .env, tidak ditampilkan)" -ForegroundColor Cyan

Invoke-Step "Migrasi database development" { pnpm db:deploy }
Invoke-Step "Seed database development" { pnpm db:seed }
Invoke-Step "Migrasi database test" { pnpm db:test:deploy }
Invoke-Step "Seed database test" { pnpm db:test:seed }

Write-Host ""
Write-Host "Setup selesai." -ForegroundColor Green
Write-Host "Jalankan aplikasi:  pnpm dev   lalu buka http://localhost:3000"
