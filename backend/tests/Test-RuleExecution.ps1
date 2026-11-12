param([string]$Server = 'localhost', [int]$Port = 5200)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Test-RulePersistence.ps1') -Server $Server -Port $Port -IncludeExecution
