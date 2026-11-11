param([string]$Root = (Split-Path $PSScriptRoot -Parent), [int]$Port = 8126)
# Tiny static server for local testing (no Node or Python needed):
#   powershell -ExecutionPolicy Bypass -File tools/serve.ps1
# then open http://localhost:8126/?demo=1
# POST /__save?name=<file> writes the body into the repo — used by tools/make-target.html.
$types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript"; ".mjs"="text/javascript"; ".css"="text/css";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".svg"="image/svg+xml"; ".json"="application/json";
  ".mind"="application/octet-stream"; ".md"="text/plain; charset=utf-8"; ".pdf"="application/pdf" }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Output "serving $Root on http://localhost:$Port/"
while ($l.IsListening) {
  $c = $l.GetContext(); $q = $c.Request; $r = $c.Response
  try {
    $path = [Uri]::UnescapeDataString($q.Url.AbsolutePath)
    if ($q.HttpMethod -eq "POST" -and $path -eq "/__save") {
      $name = $q.QueryString["name"]
      if ($name -notmatch '^[\w\-./]+$' -or $name -match '\.\.') { throw "bad name" }
      $dest = Join-Path $Root $name
      $fs = [IO.File]::Create($dest); $q.InputStream.CopyTo($fs); $fs.Close()
      $b = [Text.Encoding]::UTF8.GetBytes("saved $name")
      Write-Output "saved $name"
    } else {
      if ($path.EndsWith("/")) { $path += "index.html" }
      $file = Join-Path $Root ($path.TrimStart("/").Replace("/", "\"))
      if (-not (Test-Path $file -PathType Leaf)) { $r.StatusCode = 404; $b = [Text.Encoding]::UTF8.GetBytes("404") }
      else {
        $b = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        if ($types.ContainsKey($ext)) { $r.ContentType = $types[$ext] }
        $r.Headers.Add("Cache-Control", "no-store")
      }
    }
    $r.OutputStream.Write($b, 0, $b.Length)
  } catch { $r.StatusCode = 500; Write-Output "error: $_" }
  $r.Close()
}
