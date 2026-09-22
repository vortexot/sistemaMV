$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$localDir = Join-Path $projectRoot '.local'
$uvExe = Join-Path $env:USERPROFILE '.local\bin\uv.exe'
New-Item -ItemType Directory -Force $localDir | Out-Null

function Test-LocalPort([int]$port) {
    $connection = New-Object System.Net.Sockets.TcpClient
    try { $connection.Connect('127.0.0.1', $port); return $true }
    catch { return $false }
    finally { $connection.Dispose() }
}

function Wait-LocalPort([int]$port, [string]$service) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (Test-LocalPort $port) { Write-Host "$service pronto na porta $port"; return }
        Start-Sleep -Seconds 1
    }
    throw "$service nao iniciou. Consulte os logs em $localDir"
}

if (!(Test-LocalPort 27017)) {
    $mongoExe = Get-ChildItem (Join-Path $localDir 'mongodb') -Recurse -Filter mongod.exe | Select-Object -First 1 -ExpandProperty FullName
    if (!$mongoExe) { throw 'MongoDB local nao encontrado em .local/mongodb.' }
    $dataDir = Join-Path $localDir 'mongo-data'
    $mongoLog = Join-Path $localDir 'mongodb.log'
    New-Item -ItemType Directory -Force $dataDir | Out-Null
    Start-Process -FilePath $mongoExe -ArgumentList @('--dbpath', "`"$dataDir`"", '--bind_ip', '127.0.0.1', '--port', '27017', '--logpath', "`"$mongoLog`"", '--logappend') -WindowStyle Hidden | Out-Null
    Wait-LocalPort 27017 'MongoDB'
}

if (!(Test-LocalPort 8001)) {
    Push-Location (Join-Path $projectRoot 'backend')
    try {
        $pythonExe = Join-Path (Get-Location).Path '.venv\Scripts\python.exe'
        if (!(Test-Path -LiteralPath $pythonExe)) {
            & $uvExe venv --python 3.12 .venv
            if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar Python.' }
        }
        & $uvExe pip install --python $pythonExe -r requirements.txt
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependencias.' }
        Start-Process -FilePath $pythonExe -WorkingDirectory (Get-Location).Path -ArgumentList @('-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8001') -RedirectStandardOutput (Join-Path $localDir 'backend.log') -RedirectStandardError (Join-Path $localDir 'backend-error.log') -WindowStyle Hidden | Out-Null
    } finally { Pop-Location }
    Wait-LocalPort 8001 'Backend'
}

if (!(Test-LocalPort 3000)) {
    $nodeExe = (Get-Command node.exe).Source
    $frontendDir = Join-Path $projectRoot 'frontend'
    $viteScript = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
    $env:DISABLE_VISUAL_EDITS = 'true'
    $env:DISABLE_EMERGENT_OVERLAY = 'true'
    Start-Process -FilePath $nodeExe -WorkingDirectory $frontendDir -ArgumentList @("`"$viteScript`"", '--host', '127.0.0.1', '--port', '3000', '--strictPort') -RedirectStandardOutput (Join-Path $localDir 'frontend.log') -RedirectStandardError (Join-Path $localDir 'frontend-error.log') -WindowStyle Hidden | Out-Null
    Wait-LocalPort 3000 'Frontend'
}

$catalog = Invoke-RestMethod -Uri 'http://localhost:3000/api/catalog/products' -TimeoutSec 20
Write-Host 'Projeto iniciado: http://localhost:3000'
Write-Host 'Admin: http://localhost:3000/admin/midia-indoor'
Write-Host 'Os processos continuam em segundo plano. Logs e banco ficam em .local.'
