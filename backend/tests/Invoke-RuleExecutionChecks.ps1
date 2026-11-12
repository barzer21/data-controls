# Internal checks, dot-sourced by Test-RulePersistence.ps1 -IncludeExecution.
# Uses that harness's unique database, API and assertion helpers.
function Execution-Rule($Condition) {
    return @{ name = 'Draft execution'; rootEntityId = 'employee'; condition = $Condition }
}
function Execution-Comparison($Field, $Operator, $Value, [switch]$NoRight, $Path = @()) {
    $comparison = @{ kind = 'comparison'; left = @{ fieldId = $Field; relationshipPath = @($Path) }; operator = $Operator }
    if (!$NoRight) { $comparison.right = @{ kind = 'constant'; value = $Value } }
    return $comparison
}

$beforeExecution = (Send-Request 'GET' '').Body.totalCount
$savedBefore = (Send-Request 'GET' "/$id").Body
$draft = Execution-Rule (Execution-Comparison 'salary' 'greaterThan' 15000)
$draftResult = (Send-Request 'POST' '/execute' $draft).Body
Assert-Test ($draftResult.totalCount -eq 13 -and $draftResult.returnedCount -eq 13 -and !$draftResult.truncated) 'draftCorrectRecordsAndCount'
Assert-Test ($draftResult.records[0].values.firstName -and 'salary' -in $draftResult.columns.id) 'businessRecordsAndColumns'
Assert-Test ((Send-Request 'GET' '').Body.totalCount -eq $beforeExecution) 'draftDoesNotSave'
Assert-Test (($savedBefore | ConvertTo-Json -Depth 100 -Compress) -eq ((Send-Request 'GET' "/$id").Body | ConvertTo-Json -Depth 100 -Compress)) 'draftDoesNotEditSavedRule'
$savedResult = (Send-Request 'POST' "/$id/execute").Body
$sameDraft = (Send-Request 'POST' '/execute' $savedBefore.definition).Body
Assert-Test (($savedResult | ConvertTo-Json -Depth 100 -Compress) -eq ($sameDraft | ConvertTo-Json -Depth 100 -Compress)) 'savedAndDraftUseSameEngine'
Send-Request 'POST' '/2147483647/execute' $null 404 | Out-Null
Assert-Test $true 'executeMissingSavedRule404'
$invalidDraft = Execution-Rule (Execution-Comparison 'Nonexistent' 'equals' 1)
$invalidExecution = (Send-Request 'POST' '/execute' $invalidDraft 400).Body
Assert-Test ('unknownField' -in $invalidExecution.errors.code) 'draftValidationBeforeExecution'
Invoke-TestSql "UPDATE dbo.Rules SET ConditionJson=JSON_MODIFY(ConditionJson,'$.left.fieldId',N'Nonexistent') WHERE Id=$($third.id);"
$stale = (Send-Request 'POST' "/$($third.id)/execute" $null 400).Body
Assert-Test ('unknownField' -in $stale.errors.code) 'savedRuleRevalidated'
Send-Request 'PUT' "/$($third.id)" $thirdDefinition | Out-Null
$limited = (Send-Request 'POST' '/execute?limit=2' $draft).Body
Assert-Test ($limited.totalCount -eq 13 -and $limited.returnedCount -eq 2 -and $limited.truncated) 'exactCountBeyondLimit'
Send-Request 'POST' '/execute?limit=0' $draft 400 | Out-Null
Send-Request 'POST' "/$id/execute?limit=501" $null 400 | Out-Null
Assert-Test $true 'executionLimitValidation'
$noMatch = (Send-Request 'POST' '/execute' (Execution-Rule (Execution-Comparison 'salary' 'greaterThan' 99999999))).Body
Assert-Test ($noMatch.totalCount -eq 0 -and $noMatch.records.Count -eq 0) 'emptyExecution'
$injection = Execution-Rule (Execution-Comparison 'firstName' 'equals' "'; DROP TABLE Employees;--")
Assert-Test ((Send-Request 'POST' '/execute' $injection).Body.totalCount -eq 0) 'sqlInjectionIsLiteral'
$related = Execution-Rule @{ kind = 'group'; operator = 'and'; children = @(
    (Execution-Comparison 'isActive' 'equals' $true),
    (Execution-Comparison 'isActive' 'equals' $false -Path @('employeeDepartment'))
) }
Assert-Test ((Send-Request 'POST' '/execute' $related).Body.totalCount -eq 2) 'activeEmployeeInactiveDepartment'
$missingRelation = Execution-Rule (Execution-Comparison 'isActive' 'isNull' $null -NoRight -Path @('employeeDepartment'))
$missingResult = (Send-Request 'POST' '/execute' $missingRelation).Body
Assert-Test ($missingResult.totalCount -eq 1 -and $missingResult.records[0].values.firstName -eq 'Noga') 'leftJoinPreservesMissingRelation'
$missingManager = Execution-Rule (Execution-Comparison 'managerName' 'isNull' $null -NoRight -Path @('employeeDepartment'))
Assert-Test ((Send-Request 'POST' '/execute' $missingManager).Body.totalCount -eq 5) 'missingRelatedFieldOrRelation'

$selectedRule = Execution-Rule (Execution-Comparison 'isActive' 'equals' $true)
$selectedRule.resultFields = @(
    @{ fieldId = 'firstName' },
    @{ fieldId = 'name'; relationshipPath = @('employeeDepartment') }
)
$selectedResult = (Send-Request 'POST' '/execute' $selectedRule).Body
Assert-Test ($selectedResult.totalCount -eq 19 -and $selectedResult.columns.Count -eq 2 -and
    $selectedResult.columns[1].id -eq 'employeeDepartment.name') 'selectedFieldsAndDisplayOnlyJoin'
$noga = @($selectedResult.records | Where-Object { $_.values.firstName -eq 'Noga' })
$yael = @($selectedResult.records | Where-Object { $_.values.firstName -eq 'Yael' })
Assert-Test ($noga.Count -eq 1 -and $null -eq $noga[0].values.'employeeDepartment.name') 'selectedRelatedFieldNullForMissingRelation'
Assert-Test ($yael.Count -eq 1 -and $yael[0].values.'employeeDepartment.name' -eq 'Sales' -and
    @($yael[0].values.PSObject.Properties).Count -eq 2) 'departmentNameReturnedWithoutUnselectedFields'
$selectedSaved = (Send-Request 'POST' '' $selectedRule 201).Body
try {
    Assert-Test ($selectedSaved.definition.resultFields.Count -eq 2) 'selectedFieldsSaved'
    Stop-TestApi
    Start-TestApi
    $reopened = (Send-Request 'GET' "/$($selectedSaved.id)").Body
    Assert-Test ($reopened.definition.resultFields[1].relationshipPath[0] -eq 'employeeDepartment') 'selectedFieldsSurviveRestart'
    $savedSelectedResult = (Send-Request 'POST' "/$($selectedSaved.id)/execute").Body
    Assert-Test (($savedSelectedResult | ConvertTo-Json -Depth 100 -Compress) -eq ($selectedResult | ConvertTo-Json -Depth 100 -Compress)) 'savedProjectionMatchesDraft'
    $badSelection = $selectedRule | ConvertTo-Json -Depth 100 | ConvertFrom-Json
    $badSelection.resultFields[1].fieldId = 'Nonexistent'
    $badResult = (Send-Request 'PUT' "/$($selectedSaved.id)" $badSelection 400).Body
    Assert-Test ('unknownField' -in $badResult.errors.code -and $badResult.errors[0].path -eq 'resultFields[1].fieldId') 'invalidProjectionUpdateRejected'
    $selectedRule.resultFields = @(@{ fieldId = 'isActive'; relationshipPath = @('employeeDepartment') })
    Send-Request 'PUT' "/$($selectedSaved.id)" $selectedRule | Out-Null
    $updatedSelection = (Send-Request 'POST' "/$($selectedSaved.id)/execute").Body
    Assert-Test ($updatedSelection.columns.Count -eq 1 -and $updatedSelection.columns[0].id -eq 'employeeDepartment.isActive') 'projectionUpdateApplied'
    $selectedRule.resultFields = $null
    Send-Request 'PUT' "/$($selectedSaved.id)" $selectedRule | Out-Null
    $resetSelection = (Send-Request 'POST' "/$($selectedSaved.id)/execute").Body
    Assert-Test ($resetSelection.columns.Count -eq 7 -and 'salary' -in $resetSelection.columns.id) 'nullProjectionResetsLegacyDefault'
} finally { Send-Request 'DELETE' "/$($selectedSaved.id)" $null 204 | Out-Null }
$badDraftSelection = Execution-Rule (Execution-Comparison 'salary' 'greaterThan' 0)
$badDraftSelection.resultFields = @(@{ fieldId = 'salary' }, @{ fieldId = 'SALARY' })
$badDraftResponse = (Send-Request 'POST' '/execute' $badDraftSelection 400).Body
Assert-Test ('duplicateResultField' -in $badDraftResponse.errors.code) 'duplicateSelectionRejectedByApi'

# Fixtures only in this new isolated test database. Preserve row counts, change test values.
Invoke-TestSql "UPDATE dbo.Employees SET Salary=NULL,StartDate='2024-01-01T08:00:00',EndDate='2024-01-01T18:00:00' WHERE FirstName=N'Adi'; UPDATE dbo.Employees SET StartDate='2024-01-02T08:00:00',EndDate='2024-01-01T18:00:00' WHERE FirstName=N'Noam';"
$dateComparison = @{ kind = 'comparison'; left = @{ fieldId = 'endDate' }; operator = 'equals'; right = @{ kind = 'field'; field = @{ fieldId = 'startDate' } } }
$sameDate = (Send-Request 'POST' '/execute' (Execution-Rule $dateComparison)).Body
Assert-Test ($sameDate.totalCount -eq 1 -and $sameDate.records[0].values.firstName -eq 'Adi') 'datesIgnoreTimeFieldToField'
$dateComparison.operator = 'lessThan'
Assert-Test ((Send-Request 'POST' '/execute' (Execution-Rule $dateComparison)).Body.totalCount -eq 2) 'dateBeforeStart'
$dateLiteral = (Send-Request 'POST' '/execute' (Execution-Rule (Execution-Comparison 'startDate' 'equals' '2024-01-01'))).Body
Assert-Test ($dateLiteral.totalCount -eq 1 -and $dateLiteral.records[0].values.startDate -eq '2024-01-01') 'dateConstantAndDateOutput'
Assert-Test ((Send-Request 'POST' '/execute' (Execution-Rule (Execution-Comparison 'salary' 'notEquals' 1))).Body.totalCount -eq 19) 'nullDoesNotMatchNotEquals'
Assert-Test ((Send-Request 'POST' '/execute' (Execution-Rule (Execution-Comparison 'salary' 'isNull' $null -NoRight))).Body.totalCount -eq 1) 'explicitNullCheck'
$nullAnd = Execution-Rule @{ kind = 'group'; operator = 'and'; children = @(
    (Execution-Comparison 'salary' 'isNull' $null -NoRight), (Execution-Comparison 'salary' 'greaterThan' 1)
) }
Assert-Test ((Send-Request 'POST' '/execute' $nullAnd).Body.totalCount -eq 0) 'andPreservesUnknown'
$nullOr = Execution-Rule @{ kind = 'group'; operator = 'or'; children = @(
    (Execution-Comparison 'firstName' 'equals' 'Adi'), (Execution-Comparison 'salary' 'greaterThan' 1)
) }
Assert-Test ((Send-Request 'POST' '/execute' $nullOr).Body.totalCount -eq 20) 'orTrueDespiteUnknown'

# Database permissions, not only compiler behavior, deny writes and application-table access.
Invoke-TestSql "BEGIN TRY EXECUTE AS USER=N'DataControlsRuleReader'; UPDATE dbo.Employees SET Salary=0 WHERE 1=0; REVERT; THROW 51000,'Write unexpectedly allowed',1; END TRY BEGIN CATCH DECLARE @error int=ERROR_NUMBER(); IF USER_NAME()=N'DataControlsRuleReader' REVERT; IF @error<>229 THROW; END CATCH;"
Invoke-TestSql "BEGIN TRY EXECUTE AS USER=N'DataControlsRuleReader'; SELECT TOP(0) * FROM dbo.Rules; REVERT; THROW 51000,'Application table unexpectedly accessible',1; END TRY BEGIN CATCH DECLARE @error int=ERROR_NUMBER(); IF USER_NAME()=N'DataControlsRuleReader' REVERT; IF @error<>229 THROW; END CATCH;"
Assert-Test $true 'sqlPrincipalDeniesWritesAndRuleAccess'

# Remove SELECT briefly to ensure no fallback to the privileged CRUD identity.
Invoke-TestSql "DENY SELECT ON OBJECT::dbo.Employees TO DataControlsRuleReader;"
try {
    $denied = (Send-Request 'POST' '/execute' $draft 503).Body
    Assert-Test ($denied.title -match '[\u0590-\u05ff]') 'noPrivilegeFallback'
} finally { Invoke-TestSql "GRANT SELECT ON OBJECT::dbo.Employees TO DataControlsRuleReader;" }

# A lock in this isolated database verifies the real command timeout and recovery.
$lockConnection = [System.Data.SqlClient.SqlConnection]::new($connection.ConnectionString)
$lockTransaction = $null
$originalClient = $null
try {
    $lockConnection.Open()
    $lockTransaction = $lockConnection.BeginTransaction()
    $lockCommand = $lockConnection.CreateCommand()
    $lockCommand.Transaction = $lockTransaction
    $lockCommand.CommandText = 'UPDATE dbo.Employees WITH (TABLOCKX) SET Salary=Salary WHERE Id=1;'
    $lockCommand.ExecuteNonQuery() | Out-Null
    $lockCommand.Dispose()
    # HttpClient.Timeout cannot be changed after requests start; use a new client for this case.
    $originalClient = $client
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(25)
    $timedOut = (Send-Request 'POST' '/execute' $draft 504).Body
    Assert-Test ($timedOut.title -match '[\u0590-\u05ff]') 'realSqlTimeout504'
} finally {
    if ($null -ne $lockTransaction) { $lockTransaction.Rollback(); $lockTransaction.Dispose() }
    $lockConnection.Dispose()
    if ($null -ne $originalClient) { $client.Dispose(); $client = $originalClient }
}
Send-Request 'POST' '/execute' $draft | Out-Null

# A new table plus catalog entry needs no change/rebuild of application code.
Invoke-TestSql "CREATE TABLE dbo.ExecutionAccounts (RecordId int NOT NULL PRIMARY KEY,Amount decimal(18,2) NULL); INSERT INTO dbo.ExecutionAccounts VALUES (1,NULL),(2,42); GRANT SELECT ON OBJECT::dbo.ExecutionAccounts TO DataControlsRuleReader;"
$catalogFile = Join-Path $testRoot 'Metadata/metadata.json'
$originalCatalogText = Get-Content $catalogFile -Raw -Encoding UTF8
Stop-TestApi
try {
    $extended = $originalCatalogText | ConvertFrom-Json
    $extended.entities += [pscustomobject]@{
        id = 'account'; label = 'Accounts'; schema = 'dbo'; table = 'ExecutionAccounts'; keyColumn = 'RecordId'
        fields = @([pscustomobject]@{ id = 'amount'; label = 'Amount'; column = 'Amount'; type = 'number' })
    }
    [System.IO.File]::WriteAllText($catalogFile, ($extended | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))
    Start-TestApi
    $generic = @{ name = 'New metadata'; rootEntityId = 'account'; condition = (Execution-Comparison 'amount' 'isNull' $null -NoRight) }
    $genericResult = (Send-Request 'POST' '/execute' $generic).Body
    Assert-Test ($genericResult.totalCount -eq 1 -and $genericResult.columns[0].id -eq 'amount') 'metadataOnlyExtensionExecutes'
} finally {
    Stop-TestApi
    [System.IO.File]::WriteAllText($catalogFile, $originalCatalogText, [System.Text.UTF8Encoding]::new($false))
    Start-TestApi
}
Assert-Test ((Send-Request 'GET' '').Body.totalCount -eq $beforeExecution) 'executionNeverCreatesHistoryOrDraftRows'
. (Join-Path $PSScriptRoot 'Invoke-RuleExplanationChecks.ps1')
Invoke-TestSql "IF (SELECT COUNT(*) FROM dbo.Employees)<>20 OR (SELECT COUNT(*) FROM dbo.Departments)<>5 THROW 51000,'Business row counts changed',1;"
