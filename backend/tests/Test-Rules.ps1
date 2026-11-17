param(
    [string]$ConnectionString = 'Server=localhost;Database=DataControlsTestDb;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5',
    [int]$Port = 5199,
    [string]$ApiAssemblyPath = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$apiDirectory = Join-Path $PSScriptRoot '../DataControls.Api'
$apiDll = if ($ApiAssemblyPath) { (Resolve-Path -LiteralPath $ApiAssemblyPath).Path }
    else { (Resolve-Path (Join-Path $apiDirectory 'bin/Release/net10.0/DataControls.Api.dll')).Path }
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('DataControls-Rules-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path (Join-Path $testRoot 'Metadata') -Force | Out-Null
Copy-Item (Join-Path $apiDirectory 'Metadata/metadata.json') (Join-Path $testRoot 'Metadata/metadata.json')
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $testRoot 'appsettings.json'),
    (@{ ConnectionStrings = @{ DefaultConnection = $ConnectionString } } | ConvertTo-Json), $utf8)
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(5)
$process = $null
$script:passed = 0

function New-Constant($Value) { return @{ kind = 'constant'; value = $Value } }
function New-Field($FieldId, $Path = @()) { return @{ fieldId = $FieldId; relationshipPath = @($Path) } }
function New-Comparison($Field, $Operator, $Right = $null) {
    $comparison = @{ kind = 'comparison'; left = $Field; operator = $Operator }
    if ($null -ne $Right) { $comparison.right = $Right }
    return $comparison
}
function New-Rule($Condition) {
    return @{ name = 'Test rule'; description = 'Validation only'; rootEntityId = 'employee'; condition = $Condition }
}
function Test-RuleCase([string]$Name, $Rule, [int]$ExpectedStatus = 200, [string]$Code = '', [string]$Path = '') {
    $json = if ($Rule -is [string]) { $Rule } else { $Rule | ConvertTo-Json -Depth 100 -Compress }
    $content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, 'application/json')
    $response = $null
    try {
        $response = $client.PostAsync("http://localhost:$Port/api/rules/validate", $content).GetAwaiter().GetResult()
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ([int]$response.StatusCode -ne $ExpectedStatus) {
            throw "${Name}: expected $ExpectedStatus, got $([int]$response.StatusCode): $body"
        }
        if ($ExpectedStatus -eq 200) {
            $result = $body | ConvertFrom-Json
            if (!$result.isValid -or $result.errors.Count -ne 0) { throw "Unexpected success response: $body" }
        }
        if ($Code) {
            $result = $body | ConvertFrom-Json
            $matching = @($result.errors | Where-Object { $_.code -eq $Code })
            if ($result.isValid -ne $false -or $matching.Count -eq 0) { throw "Expected ${Code}: $body" }
            if ($Path -and $Path -notin $matching.path) { throw "Expected path ${Path}: $body" }
            if ($matching[0].message -notmatch '[\u0590-\u05ff]') { throw 'Expected a Hebrew validation message.' }
        }
        $script:passed++
        Write-Output "PASS $Name"
    } finally {
        $content.Dispose()
        if ($null -ne $response) { $response.Dispose() }
    }
}

try {
    $stdout = Join-Path $testRoot 'api.out.log'
    $stderr = Join-Path $testRoot 'api.err.log'
    $process = Start-Process dotnet -ArgumentList @(
        ('"' + $apiDll + '"'), '--contentRoot', ('"' + $testRoot + '"'), '--urls', "http://localhost:$Port"
    ) -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline -and !$process.HasExited) {
        try {
            Invoke-RestMethod "http://localhost:$Port/api/metadata" -TimeoutSec 1 | Out-Null
            $ready = $true
            break
        } catch { Start-Sleep -Milliseconds 150 }
    }
    if (!$ready) { throw "API failed to start: $(Get-Content $stderr -Raw)" }

    $salary = New-Comparison (New-Field 'salary') 'greaterThan' (New-Constant 15000)
    $active = New-Comparison (New-Field 'isActive') 'equals' (New-Constant $true)
    $missing = New-Comparison (New-Field 'startDate') 'isNull'
    Test-RuleCase 'nestedAndOr' (New-Rule @{
        kind = 'group'; operator = 'and'; children = @($active, @{
            kind = 'group'; operator = 'or'; children = @($salary, $missing)
        })
    })
    Test-RuleCase 'fieldToField' (New-Rule (New-Comparison (New-Field 'endDate') 'lessThan' @{
        kind = 'field'; field = (New-Field 'startDate')
    }))
    Test-RuleCase 'relatedField' (New-Rule (New-Comparison (New-Field 'isActive' @('employeeDepartment')) 'equals' (New-Constant $false)))
    Test-RuleCase 'relatedFieldOnRight' (New-Rule (New-Comparison (New-Field 'isActive') 'notEquals' @{
        kind = 'field'; field = (New-Field 'isActive' @('employeeDepartment'))
    }))
    Test-RuleCase 'rejectSameRootField' (New-Rule (New-Comparison (New-Field 'salary') 'notEquals' @{
        kind = 'field'; field = (New-Field 'SALARY')
    })) 400 'sameFieldComparison' 'condition.right.field'
    Test-RuleCase 'rejectSameRelatedField' (New-Rule (New-Comparison (New-Field 'isActive' @('employeeDepartment')) 'notEquals' @{
        kind = 'field'; field = (New-Field 'ISACTIVE' @('EMPLOYEEDEPARTMENT'))
    })) 400 'sameFieldComparison' 'condition.right.field'
    Test-RuleCase 'rejectSameFieldWithEmptyPath' (New-Rule (New-Comparison @{ fieldId = 'salary' } 'equals' @{
        kind = 'field'; field = (New-Field 'salary')
    })) 400 'sameFieldComparison' 'condition.right.field'
    Test-RuleCase 'validLeapDate' (New-Rule (New-Comparison (New-Field 'birthDate') 'lessThan' (New-Constant '2024-02-29')))
    Test-RuleCase 'text' (New-Rule (New-Comparison (New-Field 'firstName') 'equals' (New-Constant 'Dana')))
    Test-RuleCase 'sqlLikeTextIsData' (New-Rule (New-Comparison (New-Field 'firstName') 'equals' (New-Constant "'; DROP TABLE Employees;--")))
    Test-RuleCase 'isNotNull' (New-Rule (New-Comparison (New-Field 'salary') 'isNotNull'))
    Test-RuleCase 'caseInsensitiveBusinessIds' (New-Rule (New-Comparison (New-Field 'SALARY') 'equals' (New-Constant 10)))
    Test-RuleCase 'unorderedDiscriminator' '{"name":"Test","rootEntityId":"employee","condition":{"left":{"fieldId":"salary"},"operator":"equals","right":{"value":10,"kind":"constant"},"kind":"comparison"}}'

    $rule = New-Rule $salary; $rule.name = ' '
    Test-RuleCase 'blankName' $rule 400 'invalidName' 'name'
    $rule = New-Rule $salary; $rule.description = 'x' * 2001
    Test-RuleCase 'longDescription' $rule 400 'descriptionTooLong'
    $rule = New-Rule $salary; $rule.rootEntityId = 'unknown'
    Test-RuleCase 'unknownRoot' $rule 400 'unknownEntity'
    Test-RuleCase 'nullCondition' (New-Rule $null) 400 'requiredCondition'
    Test-RuleCase 'emptyGroup' (New-Rule @{ kind = 'group'; operator = 'and'; children = @() }) 400 'emptyGroup'
    Test-RuleCase 'nullChild' (New-Rule @{ kind = 'group'; operator = 'and'; children = @($null) }) 400 'requiredCondition'
    Test-RuleCase 'invalidGroupOperator' (New-Rule @{ kind = 'group'; operator = 'xor'; children = @($salary) }) 400 'invalidGroupOperator'
    Test-RuleCase 'unknownField' (New-Rule (New-Comparison (New-Field 'Nonexistent') 'equals' (New-Constant 1))) 400 'unknownField' 'condition.left.fieldId'
    Test-RuleCase 'physicalColumnNotBusinessId' (New-Rule (New-Comparison (New-Field 'Employees.DepartmentId') 'equals' (New-Constant 1))) 400 'unknownField'
    Test-RuleCase 'missingLeft' (New-Rule (New-Comparison $null 'equals' (New-Constant 1))) 400 'requiredField'
    Test-RuleCase 'unknownRelationship' (New-Rule (New-Comparison (New-Field 'isActive' @('unknown')) 'isNull')) 400 'unknownRelationship'
    $rule = New-Rule (New-Comparison (New-Field 'isActive' @('employeeDepartment')) 'isNull'); $rule.rootEntityId = 'department'
    Test-RuleCase 'wrongDirection' $rule 400 'invalidRelationshipDirection'
    Test-RuleCase 'pathTooLong' (New-Rule (New-Comparison (New-Field 'isActive' (@('employeeDepartment') * 5)) 'isNull')) 400 'pathTooLong'
    Test-RuleCase 'textOrdering' (New-Rule (New-Comparison (New-Field 'firstName') 'greaterThan' (New-Constant 'Dana'))) 400 'operatorTypeMismatch'
    Test-RuleCase 'unknownOperator' (New-Rule (New-Comparison (New-Field 'salary') 'executeSql' (New-Constant 1))) 400 'unknownOperator'
    Test-RuleCase 'fieldTypeMismatch' (New-Rule (New-Comparison (New-Field 'salary') 'equals' @{ kind = 'field'; field = (New-Field 'firstName') })) 400 'fieldTypeMismatch'
    Test-RuleCase 'numberInQuotes' (New-Rule (New-Comparison (New-Field 'salary') 'equals' (New-Constant '15000'))) 400 'constantTypeMismatch'
    Test-RuleCase 'boolInQuotes' (New-Rule (New-Comparison (New-Field 'isActive') 'equals' (New-Constant 'true'))) 400 'constantTypeMismatch'
    Test-RuleCase 'invalidLeapDate' (New-Rule (New-Comparison (New-Field 'birthDate') 'equals' (New-Constant '2025-02-29'))) 400 'constantTypeMismatch'
    Test-RuleCase 'oversizedText' (New-Rule (New-Comparison (New-Field 'firstName') 'equals' (New-Constant ('x' * 4001)))) 400 'constantTypeMismatch'
    Test-RuleCase 'nullConstant' (New-Rule (New-Comparison (New-Field 'salary') 'equals' (New-Constant $null))) 400 'nullRequiresOperator'
    Test-RuleCase 'missingRight' (New-Rule (New-Comparison (New-Field 'salary') 'equals')) 400 'requiredOperand'
    Test-RuleCase 'unexpectedRight' (New-Rule (New-Comparison (New-Field 'salary') 'isNull' (New-Constant 1))) 400 'unexpectedOperand'
    $deep = $salary
    for ($i = 0; $i -lt 7; $i++) { $deep = @{ kind = 'group'; operator = 'and'; children = @($deep) } }
    Test-RuleCase 'maxDepthAccepted' (New-Rule $deep)
    $deep = @{ kind = 'group'; operator = 'and'; children = @($deep) }
    Test-RuleCase 'tooDeep' (New-Rule $deep) 400 'tooDeep'
    for ($i = 0; $i -lt 12; $i++) { $deep = @{ kind = 'group'; operator = 'and'; children = @($deep) } }
    Test-RuleCase 'deepUntrustedTree' (New-Rule $deep) 400
    Test-RuleCase 'maxNodesAccepted' (New-Rule @{ kind = 'group'; operator = 'and'; children = @($salary) * 99 })
    Test-RuleCase 'tooManyNodes' (New-Rule @{ kind = 'group'; operator = 'and'; children = @($salary) * 100 }) 400 'tooManyNodes'
    Test-RuleCase 'unknownKind' '{"name":"Test","rootEntityId":"employee","condition":{"kind":"sql"}}' 400
    Test-RuleCase 'unknownProperty' '{"name":"Test","sql":"SELECT 1","rootEntityId":"employee","condition":null}' 400
    Test-RuleCase 'malformedJson' '{' 400
    Test-RuleCase 'nullBody' 'null' 400
    Test-RuleCase 'oversizedBody' ('{"name":"' + ('x' * 66000) + '"}') 413

    Write-Output "All $script:passed rule checks passed. Temporary files and logs: $testRoot"
} finally {
    $client.Dispose()
    if ($null -ne $process) {
        if (!$process.HasExited) { $process.Kill(); $process.WaitForExit() }
        $process.Dispose()
    }
}
