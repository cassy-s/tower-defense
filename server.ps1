# Zero-install dev server for Windows (no Node needed): .\server.ps1 -> http://localhost:8080
# Does the same job as tools/serve.mjs (npm start). Keep the two in step.
param([int]$Port = 8080)

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Blockade running at http://localhost:$Port"

$mimeTypes = @{
    '.html'  = 'text/html; charset=utf-8'
    '.css'   = 'text/css; charset=utf-8'
    '.js'    = 'text/javascript; charset=utf-8'
    '.mjs'   = 'text/javascript; charset=utf-8'
    '.json'  = 'application/json'
    '.png'   = 'image/png'
    '.jpg'   = 'image/jpeg'
    '.svg'   = 'image/svg+xml'
    '.ico'   = 'image/x-icon'
    '.woff2' = 'font/woff2'
    '.md'    = 'text/plain; charset=utf-8'
    '.txt'   = 'text/plain; charset=utf-8'
}

$root = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path.EndsWith('/')) { $path = $path + 'index.html' }
    $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $path.Replace('/', '\')))
    $ctx.Response.Headers.Add('Cache-Control', 'no-cache')

    # Only serve files inside the project folder (not ..\ or a sibling folder).
    if (-not $filePath.StartsWith($root + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        $ctx.Response.StatusCode = 403
    } elseif (Test-Path -LiteralPath $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = $mimeTypes[$ext]
        if (-not $contentType) { $contentType = 'application/octet-stream' }
        $ctx.Response.ContentType = $contentType
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Not Found: $path")
        $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
}
