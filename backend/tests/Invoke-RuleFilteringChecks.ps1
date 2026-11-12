# Internal cases: run by the isolated execution/persistence harness.
$allRows = Execution-Rule (Execution-Comparison 'isActive' 'isNotNull' $null -NoRight)
$plainRows = (Send-Request 'POST' '/execute?limit=500' $allRows).Body
$savedBeforeFiltering = (Send-Request 'GET' "/$id").Body
$countBeforeFiltering = (Send-Request 'GET' '').Body.totalCount
$searched = (Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{ search = ' Noam ' } }).Body
Assert-Test ($searched.totalCount -eq 1 -and $searched.records[0].values.firstName -eq 'Noam') 'searchAcrossDisplayedTextWithTrim'
$last = $plainRows.records[-1]
$late = (Send-Request 'POST' '/execute?limit=1' @{ definition = $allRows; options = @{ search = $last.values.firstName } }).Body
Assert-Test ($late.totalCount -eq 1 -and $late.records[0].id -eq $last.id -and $last.id -ne $plainRows.records[0].id) 'searchBeforeRowLimit'
$filtered = (Send-Request 'POST' '/execute?limit=1' @{
    definition = $allRows; options = @{ filter = (Execution-Comparison 'salary' 'greaterThan' 20000) }
}).Body
Assert-Test ($filtered.totalCount -eq 4 -and $filtered.returnedCount -eq 1 -and $filtered.truncated) 'filteredCountBeforeTop'
$sameUnfilteredRecord = @($plainRows.records | Where-Object { $_.id -eq $filtered.records[0].id })[0]
Assert-Test ($filtered.records[0].failureReason -eq $sameUnfilteredRecord.failureReason -and
    $filtered.records[0].explanation.operator -eq 'isNotNull' -and $filtered.records[0].explanation.children.Count -eq 0) 'filterNeverChangesFailureReason'

$relatedColumns = $allRows | ConvertTo-Json -Depth 100 | ConvertFrom-Json
$sales = (Send-Request 'POST' '/execute' @{ definition = $relatedColumns; options = @{ search = 'Sales' } }).Body
Assert-Test ($sales.totalCount -eq 2 -and $sales.records[0].values.'employeeDepartment.name' -eq 'Sales') 'searchIncludesSelectedRelatedText'
$combined = (Send-Request 'POST' '/execute' @{
    definition = $relatedColumns; options = @{ search = 'Sales'; filter = (Execution-Comparison 'salary' 'greaterThan' 12000) }
}).Body
Assert-Test ($combined.totalCount -eq 1 -and $combined.records[0].values.firstName -eq 'Eden') 'searchAndFilterIntersect'
$noRelatedSearch = (Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{ search = 'Sales' } }).Body
Assert-Test ($noRelatedSearch.totalCount -eq 2) 'searchIncludesDepartmentNameByDefault'
$missingFiltered = (Send-Request 'POST' '/execute' @{
    definition = $relatedColumns; options = @{ filter = (Execution-Comparison 'name' 'isNull' $null -NoRight -Path @('employeeDepartment')) }
}).Body
Assert-Test ($missingFiltered.totalCount -eq 1 -and $missingFiltered.records[0].values.firstName -eq 'Noga') 'relatedFilterPreservesNullSemantics'
$nestedFilter = @{ kind = 'group'; operator = 'or'; children = @(
    (Execution-Comparison 'salary' 'greaterThan' 20000),
    @{ kind = 'group'; operator = 'and'; children = @(
        (Execution-Comparison 'isActive' 'equals' $false), (Execution-Comparison 'salary' 'lessThan' 15000)
    ) }
) }
Assert-Test ((Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{ filter = $nestedFilter } }).Body.totalCount -eq 5) 'nestedAndOrResultFilter'
Assert-Test ((Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{
    filter = (Execution-Comparison 'startDate' 'equals' '2024-01-01')
} }).Body.totalCount -eq 1) 'dateResultFilter'
$dateFieldFilter = @{ kind = 'comparison'; left = @{ fieldId = 'endDate' }; operator = 'lessThan';
    right = @{ kind = 'field'; field = @{ fieldId = 'startDate' } } }
Assert-Test ((Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{ filter = $dateFieldFilter } }).Body.totalCount -eq 2) 'fieldToFieldResultFilter'
Assert-Test ((Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{ search = '   ' } }).Body.totalCount -eq 20) 'blankSearchHasNoEffect'
Assert-Test ((Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{ search = 'NoSuchEmployee' } }).Body.totalCount -eq 0) 'searchNoMatches'

$hiddenFilter = (Send-Request 'POST' '/execute' @{
    definition = $relatedColumns; options = @{ filter = (Execution-Comparison 'isActive' 'equals' $true -Path @('employeeDepartment')) }
} 400).Body
Assert-Test ('filterFieldNotDisplayed' -in $hiddenFilter.errors.code) 'filterRejectsHiddenField'
$badFilter = (Send-Request 'POST' '/execute' @{
    definition = $allRows; options = @{ filter = (Execution-Comparison 'salary' 'equals' '15000') }
} 400).Body
Assert-Test ($badFilter.errors[0].path -eq 'options.filter.right.value' -and
    $badFilter.errors[0].code -eq 'constantTypeMismatch') 'filterTypeErrorHasOptionsPath'
$unknownFilter = (Send-Request 'POST' '/execute' @{
    definition = $allRows; options = @{ filter = (Execution-Comparison 'unknown' 'equals' 1) }
} 400).Body
Assert-Test ('unknownField' -in $unknownFilter.errors.code) 'filterRejectsUnknownField'
$tooLong = (Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{ search = ('x' * 201) } } 400).Body
Assert-Test ('searchTooLong' -in $tooLong.errors.code) 'searchLengthBound'
Send-Request 'POST' '/execute' '{"name":"Old bare definition","rootEntityId":"employee"}' 400 | Out-Null
Send-Request 'POST' '/execute' '{"options":{}}' 400 | Out-Null
Send-Request 'POST' '/execute' '{"definition":null,"options":{"sql":"SELECT 1"}}' 400 | Out-Null
Send-Request 'POST' "/$id/execute" '{"definition":{}}' 400 | Out-Null
Assert-Test $true 'strictExecutionEnvelopeBinding'

$savedOptions = @{ options = @{ search = 'Roni'; filter = (Execution-Comparison 'salary' 'greaterThan' 21000) } }
$savedFiltered = (Send-Request 'POST' "/$id/execute" $savedOptions).Body
$draftFiltered = (Send-Request 'POST' '/execute' @{ definition = $savedBeforeFiltering.definition; options = $savedOptions.options }).Body
Assert-Test ($savedFiltered.totalCount -eq 1 -and $savedFiltered.records[0].values.firstName -eq 'Roni' -and
    ($savedFiltered | ConvertTo-Json -Depth 100 -Compress) -eq ($draftFiltered | ConvertTo-Json -Depth 100 -Compress)) 'savedAndDraftFilteringMatch'
Assert-Test (($savedBeforeFiltering | ConvertTo-Json -Depth 100 -Compress) -eq
    ((Send-Request 'GET' "/$id").Body | ConvertTo-Json -Depth 100 -Compress) -and
    (Send-Request 'GET' '').Body.totalCount -eq $countBeforeFiltering) 'optionsNeverPersistOrEditRule'

Invoke-TestSql "UPDATE dbo.Employees SET FirstName=N'Wild%_[~' WHERE FirstName=N'Yuval';"
try {
    foreach ($literalSearch in @('%', '_', '[', '~', '%_[~')) {
        $literalResult = (Send-Request 'POST' '/execute' @{ definition = $allRows; options = @{ search = $literalSearch } }).Body
        Assert-Test ($literalResult.totalCount -eq 1 -and $literalResult.records[0].values.firstName -eq 'Wild%_[~') "literalSearch-$literalSearch"
    }
} finally { Invoke-TestSql "UPDATE dbo.Employees SET FirstName=N'Yuval' WHERE FirstName=N'Wild%_[~';" }
$injectedSearch = (Send-Request 'POST' '/execute' @{
    definition = $allRows; options = @{ search = "'; DROP TABLE Employees;--" }
}).Body
Assert-Test ($injectedSearch.totalCount -eq 0) 'searchInjectionIsLiteral'
