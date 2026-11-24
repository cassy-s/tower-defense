# Cache-busting stamp for Windows without Node:  powershell -ExecutionPolicy Bypass -File tools\stamp.ps1
# Same output as tools/stamp.mjs (npm run stamp); see that file for why. Keep the two in step.
param([switch]$Check)

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$utf8 = [System.Text.UTF8Encoding]::new($false)
$sha1 = [System.Security.Cryptography.SHA1]::Create()

function Get-Stamp([string]$rel) {
    # ReadAllText drops a BOM; CRLF -> LF so Windows and CI agree.
    $text = [System.IO.File]::ReadAllText((Join-Path $root $rel), $utf8).Replace("`r`n", "`n")
    $bytes = $sha1.ComputeHash($utf8.GetBytes($text))
    $hex = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    return "$rel" + '?v=' + $hex.Substring(0, 8)
}

$mods = @()
foreach ($dir in @('src', 'vendor')) {
    Get-ChildItem -Path (Join-Path $root $dir) -Recurse -File -Filter *.js | ForEach-Object {
        $mods += $_.FullName.Substring($root.Length).TrimStart('\').Replace('\', '/')
    }
}
[string[]]$mods = $mods
[Array]::Sort($mods, [StringComparer]::Ordinal)

$entries = @('  "three": "./' + (Get-Stamp 'vendor/three.module.js') + '"')
foreach ($m in $mods) { $entries += ('  "./' + $m + '": "./' + (Get-Stamp $m) + '"') }

$head = @(
    '<link rel="stylesheet" href="' + (Get-Stamp 'css/fonts.css') + '">'
    '<link rel="stylesheet" href="' + (Get-Stamp 'css/style.css') + '">'
    '<script type="importmap">'
    '{ "imports": {'
    ($entries -join ",`n")
    '} }'
    '</script>'
) -join "`n"

# The build id covers every stamped file, so any change gives a new id.
$buildBytes = $sha1.ComputeHash($utf8.GetBytes($head))
$build = (-join ($buildBytes | ForEach-Object { $_.ToString('x2') })).Substring(0, 8)

# Must match LOADER in tools/stamp.mjs character for character.
$loader = @'
<script>(function () { var B = '__BUILD__', M = '__MAIN__'; function go() { if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', go); return; } var s = document.createElement('script'); s.type = 'module'; s.src = M; document.head.appendChild(s); } fetch('build.txt?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : B; }).then(function (b) { b = b.trim(); var k = 'blockade.reloadedFor'; if (b && b !== B && sessionStorage.getItem(k) !== b) { sessionStorage.setItem(k, b); location.replace(location.pathname + '?b=' + b); } else go(); }, go); })();</script>
'@
$block = $head + "`n" + $loader.Replace('__BUILD__', $build).Replace('__MAIN__', (Get-Stamp 'src/main.js'))

$file = Join-Path $root 'index.html'
$html = [System.IO.File]::ReadAllText($file, $utf8)
$eol = if ($html.Contains("`r`n")) { "`r`n" } else { "`n" }
$src = $html.Replace("`r`n", "`n").Split("`n")
$start = -1; $end = -1
for ($i = 0; $i -lt $src.Length; $i++) {
    if ($start -lt 0 -and $src[$i].StartsWith('<!-- stamp:start')) { $start = $i }
    if ($src[$i].StartsWith('<!-- stamp:end')) { $end = $i }
}
if ($start -lt 0 -or $end -lt $start) { Write-Error 'index.html: stamp markers not found'; exit 1 }

$next = @($src[0..$start]) + $block.Split("`n") + @($src[$end..($src.Length - 1)])
$buildFile = Join-Path $root 'build.txt'
$oldBuild = if (Test-Path -LiteralPath $buildFile) { [System.IO.File]::ReadAllText($buildFile, $utf8).Trim() } else { '' }
$same = (($next -join "`n") -ceq ($src -join "`n")) -and ($oldBuild -ceq $build)

if ($Check) {
    if ($same) { Write-Host 'index.html stamps are up to date'; exit 0 }
    Write-Error 'index.html / build.txt stamps are out of date: run tools\stamp.ps1 (or npm run stamp) and commit the result.'; exit 1
}
if ($same) { Write-Host 'index.html stamps already up to date' }
else {
    [System.IO.File]::WriteAllText($file, ($next -join $eol), $utf8)
    [System.IO.File]::WriteAllText($buildFile, $build, $utf8)
    Write-Host "stamped $($mods.Length) modules in index.html (build $build)"
}
