import { SiteFooter } from "@/components/site-footer"

export const metadata = {
  title: "ÁSZF | Matrózkereső",
  description: "A Matrózkereső platform Általános Szerződési Feltételei.",
}

export default function AszfPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Általános Szerződési Feltételek</h1>
          <p className="mt-2 text-sm text-muted-foreground">Hatályos: 2026.06.19.</p>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">1. Szolgáltató adatai</h2>
            <p>Név: Herko Dániel</p>
            <p>Nyilvántartási szám: 58237485</p>
            <p>Székhely: 1137 Budapest XIII., Angyalföldi út 5.</p>
            <p>Adószám: 43925346-1-41</p>
            <p>E-mail: matrozkereso@gmail.com</p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">2. Az ÁSZF hatálya</h2>
            <p>
              Jelen ÁSZF a Matrózkereső platform (a továbbiakban: Platform) használatára vonatkozik. A Platform
              használatával a felhasználó elfogadja jelen feltételeket.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">3. A szolgáltatás leírása</h2>
            <p>
              A Platform célja kapitányok és legénységi tagok kapcsolatba hozása. A Platform hirdetési, jelentkezési és
              kommunikációs felületet biztosít, de nem fele a felhasználók között létrejövő külön megállapodásoknak.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">4. Regisztráció és fiókhasználat</h2>
            <p>A felhasználó köteles valós adatokat megadni és azokat naprakészen tartani.</p>
            <p>A felhasználó felelős a fiókjához tartozó hozzáférési adatok biztonságáért.</p>
            <p>A Szolgáltató jogosult a szabályszegő fiókok korlátozására vagy törlésére.</p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">5. Hirdetések és jelentkezések szabályai</h2>
            <p>A közzétett hirdetéseknek valós, pontos és jogszerű információkat kell tartalmazniuk.</p>
            <p>Tilos jogsértő, sértő, megtévesztő vagy másokat veszélyeztető tartalmat közzétenni.</p>
            <p>
              A felhasználók egymás felé tett nyilatkozataikért és a közöttük létrejövő együttműködésekért teljes
              felelősséggel tartoznak.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">6. Tiltott magatartások</h2>
            <p>Tilos különösen:</p>
            <ul className="list-disc pl-6">
              <li>hamis személyazonossággal regisztrálni vagy más adatait jogosulatlanul használni,</li>
              <li>a Platform működését akadályozni vagy automatizált visszaélést végezni,</li>
              <li>jogsértő, gyűlöletkeltő, zaklató vagy obszcén tartalmat közzétenni.</li>
            </ul>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">7. Felelősségkorlátozás</h2>
            <p>
              A szolgáltatás "adott állapotban" érhető el. A Szolgáltató nem vállal felelősséget a Platform átmeneti
              kieséséért, a felhasználók által közzétett tartalmakért, valamint a felhasználók közötti vitákért.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">8. Adatkezelés</h2>
            <p>
              A személyes adatok kezelése a külön Adatkezelési Tájékoztató alapján történik. A Platform használatával a
              felhasználó tudomásul veszi az adatkezelési szabályokat.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">9. ÁSZF módosítása</h2>
            <p>
              A Szolgáltató jogosult jelen ÁSZF-et egyoldalúan módosítani. A módosítás a Platformon történő közzététel
              napjától hatályos, kivéve ha a Szolgáltató eltérően rendelkezik.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">10. Irányadó jog, jogvita</h2>
            <p>Jelen ÁSZF-re a magyar jog irányadó.</p>
            <p>
              A felek vitáikat elsődlegesen békés úton rendezik, ennek sikertelensége esetén a hatáskörrel és
              illetékességgel rendelkező magyar bíróság jár el.
            </p>
          </section>

        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
