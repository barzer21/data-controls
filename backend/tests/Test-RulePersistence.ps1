param([string]$Server = 'localhost', [int]$Port = 5200)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$apiDirectory = Join-Path $repositoryRoot 'backend/DataControls.Api'
$apiDll = (Resolve-Path (Join-Path $apiDirectory 'bin/Debug/net10.0/DataControls.Api.dll')).Path
$testDatabase = 'DataControlsPersistenceTest_' + [guid]::NewGuid().ToString('N').Substring(0, 8)
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
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(10)
$script:process = $null
$script:startCount = 0
$script:passed = 0
$renamed = $false

function Assert-Test([bool]$Condition, [string]$Name) {
    if (!$Condition) { throw "FAILED $Name" }
    $script:passed++
    Write-Output "PASS $Name"
}
function Invoke-TestSql([string]$Sql) {
    & sqlcmd -S $Server -E -C -b -l 10 -d $testDatabase -Q $Sql
    if ($LASTEXITCODE -ne 0) { throw 'Test database SQL check failed.' }
}
function Stop-TestApi {
    if ($null -ne $script:process) {
        if (!$script:process.HasExited) { $script:process.Kill(); $script:process.WaitForExit() }
        $script:process.Dispose()
        $script:process = $null
    }
}
function Start-TestApi {
    $script:startCount++
    $stdout = Join-Path $testRoot "api-$script:startCount.out.log"
    $stderr = Join-Path $testRoot "api-$script:startCount.err.log"
    $script:process = Start-Process dotnet -ArgumentList @(
        ('"' + $apiDll + '"'), '--contentRoot', ('"' + $testRoot + '"'), '--urls', "http://localhost:$Port"
    ) -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline -and !$script:process.HasExited) {
        try {
            Invoke-RestMethod "http://localhost:$Port/api/metadata" -TimeoutSec 1 | Out-Null
            return
        } catch { Start-Sleep -Milliseconds 150 }
    }
    throw "API failed to start: $(Get-Content $stderr -Raw)"
}
function Send-Request([string]$Method, [string]$Path, $Body = $null, [int]$ExpectedStatus = 200) {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method),
        "http://localhost:$Port/api/rules$Path")
    $response = $null
    try {
        if ($null -ne $Body) {
            $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 100 -Compress }
            $request.Content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ([int]$response.StatusCode -ne $ExpectedStatus) {
            throw "$Method ${Path}: expected $ExpectedStatus, got $([int]$response.StatusCode): $text"
        }
        $parsed = if ($text) { $text | ConvertFrom-Json } else { $null }
        return [pscustomobject]@{ Body = $parsed; Location = [string]$response.Headers.Location; Text = $text }
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
    }
}

try {
    # A unique database per run keeps setup and failure simulation away from existing databases.
    & sqlcmd -S $Server -E -C -b -l 10 -Q "IF DB_ID(N'$testDatabase') IS NOT NULL THROW 51000,'Test database already exists',1;"
    if ($LASTEXITCODE -ne 0) { throw 'Test database name must be unused.' }
    foreach ($file in @('01_create_database.sql', '02_create_tables.sql', '03_seed_data.sql', '04_create_rules.sql')) {
        (Get-Content (Join-Path $repositoryRoot "database/$file") -Raw -Encoding UTF8).Replace('DataControlsDb', $testDatabase) |
            & sqlcmd -S $Server -E -C -b -l 10
        if ($LASTEXITCODE -ne 0) { throw "Setup failed: $file" }
    }
    Assert-Test $true 'freshSqlSetup'
    Start-TestApi
    $list = (Send-Request 'GET' '').Body
    Assert-Test ($list.totalCount -eq 0 -and $list.items.Count -eq 0) 'emptyList'

    $examples = Get-Content (Join-Path $apiDirectory 'Rules.http') -Raw -Encoding UTF8
    $definition = ([regex]::Match($examples,
        '(?s)Content-Type: application/json\r?\n\r?\n(.*?)(?=\r?\n###)').Groups[1].Value | ConvertFrom-Json)
    $invalid = $definition | ConvertTo-Json -Depth 100 | ConvertFrom-Json
    $invalid.condition.children[1].right.value = '15000'
    $failure = (Send-Request 'POST' '' $invalid 400).Body
    Assert-Test (!$failure.isValid -and 'constantTypeMismatch' -in $failure.errors.code) 'createUsesValidator'
    Assert-Test ((Send-Request 'GET' '').Body.totalCount -eq 0) 'invalidCreateNotPersisted'

    $created = Send-Request 'POST' '' $definition 201
    $saved = $created.Body
    $id = $saved.id
    Assert-Test ($id -gt 0 -and $created.Location.EndsWith("/api/rules/$id")) 'createAndLocation'
    Assert-Test ($saved.definition.name -eq $definition.name -and $saved.definition.description -eq $definition.description) 'hebrewNameAndDescription'
    Assert-Test ($saved.definition.condition.kind -eq 'group' -and $saved.definition.condition.children[1].right.value -eq 15000) 'treeRoundTrip'
    Assert-Test ($saved.definitionVersion -eq 1 -and $saved.createdAtUtc -and $saved.updatedAtUtc) 'versionAndTimestamps'
    $loaded = (Send-Request 'GET' "/$id").Body
    Assert-Test (($loaded.definition | ConvertTo-Json -Depth 100 -Compress) -eq ($saved.definition | ConvertTo-Json -Depth 100 -Compress)) 'getById'
    Stop-TestApi
    Start-TestApi
    $loaded = (Send-Request 'GET' "/$id").Body
    Assert-Test (($loaded | ConvertTo-Json -Depth 100 -Compress) -eq ($saved | ConvertTo-Json -Depth 100 -Compress)) 'persistAcrossRestart'

    $loaded.definition.name = $loaded.definition.name + ' updated'
    $loaded.definition.condition.children[1].right.value = 20000
    $updated = (Send-Request 'PUT' "/$id" $loaded.definition).Body
    Assert-Test ($updated.id -eq $id -and $updated.createdAtUtc -eq $saved.createdAtUtc -and
        [DateTimeOffset]$updated.updatedAtUtc -ge [DateTimeOffset]$saved.updatedAtUtc -and
        $updated.definition.condition.children[1].right.value -eq 20000) 'updatePreservesIdAndCreation'
    Send-Request 'PUT' "/$id" $invalid 400 | Out-Null
    Assert-Test ((Send-Request 'GET' "/$id").Body.updatedAtUtc -eq $updated.updatedAtUtc) 'invalidUpdateNotPersisted'
    $secondDefinition = @{
        name = 'Field comparison'; rootEntityId = 'employee'; condition = @{
            kind = 'comparison'; left = @{ fieldId = 'endDate' }; operator = 'lessThan'
            right = @{ kind = 'field'; field = @{ fieldId = 'startDate' } }
        }
    }
    $second = (Send-Request 'POST' '' $secondDefinition 201).Body
    Assert-Test ($second.definition.condition.right.kind -eq 'field' -and $null -eq $second.definition.description) 'fieldOperandAndOptionalDescription'
    $thirdDefinition = @{
        name = 'Related missing value'; rootEntityId = 'employee'; condition = @{
            kind = 'comparison'; left = @{ fieldId = 'managerName'; relationshipPath = @('employeeDepartment') }; operator = 'isNull'
        }
    }
    $third = (Send-Request 'POST' '' $thirdDefinition 201).Body
    Assert-Test ($third.definition.condition.left.relationshipPath[0] -eq 'employeeDepartment') 'relationshipAndNullOperatorRoundTrip'
    $page1 = (Send-Request 'GET' '?page=1&pageSize=2').Body
    $page2 = (Send-Request 'GET' '?page=2&pageSize=2').Body
    Assert-Test ($page1.totalCount -eq 3 -and $page1.items.Count -eq 2 -and $page2.items.Count -eq 1 -and
        $page2.items[0].id -eq $third.id -and !$page1.items[0].PSObject.Properties['definition']) 'stablePaginationAndSummaryOnly'
    Send-Request 'GET' '?page=0' $null 400 | Out-Null
    Send-Request 'GET' '?pageSize=101' $null 400 | Out-Null
    Send-Request 'GET' '?page=2147483647&pageSize=100' $null 400 | Out-Null
    Assert-Test ((Send-Request 'GET' '?page=100').Body.items.Count -eq 0) 'paginationBounds'
    Send-Request 'GET' '/2147483647' $null 404 | Out-Null
    Send-Request 'PUT' '/2147483647' $definition 404 | Out-Null
    Send-Request 'DELETE' '/2147483647' $null 404 | Out-Null
    Assert-Test $true 'missingIdsReturn404'
    Send-Request 'POST' '' '{' 400 | Out-Null
    Send-Request 'POST' '' '{"sql":"SELECT 1"}' 400 | Out-Null
    Send-Request 'PUT' "/$id" ('{"name":"' + ('x' * 66000) + '"}') 413 | Out-Null
    Assert-Test $true 'bindingAndBodyLimits'

    Invoke-TestSql "SET NOCOUNT ON; EXEC sp_rename N'dbo.Rules',N'RulesUnavailable';"
    $renamed = $true
    $unavailable = Send-Request 'GET' '' $null 503
    $writeFailure = Send-Request 'POST' '' $definition 503
    Assert-Test ($unavailable.Body.title -match '[\u0590-\u05ff]' -and $writeFailure.Body.status -eq 503 -and
        $unavailable.Text -notmatch 'SqlException|Invalid object|stackTrace') 'databaseErrorsAreSafe503'
    Invoke-TestSql "SET NOCOUNT ON; EXEC sp_rename N'dbo.RulesUnavailable',N'Rules';"
    $renamed = $false

    Send-Request 'DELETE' "/$($second.id)" $null 204 | Out-Null
    Send-Request 'GET' "/$($second.id)" $null 404 | Out-Null
    Send-Request 'DELETE' "/$($second.id)" $null 404 | Out-Null
    Assert-Test ((Send-Request 'GET' '').Body.totalCount -eq 2) 'deleteAndRepeatDelete'
    Stop-TestApi
    Start-TestApi
    Assert-Test ((Send-Request 'GET' "/$id").Body.definition.condition.children[1].right.value -eq 20000) 'updatedRuleSurvivesRestart'
    Send-Request 'GET' "/$($second.id)" $null 404 | Out-Null
    Assert-Test $true 'deletionSurvivesRestart'
    Invoke-TestSql "SET NOCOUNT ON; IF (SELECT COUNT(*) FROM dbo.Employees)<>20 OR (SELECT COUNT(*) FROM dbo.Departments)<>5 THROW 51000,'Sample data changed',1; IF (SELECT COUNT(*) FROM dbo.Rules)<>2 THROW 51000,'Unexpected rule count',1; IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId LIKE '%_AddSavedRules') THROW 51000,'Missing migration history',1; SELECT DB_NAME() AS TestDatabase,COUNT(*) AS SavedRules FROM dbo.Rules;"
    Assert-Test $true 'sqlPersistenceAndBusinessDataUnchanged'
    Write-Output "All $script:passed persistence checks passed. Test database retained: $testDatabase. Logs: $testRoot"
} finally {
    Stop-TestApi
    $client.Dispose()
    if ($renamed) { Invoke-TestSql "EXEC sp_rename N'dbo.RulesUnavailable',N'Rules';" }
}
