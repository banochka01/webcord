$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$sourcePath = Join-Path $repoRoot 'frontend\public\icons\webcord.png'
$foregroundSourcePath = Join-Path $repoRoot 'frontend\public\icons\webcord-white.png'
$androidRoot = Join-Path $repoRoot 'clients\webcord_native\android\app\src\main\res'
$webIconsRoot = Join-Path $repoRoot 'frontend\public\icons'
$windowsIconPath = Join-Path $repoRoot 'clients\webcord_native\windows\runner\resources\app_icon.ico'
$desktopIconPath = Join-Path $repoRoot 'desktop\build\icon.ico'
$desktopPngPath = Join-Path $repoRoot 'desktop\build\icon.png'

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Canonical WebCord icon was not found: $sourcePath"
}
if (-not (Test-Path -LiteralPath $foregroundSourcePath -PathType Leaf)) {
  throw "Canonical WebCord foreground was not found: $foregroundSourcePath"
}

$source = [System.Drawing.Image]::FromFile($sourcePath)
$foregroundSource = [System.Drawing.Image]::FromFile($foregroundSourcePath)

function New-IconPngBytes {
  param([int] $Size)

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $Size, $Size)

    $stream = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      return ,$stream.ToArray()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function New-IconDibBytes {
  param([int] $Size)

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $Size, $Size)

    $rectangle = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $bitmapData = $bitmap.LockBits(
      $rectangle,
      [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
      if ($bitmapData.Stride -le 0) { throw 'Unexpected negative icon bitmap stride.' }
      $rawPixels = New-Object byte[] ($bitmapData.Stride * $Size)
      [System.Runtime.InteropServices.Marshal]::Copy($bitmapData.Scan0, $rawPixels, 0, $rawPixels.Length)

      $pixelBytes = $Size * $Size * 4
      $maskRowBytes = [int]([Math]::Ceiling($Size / 32.0) * 4)
      $maskBytes = $maskRowBytes * $Size
      $stream = New-Object System.IO.MemoryStream
      $writer = New-Object System.IO.BinaryWriter($stream)
      try {
        $writer.Write([uint32]40)
        $writer.Write([int32]$Size)
        $writer.Write([int32]($Size * 2))
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]0)
        $writer.Write([uint32]$pixelBytes)
        $writer.Write([int32]0)
        $writer.Write([int32]0)
        $writer.Write([uint32]0)
        $writer.Write([uint32]0)
        for ($row = $Size - 1; $row -ge 0; $row--) {
          $writer.Write($rawPixels, $row * $bitmapData.Stride, $Size * 4)
        }
        $writer.Write((New-Object byte[] $maskBytes))
        $writer.Flush()
        return ,$stream.ToArray()
      } finally {
        $writer.Dispose()
        $stream.Dispose()
      }
    } finally {
      $bitmap.UnlockBits($bitmapData)
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function New-AdaptiveForegroundPngBytes {
  param([int] $Size)

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    # Android masks the outer 18dp of adaptive icons. Keep the actual mark in
    # the central safe zone so circles, squircles and themed icons stay intact.
    $markSize = [int][Math]::Round($Size * 0.60)
    $offset = [int](($Size - $markSize) / 2)
    $graphics.DrawImage($foregroundSource, $offset, $offset, $markSize, $markSize)

    $stream = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      return ,$stream.ToArray()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Set-BinaryFileIfChanged {
  param(
    [string] $Path,
    [byte[]] $Bytes
  )

  $unchanged = $false
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    $existing = [System.IO.File]::ReadAllBytes($Path)
    $unchanged = $existing.Length -eq $Bytes.Length -and [System.Linq.Enumerable]::SequenceEqual($existing, $Bytes)
  }
  if (-not $unchanged) {
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllBytes($Path, $Bytes)
    Write-Host "Updated $Path"
  }
}

try {
  $androidSizes = [ordered]@{
    'mipmap-mdpi\ic_launcher.png' = 48
    'mipmap-hdpi\ic_launcher.png' = 72
    'mipmap-xhdpi\ic_launcher.png' = 96
    'mipmap-xxhdpi\ic_launcher.png' = 144
    'mipmap-xxxhdpi\ic_launcher.png' = 192
  }
  foreach ($entry in $androidSizes.GetEnumerator()) {
    Set-BinaryFileIfChanged -Path (Join-Path $androidRoot $entry.Key) -Bytes (New-IconPngBytes -Size $entry.Value)
    $brandedPath = $entry.Key -replace 'ic_launcher\.png$', 'webcord_launcher.png'
    Set-BinaryFileIfChanged -Path (Join-Path $androidRoot $brandedPath) -Bytes (New-IconPngBytes -Size $entry.Value)
  }

  $adaptiveForeground = New-AdaptiveForegroundPngBytes -Size 432
  Set-BinaryFileIfChanged -Path (Join-Path $androidRoot 'drawable-nodpi\webcord_launcher_foreground.png') -Bytes $adaptiveForeground
  Set-BinaryFileIfChanged -Path (Join-Path $androidRoot 'drawable-nodpi\webcord_launcher_monochrome.png') -Bytes $adaptiveForeground

  Set-BinaryFileIfChanged -Path (Join-Path $webIconsRoot 'icon-192.png') -Bytes (New-IconPngBytes -Size 192)
  Set-BinaryFileIfChanged -Path (Join-Path $webIconsRoot 'icon-512.png') -Bytes (New-IconPngBytes -Size 512)
  Set-BinaryFileIfChanged -Path (Join-Path $webIconsRoot 'apple-touch-icon.png') -Bytes (New-IconPngBytes -Size 180)

  Set-BinaryFileIfChanged -Path $desktopPngPath -Bytes (New-IconPngBytes -Size 512)

  $icoSizes = @(16, 24, 32, 48, 64, 128, 256)
  $icoImages = @($icoSizes | ForEach-Object {
    [pscustomobject]@{ Size = $_; Bytes = [byte[]](New-IconDibBytes -Size $_) }
  })
  $icoStream = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($icoStream)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$icoImages.Count)
    $offset = 6 + (16 * $icoImages.Count)
    foreach ($image in $icoImages) {
      $dimension = if ($image.Size -eq 256) { 0 } else { $image.Size }
      $writer.Write([byte]$dimension)
      $writer.Write([byte]$dimension)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$image.Bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $image.Bytes.Length
    }
    foreach ($image in $icoImages) {
      $writer.Write($image.Bytes)
    }
    $writer.Flush()
    $icoBytes = $icoStream.ToArray()
  } finally {
    $writer.Dispose()
    $icoStream.Dispose()
  }

  Set-BinaryFileIfChanged -Path $windowsIconPath -Bytes $icoBytes
  Set-BinaryFileIfChanged -Path $desktopIconPath -Bytes $icoBytes
} finally {
  $foregroundSource.Dispose()
  $source.Dispose()
}
