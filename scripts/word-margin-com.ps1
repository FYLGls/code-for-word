$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

function Pts([double]$cm) { return [math]::Round($cm * 28.35, 1) }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$results = @()

try {
  # --- DOCX open ---
  $docxPath = 'C:\Users\Ibiza\AppData\Local\Temp\margin-test.docx'
  $doc = $word.Documents.Open($docxPath)
  $sec = $doc.Sections.Item(1).PageSetup
  $results += [pscustomobject]@{
    path = 'docx-pgMar'
    leftMar_cm = [math]::Round($sec.LeftMargin / 28.35, 2)
    rightMar_cm = [math]::Round($sec.RightMargin / 28.35, 2)
    pageW_cm = [math]::Round($sec.PageWidth / 28.35, 2)
    ok = ([math]::Abs(($sec.LeftMargin / 28.35) - 2.0) -lt 0.15) -and
         ([math]::Abs(($sec.RightMargin / 28.35) - 2.0) -lt 0.15) -and
         ([math]::Abs(($sec.PageWidth / 28.35) - 21.0) -lt 0.2)
  }
  $doc.Close($false)

  # --- RTF clipboard paste ---
  $rtf = [System.IO.File]::ReadAllText(
    'C:\Users\Ibiza\AppData\Local\Temp\margin-test.rtf',
    [System.Text.Encoding]::UTF8
  )
  $data = New-Object System.Windows.Forms.DataObject
  $data.SetData([System.Windows.Forms.DataFormats]::Rtf, $false, $rtf)
  [System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
  Start-Sleep -Milliseconds 250

  $doc2 = $word.Documents.Add()
  $doc2.PageSetup.LeftMargin = Pts 2.54
  $doc2.PageSetup.RightMargin = Pts 2.54
  $doc2.Content.Paste()

  $para = $null
  for ($i = 1; $i -le $doc2.Paragraphs.Count; $i++) {
    $t = $doc2.Paragraphs.Item($i).Range.Text
    if ($t -match 'def|return|1\.') { $para = $doc2.Paragraphs.Item($i); break }
  }
  if (-not $para) { $para = $doc2.Paragraphs.Item(1) }
  $li = $para.Range.ParagraphFormat.LeftIndent
  $ri = $para.Range.ParagraphFormat.RightIndent
  $results += [pscustomobject]@{
    path = 'rtf-li-ri'
    leftMar_cm = [math]::Round($li / 28.35, 2)
    rightMar_cm = [math]::Round($ri / 28.35, 2)
    pageW_cm = $null
    ok = ([math]::Abs(($li / 28.35) - 2.0) -lt 0.2) -and
         ([math]::Abs(($ri / 28.35) - 2.0) -lt 0.2)
  }

  # Tab stop must sit past \\li (absolute from page margin)
  $tabs = $para.Range.ParagraphFormat.TabStops
  $firstTabCm = if ($tabs.Count -gt 0) {
    [math]::Round($tabs.Item(1).Position / 28.35, 3)
  } else { 0 }
  $hasTabChar = $para.Range.Text -match "`t"
  $results += [pscustomobject]@{
    path = 'rtf-inset-tab'
    leftMar_cm = $firstTabCm
    rightMar_cm = $null
    pageW_cm = $null
    # expect ~ li(2cm) + gutter(~0.85) + inset(1cm) ≈ 3.8cm+
    ok = $hasTabChar -and ($firstTabCm -gt 2.5)
  }

  $doc2.Close($false)

  # Dedicated tab geometry fixture
  $tabRtf = [System.IO.File]::ReadAllText(
    'C:\Users\Ibiza\AppData\Local\Temp\margin-tab-test.rtf',
    [System.Text.Encoding]::UTF8
  )
  $data2 = New-Object System.Windows.Forms.DataObject
  $data2.SetData([System.Windows.Forms.DataFormats]::Rtf, $false, $tabRtf)
  [System.Windows.Forms.Clipboard]::SetDataObject($data2, $true)
  Start-Sleep -Milliseconds 250
  $doc3 = $word.Documents.Add()
  $doc3.PageSetup.LeftMargin = 72
  $doc3.PageSetup.RightMargin = 72
  $doc3.Content.Paste()
  $p3 = $doc3.Paragraphs.Item(1)
  $t3 = $p3.Range.ParagraphFormat.TabStops
  $tabCm = if ($t3.Count -gt 0) { [math]::Round($t3.Item(1).Position / 28.35, 3) } else { 0 }
  $liCm = [math]::Round($p3.Range.ParagraphFormat.LeftIndent / 28.35, 3)
  $results += [pscustomobject]@{
    path = 'rtf-tab-absolute'
    leftMar_cm = $liCm
    rightMar_cm = $tabCm
    pageW_cm = $null
    ok = ($liCm -gt 1.8) -and ($tabCm -gt ($liCm + 0.8))
  }
  $doc3.Close($false)
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

$results | ConvertTo-Json -Compress
$fail = @($results | Where-Object { -not $_.ok })
if ($fail.Count -gt 0) { exit 2 } else { exit 0 }
