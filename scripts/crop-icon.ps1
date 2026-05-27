Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Dev\Urso.tech\app\icon.png"
$srcBytes = [System.IO.File]::ReadAllBytes($srcPath)
$ms = [System.IO.MemoryStream]::new($srcBytes)
$src = [System.Drawing.Bitmap]::new($ms)

$rect = [System.Drawing.Rectangle]::new(0, 0, $src.Width, $src.Height)
$data = $src.LockBits(
    $rect,
    [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$bytes = New-Object byte[] ($src.Width * $src.Height * 4)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$src.UnlockBits($data)

$w = $src.Width
$h = $src.Height
$minX = $w
$minY = $h
$maxX = 0
$maxY = 0

for ($y = 0; $y -lt $h; $y++) {
    $rowBase = $y * $w * 4
    for ($x = 0; $x -lt $w; $x++) {
        $alpha = $bytes[$rowBase + $x * 4 + 3]
        if ($alpha -gt 16) {
            if ($x -lt $minX) { $minX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Output "Bounds: minX=$minX minY=$minY maxX=$maxX maxY=$maxY (image ${w}x${h})"

$contentW = $maxX - $minX + 1
$contentH = $maxY - $minY + 1
$boxSize = [Math]::Max($contentW, $contentH)
$pad = [int]($boxSize * 0.06)
$boxSize += $pad * 2

$dstSize = 512
$cropped = [System.Drawing.Bitmap]::new($boxSize, $boxSize)
$g = [System.Drawing.Graphics]::FromImage($cropped)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

$dx = [int](($boxSize - $contentW) / 2)
$dy = [int](($boxSize - $contentH) / 2)
$srcRect = [System.Drawing.Rectangle]::new($minX, $minY, $contentW, $contentH)
$dstRect = [System.Drawing.Rectangle]::new($dx, $dy, $contentW, $contentH)
$g.DrawImage($src, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

$out512 = [System.Drawing.Bitmap]::new($dstSize, $dstSize)
$g2 = [System.Drawing.Graphics]::FromImage($out512)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g2.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g2.DrawImage($cropped, 0, 0, $dstSize, $dstSize)
$g2.Dispose()
$out512.Save("C:\Dev\Urso.tech\app\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

$appleSize = 180
$out180 = [System.Drawing.Bitmap]::new($appleSize, $appleSize)
$g3 = [System.Drawing.Graphics]::FromImage($out180)
$g3.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g3.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g3.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g3.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g3.DrawImage($cropped, 0, 0, $appleSize, $appleSize)
$g3.Dispose()
$out180.Save("C:\Dev\Urso.tech\app\apple-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

$src.Dispose()
$cropped.Dispose()
$out512.Dispose()
$out180.Dispose()

Write-Output "icon.png -> ${dstSize}x${dstSize}, apple-icon.png -> ${appleSize}x${appleSize}"
