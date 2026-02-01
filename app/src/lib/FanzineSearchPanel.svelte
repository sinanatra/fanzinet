<svelte:options runes={false} />

<script>
  import { createEventDispatcher } from "svelte";

  export let query = "";
  export let totalCount = 0;
  export let visibleCount = 0;
  export let resultsCount = 0;
  export let hasSelection = false;

  const dispatch = createEventDispatcher();

  function clear() {
    query = "";
    dispatch("clear");
  }
</script>

<div class="grid w-full max-w-[520px]">
  <div class="flex items-center gap-2">
    <input
      type="text"
      placeholder="Search..."
      bind:value={query}
      class="flex-1 border border-black bg-white px-2 py-1 text-sm text-black outline-none"
      aria-label="Search fanzines"
    />
    {#if query || hasSelection}
      <button
        type="button"
        class=" border border-black px-2 py-1 text-sm text-black"
        on:click={clear}
      >
        X
      </button>
    {/if}
  </div>
</div>
