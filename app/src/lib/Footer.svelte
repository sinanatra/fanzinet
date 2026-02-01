<script>
  const {
    author = "Paolo Palmacci",
    authorUrl = "https://www.paolopalmacci.it/",
    developer = "Giacomo Nanni",
    developerUrl = "https://giacomo.website/"
  } = $props();
</script>

<footer class="bg-black border-t text-xs text-white/70 px-2 py-1">
  <div class="flex flex-wrap items-center justify-between gap-1">
    <a
      href={authorUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="text-blue-600 hover:text-blue-800">{author}</a
    >
    ·
    <a
      href={developerUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="text-blue-600 hover:text-blue-800">{developer}</a
    >
  </div>
</footer>
