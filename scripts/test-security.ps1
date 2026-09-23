$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$runDir = Join-Path $taskRoot ('.local\security-audit\mongo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$reportDir = Join-Path $taskRoot '.local\security'
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$mongoExe = Join-Path $taskRoot '.local\mongodb\mongod.exe'
$pythonExe = Join-Path $taskRoot 'backend\.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $mongoExe)) { throw 'MongoDB de teste não encontrado.' }
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$process = Start-Process -FilePath $mongoExe -ArgumentList @('--dbpath', "`"$runDir`"", '--bind_ip', '127.0.0.1', '--port', $port, '--replSet', 'security_test', '--logpath', "`"$runDir\mongod.log`"") -WindowStyle Hidden -PassThru
try {
    $env:SECURITY_TEST_MONGO_URL = "mongodb://127.0.0.1:$port/?replicaSet=security_test"
    & $pythonExe (Join-Path $PSScriptRoot 'setup-test-mongo.py') $port
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar réplica isolada.' }
    Push-Location (Join-Path $taskRoot 'backend')
    try {
        & $pythonExe -m pytest tests/test_security.py tests/test_indoor.py tests/test_runtime_config.py -q --basetemp="$runDir\pytest" --junitxml="$reportDir\backend-tests.xml"
        $testExit = $LASTEXITCODE
    } finally { Pop-Location }
    if ($testExit -ne 0) { throw 'Testes de segurança falharam.' }
} finally {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Remove-Item Env:SECURITY_TEST_MONGO_URL -ErrorAction SilentlyContinue
}
