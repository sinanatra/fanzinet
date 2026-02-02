<script>
  const {
    author = "Paolo Palmacci",
    authorUrl = "https://www.paolopalmacci.it/",
    developer = "Giacomo Nanni",
    developerUrl = "https://giacomo.website/",
  } = $props();
</script>

<footer
  class="bg-black min-h-[200px] border-t text-xs text-white px-2 py-1"
>
  <div class="text-white max-w-[800px] mb-5">
    <p class="mb-2">
      Questa è una mappatura della Rete delle Fanzine italiane originate dalla
      subcultura punk/nuovo rock negli anni ’80. Nell’Era del Telefono Fisso e
      del Francobollo ogni fanzine era un “nodo” di una rete analogica, con un
      indirizzo fisico che funzionava, di fatto, come un indirizzo IP.
    </p>
    <p class="mb-2">
      Collage di immagini e testi scritti a mano o battuti a macchina,
      ciclostilati o fotocopiati, che si concretizzavano in oggetti creati
      manualmente, quasi sempre del tutto artigianali.
    </p>
    <p class="mb-2">
      Questa mappatura e relativo archivio sono sviluppati nella totale aderenza
      allo spirito DIY che le animava. È totalmente gratuita e non esiste alcun
      ricavo oltre il Piacere di scoprire e condividere.
    </p>
    <p class="mb-2">
      Chiunque volesse fornire indicazioni, informazioni, notizie, documenti,
      suggerimenti e correzioni riguardo questa mappatura è benvenuto.
    </p>
    <p class="mb-2">
      Chiunque rintracciasse su questo sito un documento sul quale può vantare
      qualsivoglia diritto può farlo sapere: il contenuto sarà immediatamente
      rimosso.
    </p>
  </div>
  <div class="mb-4">
    <a
      href={authorUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="text-white hover:text-blue-800">{author}</a
    >
    ·
    <a
      href={developerUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="text-white hover:text-blue-800">{developer}</a
    >
  </div>
</footer>
