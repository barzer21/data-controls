param([string]$Server = 'localhost', [string]$ApiAssemblyPath = '')

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$apiDirectory = Join-Path $repositoryRoot 'backend/DataControls.Api'
$apiDll = if ($ApiAssemblyPath) { (Resolve-Path -LiteralPath $ApiAssemblyPath).Path }
    else { (Resolve-Path (Join-Path $apiDirectory 'bin/Release/net10.0/DataControls.Api.dll')).Path }
# Never accept an existing database name, including the development database.
$testDatabase = 'DataControlsSetupTest_' + [guid]::NewGuid().ToString('N')
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) $testDatabase
New-Item -ItemType Directory -Path (Join-Path $testRoot 'Metadata') -Force | Out-Null
Copy-Item (Join-Path $apiDirectory 'Metadata/metadata.json') (Join-Path $testRoot 'Metadata/metadata.json')
$connection = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$connection['Data Source'] = $Server
$connection['Initial Catalog'] = $testDatabase
$connection['Integrated Security'] = $true
$connection['TrustServerCertificate'] = $true
$connection['Connect Timeout'] = 5
[System.IO.File]::WriteAllText((Join-Path $testRoot 'appsettings.json'),
    (@{ ConnectionStrings = @{ DefaultConnection = $connection.ConnectionString } } | ConvertTo-Json),
    [System.Text.UTF8Encoding]::new($false))
$apiProcess = $null
$created = $false
$script:passed = 0

function Assert-Test([bool]$Condition, [string]$Name) {
    if (!$Condition) { throw "FAILED $Name" }
    $script:passed++
    Write-Host "PASS $Name"
}
function Invoke-Sql([string]$Query, [string]$Database = $testDatabase) {
    $result = & sqlcmd -S $Server -E -C -b -l 10 -d $Database -h -1 -W -Q "SET NOCOUNT ON; $Query"
    if ($LASTEXITCODE -ne 0) { throw "SQL check failed: $result" }
    return ($result -join "`n").Trim()
}
function Invoke-SetupScript([string]$Name) {
    $source = Join-Path $repositoryRoot "database/$Name"
    $target = Join-Path $testRoot $Name
    [System.IO.File]::WriteAllText($target,
        ([System.IO.File]::ReadAllText($source)).Replace('DataControlsDb', $testDatabase),
        [System.Text.UTF8Encoding]::new($false))
    & sqlcmd -S $Server -E -C -b -l 10 -f 65001 -i $target | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Setup failed: $Name. Logs/scripts: $testRoot" }
}
function Send-Request([string]$Method, [string]$Path, $Body = $null) {
    $arguments = @{ Method = $Method; Uri = "$baseUrl/api/rules$Path"; TimeoutSec = 20 }
    if ($null -ne $Body) {
        $arguments.ContentType = 'application/json; charset=utf-8'
        $arguments.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 100 -Compress))
    }
    Invoke-RestMethod @arguments
}
function Get-Definitions {
    $list = Send-Request GET '?pageSize=100'
    Assert-Test ($list.totalCount -eq 10 -and $list.items.Count -eq 10) 'exactlyTenRules'
    @($list.items | Sort-Object id | ForEach-Object { Send-Request GET "/$($_.id)" })
}

try {
    Invoke-Sql "IF DB_ID(N'$testDatabase') IS NOT NULL THROW 51000,'Test database already exists',1;" 'master' | Out-Null
    # The existence check succeeded; cleanup may now target only this generated name.
    $created = $true
    foreach ($file in @('01_create_database.sql', '02_create_tables.sql', '03_seed_data.sql',
        '04_create_rules.sql', '05_rule_reader.sql', '06_add_rule_ai_origin.sql', '07_seed_rules.sql')) {
        Invoke-SetupScript $file
        Assert-Test $true $file
    }
    Invoke-Sql "IF (SELECT COUNT(*) FROM dbo.Employees)<>20 OR (SELECT COUNT(*) FROM dbo.Departments)<>5 THROW 51000,'Unexpected business seed',1;
        IF (SELECT COUNT(*) FROM dbo.__EFMigrationsHistory)<>3 THROW 51000,'Unexpected migration history',1;
        EXECUTE AS USER = 'DataControlsRuleReader';
        IF HAS_PERMS_BY_NAME('dbo.Employees','OBJECT','SELECT')<>1 OR HAS_PERMS_BY_NAME('dbo.Departments','OBJECT','SELECT')<>1
            OR HAS_PERMS_BY_NAME('dbo.Employees','OBJECT','UPDATE')<>0 OR HAS_PERMS_BY_NAME('dbo.Rules','OBJECT','SELECT')<>0
            THROW 51000,'Unexpected reader permissions',1;
        REVERT;" | Out-Null
    Assert-Test $true 'businessSeedMigrationHistoryAndReaderPermissions'
    $businessSnapshotQuery = "SELECT CONCAT((SELECT CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM dbo.Employees), ':', (SELECT CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM dbo.Departments));"
    $businessBefore = Invoke-Sql $businessSnapshotQuery

    # Bind the API to an OS-selected free port, then read its actual URL from its log.
    $stdout = Join-Path $testRoot 'api.out.log'
    $stderr = Join-Path $testRoot 'api.err.log'
    $apiProcess = Start-Process dotnet -ArgumentList @(('"' + $apiDll + '"'), '--contentRoot',
        ('"' + $testRoot + '"'), '--urls', 'http://127.0.0.1:0',
        '--ConnectionStrings:DefaultConnection', ('"' + $connection.ConnectionString + '"')) `
        -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $baseUrl = $null
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline -and !$apiProcess.HasExited) {
        $match = [regex]::Match((Get-Content $stdout -Raw -ErrorAction SilentlyContinue) + '', 'Now listening on: (http://127\.0\.0\.1:\d+)')
        if ($match.Success) { $baseUrl = $match.Groups[1].Value; break }
        Start-Sleep -Milliseconds 150
    }
    if (!$baseUrl) { throw "API failed to start. Logs: $testRoot" }
    $definitions = @(Get-Definitions)
    foreach ($saved in $definitions) {
        $validation = Send-Request POST '/validate' $saved.definition
        Assert-Test $validation.isValid "validSeedRule-$($saved.id)"
        $execution = Send-Request POST "/$($saved.id)/execute"
        Assert-Test ($execution.totalCount -ge 0 -and !$execution.truncated -and
            $execution.totalCount -eq $execution.returnedCount -and
            $execution.returnedCount -eq @($execution.records).Count) "executeSeedRule-$($saved.id)"
        Assert-Test (!$saved.createdWithAi -and $saved.definition.name -match '[\u0590-\u05ff]') "manualHebrewSeedRule-$($saved.id)"
    }
    $before = $definitions | ConvertTo-Json -Depth 100 -Compress
    Invoke-SetupScript '07_seed_rules.sql'
    $after = @(Get-Definitions) | ConvertTo-Json -Depth 100 -Compress
    Assert-Test ($before -ceq $after) 'repeatSeedPreservesAllDefinitionsIdsAndTimestamps'

    $selected = $definitions | Where-Object {
        $_.definition.condition.kind -eq 'comparison' -and $_.definition.condition.left.fieldId -eq 'salary'
    } | Select-Object -First 1
    Assert-Test ($null -ne $selected) 'salaryExampleAvailableForEdit'
    $selected.definition.description = 'User edit preserved by repeated seed'
    $selected.definition.condition.right.value = 21000
    $updated = Send-Request PUT "/$($selected.id)" $selected.definition
    $before = @(Get-Definitions) | ConvertTo-Json -Depth 100 -Compress
    Invoke-SetupScript '07_seed_rules.sql'
    $after = @(Get-Definitions) | ConvertTo-Json -Depth 100 -Compress
    Assert-Test ($before -ceq $after) 'repeatSeedPreservesUserEditsAndOtherRules'
    $reloaded = Send-Request GET "/$($selected.id)"
    Assert-Test ($reloaded.definition.description -ceq $updated.definition.description -and
        $reloaded.definition.condition.right.value -eq 21000 -and $reloaded.definition.name -ceq $selected.definition.name) 'editedContentPreservedWithSameName'
    Assert-Test ((Invoke-Sql $businessSnapshotQuery) -ceq $businessBefore) 'businessDataUnchanged'
    Write-Output "All $script:passed submission setup checks passed. Logs: $testRoot"
} finally {
    if ($null -ne $apiProcess) {
        if (!$apiProcess.HasExited) { $apiProcess.Kill(); $apiProcess.WaitForExit() }
        $apiProcess.Dispose()
    }
    if ($created -and $testDatabase -cmatch '^DataControlsSetupTest_[a-f0-9]{32}$') {
        Invoke-Sql "IF DB_ID(N'$testDatabase') IS NOT NULL BEGIN ALTER DATABASE [$testDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$testDatabase]; END;" 'master' | Out-Null
        Write-Output "Removed isolated database: $testDatabase"
    }
}
