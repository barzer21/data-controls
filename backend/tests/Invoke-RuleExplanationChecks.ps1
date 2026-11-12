# Dot-sourced after the execution checks; all fixtures belong to the isolated test database.
$explainDraft = Execution-Rule (Execution-Comparison 'salary' 'greaterThan' 15000)
$explainDraft.resultFields = @(@{ fieldId = 'firstName' })
$explainResult = (Send-Request 'POST' '/execute' $explainDraft).Body
$noamReason = @($explainResult.records | Where-Object { $_.values.firstName -eq 'Noam' })[0]
Assert-Test ($noamReason.failureReason -match '[\u0590-\u05ff]' -and $noamReason.failureReason.Contains('17,200') -and
    $noamReason.explanation.left.fieldId -eq 'salary' -and $noamReason.explanation.left.value -eq 17200 -and
    $noamReason.explanation.right.value -eq 15000) 'numericExplanationWithActualAndExpected'
Assert-Test (@($noamReason.values.PSObject.Properties).Count -eq 1 -and $explainResult.columns.Count -eq 1 -and
    'salary' -notin $noamReason.values.PSObject.Properties.Name) 'explanationEvidenceDoesNotChangeSelectedColumns'

$boolReasonResult = (Send-Request 'POST' '/execute' $related).Body
Assert-Test ($boolReasonResult.totalCount -eq 2 -and $boolReasonResult.records[0].explanation.operator -eq 'and' -and
    $boolReasonResult.records[0].explanation.children.Count -eq 2 -and
    $boolReasonResult.records[0].explanation.children[0].left.value -eq $true -and
    $boolReasonResult.records[0].explanation.children[1].left.value -eq $false) 'andExplainsBothBooleanConditions'

$falseAnd = @{ kind = 'group'; operator = 'and'; children = @(
    (Execution-Comparison 'isActive' 'equals' $true), (Execution-Comparison 'salary' 'greaterThan' 99999999)
) }
$orWithFailedAnd = Execution-Rule @{ kind = 'group'; operator = 'or'; children = @(
    $falseAnd, (Execution-Comparison 'firstName' 'equals' 'Noam')
) }
$failedBranchResult = (Send-Request 'POST' '/execute' $orWithFailedAnd).Body
Assert-Test ($failedBranchResult.totalCount -eq 1 -and $failedBranchResult.records[0].explanation.children.Count -eq 1 -and
    $failedBranchResult.records[0].explanation.children[0].path -eq 'condition.children[1]') 'trueLeafInFalseAndNotExplained'

$unknownOr = Execution-Rule @{ kind = 'group'; operator = 'or'; children = @(
    (Execution-Comparison 'salary' 'greaterThan' 99999999), (Execution-Comparison 'firstName' 'equals' 'Adi')
) }
$unknownResult = (Send-Request 'POST' '/execute' $unknownOr).Body
Assert-Test ($unknownResult.totalCount -eq 1 -and $unknownResult.records[0].explanation.children.Count -eq 1 -and
    $unknownResult.records[0].explanation.children[0].left.fieldId -eq 'firstName') 'unknownComparisonNotExplained'

$bothOr = Execution-Rule @{ kind = 'group'; operator = 'or'; children = @(
    (Execution-Comparison 'salary' 'isNull' $null -NoRight), (Execution-Comparison 'firstName' 'equals' 'Adi')
) }
$bothOrResult = (Send-Request 'POST' '/execute' $bothOr).Body
Assert-Test ($bothOrResult.totalCount -eq 1 -and $bothOrResult.records[0].explanation.children.Count -eq 2 -and
    $null -eq $bothOrResult.records[0].explanation.children[0].left.value) 'orExplainsAllMatchingBranches'

$nestedReason = Execution-Rule @{ kind = 'group'; operator = 'and'; children = @(
    (Execution-Comparison 'isActive' 'equals' $true),
    @{ kind = 'group'; operator = 'or'; children = @(
        (Execution-Comparison 'salary' 'greaterThan' 99999999), (Execution-Comparison 'firstName' 'equals' 'Noam')
    ) }
) }
$nestedResult = (Send-Request 'POST' '/execute' $nestedReason).Body
Assert-Test ($nestedResult.totalCount -eq 1 -and $nestedResult.records[0].explanation.children.Count -eq 2 -and
    $nestedResult.records[0].explanation.children[1].operator -eq 'or' -and
    $nestedResult.records[0].explanation.children[1].children.Count -eq 1 -and
    $nestedResult.records[0].explanation.children[1].children[0].path -eq 'condition.children[1].children[1]') 'nestedExplanationPreservesGroupStructure'

$dateReasonResult = (Send-Request 'POST' '/execute' (Execution-Rule $dateComparison)).Body
$noamDate = @($dateReasonResult.records | Where-Object { $_.values.firstName -eq 'Noam' })[0]
Assert-Test ($noamDate.explanation.left.value -eq '2024-01-01' -and $noamDate.explanation.right.kind -eq 'field' -and
    $noamDate.explanation.right.fieldId -eq 'startDate' -and $noamDate.explanation.right.value -eq '2024-01-02' -and
    $noamDate.failureReason.Contains('01/01/2024') -and $noamDate.failureReason.Contains('02/01/2024')) 'dateFieldExplanationUsesComparedCalendarValues'

$missingReasonResult = (Send-Request 'POST' '/execute' $missingRelation).Body
Assert-Test ($missingReasonResult.records[0].explanation.operator -eq 'isNull' -and
    $missingReasonResult.records[0].explanation.left.fieldId -eq 'employeeDepartment.isActive' -and
    $null -eq $missingReasonResult.records[0].explanation.left.value) 'relatedMissingValueExplanation'

# SQL text equality ignores trailing spaces; .NET string equality would disagree.
Invoke-TestSql "UPDATE dbo.Employees SET FirstName=N'Adi ' WHERE FirstName=N'Adi';"
$textSemantics = (Send-Request 'POST' '/execute' (Execution-Rule (Execution-Comparison 'firstName' 'equals' 'Adi'))).Body
Assert-Test ($textSemantics.totalCount -eq 1 -and $textSemantics.records[0].explanation.left.value -eq 'Adi ' -and
    $textSemantics.records[0].explanation.right.value -eq 'Adi') 'explanationUsesSqlStringSemantics'
Invoke-TestSql "UPDATE dbo.Employees SET FirstName=N'Adi' WHERE FirstName=N'Adi ';"

$reasonSaved = (Send-Request 'POST' "/$id/execute").Body
$reasonDraft = (Send-Request 'POST' '/execute' (Send-Request 'GET' "/$id").Body.definition).Body
Assert-Test (($reasonSaved | ConvertTo-Json -Depth 100 -Compress) -eq ($reasonDraft | ConvertTo-Json -Depth 100 -Compress)) 'savedAndDraftExplanationsMatch'
