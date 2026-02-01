<script>
  export let author = "Paolo Palmacci";
  export let authorUrl = "https://www.paolopalmacci.it/";
  export let developer = "Giacomo Nanni";
  export let developerUrl = "https://giacomo.website/";
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
