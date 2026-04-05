Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root "assets"

if (-not (Test-Path -LiteralPath $assetsDir)) {
  New-Item -ItemType Directory -Path $assetsDir | Out-Null
}

function New-ColorBrush([byte] $a, [byte] $r, [byte] $g, [byte] $b) {
  $brush = [System.Windows.Media.SolidColorBrush]::new(
    [System.Windows.Media.Color]::FromArgb($a, $r, $g, $b)
  )
  $brush.Freeze()
  return $brush
}

function New-Pen([System.Windows.Media.Brush] $brush, [double] $thickness) {
  $pen = [System.Windows.Media.Pen]::new($brush, $thickness)
  $pen.Freeze()
  return $pen
}

function Write-Icon([int] $size, [string] $path) {
  $blue = New-ColorBrush 255 0x3B 0x82 0xF6
  $glowOuter = New-ColorBrush 12 0x3B 0x82 0xF6
  $glowMid = New-ColorBrush 22 0x3B 0x82 0xF6
  $glowInner = New-ColorBrush 34 0x3B 0x82 0xF6

  $visual = [System.Windows.Media.DrawingVisual]::new()
  $dc = $visual.RenderOpen()

  $center = $size / 2.0
  $centerPoint = [System.Windows.Point]::new($center, $center)
  $outerRadius = $size * 0.30
  $borderThickness = [Math]::Max(1.4, $size * 0.07)
  $innerRingRadius = $size * 0.11
  $innerRingThickness = [Math]::Max(1.2, $size * 0.05)
  $dotRadius = [Math]::Max(1.2, $size * 0.032)
  $outerPen = New-Pen $blue $borderThickness
  $innerPen = New-Pen $blue $innerRingThickness
  $glowOuterPen = New-Pen $glowOuter ([Math]::Max(1.8, $size * 0.12))
  $glowMidPen = New-Pen $glowMid ([Math]::Max(1.4, $size * 0.09))
  $glowInnerPen = New-Pen $glowInner ([Math]::Max(1.0, $size * 0.06))

  $dc.DrawEllipse($null, $glowOuterPen, $centerPoint, $size * 0.33, $size * 0.33)
  $dc.DrawEllipse($null, $glowMidPen, $centerPoint, $size * 0.32, $size * 0.32)
  $dc.DrawEllipse($null, $glowInnerPen, $centerPoint, $size * 0.31, $size * 0.31)
  $dc.DrawEllipse($null, $outerPen, $centerPoint, $outerRadius, $outerRadius)
  $dc.DrawEllipse($null, $innerPen, $centerPoint, $innerRingRadius, $innerRingRadius)
  $dc.DrawEllipse($blue, $null, $centerPoint, $dotRadius, $dotRadius)

  $dc.Close()

  $bitmap = [System.Windows.Media.Imaging.RenderTargetBitmap]::new(
    $size,
    $size,
    96,
    96,
    [System.Windows.Media.PixelFormats]::Pbgra32
  )
  $bitmap.Render($visual)

  $encoder = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))

  $stream = [System.IO.File]::Create($path)
  try {
    $encoder.Save($stream)
  } finally {
    $stream.Dispose()
  }
}

foreach ($size in 16, 32, 48, 128) {
  Write-Icon -size $size -path (Join-Path $assetsDir ("icon-" + $size + ".png"))
}
