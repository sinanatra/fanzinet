<svelte:options runes={false} />

<script>
  export let items = [];
  export let onSelect = null;

  const baseUrl = "https://www.paolopalmacci.it/capitmundi/";

  function toAbsoluteUrl(maybeRelative) {
    if (!maybeRelative) return "";
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    return `${baseUrl}${String(maybeRelative).replace(/^\/+/, "")}`;
  }
</script>

<div
  class="w-full pointer-events-auto overflow-x-auto   bg-white/90 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur"
  role="list"
  aria-label="Search results"
>
  <div class="flex min-w-max items-start gap-3 bg-white">
    {#each items as item (item.canonicalUrl || item.fanzine)}
      <button
        type="button"
        class="min-h-[300px] min-w-[200px] shrink-0 text-left"
        on:click={() => {
          console.log("resultsRowClick", {
            fanzine: item?.fanzine,
            city: item?.city,
            canonicalUrl: item?.canonicalUrl,
          });
          onSelect?.(item);
        }}
      >
        {#if item.ogImage}
          <img
            class="h-[300px]   bg-white object-contain"
            src={toAbsoluteUrl(item.ogImage)}
            alt={item.fanzine || "Fanzine cover"}
            loading="lazy"
          />
        {/if}

        <div
          class="mt-1 truncate text-[11px] font-bold leading-tight text-black"
        >
          {item.fanzine}
        </div>
        <div class="mt-0.5 truncate text-[10px] leading-tight text-black/70">
          {item.city}
        </div>
      </button>
    {/each}
  </div>
</div>
