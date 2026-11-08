# Abre a demonstração por um servidor local mínimo (só neste computador, http://localhost).
# Necessário para o mapa de fundo: aberto direto do arquivo (file://), o navegador não
# informa a origem e o servidor de mapas do OpenStreetMap bloqueia as imagens.
param([switch]$SemAbrir)
$ErrorActionPreference = 'Stop'
$raiz = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path)) + [IO.Path]::DirectorySeparatorChar
$porta = 8765
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.svg' = 'image/svg+xml'; '.json' = 'application/json'
}

$servidor = New-Object System.Net.HttpListener
$servidor.Prefixes.Add("http://localhost:$porta/")
try { $servidor.Start() } catch {
  Write-Host "Nao foi possivel usar a porta $porta. Talvez a demonstracao ja esteja aberta em http://localhost:$porta/"
  Start-Process "http://localhost:$porta/index.html"
  Read-Host 'Pressione Enter para fechar'
  exit
}

if (-not $SemAbrir) { Start-Process "http://localhost:$porta/index.html" }
Write-Host ''
Write-Host "  Demonstracao aberta em http://localhost:$porta/"
Write-Host '  Deixe esta janela aberta durante a apresentacao. Feche-a para encerrar.'
Write-Host ''

while ($servidor.IsListening) {
  $ctx = $servidor.GetContext()
  try {
    $caminho = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if (-not $caminho) { $caminho = 'index.html' }
    $arquivo = [IO.Path]::GetFullPath((Join-Path $raiz $caminho))
    # Só entrega arquivos de dentro desta pasta.
    if ($arquivo.StartsWith($raiz) -and (Test-Path -LiteralPath $arquivo -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($arquivo)
      $tipo = $tipos[[IO.Path]::GetExtension($arquivo).ToLower()]
      if ($tipo) { $ctx.Response.ContentType = $tipo }
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {
    $ctx.Response.StatusCode = 500
  } finally {
    $ctx.Response.Close()
  }
}
