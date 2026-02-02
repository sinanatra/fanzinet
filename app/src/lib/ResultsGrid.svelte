<script>
  const { items = [] } = $props();

  const baseUrl = "https://www.paolopalmacci.it/capitmundi/";

  let expandedIndex = $state(null);

  function toAbsoluteUrl(maybeRelative) {
    if (!maybeRelative) return "";
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    return `${baseUrl}${String(maybeRelative).replace(/^\/+/, "")}`;
  }

  function yearsLabel(item) {
    if (!item?.yearStart) return "";
    if (item?.yearEnd && item.yearEnd !== item.yearStart) {
      return `${item.yearStart}-${item.yearEnd}`;
    }
    return String(item.yearStart);
  }

  function itemKey(item, index) {
    const parts = [
      item?.sourceFile,
      item?.canonicalUrl,
      item?.pdfHref,
      item?.title,
      item?.fanzine,
      item?.city,
      item?.yearStart,
      item?.yearEnd,
    ]
      .filter((v) => v != null && String(v).trim() !== "")
      .map((v) => String(v));

    return parts.length ? `${parts.join("|")}|${index}` : String(index);
  }
</script>

<div class="min-h-screen">

  <div
    class="grid grid-cols-2 md:grid-cols-8 gap-0.5 p-0.5"
    role="list"
    aria-label="Fanzines"
  >
    {#each items as item, i (itemKey(item, i))}
      <div role="listitem" class=" bg-white p-0.5 text-left shadow-sm">
        <div class="aspect-[3/4] w-full overflow-hidden bg-black/5">
          {#if item.ogImage}
            <img
              class="h-full w-full object-fill"
              src={toAbsoluteUrl(item.ogImage)}
              alt={item.fanzine || "Fanzine cover"}
              loading="lazy"
            />
          {/if}
        </div>

        <div class="mt-0 mb-0.5 truncate font-bold leading-tight text-[.6rem]">
          {item.fanzine}
        </div>
        <div class="truncate leading-tight text-[.6rem]">
          {item.city}{item.country ? `, ${item.country}` : ""}
        </div>
        <div class="mt-0 line-clamp-2 leading-tight text-[.6rem]">
          {item.genre || "—"}{yearsLabel(item) ? ` · ${yearsLabel(item)}` : ""}
        </div>

        {#if item.description}
          <div class="mt-0.5 text-[.6rem] leading-snug text-black/60">
            <div class={expandedIndex === i ? "" : "line-clamp-3"}>
              {item.description}
            </div>
            <button
              type="button"
              class="mt-0.5 text-[.6rem] font-medium text-blue-600 hover:text-blue-800"
              on:click={() => {
                expandedIndex = expandedIndex === i ? null : i;
              }}
            >
              {expandedIndex === i ? "Read less" : "Read more"}
            </button>
          </div>
        {/if}

        <div class="mt-0.5 gap-0.5">
          {#if item?.pdfHref}
            <a
              class=" bg-black/5 px-0.5 py-0 text-[.6rem] hover:bg-black/10"
              href={toAbsoluteUrl(item.pdfHref)}
              target="_blank"
              rel="noreferrer"
            >
              PDF
            </a>
          {/if}
          {#if item?.canonicalUrl}
            <a
              class=" bg-black/5 px-0.5 py-0 text-[.6rem] text-black hover:bg-black/10"
              href={item.canonicalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Link
            </a>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
