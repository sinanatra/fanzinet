<svelte:options runes={false} />

<script>
  import { createEventDispatcher, onDestroy, tick } from "svelte";

  export let city = null;
  export let anchorId = null;
  export let variant = "modal";

  const dispatch = createEventDispatcher();
  let closeBtn;

  $: open = Boolean(city);
  $: isModal = variant === "modal";
  $: if (open) {
    console.log("overlayOpen", {
      fanzine: city?.fanzine,
      city: city?.city,
      canonicalUrl: city?.canonicalUrl,
    });
  }

  const baseUrl = "https://www.paolopalmacci.it/capitmundi/";

  function toAbsoluteUrl(maybeRelative) {
    if (!maybeRelative) return "";
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    return `${baseUrl}${String(maybeRelative).replace(/^\/+/, "")}`;
  }

  let remoteContent = { description: "", text: "" };
  let remoteLoading = false;
  let remoteError = "";
  let abortController = null;

  async function focusDialog() {
    await tick();
    closeBtn?.focus?.();
  }

  function close() {
    console.log("overlayCloseClick", {
      fanzine: city?.fanzine,
      city: city?.city,
      canonicalUrl: city?.canonicalUrl,
    });
    dispatch("close");
  }

  function onBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    close();
  }

  function onBackdropKeydown(e) {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      close();
    }
  }

  function onKeydown(e) {
    if (!open) return;
    if (e.key === "Escape") close();
  }

  let removeListener = null;
  $: if (open) {
    focusDialog();
    window.addEventListener("keydown", onKeydown);
    removeListener = () => window.removeEventListener("keydown", onKeydown);
    (async () => {
      remoteContent = { description: "", text: "" };
      remoteError = "";
      remoteLoading = false;
      abortController?.abort?.();

      const canonical = city?.canonicalUrl;
      if (!canonical) return;

      abortController = new AbortController();
      remoteLoading = true;
      try {
        const res = await fetch(
          `/api/fanzine?url=${encodeURIComponent(canonical)}`,
          { signal: abortController.signal },
        );
        if (!res.ok) throw new Error("Failed to load text");
        remoteContent = await res.json();
      } catch (e) {
        if (e?.name !== "AbortError") {
          remoteError = e instanceof Error ? e.message : String(e);
        }
      } finally {
        remoteLoading = false;
      }
    })();
  } else if (removeListener) {
    removeListener();
    removeListener = null;
  }

  onDestroy(() => {
    if (removeListener) removeListener();
    abortController?.abort?.();
  });
</script>

{#if open}
  {#if isModal}
    <div
      class="fixed inset-0 z-[1000] flex cursor-pointer items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
      role="button"
      aria-label="Close dialog"
      tabindex="0"
      on:click={onBackdropClick}
      on:keydown={onBackdropKeydown}
    >
      <div
        class="flex max-h-[80vh] w-fullcursor-default flex-col overflow-hidden  bg-white/95 text-black shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur"
        id={anchorId || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fz-title"
        tabindex="-1"
        on:click|stopPropagation={() => {}}
        on:keydown|stopPropagation={() => {}}
      >
        <div
          class="flex items-center justify-between gap-3 border-b border-black/10 px-2 pb-2 pt-3"
        >
          <div class="text-base font-bold leading-tight" id="fz-title">
            {city?.fanzine || "Fanzine"}
          </div>
          <button
            bind:this={closeBtn}
            type="button"
            class="h-8 w-8 bg-transparent text-[22px] leading-none text-black hover:bg-black/5"
            aria-label="Close"
            on:click={close}
          >
            ×
          </button>
        </div>

        <div
          class="grid min-h-0 gap-2 overflow-auto px-2 pb-4 pt-3 text-[13px] leading-snug"
        >
          {#if city?.ogImage}
            <img
              class="max-h-[260px] w-full  bg-white object-contain"
              src={toAbsoluteUrl(city.ogImage)}
              alt={city?.fanzine || "Fanzine cover"}
            />
          {/if}

          {#if city?.title && city?.title !== city?.fanzine}
            <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
              <span class="font-semibold text-black/60">Title</span>{city.title}
            </div>
          {/if}

          {#if city?.city}
            <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
              <span class="font-semibold text-black/60">City</span>{city.city}
            </div>
          {/if}

          {#if city?.country}
            <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
              <span class="font-semibold text-black/60">Country</span
              >{city.country}
            </div>
          {/if}

          {#if city?.activity}
            <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
              <span class="font-semibold text-black/60">Activity</span
              >{city.activity}
            </div>
          {/if}

          {#if city?.yearStart}
            <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
              <span class="font-semibold text-black/60">Years</span>
              {city.yearStart}{city.yearEnd && city.yearStart !== city.yearEnd
                ? "-" + city.yearEnd
                : ""}
            </div>
          {/if}
          {#if city?.genre}
            <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
              <span class="font-semibold text-black/60">Genre</span>{city.genre}
            </div>
          {/if}

          {#if city?.pdfHref}
            <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
              <span class="font-semibold text-black/60">PDF</span>
              <a
                class="underline"
                href={toAbsoluteUrl(city.pdfHref)}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
            </div>
          {/if}

          {#if city?.canonicalUrl}
            <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
              <span class="font-semibold text-black/60">Page</span>
              <a
                class="underline"
                href={city.canonicalUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
            </div>
          {/if}

          {#if remoteLoading}
            <div class="text-xs text-black/70">Loading text…</div>
          {:else if remoteError}
            <div class="text-xs text-red-700">{remoteError}</div>
          {:else if remoteContent?.description || remoteContent?.text}
            <div class="mt-1 grid gap-2 border-t border-black/10 pt-3">
              {#if remoteContent?.description}
                <div class="text-[13px] font-bold leading-snug">
                  {remoteContent.description}
                </div>
              {/if}
              {#if remoteContent?.text}
                <div
                  class="whitespace-pre-wrap text-xs leading-snug text-black/80"
                >
                  {remoteContent.text}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div
      class="pointer-events-auto flex h-full min-h-0 w-full flex-col overflow-hidden   bg-white/90 text-black shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur"
      id={anchorId || undefined}
      role="region"
      aria-label="Fanzine details"
    >
      <div
        class="flex items-center justify-between gap-3 border-b border-black/10 px-2 pb-2 pt-3"
      >
        <div class="text-base font-bold leading-tight" id="fz-title">
          {city?.fanzine || "Fanzine"}
        </div>
        <button
          bind:this={closeBtn}
          type="button"
          class="h-8 w-8  bg-transparent text-[22px] leading-none text-black hover:bg-black/5"
          aria-label="Close"
          on:click={close}
        >
          ×
        </button>
      </div>

      <div
        class="grid min-h-0 gap-2 overflow-auto px-2 pb-4 pt-3 text-[13px] leading-snug"
      >
        {#if city?.ogImage}
          <img
            class="max-h-[260px] w-full   bg-white object-contain"
            src={toAbsoluteUrl(city.ogImage)}
            alt={city?.fanzine || "Fanzine cover"}
          />
        {/if}

        {#if city?.title && city?.title !== city?.fanzine}
          <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
            <span class="font-semibold text-black/60">Title</span>{city.title}
          </div>
        {/if}

        {#if city?.city}
          <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
            <span class="font-semibold text-black/60">City</span>{city.city}
          </div>
        {/if}

        {#if city?.country}
          <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
            <span class="font-semibold text-black/60">Country</span
            >{city.country}
          </div>
        {/if}

        {#if city?.activity}
          <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
            <span class="font-semibold text-black/60">Activity</span
            >{city.activity}
          </div>
        {/if}

        {#if city?.yearStart}
          <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
            <span class="font-semibold text-black/60">Years</span>
            {city.yearStart}{city.yearEnd && city.yearStart !== city.yearEnd
              ? "-" + city.yearEnd
              : ""}
          </div>
        {/if}
        {#if city?.genre}
          <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
            <span class="font-semibold text-black/60">Genre</span>{city.genre}
          </div>
        {/if}

        {#if city?.pdfHref}
          <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
            <span class="font-semibold text-black/60">PDF</span>
            <a
              class="underline"
              href={toAbsoluteUrl(city.pdfHref)}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </div>
        {/if}

        {#if city?.canonicalUrl}
          <div class="grid grid-cols-[90px_1fr] items-baseline gap-2.5">
            <span class="font-semibold text-black/60">Page</span>
            <a
              class="underline"
              href={city.canonicalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </div>
        {/if}

        {#if remoteLoading}
          <div class="text-xs text-black/70">Loading text…</div>
        {:else if remoteError}
          <div class="text-xs text-red-700">{remoteError}</div>
        {:else if remoteContent?.description || remoteContent?.text}
          <div class="mt-1 grid gap-2 border-t border-black/10 pt-3">
            {#if remoteContent?.description}
              <div class="text-[13px] font-bold leading-snug">
                {remoteContent.description}
              </div>
            {/if}
            {#if remoteContent?.text}
              <div
                class="whitespace-pre-wrap text-xs leading-snug text-black/80"
              >
                {remoteContent.text}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/if}
