<#
.SYNOPSIS
    本地 CI 门槛：运行全量 pytest，并以 pytest 退出码作为脚本退出码。

.DESCRIPTION
    对应 P6 DoD「CI 强制运行」。与 .github/workflows/ci.yml 执行的命令一致，
    便于在推送前本地复现 CI 结果。

.PARAMETER BaseTemp
    可选。pytest 的 --basetemp 目录。受限环境下（tmp 目录不可枚举）可指向
    workspace 内目录以绕开系统临时目录限制；留空则使用 pytest 默认值。

.EXAMPLE
    pwsh app/scripts/run_ci.ps1

.EXAMPLE
    pwsh app/scripts/run_ci.ps1 -BaseTemp .pytest_tmp
#>
param(
    [string]$BackendDir = (Join-Path $PSScriptRoot '..\backend'),
    [string]$BaseTemp = ''
)

$ErrorActionPreference = 'Stop'

$BackendDir = (Resolve-Path $BackendDir).Path
$python = Join-Path $BackendDir '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    $python = 'python'
}

Write-Host "[run_ci] backend = $BackendDir"
Write-Host "[run_ci] python  = $python"

$pytestArgs = @('-m', 'pytest', '-q')
if ($BaseTemp) {
    $pytestArgs += @('--basetemp', $BaseTemp, '-p', 'no:cacheprovider')
}

Push-Location $BackendDir
try {
    & $python @pytestArgs
    $code = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($code -ne 0) {
    Write-Host "[run_ci] FAILED (pytest exit $code)"
    exit $code
}
Write-Host "[run_ci] OK"
exit 0
