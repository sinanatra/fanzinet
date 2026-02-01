<script>
  let {
    query = $bindable(""),
    totalCount = 0,
    visibleCount = 0,
    resultsCount = 0,
    hasSelection = false,
    onclear,
  } = $props();

  function clear() {
    query = "";
    onclear?.();
  }
</script>

<div class="flex w-full justify-between items-end gap-3 pb-3">
  <div class="grid w-full max-w-[280px]">
    <div class="flex items-center gap-0.5">
      <input
        type="text"
        placeholder="Cerca..."
        bind:value={query}
        class="flex-1 border border-black bg-white px-1 py-0.5 text-xs text-black outline-none"
        aria-label="Search fanzines"
      />
      {#if query || hasSelection}
        <button
          type="button"
          class=" border border-black px-1 py-0.5 text-xs text-black cursor-pointer user-select-none"
          on:click={clear}
        >
          X
        </button>
      {/if}
    </div>
  </div>
  <div class="text-xs leading-tight text-black/70">
    <strong class="text-black">{query ? resultsCount : totalCount}</strong> fanzine
  </div>
</div>
