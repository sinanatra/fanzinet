<script>
  export let title = "fanzinet";
  export let subtitle = "analogikal knot map";
  export let version = "0.?";
  export let years = "(1980-1989)";
  export let author = "Paolo Palmacci";
  export let authorUrl = "https://www.paolopalmacci.it/";
  export let developer = "Giacomo Nanni";
  export let developerUrl = "https://giacomo.website/";
</script>

<header class="bg-black border-b text-xs">
  <div class="mx-auto p-1">
    <div class="flex flex-wrap items-center justify-between gap-1">
      <div class="  text-white">
        {title}
        {subtitle} v.{version}
        {years}
      </div>
      <div class=" text-white/70 whitespace-nowrap">
        <a
          href={authorUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-600 hover:text-blue-800">↗</a
        >
        ·
        <a
          href={developerUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-600 hover:text-blue-800">↗</a
        >
      </div>
    </div>
  </div>
</header>
