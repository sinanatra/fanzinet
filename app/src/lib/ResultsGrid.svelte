<script>
  const { items = [] } = $props();

  const baseUrl = "https://www.paolopalmacci.it/capitmundi/";

  let sortedItems = $derived.by(() => {
    const withImages = items.filter((item) => item.ogImage).sort((a, b) =>
      (a.fanzine || "").localeCompare(b.fanzine || "")
    );
    const withoutImages = items.filter((item) => !item.ogImage);
    return [...withImages, ...withoutImages];
  });

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
    class="grid grid-cols-2 md:grid-cols-4 gap-2 p-0.5"
    role="list"
    aria-label="Fanzines"
  >
    {#each sortedItems as item, i (itemKey(item, i))}
      <div role="listitem" class="bg-white p-1.5 text-left shadow-sm">
        <div class="aspect-[3/4] w-full overflow-hidden bg-black/5">
          {#if item.ogImage}
            <img
              class="h-full w-full object-cover"
              src={toAbsoluteUrl(item.ogImage)}
              alt={item.fanzine || "Fanzine cover"}
              loading="lazy"
            />
          {/if}
        </div>

        <div class="mt-1 mb-0.5 truncate font-bold leading-tight text-xs">
          {item.fanzine}
        </div>
        <div class="truncate leading-tight text-xs">
          {item.city}{item.country ? `, ${item.country}` : ""}
        </div>
        <div class="mt-0.5 line-clamp-2 leading-tight text-xs">
          {item.genre || "—"}{yearsLabel(item) ? ` · ${yearsLabel(item)}` : ""}
        </div>

        <div class="mt-1 flex gap-1">
          {#if item?.pdfHref}
            <a
              class="bg-black/5 px-1 py-0.5 text-xs hover:bg-black/10"
              href={toAbsoluteUrl(item.pdfHref)}
              target="_blank"
              rel="noreferrer"
            >
              PDF
            </a>
          {/if}
          {#if item?.canonicalUrl}
            <a
              class="bg-black/5 px-1 py-0.5 text-xs text-black hover:bg-black/10"
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
