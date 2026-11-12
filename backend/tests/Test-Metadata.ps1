param(
    [string]$ConnectionString = 'Server=localhost;Database=DataControlsTestDb;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5',
    [int]$Port = 5198
)

$ErrorActionPreference = 'Stop'
$apiDirectory = Join-Path $PSScriptRoot '../DataControls.Api'
$apiDll = (Resolve-Path (Join-Path $apiDirectory 'bin/Debug/net10.0/DataControls.Api.dll')).Path
$sourceJson = Get-Content (Join-Path $apiDirectory 'Metadata/metadata.json') -Raw -Encoding UTF8
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('DataControls-Metadata-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path (Join-Path $testRoot 'Metadata') -Force | Out-Null
$utf8 = [System.Text.UTF8Encoding]::new($false)
$process = $null

function Test-CatalogCase([string]$Name, [scriptblock]$Change, [string]$ExpectedError = '') {
    $catalog = $sourceJson | ConvertFrom-Json
    & $Change $catalog
    [System.IO.File]::WriteAllText((Join-Path $testRoot 'Metadata/metadata.json'),
        ($catalog | ConvertTo-Json -Depth 20), $utf8)
    $stdout = Join-Path $testRoot ($Name + '.out.log')
    $stderr = Join-Path $testRoot ($Name + '.err.log')
    $script:process = Start-Process dotnet -ArgumentList @(
        ('"' + $apiDll + '"'), '--contentRoot', ('"' + $testRoot + '"'),
        '--urls', "http://localhost:$Port"
    ) -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    try {
        $response = $null
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        while ([DateTime]::UtcNow -lt $deadline -and !$script:process.HasExited) {
            try {
                $response = Invoke-RestMethod "http://localhost:$Port/api/metadata" -TimeoutSec 1
                break
            } catch { Start-Sleep -Milliseconds 150 }
        }
        if ($ExpectedError) {
            if ($response -or !$script:process.HasExited) { throw "$Name should stop startup." }
            $logs = (Get-Content $stdout -Raw) + (Get-Content $stderr -Raw)
            if ($logs -notmatch [regex]::Escape($ExpectedError)) { throw "Unexpected failure in ${Name}: $logs" }
        } else {
            if (!$response) { throw "No API response for ${Name}: $(Get-Content $stderr -Raw)" }
            if ($response.entities.Count -ne 2 -or $response.relationships.Count -ne 1) {
                throw 'Unexpected entity/relationship count.'
            }
            if ($response.entities[0].label -ne ($sourceJson | ConvertFrom-Json).entities[0].label) {
                throw 'Hebrew label was not preserved.'
            }
            $payload = $response | ConvertTo-Json -Depth 20
            if ($payload -match '"(schema|table|column|keyColumn|fromColumn|toColumn)"') {
                throw 'Technical mapping leaked in API response.'
            }
            if ($Name -eq 'extension' -and 'departmentNumber' -notin $response.entities[0].fields.id) {
                throw 'JSON-only field extension was not returned.'
            }
        }
        Write-Output "PASS $Name"
    } finally {
        if (!$script:process.HasExited) { $script:process.Kill(); $script:process.WaitForExit() }
        $script:process.Dispose()
        $script:process = $null
    }
}

try {
    [System.IO.File]::WriteAllText((Join-Path $testRoot 'appsettings.json'),
        (@{ ConnectionStrings = @{ DefaultConnection = $ConnectionString } } | ConvertTo-Json), $utf8)
    Test-CatalogCase 'valid' { param($c) }
    Test-CatalogCase 'extension' { param($c)
        $c.entities[0].fields += [pscustomobject]@{
            id = 'departmentNumber'; label = 'Department number'; column = 'DepartmentId'; type = 'number'
        }
    }
    Test-CatalogCase 'duplicateField' { param($c)
        $c.entities[0].fields += $c.entities[0].fields[0]
    } 'Duplicate field ID'
    Test-CatalogCase 'unknownEntity' { param($c)
        $c.relationships[0].toEntity = 'unknown'
    } 'Unknown entity'
    Test-CatalogCase 'missingColumn' { param($c)
        $c.entities[0].fields[0].column = 'NonexistentColumn'
    } 'column NonexistentColumn not found'
    Test-CatalogCase 'wrongType' { param($c)
        $c.entities[0].fields[0].type = 'number'
    } 'incompatible with SQL type'
    Test-CatalogCase 'wrongRelationship' { param($c)
        $c.relationships[0].fromColumn = 'Id'
    } 'foreign key not found'
    Write-Output "All checks passed. Temporary catalogs and logs: $testRoot"
} finally {
    if ($null -ne $process) {
        if (!$process.HasExited) { $process.Kill(); $process.WaitForExit() }
        $process.Dispose()
    }
}
