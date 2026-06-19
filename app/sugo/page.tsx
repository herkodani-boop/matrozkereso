import { SiteFooter } from "@/components/site-footer"

export const metadata = {
  title: "Súgó | Matrózkereső",
  description: "Gyakori kérdések és gyors segítség a Matrózkereső használatához.",
}

const faqItems = [
  {
    question: "Hogyan tudok hirdetést feladni kapitányként?",
    answer:
      "Jelentkezz be kapitány fiókkal, menj a Kapitányi dashboard oldalra, majd kattints az Új hirdetés feladása gombra. Töltsd ki a kötelező mezőket (cím, helyszín, dátum, keresett posztok, tapasztalati szint), és mentsd a hirdetést.",
  },
  {
    question: "Hogyan tudok jelentkezni egy hajóra?",
    answer:
      "A Böngészés oldalon válaszd ki a számodra megfelelő hirdetést, majd kattints a Jelentkezem a hajóra gombra. Bejelentkezés után a jelentkezés azonnal rögzítésre kerül.",
  },
  {
    question: "Vissza tudom vonni a jelentkezésemet?",
    answer:
      "Igen. A böngészés kártyán, ha már jelentkeztél, a Jelentkezés visszavonása gombbal törölheted a jelentkezést.",
  },
  {
    question: "Miért nem látom a hirdetésemet?",
    answer:
      "Ellenőrizd, hogy a hirdetés aktív-e, és hogy a megadott dátumok alapján még érvényes-e. Lezárt hirdetés nem jelenik meg a böngészés listában.",
  },
  {
    question: "Több keresett posztot is meg lehet adni?",
    answer:
      "Igen. A hirdetés feladásánál több poszt is kiválasztható, és ezek a böngészésben is megjelennek.",
  },
  {
    question: "Elfelejtettem a jelszavam, mit tegyek?",
    answer:
      "A bejelentkezési ablakban válaszd az Elfelejtettem a jelszavam lehetőséget, add meg az e-mail címedet, majd kövesd a visszaállító e-mailben kapott lépéseket.",
  },
]

export default function SugoPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Súgó</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Itt találod a legfontosabb tudnivalókat a Matrózkereső használatához.
          </p>

          <section className="mt-8 space-y-3 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">Gyors indulás</h2>
            <ol className="list-decimal space-y-1 pl-6">
              <li>Regisztrálj vagy jelentkezz be.</li>
              <li>Ha kapitány vagy, add fel a hirdetésedet a Kapitányi dashboardon.</li>
              <li>Ha legénységi tag vagy, böngéssz és jelentkezz a megfelelő hirdetésekre.</li>
              <li>Kezeld a jelentkezéseket és státuszokat a saját felületeden.</li>
            </ol>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Gyakori kérdések</h2>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <details key={item.question} className="rounded-xl border border-border bg-background px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">{item.question}</summary>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-xl border border-border/70 bg-secondary/30 p-4 text-sm leading-6">
            <h2 className="text-base font-semibold text-foreground">Kapcsolat</h2>
            <p className="mt-2 text-muted-foreground">
              Ha nem találtad meg a választ, írj nekünk e-mailt:
              <a href="mailto:matrozkereso@gmail.com" className="ml-1 font-medium text-foreground underline-offset-4 hover:underline">
                matrozkereso@gmail.com
              </a>
            </p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
