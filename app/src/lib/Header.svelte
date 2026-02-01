<script>
  const { title = "fanzinet", subtitle = "analogikal knot map", version = "0.?" } = $props();
</script>

<header class="bg-black border-b text-xs">
  <div class="mx-auto p-1">
    <div class="text-white">
      {title}
      {subtitle} v.{version}
    </div>
  </div>
</header>
